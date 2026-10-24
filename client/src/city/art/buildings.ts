import { doorOn, iso, rng, shade, Svg, timberOn, windowOn } from '../svg';
import { haySvg } from './nature';
import type { Palette } from './townHall';

function embed(s: Svg, child: Svg, x: number, y: number) {
  const r = child.toString(0);
  const [sx, sy] = iso(x, y);
  s.raw(`<g transform="translate(${sx} ${sy})">${r.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`);
  s.extend(sx - r.ox, sy - r.oy);
  s.extend(sx - r.ox + r.w, sy - r.oy + r.h);
}

function crates(s: Svg, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const [sx, sy] = iso(x + (i % 2) * 0.25, y + Math.floor(i / 2) * 0.25);
    s.raw(`<rect x="${sx - 8}" y="${sy - 14}" width="16" height="14" fill="#a07a4a" stroke="#6b4a2c" stroke-width="1.4"/>`);
    s.line([sx - 8, sy - 14], [sx + 8, sy], '#6b4a2c', 1.3);
    s.extend(sx - 9, sy - 16);
  }
}

function logPile(s: Svg, x: number, y: number, rows: number) {
  const [sx, sy] = iso(x, y);
  s.ellipse(sx + 6, sy, 30, 9, '#10120a', `opacity="0.25" filter="${s.blur(3)}"`);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < rows - r + 1; i++) {
      const cx = sx - 18 + i * 12 + r * 6;
      const cy = sy - 6 - r * 10;
      s.raw(`<rect x="${cx - 16}" y="${cy - 5}" width="16" height="10" fill="#7a4f2c"/>`);
      s.ellipse(cx, cy, 5.5, 5.5, '#c99a62');
      s.ellipse(cx, cy, 3, 3, '#a87a44');
    }
  }
  s.extend(sx - 40, sy - rows * 12);
}

export function warehouseSvg(stage: 1 | 2 | 3, p: Palette): Svg {
  const s = new Svg(`wh${stage}`);
  const stone = s.stone(p.stone);
  const plaster = s.stone(shade(p.stone, 0.04));
  const roof = s.tiles(p.roof);
  const hz = stage === 3 ? 70 : 56;
  s.shadow(-1.4, -1.2, 1.3, 1.1, 120, 0.32);
  if (stage >= 2) {
    // anexo lateral
    s.box(-1.35, -1.15, -0.2, -0.35, 0, 40, stone, null, {});
    s.gable(-1.35, -1.15, -0.2, -0.35, 40, 34, roof, 'x', stone);
  }
  s.box(-1.1, -0.85, 1.05, 0.95, 0, hz, stone, null, {
    left: (g, w) => {
      windowOn(g, 20, 18, 12, 18, { arch: true, lit: false });
      windowOn(g, w - 34, 18, 12, 18, { arch: true, lit: false });
      g.raw(`<rect x="0" y="${-hz + 8}" width="${w}" height="4" fill="${shade(p.stone, 0.15)}" opacity="0.7"/>`);
    },
    right: (g, w) => {
      // portão de carga duplo
      const dw = 48;
      g.raw(`<rect x="${w / 2 - dw / 2 - 4}" y="-50" width="${dw + 8}" height="50" fill="${shade(p.stone, -0.25)}"/>`);
      const planks = g.planks('#7a4f2c');
      g.raw(`<rect x="${w / 2 - dw / 2}" y="-46" width="${dw}" height="46" fill="${planks.fill}"/>`);
      g.raw(`<line x1="${w / 2}" y1="-46" x2="${w / 2}" y2="0" stroke="#2a1a0e" stroke-width="1.6"/>`);
      g.raw(`<path d="M${w / 2 - dw / 2} -40 L${w / 2} -6 M${w / 2 + dw / 2} -40 L${w / 2} -6" stroke="#4a2f1b" stroke-width="3"/>`);
    },
  });
  s.box(-1.15, -0.9, 1.1, 1.0, hz, hz + 30, plaster, null, {
    left: (g, w) => {
      g.raw(`<rect x="0" y="-4" width="${w}" height="4" fill="#2c2823" opacity="0.5"/>`);
      windowOn(g, w / 2 - 7, 7, 14, 16, { shutters: '#2e261c' });
    },
    right: (g, w) => {
      g.raw(`<rect x="${w / 2 - 10}" y="-28" width="20" height="22" fill="#1a120b"/>`);
    },
  });
  s.gable(-1.15, -0.9, 1.1, 1.0, hz + 30, 62, roof, 'y', plaster);
  // viga de içamento com corda e saco
  const [bx, by] = iso(1.1, 0.05, hz + 60);
  s.line([bx - 6, by + 4], [bx + 22, by + 4], '#4a2f1b', 4);
  s.line([bx + 18, by + 4], [bx + 18, by + 36], '#c9b48a', 1.2);
  s.ellipse(bx + 18, by + 42, 6, 7, '#c8a46a');
  crates(s, 1.35, 0.6, stage === 1 ? 2 : 4);
  crates(s, 1.35, -0.95, 2);
  return s;
}

export function farmSvg(stage: 1 | 2 | 3, p: Palette): Svg {
  const s = new Svg(`farm${stage}`);
  const r = rng(stage * 11 + 3);
  // campo arado com plantação
  const fx0 = -1.6;
  const fx1 = 1.6;
  const fy0 = 0.05;
  const fy1 = 1.7;
  s.poly([iso(fx0, fy0), iso(fx1, fy0), iso(fx1, fy1), iso(fx0, fy1)], '#54422c');
  const rows = 9;
  for (let i = 0; i < rows; i++) {
    const t = fx0 + 0.15 + ((fx1 - fx0 - 0.3) * i) / (rows - 1);
    s.line(iso(t, fy0 + 0.1), iso(t, fy1 - 0.1), '#3e3020', 3);
    for (let k = 0; k < 7; k++) {
      const yy = fy0 + 0.2 + ((fy1 - fy0 - 0.4) * k) / 6;
      const [cx, cy] = iso(t + 0.06, yy);
      const ripe = stage >= 2 ? '#a89048' : '#66763a';
      s.path(`M${cx - 3} ${cy} q3 -${9 + r() * 4} 6 0 z`, k % 2 ? ripe : shade(ripe, -0.12));
    }
  }
  // cerca do campo
  const fence = (a: [number, number], b: [number, number]) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5);
    for (let i = 0; i <= n; i++) {
      const [px, py] = iso(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n);
      s.raw(`<rect x="${px - 1.6}" y="${py - 16}" width="3.2" height="16" fill="#6b4a2c"/>`);
    }
    for (const z of [6, 12]) s.line(iso(a[0], a[1], z), iso(b[0], b[1], z), '#86603a', 2);
  };
  fence([fx0, fy1], [fx1, fy1]);
  fence([fx1, fy0], [fx1, fy1]);
  // celeiro
  s.shadow(-1.2, -1.5, 0.6, -0.1, 110, 0.32);
  const planks = s.planks('#4f3b2b');
  s.box(-1.15, -1.45, 0.55, -0.15, 0, 48, planks, null, {
    left: (g, w) => {
      g.raw(`<rect x="${w / 2 - 22}" y="-40" width="44" height="40" fill="#1e1610"/>`);
      g.raw(`<rect x="${w / 2 - 20}" y="-38" width="18" height="38" fill="#3a2a1d" transform="skewY(-8)"/>`);
      g.raw(`<rect x="${w / 2 - 24}" y="-44" width="48" height="5" fill="#2a1e14"/>`);
    },
    right: (g, w) => windowOn(g, w / 2 - 7, 22, 14, 14, { lit: true, frame: '#2a1e14' }),
  });
  s.gable(-1.15, -1.45, 0.55, -0.15, 48, 56, s.thatch('#6e5f3c'), 'y', planks);
  if (stage >= 2) {
    // silo
    const t = s.tower(0.95, -1.05, 0.38, 0, 84, '#8a857c');
    s.cone(t.sx, t.top, t.rx, t.ry, 30, '#4a4f55');
  }
  if (stage >= 3) {
    // moinho de vento (as velas giram no motor)
    const t = s.tower(-1.55, -0.2, 0.32, 0, 70, '#8f8a80');
    s.cone(t.sx, t.top, t.rx, t.ry, 34, '#3f454d');
    const hx = t.sx + 6;
    const hy = t.top - 18;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const ex = hx + Math.cos(a) * 46;
      const ey = hy + Math.sin(a) * 46;
      s.line([hx, hy], [ex, ey], '#5b3b22', 2.4);
      const nx = -Math.sin(a) * 7;
      const ny = Math.cos(a) * 7;
      s.poly([[hx + Math.cos(a) * 12, hy + Math.sin(a) * 12], [ex, ey], [ex + nx, ey + ny], [hx + Math.cos(a) * 12 + nx, hy + Math.sin(a) * 12 + ny]], '#b8ab8c', 'opacity="0.92" stroke="#4a3a28" stroke-width="0.8"');
    }
    s.ellipse(hx, hy, 4, 4, '#3b2a1c');
  }
  embed(s, haySvg(), 1.2, -0.05);
  if (stage >= 2) embed(s, haySvg(), 1.5, -0.45);
  return s;
}

export function sawmillSvg(stage: 1 | 2 | 3, p: Palette): Svg {
  const s = new Svg(`saw${stage}`);
  s.shadow(-1.3, -1.2, 0.9, 0.7, 100, 0.3);
  const wood = s.planks('#4f3b2b');
  const plaster = s.plaster('#9c8e72');
  // galpão aberto com serra
  s.box(-1.2, -1.15, 0.85, 0.15, 0, 18, s.stone('#9d927e', 0.7), s.planks('#a07a4a', false));
  const posts: [number, number][] = [
    [-1.15, 0.1],
    [0.8, 0.1],
    [0.8, -1.1],
  ];
  for (const [x, y] of posts) s.box(x - 0.06, y - 0.06, x + 0.06, y + 0.06, 18, 70, wood, null, { edge: false });
  // parede de fundo
  s.box(-1.2, -1.15, 0.85, -0.95, 18, 70, plaster, null, { left: (g, w) => timberOn(g, w, 0, 52) });
  s.box(-1.2, -1.15, -1.0, 0.15, 18, 70, plaster, null, { right: (g, w) => timberOn(g, w, 0, 52) });
  // bancada e lâmina circular
  s.box(-0.7, -0.5, 0.4, -0.25, 18, 30, s.planks('#6b4a2c', false), s.planks('#a07a4a', false));
  const [bx, by] = iso(-0.15, -0.37, 38);
  s.ellipse(bx, by, 11, 11, '#c9ccd0');
  s.ellipse(bx, by, 4, 4, '#6c7076');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    s.line([bx + Math.cos(a) * 10, by + Math.sin(a) * 10], [bx + Math.cos(a + 0.2) * 13, by + Math.sin(a + 0.2) * 13], '#9aa0a6', 1.6);
  }
  s.gable(-1.25, -1.2, 0.9, 0.2, 70, 50, s.tiles(p.roof), 'x', plaster);
  logPile(s, 0.6, 0.85, stage === 1 ? 2 : 3);
  if (stage >= 2) logPile(s, -0.8, 1.0, 2);
  if (stage >= 3) {
    // guindaste de madeira
    const [cx, cy] = iso(1.25, -0.6);
    s.line([cx, cy], [cx, cy - 96], '#5b3b22', 5);
    s.line([cx, cy - 92], [cx - 46, cy - 70], '#5b3b22', 4);
    s.line([cx - 44, cy - 70], [cx - 44, cy - 34], '#c9b48a', 1.4);
    s.raw(`<rect x="${cx - 60}" y="${cy - 36}" width="32" height="8" fill="#7a4f2c"/>`);
    s.extend(cx - 62, cy - 100);
  }
  return s;
}

export function quarrySvg(stage: 1 | 2 | 3, p: Palette): Svg {
  const s = new Svg(`qry${stage}`);
  const r = rng(stage * 29 + 1);
  s.shadow(-1.4, -1.4, 1.2, 1.0, 90, 0.28);
  // paredão rochoso em terraços
  const rockC = '#857f75';
  const layers = stage + 1;
  for (let i = 0; i < layers; i++) {
    const a = 1.3 - i * 0.28;
    const z1 = 26 + i * 24;
    s.box(-a, -a, a * 0.6, a * 0.4 - 0.4, i * 24, z1, s.stone(shade(rockC, -0.05 * i), 1.5), s.stone(shade(rockC, 0.1), 1.6), { edge: false });
  }
  // fraturas
  for (let i = 0; i < 10; i++) {
    const [x, y] = iso(-1 + r() * 1.6, 0.1 - r() * 0.3, 10 + r() * 40);
    s.line([x, y], [x + (r() - 0.5) * 14, y + 8 + r() * 10], shade(rockC, -0.45), 1.4, 'opacity="0.7"');
  }
  // blocos cortados
  const blocks: [number, number][] = [
    [0.8, 0.6],
    [1.15, 0.25],
    [0.5, 0.95],
  ];
  for (const [x, y] of blocks.slice(0, stage + 1)) {
    s.box(x - 0.16, y - 0.12, x + 0.16, y + 0.12, 0, 18, s.stone('#cfc6b4', 0.5), s.stone('#ddd5c4', 0.5));
  }
  // guindaste de roda (pisa)
  const [cx, cy] = iso(0.95, -0.6);
  s.line([cx - 10, cy], [cx + 2, cy - 90], '#5b3b22', 4);
  s.line([cx + 14, cy], [cx + 2, cy - 90], '#4a2f1b', 4);
  s.line([cx + 2, cy - 88], [cx - 50, cy - 70], '#5b3b22', 4);
  s.line([cx - 48, cy - 70], [cx - 48, cy - 30], '#c9b48a', 1.4);
  s.raw(`<rect x="${cx - 56}" y="${cy - 30}" width="16" height="12" fill="#cfc6b4"/>`);
  s.ellipse(cx + 2, cy - 22, 18, 18, 'none', 'stroke="#6b4a2c" stroke-width="4"');
  s.extend(cx - 60, cy - 94);
  return s;
}

export function goldMineSvg(stage: 1 | 2 | 3, p: Palette): Svg {
  const s = new Svg(`gm${stage}`);
  s.shadow(-1.2, -1.2, 1.1, 1.0, 80, 0.28);
  // colina rochosa
  const [hx, hy] = iso(-0.2, -0.3);
  const h = 60 + stage * 14;
  s.extend(hx - 96, hy - h - 6);
  s.extend(hx + 96, hy + 54);
  s.path(`M${hx - 92} ${hy + 30} Q${hx - 70} ${hy - h * 0.7} ${hx - 10} ${hy - h} Q${hx + 50} ${hy - h * 0.9} ${hx + 92} ${hy + 24} Q${hx} ${hy + 52} ${hx - 92} ${hy + 30} Z`, '#6e675c');
  s.path(`M${hx - 10} ${hy - h} Q${hx + 50} ${hy - h * 0.9} ${hx + 92} ${hy + 24} Q${hx + 40} ${hy + 40} ${hx + 6} ${hy + 40} Q${hx + 20} ${hy - h * 0.4} ${hx - 10} ${hy - h} Z`, '#504a42');
  s.path(`M${hx - 92} ${hy + 30} Q${hx - 70} ${hy - h * 0.7} ${hx - 10} ${hy - h} Q${hx - 40} ${hy - h * 0.5} ${hx - 60} ${hy + 10} Z`, '#857d70', 'opacity="0.8"');
  for (let i = 0; i < 8; i++) {
    const a = i / 8;
    s.ellipse(hx - 70 + a * 140, hy - 10 - Math.sin(a * Math.PI) * h * 0.5, 6, 3.5, '#4a5a32', 'opacity="0.6"');
  }
  // entrada escorada em madeira
  const ex = hx + 18;
  const ey = hy + 18;
  s.path(`M${ex - 22} ${ey} L${ex - 22} ${ey - 40} Q${ex} ${ey - 52} ${ex + 22} ${ey - 40} L${ex + 22} ${ey} Z`, '#1a120c');
  s.raw(`<rect x="${ex - 26}" y="${ey - 44}" width="7" height="44" fill="#6b4a2c"/><rect x="${ex + 19}" y="${ey - 44}" width="7" height="44" fill="#5b3b22"/><rect x="${ex - 30}" y="${ey - 50}" width="60" height="8" fill="#7a5232"/>`);
  // trilhos e vagonete com ouro
  s.line([ex - 8, ey], [ex + 30, ey + 26], '#4a4a4a', 2);
  s.line([ex + 8, ey], [ex + 46, ey + 22], '#4a4a4a', 2);
  const vx = ex + 30;
  const vy = ey + 16;
  s.raw(`<path d="M${vx - 14} ${vy - 14} L${vx + 14} ${vy - 14} L${vx + 10} ${vy} L${vx - 10} ${vy} Z" fill="#5a5f66"/>`);
  for (let i = 0; i < 5; i++) s.ellipse(vx - 8 + i * 4, vy - 15 - (i % 2) * 2, 3.4, 3, '#f2c14e');
  s.ellipse(vx - 6, vy + 1, 3, 3, '#2b2b2b');
  s.ellipse(vx + 6, vy + 1, 3, 3, '#2b2b2b');
  // veios dourados
  for (let i = 0; i < 6 + stage * 2; i++) {
    const a = (i * 0.137) % 1;
    s.ellipse(hx - 50 + a * 110, hy - 8 - Math.sin(a * 3.1) * h * 0.4, 2.4, 1.6, '#ffd66b');
  }
  // lanterna
  s.ellipse(ex - 30, ey - 36, 9, 9, s.radial('mglow', [[0, '#ffcf73', 0.6], [1, '#ffcf73', 0]]));
  s.raw(`<rect x="${ex - 33}" y="${ey - 40}" width="6" height="8" fill="#ffd27a"/>`);
  if (stage >= 2) {
    s.box(-1.15, 0.3, -0.45, 0.95, 0, 34, s.planks('#4f3b2b'), null, {
      left: (g, w) => doorOn(g, w / 2 - 9, 18, 24, '#5a3a20', '#9d927e'),
    });
    s.gable(-1.15, 0.3, -0.45, 0.95, 34, 26, s.tiles(p.roof), 'y', s.planks('#4f3b2b'));
  }
  return s;
}

/** Morador: sprite pequeno; as pernas e o balanço são animados no motor. */
export function villagerSvg(tunic: string, hat: boolean, carry: 'none' | 'sack' | 'basket'): Svg {
  const s = new Svg(`v${tunic}${hat}${carry}`);
  s.ellipse(1, 0, 7, 2.6, '#10120a', `opacity="0.35" filter="${s.blur(1.2)}"`);
  s.raw(`<rect x="-3.5" y="-9" width="3" height="9" rx="1.2" fill="#3b2a1c"/><rect x="0.8" y="-9" width="3" height="9" rx="1.2" fill="#2e2016"/>`);
  s.path('M-6 -9 L-5 -22 Q0 -25 5 -22 L6 -9 Z', tunic);
  s.path('M0 -24 Q5 -22 5 -22 L6 -9 L0 -9 Z', shade(tunic, -0.25));
  s.raw('<rect x="-6" y="-14" width="12" height="2" fill="#4a2f1b"/>');
  s.ellipse(0, -27, 4.2, 4.4, '#e8b98f');
  s.ellipse(1.5, -27, 2.4, 4, '#c99772', 'opacity="0.6"');
  if (hat) s.path('M-6 -29 Q0 -36 6 -29 Z', '#c9a24a');
  else s.path('M-4.4 -28 Q0 -33 4.4 -28 Q0 -30 -4.4 -28 Z', '#5a3a20');
  if (carry === 'sack') s.ellipse(-5, -20, 5, 6, '#c8a46a');
  if (carry === 'basket') {
    s.raw('<rect x="3" y="-18" width="8" height="6" rx="1.5" fill="#9a7046"/>');
    s.ellipse(7, -18.5, 3.6, 1.6, '#d9534f');
  }
  s.extend(-8, -37);
  return s;
}

/** Soldado: elmo, cota de malha, tabardo heráldico e arma. */
export function soldierSvg(tabard: string, weapon: 'spear' | 'shield' | 'bow'): Svg {
  const s = new Svg(`sol${tabard}${weapon}`);
  s.ellipse(1, 0, 8, 2.8, '#0b0d08', `opacity="0.4" filter="${s.blur(1.2)}"`);
  if (weapon === 'spear') {
    s.line([7, 2], [7, -50], '#3a2a1a', 1.8);
    s.path('M5 -50 L7 -58 L9 -50 Z', '#b9bcc0');
  }
  s.raw('<rect x="-4" y="-10" width="3.4" height="10" rx="1" fill="#2a2622"/><rect x="0.8" y="-10" width="3.4" height="10" rx="1" fill="#211e1a"/>');
  // cota de malha
  s.path('M-7 -10 L-6 -25 Q0 -29 6 -25 L7 -10 Z', '#6d7075');
  // tabardo
  s.path('M-4.5 -9 L-4.5 -24 L4.5 -24 L4.5 -9 L0 -6 Z', tabard);
  s.path('M0 -24 L4.5 -24 L4.5 -9 L0 -6 Z', '#000000', 'opacity="0.25"');
  s.raw('<rect x="-1" y="-22" width="2" height="9" fill="#e9dcb8" opacity="0.8"/><rect x="-3" y="-19" width="6" height="2" fill="#e9dcb8" opacity="0.8"/>');
  s.ellipse(0, -29, 4.4, 4.6, '#d6a985');
  // elmo com nasal
  s.path('M-5 -29 Q0 -38 5 -29 L5 -27 L-5 -27 Z', '#8d9196');
  s.path('M0 -36 Q5 -33 5 -29 L5 -27 L0 -27 Z', '#5f6368');
  s.raw('<rect x="-0.7" y="-29" width="1.4" height="5" fill="#5f6368"/>');
  if (weapon === 'shield') {
    s.path('M-12 -24 h9 v9 q0 6 -4.5 8 q-4.5 -2 -4.5 -8 z', tabard, 'stroke="#c9a24a" stroke-width="1.2"');
    s.line([6, -12], [12, -30], '#b9bcc0', 2);
  }
  if (weapon === 'bow') s.path('M7 -36 Q13 -22 7 -8', 'none', 'stroke="#4a3220" stroke-width="1.6"');
  s.extend(-13, -60);
  s.extend(13, 3);
  return s;
}
