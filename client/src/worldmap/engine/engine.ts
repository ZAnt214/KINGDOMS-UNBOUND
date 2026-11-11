import { millerProjection, type Projection } from './projection';
import { type Box, type Group, RegionGeometry } from './regions';
import type {
  BuiltinLayer,
  MapEffect,
  MapEvents,
  MapFill,
  MapFlag,
  MapLabel,
  MapMarker,
  MapOptions,
  MapPick,
  MapPlacement,
  MapPoint,
  MapRoute,
  MapStructure,
  MapTerritory,
  RegionInfo,
  RegionTopology,
} from './types';

interface Cam {
  x: number;
  y: number;
  k: number;
}
interface Pad {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
/** Camada estática já desenhada fora da tela, com a câmera em que foi desenhada. */
interface Base {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  k: number;
  /** Tamanho em px CSS. */
  cw: number;
  ch: number;
  dpr: number;
  version: number;
}

type Listener<K extends keyof MapEvents> = (payload: MapEvents[K]) => void;

const OCEAN_TOP = '#0d3a78';
const OCEAN_MID = '#0a2857';
const OCEAN_BOTTOM = '#061634';
const TAU = Math.PI * 2;
/** A camada base cobre 1,8× a tela: arrastar até essa margem não exige redesenhar o mapa. */
const BASE_MARGIN = 1.8;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeBack = (p: number) => 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2;
function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
function mix(hex: string, target: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount) + target * amount);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/**
 * Motor do mapa mundial em Canvas 2D: regiões, territórios, câmera, entrada e seleção.
 *
 * Desempenho: tudo o que não anima (terreno, territórios, fronteiras, rótulos) é desenhado numa
 * camada base fora da tela, maior que a tela. Arrastar e dar zoom só reposicionam ou escalam essa
 * imagem; ela é redesenhada, nítida, quando o gesto termina ou quando os dados mudam. Cada quadro
 * desenha por cima apenas o que se move (ocupações, pontos, bandeiras, construções, efeitos).
 * A geometria tem níveis de detalhe: de longe, as linhas usam poucos vértices.
 *
 * É independente da interface e das regras do jogo: recebe dados e devolve eventos.
 */
export class WorldMapEngine {
  readonly canvas: HTMLCanvasElement;
  readonly projection: Projection;
  private ctx: CanvasRenderingContext2D;
  private probe: CanvasRenderingContext2D;
  private geo: RegionGeometry | null = null;
  // Dados estáticos (mudar = redesenhar a camada base).
  private labels: MapLabel[] = [];
  private territories: { id: string; color: string; own: boolean; group: Group }[] = [];
  private hints: { group: Group; color: string } | null = null;
  private arena: Group | null = null;
  private selectedRegion: string | null = null;
  private version = 0;
  // Dados que animam (desenhados a cada quadro).
  private preview: { group: Group; color: string } | null = null;
  private fills: MapFill[] = [];
  private effects: { fx: MapEffect; start: number }[] = [];
  private points: MapPoint[] = [];
  private pointsLive = false;
  private flags: MapFlag[] = [];
  private structures: MapStructure[] = [];
  private markers: MapMarker[] = [];
  private routes: MapRoute[] = [];
  private placement: MapPlacement | null = null;
  private hoveredRegion: string | null = null;
  private pointer: { x: number; y: number } | null = null;
  private hidden = new Set<BuiltinLayer>();
  private glyphs = new Map<string, Path2D>();
  private textWidth = new Map<string, number>();
  private listeners: { [K in keyof MapEvents]: Set<Listener<K>> } = { select: new Set(), hover: new Set(), view: new Set() };
  private pickables: { x: number; y: number; r: number; pick: MapPick }[] = [];
  // Tela e câmera.
  private w = 1;
  private h = 1;
  private dpr = 1;
  /** Dimensões do alvo sendo desenhado (a tela ou a camada base). */
  private rw = 1;
  private rh = 1;
  private cam: Cam = { x: 0, y: 0, k: 1 };
  private minK = 1;
  private pad: Pad = { top: 0, right: 0, bottom: 0, left: 0 };
  private framed = false;
  private anim: { from: Cam; to: Cam; start: number; ms: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { x: number; y: number; moved: number; at: number; dist: number } | null = null;
  private lastWheel = 0;
  private base: Base | null = null;
  private settle = 0;
  private raf = 0;
  private observer: ResizeObserver;
  private opts: Required<MapOptions>;
  private destroyed = false;
  private vignette: HTMLDivElement;

  constructor(
    private host: HTMLElement,
    options: MapOptions = {},
  ) {
    this.opts = { now: () => Date.now(), neutralFill: '#3a4a6b', maxZoom: 40, reducedMotion: false, ...options };
    this.projection = millerProjection(1000);
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none';
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-label', 'Mapa mundial');
    host.appendChild(this.canvas);
    // Vinheta em CSS: custa zero por quadro.
    this.vignette = document.createElement('div');
    this.vignette.style.cssText =
      'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 50%, rgba(2,8,22,0) 45%, rgba(2,8,22,0.42) 100%)';
    host.appendChild(this.vignette);
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.probe = document.createElement('canvas').getContext('2d')!;
    this.cam.x = this.projection.width / 2;
    this.cam.y = this.projection.height / 2;
    this.bindInput();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  // ---------- dados ----------

  /** Muda algo da camada base: ela será redesenhada no próximo quadro. */
  private dirty() {
    this.version++;
    this.invalidate();
  }

  setTopology(topo: RegionTopology) {
    this.geo = new RegionGeometry(topo, this.projection);
    if (!this.framed) this.home(false);
    this.dirty();
  }
  get hasTopology() {
    return this.geo !== null;
  }
  regionInfo(id: string): RegionInfo | null {
    const r = this.geo?.regions.get(id);
    return r ? { id: r.id, country: r.country, name: r.name, at: r.at } : null;
  }
  setLabels(labels: MapLabel[]) {
    this.labels = [...labels].sort((a, b) => a.rank - b.rank);
    this.dirty();
  }
  /** Territórios das nações: cada um é pintado de uma vez e cercado pela própria fronteira. */
  setTerritories(list: MapTerritory[]) {
    if (!this.geo) return;
    const old = new Map(this.territories.map((t) => [t.id, t]));
    this.territories = list
      .filter((t) => t.regions.length)
      .map((t) => {
        // Reaproveita os caminhos quando o conjunto de regiões não mudou.
        const prev = old.get(t.id);
        const same = prev && prev.group.regions.length === t.regions.length && prev.group.regions.every((r, i) => r === t.regions[i]);
        return { id: t.id, color: t.color, own: !!t.own, group: same ? prev.group : this.geo!.group(t.regions) };
      });
    this.dirty();
  }
  /** Regiões para onde o jogador pode expandir agora (contorno tracejado). */
  setExpansionHints(regionIds: string[], color: string) {
    this.hints = this.geo && regionIds.length ? { group: this.geo.group(regionIds), color } : null;
    this.dirty();
  }
  /** Área jogável (partida rápida): o resto do mundo escurece. null = mundo inteiro. */
  setArena(regionIds: string[] | null) {
    this.arena = this.geo && regionIds?.length ? this.geo.group(regionIds) : null;
    this.dirty();
  }
  setSelectedRegion(id: string | null) {
    if (this.selectedRegion === id) return;
    this.selectedRegion = id;
    this.dirty();
  }
  setLayerVisible(layer: BuiltinLayer, visible: boolean) {
    if (visible === !this.hidden.has(layer)) return;
    if (visible) this.hidden.delete(layer);
    else this.hidden.add(layer);
    this.dirty();
  }

  /** Prévia pulsante da área inicial de um ponto de partida. */
  setPreview(regionIds: string[] | null, color = '#ffffff') {
    this.preview = this.geo && regionIds?.length ? { group: this.geo.group(regionIds), color } : null;
    this.invalidate();
  }
  /** Preenchimentos progressivos em andamento (ocupações). O progresso segue `options.now`. */
  setFills(fills: MapFill[]) {
    this.fills = fills;
    this.invalidate();
  }
  setPoints(points: MapPoint[], live = false) {
    this.points = points;
    this.pointsLive = live;
    this.invalidate();
  }
  setFlags(flags: MapFlag[]) {
    this.flags = flags;
    this.invalidate();
  }
  structureList(): readonly MapStructure[] {
    return this.structures;
  }

  setStructures(list: MapStructure[]) {
    this.structures = list;
    this.invalidate();
  }
  setMarkers(markers: MapMarker[]) {
    this.markers = markers;
    this.invalidate();
  }
  setRoutes(routes: MapRoute[]) {
    this.routes = routes;
    this.invalidate();
  }
  /** Liga/desliga o modo de posicionamento: o próximo toque devolve o ponto do mapa. */
  setPlacement(p: MapPlacement | null) {
    this.placement = p;
    this.canvas.style.cursor = p ? 'crosshair' : 'grab';
    this.invalidate();
  }
  playEffect(fx: MapEffect) {
    if (this.opts.reducedMotion && fx.kind !== 'conquest') return;
    this.effects.push({ fx, start: performance.now() });
    this.invalidate();
  }
  setReducedMotion(on: boolean) {
    this.opts.reducedMotion = on;
  }
  /** Área coberta pelo HUD; o enquadramento automático centraliza no espaço livre. */
  setPadding(pad: Partial<Pad>) {
    this.pad = { ...this.pad, ...pad };
    if (!this.framed) this.home(false);
  }
  on<K extends keyof MapEvents>(event: K, fn: Listener<K>): () => void {
    this.listeners[event].add(fn);
    return () => this.listeners[event].delete(fn);
  }
  private emit<K extends keyof MapEvents>(event: K, payload: MapEvents[K]) {
    for (const fn of this.listeners[event]) fn(payload);
  }

  // ---------- câmera ----------

  get zoom() {
    return this.cam.k / this.minK;
  }
  private get maxK() {
    return this.minK * this.opts.maxZoom;
  }

  private clamp(c: Cam) {
    c.k = Math.max(this.minK, Math.min(this.maxK, c.k));
    const halfW = this.w / 2 / c.k;
    const halfH = this.h / 2 / c.k;
    const { width } = this.projection;
    c.x = halfW * 2 >= width ? width / 2 : Math.max(halfW, Math.min(width - halfW, c.x));
    // Entre 84°N e 60°S: a Antártida não é jogável.
    const top = this.projection.project(0, 84)[1];
    const bottom = this.projection.project(0, -60)[1];
    c.y = halfH * 2 >= bottom - top ? (top + bottom) / 2 : Math.max(top + halfH, Math.min(bottom - halfH, c.y));
    return c;
  }

  private moveTo(target: Cam, animate: boolean) {
    this.framed = true;
    const to = this.clamp({ ...target });
    if (!animate || this.opts.reducedMotion) {
      this.anim = null;
      this.cam = to;
      this.viewChanged();
      return;
    }
    // Voos longos demoram um pouco mais para o olho acompanhar.
    const travel = Math.hypot(to.x - this.cam.x, to.y - this.cam.y) * this.cam.k + Math.abs(Math.log(to.k / this.cam.k)) * 300;
    this.anim = { from: { ...this.cam }, to, start: performance.now(), ms: Math.max(380, Math.min(950, 300 + travel * 0.45)) };
    this.invalidate();
  }

  /** Visão inicial: mundo habitado enquadrado na área livre do HUD. */
  home(animate = true) {
    const freeW = Math.max(120, this.w - this.pad.left - this.pad.right);
    const freeH = Math.max(120, this.h - this.pad.top - this.pad.bottom);
    const [, top] = this.projection.project(0, 80);
    const [, bottom] = this.projection.project(0, -58);
    const k = Math.max(this.minK, Math.min(freeH / (bottom - top), (freeW / this.projection.width) * 2.9));
    // Em pé, abre sobre o Atlântico (Américas, Europa e África à vista).
    const narrow = freeW / k < this.projection.width * 0.6;
    const cx = (narrow ? this.projection.project(-8, 0)[0] : this.projection.width / 2) + (this.pad.right - this.pad.left) / 2 / k;
    const cy = (top + bottom) / 2 + (this.pad.bottom - this.pad.top) / 2 / k;
    this.moveTo({ x: cx, y: cy, k }, animate);
    this.framed = false;
  }

  zoomBy(factor: number, sx = this.w / 2, sy = this.h / 2, animate = true) {
    const base = this.anim?.to ?? this.cam;
    const k = Math.max(this.minK, Math.min(this.maxK, base.k * factor));
    const wx = base.x + (sx - this.w / 2) / base.k;
    const wy = base.y + (sy - this.h / 2) / base.k;
    this.moveTo({ x: wx - (sx - this.w / 2) / k, y: wy - (sy - this.h / 2) / k, k }, animate);
  }

  flyTo(lon: number, lat: number, zoom = this.zoom) {
    const [x, y] = this.projection.project(lon, lat);
    this.moveTo({ x, y, k: this.minK * zoom }, true);
  }

  /** Enquadra um conjunto de regiões na área livre do HUD. `fill` = fração da área livre ocupada. */
  flyToRegions(regionIds: string[], fill = 0.5, maxZoom = 14) {
    if (!this.geo) return;
    const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const id of regionIds) {
      const r = this.geo.regions.get(id);
      if (!r) continue;
      box[0] = Math.min(box[0], r.box[0]);
      box[1] = Math.min(box[1], r.box[1]);
      box[2] = Math.max(box[2], r.box[2]);
      box[3] = Math.max(box[3], r.box[3]);
    }
    if (!Number.isFinite(box[0])) return;
    const freeW = Math.max(120, this.w - this.pad.left - this.pad.right);
    const freeH = Math.max(120, this.h - this.pad.top - this.pad.bottom);
    const bw = Math.max(2, box[2] - box[0]);
    const bh = Math.max(2, box[3] - box[1]);
    const k = Math.max(this.minK * 1.4, Math.min(this.minK * maxZoom, Math.min(freeW / bw, freeH / bh) * fill));
    this.moveTo({ x: (box[0] + box[2]) / 2 + (this.pad.right - this.pad.left) / 2 / k, y: (box[1] + box[3]) / 2 + (this.pad.bottom - this.pad.top) / 2 / k, k }, true);
  }

  /** Câmera atual em unidades de mundo (centro) e px por unidade. */
  viewState(): Readonly<Cam> {
    return { ...this.cam };
  }

  private toWorld(sx: number, sy: number): [number, number] {
    return [this.cam.x + (sx - this.w / 2) / this.cam.k, this.cam.y + (sy - this.h / 2) / this.cam.k];
  }
  /** Longitude/latitude → pixels do alvo atual (tela ou camada base). */
  private toScreen = (lon: number, lat: number): [number, number] => {
    const [x, y] = this.projection.project(lon, lat);
    return [(x - this.cam.x) * this.cam.k + this.rw / 2, (y - this.cam.y) * this.cam.k + this.rh / 2];
  };

  private viewChanged() {
    const [lon, lat] = this.projection.unproject(this.cam.x, this.cam.y);
    this.emit('view', { zoom: this.zoom, lon, lat });
    this.invalidate();
  }

  resize() {
    if (this.destroyed) return;
    const rect = this.host.getBoundingClientRect();
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.rw = this.w;
    this.rh = this.h;
    // Acima de 2× o custo cresce muito e a diferença no mapa quase não aparece.
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    const ratio = this.cam.k / this.minK;
    this.minK = Math.min(this.w / this.projection.width, this.h / this.projection.height);
    this.base = null;
    if (this.framed) {
      this.cam.k = this.minK * ratio;
      this.clamp(this.cam);
      this.viewChanged();
    } else this.home(false);
  }

  // ---------- seleção ----------

  private regionAt(wx: number, wy: number): string | null {
    const geo = this.geo;
    if (!geo) return null;
    const full = geo.maxLevel;
    for (const r of geo.regionList) {
      if (wx < r.box[0] || wx > r.box[2] || wy < r.box[1] || wy > r.box[3]) continue;
      if (this.probe.isPointInPath(geo.regionPath(r.id, full)!, wx, wy, 'evenodd')) return r.id;
    }
    // Ilhas minúsculas: a região mais próxima dentro de 12 px.
    const reach = 12 / this.cam.k;
    let best: string | null = null;
    let bestD = reach;
    for (const r of geo.regionList) {
      if (r.box[2] - r.box[0] > reach * 3 || r.box[3] - r.box[1] > reach * 3) continue;
      const d = Math.hypot((r.box[0] + r.box[2]) / 2 - wx, (r.box[1] + r.box[3]) / 2 - wy);
      if (d < bestD) [best, bestD] = [r.id, d];
    }
    return best;
  }

  /** O que está sob um ponto da tela: marcador, ponto, bandeira, construção ou região. */
  pick(sx: number, sy: number): MapPick | null {
    if (!this.placement) {
      let near: MapPick | null = null;
      let nearD = Infinity;
      for (const p of this.pickables) {
        const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
        if (d <= p.r * p.r && d < nearD) [near, nearD] = [p.pick, d];
      }
      if (near) return near;
    }
    const [wx, wy] = this.toWorld(sx, sy);
    const id = this.regionAt(wx, wy);
    if (!id) return null;
    const [lon, lat] = this.projection.unproject(wx, wy);
    return { kind: 'region', id, code: this.geo!.regions.get(id)!.country, at: [lon, lat] };
  }

  private bindInput() {
    const c = this.canvas;
    const local = (e: PointerEvent | WheelEvent | MouseEvent): [number, number] => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const [x, y] = local(e);
      this.pointers.set(e.pointerId, { x, y });
      this.anim = null;
      if (this.pointers.size === 1) this.gesture = { x, y, moved: 0, at: performance.now(), dist: 0 };
      else if (this.gesture) this.gesture.dist = this.spread();
    });
    c.addEventListener('pointermove', (e) => {
      const [x, y] = local(e);
      const prev = this.pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') this.hover(x, y);
        return;
      }
      if (!this.gesture) return;
      if (this.pointers.size === 1) {
        this.gesture.moved += Math.abs(x - prev.x) + Math.abs(y - prev.y);
        if (this.gesture.moved > 6) {
          this.framed = true;
          this.cam.x -= (x - prev.x) / this.cam.k;
          this.cam.y -= (y - prev.y) / this.cam.k;
          this.clamp(this.cam);
          this.viewChanged();
        }
        prev.x = x;
        prev.y = y;
      } else {
        prev.x = x;
        prev.y = y;
        const dist = this.spread();
        const [mx, my] = this.middle();
        if (this.gesture.dist > 0 && dist > 0) this.zoomBy(dist / this.gesture.dist, mx, my, false);
        this.gesture.dist = dist;
        this.gesture.moved = 99;
      }
    });
    const end = (e: PointerEvent) => {
      const had = this.pointers.delete(e.pointerId);
      if (!had || !this.gesture) return;
      if (this.pointers.size === 0) {
        const tap = this.gesture.moved <= 6 && performance.now() - this.gesture.at < 600 && e.type === 'pointerup';
        const [x, y] = local(e);
        this.gesture = null;
        if (tap) this.emit('select', this.pick(x, y));
        // Fim do gesto: a camada base é redesenhada nítida.
        this.invalidate();
      } else this.gesture.dist = 0;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      this.pointer = null;
      this.setHover(null, 0, 0);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.lastWheel = performance.now();
        const [x, y] = local(e);
        this.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), x, y, false);
      },
      { passive: false },
    );
    c.addEventListener('dblclick', (e) => {
      if (this.placement) return;
      const [x, y] = local(e);
      this.zoomBy(2, x, y);
    });
  }

  private spread() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
  private middle(): [number, number] {
    const [a, b] = [...this.pointers.values()];
    return [(a.x + b.x) / 2, (a.y + b.y) / 2];
  }

  private hover(x: number, y: number) {
    this.pointer = { x, y };
    this.setHover(this.pick(x, y), x, y);
    if (this.placement) this.invalidate();
  }
  private setHover(pick: MapPick | null, x: number, y: number) {
    const region = pick?.kind === 'region' ? pick.id : null;
    if (region !== this.hoveredRegion) {
      this.hoveredRegion = region;
      this.invalidate();
    }
    if (!this.placement) this.canvas.style.cursor = pick && pick.kind !== 'region' ? 'pointer' : pick ? 'pointer' : 'grab';
    this.emit('hover', pick ? { pick, x, y } : null);
  }

  // ---------- desenho ----------

  invalidate() {
    if (this.raf || this.destroyed) return;
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0;
      this.frame(t);
    });
  }

  private interacting(t: number) {
    return this.pointers.size > 0 || this.anim !== null || t - this.lastWheel < 180;
  }

  private frame(t: number) {
    if (this.anim) {
      const p = Math.min(1, (t - this.anim.start) / this.anim.ms);
      const e = 1 - (1 - p) ** 3;
      const { from, to } = this.anim;
      this.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k * (to.k / from.k) ** e };
      if (p >= 1) this.anim = null;
      const [lon, lat] = this.projection.unproject(this.cam.x, this.cam.y);
      this.emit('view', { zoom: this.zoom, lon, lat });
    }
    const sharp = this.ensureBase(t);
    this.draw(t);
    this.effects = this.effects.filter((e) => t - e.start < (e.fx.ms ?? 1400));
    const now = this.opts.now();
    const moving =
      this.flags.some((f) => f.plantedAt !== undefined && t - f.plantedAt < 700 && t - f.plantedAt > -3000) ||
      this.structures.some((x) => (x.completedAt !== undefined && t - x.completedAt < 900) || (x.building && now < x.building.endAt + 300));
    const filling = this.fills.some((f) => now < f.endAt + 400);
    const live = this.routes.length > 0 || this.pointsLive || this.preview !== null || filling || moving;
    if (this.anim || this.effects.length || (live && !this.opts.reducedMotion)) this.invalidate();
    else if (live) {
      // Movimento reduzido: atualiza o progresso devagar, sem animação contínua.
      window.setTimeout(() => this.invalidate(), 400);
    }
    // Camada base escalada durante o gesto: redesenha nítida quando o gesto parar.
    if (!sharp) {
      window.clearTimeout(this.settle);
      this.settle = window.setTimeout(() => this.invalidate(), 200);
    }
  }

  /** Garante a camada base. Devolve false se ela está sendo usada escalada (redesenhar depois). */
  private ensureBase(t: number): boolean {
    const b = this.base;
    let need = !b || b.version !== this.version || b.dpr !== this.dpr;
    let sharp = true;
    if (b && !need) {
      const ratio = this.cam.k / b.k;
      // Retângulo visível, em unidades do mundo, precisa caber no que a base cobre.
      const halfW = this.w / 2 / this.cam.k;
      const halfH = this.h / 2 / this.cam.k;
      const bHalfW = b.cw / 2 / b.k;
      const bHalfH = b.ch / 2 / b.k;
      const covers =
        this.cam.x - halfW >= b.x - bHalfW && this.cam.x + halfW <= b.x + bHalfW && this.cam.y - halfH >= b.y - bHalfH && this.cam.y + halfH <= b.y + bHalfH;
      if (!covers) need = true;
      else if (Math.abs(ratio - 1) > 1e-4) {
        if (this.interacting(t) && ratio > 0.55 && ratio < 1.8) sharp = false;
        else need = true;
      }
    }
    if (need) this.renderBase();
    return sharp;
  }

  private visibleIn(box: Box, x0: number, y0: number, x1: number, y1: number) {
    return box[2] >= x0 && box[0] <= x1 && box[3] >= y0 && box[1] <= y1;
  }

  /** Desenha o que não anima numa tela fora da tela, maior que a visível, centrada na câmera. */
  private renderBase() {
    const cw = Math.ceil(this.w * BASE_MARGIN);
    const ch = Math.ceil(this.h * BASE_MARGIN);
    let b = this.base;
    if (!b || b.cw !== cw || b.ch !== ch || b.dpr !== this.dpr) {
      const canvas = b?.canvas ?? document.createElement('canvas');
      canvas.width = Math.round(cw * this.dpr);
      canvas.height = Math.round(ch * this.dpr);
      b = { canvas, ctx: canvas.getContext('2d', { alpha: false })!, x: 0, y: 0, k: 1, cw, ch, dpr: this.dpr, version: -1 };
    }
    const ctx = b.ctx;
    const { cam } = this;
    this.rw = cw;
    this.rh = ch;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const ocean = ctx.createLinearGradient(0, 0, 0, ch);
    ocean.addColorStop(0, OCEAN_TOP);
    ocean.addColorStop(0.55, OCEAN_MID);
    ocean.addColorStop(1, OCEAN_BOTTOM);
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, cw, ch);
    const sheen = ctx.createRadialGradient(cw * 0.3, ch * 0.15, 0, cw * 0.3, ch * 0.15, Math.max(cw, ch) * 0.75);
    sheen.addColorStop(0, 'rgba(70, 150, 255, 0.2)');
    sheen.addColorStop(1, 'rgba(70, 150, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, cw, ch);

    if (!this.hidden.has('graticule')) {
      ctx.strokeStyle = 'rgba(126, 168, 222, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let lon = -180; lon <= 180; lon += 30) {
        const [x] = this.toScreen(lon, 0);
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, ch);
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const [, y] = this.toScreen(0, lat);
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(cw, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }

    const geo = this.geo;
    if (geo) {
      const level = geo.levelFor(cam.k);
      const px = 1 / cam.k;
      const x0 = cam.x - cw / 2 / cam.k;
      const x1 = cam.x + cw / 2 / cam.k;
      const y0 = cam.y - ch / 2 / cam.k;
      const y1 = cam.y + ch / 2 / cam.k;
      const countries = geo.countryList.filter((c) => this.visibleIn(c.box, x0, y0, x1, y1));
      const zoom = this.zoom;
      const land = geo.land(level);
      const coast = geo.coast(level);

      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.scale(cam.k, cam.k);
      ctx.translate(-cam.x, -cam.y);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Halo costeiro e sombra: separam os continentes do oceano.
      ctx.strokeStyle = 'rgba(96, 170, 255, 0.18)';
      ctx.lineWidth = 9 * px;
      ctx.stroke(coast);
      ctx.save();
      ctx.translate(0, 3 * px);
      ctx.fillStyle = 'rgba(0, 6, 20, 0.5)';
      ctx.fill(land, 'evenodd');
      ctx.restore();

      ctx.fillStyle = this.opts.neutralFill;
      ctx.fill(land, 'evenodd');
      if (this.arena) {
        // Fora da arena o mundo apaga: só a área da partida fica com a cor do terreno.
        ctx.fillStyle = '#1f2a44';
        ctx.fill(land, 'evenodd');
        ctx.fillStyle = this.opts.neutralFill;
        ctx.fill(this.arena.fill(level), 'evenodd');
      }

      const territories = this.territories.filter((x) => this.visibleIn(x.group.box, x0, y0, x1, y1));
      for (const terr of territories) {
        ctx.fillStyle = terr.color;
        ctx.fill(terr.group.fill(level), 'evenodd');
      }

      // Luz de cima para baixo: dá volume ao terreno e aos territórios.
      ctx.save();
      ctx.clip(land, 'evenodd');
      const light = ctx.createLinearGradient(0, 0, 0, this.projection.height);
      light.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      light.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
      light.addColorStop(1, 'rgba(0, 10, 30, 0.2)');
      ctx.fillStyle = light;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.restore();

      // Brilho interno junto à fronteira de cada território.
      for (const terr of territories) {
        ctx.save();
        ctx.clip(terr.group.fill(level), 'evenodd');
        ctx.strokeStyle = mix(terr.color, 255, 0.55);
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = Math.min(9, 4 + zoom) * px;
        ctx.stroke(terr.group.frontier(level));
        ctx.restore();
      }

      if (this.hints) {
        ctx.fillStyle = rgba(this.hints.color, 0.13);
        ctx.fill(this.hints.group.fill(level), 'evenodd');
      }

      // Linhas: divisas internas (só de perto), divisas entre países e costa.
      if (zoom >= 1.7) {
        ctx.strokeStyle = `rgba(8, 16, 34, ${Math.min(0.42, 0.14 + zoom * 0.035)})`;
        ctx.lineWidth = 0.7 * px;
        for (const c of countries) ctx.stroke(geo.countryLines(c.id, level).internal);
      }
      ctx.strokeStyle = 'rgba(6, 12, 28, 0.78)';
      ctx.lineWidth = Math.min(1.5, 0.75 + zoom * 0.1) * px;
      for (const c of countries) ctx.stroke(geo.countryLines(c.id, level).national);
      ctx.strokeStyle = 'rgba(150, 196, 255, 0.5)';
      ctx.lineWidth = 0.8 * px;
      ctx.stroke(coast);

      // Fronteira de cada território: contorno escuro por fora, linha viva por dentro.
      for (const terr of territories) {
        const f = terr.group.frontier(level);
        ctx.strokeStyle = 'rgba(4, 10, 24, 0.85)';
        ctx.lineWidth = (terr.own ? 3.6 : 3) * px;
        ctx.stroke(f);
        ctx.strokeStyle = mix(terr.color, 255, terr.own ? 0.5 : 0.25);
        ctx.lineWidth = (terr.own ? 1.7 : 1.2) * px;
        ctx.stroke(f);
      }

      if (this.arena) {
        const f = this.arena.frontier(level);
        ctx.strokeStyle = 'rgba(255, 214, 102, 0.22)';
        ctx.lineWidth = 7 * px;
        ctx.stroke(f);
        ctx.strokeStyle = 'rgba(255, 214, 102, 0.9)';
        ctx.lineWidth = 2 * px;
        ctx.setLineDash([9 * px, 5 * px]);
        ctx.stroke(f);
        ctx.setLineDash([]);
      }

      if (this.hints) {
        ctx.setLineDash([5 * px, 4 * px]);
        ctx.strokeStyle = mix(this.hints.color, 255, 0.55);
        ctx.lineWidth = 1.4 * px;
        ctx.stroke(this.hints.group.frontier(level));
        ctx.setLineDash([]);
      }

      const sel = this.selectedRegion && geo.regionPath(this.selectedRegion, level);
      if (sel) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.fill(sel, 'evenodd');
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 7 * px;
        ctx.stroke(sel);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * px;
        ctx.stroke(sel);
      }
      ctx.restore();

      if (!this.hidden.has('labels')) this.drawLabels(ctx);
    }

    b.x = cam.x;
    b.y = cam.y;
    b.k = cam.k;
    b.version = this.version;
    this.base = b;
    this.rw = this.w;
    this.rh = this.h;
  }

  private draw(t: number) {
    const { ctx, w, h, cam } = this;
    const b = this.base!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = OCEAN_MID;
    ctx.fillRect(0, 0, w, h);
    const s = cam.k / b.k;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(b.canvas, (b.x - cam.x) * cam.k + w / 2 - (b.cw / 2) * s, (b.y - cam.y) * cam.k + h / 2 - (b.ch / 2) * s, b.cw * s, b.ch * s);

    if (this.geo) this.drawDynamicWorld(t);

    this.pickables = [];
    if (!this.hidden.has('routes')) this.drawRoutes(t);
    if (!this.hidden.has('markers')) this.drawMarkers();
    if (this.geo) {
      this.drawEffects(t);
      if (!this.hidden.has('points')) this.drawPoints(t);
      if (!this.hidden.has('structures')) this.drawStructures(t);
      if (!this.hidden.has('flags')) this.drawFlags(t);
      if (this.placement) this.drawPlacement();
    }
  }

  /** Por cima da base, em coordenadas do mundo: o que muda a cada quadro. */
  private drawDynamicWorld(t: number) {
    const { ctx, w, h, cam } = this;
    const geo = this.geo!;
    const level = geo.levelFor(cam.k);
    const px = 1 / cam.k;
    const [x0, y0] = this.toWorld(0, 0);
    const [x1, y1] = this.toWorld(w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.k, cam.k);
    ctx.translate(-cam.x, -cam.y);
    ctx.lineJoin = 'round';

    if (this.hoveredRegion && this.hoveredRegion !== this.selectedRegion) {
      const p = geo.regionPath(this.hoveredRegion, level);
      if (p) {
        ctx.fillStyle = this.placement ? (this.placementOk() ? 'rgba(120, 255, 180, 0.16)' : 'rgba(255, 90, 90, 0.16)') : 'rgba(255, 255, 255, 0.1)';
        ctx.fill(p, 'evenodd');
      }
    }

    // Ocupações em andamento: a cor avança da origem para fora, presa ao contorno da região.
    const now = this.opts.now();
    for (const f of this.fills) {
      const r = geo.regions.get(f.region);
      const path = r && geo.regionPath(f.region, level);
      if (!r || !path || !this.visibleIn(r.box, x0, y0, x1, y1)) continue;
      let o: [number, number] | null = f.origin ? this.projection.project(f.origin[0], f.origin[1]) : null;
      if (!o && f.fromRegion) o = geo.borderPoint(f.fromRegion, f.region);
      if (!o) o = this.projection.project(r.at[0], r.at[1]);
      const p = clamp01((now - f.startAt) / Math.max(1, f.endAt - f.startAt));
      const reach = Math.max(
        Math.hypot(r.box[0] - o[0], r.box[1] - o[1]),
        Math.hypot(r.box[2] - o[0], r.box[1] - o[1]),
        Math.hypot(r.box[0] - o[0], r.box[3] - o[1]),
        Math.hypot(r.box[2] - o[0], r.box[3] - o[1]),
      );
      ctx.save();
      ctx.clip(path, 'evenodd');
      ctx.fillStyle = rgba(f.color, 0.2);
      ctx.fill(path, 'evenodd');
      if (p >= 1) {
        ctx.fillStyle = f.color;
        ctx.fill(path, 'evenodd');
      } else if (p > 0) {
        const radius = reach * p;
        ctx.beginPath();
        ctx.arc(o[0], o[1], radius, 0, TAU);
        ctx.fillStyle = f.color;
        ctx.fill();
        // Frente de avanço: faixa larga translúcida e linha clara (sem desfoque, que é caro).
        const wave = this.opts.reducedMotion ? 0 : Math.sin(t / 260) * 0.5 + 0.5;
        ctx.lineWidth = (7 + wave * 3) * px;
        ctx.strokeStyle = rgba(f.color, 0.35);
        ctx.stroke();
        ctx.lineWidth = 2 * px;
        ctx.strokeStyle = mix(f.color, 255, 0.7);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(6, 12, 28, 0.6)';
      ctx.lineWidth = 0.8 * px;
      ctx.stroke(path);
    }

    if (this.preview) {
      const pulse = this.opts.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t / 420);
      ctx.fillStyle = rgba(this.preview.color, 0.34 + 0.16 * pulse);
      ctx.fill(this.preview.group.fill(level), 'evenodd');
      ctx.setLineDash([6 * px, 5 * px]);
      ctx.lineDashOffset = this.opts.reducedMotion ? 0 : (-t / 40) * px;
      ctx.strokeStyle = mix(this.preview.color, 255, 0.6);
      ctx.lineWidth = 2 * px;
      ctx.stroke(this.preview.group.frontier(level));
      ctx.setLineDash([]);
    }

    // Conquista: clarão sobre a região recém-ocupada.
    for (const e of this.effects) {
      if (e.fx.kind !== 'conquest') continue;
      const path = geo.regionPath(e.fx.region, level);
      if (!path) continue;
      const p = clamp01((t - e.start) / (e.fx.ms ?? 1400));
      ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * (1 - p) ** 2})`;
      ctx.fill(path, 'evenodd');
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * (1 - p)})`;
      ctx.lineWidth = (1.5 + 3 * (1 - p)) * px;
      ctx.stroke(path);
    }
    ctx.restore();
  }

  private measure(font: string, text: string) {
    const key = `${font}|${text}`;
    let v = this.textWidth.get(key);
    if (v === undefined) {
      this.ctx.font = font;
      v = this.ctx.measureText(text).width;
      this.textWidth.set(key, v);
    }
    return v;
  }

  private free(placed: Box[], box: Box) {
    for (const p of placed) if (box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1]) return false;
    placed.push(box);
    return true;
  }

  /** Nomes dos países, desenhados na camada base (alvo de tamanho rw × rh). */
  private drawLabels(ctx: CanvasRenderingContext2D) {
    const geo = this.geo!;
    const placed: Box[] = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const l of this.labels) {
      const c = geo.countries.get(l.code);
      if (!c) continue;
      const bw = (c.box[2] - c.box[0]) * this.cam.k;
      const bh = (c.box[3] - c.box[1]) * this.cam.k;
      const size = Math.max(10, Math.min(16, Math.sqrt(bw * bh) / 9));
      const font = `600 ${size}px "Barlow Condensed", "Roboto Condensed", "Arial Narrow", ${FONT}`;
      const text = l.text.toUpperCase();
      const tw = this.measure(font, text) + size * 0.08 * text.length;
      if (tw > bw * 0.92 || size + 4 > bh) continue;
      const [x, y] = this.toScreen(l.at[0], l.at[1]);
      if (x < -tw || x > this.rw + tw || y < -20 || y > this.rh + 20) continue;
      if (!this.free(placed, [x - tw / 2 - 3, y - size / 2 - 2, x + tw / 2 + 3, y + size / 2 + 2])) continue;
      ctx.font = font;
      if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${size * 0.08}px`;
      ctx.strokeStyle = 'rgba(5, 12, 28, 0.45)';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(226, 238, 255, 0.62)';
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  }

  private drawEffects(t: number) {
    const { ctx } = this;
    for (const e of this.effects) {
      const ms = e.fx.ms ?? 1400;
      const p = clamp01((t - e.start) / ms);
      if (e.fx.kind === 'conquest') {
        const r = this.geo!.regions.get(e.fx.region);
        if (!r) continue;
        const [x, y] = this.toScreen(r.at[0], r.at[1]);
        // Fagulhas: poucas, curtas e na cor da nação.
        const out = easeOut(p);
        ctx.globalAlpha = 1 - p;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + i * 1.7;
          const d = (18 + (i % 4) * 9) * out;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d - 10 * out, 2.2 * (1 - p), 0, TAU);
          ctx.fillStyle = i % 3 ? mix(e.fx.color, 255, 0.5) : '#ffffff';
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        continue;
      }
      const [x, y] = this.toScreen(e.fx.at[0], e.fx.at[1]);
      const rings = e.fx.kind === 'beacon' ? 3 : 1;
      for (let i = 0; i < rings; i++) {
        const q = clamp01(p * (1 + i * 0.25) - i * 0.18);
        if (q <= 0) continue;
        ctx.beginPath();
        ctx.arc(x, y, 6 + easeOut(q) * (e.fx.kind === 'beacon' ? 70 : 38), 0, TAU);
        ctx.strokeStyle = rgba(e.fx.color, 0.9 * (1 - q));
        ctx.lineWidth = 2.5 * (1 - q) + 0.5;
        ctx.stroke();
      }
      if (e.fx.kind === 'beacon') {
        // Coluna de luz sobre o ponto escolhido.
        const height = 120 * easeOut(Math.min(1, p * 2.2));
        const fade = 1 - clamp01((p - 0.45) / 0.55);
        const beam = ctx.createLinearGradient(x, y, x, y - height);
        beam.addColorStop(0, rgba(e.fx.color, 0.85 * fade));
        beam.addColorStop(1, rgba(e.fx.color, 0));
        ctx.fillStyle = beam;
        ctx.fillRect(x - 2.5, y - height, 5, height);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * fade})`;
        ctx.fillRect(x - 0.75, y - height * 0.8, 1.5, height * 0.8);
      }
    }
  }

  /** Pontos de partida: discretos de longe, com pulso suave; ganham nome quando há espaço. */
  private drawPoints(t: number) {
    const { ctx } = this;
    const z = this.zoom;
    const base = Math.max(1.9, Math.min(4.2, 1.5 + z * 0.55));
    const placed: Box[] = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let n = 0;
    for (const p of this.points) {
      n++;
      if (p.state === 'taken') continue;
      const [x, y] = this.toScreen(p.lon, p.lat);
      if (x < -20 || x > this.w + 20 || y < -20 || y > this.h + 20) continue;
      const selected = p.state === 'selected';
      const r = (p.kind === 'capital' ? base : base * 0.78) * (selected ? 1.5 : 1);
      if (this.pointsLive || selected) {
        const phase = this.opts.reducedMotion ? 0.4 : (t / 2600 + n * 0.137) % 1;
        ctx.beginPath();
        ctx.arc(x, y, r + (selected ? 14 : 3 + base * 2.4) * phase, 0, TAU);
        ctx.strokeStyle = `rgba(190, 228, 255, ${(selected ? 0.9 : 0.55) * (1 - phase)})`;
        ctx.lineWidth = selected ? 2 : 1;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, r + 2.2, 0, TAU);
      ctx.fillStyle = 'rgba(120, 190, 255, 0.28)';
      ctx.fill();
      ctx.beginPath();
      if (p.kind === 'capital') ctx.arc(x, y, r, 0, TAU);
      else {
        ctx.moveTo(x, y - r * 1.25);
        ctx.lineTo(x + r * 1.25, y);
        ctx.lineTo(x, y + r * 1.25);
        ctx.lineTo(x - r * 1.25, y);
        ctx.closePath();
      }
      ctx.fillStyle = selected ? '#ffffff' : '#e6f4ff';
      ctx.strokeStyle = 'rgba(4, 12, 30, 0.9)';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
      this.pickables.push({ x, y, r: Math.max(16, r * 3), pick: { kind: 'point', id: p.id } });
      if (!p.label || (!selected && z < 3.4)) continue;
      const font = `${selected ? 700 : 600} ${selected ? 13 : 11}px ${FONT}`;
      const tw = this.measure(font, p.label);
      const box: Box = [x - tw / 2 - 3, y + r + 4, x + tw / 2 + 3, y + r + 19];
      if (!selected && !this.free(placed, box)) continue;
      ctx.font = font;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(4, 12, 30, 0.8)';
      ctx.fillStyle = selected ? '#ffffff' : 'rgba(226, 240, 255, 0.92)';
      ctx.strokeText(p.label, x, y + r + 5);
      ctx.fillText(p.label, x, y + r + 5);
    }
  }

  private glyph(d: string): Path2D {
    let p = this.glyphs.get(d);
    if (!p) {
      p = new Path2D(d);
      this.glyphs.set(d, p);
    }
    return p;
  }

  /** Selo de construção: círculo escuro, borda na cor da nação e ícone em traço claro. */
  private badge(x: number, y: number, r: number, color: string, glyph: string, own: boolean, alpha = 1) {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y + 1.5, r + 1, 0, TAU);
    ctx.fillStyle = 'rgba(0, 6, 20, 0.45)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = '#12244a';
    ctx.fill();
    ctx.lineWidth = own ? 2.2 : 1.6;
    ctx.strokeStyle = color;
    ctx.stroke();
    const k = (r * 1.25) / 24;
    ctx.save();
    ctx.translate(x - 12 * k, y - 12 * k);
    ctx.scale(k, k);
    ctx.lineWidth = 2 / Math.max(0.4, k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#f2f7ff';
    ctx.stroke(this.glyph(glyph));
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private structureRadius() {
    return Math.max(8, Math.min(13, 6 + this.zoom * 0.9));
  }

  /** Construções no ponto exato onde foram erguidas; obra mostra progresso, conclusão dá um salto. */
  private drawStructures(t: number) {
    const { ctx } = this;
    const z = this.zoom;
    const now = this.opts.now();
    const R = this.structureRadius();
    for (const s of this.structures) {
      const recent = s.completedAt !== undefined && t - s.completedAt < 3000;
      if (s.minZoom !== undefined && z < s.minZoom && !s.building && !recent) continue;
      const [x, y] = this.toScreen(s.lon, s.lat);
      if (x < -30 || x > this.w + 30 || y < -30 || y > this.h + 30) continue;
      const popping = s.completedAt !== undefined && t - s.completedAt < 520 && !this.opts.reducedMotion;
      const r = popping ? R * (0.4 + 0.6 * easeBack(clamp01((t - s.completedAt!) / 520))) : R;
      const building = s.building && now < s.building.endAt ? s.building : null;
      this.badge(x, y, r, s.color, s.glyph, !!s.own, building && s.level === 0 ? 0.82 : 1);
      if (building) {
        const p = clamp01((now - building.startAt) / Math.max(1, building.endAt - building.startAt));
        ctx.beginPath();
        ctx.arc(x, y, r + 3.5, 0, TAU);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r + 3.5, -Math.PI / 2, -Math.PI / 2 + TAU * p);
        ctx.strokeStyle = '#ffd666';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      if (s.level >= 2) {
        const bx = x + r * 0.72;
        const by = y + r * 0.72;
        ctx.beginPath();
        ctx.arc(bx, by, 6.5, 0, TAU);
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.strokeStyle = '#06122a';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#06122a';
        ctx.font = `800 9px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(s.level), bx, by + 0.5);
      }
      if (s.completedAt !== undefined && t - s.completedAt < 900 && !this.opts.reducedMotion) {
        const q = clamp01((t - s.completedAt) / 900);
        ctx.beginPath();
        ctx.arc(x, y, r + 4 + 20 * easeOut(q), 0, TAU);
        ctx.strokeStyle = rgba(s.color, 0.9 * (1 - q));
        ctx.lineWidth = 2.5 * (1 - q) + 0.5;
        ctx.stroke();
      }
      this.pickables.push({ x, y, r: Math.max(16, r + 4), pick: { kind: 'structure', id: s.id } });
    }
  }

  private placementOk(): boolean {
    if (!this.placement || !this.pointer || !this.hoveredRegion) return false;
    const [wx, wy] = this.toWorld(this.pointer.x, this.pointer.y);
    const at = this.projection.unproject(wx, wy);
    return this.placement.accepts ? this.placement.accepts(this.hoveredRegion, at as [number, number]) : true;
  }

  /** Fantasma da construção sob o ponteiro (mouse). No toque, o próprio toque posiciona. */
  private drawPlacement() {
    if (!this.pointer || !this.placement) return;
    const { ctx } = this;
    const { x, y } = this.pointer;
    const ok = this.placementOk();
    const r = this.structureRadius() + 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 7, 0, TAU);
    ctx.strokeStyle = ok ? 'rgba(120, 255, 180, 0.9)' : 'rgba(255, 110, 110, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    this.badge(x, y, r, ok ? this.placement.color : '#ff6b6b', this.placement.glyph, true, 0.85);
  }

  /** Bandeiras fincadas: mastro, pano com a imagem e, de perto, o nome. */
  private drawFlags(t: number) {
    const { ctx } = this;
    const z = this.zoom;
    const placed: Box[] = [];
    const names: { text: string; x: number; y: number }[] = [];
    const font = `700 11.5px ${FONT}`;
    // Bandeiras sem zoom mínimo (capitais, países) primeiro: elas e seus nomes têm prioridade de espaço.
    const ordered = [...this.flags].sort((a, b) => Number(a.minZoom !== undefined) - Number(b.minZoom !== undefined));
    for (const f of ordered) {
      const [x, y] = this.toScreen(f.lon, f.lat);
      if (x < -60 || x > this.w + 60 || y < -60 || y > this.h + 60) continue;
      const rise = f.plantedAt === undefined ? 1 : clamp01((t - f.plantedAt) / 620);
      if (rise <= 0) continue;
      // Recém-fincada aparece em qualquer zoom por alguns segundos; depois respeita o zoom mínimo.
      const fresh = f.plantedAt !== undefined && t - f.plantedAt < 5000;
      if (f.minZoom !== undefined && !fresh && z < f.minZoom) continue;
      const s = (f.scale ?? 1) * Math.max(0.8, Math.min(1.5, 0.75 + z * 0.09));
      if (f.minZoom !== undefined && !fresh && !this.free(placed, [x - 5, y - 20 * s, x + 20 * s, y + 3])) continue;
      const grow = this.opts.reducedMotion ? 1 : easeBack(rise);
      const pole = 20 * s * grow;
      const fw = 19 * s;
      const fh = (fw * 2) / 3;
      ctx.beginPath();
      ctx.ellipse(x, y, 4.5 * s, 1.8 * s, 0, 0, TAU);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(4, 10, 24, 0.95)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - pole);
      ctx.stroke();
      ctx.strokeStyle = '#eef4ff';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Pano: abre da esquerda para a direita enquanto sobe.
      const open = clamp01(rise * 1.5 - 0.3);
      if (open > 0) {
        const cw = fw * (this.opts.reducedMotion ? 1 : easeOut(open));
        const top = y - pole;
        const opening = cw < fw - 0.01;
        if (opening) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + 0.5, top, cw, fh);
          ctx.clip();
        }
        if (f.image) ctx.drawImage(f.image, x + 0.5, top, fw, fh);
        else {
          ctx.fillStyle = f.color;
          ctx.fillRect(x + 0.5, top, fw, fh);
        }
        if (opening) ctx.restore();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(x + 0.5 + cw * 0.3, top, cw * 0.18, fh);
        ctx.strokeStyle = 'rgba(4, 10, 24, 0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, top + 0.5, cw, fh - 1);
      }
      this.pickables.push({ x: x + fw / 2, y: y - pole / 2, r: Math.max(16, fw * 0.8), pick: { kind: 'flag', id: f.id } });
      placed.push([x - 4, y - pole - 2, x + fw + 3, y + 3]);
      if (f.label && z >= 2.2 && rise >= 1) {
        const tw = this.measure(font, f.label);
        if (this.free(placed, [x - tw / 2 - 3, y + 4, x + tw / 2 + 3, y + 19])) names.push({ text: f.label, x, y });
      }
    }
    // Nomes desenhados por último, para nenhuma bandeira vizinha cobri-los.
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const n of names) {
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(4, 10, 24, 0.85)';
      ctx.fillStyle = '#ffffff';
      ctx.strokeText(n.text, n.x, n.y + 5);
      ctx.fillText(n.text, n.x, n.y + 5);
    }
  }

  private drawMarkers() {
    const { ctx } = this;
    for (const m of this.markers) {
      if ((m.minZoom ?? 0) > this.zoom) continue;
      const [x, y] = this.toScreen(m.lon, m.lat);
      if (x < -20 || x > this.w + 20 || y < -20 || y > this.h + 20) continue;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, TAU);
      ctx.fillStyle = 'rgba(8, 14, 24, 0.88)';
      ctx.fill();
      ctx.strokeStyle = m.color ?? '#d7dee9';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      this.pickables.push({ x, y, r: 12, pick: { kind: 'marker', id: m.id } });
    }
  }

  private drawRoutes(t: number) {
    const { ctx } = this;
    const now = this.opts.now();
    for (const r of this.routes) {
      const [x0, y0] = this.toScreen(r.from[0], r.from[1]);
      const [x1, y1] = this.toScreen(r.to[0], r.to[1]);
      const color = r.color ?? '#f3c14b';
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = this.opts.reducedMotion ? 0 : -t / 45;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const p = clamp01((now - r.departAt) / Math.max(1, r.arriveAt - r.departAt));
      ctx.beginPath();
      ctx.arc(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p, 4, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.settle);
    this.observer.disconnect();
    this.canvas.remove();
    this.vignette.remove();
    for (const set of Object.values(this.listeners)) set.clear();
  }
}
