import { doorOn, iso, shade, Svg, timberOn, windowOn } from '../svg';

/** Casa de morador (decoração) — três variantes de arquitetura. */
export function cottageSvg(variant: number, roof: string): Svg {
  const s = new Svg(`cot${variant}`);
  const plaster = s.plaster(variant === 1 ? '#e9d9b6' : '#f1e2bd');
  const stone = s.stone('#d8c9a7', 0.7);
  const tiles = s.tiles(variant === 1 ? roof : variant === 2 ? '#d48c48' : '#bf5d3c');
  const w = variant === 1 ? 0.75 : 0.62;
  const d = variant === 1 ? 0.55 : 0.62;
  s.shadow(-w, -d, w, d, 80, 0.3);
  s.box(-w, -d, w, d, 0, 18, stone, null, {
    left: (g, ww) => doorOn(g, ww * 0.62, 16, 24, '#6b4325', '#b9ad97'),
    right: (g, ww) => windowOn(g, ww / 2 - 6, 4, 12, 12, { lit: true }),
  });
  s.box(-w - 0.04, -d - 0.04, w + 0.04, d + 0.04, 18, 44, plaster, null, {
    left: (g, ww) => {
      timberOn(g, ww, 0, 26, '#2e2116');
      windowOn(g, 10, 7, 11, 13, { shutters: '#2e261c' });
    },
    right: (g, ww) => timberOn(g, ww, 0, 26, '#2e2116'),
  });
  s.gable(-w - 0.04, -d - 0.04, w + 0.04, d + 0.04, 44, variant === 1 ? 40 : 48, tiles, variant === 1 ? 'x' : 'y', plaster);
  if (variant !== 2) {
    s.box(-w * 0.5, -0.1, -w * 0.5 + 0.18, 0.08, 70, 96, s.stone('#6e685f', 0.5), s.stone('#2a2520', 0.5));
  }
  return s;
}

export function wellSvg(): Svg {
  const s = new Svg('well');
  s.shadow(-0.4, -0.4, 0.4, 0.4, 60, 0.25);
  const t = s.tower(0, 0, 0.36, 0, 18, '#d8c9a7');
  s.ellipse(t.sx, t.top, t.rx * 0.78, t.ry * 0.78, '#1f3340');
  s.ellipse(t.sx - 4, t.top - 1, t.rx * 0.3, t.ry * 0.2, '#6d8fa6', 'opacity="0.6"');
  s.line([t.sx - t.rx * 0.9, t.top], [t.sx - t.rx * 0.9, t.top - 40], '#5b3b22', 3);
  s.line([t.sx + t.rx * 0.9, t.top], [t.sx + t.rx * 0.9, t.top - 40], '#4a2f1b', 3);
  s.path(`M${t.sx - t.rx * 1.2} ${t.top - 36} L${t.sx} ${t.top - 54} L${t.sx + t.rx * 1.2} ${t.top - 36} Z`, '#4a4f55');
  s.path(`M${t.sx} ${t.top - 54} L${t.sx + t.rx * 1.2} ${t.top - 36} L${t.sx} ${t.top - 36} Z`, '#33373c');
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
  const goods = ['#8a3a2e', '#a88a3a', '#5d6e32', '#8a5a2e'];
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
    s.poly([p(a, 0.42, 38), p(b, 0.42, 38), p(b, -0.34, 52), p(a, -0.34, 52)], i % 2 ? '#bdb29a' : color);
  }
  s.poly([p(-0.55, 0.42, 38), p(0.55, 0.42, 38), p(0.55, -0.34, 52), p(-0.55, -0.34, 52)], s.linear('awn', [[0, '#1a1410', 0.25], [1, '#fff6dc', 0.1]]));
  for (let i = 0; i < stripes; i++) {
    const a = -0.55 + (1.1 * i) / stripes;
    const b = a + 1.1 / stripes;
    const [x0, y0] = p(a, 0.42, 38);
    const [x1, y1] = p(b, 0.42, 38);
    s.path(`M${x0} ${y0} L${x1} ${y1} Q${(x0 + x1) / 2} ${(y0 + y1) / 2 + 9} ${x0} ${y0} Z`, i % 2 ? '#bdb29a' : shade(color, -0.1));
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

/** Tenda de campanha com flâmula heráldica. */
export function tentSvg(banner: string): Svg {
  const s = new Svg(`tent${banner}`);
  s.shadow(-0.5, -0.4, 0.5, 0.4, 60, 0.3);
  const canvas = '#b3a68a';
  const p = (x: number, y: number, z: number) => iso(x, y, z);
  // tenda de cumeeira ao longo de x
  s.poly([p(-0.5, 0.4, 0), p(0.5, 0.4, 0), p(0.5, 0, 52), p(-0.5, 0, 52)], canvas);
  s.poly([p(-0.5, 0.4, 0), p(0.5, 0.4, 0), p(0.5, 0, 52), p(-0.5, 0, 52)], s.linear('tnt', [[0, '#0e0c0a', 0.3], [1, '#ffe0b0', 0.1]]));
  s.poly([p(0.5, -0.4, 0), p(0.5, 0.4, 0), p(0.5, 0, 52)], shade(canvas, -0.35));
  s.poly([p(0.5, -0.1, 0), p(0.5, 0.1, 0), p(0.5, 0, 30)], '#1a140e');
  for (const t of [-0.25, 0.25]) s.line(p(t, 0.4, 0), p(t, 0, 52), shade(canvas, -0.25), 1.2, 'opacity="0.7"');
  s.line(p(-0.5, 0, 52), p(0.5, 0, 52), '#5a4a32', 2.4);
  const [fx, fy] = p(0.5, 0, 52);
  s.line([fx, fy], [fx, fy - 26], '#2a1e14', 1.8);
  s.path(`M${fx} ${fy - 26} l16 4 l-16 5 z`, banner);
  return s;
}

/** Trabuco de cerco estacionado. */
export function trebuchetSvg(): Svg {
  const s = new Svg('treb');
  s.shadow(-0.6, -0.4, 0.6, 0.4, 90, 0.3);
  const wood = s.planks('#4a3423');
  s.box(-0.6, -0.35, 0.6, -0.2, 0, 10, wood, wood, { edge: false });
  s.box(-0.6, 0.2, 0.6, 0.35, 0, 10, wood, wood, { edge: false });
  for (const yy of [-0.28, 0.28]) {
    s.line(iso(-0.45, yy, 10), iso(0, yy, 96), '#3d2b1c', 5);
    s.line(iso(0.45, yy, 10), iso(0, yy, 96), '#33241a', 5);
  }
  const [ax, ay] = iso(0, 0, 96);
  s.line([ax - 60, ay + 30], [ax + 42, ay - 22], '#4a3423', 5);
  s.raw(`<rect x="${ax + 30}" y="${ay - 30}" width="22" height="20" fill="#3a3a3a" stroke="#1e1e1e" stroke-width="1.5"/>`);
  s.line([ax - 60, ay + 30], [ax - 62, ay + 58], '#8c7a5a', 1.2);
  s.ellipse(ax, ay, 5, 5, '#2a2622');
  s.extend(ax - 66, ay - 34);
  return s;
}

/** Cavalete de armas (lanças e escudos). */
export function weaponRackSvg(banner: string): Svg {
  const s = new Svg(`rack${banner}`);
  s.ellipse(4, 0, 24, 8, '#0b0d08', `opacity="0.3" filter="${s.blur(3)}"`);
  s.line([-18, 0], [-18, -30], '#3d2b1c', 3);
  s.line([18, 6], [18, -24], '#33241a', 3);
  s.line([-18, -26], [18, -20], '#4a3423', 3);
  for (let i = 0; i < 5; i++) {
    const x = -14 + i * 7;
    s.line([x, 2 + i], [x + 3, -46 + i], '#3a2a1a', 1.8);
    s.path(`M${x + 1.8} ${-46 + i} l1.2 -7 l1.2 7 z`, '#b9bcc0');
  }
  for (const [x, y] of [
    [-10, -6],
    [8, -2],
  ]) {
    s.path(`M${x - 6} ${y - 14} h12 v9 q0 6 -6 9 q-6 -3 -6 -9 z`, banner, 'stroke="#c9a24a" stroke-width="1.2"');
  }
  s.extend(-22, -56);
  return s;
}

export function dummySvg(): Svg {
  const s = new Svg('dummy');
  s.ellipse(3, 0, 10, 4, '#0b0d08', `opacity="0.35" filter="${s.blur(2)}"`);
  s.line([0, 0], [0, -40], '#3d2b1c', 3);
  s.line([-12, -30], [12, -30], '#3d2b1c', 3);
  s.path('M-7 -34 Q0 -38 7 -34 L6 -16 Q0 -13 -6 -16 Z', '#8c7a56');
  s.ellipse(0, -40, 6, 6, '#9a8862');
  s.line([-5, -26], [5, -22], '#5a4a32', 1.2);
  return s;
}

export function targetSvg(): Svg {
  const s = new Svg('target');
  s.ellipse(4, 0, 12, 4, '#0b0d08', `opacity="0.35" filter="${s.blur(2)}"`);
  s.line([-6, 0], [0, -30], '#3d2b1c', 2.6);
  s.line([6, 0], [0, -30], '#33241a', 2.6);
  for (const [r, c] of [
    [14, '#d9c9a0'],
    [10, '#8a3a2e'],
    [6, '#d9c9a0'],
    [2.6, '#8a3a2e'],
  ] as const) s.ellipse(0, -30, r, r * 1.05, c);
  s.line([-2, -32], [10, -40], '#3a2a1a', 1.2);
  s.extend(-16, -46);
  return s;
}

/** Jardim ornamental; não representa prédio, produção ou tropa do jogador. */
export function gardenSvg(): Svg {
  const s=new Svg('garden');
  const stone=s.plaster('#e9dab6');
  s.box(-.9,-.6,.9,.6,0,5,stone,s.plaster('#79a84c'));
  for(const y of [-.48,.48]) {
    s.box(-.8,y-.08,.8,y+.08,5,15,s.plaster('#459445'),s.plaster('#81bd4e'));
    for(let x=-.7;x<.8;x+=.18) { const [px,py]=iso(x,y,17);s.ellipse(px,py,3,2,'#efd993'); }
  }
  const t=s.tower(0,0,.24,5,12,'#e7d6ad');
  s.ellipse(t.sx,t.top,t.rx*.8,t.ry*.8,'#63bbc3');
  s.line([t.sx,t.top],[t.sx,t.top-22],'#e5dbbb',5);
  s.ellipse(t.sx,t.top-24,10,5,'#d3b97a');
  s.path(`M${t.sx-8} ${t.top-23} Q${t.sx-14} ${t.top-12} ${t.sx-9} ${t.top} M${t.sx+8} ${t.top-23} Q${t.sx+14} ${t.top-12} ${t.sx+9} ${t.top}`,'none','stroke="#bbf3ea" stroke-width="2" opacity=".8"');
  s.extend(t.sx-15,t.top-30);
  return s;
}
