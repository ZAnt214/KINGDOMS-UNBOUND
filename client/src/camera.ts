/**
 * Câmera 2D com arraste, pinça (centrada nos dedos), roda do mouse e toque/clique.
 * Coordenadas "world" são pixels isométricos no zoom 1.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  private pointers = new Map<number, { x: number; y: number }>();
  private down: { x: number; y: number; t: number; moved: boolean } | null = null;
  private pinchDist = 0;
  private vx = 0;
  private vy = 0;
  private lastMove = 0;
  private raf = 0;

  constructor(
    private el: HTMLElement,
    public minZoom: number,
    public maxZoom: number,
    private onChange: () => void,
    private onTap: (sx: number, sy: number) => void,
  ) {
    el.addEventListener('pointerdown', this.pd);
    el.addEventListener('pointermove', this.pm);
    el.addEventListener('pointerup', this.pu);
    el.addEventListener('pointercancel', this.pu);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.style.touchAction = 'none';
  }

  destroy() {
    this.el.removeEventListener('pointerdown', this.pd);
    this.el.removeEventListener('pointermove', this.pm);
    this.el.removeEventListener('pointerup', this.pu);
    this.el.removeEventListener('pointercancel', this.pu);
    this.el.removeEventListener('wheel', this.wheel);
    cancelAnimationFrame(this.raf);
  }

  toScreen(wx: number, wy: number) {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    return { x: (wx - this.x) * this.zoom + w / 2, y: (wy - this.y) * this.zoom + h / 2 };
  }

  toWorld(sx: number, sy: number) {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    return { x: (sx - w / 2) / this.zoom + this.x, y: (sy - h / 2) / this.zoom + this.y };
  }

  centerOn(wx: number, wy: number) {
    this.x = wx;
    this.y = wy;
    this.vx = this.vy = 0;
    this.onChange();
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.onChange();
  }

  private local(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private pd = (e: PointerEvent) => {
    this.el.setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    cancelAnimationFrame(this.raf);
    this.vx = this.vy = 0;
    if (this.pointers.size === 1) this.down = { ...p, t: performance.now(), moved: false };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.down) this.down.moved = true;
    }
  };

  private pm = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const p = this.local(e);
    if (this.pointers.size === 1) {
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      this.x -= dx / this.zoom;
      this.y -= dy / this.zoom;
      const now = performance.now();
      const dt = Math.max(1, now - this.lastMove);
      this.vx = (-dx / this.zoom / dt) * 16;
      this.vy = (-dy / this.zoom / dt) * 16;
      this.lastMove = now;
      if (this.down && Math.hypot(p.x - this.down.x, p.y - this.down.y) > 8) this.down.moved = true;
      this.pointers.set(e.pointerId, p);
      this.onChange();
    } else if (this.pointers.size === 2) {
      this.pointers.set(e.pointerId, p);
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.pinchDist > 0) this.zoomAt(mid.x, mid.y, dist / this.pinchDist);
      this.pinchDist = dist;
    }
  };

  private pu = (e: PointerEvent) => {
    const had = this.pointers.delete(e.pointerId);
    if (!had) return;
    if (this.pointers.size === 0) {
      const d = this.down;
      this.down = null;
      if (d && !d.moved && performance.now() - d.t < 500) {
        const p = this.local(e);
        this.onTap(p.x, p.y);
        return;
      }
      if (performance.now() - this.lastMove < 60) this.coast();
    } else if (this.pointers.size === 1) {
      this.pinchDist = 0;
    }
  };

  /** Inércia moderada após soltar o arraste. */
  private coast() {
    const step = () => {
      this.vx *= 0.9;
      this.vy *= 0.9;
      if (Math.abs(this.vx) + Math.abs(this.vy) < 0.05) return;
      this.x += this.vx;
      this.y += this.vy;
      this.onChange();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = { x: e.offsetX, y: e.offsetY };
    this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  };
}

/** Ajusta o canvas para o devicePixelRatio (limitado a 2 por memória no iPhone). */
export function fitCanvas(canvas: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  return dpr;
}
