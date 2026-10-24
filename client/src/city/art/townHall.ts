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
  return { roof: mix('#168b9b', civColor, 0.6), banner: civColor, accent: civAccent, stone: '#e5d7b8' };
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

export interface HallFx {
  /** Fogos de braseiro (tile relativo ao lote e altura z). */
  fires: [number, number, number][];
  smoke: [number, number, number][];
}

export function hallFx(stage: 1 | 2 | 3): HallFx {
  const a = stage === 1 ? 2 : stage === 2 ? 2.3 : 2.6;
  return { fires: [[a + .55, -.85, 18], [a + .55, .85, 18]], smoke: [] };
}

/** Palácio de Auren: arcadas claras, cobertura de cobre esmaltado e torre octogonal.
 * Mesma pegada e níveis autoritativos; a silhueta é própria do KINGDOMS UNBOUND. */
export function townHallSvg(stage: 1 | 2 | 3, level: number, p: Palette): Svg {
  const s = new Svg(`palace${stage}`);
  const a = stage === 1 ? 2 : stage === 2 ? 2.3 : 2.6;
  const stone = s.stone(p.stone, 1.5);
  const trim = s.plaster('#fff0cd');
  const roof = s.tiles(p.roof);
  const gold = s.plaster('#e5b84f');
  const h = 94 + stage * 18;
  s.shadow(-a, -a, a, a, h + 140, .27);
  s.box(-a, -a, a, a, 0, 14, stone, trim);
  // Rear wings have broad, readable roof planes instead of tiny dark crenels.
  for (const x of [-1.25, 1.25]) {
    s.box(x-.5, -1.65, x+.5, .4, 14, h, stone, trim, {
      left: (g,w) => windowOn(g,w/2-9,20,18,32,{arch:true,lit:false,frame:'#d2b779'}),
      right: (g,w) => { for(let i=1;i<4;i++) windowOn(g,w*i/4-7,22,14,34,{arch:true,lit:false,frame:'#e6ce91'}); }
    });
    s.gable(x-.56,-1.72,x+.56,.46,h+8,48,roof,'y',stone);
  }
  // Main hall and ceremonial arcade.
  s.box(-1.5,-.15,1.5,1.3,14,h-18,stone,trim, {
    left:(g,w)=> { for(let i=0;i<5;i++) {
      const x=w*(i+.5)/5;
      windowOn(g,x-9,13,18,38,{arch:true,lit:false,frame:'#fff0cd'});
      g.raw(`<rect x="${x-15}" y="-61" width="5" height="61" fill="#f8e7bc"/>`);
    }},
    right:(g,w)=>doorOn(g,w/2-19,38,55,'#376777','#fff0cd')
  });
  s.box(-1.56,-.21,1.56,1.36,h-18,h-10,gold,trim);
  s.gable(-1.55,-.2,1.55,1.35,h-8,57,roof,'x',stone);
  // Central lantern: cylindrical masonry, a rounded copper cupola, gold ribs.
  const t = s.tower(-.35,-.55,.63,h-4,68+stage*13,p.stone);
  for (const dx of [-.55,0,.55]) {
    const x=t.sx+dx*t.rx;
    s.path(`M${x-7} ${t.top+49} v-23 a7 7 0 0 1 14 0 v23 z`,'#264b62', 'stroke="#f8e6b8" stroke-width="3"');
  }
  s.ellipse(t.sx,t.top,t.rx*1.13,t.ry*1.13,'#e9bd59');
  const ry=t.ry*1.16, rx=t.rx*1.16, rise=67+stage*11;
  s.path(`M${t.sx-rx} ${t.top} C${t.sx-rx} ${t.top-rise*.7} ${t.sx-22} ${t.top-rise} ${t.sx} ${t.top-rise} C${t.sx+22} ${t.top-rise} ${t.sx+rx} ${t.top-rise*.7} ${t.sx+rx} ${t.top} A${rx} ${ry} 0 0 1 ${t.sx-rx} ${t.top}`,s.linear('cupola',[[0,shade(p.roof,.42)],[.4,p.roof],[1,shade(p.roof,-.36)]],1,0));
  for(const k of [-.65,0,.65]) s.path(`M${t.sx} ${t.top-rise} Q${t.sx+k*rx*.8} ${t.top-rise*.5} ${t.sx+k*rx} ${t.top+ry*Math.sqrt(1-k*k)}`,'none','stroke="#ebc36b" stroke-width="2" opacity=".8"');
  s.line([t.sx,t.top-rise],[t.sx,t.top-rise-24],'#e6b84b',4);
  s.ellipse(t.sx,t.top-rise-25,6,6,'#ffe9a3');
  s.banner(t.sx,t.top-rise-30,30+level,p.banner,p.accent);
  // Front turrets frame the entrance and grow with the city.
  for (const y of [-1.55,1.55]) {
    const t=s.tower(1.55,y,.34,14,70+stage*12,p.stone);
    s.cone(t.sx,t.top,t.rx,t.ry,40,p.roof);
    s.ellipse(t.sx,t.top-42,3,4,'#edc267');
  }
  stairs(s,a,-.65,.65,14,5,p.stone);
  for (const y of [-1,1]) { const [x,sy]=iso(a-.12,y,14); s.banner(x,sy,62,p.banner,p.accent); }
  for(const y of [-.85,.85]) { const [x,sy]=iso(a+.55,y); s.brazier(x,sy); }
  return s;
}
