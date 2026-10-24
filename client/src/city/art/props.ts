import { doorOn, iso, shade, Svg, timberOn, windowOn } from '../svg';

/** Casa de morador (decoração) — três variantes de arquitetura. */
export function cottageSvg(variant: number, roof: string): Svg {
  const s = new Svg(`cot${variant}`);
  const plaster = s.plaster(variant === 1 ? '#e8d6b0' : '#efe4ca');
  const stone = s.stone('#a89d88', 0.7);
  const tiles = s.tiles(variant === 2 ? '#8e4a2f' : shade(roof, -0.05));
  const w = variant === 1 ? 0.75 : 0.62;
  const d = variant === 1 ? 0.55 : 0.62;
  s.shadow(-w, -d, w, d, 80, 0.3);
  s.box(-w, -d, w, d, 0, 18, stone, null, {
    left: (g, ww) => doorOn(g, ww * 0.62, 16, 24, '#6b4325', '#b9ad97'),
    right: (g, ww) => windowOn(g, ww / 2 - 6, 4, 12, 12, { lit: true }),
  });
  s.box(-w - 0.04, -d - 0.04, w + 0.04, d + 0.04, 18, 44, plaster, null, {
    left: (g, ww) => {
      timberOn(g, ww, 0, 26, '#55361f');
      windowOn(g, 10, 7, 11, 13, { shutters: '#5d7a3a' });
    },
    right: (g, ww) => timberOn(g, ww, 0, 26, '#55361f'),
  });
  s.gable(-w - 0.04, -d - 0.04, w + 0.04, d + 0.04, 44, variant === 1 ? 40 : 48, tiles, variant === 1 ? 'x' : 'y', plaster);
  if (variant !== 2) {
    s.box(-w * 0.5, -0.1, -w * 0.5 + 0.18, 0.08, 70, 96, s.stone('#8f8574', 0.5), s.stone('#3a332c', 0.5));
  }
  return s;
}

export function wellSvg(): Svg {
  const s = new Svg('well');
  s.shadow(-0.4, -0.4, 0.4, 0.4, 60, 0.25);
  const t = s.tower(0, 0, 0.36, 0, 18, '#a89d88');
  s.ellipse(t.sx, t.top, t.rx * 0.78, t.ry * 0.78, '#1f3340');
  s.ellipse(t.sx - 4, t.top - 1, t.rx * 0.3, t.ry * 0.2, '#6d8fa6', 'opacity="0.6"');
  s.line([t.sx - t.rx * 0.9, t.top], [t.sx - t.rx * 0.9, t.top - 40], '#5b3b22', 3);
  s.line([t.sx + t.rx * 0.9, t.top], [t.sx + t.rx * 0.9, t.top - 40], '#4a2f1b', 3);
  s.path(`M${t.sx - t.rx * 1.2} ${t.top - 36} L${t.sx} ${t.top - 54} L${t.sx + t.rx * 1.2} ${t.top - 36} Z`, '#8e4a2f');
  s.path(`M${t.sx} ${t.top - 54} L${t.sx + t.rx * 1.2} ${t.top - 36} L${t.sx} ${t.top - 36} Z`, '#6b3420');
  s.line([t.sx, t.top - 34], [t.sx, t.top - 12], '#3a2a1a', 1.2);
  s.raw(`<rect x="${t.sx - 4}" y="${t.top - 14}" width="8" height="7" fill="#6b4a2c"/>`);
  return s;
}

export function stallSvg(color: string): Svg {
  const s = new Svg(`stall${color}`);
  s.shadow(-0.5, -0.35, 0.5, 0.35, 50, 0.25);
  const wood = s.planks('#7a5232');
  s.box(-0.45, -0.3, 0.45, 0.3, 0, 16, wood, s.planks('#8a6240'));
  // mercadorias
  const goods = ['#d9534f', '#f2c14e', '#7cb342', '#e08e3c'];
  for (let i = 0; i < 6; i++) {
    const [x, y] = iso(-0.3 + (i % 3) * 0.3, -0.12 + Math.floor(i / 3) * 0.22, 16);
    s.ellipse(x, y - 3, 5, 4, goods[i % goods.length]);
  }
  for (const [px, py] of [
    [-0.45, 0.3],
    [0.45, 0.3],
    [0.45, -0.3],
  ]) {
    const [x, y] = iso(px, py, 0);
    s.line([x, y], [x, y - 44], '#5b3b22', 2.6);
  }
  const p = (x: number, y: number, z: number) => iso(x, y, z);
  const stripes = 5;
  for (let i = 0; i < stripes; i++) {
    const a = -0.55 + (1.1 * i) / stripes;
    const b = a + 1.1 / stripes;
    s.poly([p(a, 0.42, 38), p(b, 0.42, 38), p(b, -0.34, 52), p(a, -0.34, 52)], i % 2 ? '#f4ead6' : color);
  }
  s.poly([p(-0.55, 0.42, 38), p(0.55, 0.42, 38), p(0.55, -0.34, 52), p(-0.55, -0.34, 52)], s.linear('awn', [[0, '#1a1410', 0.25], [1, '#fff6dc', 0.1]]));
  for (let i = 0; i < stripes; i++) {
    const a = -0.55 + (1.1 * i) / stripes;
    const b = a + 1.1 / stripes;
    const [x0, y0] = p(a, 0.42, 38);
    const [x1, y1] = p(b, 0.42, 38);
    s.path(`M${x0} ${y0} L${x1} ${y1} Q${(x0 + x1) / 2} ${(y0 + y1) / 2 + 9} ${x0} ${y0} Z`, i % 2 ? '#f4ead6' : shade(color, -0.1));
  }
  return s;
}

export function barrelsSvg(): Svg {
  const s = new Svg('barrels');
  s.ellipse(4, 0, 22, 8, '#10120a', `opacity="0.25" filter="${s.blur(3)}"`);
  const barrel = (x: number, y: number) => {
    s.raw(`<rect x="${x - 7}" y="${y - 20}" width="14" height="20" rx="4" fill="#7a4f2c"/>`);
    s.raw(`<rect x="${x + 1}" y="${y - 20}" width="6" height="20" rx="3" fill="#5c3a1f"/>`);
    s.raw(`<rect x="${x - 7}" y="${y - 16}" width="14" height="2" fill="#3a3a3a"/><rect x="${x - 7}" y="${y - 6}" width="14" height="2" fill="#3a3a3a"/>`);
    s.ellipse(x, y - 20, 7, 3, '#8f6440');
    s.extend(x - 8, y - 24);
  };
  const crate = (x: number, y: number) => {
    s.raw(`<rect x="${x - 9}" y="${y - 16}" width="18" height="16" fill="#a07a4a" stroke="#6b4a2c" stroke-width="1.5"/>`);
    s.line([x - 9, y - 16], [x + 9, y], '#6b4a2c', 1.5);
    s.extend(x - 10, y - 18);
  };
  crate(10, 2);
  barrel(-8, -2);
  barrel(2, 4);
  return s;
}

export function lampSvg(): Svg {
  const s = new Svg('lamp');
  s.ellipse(3, 0, 6, 3, '#10120a', `opacity="0.3" filter="${s.blur(2)}"`);
  s.line([0, 0], [0, -44], '#2b2118', 2.6);
  s.line([0, -44], [8, -44], '#2b2118', 2);
  s.raw(`<rect x="4" y="-44" width="8" height="11" rx="2" fill="#2b2118"/><rect x="5.4" y="-42.5" width="5.2" height="8" rx="1" fill="#ffd27a"/>`);
  s.ellipse(8, -38, 13, 13, s.radial('lglow', [[0, '#ffcf73', 0.5], [1, '#ffcf73', 0]]));
  return s;
}

export function cartSvg(): Svg {
  const s = new Svg('cart');
  s.ellipse(4, 0, 26, 9, '#10120a', `opacity="0.25" filter="${s.blur(3)}"`);
  s.raw('<rect x="-18" y="-24" width="32" height="12" fill="#8a6240" stroke="#5c3a1f" stroke-width="1.5"/>');
  s.path('M-16 -24 Q-2 -40 12 -24 Z', '#d9b552');
  s.line([14, -16], [30, -8], '#5c3a1f', 2.4);
  s.ellipse(-10, -9, 9, 9, '#5c3a1f');
  s.ellipse(-10, -9, 6, 6, '#7a5232');
  s.ellipse(8, -9, 9, 9, '#5c3a1f');
  s.ellipse(8, -9, 6, 6, '#7a5232');
  s.extend(-20, -42);
  return s;
}

/** Lote reservado para construções futuras: estacas e cordas. */
export function plotSvg(size: number): Svg {
  const s = new Svg(`plot${size}`);
  const h = size / 2;
  const pts = [iso(-h, -h), iso(h, -h), iso(h, h), iso(-h, h)];
  s.poly(pts, '#8a7350', 'opacity="0.35"');
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    s.line([a[0], a[1] - 10], [b[0], b[1] - 10], '#e8dcc0', 1.2, 'opacity="0.8"');
  }
  for (const [x, y] of pts) {
    s.raw(`<rect x="${x - 2}" y="${y - 16}" width="4" height="16" fill="#6b4a2c"/>`);
  }
  return s;
}
