// Texturas pintadas com relevo (cor + mapa de altura) para tirar o aspecto de "massinha".
import * as THREE from 'three';
import { rng, noise2 } from './kit.js';

const cache = new Map();
function canvas(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return [c, c.getContext('2d')];
}
function toTex(c, srgb) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const C = (hex) => new THREE.Color(hex);
const css = (col) => '#' + col.getHexString();
function vary(hex, l, s = 0, h = 0) {
  const c = C(hex);
  c.offsetHSL(h, s, l);
  return css(c);
}
function grain(g, n, amt, seed) {
  const r = rng(seed);
  const img = g.getImageData(0, 0, n, n);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = (r() - 0.5) * amt;
    d[i] += k;
    d[i + 1] += k;
    d[i + 2] += k;
  }
  g.putImageData(img, 0, 0);
}
/** Gera cor e altura em paralelo: draw(gCor, gAltura). */
function pair(key, n, draw, seed = 1, grainAmt = 18) {
  if (cache.has(key)) return cache.get(key);
  const [cc, gc] = canvas(n);
  const [hc, gh] = canvas(n);
  draw(gc, gh, n);
  grain(gc, n, grainAmt, seed);
  const res = { map: toTex(cc, true), bump: toTex(hc, false) };
  cache.set(key, res);
  return res;
}

/** Alvenaria: blocos irregulares, rejunte fundo, cantos lascados, manchas e musgo. */
export function masonry(base, bw = 96, bh = 46) {
  return pair('ms' + base + bw, 512, (g, h, n) => {
    const r = rng(base.length * 31 + bw);
    g.fillStyle = vary(base, -0.28, -0.1);
    g.fillRect(0, 0, n, n);
    h.fillStyle = '#202020';
    h.fillRect(0, 0, n, n);
    for (let y = 0, row = 0; y < n; y += bh, row++) {
      let x = row % 2 ? -bw * 0.5 : 0;
      while (x < n) {
        const w = bw * (0.7 + r() * 0.6);
        const tone = vary(base, (r() - 0.5) * 0.1, (r() - 0.5) * 0.08, (r() - 0.5) * 0.01);
        const m = 3 + r() * 1.5;
        const chip = 4 + r() * 5;
        const path = (ctx) => {
          ctx.beginPath();
          ctx.moveTo(x + m + chip * r(), y + m);
          ctx.lineTo(x + w - m - chip * r(), y + m);
          ctx.lineTo(x + w - m, y + m + chip * r());
          ctx.lineTo(x + w - m, y + bh - m - chip * r());
          ctx.lineTo(x + w - m - chip * r(), y + bh - m);
          ctx.lineTo(x + m + chip * r(), y + bh - m);
          ctx.lineTo(x + m, y + bh - m - chip * r());
          ctx.lineTo(x + m, y + m + chip * r());
          ctx.closePath();
        };
        path(g);
        g.fillStyle = tone;
        g.fill();
        // luz no topo e sombra na base de cada bloco
        const gr = g.createLinearGradient(0, y, 0, y + bh);
        gr.addColorStop(0, 'rgba(255,248,230,0.28)');
        gr.addColorStop(0.25, 'rgba(255,248,230,0)');
        gr.addColorStop(0.8, 'rgba(40,24,10,0)');
        gr.addColorStop(1, 'rgba(40,24,10,0.3)');
        g.fillStyle = gr;
        g.fill();
        // fissuras e poros
        for (let k = 0; k < 3; k++) {
          g.strokeStyle = 'rgba(60,40,20,0.35)';
          g.lineWidth = 1;
          g.beginPath();
          const sx = x + r() * w;
          const sy = y + r() * bh;
          g.moveTo(sx, sy);
          g.lineTo(sx + (r() - 0.5) * 18, sy + (r() - 0.5) * 12);
          g.stroke();
        }
        path(h);
        const hv = 170 + r() * 70;
        h.fillStyle = `rgb(${hv},${hv},${hv})`;
        h.fill();
        x += w;
      }
    }
    // manchas de tempo e musgo (largas, suaves)
    for (let k = 0; k < 26; k++) {
      const x = r() * n;
      const y = r() * n;
      const rad = 20 + r() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const moss = r() > 0.6;
      gr.addColorStop(0, moss ? 'rgba(90,110,50,0.22)' : 'rgba(80,55,30,0.18)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }, 7, 22);
}

/** Telhas cerâmicas/esmaltadas com sobreposição, brilho e sujeira. */
export function rooftiles(base) {
  return pair('rt' + base, 256, (g, h, n) => {
    const r = rng(base.length * 17);
    g.fillStyle = vary(base, -0.3);
    g.fillRect(0, 0, n, n);
    h.fillStyle = '#000';
    h.fillRect(0, 0, n, n);
    const tw = 24;
    const th = 20;
    for (let y = n - th; y > -th; y -= th * 0.8) {
      const row = Math.round(y / th);
      for (let x = row % 2 ? -tw / 2 : 0; x < n; x += tw) {
        const tone = vary(base, (r() - 0.5) * 0.12, (r() - 0.5) * 0.06);
        const shp = (ctx) => {
          ctx.beginPath();
          ctx.moveTo(x + 1, y);
          ctx.lineTo(x + tw - 1, y);
          ctx.lineTo(x + tw - 1, y + th * 0.6);
          ctx.quadraticCurveTo(x + tw / 2, y + th + 3, x + 1, y + th * 0.6);
          ctx.closePath();
        };
        shp(g);
        const gr = g.createLinearGradient(x, 0, x + tw, 0);
        gr.addColorStop(0, vary(tone, 0.1));
        gr.addColorStop(0.45, tone);
        gr.addColorStop(1, vary(tone, -0.16));
        g.fillStyle = gr;
        g.fill();
        g.strokeStyle = vary(base, -0.38);
        g.lineWidth = 1.2;
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.fillRect(x + 4, y + 2, 3, th * 0.5);
        shp(h);
        const hg = h.createLinearGradient(0, y, 0, y + th);
        hg.addColorStop(0, '#666');
        hg.addColorStop(1, '#fff');
        h.fillStyle = hg;
        h.fill();
      }
    }
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '70,80,40' : '30,20,12'},${0.08 + r() * 0.1})`;
      g.beginPath();
      g.ellipse(r() * n, r() * n, 10 + r() * 26, 6 + r() * 12, 0, 0, 7);
      g.fill();
    }
  }, 3, 14);
}

/** Tábuas com veios, nós e frestas. */
export function planks(base) {
  return pair('pk' + base, 256, (g, h, n) => {
    const r = rng(base.length * 5 + 1);
    const bw = 32;
    for (let x = 0; x < n; x += bw) {
      const tone = vary(base, (r() - 0.5) * 0.1);
      g.fillStyle = tone;
      g.fillRect(x, 0, bw, n);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(40,22,10,${0.15 + r() * 0.2})`;
        g.lineWidth = 1;
        g.beginPath();
        const xx = x + 2 + r() * (bw - 4);
        g.moveTo(xx, 0);
        for (let y = 0; y < n; y += 16) g.lineTo(xx + Math.sin(y * 0.05 + k) * 2, y);
        g.stroke();
      }
      if (r() > 0.4) {
        g.fillStyle = 'rgba(50,28,12,0.6)';
        g.beginPath();
        g.ellipse(x + bw / 2, r() * n, 3, 5, 0, 0, 7);
        g.fill();
      }
      g.fillStyle = 'rgba(20,10,4,0.85)';
      g.fillRect(x + bw - 2, 0, 2, n);
      h.fillStyle = '#ddd';
      h.fillRect(x, 0, bw - 2, n);
      h.fillStyle = '#222';
      h.fillRect(x + bw - 2, 0, 2, n);
      // pregos
      for (const y of [20, n - 20]) {
        g.fillStyle = '#3a3634';
        g.fillRect(x + 6, y, 3, 3);
        g.fillRect(x + bw - 10, y, 3, 3);
      }
    }
  }, 5, 16);
}

/** Pedra de calçamento. */
export function cobbles(base) {
  return pair('cb' + base, 256, (g, h, n) => {
    const r = rng(9);
    g.fillStyle = vary(base, -0.3);
    g.fillRect(0, 0, n, n);
    h.fillStyle = '#111';
    h.fillRect(0, 0, n, n);
    for (let i = 0; i < 260; i++) {
      const x = r() * n;
      const y = r() * n;
      const rx = 7 + r() * 9;
      const ry = 6 + r() * 7;
      g.fillStyle = vary(base, (r() - 0.5) * 0.14);
      g.beginPath();
      g.ellipse(x, y, rx, ry, r() * 3, 0, 7);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.beginPath();
      g.ellipse(x - 2, y - 2, rx * 0.5, ry * 0.4, 0, 0, 7);
      g.fill();
      const hg = h.createRadialGradient(x, y, 0, x, y, rx);
      hg.addColorStop(0, '#fff');
      hg.addColorStop(1, '#333');
      h.fillStyle = hg;
      h.beginPath();
      h.ellipse(x, y, rx, ry, 0, 0, 7);
      h.fill();
    }
  }, 9, 14);
}

/** Relevo de grama para o chão (tileável), usado como bump. */
export function grassBump() {
  return pair('gb', 512, (g, h, n) => {
    const r = rng(4);
    h.fillStyle = '#808080';
    h.fillRect(0, 0, n, n);
    for (let i = 0; i < 18000; i++) {
      const x = r() * n;
      const y = r() * n;
      const v = 60 + r() * 195;
      h.strokeStyle = `rgb(${v},${v},${v})`;
      h.lineWidth = 1.2;
      h.beginPath();
      h.moveTo(x, y);
      h.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 5);
      h.stroke();
    }
    g.fillStyle = '#fff';
    g.fillRect(0, 0, n, n);
  }, 1, 0).bump;
}

export function leafNoiseColor(geo, base) {
  // variação de cor por vértice: aglomerados de folhas claras/escuras
  const p = geo.attributes.position;
  const cols = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = noise2(x * 6.1 + z * 2.3, y * 6.7 - z * 3.1) * 0.6 + noise2(x * 17, z * 17 + y * 9) * 0.4;
    c.set(base).offsetHSL(n * 0.03, 0, n * 0.26 + (y > 0.2 ? 0.08 : -0.1));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
}

/** Reboco pintado: manchas suaves, sujeira na base, pequenas rachaduras. */
export function plaster(base) {
  return pair('pl' + base, 512, (g, h, n) => {
    const r = rng(base.length * 3 + 11);
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    h.fillStyle = '#909090';
    h.fillRect(0, 0, n, n);
    for (let k = 0; k < 90; k++) {
      const x = r() * n, y = r() * n, rad = 20 + r() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const light = r() > 0.5;
      gr.addColorStop(0, light ? 'rgba(255,250,235,0.16)' : 'rgba(150,110,60,0.12)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      const hv = light ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
      const hg = h.createRadialGradient(x, y, 0, x, y, rad * 0.5);
      hg.addColorStop(0, hv);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      h.fillStyle = hg;
      h.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let k = 0; k < 10; k++) {
      g.strokeStyle = 'rgba(110,80,50,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      let x = r() * n, y = r() * n;
      g.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (r() - 0.5) * 20; y += 4 + r() * 10; g.lineTo(x, y); }
      g.stroke();
    }
  }, 13, 8);
}
