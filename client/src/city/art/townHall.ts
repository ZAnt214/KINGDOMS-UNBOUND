import { doorOn, iso, type Material, shade, Svg, windowOn } from '../svg';

export interface Palette {
  /** Ardósia dos telhados (levemente tingida pela civilização). */
  roof: string;
  /** Cor heráldica da civilização (estandartes, brasões). */
  banner: string;
  accent: string;
  stone: string;
}

const GOLD = '#c9a24a';

/** Mistura de duas cores hex. */
export function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

export function paletteFor(civColor: string, civAccent: string): Palette {
  return { roof: mix('#3f454d', civColor, 0.22), banner: civColor, accent: civAccent, stone: '#8f8a80' };
}

/** Ameias em torno de uma caixa (lados de trás primeiro, pela ordem do pintor). */
export function squareCrenels(
  s: Svg,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  mat: Material,
  h = 16,
  part: 'all' | 'back' | 'front' = 'all',
) {
  const m = 0.15;
  const t = 0.1;
  const step = 0.34;
  const top = s.stone(shade(mat.base, 0.08), 0.6);
  const back = part !== 'front';
  const front = part !== 'back';
  // parapeito com mata-cães (balanço) nas faces visíveis
  if (back) s.box(x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, z - 14, z, mat, null, {
    left: (g, w) => {
      for (let u = 4; u < w - 4; u += 11) g.raw(`<path d="M${u} 0 h6 l-1.5 9 h-3 z" fill="#2a2620"/>`);
    },
    right: (g, w) => {
      for (let u = 4; u < w - 4; u += 11) g.raw(`<path d="M${u} 0 h6 l-1.5 9 h-3 z" fill="#1d1a16"/>`);
    },
    edge: false,
  });
  if (part === 'all') s.poly([iso(x0, y0, z), iso(x1, y0, z), iso(x1, y1, z), iso(x0, y1, z)], '#24201b');
  const along = (a0: number, a1: number, fixed: number, axis: 'x' | 'y') => {
    for (let a = a0 + 0.08; a <= a1 - m + 0.01; a += step) {
      if (axis === 'x') s.box(a, fixed - t / 2, a + m, fixed + t / 2, z, z + h, mat, top, { edge: false });
      else s.box(fixed - t / 2, a, fixed + t / 2, a + m, z, z + h, mat, top, { edge: false });
    }
  };
  if (back) {
    along(x0, x1, y0 + t / 2, 'x');
    along(y0, y1, x0 + t / 2, 'y');
  }
  if (front) {
    along(y0, y1, x1 - t / 2, 'y');
    along(x0, x1, y1 - t / 2, 'x');
  }
}

/** Guarita suspensa (bartizana) num canto, com cone de ardósia. */
function bartizan(s: Svg, x: number, y: number, z: number, stone: string, roof: string) {
  const [sx, sy] = iso(x, y, z);
  const rx = 18;
  const ry = 9;
  s.path(`M${sx - rx} ${sy} Q${sx} ${sy + 30} ${sx + rx} ${sy} Z`, shade(stone, -0.35));
  s.raw(`<rect x="${sx - rx}" y="${sy - 34}" width="${rx * 2}" height="34" fill="${shade(stone, -0.05)}"/>`);
  s.raw(`<rect x="${sx - rx}" y="${sy - 34}" width="${rx * 2}" height="34" fill="${s.linear('bz', [[0, '#ffd9a0', 0.12], [0.5, '#0e0c0a', 0.1], [1, '#0e0c0a', 0.6]], 1, 0)}"/>`);
  s.raw(`<rect x="${sx - 2}" y="${sy - 26}" width="4" height="14" fill="#14110e"/>`);
  s.ellipse(sx, sy - 34, rx, ry, shade(stone, -0.1));
  s.cone(sx, sy - 34, rx * 0.95, ry * 0.95, 46, roof);
  s.extend(sx - rx - 4, sy - 84);
}

/** Seteira vertical em face local. */
function slit(g: Svg, x: number, y: number, h = 18) {
  g.raw(`<rect x="${x - 2}" y="${-y - h}" width="4" height="${h}" fill="#110e0b"/><rect x="${x - 5}" y="${-y - h / 2 - 1.5}" width="10" height="3" fill="#110e0b"/>`);
}

function band(g: Svg, w: number, y: number, stone: string) {
  g.raw(`<rect x="0" y="${-y - 4}" width="${w}" height="4" fill="${shade(stone, 0.12)}"/><rect x="0" y="${-y}" width="${w}" height="1.5" fill="#1d1a16" opacity="0.6"/>`);
}

/** Escadaria monumental subindo até a plataforma (lado +x). */
function stairs(s: Svg, x: number, y0: number, y1: number, zTop: number, steps: number, stone: string) {
  const mat = s.stone(stone, 0.55);
  const depth = 0.2;
  for (let i = steps - 1; i >= 0; i--) {
    const zt = (zTop * (i + 1)) / steps;
    const xs = x + (steps - 1 - i) * depth;
    s.box(xs, y0, xs + depth, y1, 0, zt, mat, s.stone(shade(stone, 0.1), 0.55), { edge: false });
  }
}

/** Plataforma em talude com parapeito ameado nas bordas frontais (abertura na escadaria). */
function bailey(s: Svg, a: number, z: number, stone: string, gapY: number) {
  const dark = s.stone(shade(stone, -0.22), 0.8);
  s.box(-a, -a, a, a, 0, z, dark, s.stone(shade(stone, 0.02), 1.2));
  const mat = s.stone(stone, 0.6);
  const top = s.stone(shade(stone, 0.1), 0.6);
  // parapeito baixo nas bordas traseiras e frontais
  const wall = (x0: number, y0: number, x1: number, y1: number) => s.box(x0, y0, x1, y1, z, z + 12, mat, top, { edge: false });
  wall(-a, -a, a, -a + 0.12);
  wall(-a, -a, -a + 0.12, a);
  wall(-a, a - 0.12, a, a);
  wall(a - 0.12, -a, a, -gapY);
  wall(a - 0.12, gapY, a, a);
}

export interface HallFx {
  /** Fogos de braseiro (tile relativo ao lote e altura z). */
  fires: [number, number, number][];
  smoke: [number, number, number][];
}

export function hallFx(stage: 1 | 2 | 3): HallFx {
  const zT = stage === 1 ? 16 : stage === 2 ? 18 : 22;
  const a = stage === 1 ? 2 : stage === 2 ? 2.3 : 2.6;
  return {
    fires: [
      [a + 0.55, -0.85, 18],
      [a + 0.55, 0.85, 18],
      [a - 0.25, -a + 0.25, zT + 12 + 18],
      [a - 0.25, a - 0.25, zT + 12 + 18],
    ],
    smoke: stage === 1 ? [[-0.5, -1.2, zT + 196]] : [],
  };
}

export function townHallSvg(stage: 1 | 2 | 3, level: number, p: Palette): Svg {
  const s = new Svg(`th${stage}`);
  const stone = p.stone;
  const roof = s.tiles(p.roof);
  const mat = s.stone(stone);
  const a = stage === 1 ? 2 : stage === 2 ? 2.3 : 2.6;
  const zT = stage === 1 ? 16 : stage === 2 ? 18 : 22;
  const keepH = stage === 1 ? 190 : stage === 2 ? 250 : 320;

  s.shadow(-a, -a, a, a, keepH, 0.42);
  bailey(s, a, zT, stone, 0.6);

  // ---- torre de menagem (ao fundo, canto -x -y) ----
  const k0 = stage === 1 ? -1.75 : stage === 2 ? -2.05 : -2.3;
  const k1 = stage === 1 ? -0.25 : stage === 2 ? -0.2 : -0.1;
  if (stage === 3) {
    // torre redonda traseira direita, maciça
    const t = s.tower(1.55, -1.95, 0.62, zT, 260, stone);
    s.crenels(t.sx, t.top, t.rx, t.ry, stone);
    s.cone(t.sx, t.top - 15, t.rx * 1.02, t.ry * 1.02, 120, p.roof);
    s.banner(t.sx, t.top - 135, 30, p.banner, p.accent);
  }
  s.box(k0, k0, k1, k1, zT, zT + keepH, mat, null, {
    left: (g, w) => {
      band(g, w, keepH * 0.34, stone);
      band(g, w, keepH * 0.68, stone);
      slit(g, w * 0.25, keepH * 0.15);
      slit(g, w * 0.75, keepH * 0.15);
      windowOn(g, w / 2 - 7, keepH * 0.42, 14, 26, { arch: true });
      windowOn(g, w / 2 - 7, keepH * 0.76, 14, 22, { arch: true, lit: false });
      slit(g, w * 0.2, keepH * 0.5);
      slit(g, w * 0.8, keepH * 0.5);
    },
    right: (g, w) => {
      band(g, w, keepH * 0.34, stone);
      band(g, w, keepH * 0.68, stone);
      slit(g, w / 2, keepH * 0.2);
      windowOn(g, w / 2 - 7, keepH * 0.5, 14, 24, { arch: true, lit: false });
      slit(g, w / 2, keepH * 0.78);
    },
  });
  squareCrenels(s, k0, k0, k1, k1, zT + keepH + 14, mat);
  if (stage >= 2) {
    // telhado em pavilhão dentro do parapeito + guaritas nos cantos
    s.pyramid(k0 + 0.18, k0 + 0.18, k1 - 0.18, k1 - 0.18, zT + keepH + 14, stage === 3 ? 150 : 110, roof, 0);
    for (const [x, y] of [
      [k1, k0],
      [k0, k1],
      [k1, k1],
    ] as const) {
      bartizan(s, x, y, zT + keepH + 2, stone, p.roof);
    }
    const [px, py] = iso((k0 + k1) / 2, (k0 + k1) / 2, zT + keepH + 14 + (stage === 3 ? 150 : 110));
    s.line([px, py], [px, py - 24], GOLD, 3);
    s.ellipse(px, py - 26, 4, 4, GOLD);
    s.banner(px, py - 26, 36, p.banner, p.accent);
  } else {
    const [bx, by] = iso((k0 + k1) / 2, (k0 + k1) / 2, zT + keepH + 14);
    s.banner(bx, by, 52, p.banner, p.accent);
  }

  // ---- torre de escada redonda no canto frontal da menagem ----
  {
    const t = s.tower(k1, k1, stage === 3 ? 0.42 : 0.34, zT, keepH + 36, stone);
    const g = s.uid('');
    void g;
    s.raw(`<rect x="${t.sx - 2}" y="${t.top + 40}" width="4" height="16" fill="#110e0b"/><rect x="${t.sx - 2}" y="${t.top + 100}" width="4" height="16" fill="#110e0b"/>`);
    s.crenels(t.sx, t.top, t.rx, t.ry, stone);
    s.cone(t.sx, t.top - 15, t.rx * 1.05, t.ry * 1.05, 70 + stage * 10, p.roof);
  }

  // ---- salão nobre (frente, voltado à praça) ----
  const hx0 = stage === 1 ? -0.15 : -0.1;
  const hx1 = stage === 1 ? 1.3 : stage === 2 ? 1.55 : 1.75;
  const hy0 = stage === 1 ? -1.45 : -1.6;
  const hy1 = stage === 1 ? 1.25 : stage === 2 ? 1.55 : 1.8;
  const hallH = stage === 1 ? 86 : stage === 2 ? 104 : 124;
  s.box(hx0, hy0, hx1, hy1, zT, zT + hallH, mat, null, {
    left: (g, w) => {
      band(g, w, hallH * 0.55, stone);
      const n = stage === 1 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const x = (w * (i + 1)) / (n + 1);
        windowOn(g, x - 8, 14, 16, hallH * 0.42, { arch: true });
        slit(g, x, hallH * 0.64);
      }
      // contrafortes
      for (let i = 0; i <= n; i++) {
        const x = (w * (i + 0.5)) / (n + 1) - 4;
        g.raw(`<rect x="${x}" y="${-hallH * 0.8}" width="8" height="${hallH * 0.8}" fill="${shade(stone, -0.18)}"/><rect x="${x}" y="${-hallH * 0.8}" width="3" height="${hallH * 0.8}" fill="${shade(stone, 0.05)}"/>`);
      }
    },
    right: (g, w) => {
      band(g, w, hallH * 0.62, stone);
      const dw = stage === 1 ? 38 : stage === 2 ? 46 : 54;
      const dh = stage === 1 ? 50 : stage === 2 ? 60 : 72;
      doorOn(g, w / 2 - dw / 2, dw, dh, '#3e2a1a', shade(stone, 0.1));
      // brasão sobre o portal
      g.raw(`<path d="M${w / 2 - 12} ${-dh - 30} h24 v13 q0 11 -12 16 q-12 -5 -12 -16 z" fill="${p.banner}" stroke="${GOLD}" stroke-width="2"/>`);
      g.raw(`<path d="M${w / 2 - 6} ${-dh - 24} h12 v6 q0 6 -6 8 q-6 -2 -6 -8 z" fill="${p.accent}"/>`);
      slit(g, 16, hallH * 0.4);
      slit(g, w - 16, hallH * 0.4);
      windowOn(g, 10, hallH * 0.7, 12, 18, { arch: true, lit: false });
      windowOn(g, w - 22, hallH * 0.7, 12, 18, { arch: true, lit: false });
    },
  });
  // parapeito ameado e telhado íngreme de ardósia emergindo por trás das ameias
  squareCrenels(s, hx0, hy0, hx1, hy1, zT + hallH + 14, mat, 14, 'back');
  s.gable(hx0 + 0.16, hy0 + 0.16, hx1 - 0.16, hy1 - 0.16, zT + hallH + 4, stage === 1 ? 74 : 92, roof, 'y', mat, 0.02);
  squareCrenels(s, hx0, hy0, hx1, hy1, zT + hallH + 14, mat, 14, 'front');

  if (stage === 3) {
    // torre redonda dianteira esquerda + pináculos
    const t = s.tower(-1.95, 1.95, 0.6, zT, 230, stone);
    for (const dy of [60, 140]) s.raw(`<rect x="${t.sx - 2}" y="${t.top + dy}" width="4" height="18" fill="#110e0b"/>`);
    s.crenels(t.sx, t.top, t.rx, t.ry, stone);
    s.cone(t.sx, t.top - 15, t.rx * 1.02, t.ry * 1.02, 112, p.roof);
    s.banner(t.sx, t.top - 127, 30, p.banner, p.accent);
  }

  stairs(s, a, -0.6, 0.6, zT, 6, stone);
  // braseiros e estandartes de guerra na entrada
  for (const yy of [-0.85, 0.85]) {
    const [bx, by] = iso(a + 0.55, yy, 0);
    s.brazier(bx, by);
  }
  for (const [x, y] of [
    [a - 0.25, -a + 0.25],
    [a - 0.25, a - 0.25],
  ] as const) {
    const [bx, by] = iso(x, y, zT + 12);
    s.brazier(bx, by);
  }
  const flags = stage === 1 ? (level >= 3 ? 2 : 1) : stage === 2 ? (level >= 6 ? 3 : 2) : level >= 9 ? 4 : 3;
  const spots: [number, number][] = [
    [a - 0.3, 0.95],
    [a - 0.3, -0.95],
    [-a + 0.3, a - 0.3],
    [a - 0.3, -a + 0.4],
  ];
  for (let i = 0; i < flags; i++) {
    const [fx, fy] = iso(spots[i][0], spots[i][1], zT + 12);
    s.banner(fx, fy, 56 + stage * 8, p.banner, p.accent);
  }
  if (level >= 10) {
    // nível máximo: cota de ouro nas ameias da menagem
    const [cx, cy] = iso(k1, k1, zT + keepH + 30);
    s.path(`M${cx - 10} ${cy} l4 -12 l6 7 l6 -7 l4 12 z`, GOLD, 'stroke="#7a5a1a" stroke-width="1"');
  }
  return s;
}
