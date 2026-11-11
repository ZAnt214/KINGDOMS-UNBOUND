import { millerProjection, type Projection } from './projection';
import { type Box, RegionGeometry, type TerritoryShape } from './regions';
import type {
  BuiltinLayer,
  CountryStyle,
  GeoData,
  MapCity,
  MapEffect,
  MapEvents,
  MapFill,
  MapFlag,
  MapLabel,
  MapLayer,
  MapMarker,
  MapOptions,
  MapPick,
  MapPoint,
  MapRoute,
  MapStructure,
  MapTerritory,
  MapView,
  RegionInfo,
  RegionTopology,
} from './types';

interface Shape {
  id: string;
  path: Path2D;
  /** Caixa em unidades de mundo: x0, y0, x1, y1. */
  box: [number, number, number, number];
}

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

type Listener<K extends keyof MapEvents> = (payload: MapEvents[K]) => void;

const OCEAN_TOP = '#0d3a78';
const OCEAN_MID = '#0a2857';
const OCEAN_BOTTOM = '#061634';
const BORDER = 'rgba(6, 11, 20, 0.9)';
const SELECT = '#f3c14b';
const TAU = Math.PI * 2;

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
 * Motor do mapa mundial: desenha países vetoriais em Canvas 2D e cuida de câmera, entrada e seleção.
 *
 * É independente da interface e das regras do jogo. Recebe geometria, estilos por país e listas de
 * marcadores/rotas/cidades; devolve eventos (`select`, `hover`, `view`). Novos níveis de detalhe
 * (regiões, cidades selecionáveis, tropas, frentes) entram como dados ou como `MapLayer`, sem tocar
 * na tela que hospeda o mapa.
 */
export class WorldMapEngine {
  readonly canvas: HTMLCanvasElement;
  readonly projection: Projection;
  private ctx: CanvasRenderingContext2D;
  private probe: CanvasRenderingContext2D;
  private shapes: Shape[] = [];
  private byId = new Map<string, Shape>();
  private land = new Path2D();
  private styles: Record<string, CountryStyle> = {};
  private labels: MapLabel[] = [];
  private cities: MapCity[] = [];
  private markers: MapMarker[] = [];
  private routes: MapRoute[] = [];
  private layers: MapLayer[] = [];
  private hidden = new Set<BuiltinLayer>();
  private selected: string | null = null;
  private hovered: string | null = null;
  private listeners: { [K in keyof MapEvents]: Set<Listener<K>> } = { select: new Set(), hover: new Set(), view: new Set() };
  private w = 1;
  private h = 1;
  private dpr = 1;
  /** Câmera: centro em unidades de mundo e escala em px por unidade. */
  private cam: Cam = { x: 0, y: 0, k: 1 };
  private minK = 1;
  private pad: Pad = { top: 0, right: 0, bottom: 0, left: 0 };
  private framed = false;
  private raf = 0;
  private anim: { from: Cam; to: Cam; start: number; ms: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { x: number; y: number; moved: number; at: number; dist: number } | null = null;
  private hatch: CanvasPattern | null = null;
  private observer: ResizeObserver;
  private opts: Required<MapOptions>;
  private pickables: { x: number; y: number; r: number; pick: MapPick }[] = [];
  private destroyed = false;
  // Regiões e territórios (mapa por regiões; ver setTopology).
  private geo: RegionGeometry | null = null;
  private territories: (TerritoryShape & { own: boolean })[] = [];
  private hints: { path: Path2D; box: Box; color: string } | null = null;
  private preview: { path: Path2D; box: Box; color: string } | null = null;
  private fills: MapFill[] = [];
  private effects: { fx: MapEffect; start: number }[] = [];
  private points: MapPoint[] = [];
  private pointsLive = false;
  private flags: MapFlag[] = [];
  private selectedRegion: string | null = null;
  private hoveredRegion: string | null = null;
  private structures: MapStructure[] = [];
  private glyphs = new Map<string, Path2D>();
  private arena: TerritoryShape | null = null;

  constructor(
    private host: HTMLElement,
    options: MapOptions = {},
  ) {
    this.opts = { now: () => Date.now(), neutralFill: '#5d5a72', maxZoom: 48, reducedMotion: false, ...options };
    this.projection = millerProjection(1000);
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none';
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-label', 'Mapa mundial');
    host.appendChild(this.canvas);
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

  setGeometry(geo: GeoData) {
    this.shapes = [];
    this.byId.clear();
    this.land = new Path2D();
    for (const c of geo.countries) {
      const path = new Path2D();
      const box: Shape['box'] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const polygon of c.p) {
        for (const ring of polygon) {
          let lon = 0;
          let lat = 0;
          for (let i = 0; i < ring.length; i += 2) {
            lon += ring[i];
            lat += ring[i + 1];
            const [x, y] = this.projection.project(lon / geo.q, lat / geo.q);
            if (i === 0) path.moveTo(x, y);
            else path.lineTo(x, y);
            if (x < box[0]) box[0] = x;
            if (y < box[1]) box[1] = y;
            if (x > box[2]) box[2] = x;
            if (y > box[3]) box[3] = y;
          }
          path.closePath();
        }
      }
      const shape = { id: c.id, path, box };
      this.shapes.push(shape);
      this.byId.set(c.id, shape);
      this.land.addPath(path);
    }
    this.invalidate();
  }

  /**
   * Mapa por regiões: substitui a geometria de países pela topologia de regiões. Os países passam
   * a ser a união das suas regiões, e a seleção devolve `{ kind: 'region' }`.
   */
  setTopology(topo: RegionTopology) {
    this.geo = new RegionGeometry(topo, this.projection);
    this.shapes = this.geo.countryList.map((c) => ({ id: c.id, path: c.path, box: c.box }));
    this.byId = new Map(this.shapes.map((s) => [s.id, s]));
    this.land = this.geo.land;
    if (!this.framed) this.home(false);
    this.invalidate();
  }
  get hasTopology() {
    return this.geo !== null;
  }
  regionInfo(id: string): RegionInfo | null {
    const r = this.geo?.regions.get(id);
    return r ? { id: r.id, country: r.country, name: r.name, at: r.at } : null;
  }
  /** Territórios das nações: cada um é pintado de uma vez e cercado pela própria fronteira. */
  setTerritories(list: MapTerritory[]) {
    if (!this.geo) return;
    this.territories = list.filter((t) => t.regions.length).map((t) => ({ ...this.geo!.territory(t.id, t.color, t.regions), own: !!t.own }));
    this.invalidate();
  }
  /** Regiões para onde o jogador pode expandir agora (contorno tracejado). */
  setExpansionHints(regionIds: string[], color: string) {
    this.hints = this.geo && regionIds.length ? { ...this.outlineOf(regionIds), color } : null;
    this.invalidate();
  }
  /** Prévia da área inicial de um ponto de partida. */
  setPreview(regionIds: string[] | null, color = '#ffffff') {
    this.preview = this.geo && regionIds?.length ? { ...this.outlineOf(regionIds), color } : null;
    this.invalidate();
  }
  private outlineOf(regionIds: string[]) {
    const o = this.geo!.outline(regionIds);
    return { path: o.fill, box: o.box };
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
  setStructures(list: MapStructure[]) {
    this.structures = list;
    this.invalidate();
  }
  /** Área jogável (partida rápida): o resto do mundo escurece. null = mundo inteiro. */
  setArena(regionIds: string[] | null) {
    this.arena = this.geo && regionIds?.length ? this.geo.territory('arena', '#ffffff', regionIds) : null;
    this.invalidate();
  }
  setFlags(flags: MapFlag[]) {
    this.flags = flags;
    this.invalidate();
  }
  playEffect(fx: MapEffect) {
    if (this.opts.reducedMotion && fx.kind !== 'conquest') return;
    this.effects.push({ fx, start: performance.now() });
    this.invalidate();
  }
  setSelectedRegion(id: string | null) {
    if (this.selectedRegion === id) return;
    this.selectedRegion = id;
    this.invalidate();
  }

  /** Cor (e estado de disputa) por país. Países sem entrada usam a cor neutra. */
  setCountryStyles(styles: Record<string, CountryStyle>) {
    this.styles = styles;
    this.invalidate();
  }
  setLabels(labels: MapLabel[]) {
    this.labels = [...labels].sort((a, b) => a.rank - b.rank);
    this.invalidate();
  }
  setCities(cities: MapCity[]) {
    this.cities = cities;
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
  addLayer(layer: MapLayer) {
    this.layers = [...this.layers.filter((l) => l.id !== layer.id), layer];
    this.invalidate();
  }
  removeLayer(id: string) {
    this.layers = this.layers.filter((l) => l.id !== id);
    this.invalidate();
  }
  setLayerVisible(layer: BuiltinLayer, visible: boolean) {
    if (visible) this.hidden.delete(layer);
    else this.hidden.add(layer);
    this.invalidate();
  }
  setReducedMotion(on: boolean) {
    this.opts.reducedMotion = on;
  }
  setSelected(code: string | null) {
    if (this.selected === code) return;
    this.selected = code;
    this.invalidate();
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
    const { width, height } = this.projection;
    c.x = halfW * 2 >= width ? width / 2 : Math.max(halfW, Math.min(width - halfW, c.x));
    // No mapa por regiões a câmera fica entre 84°N e 60°S: a Antártida não é jogável nesta fase.
    const top = this.geo ? this.projection.project(0, 84)[1] : 0;
    const bottom = this.geo ? this.projection.project(0, -60)[1] : height;
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
    this.anim = { from: { ...this.cam }, to, start: performance.now(), ms: Math.max(420, Math.min(1100, 320 + travel * 0.5)) };
    this.invalidate();
  }

  /** Visão inicial: mundo habitado enquadrado na área livre do HUD. */
  home(animate = true) {
    const freeW = Math.max(120, this.w - this.pad.left - this.pad.right);
    const freeH = Math.max(120, this.h - this.pad.top - this.pad.bottom);
    const [, top] = this.projection.project(0, 80);
    const [, bottom] = this.projection.project(0, -58);
    // Em telas em pé o mundo inteiro ficaria minúsculo: mostra cerca de metade da largura e deixa arrastar.
    const k = Math.max(this.minK, Math.min(freeH / (bottom - top), (freeW / this.projection.width) * (this.geo ? 2.9 : 2.1)));
    // Em pé, o mapa por regiões abre sobre o Atlântico (Américas, Europa e África à vista).
    const narrow = this.geo && freeW / k < this.projection.width * 0.6;
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

  /** Enquadra um país inteiro na área livre do HUD. */
  flyToCountry(code: string) {
    const s = this.byId.get(code);
    if (!s) return;
    const freeW = Math.max(120, this.w - this.pad.left - this.pad.right);
    const freeH = Math.max(120, this.h - this.pad.top - this.pad.bottom);
    const bw = Math.max(4, s.box[2] - s.box[0]);
    const bh = Math.max(4, s.box[3] - s.box[1]);
    const k = Math.max(this.minK * 1.6, Math.min(this.maxK, Math.min(freeW / bw, freeH / bh) * 0.55));
    this.moveTo(
      {
        x: (s.box[0] + s.box[2]) / 2 + (this.pad.right - this.pad.left) / 2 / k,
        y: (s.box[1] + s.box[3]) / 2 + (this.pad.bottom - this.pad.top) / 2 / k,
        k,
      },
      true,
    );
  }

  /** Enquadra um conjunto de regiões na área livre do HUD. `fill` = fração da área livre ocupada. */
  flyToRegions(regionIds: string[], fill = 0.5, maxZoom = 14) {
    if (!this.geo) return;
    const { box } = this.geo.outline(regionIds);
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
  private toScreen = (lon: number, lat: number): [number, number] => {
    const [x, y] = this.projection.project(lon, lat);
    return [(x - this.cam.x) * this.cam.k + this.w / 2, (y - this.cam.y) * this.cam.k + this.h / 2];
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
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    const ratio = this.cam.k / this.minK;
    this.minK = Math.min(this.w / this.projection.width, this.h / this.projection.height);
    if (this.framed) {
      this.cam.k = this.minK * ratio;
      this.clamp(this.cam);
      this.viewChanged();
    } else this.home(false);
  }

  // ---------- seleção ----------

  /** O que está sob um ponto da tela: marcador, cidade ou país. */
  pick(sx: number, sy: number): MapPick | null {
    let near: MapPick | null = null;
    let nearD = Infinity;
    for (const p of this.pickables) {
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d <= p.r * p.r && d < nearD) [near, nearD] = [p.pick, d];
    }
    if (near) return near;
    const [wx, wy] = this.toWorld(sx, sy);
    if (this.geo) {
      for (const r of this.geo.regionList) {
        if (wx < r.box[0] || wx > r.box[2] || wy < r.box[1] || wy > r.box[3]) continue;
        if (this.probe.isPointInPath(r.path, wx, wy, 'evenodd')) return { kind: 'region', id: r.id, code: r.country };
      }
      // Ilhas minúsculas: a região mais próxima dentro de 12 px.
      const reachR = 12 / this.cam.k;
      let bestR: MapPick | null = null;
      let bestRD = reachR;
      for (const r of this.geo.regionList) {
        if (r.box[2] - r.box[0] > reachR * 3 || r.box[3] - r.box[1] > reachR * 3) continue;
        const d = Math.hypot((r.box[0] + r.box[2]) / 2 - wx, (r.box[1] + r.box[3]) / 2 - wy);
        if (d < bestRD) [bestR, bestRD] = [{ kind: 'region', id: r.id, code: r.country }, d];
      }
      return bestR;
    }
    for (const s of this.shapes) {
      if (wx < s.box[0] || wx > s.box[2] || wy < s.box[1] || wy > s.box[3]) continue;
      if (this.probe.isPointInPath(s.path, wx, wy)) return { kind: 'country', code: s.id };
    }
    // Tolerância para países minúsculos: o mais próximo dentro de 10 px.
    const reach = 10 / this.cam.k;
    let best: Shape | null = null;
    let bestD = reach;
    for (const s of this.shapes) {
      if (s.box[2] - s.box[0] > reach * 3 || s.box[3] - s.box[1] > reach * 3) continue;
      const d = Math.hypot((s.box[0] + s.box[2]) / 2 - wx, (s.box[1] + s.box[3]) / 2 - wy);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best ? { kind: 'country', code: best.id } : null;
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
        if (this.gesture.moved > 5) {
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
        const tap = this.gesture.moved <= 5 && performance.now() - this.gesture.at < 600 && e.type === 'pointerup';
        const [x, y] = local(e);
        this.gesture = null;
        if (tap) this.emit('select', this.pick(x, y));
      } else this.gesture.dist = 0;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => this.setHover(null, 0, 0));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const [x, y] = local(e);
        this.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), x, y, false);
      },
      { passive: false },
    );
    c.addEventListener('dblclick', (e) => {
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
    this.setHover(this.pick(x, y), x, y);
  }
  private setHover(pick: MapPick | null, x: number, y: number) {
    const code = pick?.kind === 'country' ? pick.code : null;
    const region = pick?.kind === 'region' ? pick.id : null;
    if (code !== this.hovered || region !== this.hoveredRegion) {
      this.hovered = code;
      this.hoveredRegion = region;
      this.invalidate();
    }
    this.canvas.style.cursor = pick ? 'pointer' : 'grab';
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

  private frame(t: number) {
    if (this.anim) {
      const p = Math.min(1, (t - this.anim.start) / this.anim.ms);
      const e = 1 - (1 - p) ** 3;
      const { from, to } = this.anim;
      this.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k * (to.k / from.k) ** e };
      if (p >= 1) this.anim = null;
      this.viewChanged();
    }
    this.effects = this.effects.filter((e) => t - e.start < (e.fx.ms ?? 1400));
    this.draw(t);
    const now = this.opts.now();
    const planting =
      this.flags.some((f) => f.plantedAt !== undefined && t - f.plantedAt < 700 && t - f.plantedAt > -3000) ||
      this.structures.some((x) => (x.completedAt !== undefined && t - x.completedAt < 900) || (x.building && now < x.building.endAt + 300));
    const filling = this.fills.some((f) => now < f.endAt + 400);
    const live = this.routes.length > 0 || this.pointsLive || this.preview !== null || Object.values(this.styles).some((s) => s.contested);
    if (this.anim || this.effects.length || planting || ((live || filling) && !this.opts.reducedMotion)) this.invalidate();
    else if (filling) window.setTimeout(() => this.invalidate(), 250);
  }

  private visible(s: { box: Box }) {
    const [x0, y0] = this.toWorld(0, 0);
    const [x1, y1] = this.toWorld(this.w, this.h);
    return s.box[2] >= x0 && s.box[0] <= x1 && s.box[3] >= y0 && s.box[1] <= y1;
  }

  private draw(t: number) {
    const { ctx, w, h, cam } = this;
    const px = 1 / cam.k;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const ocean = ctx.createLinearGradient(0, 0, 0, h);
    ocean.addColorStop(0, OCEAN_TOP);
    ocean.addColorStop(0.55, OCEAN_MID);
    ocean.addColorStop(1, OCEAN_BOTTOM);
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, w, h);
    // Luz difusa no alto: dá profundidade ao oceano sem textura.
    const sheen = ctx.createRadialGradient(w * 0.3, h * 0.12, 0, w * 0.3, h * 0.12, Math.max(w, h) * 0.8);
    sheen.addColorStop(0, 'rgba(70, 150, 255, 0.22)');
    sheen.addColorStop(1, 'rgba(70, 150, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);

    if (!this.hidden.has('graticule')) {
      ctx.strokeStyle = 'rgba(126, 168, 222, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let lon = -180; lon <= 180; lon += 30) {
        const [x] = this.toScreen(lon, 0);
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const [, y] = this.toScreen(0, lat);
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.k, cam.k);
    ctx.translate(-cam.x, -cam.y);
    ctx.lineJoin = 'round';

    // Halo costeiro e sombra: separam os continentes do oceano.
    if (this.geo) {
      // No mapa por regiões só a costa recebe o halo (o caminho de terra inclui divisas internas).
      ctx.strokeStyle = 'rgba(96, 170, 255, 0.2)';
      ctx.lineWidth = 9 * px;
      for (const c of this.geo.countryList) if (this.visible(c)) ctx.stroke(c.coast);
      ctx.strokeStyle = 'rgba(140, 200, 255, 0.16)';
      ctx.lineWidth = 3.5 * px;
      for (const c of this.geo.countryList) if (this.visible(c)) ctx.stroke(c.coast);
    } else {
      ctx.strokeStyle = 'rgba(92, 150, 230, 0.16)';
      ctx.lineWidth = 9 * px;
      ctx.stroke(this.land);
    }
    ctx.save();
    ctx.translate(0, 3 * px);
    ctx.fillStyle = 'rgba(0, 6, 20, 0.5)';
    ctx.fill(this.land, 'evenodd');
    ctx.restore();

    if (this.geo) {
      this.drawRegions(t, px);
      ctx.restore();
      this.drawOverlays(t);
      return;
    }

    const shown = this.shapes.filter((s) => this.visible(s));
    for (const s of shown) {
      const fill = this.styles[s.id]?.fill ?? this.opts.neutralFill;
      ctx.fillStyle = s.id === this.hovered && s.id !== this.selected ? mix(fill, 255, 0.16) : fill;
      ctx.fill(s.path);
    }

    // Luz de cima para baixo: dá volume sem textura de satélite.
    ctx.save();
    ctx.clip(this.land);
    const light = ctx.createLinearGradient(0, 0, 0, this.projection.height);
    light.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
    light.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
    light.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, this.projection.width, this.projection.height);
    ctx.restore();

    ctx.strokeStyle = BORDER;
    ctx.lineWidth = Math.min(1.1, 0.5 + this.zoom * 0.12) * px;
    for (const s of shown) ctx.stroke(s.path);

    const pulse = this.opts.reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(t / 380);
    for (const s of shown) {
      if (!this.styles[s.id]?.contested) continue;
      ctx.fillStyle = this.hatchPattern(px);
      ctx.fill(s.path);
      ctx.strokeStyle = `rgba(255, 86, 66, ${0.45 + 0.5 * pulse})`;
      ctx.lineWidth = 2 * px;
      ctx.stroke(s.path);
    }

    const sel = this.selected && this.byId.get(this.selected);
    if (sel) {
      ctx.save();
      ctx.shadowColor = SELECT;
      ctx.shadowBlur = 14 * this.dpr;
      ctx.strokeStyle = SELECT;
      ctx.lineWidth = 2.4 * px;
      ctx.stroke(sel.path);
      ctx.restore();
      ctx.fillStyle = 'rgba(243, 193, 75, 0.14)';
      ctx.fill(sel.path);
    }
    ctx.restore();

    this.drawOverlays(t);
  }

  /** Tudo que fica por cima do terreno, em coordenadas de tela. */
  private drawOverlays(t: number) {
    const { ctx, w, h } = this;
    this.pickables = [];
    const placed: [number, number, number, number][] = [];
    const view: MapView = { zoom: this.zoom, width: w, height: h, project: this.toScreen, ...this.center() };
    if (!this.hidden.has('routes')) this.drawRoutes(t);
    if (!this.hidden.has('cities') && !this.geo) this.drawCities(placed);
    if (!this.hidden.has('markers')) this.drawMarkers();
    if (this.geo) {
      this.drawEffects(t);
      if (!this.hidden.has('points')) this.drawPoints(t, placed);
      if (!this.hidden.has('flags')) this.drawFlags(t, placed);
      if (!this.hidden.has('structures')) this.drawStructures(t);
    }
    if (!this.hidden.has('labels')) this.drawLabels(placed);
    for (const layer of this.layers) {
      if ((layer.minZoom ?? 0) > this.zoom || (layer.maxZoom ?? Infinity) < this.zoom) continue;
      ctx.save();
      layer.draw(ctx, view);
      ctx.restore();
    }

    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vignette.addColorStop(0, 'rgba(2, 8, 22, 0)');
    vignette.addColorStop(1, 'rgba(2, 8, 22, 0.42)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  // ---------- mapa por regiões ----------

  /** Terreno, territórios, preenchimentos e fronteiras. Chamado já com a transformação de mundo. */
  private drawRegions(t: number, px: number) {
    const { ctx } = this;
    const geo = this.geo!;
    const zoom = this.zoom;
    const countries = geo.countryList.filter((c) => this.visible(c));

    ctx.fillStyle = this.opts.neutralFill;
    ctx.fill(this.land, 'evenodd');
    if (this.arena) {
      // Fora da arena o mundo apaga: só a área da partida fica com a cor do terreno.
      ctx.fillStyle = '#1f2a44';
      ctx.fill(this.land, 'evenodd');
      ctx.fillStyle = this.opts.neutralFill;
      ctx.fill(this.arena.fill, 'evenodd');
    }

    const territories = this.territories.filter((x) => this.visible(x));
    for (const terr of territories) {
      ctx.fillStyle = terr.color;
      ctx.fill(terr.fill, 'evenodd');
    }

    // Ocupações em andamento: a cor avança da origem para fora, presa ao contorno da região.
    const now = this.opts.now();
    for (const f of this.fills) {
      const r = geo.regions.get(f.region);
      if (!r || !this.visible(r)) continue;
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
      ctx.clip(r.path, 'evenodd');
      ctx.fillStyle = rgba(f.color, 0.2);
      ctx.fill(r.path, 'evenodd');
      if (p >= 1) {
        ctx.fillStyle = f.color;
        ctx.fill(r.path, 'evenodd');
      } else if (p > 0) {
        const radius = reach * p;
        ctx.beginPath();
        ctx.arc(o[0], o[1], radius, 0, TAU);
        ctx.fillStyle = f.color;
        ctx.fill();
        // Frente de avanço: faixa clara com brilho na cor da nação.
        const wave = this.opts.reducedMotion ? 0 : Math.sin(t / 260) * 0.5 + 0.5;
        ctx.lineWidth = (5 + wave * 2) * px;
        ctx.strokeStyle = rgba(f.color, 0.45);
        ctx.stroke();
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 14 * this.dpr;
        ctx.lineWidth = 2 * px;
        ctx.strokeStyle = mix(f.color, 255, 0.7);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Luz de cima para baixo: dá volume ao terreno e aos territórios.
    ctx.save();
    ctx.clip(this.land, 'evenodd');
    const light = ctx.createLinearGradient(0, 0, 0, this.projection.height);
    light.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    light.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    light.addColorStop(1, 'rgba(0, 10, 30, 0.2)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, this.projection.width, this.projection.height);
    ctx.restore();

    // Brilho interno junto à fronteira de cada território.
    for (const terr of territories) {
      ctx.save();
      ctx.clip(terr.fill, 'evenodd');
      ctx.strokeStyle = mix(terr.color, 255, 0.55);
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = Math.min(9, 4 + zoom) * px;
      ctx.stroke(terr.frontier);
      ctx.restore();
    }

    if (this.hints && this.visible(this.hints)) {
      ctx.fillStyle = rgba(this.hints.color, 0.13);
      ctx.fill(this.hints.path, 'evenodd');
    }
    if (this.hoveredRegion && this.hoveredRegion !== this.selectedRegion) {
      const r = geo.regions.get(this.hoveredRegion);
      if (r) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill(r.path, 'evenodd');
      }
    }

    // Linhas: divisas internas (só de perto), divisas entre países e costa.
    if (zoom >= 1.7) {
      ctx.strokeStyle = `rgba(8, 16, 34, ${Math.min(0.42, 0.14 + zoom * 0.035)})`;
      ctx.lineWidth = 0.7 * px;
      for (const c of countries) ctx.stroke(c.internal);
    }
    ctx.strokeStyle = 'rgba(6, 12, 28, 0.78)';
    ctx.lineWidth = Math.min(1.5, 0.75 + zoom * 0.1) * px;
    for (const c of countries) ctx.stroke(c.national);
    ctx.strokeStyle = 'rgba(150, 196, 255, 0.5)';
    ctx.lineWidth = 0.8 * px;
    for (const c of countries) ctx.stroke(c.coast);

    // Fronteira de cada território: contorno escuro por fora, linha viva por dentro.
    ctx.lineCap = 'round';
    for (const terr of territories) {
      ctx.strokeStyle = 'rgba(4, 10, 24, 0.85)';
      ctx.lineWidth = (terr.own ? 3.6 : 3) * px;
      ctx.stroke(terr.frontier);
      ctx.strokeStyle = mix(terr.color, 255, terr.own ? 0.5 : 0.25);
      ctx.lineWidth = (terr.own ? 1.7 : 1.2) * px;
      ctx.stroke(terr.frontier);
    }

    if (this.arena) {
      ctx.save();
      ctx.shadowColor = 'rgba(255, 214, 102, 0.8)';
      ctx.shadowBlur = 8 * this.dpr;
      ctx.strokeStyle = 'rgba(255, 214, 102, 0.85)';
      ctx.lineWidth = 2 * px;
      ctx.setLineDash([9 * px, 5 * px]);
      ctx.stroke(this.arena.frontier);
      ctx.restore();
    }

    if (this.hints && this.visible(this.hints)) {
      ctx.setLineDash([5 * px, 4 * px]);
      ctx.strokeStyle = mix(this.hints.color, 255, 0.55);
      ctx.lineWidth = 1.4 * px;
      ctx.stroke(this.hints.path);
      ctx.setLineDash([]);
    }

    if (this.preview) {
      const pulse = this.opts.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t / 420);
      ctx.fillStyle = rgba(this.preview.color, 0.34 + 0.16 * pulse);
      ctx.fill(this.preview.path, 'evenodd');
      ctx.setLineDash([6 * px, 5 * px]);
      ctx.lineDashOffset = this.opts.reducedMotion ? 0 : (-t / 40) * px;
      ctx.strokeStyle = mix(this.preview.color, 255, 0.6);
      ctx.lineWidth = 2 * px;
      ctx.stroke(this.preview.path);
      ctx.setLineDash([]);
    }

    const sel = this.selectedRegion && geo.regions.get(this.selectedRegion);
    if (sel) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fill(sel.path, 'evenodd');
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 10 * this.dpr;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * px;
      ctx.stroke(sel.path);
      ctx.restore();
    }

    // Conquista: clarão sobre a região recém-ocupada.
    for (const e of this.effects) {
      if (e.fx.kind !== 'conquest') continue;
      const r = geo.regions.get(e.fx.region);
      if (!r) continue;
      const p = clamp01((t - e.start) / (e.fx.ms ?? 1400));
      ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * (1 - p) ** 2})`;
      ctx.fill(r.path, 'evenodd');
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * (1 - p)})`;
      ctx.lineWidth = (1.5 + 3 * (1 - p)) * px;
      ctx.stroke(r.path);
    }
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
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + i * 1.7;
          const d = (18 + (i % 4) * 9) * out;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d - 10 * out, 2.2 * (1 - p), 0, TAU);
          ctx.fillStyle = i % 3 ? mix(e.fx.color, 255, 0.5) : '#ffffff';
          ctx.globalAlpha = 1 - p;
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
  private drawPoints(t: number, placed: [number, number, number, number][]) {
    const { ctx } = this;
    const z = this.zoom;
    const base = Math.max(1.9, Math.min(4.2, 1.5 + z * 0.55));
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
      ctx.font = `${selected ? 700 : 600} ${selected ? 13 : 11}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      const tw = ctx.measureText(p.label).width;
      const box: [number, number, number, number] = [x - tw / 2 - 3, y + r + 4, x + tw / 2 + 3, y + r + 19];
      if (!selected && !this.free(placed, box)) continue;
      if (selected) placed.push(box);
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

  /** Construções: selos com ícone abaixo do ponto da região; obra mostra progresso, conclusão dá um salto. */
  private drawStructures(t: number) {
    const { ctx } = this;
    const z = this.zoom;
    const now = this.opts.now();
    const R = Math.max(9, Math.min(13, 7 + z * 0.9));
    const gap = R * 2 + 4;
    for (const s of this.structures) {
      if (s.minZoom !== undefined && z < s.minZoom && !s.building && !(s.completedAt !== undefined && t - s.completedAt < 3000)) continue;
      const [ax, ay] = this.toScreen(s.anchor[0], s.anchor[1]);
      const x = ax + (s.slot - (s.slots - 1) / 2) * gap;
      const y = ay + R + 8;
      if (x < -30 || x > this.w + 30 || y < -30 || y > this.h + 30) continue;
      const pop = s.completedAt === undefined ? 1 : this.opts.reducedMotion ? 1 : easeBack(clamp01((t - s.completedAt) / 520));
      const r = R * (s.completedAt !== undefined && t - s.completedAt < 520 ? 0.4 + 0.6 * pop : 1);
      const building = s.building && now < s.building.endAt ? s.building : null;
      ctx.save();
      ctx.globalAlpha = building && s.level === 0 ? 0.82 : 1;
      ctx.beginPath();
      ctx.arc(x, y + 1.5, r + 1, 0, TAU);
      ctx.fillStyle = 'rgba(0, 6, 20, 0.45)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      const face = ctx.createLinearGradient(x, y - r, x, y + r);
      face.addColorStop(0, '#1b2f57');
      face.addColorStop(1, '#0a1530');
      ctx.fillStyle = face;
      ctx.fill();
      ctx.lineWidth = s.own ? 2.2 : 1.6;
      ctx.strokeStyle = s.color;
      ctx.stroke();
      // Ícone em traço branco.
      const k = (r * 1.25) / 24;
      ctx.translate(x - 12 * k, y - 12 * k);
      ctx.scale(k, k);
      ctx.lineWidth = 2 / Math.max(0.4, k);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#f2f7ff';
      ctx.stroke(this.glyph(s.glyph));
      ctx.restore();
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
        ctx.font = '800 9px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
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

  /** Bandeiras fincadas: mastro, pano com a imagem e, de perto, o nome. */
  private drawFlags(t: number, placed: [number, number, number, number][]) {
    const { ctx } = this;
    const z = this.zoom;
    const names: { text: string; x: number; y: number }[] = [];
    // Bandeiras sem zoom mínimo (capitais, países) primeiro: elas e seus nomes têm prioridade de espaço.
    const ordered = [...this.flags].sort((a, b) => Number(a.minZoom !== undefined) - Number(b.minZoom !== undefined));
    ctx.font = '700 11.5px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
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
      // Sombra no chão e mastro.
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
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 0.5, top, cw, fh);
        ctx.clip();
        if (f.image) ctx.drawImage(f.image, x + 0.5, top, fw, fh);
        else {
          ctx.fillStyle = f.color;
          ctx.fillRect(x + 0.5, top, fw, fh);
        }
        const shade = ctx.createLinearGradient(x, top, x + fw, top);
        shade.addColorStop(0, 'rgba(0, 0, 0, 0.18)');
        shade.addColorStop(0.35, 'rgba(255, 255, 255, 0.14)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
        ctx.fillStyle = shade;
        ctx.fillRect(x + 0.5, top, fw, fh);
        ctx.restore();
        ctx.strokeStyle = 'rgba(4, 10, 24, 0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, top + 0.5, cw, fh - 1);
      }
      this.pickables.push({ x: x + fw / 2, y: y - pole / 2, r: Math.max(16, fw * 0.8), pick: { kind: 'flag', id: f.id } });
      placed.push([x - 4, y - pole - 2, x + fw + 3, y + 3]);
      if (f.label && z >= 2.2 && rise >= 1) {
        const tw = ctx.measureText(f.label).width;
        if (this.free(placed, [x - tw / 2 - 3, y + 4, x + tw / 2 + 3, y + 19])) names.push({ text: f.label, x, y });
      }
    }
    // Nomes desenhados por último, para nenhuma bandeira vizinha cobri-los.
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

  private center() {
    const [lon, lat] = this.projection.unproject(this.cam.x, this.cam.y);
    return { lon, lat };
  }

  private hatchPattern(px: number): CanvasPattern {
    if (!this.hatch) {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 8;
      const c = tile.getContext('2d')!;
      c.strokeStyle = 'rgba(8, 10, 16, 0.55)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-2, 10);
      c.lineTo(10, -2);
      c.moveTo(-6, 6);
      c.lineTo(6, -6);
      c.moveTo(2, 14);
      c.lineTo(14, 2);
      c.stroke();
      this.hatch = this.ctx.createPattern(tile, 'repeat')!;
    }
    this.hatch.setTransform(new DOMMatrix().scale(px));
    return this.hatch;
  }

  private free(placed: [number, number, number, number][], box: [number, number, number, number]) {
    for (const p of placed) if (box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1]) return false;
    placed.push(box);
    return true;
  }

  private drawLabels(placed: [number, number, number, number][]) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const l of this.labels) {
      const s = this.byId.get(l.code);
      if (!s || !this.visible(s)) continue;
      const bw = (s.box[2] - s.box[0]) * this.cam.k;
      const bh = (s.box[3] - s.box[1]) * this.cam.k;
      const size = Math.max(10, Math.min(16, Math.sqrt(bw * bh) / 9));
      ctx.font = `600 ${size}px "Barlow Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`;
      const text = l.text.toUpperCase();
      const tw = ctx.measureText(text).width + size * 0.08 * text.length;
      if (tw > bw * 0.92 || size + 4 > bh) continue;
      const [x, y] = this.toScreen(l.at[0], l.at[1]);
      if (x < -tw || x > this.w + tw || y < -20 || y > this.h + 20) continue;
      if (!this.free(placed, [x - tw / 2 - 3, y - size / 2 - 2, x + tw / 2 + 3, y + size / 2 + 2])) continue;
      ctx.strokeStyle = this.geo ? 'rgba(5, 12, 28, 0.45)' : 'rgba(5, 9, 16, 0.7)';
      ctx.lineWidth = 3;
      ctx.fillStyle = l.code === this.selected ? '#ffe9a8' : this.geo ? 'rgba(226, 238, 255, 0.62)' : 'rgba(240, 245, 252, 0.92)';
      if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${size * 0.08}px`;
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  }

  /** Cidades aparecem por nível de zoom: capitais primeiro, depois as demais por relevância. */
  private drawCities(placed: [number, number, number, number][]) {
    const z = this.zoom;
    if (z < 2.6) return;
    const { ctx } = this;
    const maxRank = z < 5 ? -1 : z < 9 ? 2 : z < 16 ? 4 : 99;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '500 11px system-ui, sans-serif';
    for (const c of this.cities) {
      if (!c.k && c.r > maxRank) continue;
      const [x, y] = this.toScreen(c.x, c.y);
      if (x < -10 || x > this.w + 10 || y < -10 || y > this.h + 10) continue;
      if (!this.free(placed, [x - 5, y - 5, x + 5, y + 5])) continue;
      const r = c.k ? 3.4 : 2.4;
      ctx.beginPath();
      if (c.k) ctx.rect(x - r, y - r, r * 2, r * 2);
      else ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = c.k ? '#f4f6fa' : 'rgba(232, 238, 248, 0.85)';
      ctx.strokeStyle = 'rgba(5, 9, 16, 0.9)';
      ctx.lineWidth = 1.2;
      ctx.fill();
      ctx.stroke();
      this.pickables.push({ x, y, r: 9, pick: { kind: 'city', code: c.c, city: c } });
      if (z < (c.k ? 4.2 : 9)) continue;
      const tw = ctx.measureText(c.n).width;
      if (!this.free(placed, [x + 6, y - 7, x + 10 + tw, y + 7])) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(5, 9, 16, 0.75)';
      ctx.fillStyle = 'rgba(232, 238, 248, 0.92)';
      ctx.strokeText(c.n, x + 7, y);
      ctx.fillText(c.n, x + 7, y);
    }
  }

  private drawMarkers() {
    const { ctx } = this;
    for (const m of this.markers) {
      if ((m.minZoom ?? 0) > this.zoom) continue;
      const [x, y] = this.toScreen(m.lon, m.lat);
      if (x < -20 || x > this.w + 20 || y < -20 || y > this.h + 20) continue;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8, 14, 24, 0.88)';
      ctx.fill();
      ctx.strokeStyle = m.color ?? '#d7dee9';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#eef2f8';
      ctx.beginPath();
      if (m.kind === 'airbase' || m.kind === 'squadron') {
        ctx.moveTo(x, y - 5.5);
        ctx.lineTo(x + 5, y + 4);
        ctx.lineTo(x, y + 1.5);
        ctx.lineTo(x - 5, y + 4);
      } else if (m.kind === 'port' || m.kind === 'fleet') {
        ctx.moveTo(x - 5.5, y);
        ctx.lineTo(x + 5.5, y);
        ctx.lineTo(x + 3.2, y + 4);
        ctx.lineTo(x - 3.2, y + 4);
        ctx.rect(x - 1, y - 5, 2, 5);
      } else if (m.kind === 'army') {
        ctx.moveTo(x - 5, y + 3);
        ctx.lineTo(x, y - 5);
        ctx.lineTo(x + 5, y + 3);
        ctx.lineTo(x, y);
      } else if (m.kind === 'base') {
        ctx.rect(x - 4.5, y - 1, 9, 5);
        ctx.rect(x - 2, y - 5, 4, 4);
      } else ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
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
      const p = Math.max(0, Math.min(1, (now - r.departAt) / Math.max(1, r.arriveAt - r.departAt)));
      const x = x0 + (x1 - x0) * p;
      const y = y0 + (y1 - y0) * p;
      const a = Math.atan2(y1 - y0, x1 - x0);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(5, 9, 16, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, 6);
      ctx.lineTo(-2.5, 0);
      ctx.lineTo(-6, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Silhueta de um país num canvas externo (miniatura de painel). Não depende da câmera. */
  renderThumbnail(code: string, target: HTMLCanvasElement, fill: string) {
    const s = this.byId.get(code);
    const c = target.getContext('2d');
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = target.clientWidth || target.width;
    const h = target.clientHeight || target.height;
    target.width = Math.round(w * dpr);
    target.height = Math.round(h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, OCEAN_TOP);
    bg.addColorStop(1, OCEAN_BOTTOM);
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    if (!s) return;
    const bw = Math.max(1, s.box[2] - s.box[0]);
    const bh = Math.max(1, s.box[3] - s.box[1]);
    const k = Math.min((w - 14) / bw, (h - 14) / bh);
    c.translate(w / 2, h / 2);
    c.scale(k, k);
    c.translate(-(s.box[0] + s.box[2]) / 2, -(s.box[1] + s.box[3]) / 2);
    c.lineJoin = 'round';
    c.fillStyle = 'rgba(120, 140, 170, 0.22)';
    c.fill(this.land);
    c.fillStyle = fill;
    c.fill(s.path);
    c.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    c.lineWidth = 1.2 / k;
    c.stroke(s.path);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.canvas.remove();
    for (const set of Object.values(this.listeners)) set.clear();
  }
}
