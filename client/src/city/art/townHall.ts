import { doorOn, iso, shade, Svg, timberOn, windowOn } from '../svg';

export interface Palette {
  roof: string;
  accent: string;
  stone: string;
}

const STONE_DARK = '#8f8574';
const WOOD = '#5b3a22';

function lantern(s: Svg, x: number, y: number, z: number) {
  const [sx, sy] = iso(x, y, z);
  s.line([sx, sy], [sx, sy - 26], '#2b2118', 2);
  s.raw(`<rect x="${sx - 4}" y="${sy - 36}" width="8" height="11" rx="2" fill="#2b2118"/>`);
  s.raw(`<rect x="${sx - 2.6}" y="${sy - 34.5}" width="5.2" height="8" rx="1" fill="#ffd27a"/>`);
  s.ellipse(sx, sy - 30, 10, 10, s.radial('glow', [[0, '#ffcf73', 0.55], [1, '#ffcf73', 0]]));
  s.extend(sx - 10, sy - 40);
}

function planter(s: Svg, x: number, y: number, z: number) {
  const [sx, sy] = iso(x, y, z);
  s.raw(`<rect x="${sx - 7}" y="${sy - 7}" width="14" height="7" rx="1.5" fill="#7a5a3a"/>`);
  const cols = ['#d94f5c', '#f2c14e', '#e8eef2', '#c86bd6'];
  for (let i = 0; i < 6; i++) {
    s.ellipse(sx - 6 + i * 2.4, sy - 9 - (i % 2) * 2, 2.6, 2.4, i % 2 ? '#3f7a34' : '#4f8f3c');
    s.ellipse(sx - 5 + i * 2.2, sy - 11 - (i % 3), 1.3, 1.3, cols[i % cols.length]);
  }
}

/** Escadaria de pedra subindo até a plataforma (lado +x). */
function stairs(s: Svg, x: number, y0: number, y1: number, zTop: number, steps: number, stone: string) {
  const mat = s.stone(stone, 0.6);
  const depth = 0.22;
  for (let i = steps - 1; i >= 0; i--) {
    const zt = (zTop * (i + 1)) / steps;
    const xs = x + (steps - 1 - i) * depth;
    s.box(xs, y0, xs + depth, y1, 0, zt, mat, s.stone(shade(stone, 0.08), 0.6), { edge: false });
  }
}

/** Plataforma de pedra com cobertura em lajotas. */
function terrace(s: Svg, a: number, z: number, stone: string) {
  s.box(-a, -a, a, a, 0, z, s.stone(STONE_DARK, 0.75), s.stone(shade(stone, 0.12), 1.3));
}

export function townHallSvg(stage: 1 | 2 | 3, level: number, p: Palette): Svg {
  const s = new Svg(`th${stage}`);
  const stone = p.stone;
  const roof = s.tiles(p.roof);
  const plaster = s.plaster('#efe2c4');
  const stoneMat = s.stone(stone);
  const half = stage === 1 ? 2 : stage === 2 ? 2.3 : 2.6;

  s.shadow(-half, -half, half, half, stage === 1 ? 150 : stage === 2 ? 200 : 240, 0.34);
  const zT = stage === 3 ? 14 : 10;
  terrace(s, half, zT, stone);

  if (stage === 1) {
    // torre do sino (atrás, à direita)
    s.box(0.25, -1.85, 1.05, -1.05, zT, zT + 128, stoneMat, null, {
      left: (g, w) => windowOn(g, w / 2 - 6, 96, 12, 18, { arch: true, lit: false }),
      right: (g, w) => windowOn(g, w / 2 - 6, 96, 12, 18, { arch: true, lit: false }),
    });
    s.pyramid(0.25, -1.85, 1.05, -1.05, zT + 128, 58, roof);
    const [bx, by] = iso(0.65, -1.45, zT + 186);
    s.banner(bx, by + 4, 22, p.roof, p.accent);

    // corpo principal: térreo em pedra, andar superior em enxaimel
    const x0 = -1.65;
    const x1 = 1.05;
    const y0 = -1.25;
    const y1 = 1.25;
    s.box(x0, y0, x1, y1, zT, zT + 40, stoneMat, null, {
      left: (g, w) => {
        for (let i = 0; i < 3; i++) windowOn(g, 22 + i * ((w - 60) / 2), 8, 16, 24, { arch: true });
      },
      right: (g, w) => {
        doorOn(g, w / 2 - 17, 34, 38);
        windowOn(g, 14, 10, 12, 18, { arch: true });
        windowOn(g, w - 26, 10, 12, 18, { arch: true });
      },
    });
    s.box(x0 - 0.08, y0 - 0.08, x1 + 0.08, y1 + 0.08, zT + 40, zT + 78, plaster, null, {
      left: (g, w) => {
        timberOn(g, w, 0, 38);
        for (let i = 0; i < 4; i++) windowOn(g, 16 + i * ((w - 50) / 3), 9, 14, 18, { shutters: shade(p.roof, -0.1) });
      },
      right: (g, w) => {
        timberOn(g, w, 0, 38);
        windowOn(g, w / 2 - 9, 9, 18, 20, { arch: true });
      },
    });
    s.gable(x0 - 0.08, y0 - 0.08, x1 + 0.08, y1 + 0.08, zT + 78, 74, roof, 'x', plaster);
    // chaminé
    s.box(-1.2, -0.45, -0.92, -0.17, zT + 112, zT + 150, s.stone(STONE_DARK, 0.6), s.stone('#3a332c', 0.5));
    // lucarna (água-furtada) na água frontal
    const dx = -0.35;
    s.box(dx - 0.28, 0.55, dx + 0.28, 0.85, zT + 96, zT + 118, plaster, null, {
      left: (g, w) => windowOn(g, w / 2 - 6, 4, 12, 14, { arch: true }),
    });
    s.gable(dx - 0.28, 0.35, dx + 0.28, 0.85, zT + 118, 18, roof, 'y', plaster, 0.06);
    stairs(s, 1.13, -0.45, 0.45, zT, 4, stone);
    lantern(s, 1.6, -0.75, zT);
    lantern(s, 1.6, 0.75, zT);
    if (level >= 2) {
      planter(s, 1.3, 1.1, zT);
      planter(s, -0.6, 1.55, zT);
    }
    if (level >= 3) {
      const [fx, fy] = iso(1.7, 1.7, zT);
      s.banner(fx, fy, 46, p.roof, p.accent);
    }
    return s;
  }

  if (stage === 2) {
    const x0 = -2.0;
    const x1 = 1.25;
    const y0 = -1.55;
    const y1 = 0.9;
    // torre do relógio central (atrás)
    const tx0 = -0.75;
    const ty0 = -1.95;
    s.box(tx0, ty0, tx0 + 1, ty0 + 1, zT, zT + 210, stoneMat, null, {
      left: (g, w) => {
        g.raw(`<circle cx="${w / 2}" cy="-176" r="15" fill="#efe6cf" stroke="#3b2a1c" stroke-width="3"/>`);
        g.raw(`<line x1="${w / 2}" y1="-176" x2="${w / 2}" y2="-187" stroke="#2b2118" stroke-width="2.4"/><line x1="${w / 2}" y1="-176" x2="${w / 2 + 8}" y2="-172" stroke="#2b2118" stroke-width="2"/>`);
        windowOn(g, w / 2 - 6, 120, 12, 22, { arch: true, lit: false });
      },
      right: (g, w) => windowOn(g, w / 2 - 6, 150, 12, 22, { arch: true, lit: false }),
    });
    s.pyramid(tx0 - 0.06, ty0 - 0.06, tx0 + 1.06, ty0 + 1.06, zT + 210, 84, roof);
    const [sx, sy] = iso(tx0 + 0.5, ty0 + 0.5, zT + 294);
    s.line([sx, sy], [sx, sy - 14], '#d8b356', 2.4);
    s.banner(sx, sy - 10, 20, p.roof, p.accent);

    s.box(x0, y0, x1, y1, zT, zT + 56, stoneMat, null, {
      left: (g, w) => {
        for (let i = 0; i < 4; i++) windowOn(g, 18 + i * ((w - 52) / 3), 12, 16, 30, { arch: true });
      },
      right: (g, w) => {
        doorOn(g, w / 2 - 20, 40, 48);
        windowOn(g, 16, 14, 14, 26, { arch: true });
        windowOn(g, w - 30, 14, 14, 26, { arch: true });
      },
    });
    s.box(x0 - 0.08, y0 - 0.08, x1 + 0.08, y1 + 0.08, zT + 56, zT + 100, plaster, null, {
      left: (g, w) => {
        timberOn(g, w, 0, 44);
        for (let i = 0; i < 5; i++) windowOn(g, 14 + i * ((w - 46) / 4), 12, 14, 20, { shutters: shade(p.roof, -0.1) });
      },
      right: (g, w) => {
        timberOn(g, w, 0, 44);
        windowOn(g, 20, 12, 14, 20, { shutters: shade(p.roof, -0.1) });
        windowOn(g, w - 34, 12, 14, 20, { shutters: shade(p.roof, -0.1) });
      },
    });
    s.gable(x0 - 0.08, y0 - 0.08, x1 + 0.08, y1 + 0.08, zT + 100, 84, roof, 'x', plaster);
    // ala frontal esquerda
    s.box(-2.0, 0.9, -0.55, 2.2, zT, zT + 50, stoneMat, null, {
      left: (g, w) => {
        windowOn(g, w / 2 - 22, 12, 14, 26, { arch: true });
        windowOn(g, w / 2 + 8, 12, 14, 26, { arch: true });
      },
      right: (g, w) => windowOn(g, w / 2 - 7, 12, 14, 24, { arch: true }),
    });
    s.box(-2.06, 0.84, -0.49, 2.26, zT + 50, zT + 82, plaster, null, {
      left: (g, w) => {
        timberOn(g, w, 0, 32);
        windowOn(g, w / 2 - 7, 8, 14, 18, { shutters: shade(p.roof, -0.1) });
      },
      right: (g, w) => timberOn(g, w, 0, 32),
    });
    s.gable(-2.06, 0.84, -0.49, 2.26, zT + 82, 60, roof, 'y', plaster);
    s.box(0.1, -1.25, 0.38, -0.97, zT + 150, zT + 196, s.stone(STONE_DARK, 0.6), s.stone('#3a332c', 0.5));
    stairs(s, 1.33, -0.55, 0.55, zT, 5, stone);
    lantern(s, 1.95, -0.9, zT);
    lantern(s, 1.95, 0.9, zT);
    planter(s, 1.5, 1.2, zT);
    planter(s, 0.2, 1.9, zT);
    const [fx, fy] = iso(2.05, 2.05, zT);
    s.banner(fx, fy, 52, p.roof, p.accent);
    if (level >= 5) {
      const [gx, gy] = iso(2.05, -2.05, zT);
      s.banner(gx, gy, 52, p.roof, p.accent);
    }
    if (level >= 6) {
      const [hx, hy] = iso(-2.2, 2.2, zT);
      s.banner(hx, hy, 52, p.roof, p.accent);
    }
    return s;
  }

  // estágio 3: palácio-fortaleza
  const gold = '#d9ad48';
  const x0 = -2.1;
  const x1 = 1.4;
  const y0 = -1.7;
  const y1 = 1.2;
  // torre redonda traseira direita
  const t1 = s.tower(1.25, -1.75, 0.62, zT, 250, stone);
  s.cone(t1.sx, t1.top, t1.rx, t1.ry, 110, p.roof);
  s.line([t1.sx, t1.top - 110], [t1.sx, t1.top - 128], gold, 3);
  s.banner(t1.sx, t1.top - 120, 22, p.roof, p.accent);
  // torre de menagem central
  s.box(-1.3, -2.1, 0.0, -0.8, zT, zT + 250, stoneMat, null, {
    left: (g, w) => {
      windowOn(g, w / 2 - 8, 200, 16, 30, { arch: true });
      windowOn(g, w / 2 - 8, 140, 16, 30, { arch: true });
    },
    right: (g, w) => windowOn(g, w / 2 - 8, 200, 16, 30, { arch: true }),
  });
  s.box(-1.38, -2.18, 0.08, -0.72, zT + 250, zT + 262, s.stone(shade(stone, 0.05), 0.7), null);
  s.pyramid(-1.38, -2.18, 0.08, -0.72, zT + 262, 120, roof);
  const [kx, ky] = iso(-0.65, -1.45, zT + 382);
  s.line([kx, ky], [kx, ky - 22], gold, 3.4);
  s.ellipse(kx, ky - 24, 4, 4, gold);
  // salão principal em pedra lavrada
  s.box(x0, y0, x1, y1, zT, zT + 112, stoneMat, null, {
    left: (g, w) => {
      for (let i = 0; i < 5; i++) {
        windowOn(g, 16 + i * ((w - 50) / 4), 16, 18, 40, { arch: true });
        windowOn(g, 18 + i * ((w - 50) / 4), 72, 14, 26, { arch: true });
      }
      g.raw(`<rect x="0" y="-62" width="${w}" height="5" fill="${shade(stone, 0.18)}"/>`);
    },
    right: (g, w) => {
      doorOn(g, w / 2 - 25, 50, 64);
      g.raw(`<rect x="${w / 2 - 34}" y="-84" width="68" height="10" fill="${shade(stone, 0.2)}"/>`);
      g.raw(`<circle cx="${w / 2}" cy="-96" r="11" fill="${p.roof}" stroke="${gold}" stroke-width="2.5"/>`);
      windowOn(g, 14, 20, 16, 36, { arch: true });
      windowOn(g, w - 30, 20, 16, 36, { arch: true });
    },
  });
  s.box(x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05, zT + 112, zT + 122, s.stone(shade(stone, 0.1), 0.7), null);
  s.gable(x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05, zT + 122, 96, roof, 'x', stoneMat);
  // pináculos dourados na cumeeira
  for (const t of [0.15, 0.5, 0.85]) {
    const [px, py] = iso(x0 + (x1 - x0) * t, (y0 + y1) / 2, zT + 218);
    s.line([px, py], [px, py - 16], gold, 2.6);
    s.ellipse(px, py - 17, 3, 3, gold);
  }
  // torre redonda frontal esquerda
  const t2 = s.tower(-2.15, 1.35, 0.6, zT, 200, stone);
  s.cone(t2.sx, t2.top, t2.rx, t2.ry, 104, p.roof);
  s.line([t2.sx, t2.top - 104], [t2.sx, t2.top - 120], gold, 3);
  s.banner(t2.sx, t2.top - 112, 22, p.roof, p.accent);
  stairs(s, 1.48, -0.7, 0.7, zT, 6, stone);
  for (const yy of [-1.1, 1.1]) {
    // estátuas nos patamares
    const [sx, sy] = iso(2.2, yy, zT);
    s.raw(`<rect x="${sx - 7}" y="${sy - 16}" width="14" height="16" fill="${shade(stone, 0.1)}"/>`);
    s.raw(`<path d="M${sx - 4} ${sy - 16} l1 -18 a3 3 0 0 1 6 0 l1 18 z" fill="#c9c2b2"/>`);
    s.ellipse(sx, sy - 38, 4, 4.5, '#c9c2b2');
    s.extend(sx, sy - 44);
  }
  lantern(s, 2.3, -0.5, zT);
  lantern(s, 2.3, 0.5, zT);
  planter(s, 1.9, 1.7, zT);
  planter(s, -0.4, 2.3, zT);
  const banners = level >= 9 ? 3 : 2;
  const spots: [number, number][] = [[2.45, 2.45], [2.45, -2.45], [-2.45, 2.45]];
  for (let i = 0; i < banners; i++) {
    const [bx, by] = iso(spots[i][0], spots[i][1], zT);
    s.banner(bx, by, 60, p.roof, p.accent);
  }
  if (level >= 10) {
    const [cx, cy] = iso(-0.65, -1.45, zT + 404);
    s.path(`M${cx - 10} ${cy} l4 -12 l6 7 l6 -7 l4 12 z`, gold);
    s.extend(cx - 10, cy - 14);
  }
  return s;
}
