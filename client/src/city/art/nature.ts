import { iso, rng, shade, Svg } from '../svg';

/** Carvalho: copa em camadas de folhagem com luz do alto à esquerda. */
export function oakSvg(seed: number, scale = 1, autumn = false): Svg {
  const s = new Svg(`oak${seed}`);
  const r = rng(seed * 7919 + 13);
  const base = autumn ? '#c48d36' : '#559b36';
  s.ellipse(0, 0, 30 * scale, 13 * scale, '#10120a', `opacity="0.3" filter="${s.blur(5)}"`);
  s.ellipse(14 * scale, -3 * scale, 34 * scale, 12 * scale, '#10120a', `opacity="0.18" filter="${s.blur(6)}"`);
  // tronco
  s.path(`M${-5 * scale} 0 Q${-4 * scale} ${-26 * scale} ${-2 * scale} ${-46 * scale} L${3 * scale} ${-46 * scale} Q${5 * scale} ${-24 * scale} ${6 * scale} 0 Z`, '#5b3b22');
  s.path(`M${1 * scale} 0 Q${2 * scale} ${-24 * scale} ${3 * scale} ${-46 * scale} L${3 * scale} ${-46 * scale} Q${5 * scale} ${-24 * scale} ${6 * scale} 0 Z`, '#3c2615');
  const blobs: [number, number, number][] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const d = 14 + r() * 10;
    blobs.push([Math.cos(a) * d * 1.15, -66 + Math.sin(a) * d * 0.8, 15 + r() * 8]);
  }
  blobs.push([0, -72, 22], [-6, -58, 18], [8, -60, 18]);
  blobs.sort((a, b) => a[1] - b[1]);
  // sombra interna, corpo e realce
  for (const [x, y, rr] of blobs) s.ellipse(x * scale, (y + 4) * scale, rr * scale, rr * 0.92 * scale, shade(base, -0.45));
  for (const [x, y, rr] of blobs) {
    const lit = (-x - y * 0.2) / 60;
    s.ellipse(x * scale, y * scale, rr * 0.92 * scale, rr * 0.84 * scale, s.radial(`leaf${x}${y}`, [[0,shade(base,.35+lit*.1)],[.55,base],[1,shade(base,-.23)]]));
  }
  for (const [x, y, rr] of blobs.slice(-6)) {
    s.ellipse((x - rr * 0.3) * scale, (y - rr * 0.35) * scale, rr * 0.45 * scale, rr * 0.35 * scale, shade(base, 0.16), 'opacity="0.55"');
  }
  for (let i = 0; i < 6; i++) {
    s.ellipse((r() - 0.5) * 60 * scale, (-66 + (r() - 0.5) * 40) * scale, 2.2 * scale, 1.8 * scale, shade(base, 0.25), 'opacity="0.4"');
  }
  return s;
}

/** Pinheiro em camadas. */
export function pineSvg(seed: number, scale = 1): Svg {
  const s = new Svg(`pine${seed}`);
  const r = rng(seed * 104729 + 7);
  const base = '#2b7850';
  s.ellipse(0, 0, 20 * scale, 9 * scale, '#10120a', `opacity="0.3" filter="${s.blur(4)}"`);
  s.ellipse(16 * scale, -2 * scale, 26 * scale, 8 * scale, '#10120a', `opacity="0.16" filter="${s.blur(5)}"`);
  s.raw(`<rect x="${-3 * scale}" y="${-18 * scale}" width="${6 * scale}" height="${18 * scale}" fill="#4a2f1b"/>`);
  const layers = 5;
  for (let i = 0; i < layers; i++) {
    const w = (30 - i * 5) * scale;
    const yb = (-14 - i * 17) * scale;
    const yt = yb - 30 * scale;
    const j = (r() - 0.5) * 4 * scale;
    s.path(`M${-w} ${yb} Q${-w * 0.4} ${yb - 4 * scale} ${j} ${yt} Q${w * 0.4} ${yb - 4 * scale} ${w} ${yb} Q0 ${yb + 7 * scale} ${-w} ${yb} Z`, shade(base, -0.12 + i * 0.04));
    s.path(`M${-w} ${yb} Q${-w * 0.4} ${yb - 4 * scale} ${j} ${yt} L${j + 2 * scale} ${yb + 4 * scale} Q${-w * 0.5} ${yb + 5 * scale} ${-w} ${yb} Z`, shade(base, 0.1 + i * 0.03));
  }
  s.extend(-32 * scale, -120 * scale);
  return s;
}

export function bushSvg(seed: number): Svg {
  const s = new Svg(`bush${seed}`);
  const r = rng(seed * 31 + 5);
  const base = r() > 0.5 ? '#73aa3e' : '#42894b';
  s.ellipse(2, 0, 20, 8, '#10120a', `opacity="0.28" filter="${s.blur(3)}"`);
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) blobs.push([(r() - 0.5) * 26, -8 - r() * 10, 8 + r() * 5]);
  for (const [x, y, rr] of blobs) s.ellipse(x, y + 2, rr, rr * 0.8, shade(base, -0.35));
  for (const [x, y, rr] of blobs) s.ellipse(x, y, rr * 0.9, rr * 0.75, shade(base, (-x - y) / 120));
  if (r() > 0.9) {
    const col = ['#b8a34a', '#c9c2b0', '#8a4a52'][Math.floor(r() * 3)];
    for (let i = 0; i < 7; i++) s.ellipse((r() - 0.5) * 24, -8 - r() * 12, 1.6, 1.6, col);
  }
  return s;
}

export function rocksSvg(seed: number): Svg {
  const s = new Svg(`rock${seed}`);
  const r = rng(seed * 17 + 3);
  s.ellipse(4, 0, 22, 8, '#10120a', `opacity="0.25" filter="${s.blur(3)}"`);
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 26;
    const w = 7 + r() * 9;
    const h = 6 + r() * 10;
    const c = shade('#7d786f', (r() - 0.5) * 0.2);
    s.path(`M${x - w} 0 L${x - w * 0.7} ${-h * 0.8} L${x - w * 0.1} ${-h} L${x + w * 0.6} ${-h * 0.7} L${x + w} 0 Z`, c);
    s.path(`M${x - w * 0.1} ${-h} L${x + w * 0.6} ${-h * 0.7} L${x + w} 0 L${x + w * 0.1} 0 Z`, shade(c, -0.3));
    s.path(`M${x - w * 0.7} ${-h * 0.8} L${x - w * 0.1} ${-h} L${x - w * 0.2} ${-h * 0.6} Z`, shade(c, 0.25));
    if (r() > 0.5) s.ellipse(x - w * 0.3, -h * 0.4, 3, 1.6, '#4a5a32', 'opacity="0.7"');
  }
  return s;
}

/** Cerca de madeira de 1 tile ao longo de x ou y. */
export function fenceSvg(dir: 'x' | 'y'): Svg {
  const s = new Svg(`fence${dir}`);
  const a = (t: number, z: number) => (dir === 'x' ? iso(t - 0.5, 0, z) : iso(0, t - 0.5, z));
  for (const t of [0, 0.5, 1]) {
    const [x, y] = a(t, 0);
    s.raw(`<rect x="${x - 2}" y="${y - 22}" width="4" height="22" rx="1" fill="#3d2b1c"/>`);
    s.raw(`<rect x="${x - 2}" y="${y - 22}" width="2" height="22" fill="#4f3b2b"/>`);
    s.extend(x, y - 24);
  }
  for (const z of [8, 17]) {
    const p0 = a(0, z);
    const p1 = a(1, z);
    s.line(p0, p1, '#3d2b1c', 3);
    s.line([p0[0], p0[1] - 1], [p1[0], p1[1] - 1], '#55402c', 1.2);
  }
  return s;
}

/** Feno empilhado. */
export function haySvg(): Svg {
  const s = new Svg('hay');
  s.ellipse(6, 0, 22, 8, '#10120a', `opacity="0.25" filter="${s.blur(3)}"`);
  s.path('M-18 0 Q-20 -24 0 -30 Q20 -24 18 0 Z', '#a8904a');
  s.path('M2 -30 Q20 -24 18 0 L4 0 Z', '#7e6a34');
  for (let i = 0; i < 8; i++) s.line([-14 + i * 4, -2], [-10 + i * 3, -24 + Math.abs(i - 4) * 2], '#c2ab62', 1, 'opacity="0.6"');
  return s;
}
