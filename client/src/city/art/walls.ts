import { doorOn, iso, L, shade, Svg } from '../svg';

export const WALL_H = 64;
const T = 0.26; // meia espessura da muralha (tiles)

/**
 * Segmento de 1 tile. dir 'x' corre ao longo de x (face visível = +y); 'y' ao longo de y
 * (face visível = +x). `outer` indica se o lado externo da cidade é o próximo à câmera.
 */
export function wallSegmentSvg(dir: 'x' | 'y', outer: 'near' | 'far', stone: string): Svg {
  const s = new Svg(`w${dir}${outer}`);
  const mat = s.stone(stone, L / 52);
  const top = s.stone(shade(stone, 0.1), 0.7);
  const [x0, x1, y0, y1] = dir === 'x' ? [-0.5, 0.5, -T, T] : [-T, T, -0.5, 0.5];
  if (outer === 'near') s.shadow(x0, y0, x1, y1, 50, 0.22);
  // base em talude
  const b = 0.06;
  s.box(x0 - (dir === 'y' ? b : 0), y0 - (dir === 'x' ? b : 0), x1 + (dir === 'y' ? b : 0), y1 + (dir === 'x' ? b : 0), 0, 12, s.stone(shade(stone, -0.18), L / 52), null, { edge: false });
  s.box(x0, y0, x1, y1, 12, WALL_H, mat, top, { edge: false });
  // ameias no lado externo; parapeito baixo no lado interno
  const merlon = (a: number, c: number) => {
    const m = 0.16;
    if (dir === 'x') s.box(a - m / 2, c - 0.07, a + m / 2, c + 0.07, WALL_H, WALL_H + 14, mat, top, { edge: false });
    else s.box(c - 0.07, a - m / 2, c + 0.07, a + m / 2, WALL_H, WALL_H + 14, mat, top, { edge: false });
  };
  const outerLine = outer === 'near' ? T - 0.07 : -T + 0.07;
  const innerLine = outer === 'near' ? -T + 0.05 : T - 0.05;
  const parapet = () => {
    if (dir === 'x') s.box(x0, innerLine - 0.05, x1, innerLine + 0.05, WALL_H, WALL_H + 6, top, top, { edge: false });
    else s.box(innerLine - 0.05, y0, innerLine + 0.05, y1, WALL_H, WALL_H + 6, top, top, { edge: false });
  };
  const merlons = () => {
    for (const a of [-0.3, 0.05, 0.38]) merlon(a, outerLine);
  };
  // ordem do pintor: o lado mais distante da câmera primeiro
  if (outer === 'near') {
    parapet();
    merlons();
  } else {
    merlons();
    parapet();
  }
  return s;
}

/** Torre de muralha (canto com telhado cônico, intermediária com ameias). */
export function wallTowerSvg(kind: 'corner' | 'mid', stone: string, roof: string, accent: string): Svg {
  const s = new Svg(`wt${kind}`);
  const r = kind === 'corner' ? 0.62 : 0.5;
  const h = kind === 'corner' ? 116 : 96;
  s.shadow(-r, -r, r, r, h, 0.3);
  const t = s.tower(0, 0, r, 0, h, stone);
  // seteiras
  for (const [dx, dy] of [
    [-0.45, 0.62],
    [0.2, 0.75],
  ]) {
    const sx = t.sx + dx * t.rx;
    const sy = t.top + h * dy;
    s.raw(`<rect x="${sx - 2}" y="${sy - 9}" width="4" height="18" rx="1.5" fill="#1d1712"/>`);
  }
  s.raw(`<rect x="${t.sx - t.rx}" y="${t.top + 6}" width="${t.rx * 2}" height="5" fill="${shade(stone, 0.15)}" opacity="0.6"/>`);
  if (kind === 'corner') {
    s.crenels(t.sx, t.top, t.rx, t.ry, stone);
    s.cone(t.sx, t.top - 10, t.rx * 0.92, t.ry * 0.92, 74, roof);
    s.banner(t.sx, t.top - 82, 20, roof, accent);
  } else {
    s.crenels(t.sx, t.top, t.rx, t.ry, stone);
  }
  return s;
}

/** Guarita do portão principal na muralha +x (face externa voltada à câmera). */
export function gatehouseSvg(stone: string, roof: string, accent: string): Svg {
  const s = new Svg('gate');
  const mat = s.stone(stone, L / 52);
  const top = s.stone(shade(stone, 0.1), 0.7);
  s.shadow(-0.5, -1.7, 0.5, 1.7, 120, 0.3);
  // torre traseira (y negativo) primeiro
  const tb = s.tower(0, -1.15, 0.58, 0, 128, stone);
  s.crenels(tb.sx, tb.top, tb.rx, tb.ry, stone);
  s.cone(tb.sx, tb.top - 10, tb.rx * 0.92, tb.ry * 0.92, 70, roof);
  s.banner(tb.sx, tb.top - 78, 20, roof, accent);
  // corpo do portão com passagem em arco
  s.box(-0.42, -0.72, 0.42, 0.72, 0, 104, mat, top, {
    right: (g, w) => {
      const aw = 52;
      const ah = 66;
      const x = w / 2 - aw / 2;
      doorOn(g, x, aw, ah, '#5a3a20', shade(stone, 0.12));
      // grade levadiça meio erguida
      const r = aw / 2;
      const clip = g.uid('pc');
      g.raw(`<clipPath id="${clip}"><path d="M${x} -26 V${-(ah - r)} A${r} ${r} 0 0 1 ${x + aw} ${-(ah - r)} V-26 Z"/></clipPath>`);
      const bars: string[] = [];
      for (let i = 1; i < 7; i++) bars.push(`<rect x="${x + (aw * i) / 7 - 1.4}" y="${-ah}" width="2.8" height="${ah - 26}" fill="#2c2c2c"/>`);
      for (let j = 0; j < 4; j++) bars.push(`<rect x="${x}" y="${-ah + 8 + j * 9}" width="${aw}" height="2.4" fill="#2c2c2c"/>`);
      g.raw(`<g clip-path="url(#${clip})">${bars.join('')}</g>`);
      // brasão sobre o arco
      g.raw(`<path d="M${w / 2 - 11} ${-ah - 16} h22 v12 q0 10 -11 14 q-11 -4 -11 -14 z" fill="${roof}" stroke="#d9ad48" stroke-width="2"/>`);
      g.raw(`<path d="M${w / 2 - 5} ${-ah - 10} h10 v5 q0 5 -5 7 q-5 -2 -5 -7 z" fill="${accent}"/>`);
      g.raw(`<rect x="0" y="-92" width="${w}" height="5" fill="${shade(stone, 0.18)}" opacity="0.7"/>`);
    },
    left: (g, w) => {
      g.raw(`<rect x="${w / 2 - 2}" y="-70" width="4" height="16" rx="1.5" fill="#1d1712"/>`);
    },
  });
  for (const a of [-0.55, -0.2, 0.15, 0.5]) {
    s.box(0.28, a - 0.08, 0.42, a + 0.08, 104, 118, mat, top, { edge: false });
  }
  // torre dianteira (y positivo)
  const tf = s.tower(0, 1.15, 0.58, 0, 128, stone);
  s.crenels(tf.sx, tf.top, tf.rx, tf.ry, stone);
  s.cone(tf.sx, tf.top - 10, tf.rx * 0.92, tf.ry * 0.92, 70, roof);
  s.banner(tf.sx, tf.top - 78, 20, roof, accent);
  // estandartes pendurados na fachada
  const [hx, hy] = iso(0.42, -0.45, 98);
  s.path(`M${hx} ${hy} l12 -6 l0 40 l-6 8 l-6 -2 z`, roof);
  s.path(`M${hx + 3} ${hy + 6} l6 -3 l0 10 l-6 3 z`, accent);
  const [jx, jy] = iso(0.42, 0.55, 98);
  s.path(`M${jx} ${jy} l12 -6 l0 40 l-6 8 l-6 -2 z`, roof);
  s.path(`M${jx + 3} ${jy + 6} l6 -3 l0 10 l-6 3 z`, accent);
  return s;
}
