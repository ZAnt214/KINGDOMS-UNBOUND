// Kit de ilustração isométrica em SVG. Cada sprite é desenhado em coordenadas de
// mundo (tiles x,y no chão e z em pixels para cima) com origem no ponto de ancoragem
// do objeto. Faces recebem matrizes afins, então padrões (tijolos, telhas, tábuas)
// e detalhes (janelas, portas) ficam na perspectiva correta da face.

export const HW = 64; // meia largura do tile em px de mundo
export const HH = 32; // meia altura do tile
export const L = Math.hypot(HW, HH); // comprimento em tela de 1 tile ao longo de um eixo

export type V = [number, number];
export const iso = (x: number, y: number, z = 0): V => [(x - y) * HW, (x + y) * HH - z];

const f = (n: number) => (Math.round(n * 100) / 100).toString();
const pts = (p: V[]) => p.map((q) => `${f(q[0])},${f(q[1])}`).join(' ');

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `#${((1 << 24) | (c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).slice(1)}`;
}

/** PRNG determinístico para variação de detalhes sem alterar a arte entre recargas. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export interface Material {
  fill: string; // cor ou url(#padrão)
  base: string; // cor base (para sombreamento e arestas)
}

export class Svg {
  private defs: string[] = [];
  private body: string[] = [];
  private ids = 0;
  private cache = new Map<string, string>();
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  constructor(private prefix = 's') {}

  uid(name: string) {
    return `${this.prefix}${name}${this.ids++}`;
  }

  extend(x: number, y: number) {
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }

  extendPts(p: V[]) {
    for (const q of p) this.extend(q[0], q[1]);
  }

  def(key: string, build: (id: string) => string): string {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const id = this.uid('d');
    this.defs.push(build(id));
    this.cache.set(key, id);
    return id;
  }

  raw(s: string) {
    this.body.push(s);
  }

  poly(p: V[], fill: string, extra = '') {
    this.extendPts(p);
    this.body.push(`<polygon points="${pts(p)}" fill="${fill}" ${extra}/>`);
  }

  path(d: string, fill: string, extra = '') {
    this.body.push(`<path d="${d}" fill="${fill}" ${extra}/>`);
  }

  line(a: V, b: V, stroke: string, w: number, extra = '') {
    this.extendPts([a, b]);
    this.body.push(
      `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${stroke}" stroke-width="${f(w)}" stroke-linecap="round" ${extra}/>`,
    );
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, extra = '') {
    this.extend(cx - rx, cy - ry);
    this.extend(cx + rx, cy + ry);
    this.body.push(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" ${extra}/>`);
  }

  group(transform: string, inner: (g: Svg) => void, extra = '') {
    const sub = new Svg(this.prefix);
    sub.ids = this.ids;
    sub.cache = this.cache;
    sub.defs = this.defs;
    inner(sub);
    this.ids = sub.ids;
    this.body.push(`<g transform="${transform}" ${extra}>${sub.body.join('')}</g>`);
  }

  // ---- materiais (padrões em coordenadas locais da face) ----

  /** Silhar de granito irregular: fiadas de alturas variadas, rejunte escuro, manchas. */
  stone(color: string, scale = 1): Material {
    const id = this.def(`stone${color}${scale}`, (id) => {
      const w=64*scale, h=36*scale;
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${color}"/><path d="M0 0 H${w} M0 ${h/2} H${w} M${w/2} 0 V${h/2} M0 ${h/2} V${h}" fill="none" stroke="${shade(color,-.18)}" stroke-width="${.85*scale}"/><path d="M0 1 H${w} M0 ${h/2+1} H${w}" stroke="${shade(color,.2)}" stroke-width="${.8*scale}"/></pattern>`;
    });
    return { fill: `url(#${id})`, base: color };
  }

  /** Palha escura para telhados de camponeses. */
  thatch(color: string): Material {
    const id = this.def(`thatch${color}`, (id) => {
      const r = rng(color.length * 53 + 9);
      const out: string[] = [];
      for (let i = 0; i < 40; i++) {
        const x = r() * 40;
        const y = r() * 24;
        out.push(`<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + (r() - 0.5) * 3)}" y2="${f(y + 6 + r() * 4)}" stroke="${shade(color, (r() - 0.5) * 0.35)}" stroke-width="1.2"/>`);
      }
      out.push(`<rect y="0" width="40" height="1.6" fill="${shade(color, -0.4)}" opacity="0.6"/>`);
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="40" height="12" patternTransform="scale(1,-1)"><rect width="40" height="12" fill="${color}"/>${out.join('')}</pattern>`;
    });
    return { fill: `url(#${id})`, base: color };
  }

  plaster(color: string): Material {
    const id = this.def(`plaster${color}`, (id) => {
      const r = rng(color.length * 31 + 7);
      const dots: string[] = [];
      for (let i = 0; i < 14; i++) {
        dots.push(
          `<circle cx="${f(r() * 40)}" cy="${f(r() * 40)}" r="${f(0.6 + r() * 1.4)}" fill="${shade(color, (r() - 0.6) * 0.16)}"/>`,
        );
      }
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="40" height="40"><rect width="40" height="40" fill="${color}"/>${dots.join('')}</pattern>`;
    });
    return { fill: `url(#${id})`, base: color };
  }

  planks(color: string, vertical = true): Material {
    const id = this.def(`planks${color}${vertical}`, (id) => {
      const r = rng(color.length * 13 + (vertical ? 1 : 2));
      const boards: string[] = [];
      for (let i = 0; i < 4; i++) {
        const tone = shade(color, (r() - 0.5) * 0.16);
        boards.push(
          vertical
            ? `<rect x="${i * 8 + 0.5}" y="0" width="7" height="48" fill="${tone}"/><rect x="${i * 8 + 1.5}" y="${f(r() * 40)}" width="1.2" height="5" fill="${shade(tone, -0.25)}"/>`
            : `<rect x="0" y="${i * 8 + 0.5}" width="48" height="7" fill="${tone}"/>`,
        );
      }
      const w = vertical ? 32 : 48;
      const h = vertical ? 48 : 32;
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${shade(color, -0.4)}"/>${boards.join('')}</pattern>`;
    });
    return { fill: `url(#${id})`, base: color };
  }

  /** Telhas cerâmicas em fileiras escalonadas; v cresce do beiral para a cumeeira. */
  tiles(color: string): Material {
    const id = this.def(`tiles${color}`, (id) => {
      const w = 11;
      const h = 9;
      const rows: string[] = [];
      const r = rng(color.length * 101 + 3);
      for (let row = 0; row < 2; row++) {
        const off = row ? w / 2 : 0;
        for (let i = -1; i < 3; i++) {
          const tone = shade(color, (r() - 0.5) * 0.2);
          const x = off + i * w;
          const y = row * h;
          rows.push(
            `<path d="M${f(x)} ${f(y)} h${w} v${f(h * 0.55)} q0 ${f(h * 0.5)} ${f(-w / 2)} ${f(h * 0.5)} q${f(-w / 2)} 0 ${f(-w / 2)} ${f(-h * 0.5)} z" fill="${tone}" stroke="${shade(color, -0.45)}" stroke-width="0.7"/>`,
          );
          rows.push(`<rect x="${f(x + 1.5)}" y="${f(y + 1)}" width="1.6" height="${f(h * 0.6)}" fill="${shade(tone, 0.25)}" opacity="0.6"/>`);
        }
      }
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${w * 2}" height="${h * 2}" patternTransform="scale(1,-1)"><rect width="${w * 2}" height="${h * 2}" fill="${shade(color, -0.5)}"/>${rows.join('')}</pattern>`;
    });
    return { fill: `url(#${id})`, base: color };
  }

  linear(key: string, stops: [number, string, number?][], x2 = 0, y2 = 1): string {
    const id = this.def(`lin${key}`, (id) => {
      const s = stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a ?? 1}"/>`).join('');
      return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${s}</linearGradient>`;
    });
    return `url(#${id})`;
  }

  radial(key: string, stops: [number, string, number?][]): string {
    const id = this.def(`rad${key}`, (id) => {
      const s = stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a ?? 1}"/>`).join('');
      return `<radialGradient id="${id}">${s}</radialGradient>`;
    });
    return `url(#${id})`;
  }

  blur(sd: number): string {
    const id = this.def(`blur${sd}`, (id) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`);
    return `url(#${id})`;
  }

  // ---- geometria isométrica ----

  /** Matriz que leva coordenadas locais (u→direita da face, v→para cima) à face. */
  static faceMatrix(o: V, u: V, v: V) {
    return `matrix(${f(u[0])} ${f(u[1])} ${f(v[0])} ${f(v[1])} ${f(o[0])} ${f(o[1])})`;
  }

  /** Face voltada a +y (esquerda na tela, iluminada). Local: u em px ao longo de x; y negativo sobe. */
  leftFace(x0: number, x1: number, y: number, z0: number, draw: (g: Svg, w: number) => void) {
    const o = iso(x0, y, z0);
    this.group(Svg.faceMatrix(o, [HW / L, HH / L], [0, 1]), (g) => draw(g, (x1 - x0) * L));
  }

  /** Face voltada a +x (direita na tela, à sombra). Local: u da quina frontal para a direita; y negativo sobe. */
  rightFace(x: number, y0: number, y1: number, z0: number, draw: (g: Svg, w: number) => void) {
    const o = iso(x, y1, z0);
    this.group(Svg.faceMatrix(o, [HW / L, -HH / L], [0, 1]), (g) => draw(g, (y1 - y0) * L));
  }

  /** Face superior. Local: u ao longo de x, v ao longo de y (px). */
  topFace(x0: number, y0: number, x1: number, y1: number, z: number, draw: (g: Svg, w: number, d: number) => void) {
    const o = iso(x0, y0, z);
    this.group(Svg.faceMatrix(o, [HW / L, HH / L], [-HW / L, HH / L]), (g) => draw(g, (x1 - x0) * L, (y1 - y0) * L));
  }

  /** Caixa com material por face e sombreamento de luz vinda do alto à esquerda. */
  box(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z0: number,
    z1: number,
    side: Material,
    top: Material | null,
    opts: { left?: (g: Svg, w: number, h: number) => void; right?: (g: Svg, w: number, h: number) => void; edge?: boolean } = {},
  ) {
    const h = z1 - z0;
    this.extendPts([iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y0, z0), iso(x0, y0, z1), iso(x1, y0, z1), iso(x0, y1, z1)]);
    const shR = this.linear('shR', [[0, '#28435c', 0.29], [1, '#28435c', 0.16]]);
    const shL = this.linear('shL', [[0, '#7d6c4c', 0.08], [0.35, '#fff6d8', 0.1], [1, '#fff6d8', 0.2]]);
    // face direita (x = x1), à sombra
    this.rightFace(x1, y0, y1, z0, (g, w) => {
      g.raw(`<rect x="0" y="${f(-h)}" width="${f(w)}" height="${f(h)}" fill="${side.fill}"/>`);
      opts.right?.(g, w, h);
      g.raw(`<rect x="0" y="${f(-h)}" width="${f(w)}" height="${f(h)}" fill="${shR}"/>`);
    });
    // face esquerda (y = y1), iluminada
    this.leftFace(x0, x1, y1, z0, (g, w) => {
      g.raw(`<rect x="0" y="${f(-h)}" width="${f(w)}" height="${f(h)}" fill="${side.fill}"/>`);
      opts.left?.(g, w, h);
      g.raw(`<rect x="0" y="${f(-h)}" width="${f(w)}" height="${f(h)}" fill="${shL}"/>`);
    });
    if (top) {
      this.topFace(x0, y0, x1, y1, z1, (g, w, d) => {
        g.raw(`<rect x="0" y="0" width="${f(w)}" height="${f(d)}" fill="${top.fill}"/>`);
        g.raw(`<rect x="0" y="0" width="${f(w)}" height="${f(d)}" fill="#fff6dc" opacity="0.1"/>`);
      });
    }
    if (opts.edge !== false) {
      this.line(iso(x1, y1, z0), iso(x1, y1, z1), shade(side.base, 0.3), 1.2, 'opacity="0.5"');
      if (top) this.line(iso(x0, y1, z1), iso(x1, y1, z1), shade(side.base, 0.35), 1, 'opacity="0.45"');
    }
  }

  /** Telhado de duas águas. axis 'x': cumeeira ao longo de x (água frontal voltada a +y). */
  gable(x0: number, y0: number, x1: number, y1: number, zE: number, rise: number, mat: Material, axis: 'x' | 'y', gableEnd: Material, ov = 0.18) {
    // Beiral só nas águas; nas empenas o telhado acompanha a parede (com prancha de borda).
    const a0 = axis === 'x' ? x0 : x0 - ov;
    const a1 = axis === 'x' ? x1 : x1 + ov;
    const b0 = axis === 'y' ? y0 : y0 - ov;
    const b1 = axis === 'y' ? y1 : y1 + ov;
    const zR = zE + rise;
    const ridgeColor = shade(mat.base, -0.45);
    if (axis === 'x') {
      const ym = (y0 + y1) / 2;
      // água traseira (silhueta)
      this.poly([iso(a0, b0, zE), iso(a1, b0, zE), iso(a1, ym, zR), iso(a0, ym, zR)], shade(mat.base, -0.35));
      // prancha de beiral (verga) e empena direita (x1)
      this.poly([iso(x1, b0, zE - 3), iso(x1, b1, zE - 3), iso(x1, ym, zR + 3)], shade(mat.base, -0.55));
      this.poly([iso(x1, y0, zE), iso(x1, y1, zE), iso(x1, ym, zR - 4)], gableEnd.fill);
      this.poly([iso(x1, y0, zE), iso(x1, y1, zE), iso(x1, ym, zR)], '#1a1410', 'opacity="0.38"');
      // água frontal com telhas
      const e0 = iso(a0, b1, zE);
      const r0 = iso(a0, ym, zR);
      const vLen = Math.hypot(r0[0] - e0[0], r0[1] - e0[1]);
      const front: V[] = [iso(a0, b1, zE), iso(a1, b1, zE), iso(a1, ym, zR), iso(a0, ym, zR)];
      this.poly(front, mat.base);
      this.group(Svg.faceMatrix(e0, [HW / L, HH / L], [(r0[0] - e0[0]) / vLen, (r0[1] - e0[1]) / vLen]), (g) => {
        g.raw(`<rect x="0" y="0" width="${f((a1 - a0) * L)}" height="${f(vLen)}" fill="${mat.fill}"/>`);
      });
      this.poly(front, this.linear('roofL', [[0, '#1a1410', 0.28], [0.5, '#1a1410', 0], [1, '#fff6dc', 0.14]]));
      // borda de empena (prancha) e cumeeira
      this.line(iso(a1, b1, zE), iso(a1, ym, zR), shade(mat.base, -0.55), 3.2);
      this.line(iso(a0, ym, zR), iso(a1, ym, zR), ridgeColor, 4);
      this.line(iso(a0, b1, zE), iso(a1, b1, zE), shade(mat.base, -0.5), 2.4);
    } else {
      const xm = (x0 + x1) / 2;
      this.poly([iso(a0, b0, zE), iso(a0, b1, zE), iso(xm, b1, zR), iso(xm, b0, zR)], shade(mat.base, -0.35));
      // verga e empena frontal (y1), face esquerda iluminada
      this.poly([iso(a0, y1, zE - 3), iso(a1, y1, zE - 3), iso(xm, y1, zR + 3)], shade(mat.base, -0.4));
      this.poly([iso(x0, y1, zE), iso(x1, y1, zE), iso(xm, y1, zR - 4)], gableEnd.fill);
      this.poly([iso(x0, y1, zE), iso(x1, y1, zE), iso(xm, y1, zR)], '#1a1410', 'opacity="0.08"');
      // água direita (voltada a +x) com telhas, à sombra
      const e0 = iso(a1, b1, zE);
      const r0 = iso(xm, b1, zR);
      const vLen = Math.hypot(r0[0] - e0[0], r0[1] - e0[1]);
      const side: V[] = [iso(a1, b1, zE), iso(a1, b0, zE), iso(xm, b0, zR), iso(xm, b1, zR)];
      this.poly(side, mat.base);
      this.group(Svg.faceMatrix(e0, [HW / L, -HH / L], [(r0[0] - e0[0]) / vLen, (r0[1] - e0[1]) / vLen]), (g) => {
        g.raw(`<rect x="0" y="0" width="${f((b1 - b0) * L)}" height="${f(vLen)}" fill="${mat.fill}"/>`);
      });
      this.poly(side, this.linear('roofR', [[0, '#1a1410', 0.45], [1, '#1a1410', 0.2]]));
      this.line(iso(a0, b1, zE), iso(xm, b1, zR), shade(mat.base, -0.5), 3.2);
      this.line(iso(xm, b1, zR), iso(xm, b0, zR), ridgeColor, 4);
      this.line(iso(a1, b1, zE), iso(a1, b0, zE), shade(mat.base, -0.5), 2.4);
    }
  }

  /** Telhado piramidal (torres quadradas, pavilhões). */
  pyramid(x0: number, y0: number, x1: number, y1: number, zE: number, rise: number, mat: Material, ov = 0.12) {
    const a0 = x0 - ov;
    const a1 = x1 + ov;
    const b0 = y0 - ov;
    const b1 = y1 + ov;
    const apex = iso((x0 + x1) / 2, (y0 + y1) / 2, zE + rise);
    const l: V[] = [iso(a0, b1, zE), iso(a1, b1, zE), apex];
    const r: V[] = [iso(a1, b1, zE), iso(a1, b0, zE), apex];
    this.poly(l, mat.fill);
    this.poly(l, this.linear('pyL', [[0, '#1a1410', 0.2], [1, '#fff6dc', 0.12]]));
    this.poly(r, mat.fill);
    this.poly(r, '#1a1410', 'opacity="0.42"');
    this.line(iso(a1, b1, zE), apex, shade(mat.base, -0.5), 2.2);
  }

  /** Torre cilíndrica de alvenaria. Retorna o topo (y de tela) para empilhar coroamento. */
  tower(cx: number, cy: number, r: number, z0: number, h: number, stone: string) {
    const [sx, sy] = iso(cx, cy, z0);
    const rx = r * HW * Math.SQRT2;
    const ry = r * HH * Math.SQRT2;
    const top = sy - h;
    const id = this.uid('tw');
    const body = `M${f(sx - rx)} ${f(top)} L${f(sx - rx)} ${f(sy)} A${f(rx)} ${f(ry)} 0 0 0 ${f(sx + rx)} ${f(sy)} L${f(sx + rx)} ${f(top)} Z`;
    this.extend(sx - rx, top - ry);
    this.extend(sx + rx, sy + ry);
    const mat = this.stone(stone, 0.85);
    this.raw(`<clipPath id="${id}"><path d="${body}"/></clipPath>`);
    this.raw(`<g clip-path="url(#${id})"><rect x="${f(sx - rx)}" y="${f(top - ry)}" width="${f(rx * 2)}" height="${f(h + ry * 2)}" fill="${mat.fill}"/></g>`);
    this.path(
      body,
      this.linear('cyl', [[0, '#ffd9a0', 0.14], [0.3, '#0e0c0a', 0], [0.7, '#29465d', 0.23], [1, '#29465d', 0.43]], 1, 0),
    );
    this.ellipse(sx, top, rx, ry, shade(stone, -0.1));
    return { sx, top, rx, ry };
  }

  /** Coroamento com mata-cães (balanço sobre consolos) e ameias altas. */
  crenels(sx: number, top: number, rx: number, ry: number, stone: string) {
    const ox = rx * 1.12;
    const oy = ry * 1.12;
    // consolos (mata-cães) sob o parapeito
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * (i / n);
      const x = sx - Math.cos(a) * ox;
      const y = top + 16 + Math.sin(a) * oy;
      const lit = Math.cos(a) > 0;
      this.raw(`<path d="M${f(x - 3)} ${f(y - 2)} h6 l-1.5 10 h-3 z" fill="${lit ? shade(stone, -0.1) : shade(stone, -0.45)}"/>`);
    }
    this.path(
      `M${f(sx - ox)} ${f(top)} L${f(sx - ox)} ${f(top + 16)} A${f(ox)} ${f(oy)} 0 0 0 ${f(sx + ox)} ${f(top + 16)} L${f(sx + ox)} ${f(top)} Z`,
      this.linear('par', [[0, shade(stone, 0.05)], [0.45, shade(stone, -0.15)], [1, shade(stone, -0.5)]], 1, 0),
    );
    this.ellipse(sx, top, ox, oy, shade(stone, -0.05));
    // piso do adarve em lajes de pedra
    this.ellipse(sx, top + 3, ox * 0.82, oy * 0.82, shade(stone, -0.32));
    this.ellipse(sx, top + 5, ox * 0.7, oy * 0.62, shade(stone, -0.22));
    const m = 11;
    for (let i = 0; i < m; i++) {
      const a = Math.PI * (i / (m - 1));
      const x = sx - Math.cos(a) * ox * 0.98;
      const y = top + Math.sin(a) * oy * 0.98;
      const w = ox * 0.17;
      const lit = Math.cos(a) > 0.15;
      this.raw(`<rect x="${f(x - w / 2)}" y="${f(y - 15)}" width="${f(w)}" height="15" fill="${lit ? shade(stone, 0.04) : shade(stone, -0.4)}"/>`);
      this.raw(`<rect x="${f(x - w / 2)}" y="${f(y - 15)}" width="${f(w)}" height="2.4" fill="${shade(stone, 0.18)}" opacity="0.7"/>`);
      this.extend(x, y - 16);
    }
    this.extend(sx - ox, top + oy + 26);
  }

  /** Braseiro de ferro (as chamas são partículas animadas no motor). */
  brazier(x: number, y: number) {
    this.ellipse(x + 2, y, 9, 3.5, '#0e0c0a', `opacity="0.4" filter="${this.blur(2)}"`);
    for (const dx of [-5, 0, 5]) this.line([x, y - 14], [x + dx, y], '#24201c', 2);
    this.path(`M${f(x - 9)} ${f(y - 18)} h18 l-3 6 h-12 z`, '#2f2a25');
    this.ellipse(x, y - 18, 9, 3, '#ff8a2a');
    this.ellipse(x, y - 18, 22, 14, this.radial('ember', [[0, '#ffb04a', 0.55], [1, '#ff7a1a', 0]]));
    this.extend(x - 22, y - 34);
  }

  /** Telhado cônico de torre. */
  cone(sx: number, top: number, rx: number, ry: number, rise: number, color: string) {
    const ox = rx * 1.18;
    const oy = ry * 1.18;
    const apex: V = [sx, top - rise];
    this.extend(sx - ox, apex[1]);
    this.extend(sx + ox, top + oy);
    const d = `M${f(sx - ox)} ${f(top)} A${f(ox)} ${f(oy)} 0 0 0 ${f(sx + ox)} ${f(top)} L${f(apex[0])} ${f(apex[1])} Z`;
    this.path(d, color);
    const n = 9;
    for (let i = 1; i < n; i++) {
      const a = Math.PI * (i / n);
      this.line([sx - Math.cos(a) * ox, top + Math.sin(a) * oy], apex, shade(color, -0.35), 1, 'opacity="0.6"');
    }
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      const yy = top - rise * t;
      this.path(
        `M${f(sx - ox * (1 - t))} ${f(yy)} A${f(ox * (1 - t))} ${f(oy * (1 - t))} 0 0 0 ${f(sx + ox * (1 - t))} ${f(yy)}`,
        'none',
        `stroke="${shade(color, -0.4)}" stroke-width="1" opacity="0.5"`,
      );
    }
    this.path(d, this.linear('cone', [[0, '#ffd9a0', 0.18], [0.4, '#0e0c0a', 0], [1, '#0e0c0a', 0.6]], 1, 0));
  }

  /** Estandarte de guerra: mastro com travessa, pano longo com cauda de andorinha e brasão. */
  banner(x: number, y: number, h: number, color: string, accent: string) {
    const k = Math.max(0.8, h / 40);
    this.line([x, y], [x, y - h - 6 * k], '#2a1e14', 2.6 * k);
    this.path(`M${f(x - 3 * k)} ${f(y - h - 6 * k)} l${f(3 * k)} ${f(-7 * k)} l${f(3 * k)} ${f(7 * k)} z`, '#c9a24a');
    const top = y - h;
    const w = 14 * k;
    const len = Math.min(h * 0.75, 34 * k);
    this.line([x - 1, top], [x + w + 2, top], '#2a1e14', 2 * k);
    const cloth = `M${f(x)} ${f(top)} h${f(w)} v${f(len)} l${f(-w / 2)} ${f(-6 * k)} l${f(-w / 2)} ${f(6 * k)} z`;
    this.path(cloth, color);
    this.path(cloth, this.linear('bnr', [[0, '#ffe0b0', 0.18], [0.5, '#000000', 0], [1, '#000000', 0.4]], 1, 0));
    this.path(cloth, 'none', `stroke="#c9a24a" stroke-width="${f(1.1 * k)}" opacity="0.85"`);
    // brasão: escudo com divisa
    const cx = x + w / 2;
    const cy = top + len * 0.38;
    this.path(`M${f(cx - 4 * k)} ${f(cy - 4 * k)} h${f(8 * k)} v${f(4 * k)} q0 ${f(4 * k)} ${f(-4 * k)} ${f(6 * k)} q${f(-4 * k)} ${f(-2 * k)} ${f(-4 * k)} ${f(-6 * k)} z`, accent);
    this.path(`M${f(cx - 4 * k)} ${f(cy + 1 * k)} l${f(4 * k)} ${f(-3 * k)} l${f(4 * k)} ${f(3 * k)}`, 'none', `stroke="${color}" stroke-width="${f(1.4 * k)}"`);
    this.extend(x - 4 * k, top - 14 * k);
    this.extend(x + w + 3, top + len + 2);
  }

  /** Sombra de contato + sombra projetada (luz do alto à esquerda). */
  shadow(x0: number, y0: number, x1: number, y1: number, height: number, strength = 0.32) {
    // sol baixo de fim de tarde: sombras mais longas e densas
    const k = height / 78;
    const off: [number, number] = [0.95 * k, -0.45 * k];
    const foot: V[] = [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)];
    const cast: V[] = [
      iso(x0 + off[0], y0 + off[1]),
      iso(x1 + off[0], y0 + off[1]),
      iso(x1 + off[0], y1 + off[1]),
      iso(x0 + off[0], y1 + off[1]),
    ];
    const hull = convexHull([...foot, ...cast]);
    this.extendPts(hull);
    this.poly(hull, '#0b0d08', `opacity="${Math.min(0.38, strength)}" filter="${this.blur(6)}"`);
    const pad = 0.15;
    this.poly([iso(x0 - pad, y0 - pad), iso(x1 + pad, y0 - pad), iso(x1 + pad, y1 + pad), iso(x0 - pad, y1 + pad)], '#10120a', `opacity="0.28" filter="${this.blur(4)}"`);
  }

  toString(pad = 6): { svg: string; ox: number; oy: number; w: number; h: number } {
    const x = Math.floor(this.minX - pad);
    const y = Math.floor(this.minY - pad);
    const w = Math.ceil(this.maxX + pad) - x;
    const h = Math.ceil(this.maxY + pad) - y;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"><defs>${this.defs.join('')}</defs>${this.body.join('')}</svg>`;
    return { svg, ox: -x, oy: -y, w, h };
  }
}

function convexHull(points: V[]): V[] {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: V, a: V, b: V) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: V[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: V[] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// ---- detalhes arquitetônicos desenhados em coordenadas locais de face ----

/** Janela com moldura, vidraças com luz quente, peitoril e venezianas opcionais. */
export function windowOn(g: Svg, x: number, y: number, w: number, h: number, opts: { arch?: boolean; shutters?: string; lit?: boolean; frame?: string } = {}) {
  const frame = opts.frame ?? '#3b2a1c';
  const glass = opts.lit === false ? g.linear('glassD', [[0, '#3b4a5c'], [1, '#1f2833']]) : g.linear('glassL', [[0, '#ffe3a0'], [0.55, '#f2a94c'], [1, '#a9612a']]);
  const top = y + h;
  const shape = opts.arch
    ? `M${f(x)} ${f(-y)} V${f(-(top - w / 2))} A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(x + w)} ${f(-(top - w / 2))} V${f(-y)} Z`
    : `M${f(x)} ${f(-y)} V${f(-top)} H${f(x + w)} V${f(-y)} Z`;
  if (opts.shutters) {
    const sh = opts.shutters;
    g.raw(`<rect x="${f(x - w * 0.45)}" y="${f(-top)}" width="${f(w * 0.42)}" height="${f(h)}" fill="${sh}" stroke="${shade(sh, -0.45)}" stroke-width="0.9"/>`);
    g.raw(`<rect x="${f(x + w * 1.03)}" y="${f(-top)}" width="${f(w * 0.42)}" height="${f(h)}" fill="${sh}" stroke="${shade(sh, -0.45)}" stroke-width="0.9"/>`);
  }
  g.raw(`<path d="${shape}" fill="#1c140d"/>`);
  g.raw(`<path d="${shape}" fill="${glass}" stroke="${frame}" stroke-width="2.6"/>`);
  g.raw(`<line x1="${f(x + w / 2)}" y1="${f(-y)}" x2="${f(x + w / 2)}" y2="${f(-top)}" stroke="${frame}" stroke-width="1.3"/>`);
  g.raw(`<line x1="${f(x)}" y1="${f(-(y + h * 0.5))}" x2="${f(x + w)}" y2="${f(-(y + h * 0.5))}" stroke="${frame}" stroke-width="1.1"/>`);
  g.raw(`<rect x="${f(x - 2.5)}" y="${f(-y)}" width="${f(w + 5)}" height="2.8" fill="#d6c9ac"/><rect x="${f(x - 2.5)}" y="${f(-y + 2.8)}" width="${f(w + 5)}" height="1.2" fill="#7c6f58"/>`);
}

/** Porta de madeira em arco com aduelas de pedra, cravos de ferro e degrau. */
export function doorOn(g: Svg, x: number, w: number, h: number, wood = '#6b4325', stone = '#b9ad97') {
  const r = w / 2;
  const arch = `M${f(x)} 0 V${f(-(h - r))} A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(-(h - r))} V0 Z`;
  // aduelas
  const vous: string[] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    const cx = x + r + Math.cos(a) * (r + 4);
    const cy = -(h - r) - Math.sin(a) * (r + 4);
    vous.push(`<rect x="${f(cx - 3.2)}" y="${f(cy - 3.2)}" width="6.4" height="6.4" rx="1" fill="${i % 2 ? stone : shade(stone, -0.12)}" transform="rotate(${f((-a * 180) / Math.PI + 90)} ${f(cx)} ${f(cy)})"/>`);
  }
  g.raw(vous.join(''));
  g.raw(`<path d="${arch}" fill="#22160e"/>`);
  const planks = g.planks(wood);
  g.raw(`<path d="${arch}" fill="${planks.fill}" transform="translate(${f(x + w / 2)} 0) scale(0.86 0.94) translate(${f(-(x + w / 2))} 0)"/>`);
  g.raw(`<line x1="${f(x + w / 2)}" y1="0" x2="${f(x + w / 2)}" y2="${f(-(h - 2))}" stroke="#2a1a0e" stroke-width="1.4"/>`);
  for (const yy of [0.3, 0.7]) {
    g.raw(`<rect x="${f(x + 2)}" y="${f(-h * yy - 1.5)}" width="${f(w - 4)}" height="3" fill="#3a3a3a"/>`);
  }
  g.raw(`<circle cx="${f(x + w / 2 + 3.5)}" cy="${f(-h * 0.45)}" r="1.6" fill="#c9a24a"/>`);
}

/** Enxaimel: vigas de madeira aparentes sobre reboco. */
export function timberOn(g: Svg, w: number, z0: number, h: number, color = '#2e2116') {
  const t = 3.2;
  g.raw(`<rect x="0" y="${f(-z0 - t)}" width="${f(w)}" height="${t}" fill="${color}"/>`);
  g.raw(`<rect x="0" y="${f(-(z0 + h))}" width="${f(w)}" height="${t}" fill="${color}"/>`);
  const n = Math.max(2, Math.round(w / 34));
  for (let i = 0; i <= n; i++) {
    const x = (w * i) / n;
    g.raw(`<rect x="${f(Math.min(w - t, Math.max(0, x - t / 2)))}" y="${f(-(z0 + h))}" width="${t}" height="${f(h)}" fill="${color}"/>`);
    if (i < n && i % 2 === 0) {
      const x2 = (w * (i + 1)) / n;
      g.raw(`<line x1="${f(x)}" y1="${f(-z0)}" x2="${f(x2)}" y2="${f(-(z0 + h))}" stroke="${color}" stroke-width="${t * 0.9}"/>`);
    }
  }
}
