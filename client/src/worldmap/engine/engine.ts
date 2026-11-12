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
  MapMissile,
  MapOperation,
  MapRail,
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
/** Sorteio determinístico (FNV-1a) para partículas: o mesmo míssil desenha igual em toda tela. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Espadas cruzadas do selo de batalha (grade 24). */
const SWORDS = 'M4 4l9 9M4 4h3.5M4 4v3.5M20 4l-9 9M20 4h-3.5M20 4v3.5M9.5 14.5 6 18M14.5 14.5 18 18M4.5 16.5l3 3M19.5 16.5l-3 3';
/** Duração do desenho de um trecho novo de ferrovia (ms). */
const RAIL_MS = 1400;
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
  private rails: MapRail[] = [];
  private operations: MapOperation[] = [];
  private missiles: MapMissile[] = [];
  private missileRange: { center: [number, number]; km: number; color: string } | null = null;
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
  /** Operações militares (Fase E). */
  setOperations(list: MapOperation[]) {
    this.operations = list;
    this.invalidate();
  }

  operationList(): readonly MapOperation[] {
    return this.operations;
  }

  /** Mísseis em preparação, voo, interceptação ou impacto (Fase E). */
  setMissiles(list: MapMissile[]) {
    this.missiles = list;
    this.invalidate();
  }

  missileList(): readonly MapMissile[] {
    return this.missiles;
  }

  /** Círculo de alcance do silo durante a escolha do alvo. */
  setMissileRange(range: { center: [number, number]; km: number; color: string } | null) {
    this.missileRange = range;
    this.invalidate();
  }

  railList(): readonly MapRail[] {
    return this.rails;
  }

  /** Ferrovias entre construções (desenhadas por baixo dos selos). */
  setRails(rails: MapRail[]) {
    this.rails = rails;
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
      this.structures.some((x) => (x.completedAt !== undefined && t - x.completedAt < 900) || (x.building && now < x.building.endAt + 300)) ||
      this.rails.some((r) => r.appearAt !== undefined && t - r.appearAt < RAIL_MS + 200 && t - r.appearAt > -4000);
    const filling = this.fills.some((f) => now < f.endAt + 400);
    const war = this.operations.length > 0 || this.missiles.some((m) => now < m.impactAt + 4300);
    const live = this.routes.length > 0 || this.pointsLive || this.preview !== null || filling || moving || war;
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
      if (!this.hidden.has('structures')) {
        this.drawRails(t);
        this.drawStructures(t);
      }
      this.drawRange();
      if (!this.hidden.has('flags')) this.drawFlags(t);
      // Guerra por cima das bandeiras: a batalha e o míssil nunca ficam escondidos.
      this.drawOperations(t);
      this.drawMissiles();
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

  /**
   * Ferrovias discretas: trilho escuro fino com dormentes na cor da nação. Conexão entre aliados em
   * tracejado dourado. Trecho novo se desenha de uma ponta à outra com uma luz na frente.
   */
  private drawRails(t: number) {
    if (!this.rails.length) return;
    const { ctx } = this;
    const z = this.zoom;
    const width = Math.max(1, Math.min(2.2, 0.7 + z * 0.12));
    ctx.save();
    ctx.lineCap = 'round';
    for (const r of this.rails) {
      const age = r.appearAt === undefined ? Infinity : t - r.appearAt;
      if (age < 0) continue;
      const fresh = age < 5000;
      if (r.minZoom !== undefined && z < r.minZoom && !fresh) continue;
      const [x0, y0] = this.toScreen(r.from[0], r.from[1]);
      const [x1, y1] = this.toScreen(r.to[0], r.to[1]);
      if (Math.max(x0, x1) < -20 || Math.min(x0, x1) > this.w + 20 || Math.max(y0, y1) < -20 || Math.min(y0, y1) > this.h + 20) continue;
      const p = this.opts.reducedMotion ? 1 : clamp01(age / RAIL_MS);
      const e = easeOut(p);
      const xe = x0 + (x1 - x0) * e;
      const ye = y0 + (y1 - y0) * e;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(xe, ye);
      if (r.ally) {
        ctx.strokeStyle = 'rgba(6, 12, 26, 0.7)';
        ctx.lineWidth = width + 2;
        ctx.setLineDash([]);
        ctx.stroke();
        ctx.strokeStyle = '#f3c14b';
        ctx.lineWidth = width;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(6, 12, 26, 0.72)';
        ctx.lineWidth = width + 2.4;
        ctx.stroke();
        // Trilho claro sobre base escura: legível sobre qualquer cor de território (inclusive a da própria nação).
        ctx.strokeStyle = r.own ? 'rgba(246, 238, 220, 0.95)' : 'rgba(246, 238, 220, 0.6)';
        ctx.lineWidth = width;
        ctx.stroke();
        if (z >= 3) {
          // Dormentes: só de perto, para o mapa continuar limpo de longe.
          ctx.strokeStyle = 'rgba(6, 12, 26, 0.75)';
          ctx.lineWidth = width + 2.6;
          ctx.setLineDash([1, 6]);
          ctx.lineCap = 'butt';
          ctx.stroke();
          ctx.lineCap = 'round';
        }
      }
      ctx.setLineDash([]);
      if (p < 1) {
        ctx.beginPath();
        ctx.arc(xe, ye, 3 + width, 0, TAU);
        ctx.fillStyle = r.ally ? '#ffe39a' : '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  /** Curva da origem ao alvo, arqueada para cima (mísseis) ou de lado (operações). */
  private curve(x0: number, y0: number, x1: number, y1: number, lift: number) {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    // Perpendicular voltada para cima da tela.
    let nx = -(y1 - y0) / len;
    let ny = (x1 - x0) / len;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const cx = mx + nx * len * lift;
    const cy = my + ny * len * lift;
    return (u: number): [number, number] => {
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      return [a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1];
    };
  }

  private drawRange() {
    const r = this.missileRange;
    if (!r) return;
    const { ctx } = this;
    const R = 6371;
    const d = r.km / R;
    const [lon0, lat0] = [(r.center[0] * Math.PI) / 180, (r.center[1] * Math.PI) / 180];
    ctx.save();
    ctx.beginPath();
    let prevX: number | null = null;
    for (let i = 0; i <= 120; i++) {
      const b = (i / 120) * TAU;
      const lat = Math.asin(Math.sin(lat0) * Math.cos(d) + Math.cos(lat0) * Math.sin(d) * Math.cos(b));
      const lon = lon0 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat0), Math.cos(d) - Math.sin(lat0) * Math.sin(lat));
      const [x, y] = this.toScreen((((lon * 180) / Math.PI + 540) % 360) - 180, (lat * 180) / Math.PI);
      // Pula a costura do antimeridiano.
      if (prevX === null || Math.abs(x - prevX) > this.w * 0.6) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      prevX = x;
    }
    ctx.fillStyle = rgba(r.color, 0.08);
    ctx.fill();
    ctx.strokeStyle = rgba(r.color, 0.85);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([7, 6]);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Operações: seta tracejada em movimento da origem ao alvo e, no alvo, um selo de batalha com
   * espadas cruzadas e o anel de ocupação na cor do atacante.
   */
  private drawOperations(t: number) {
    if (!this.operations.length) return;
    const { ctx } = this;
    const now = this.opts.now();
    const swords = this.glyph(SWORDS);
    ctx.save();
    ctx.lineCap = 'round';
    for (const o of this.operations) {
      const [x0, y0] = this.toScreen(o.from[0], o.from[1]);
      const [x1, y1] = this.toScreen(o.to[0], o.to[1]);
      const len = Math.hypot(x1 - x0, y1 - y0);
      const P = this.curve(x0, y0, x1, y1, 0.18);
      const end = len > 60 ? 0.86 : 0.7;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (let i = 1; i <= 24; i++) {
        const [x, y] = P((i / 24) * end);
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(6, 12, 26, 0.7)';
      ctx.lineWidth = 6;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 3;
      ctx.setLineDash(o.naval ? [12, 7] : [8, 6]);
      ctx.lineDashOffset = this.opts.reducedMotion ? 0 : -t / 35;
      ctx.stroke();
      ctx.setLineDash([]);
      // Ponta da seta.
      const [ax, ay] = P(end);
      const [bx, by] = P(end - 0.04);
      const ang = Math.atan2(ay - by, ax - bx);
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(ang) * 9, ay + Math.sin(ang) * 9);
      ctx.lineTo(ax + Math.cos(ang + 2.4) * 8, ay + Math.sin(ang + 2.4) * 8);
      ctx.lineTo(ax + Math.cos(ang - 2.4) * 8, ay + Math.sin(ang - 2.4) * 8);
      ctx.closePath();
      ctx.fillStyle = o.color;
      ctx.strokeStyle = 'rgba(6, 12, 26, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fill();
      // Selo de batalha.
      const v = Math.max(0, Math.min(1, o.progress.value + (o.progress.rate * Math.max(0, now - o.progress.at)) / 1000));
      const r = 14;
      if (o.own || o.against) {
        const pulse = this.opts.reducedMotion ? 0 : (t % 1400) / 1400;
        ctx.beginPath();
        ctx.arc(x1, y1, r + 4 + pulse * 14, 0, TAU);
        ctx.strokeStyle = o.against ? `rgba(255, 90, 90, ${0.6 * (1 - pulse)})` : rgba(o.color, 0.6 * (1 - pulse));
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x1, y1, r, 0, TAU);
      ctx.fillStyle = 'rgba(8, 16, 34, 0.92)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(150, 190, 255, 0.25)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x1, y1, r, -Math.PI / 2, -Math.PI / 2 + v * TAU);
      ctx.strokeStyle = o.color;
      ctx.stroke();
      ctx.save();
      ctx.translate(x1 - 8.5, y1 - 8.5);
      ctx.scale(17 / 24, 17 / 24);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.stroke(swords);
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * Mísseis e bombas, em fases pelo relógio do servidor (todos veem o mesmo):
   *   1. preparação: anel de contagem no silo, faróis de alerta girando e vapor;
   *   2. abertura das tampas do silo;
   *   3. ignição: clarão, coluna de fumaça e tremor curto da câmera;
   *   4. voo em arco com o corpo apontado na direção do movimento, chama tremulante, rastro de
   *      fumaça que se abre com o tempo e a sombra correndo no chão (dá a altura);
   *   5. alvo com mira girando e anel da contagem até o impacto;
   *   6a. impacto: clarão, bola de fogo, duas ondas de choque, estilhaços com gravidade, fumaça
   *       subindo e marca queimada que some devagar; a bomba é maior e mais escura;
   *   6b. interceptação: interceptador ciano sobe do alvo e explode no ar, com estilhaços caindo.
   * Partículas são determinísticas (sorteio pelo id), poucas e só durante o ataque.
   */
  private drawMissiles() {
    if (!this.missiles.length) return;
    const { ctx } = this;
    const now = this.opts.now();
    const reduced = !!this.opts.reducedMotion;
    // Tremor curto da câmera na ignição e no impacto (desligado com movimento reduzido).
    let shakeX = 0;
    let shakeY = 0;
    if (!reduced) {
      for (const m of this.missiles) {
        const bomb = m.weapon === 'bomb';
        for (const [at, amp, ms] of [
          [m.flightAt, 2, 260],
          [m.intercepted ? -Infinity : m.impactAt, bomb ? 7 : 4.5, bomb ? 650 : 420],
        ] as const) {
          const d = now - at;
          if (d >= 0 && d < ms) {
            const k = (1 - d / ms) * amp;
            shakeX += Math.sin(d * 0.21 + m.impactAt) * k;
            shakeY += Math.cos(d * 0.17) * k;
          }
        }
      }
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const m of this.missiles) {
      if (now > m.impactAt + 4200 || now < m.launchedAt - 50) continue;
      const bomb = m.weapon === 'bomb';
      const seed = hash32(m.id);
      const rnd = (i: number) => ((hash32(`${m.id}:${i}`) >>> 0) % 10000) / 10000;
      const [x0, y0] = this.toScreen(m.from[0], m.from[1]);
      const [x1, y1] = this.toScreen(m.to[0], m.to[1]);
      const len = Math.hypot(x1 - x0, y1 - y0);
      const lift = Math.max(0.2, Math.min(bomb ? 0.75 : 0.6, (bomb ? 95 : 75) / Math.max(1, len)));
      const P = this.curve(x0, y0, x1, y1, lift);
      // Chão: linha reta entre silo e alvo (a sombra corre por ela).
      const G = (u: number): [number, number] => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
      const flight = Math.max(1, m.impactAt - m.flightAt);
      const stopU = m.intercepted ? (m.interceptAt - m.flightAt) / flight : 1;
      const end = m.intercepted ? m.interceptAt : m.impactAt;
      const u = Math.max(0, Math.min(stopU, (now - m.flightAt) / flight));
      const heat = bomb ? [255, 120, 40] : [255, 175, 70];

      // ----- alvo: mira girando e contagem até o impacto -----
      if (now < end) {
        const left = Math.max(0, (end - now) / Math.max(1, end - m.launchedAt));
        const rot = reduced ? 0 : now / 900;
        const pulse = reduced ? 0.5 : (now % 900) / 900;
        ctx.beginPath();
        ctx.arc(x1, y1, 18 + pulse * 10, 0, TAU);
        ctx.strokeStyle = `rgba(255, 80, 60, ${0.55 * (1 - pulse)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x1, y1, 13, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - left));
        ctx.strokeStyle = 'rgba(255, 110, 90, 0.95)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.save();
        ctx.translate(x1, y1);
        ctx.rotate(rot);
        ctx.strokeStyle = 'rgba(255, 210, 200, 0.95)';
        ctx.lineWidth = 1.6;
        for (let k = 0; k < 4; k++) {
          ctx.rotate(TAU / 4);
          ctx.beginPath();
          ctx.moveTo(7, 0);
          ctx.lineTo(11, 0);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, 9, 0.25, 0.8);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ----- 1–2. preparação e abertura do silo -----
      if (now < m.flightAt) {
        const q = (now - m.launchedAt) / Math.max(1, m.flightAt - m.launchedAt);
        const charge = Math.min(1, q / 0.6);
        // Faróis de alerta girando.
        const spin = reduced ? 0 : now / 180;
        for (let k = 0; k < 2; k++) {
          const a = spin + k * Math.PI;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.arc(x0, y0, 34, a - 0.35, a + 0.35);
          ctx.closePath();
          ctx.fillStyle = `rgba(255, 150, 40, ${0.16 * charge})`;
          ctx.fill();
        }
        // Anel de contagem.
        ctx.beginPath();
        ctx.arc(x0, y0, 15, -Math.PI / 2, -Math.PI / 2 + TAU * q);
        ctx.strokeStyle = `rgba(255, 190, 80, ${0.5 + 0.5 * charge})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        // Vapor saindo pelas frestas.
        for (let k = 0; k < 4; k++) {
          const t = ((now / 700 + rnd(k)) % 1) * charge;
          ctx.beginPath();
          ctx.arc(x0 + (rnd(k + 10) - 0.5) * 16, y0 - 6 - t * 18, 3 + t * 6, 0, TAU);
          ctx.fillStyle = `rgba(225, 230, 240, ${0.28 * (1 - t)})`;
          ctx.fill();
        }
        // Poço e tampas deslizando.
        const open = Math.max(0, (q - 0.6) / 0.4);
        ctx.beginPath();
        ctx.arc(x0, y0, 8, 0, TAU);
        ctx.fillStyle = '#05080f';
        ctx.fill();
        if (open > 0) {
          const g = ctx.createRadialGradient(x0, y0, 0, x0, y0, 8);
          g.addColorStop(0, `rgba(255, 220, 140, ${open})`);
          g.addColorStop(1, 'rgba(255, 120, 40, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x0, y0, 8, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#9aa7bd';
        const shift = open * 8;
        ctx.beginPath();
        ctx.arc(x0 - shift, y0, 8, Math.PI / 2, (3 * Math.PI) / 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x0 + shift, y0, 8, -Math.PI / 2, Math.PI / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(6, 12, 26, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        continue;
      }

      // ----- 3. ignição: clarão e coluna de fumaça no silo -----
      const since = now - m.flightAt;
      if (since < 2600) {
        const k = since / 2600;
        for (let i = 0; i < 9; i++) {
          const a = rnd(i) * TAU;
          const d = (0.3 + rnd(i + 20)) * k * 22;
          ctx.beginPath();
          ctx.arc(x0 + Math.cos(a) * d, y0 + Math.sin(a) * d * 0.45 - k * 10 * rnd(i + 40), 4 + k * (8 + rnd(i + 30) * 6), 0, TAU);
          ctx.fillStyle = `rgba(205, 210, 220, ${0.32 * (1 - k)})`;
          ctx.fill();
        }
        if (since < 280) {
          const f = since / 280;
          const g = ctx.createRadialGradient(x0, y0, 0, x0, y0, 30);
          g.addColorStop(0, `rgba(255, 250, 230, ${1 - f})`);
          g.addColorStop(0.4, `rgba(255, 190, 90, ${0.7 * (1 - f)})`);
          g.addColorStop(1, 'rgba(255, 120, 40, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x0, y0, 30, 0, TAU);
          ctx.fill();
        }
      }

      // ----- 4. voo -----
      if (now < end) {
        // Sombra correndo no chão e o traçado previsto, bem discretos.
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        const [gx, gy] = G(u);
        ctx.moveTo(gx, gy);
        ctx.lineTo(x1, y1);
        ctx.strokeStyle = 'rgba(255, 120, 100, 0.35)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
        const h = Math.sin(Math.PI * u);
        ctx.beginPath();
        ctx.ellipse(gx, gy, 5 - h * 2, 2.2 - h, 0, 0, TAU);
        ctx.fillStyle = `rgba(0, 0, 0, ${0.35 - h * 0.2})`;
        ctx.fill();
        // Rastro de fumaça: bolinhas deixadas pelo caminho que se abrem e somem com a idade.
        const puffs = bomb ? 26 : 22;
        const span = bomb ? 0.3 : 0.38;
        for (let i = puffs; i >= 1; i--) {
          const back = (i / puffs) * span;
          const w = u - back;
          if (w <= 0) continue;
          const [px, py] = P(w);
          const age = back / span;
          const drift = age * 6;
          ctx.beginPath();
          ctx.arc(px + (rnd(i) - 0.5) * drift, py - age * 4, 1.6 + age * (bomb ? 7 : 5.5), 0, TAU);
          ctx.fillStyle = bomb ? `rgba(120, 120, 128, ${0.42 * (1 - age)})` : `rgba(225, 228, 236, ${0.45 * (1 - age)})`;
          ctx.fill();
        }
        // Corpo apontado na direção do voo, chama tremulante.
        const [hx, hy] = P(u);
        const [bx, by] = P(Math.max(0, u - 0.01));
        const ang = Math.atan2(hy - by, hx - bx);
        const flicker = reduced ? 1 : 0.75 + 0.25 * Math.sin(now / 35 + seed);
        const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, bomb ? 16 : 13);
        glow.addColorStop(0, `rgba(${heat[0]}, ${heat[1]}, ${heat[2]}, 0.55)`);
        glow.addColorStop(1, `rgba(${heat[0]}, ${heat[1]}, ${heat[2]}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(hx, hy, bomb ? 16 : 13, 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(ang);
        ctx.scale(1.45, 1.45);
        const s = bomb ? 1.25 : 1;
        // Chama.
        ctx.beginPath();
        ctx.moveTo(-6 * s, -2.2 * s);
        ctx.quadraticCurveTo((-6 - 12 * flicker) * s, 0, -6 * s, 2.2 * s);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 160, 60, 0.9)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-6 * s, -1.2 * s);
        ctx.quadraticCurveTo((-6 - 6 * flicker) * s, 0, -6 * s, 1.2 * s);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 250, 220, 0.95)';
        ctx.fill();
        // Corpo.
        ctx.beginPath();
        if (bomb) {
          ctx.ellipse(0, 0, 7 * s, 3.4 * s, 0, 0, TAU);
        } else {
          ctx.moveTo(8, 0);
          ctx.quadraticCurveTo(5, -2.6, 0, -2.4);
          ctx.lineTo(-6, -2.4);
          ctx.lineTo(-6, 2.4);
          ctx.lineTo(0, 2.4);
          ctx.quadraticCurveTo(5, 2.6, 8, 0);
        }
        ctx.fillStyle = bomb ? '#3a3f4a' : '#e9edf3';
        ctx.fill();
        ctx.strokeStyle = 'rgba(6, 12, 26, 0.85)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Aletas e faixa.
        ctx.fillStyle = bomb ? '#262a33' : '#c43c2c';
        ctx.beginPath();
        ctx.moveTo(-6 * s, -2.4 * s);
        ctx.lineTo(-8.5 * s, -5 * s);
        ctx.lineTo(-3.5 * s, -2.4 * s);
        ctx.moveTo(-6 * s, 2.4 * s);
        ctx.lineTo(-8.5 * s, 5 * s);
        ctx.lineTo(-3.5 * s, 2.4 * s);
        ctx.fill();
        if (!bomb) ctx.fillRect(2, -2.5, 1.6, 5);
        else {
          ctx.fillStyle = '#ffc53d';
          ctx.fillRect(-1, -3.3, 1.6, 6.6);
        }
        ctx.restore();
      }

      // ----- 6b. interceptação -----
      if (m.intercepted) {
        const [ix, iy] = P(stopU);
        const lead = 1300;
        if (now >= m.interceptAt - lead && now < m.interceptAt) {
          const k = (now - (m.interceptAt - lead)) / lead;
          const Q = this.curve(x1, y1, ix, iy, 0.2);
          for (let i = 10; i >= 0; i--) {
            const w = Math.max(0, k - i * 0.025);
            const [qx, qy] = Q(w);
            ctx.beginPath();
            ctx.arc(qx, qy, 1 + (i / 10) * 3, 0, TAU);
            ctx.fillStyle = `rgba(150, 240, 255, ${0.5 * (1 - i / 10)})`;
            ctx.fill();
          }
          const [qx, qy] = Q(k);
          ctx.beginPath();
          ctx.arc(qx, qy, 3, 0, TAU);
          ctx.fillStyle = '#f2feff';
          ctx.fill();
          if (k < 0.15) {
            ctx.beginPath();
            ctx.arc(x1, y1, 10 * (1 - k / 0.15), 0, TAU);
            ctx.fillStyle = 'rgba(160, 245, 255, 0.7)';
            ctx.fill();
          }
        }
        if (now >= m.interceptAt) {
          const d = now - m.interceptAt;
          const k = Math.min(1, d / 1500);
          if (d < 220) {
            const g = ctx.createRadialGradient(ix, iy, 0, ix, iy, 26);
            g.addColorStop(0, `rgba(255, 255, 255, ${1 - d / 220})`);
            g.addColorStop(1, 'rgba(120, 235, 255, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(ix, iy, 26, 0, TAU);
            ctx.fill();
          }
          for (const [r0, r1, a] of [
            [6, 38, 1],
            [3, 24, 0.7],
          ] as const) {
            ctx.beginPath();
            ctx.arc(ix, iy, r0 + k * r1, 0, TAU);
            ctx.strokeStyle = `rgba(120, 235, 255, ${a * (1 - k)})`;
            ctx.lineWidth = 3 * (1 - k) + 0.6;
            ctx.stroke();
          }
          // Estilhaços caindo, com gravidade.
          for (let i = 0; i < 14; i++) {
            const a = rnd(i) * TAU;
            const v = 10 + rnd(i + 50) * 26;
            const t = Math.min(1, d / 1800);
            const px = ix + Math.cos(a) * v * t;
            const py = iy + Math.sin(a) * v * t + 40 * t * t;
            ctx.beginPath();
            ctx.arc(px, py, 1.4 * (1 - t) + 0.3, 0, TAU);
            ctx.fillStyle = i % 3 ? `rgba(230, 253, 255, ${1 - t})` : `rgba(255, 190, 110, ${1 - t})`;
            ctx.fill();
          }
        }
        continue;
      }

      // ----- 6a. impacto -----
      if (now >= m.impactAt) {
        const d = now - m.impactAt;
        const big = bomb ? 1.6 : 1;
        // Marca queimada que some devagar.
        const scorch = Math.min(1, d / 4200);
        ctx.beginPath();
        ctx.ellipse(x1, y1, 16 * big, 9 * big, 0, 0, TAU);
        ctx.fillStyle = `rgba(20, 12, 8, ${0.45 * (1 - scorch)})`;
        ctx.fill();
        // Clarão.
        if (d < 320) {
          const f = d / 320;
          const g = ctx.createRadialGradient(x1, y1, 0, x1, y1, 46 * big);
          g.addColorStop(0, `rgba(255, 255, 245, ${1 - f})`);
          g.addColorStop(0.35, `rgba(255, 220, 150, ${0.8 * (1 - f)})`);
          g.addColorStop(1, 'rgba(255, 140, 60, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x1, y1, 46 * big, 0, TAU);
          ctx.fill();
        }
        // Bola de fogo que sobe e esfria.
        const fb = Math.min(1, d / (bomb ? 1700 : 1300));
        if (fb < 1) {
          const r = (8 + fb * 18) * big;
          const cy = y1 - fb * 14 * big;
          const g = ctx.createRadialGradient(x1, cy, 0, x1, cy, r);
          g.addColorStop(0, `rgba(255, 245, 200, ${0.95 * (1 - fb)})`);
          g.addColorStop(0.45, `rgba(255, ${bomb ? 120 : 150}, 40, ${0.85 * (1 - fb)})`);
          g.addColorStop(1, `rgba(${bomb ? 120 : 170}, 40, 20, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x1, cy, r, 0, TAU);
          ctx.fill();
        }
        // Duas ondas de choque.
        for (const [delay, reach, width] of [
          [0, 70, 3.5],
          [160, 46, 2],
        ] as const) {
          const t = Math.min(1, Math.max(0, d - delay) / 1100);
          if (d < delay || t >= 1) continue;
          ctx.beginPath();
          ctx.ellipse(x1, y1, (6 + t * reach) * big, (4 + t * reach * 0.62) * big, 0, 0, TAU);
          ctx.strokeStyle = `rgba(255, 225, 170, ${0.9 * (1 - t)})`;
          ctx.lineWidth = width * (1 - t) + 0.5;
          ctx.stroke();
        }
        // Estilhaços e brasas com gravidade.
        const n = bomb ? 22 : 15;
        for (let i = 0; i < n; i++) {
          const t = Math.min(1, d / 1600);
          if (t >= 1) break;
          const a = -Math.PI * (0.1 + rnd(i) * 0.8);
          const v = (18 + rnd(i + 70) * 34) * big;
          const px = x1 + Math.cos(a) * v * t;
          const py = y1 + Math.sin(a) * v * t + 55 * t * t;
          ctx.beginPath();
          ctx.arc(px, py, (1.8 * (1 - t) + 0.4) * (bomb ? 1.2 : 1), 0, TAU);
          ctx.fillStyle = `rgba(255, ${150 + Math.round(rnd(i + 90) * 80)}, 70, ${1 - t})`;
          ctx.fill();
        }
        // Fumaça subindo.
        const sm = Math.min(1, d / 4000);
        for (let i = 0; i < (bomb ? 9 : 6); i++) {
          const t = Math.max(0, sm - i * 0.04);
          if (t <= 0) continue;
          ctx.beginPath();
          ctx.arc(x1 + (rnd(i + 120) - 0.5) * 18 * big, y1 - 6 - t * (30 + rnd(i + 130) * 18) * big, (5 + t * 12) * big, 0, TAU);
          ctx.fillStyle = bomb ? `rgba(55, 52, 55, ${0.4 * (1 - t)})` : `rgba(90, 88, 92, ${0.35 * (1 - t)})`;
          ctx.fill();
        }
      }
    }
    ctx.restore();
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
    if (ok && this.placement.links && this.hoveredRegion) {
      // Prévia da rede: os trilhos que surgiriam se a construção ficasse aqui.
      const [wx, wy] = this.toWorld(x, y);
      const at = this.projection.unproject(wx, wy) as [number, number];
      ctx.save();
      ctx.strokeStyle = 'rgba(120, 255, 180, 0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      for (const to of this.placement.links(this.hoveredRegion, at)) {
        const [tx, ty] = this.toScreen(to[0], to[1]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
      ctx.restore();
    }
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
