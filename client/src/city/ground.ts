// Terreno pintado proceduralmente em blocos (chunks) de 1024 px de mundo. Cada bloco
// vira uma textura; o resultado é contínuo, sem grade aparente, e só é refeito
// quando a cidade muda de estágio (muralhas maiores, novas estradas).

import { CITY_GRID } from '../../../shared/cityLayout';
import { HH, HW, rng } from './svg';

export const CHUNK = 1024;
export const CHUNK_RES = 0.75;
const HALF = CITY_GRID / 2;

/** Projeção com origem no centro da cidade (tiles relativos ao centro). */
export const P = (dx: number, dy: number): [number, number] => [(dx - dy) * HW, (dx + dy) * HH];
/** Inversa da projeção (px de mundo → tiles relativos). */
export const U = (wx: number, wy: number): [number, number] => [(wx / HW + wy / HH) / 2, (wy / HH - wx / HW) / 2];

export interface GroundSpec {
  wallHalf: number;
  roads: [number, number][][]; // polilinhas em tiles relativos
  plaza: { dx: number; dy: number; r: number };
  fields: { dx: number; dy: number; w: number; d: number; crop: number }[];
  /** Meia-largura das muralhas: o fosso corre logo do lado de fora. */
  moat?: number;
  pond: { dx: number; dy: number; r: number };
}

export const WORLD_BOUNDS = { x0: -HALF * 2 * HW, x1: HALF * 2 * HW, y0: -HALF * 2 * HH, y1: HALF * 2 * HH };

let noiseCanvas: HTMLCanvasElement | null = null;

/** Mapa de variação de cor em baixa resolução, ampliado com suavização = manchas naturais. */
function noise(): HTMLCanvasElement {
  if (noiseCanvas) return noiseCanvas;
  const w = 160;
  const h = 80;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const r = rng(4242);
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = r();
    img.data[i * 4] = v * 255;
    img.data[i * 4 + 1] = v * 255;
    img.data[i * 4 + 2] = v * 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseCanvas = c;
  return c;
}

function insideDiamond(dx: number, dy: number, half: number) {
  return Math.abs(dx) <= half && Math.abs(dy) <= half;
}

/** Pinta um bloco cujo canto superior esquerdo (mundo) é (wx, wy). */
export function paintChunk(spec: GroundSpec, wx: number, wy: number): HTMLCanvasElement {
  const size = Math.round(CHUNK * CHUNK_RES);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.scale(CHUNK_RES, CHUNK_RES);
  ctx.translate(-wx, -wy);
  const r = rng(Math.abs(Math.round(wx * 7 + wy * 13)) + 11);

  // 1. Base: floresta escura fora do mapa, prado no mapa, gramado mais claro dentro das muralhas.
  ctx.fillStyle = '#1f2b1b';
  ctx.fillRect(wx, wy, CHUNK, CHUNK);
  const diamond = (half: number) => {
    ctx.beginPath();
    const a = P(-half, -half);
    const b = P(half, -half);
    const d = P(half, half);
    const e = P(-half, half);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(d[0], d[1]);
    ctx.lineTo(e[0], e[1]);
    ctx.closePath();
  };
  ctx.save();
  diamond(HALF);
  ctx.fillStyle = '#46532f';
  ctx.fill();
  ctx.restore();
  // gramado da cidade com borda suave (camadas em vez de blur, que é caro no Safari)
  for (let k = 0; k < 6; k++) {
    ctx.save();
    diamond(spec.wallHalf + 2.2 - k * 0.25);
    ctx.fillStyle = 'rgba(92,100,60,0.2)';
    ctx.fill();
    ctx.restore();
  }

  // 2. Manchas de variação (ruído ampliado), multiplicadas sobre a base.
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.globalCompositeOperation = 'soft-light';
  ctx.imageSmoothingEnabled = true;
  const W = WORLD_BOUNDS;
  ctx.drawImage(noise(), W.x0 - 256, W.y0 - 256, W.x1 - W.x0 + 512, W.y1 - W.y0 + 512);
  ctx.restore();
  // manchas de luz e sombra amplas
  for (let i = 0; i < 14; i++) {
    const x = wx + r() * CHUNK;
    const y = wy + r() * CHUNK;
    const rad = 60 + r() * 160;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const light = r() > 0.5;
    g.addColorStop(0, light ? 'rgba(170,160,110,0.1)' : 'rgba(20,24,14,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // 3. Campos cultivados fora das muralhas.
  for (const fld of spec.fields) {
    const pts = [P(fld.dx - fld.w / 2, fld.dy - fld.d / 2), P(fld.dx + fld.w / 2, fld.dy - fld.d / 2), P(fld.dx + fld.w / 2, fld.dy + fld.d / 2), P(fld.dx - fld.w / 2, fld.dy + fld.d / 2)];
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    const base = ['#5e4a30', '#7a6a3a', '#4f5a30', '#76623a'][fld.crop % 4];
    ctx.fillStyle = base;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = fld.crop % 2 ? 'rgba(60,40,20,0.35)' : 'rgba(255,240,180,0.18)';
    ctx.lineWidth = 6;
    for (let t = -fld.w; t <= fld.w; t += 0.22) {
      const a = P(fld.dx + t, fld.dy - fld.d);
      const b = P(fld.dx + t, fld.dy + fld.d);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(40,60,20,0.55)';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  // 4. Lago com margem e reflexo.
  {
    const [px, py] = P(spec.pond.dx, spec.pond.dy);
    const rx = spec.pond.r * HW * 1.4;
    const ry = spec.pond.r * HH * 1.4;
    ctx.save();
    ctx.fillStyle = '#7d6a45';
    ctx.beginPath();
    ctx.ellipse(px, py, rx * 1.12, ry * 1.16, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(px - rx * 0.3, py - ry * 0.3, 0, px, py, rx);
    g.addColorStop(0, '#46677a');
    g.addColorStop(0.7, '#2d4a5a');
    g.addColorStop(1, '#1f3442');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const yy = py - ry * 0.5 + i * ry * 0.2;
      ctx.beginPath();
      ctx.moveTo(px - rx * 0.4 + r() * 20, yy);
      ctx.lineTo(px - rx * 0.1 + r() * 30, yy);
      ctx.stroke();
    }
    // juncos
    ctx.strokeStyle = '#3f6a2a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2;
      const x = px + Math.cos(a) * rx * 1.05;
      const y = py + Math.sin(a) * ry * 1.08;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 6, y - 10 - r() * 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 5. Estradas de terra: borda escura difusa, leito claro, sulcos e pedrinhas.
  const strokeRoad = (pts: [number, number][], width: number, color: string, blur = 0) => {
    ctx.save();
    if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const w = pts.map(([a, b]) => P(a, b));
    ctx.moveTo(w[0][0], w[0][1]);
    for (let i = 1; i < w.length - 1; i++) {
      const mx = (w[i][0] + w[i + 1][0]) / 2;
      const my = (w[i][1] + w[i + 1][1]) / 2;
      ctx.quadraticCurveTo(w[i][0], w[i][1], mx, my);
    }
    ctx.lineTo(w[w.length - 1][0], w[w.length - 1][1]);
    ctx.stroke();
    ctx.restore();
  };
  for (const [w, c] of [
    [86, 'rgba(70,50,25,0.14)'],
    [78, 'rgba(70,50,25,0.22)'],
    [70, 'rgba(80,58,30,0.4)'],
    [62, '#7a6648'],
    [50, '#84704f'],
    [40, '#8c7856'],
  ] as const) {
    for (const road of spec.roads) strokeRoad(road, w, c);
  }
  for (const road of spec.roads) {
    for (const off of [-0.16, 0.16]) strokeRoad(road.map(([a, b]) => [a + off * 0.7, b - off * 0.7]), 4, 'rgba(90,66,36,0.45)');
  }

  // 5b. Fosso: água escura entre margens de pedra, logo fora das muralhas.
  if (spec.moat) {
    const ring = (half: number) => {
      const a = P(-half, -half);
      const b = P(half, -half);
      const d = P(half, half);
      const e = P(-half, half);
      return [a, b, d, e];
    };
    const path = (pts: [number, number][]) => {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
    };
    const outer = ring(spec.moat + 1.85);
    const inner = ring(spec.moat + 0.55);
    ctx.save();
    ctx.beginPath();
    path(ring(spec.moat + 2.05));
    path(ring(spec.moat + 0.4).reverse());
    ctx.fillStyle = '#4e4a42';
    ctx.fill('evenodd');
    ctx.beginPath();
    path(outer);
    path(inner.reverse());
    const wg = ctx.createLinearGradient(0, -1600, 0, 1600);
    wg.addColorStop(0, '#2b4350');
    wg.addColorStop(1, '#1b2c36');
    ctx.fillStyle = wg;
    ctx.fill('evenodd');
    ctx.clip('evenodd');
    ctx.strokeStyle = 'rgba(170,190,200,0.16)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 160; i++) {
      const x = wx + r() * CHUNK;
      const y = wy + r() * CHUNK;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18 + r() * 20, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(20,18,15,0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    path(outer);
    ctx.stroke();
    ctx.beginPath();
    path(ring(spec.moat + 0.55));
    ctx.stroke();
  }

  // 6. Praça calçada diante da prefeitura.
  {
    const [px, py] = P(spec.plaza.dx, spec.plaza.dy);
    const rx = spec.plaza.r * HW * 1.4;
    const ry = spec.plaza.r * HH * 1.4;
    ctx.save();
    for (const k of [1.1, 1.06, 1.03]) {
      ctx.fillStyle = 'rgba(70,55,35,0.22)';
      ctx.beginPath();
      ctx.ellipse(px, py, rx * k, ry * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7d776c';
    ctx.fill();
    ctx.clip();
    for (let ring = 0; ring < 9; ring++) {
      const k = 1 - ring / 9;
      const n = Math.max(6, Math.round(48 * k));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.3;
        const x = px + Math.cos(a) * rx * k;
        const y = py + Math.sin(a) * ry * k;
        const tone = 105 + Math.floor(r() * 40);
        ctx.fillStyle = `rgb(${tone},${tone - 10},${tone - 28})`;
        ctx.beginPath();
        ctx.ellipse(x, y, 14 * (0.6 + k * 0.4), 7 * (0.6 + k * 0.4), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,65,45,0.5)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 7. Detalhe fino: tufos de grama, flores silvestres e pedrinhas (só sobre o prado).
  const tufts = 700;
  for (let i = 0; i < tufts; i++) {
    const x = wx + r() * CHUNK;
    const y = wy + r() * CHUNK;
    const [dx, dy] = U(x, y);
    if (!insideDiamond(dx, dy, HALF)) continue;
    const g = 60 + Math.floor(r() * 40);
    ctx.strokeStyle = `rgba(${g + 10},${g + 30},${g - 20},0.5)`;
    ctx.lineWidth = 1.4;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(x + k * 2, y);
      ctx.lineTo(x + k * 2 + (r() - 0.5) * 6, y - 5 - r() * 7);
      ctx.stroke();
    }
  }
  const flowers = ['#a8954a', '#b9b2a0', '#7a4a4a'];
  for (let i = 0; i < 14; i++) {
    const x = wx + r() * CHUNK;
    const y = wy + r() * CHUNK;
    const [dx, dy] = U(x, y);
    if (!insideDiamond(dx, dy, HALF)) continue;
    ctx.fillStyle = flowers[Math.floor(r() * flowers.length)];
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.arc(x + (r() - 0.5) * 22, y + (r() - 0.5) * 11, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = wx + r() * CHUNK;
    const y = wy + r() * CHUNK;
    ctx.fillStyle = `rgba(${150 + r() * 40},${145 + r() * 30},${130},0.8)`;
    ctx.beginPath();
    ctx.ellipse(x, y, 2 + r() * 3, 1.4 + r() * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 8. Borda do mapa dissolvida em floresta.
  for (const [w, a] of [
    [260, 0.25],
    [180, 0.35],
    [100, 0.5],
  ] as const) {
    ctx.save();
    diamond(HALF + 0.5);
    ctx.lineWidth = w;
    ctx.strokeStyle = `rgba(20,28,18,${a})`;
    ctx.stroke();
    ctx.restore();
  }
  return c;
}
