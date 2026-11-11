import { millerProjection, type Projection } from './projection';
import type {
  BuiltinLayer,
  CountryStyle,
  GeoData,
  MapCity,
  MapEvents,
  MapLabel,
  MapLayer,
  MapMarker,
  MapOptions,
  MapPick,
  MapRoute,
  MapView,
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

const OCEAN_TOP = '#0b1a2e';
const OCEAN_BOTTOM = '#060d18';
const BORDER = 'rgba(6, 11, 20, 0.9)';
const SELECT = '#f3c14b';

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
    c.y = halfH * 2 >= height ? height / 2 : Math.max(halfH, Math.min(height - halfH, c.y));
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
    this.anim = { from: { ...this.cam }, to, start: performance.now(), ms: 420 };
    this.invalidate();
  }

  /** Visão inicial: mundo habitado enquadrado na área livre do HUD. */
  home(animate = true) {
    const freeW = Math.max(120, this.w - this.pad.left - this.pad.right);
    const freeH = Math.max(120, this.h - this.pad.top - this.pad.bottom);
    const [, top] = this.projection.project(0, 80);
    const [, bottom] = this.projection.project(0, -58);
    // Em telas em pé o mundo inteiro ficaria minúsculo: mostra cerca de metade da largura e deixa arrastar.
    const k = Math.max(this.minK, Math.min(freeH / (bottom - top), (freeW / this.projection.width) * 2.1));
    const cx = this.projection.width / 2 + (this.pad.right - this.pad.left) / 2 / k;
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
    for (let i = this.pickables.length - 1; i >= 0; i--) {
      const p = this.pickables[i];
      if ((p.x - sx) ** 2 + (p.y - sy) ** 2 <= p.r * p.r) return p.pick;
    }
    const [wx, wy] = this.toWorld(sx, sy);
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
    if (code !== this.hovered) {
      this.hovered = code;
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
    this.draw(t);
    const live = this.routes.length > 0 || Object.values(this.styles).some((s) => s.contested);
    if (this.anim || (live && !this.opts.reducedMotion)) this.invalidate();
  }

  private visible(s: Shape) {
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
    ocean.addColorStop(1, OCEAN_BOTTOM);
    ctx.fillStyle = ocean;
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
    ctx.strokeStyle = 'rgba(92, 150, 230, 0.16)';
    ctx.lineWidth = 9 * px;
    ctx.stroke(this.land);
    ctx.save();
    ctx.translate(0, 3 * px);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill(this.land);
    ctx.restore();

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

    this.pickables = [];
    const placed: [number, number, number, number][] = [];
    const view: MapView = { zoom: this.zoom, width: w, height: h, project: this.toScreen, ...this.center() };
    if (!this.hidden.has('routes')) this.drawRoutes(t);
    if (!this.hidden.has('cities')) this.drawCities(placed);
    if (!this.hidden.has('markers')) this.drawMarkers();
    if (!this.hidden.has('labels')) this.drawLabels(placed);
    for (const layer of this.layers) {
      if ((layer.minZoom ?? 0) > this.zoom || (layer.maxZoom ?? Infinity) < this.zoom) continue;
      ctx.save();
      layer.draw(ctx, view);
      ctx.restore();
    }

    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
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
      ctx.strokeStyle = 'rgba(5, 9, 16, 0.7)';
      ctx.lineWidth = 3;
      ctx.fillStyle = l.code === this.selected ? '#ffe9a8' : 'rgba(240, 245, 252, 0.92)';
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
