import { doorOn, iso, L, shade, Svg } from '../svg';

export const WALL_H = 104;
const T = 0.36; // meia espessura da muralha (tiles)

/**
 * Segmento de 1 tile. dir 'x' corre ao longo de x (face visível = +y); 'y' ao longo de y
 * (face visível = +x). `outer` indica se o lado externo da cidade é o próximo à câmera.
 */
export function wallSegmentSvg(dir: 'x' | 'y', outer: 'near' | 'far', stone: string, slitAt = true): Svg {
  const s = new Svg(`w${dir}${outer}${slitAt}`);
  const mat = s.stone(stone, L / 52);
  const top = s.stone(shade(stone, 0.06), 0.7);
  const dark = s.stone(shade(stone, -0.2), L / 52);
  const [x0, x1, y0, y1] = dir === 'x' ? [-0.5, 0.5, -T, T] : [-T, T, -0.5, 0.5];
  if (outer === 'near') s.shadow(x0, y0, x1, y1, 90, 0.3);
  // talude (base inclinada) em pedra escura
  const b = 0.12;
  const bx = dir === 'y' ? b : 0;
  const by = dir === 'x' ? b : 0;
  s.box(x0 - bx, y0 - by, x1 + bx, y1 + by, 0, 22, dark, null, { edge: false });
  const face = (g: Svg, w: number) => {
    g.raw(`<rect x="0" y="${-WALL_H + 30}" width="${w}" height="3" fill="${shade(stone, 0.12)}" opacity="0.8"/>`);
    if (slitAt && outer === 'near') g.raw(`<rect x="${w / 2 - 2}" y="${-WALL_H + 44}" width="4" height="20" fill="#0f0d0a"/><rect x="${w / 2 - 6}" y="${-WALL_H + 52}" width="12" height="3" fill="#0f0d0a"/>`);
  };
  s.box(x0, y0, x1, y1, 22, WALL_H - 14, mat, null, { left: dir === 'x' ? face : undefined, right: dir === 'y' ? face : undefined, edge: false });
  // parapeito em balanço sobre mata-cães, do lado externo
  const ov = 0.07;
  const consoles = (g: Svg, w: number) => {
    for (let u = 3; u < w - 2; u += 10) g.raw(`<path d="M${u} 0 h6 l-1.6 10 h-2.8 z" fill="${outer === 'near' ? '#24201b' : '#2e2a24'}"/>`);
  };
  const px0 = dir === 'y' && outer === 'near' ? x0 : x0;
  const px1 = dir === 'y' && outer === 'near' ? x1 + ov : x1;
  const py0 = y0;
  const py1 = dir === 'x' && outer === 'near' ? y1 + ov : y1;
  s.box(px0, py0, px1, py1, WALL_H - 14, WALL_H, mat, top, {
    left: dir === 'x' && outer === 'near' ? consoles : undefined,
    right: dir === 'y' && outer === 'near' ? consoles : undefined,
    edge: false,
  });
  // passadiço escuro
  const inset = 0.09;
  const wx0 = dir === 'y' ? x0 + inset : x0;
  const wx1 = dir === 'y' ? x1 - inset : x1;
  const wy0 = dir === 'x' ? y0 + inset : y0;
  const wy1 = dir === 'x' ? y1 - inset : y1;
  s.poly([iso(wx0, wy0, WALL_H), iso(wx1, wy0, WALL_H), iso(wx1, wy1, WALL_H), iso(wx0, wy1, WALL_H)], '#3a352e');
  const merlon = (a: number, c: number, h: number) => {
    const m = 0.2;
    if (dir === 'x') s.box(a - m / 2, c - 0.08, a + m / 2, c + 0.08, WALL_H, WALL_H + h, mat, top, { edge: false });
    else s.box(c - 0.08, a - m / 2, c + 0.08, a + m / 2, WALL_H, WALL_H + h, mat, top, { edge: false });
  };
  const outerLine = outer === 'near' ? T - 0.08 + ov / 2 : -T + 0.08;
  const innerLine = outer === 'near' ? -T + 0.06 : T - 0.06;
  const parapet = () => {
    if (dir === 'x') s.box(x0, innerLine - 0.06, x1, innerLine + 0.06, WALL_H, WALL_H + 8, top, top, { edge: false });
    else s.box(innerLine - 0.06, y0, innerLine + 0.06, y1, WALL_H, WALL_H + 8, top, top, { edge: false });
  };
  const merlons = () => {
    for (const a of [-0.25, 0.25]) merlon(a, outerLine, 22);
  };
  if (outer === 'near') {
    parapet();
    merlons();
  } else {
    merlons();
    parapet();
  }
  return s;
}

/** Torre de muralha maciça (canto com telhado cônico, intermediária com coroamento e braseiro). */
export function wallTowerSvg(kind: 'corner' | 'mid', stone: string, roof: string, banner: string, accent: string): Svg {
  const s = new Svg(`wt${kind}`);
  const r = kind === 'corner' ? 0.86 : 0.66;
  const h = kind === 'corner' ? 176 : 146;
  s.shadow(-r, -r, r, r, h, 0.4);
  // base em talude
  s.tower(0, 0, r * 1.08, 0, 26, shade(stone, -0.22));
  const t = s.tower(0, 0, r, 0, h, stone);
  for (const [dx, dy] of [
    [-0.5, 0.35],
    [0.25, 0.42],
    [-0.15, 0.7],
    [0.55, 0.72],
  ]) {
    const sx = t.sx + dx * t.rx;
    const sy = t.top + h * dy;
    s.raw(`<rect x="${sx - 2}" y="${sy - 11}" width="4" height="22" fill="#0f0d0a"/><rect x="${sx - 6}" y="${sy - 2}" width="12" height="3" fill="#0f0d0a"/>`);
  }
  s.raw(`<rect x="${t.sx - t.rx}" y="${t.top + h * 0.5}" width="${t.rx * 2}" height="4" fill="${shade(stone, 0.14)}" opacity="0.7"/>`);
  s.crenels(t.sx, t.top, t.rx, t.ry, stone);
  if (kind === 'corner') {
    s.cone(t.sx, t.top - 15, t.rx * 0.98, t.ry * 0.98, 118, roof);
    s.banner(t.sx, t.top - 133, 34, banner, accent);
  } else {
    s.brazier(t.sx, t.top + 4);
  }
  return s;
}

/** Guarita monumental do portão principal (muralha +x) com ponte levadiça. */
export function gatehouseSvg(stone: string, roof: string, banner: string, accent: string): Svg {
  const s = new Svg('gate');
  const mat = s.stone(stone, L / 52);
  const top = s.stone(shade(stone, 0.06), 0.7);
  const H = 150;
  s.shadow(-0.6, -1.9, 0.6, 1.9, 200, 0.42);
  const twin = (y: number) => {
    s.tower(0, y, 0.82, 0, 28, shade(stone, -0.22));
    const t = s.tower(0, y, 0.74, 0, 206, stone);
    for (const dy of [60, 110, 150]) s.raw(`<rect x="${t.sx - 2}" y="${t.top + dy}" width="4" height="20" fill="#0f0d0a"/><rect x="${t.sx - 6}" y="${t.top + dy + 8}" width="12" height="3" fill="#0f0d0a"/>`);
    s.crenels(t.sx, t.top, t.rx, t.ry, stone);
    s.cone(t.sx, t.top - 15, t.rx * 0.98, t.ry * 0.98, 112, roof);
    s.banner(t.sx, t.top - 127, 34, banner, accent);
  };
  twin(-1.25);
  // corpo do portão
  s.box(-0.5, -0.8, 0.5, 0.8, 0, H, mat, top, {
    right: (g, w) => {
      const aw = 60;
      const ah = 84;
      const x = w / 2 - aw / 2;
      doorOn(g, x, aw, ah, '#3b2717', shade(stone, 0.1));
      const r = aw / 2;
      const clip = g.uid('pc');
      g.raw(`<clipPath id="${clip}"><path d="M${x} -34 V${-(ah - r)} A${r} ${r} 0 0 1 ${x + aw} ${-(ah - r)} V-34 Z"/></clipPath>`);
      const bars: string[] = [];
      for (let i = 1; i < 8; i++) bars.push(`<rect x="${x + (aw * i) / 8 - 1.6}" y="${-ah}" width="3.2" height="${ah - 34}" fill="#1e1e1e"/>`);
      for (let j = 0; j < 5; j++) bars.push(`<rect x="${x}" y="${-ah + 8 + j * 9}" width="${aw}" height="2.6" fill="#1e1e1e"/>`);
      for (let i = 1; i < 8; i++) bars.push(`<path d="M${x + (aw * i) / 8 - 2.4} -34 l2.4 6 l2.4 -6 z" fill="#1e1e1e"/>`);
      g.raw(`<g clip-path="url(#${clip})">${bars.join('')}</g>`);
      // brasão monumental
      g.raw(`<path d="M${w / 2 - 16} ${-ah - 30} h32 v17 q0 14 -16 21 q-16 -7 -16 -21 z" fill="${banner}" stroke="#c9a24a" stroke-width="2.6"/>`);
      g.raw(`<path d="M${w / 2 - 8} ${-ah - 22} h16 v8 q0 7 -8 10 q-8 -3 -8 -10 z" fill="${accent}"/>`);
      g.raw(`<rect x="0" y="-118" width="${w}" height="5" fill="${shade(stone, 0.14)}" opacity="0.8"/>`);
      for (let u = 4; u < w - 4; u += 10) g.raw(`<path d="M${u} ${-H + 14} h6 l-1.6 10 h-2.8 z" fill="#1d1a16"/>`);
    },
    left: (g, w) => {
      g.raw(`<rect x="${w / 2 - 2}" y="-96" width="4" height="22" fill="#0f0d0a"/>`);
    },
  });
  for (const a of [-0.62, -0.31, 0, 0.31, 0.62]) s.box(0.34, a - 0.09, 0.5, a + 0.09, H, H + 22, mat, top, { edge: false });
  // estandartes pendurados na fachada
  for (const yy of [-0.62, 0.62]) {
    const [hx, hy] = iso(0.5, yy, H - 22);
    s.path(`M${hx} ${hy} l14 -7 l0 58 l-7 10 l-7 -6 z`, banner);
    s.path(`M${hx} ${hy} l14 -7 l0 58 l-7 10 l-7 -6 z`, s.linear('gbn', [[0, '#000', 0], [1, '#000', 0.35]], 1, 0));
    s.path(`M${hx + 3} ${hy + 10} l8 -4 l0 12 l-8 4 z`, accent);
  }
  twin(1.25);
  // ponte levadiça sobre o fosso
  const deck = s.planks('#4a3423', false);
  s.box(0.5, -0.5, 2.0, 0.5, -4, 4, deck, deck, { edge: false });
  for (const yy of [-0.5, 0.5]) s.line(iso(0.55, yy, 104), iso(1.9, yy, 6), '#2a2622', 2.2);
  for (const yy of [-0.48, 0.48]) {
    const [bx, by] = iso(2.1, yy, 0);
    s.brazier(bx, by);
  }
  return s;
}

export function wallFx(R: number): [number, number, number][] {
  // braseiros: ponte do portão e torres intermediárias (posição em tiles + altura)
  return [
    [R + 2.1, -0.48, 22],
    [R + 2.1, 0.48, 22],
  ];
}
