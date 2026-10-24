// Arte procedural original do KINGDOMS UNBOUND: todas as formas são desenhadas em
// Canvas 2D a partir de primitivas isométricas. Nenhum asset de terceiros.

import type { BuildingType } from '../../shared/rules';

export type Ctx = CanvasRenderingContext2D;

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function diamond(p: Path2D | Ctx, cx: number, cy: number, hw: number, hh: number) {
  p.moveTo(cx, cy - hh);
  p.lineTo(cx + hw, cy);
  p.lineTo(cx, cy + hh);
  p.lineTo(cx - hw, cy);
  p.closePath();
}

/** Caixa isométrica com base centrada em (cx, cy). */
export function isoBox(ctx: Ctx, cx: number, cy: number, hw: number, hh: number, height: number, color: string) {
  // face esquerda
  ctx.fillStyle = shade(color, -0.25);
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx, cy + hh - height);
  ctx.lineTo(cx - hw, cy - height);
  ctx.closePath();
  ctx.fill();
  // face direita
  ctx.fillStyle = shade(color, -0.42);
  ctx.beginPath();
  ctx.moveTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx, cy + hh - height);
  ctx.lineTo(cx + hw, cy - height);
  ctx.closePath();
  ctx.fill();
  // topo
  ctx.fillStyle = color;
  ctx.beginPath();
  diamond(ctx, cx, cy - height, hw, hh);
  ctx.fill();
}

export function pyramidRoof(ctx: Ctx, cx: number, cy: number, hw: number, hh: number, rise: number, color: string) {
  const apexY = cy - rise;
  ctx.fillStyle = shade(color, -0.15);
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx, apexY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, -0.38);
  ctx.beginPath();
  ctx.moveTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx, apexY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, 0.08);
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy);
  ctx.lineTo(cx, cy - hh);
  ctx.lineTo(cx, apexY);
  ctx.closePath();
  ctx.fill();
}

/** Telhado de duas águas ao longo do eixo x isométrico. */
export function gableRoof(ctx: Ctx, cx: number, cy: number, hw: number, hh: number, rise: number, color: string) {
  ctx.fillStyle = shade(color, -0.1);
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx + hw / 2, cy + hh / 2 - rise);
  ctx.lineTo(cx - hw / 2, cy - hh / 2 - rise);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, 0.12);
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy);
  ctx.lineTo(cx, cy - hh);
  ctx.lineTo(cx + hw / 2, cy - hh / 2 - rise);
  ctx.lineTo(cx - hw / 2, cy - hh / 2 - rise);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, -0.4);
  ctx.beginPath();
  ctx.moveTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx + hw / 2, cy + hh / 2 - rise);
  ctx.lineTo(cx + hw, cy);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + hw, cy);
  ctx.lineTo(cx, cy - hh);
  ctx.lineTo(cx + hw / 2, cy - hh / 2 - rise);
  ctx.closePath();
  ctx.fillStyle = shade(color, -0.2);
  ctx.fill();
}

export function flag(ctx: Ctx, x: number, y: number, s: number, color: string, t: number) {
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - s * 1.6);
  ctx.stroke();
  const wave = Math.sin(t / 300 + x) * s * 0.08;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.6);
  ctx.quadraticCurveTo(x + s * 0.5, y - s * 1.5 + wave, x + s, y - s * 1.35);
  ctx.lineTo(x, y - s * 1.1);
  ctx.closePath();
  ctx.fill();
}

export function tree(ctx: Ctx, x: number, y: number, s: number, tint = '#2f6b35') {
  ctx.fillStyle = '#5a3d22';
  ctx.fillRect(x - s * 0.07, y - s * 0.35, s * 0.14, s * 0.35);
  ctx.fillStyle = shade(tint, -0.15);
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.25);
  ctx.lineTo(x + s * 0.42, y - s * 0.3);
  ctx.lineTo(x - s * 0.42, y - s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.25);
  ctx.lineTo(x, y - s * 0.3);
  ctx.lineTo(x - s * 0.42, y - s * 0.3);
  ctx.closePath();
  ctx.fill();
}

export function mountain(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = '#76706a';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.6, y);
  ctx.lineTo(x, y - s * 1.1);
  ctx.lineTo(x + s * 0.6, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5d5853';
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.1);
  ctx.lineTo(x + s * 0.6, y);
  ctx.lineTo(x + s * 0.1, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#efece6';
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.1);
  ctx.lineTo(x + s * 0.18, y - s * 0.78);
  ctx.lineTo(x - s * 0.18, y - s * 0.78);
  ctx.closePath();
  ctx.fill();
}

/** Cidade no mapa-múndi: muralha + torre central, tamanho cresce com a prefeitura. */
export function mapCastle(ctx: Ctx, x: number, y: number, s: number, color: string, accent: string, hall: number, t: number) {
  const k = s * (0.85 + Math.min(hall, 10) * 0.04);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + k * 0.05, k * 1.0, k * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, x, y, k * 0.9, k * 0.45, k * 0.28, '#b9ad97');
  ctx.fillStyle = '#7f9a52';
  ctx.beginPath();
  diamond(ctx, x, y - k * 0.28, k * 0.68, k * 0.34);
  ctx.fill();
  isoBox(ctx, x, y - k * 0.28, k * 0.38, k * 0.19, k * 0.55, '#d8ccb4');
  pyramidRoof(ctx, x, y - k * 0.83, k * 0.42, k * 0.21, k * 0.55, color);
  flag(ctx, x, y - k * 1.35, k * 0.35, accent, t);
}

const BUILDING_COLORS: Record<BuildingType, string> = {
  town_hall: '#d8ccb4',
  farm: '#c79a55',
  sawmill: '#9a6b3e',
  quarry: '#9d978e',
  gold_mine: '#6e5b4a',
  warehouse: '#b7895a',
};

/** Edifício da cidade com variação visual por nível. */
export function cityBuilding(
  ctx: Ctx,
  type: BuildingType,
  x: number,
  y: number,
  s: number,
  level: number,
  roof: string,
  accent: string,
  t: number,
) {
  const grow = 1 + Math.min(level, 10) * 0.07;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.05, s * 1.05, s * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  if (level === 0) {
    ctx.fillStyle = '#8c7a5b';
    ctx.beginPath();
    diamond(ctx, x, y, s * 0.8, s * 0.4);
    ctx.fill();
    ctx.strokeStyle = '#5a4630';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#5a3d22';
    ctx.fillRect(x - 2, y - s * 0.7, 4, s * 0.7);
    ctx.fillStyle = '#e6d3a3';
    ctx.fillRect(x - s * 0.32, y - s * 0.75, s * 0.64, s * 0.24);
    return;
  }
  const base = BUILDING_COLORS[type];
  switch (type) {
    case 'town_hall': {
      isoBox(ctx, x, y, s * 0.95, s * 0.48, s * 0.22, '#a89a82');
      isoBox(ctx, x, y - s * 0.22, s * 0.7, s * 0.35, s * 0.55 * grow, base);
      pyramidRoof(ctx, x, y - s * 0.22 - s * 0.55 * grow, s * 0.76, s * 0.38, s * 0.6 * grow, roof);
      const tx = x + s * 0.55;
      const ty = y - s * 0.05;
      isoBox(ctx, tx, ty, s * 0.2, s * 0.1, s * 1.05 * grow, shade(base, 0.05));
      pyramidRoof(ctx, tx, ty - s * 1.05 * grow, s * 0.24, s * 0.12, s * 0.38, roof);
      flag(ctx, x, y - s * 0.22 - s * 0.55 * grow - s * 0.6 * grow, s * 0.32, accent, t);
      break;
    }
    case 'farm': {
      ctx.fillStyle = '#c9b25a';
      ctx.beginPath();
      diamond(ctx, x - s * 0.15, y + s * 0.05, s * 0.85, s * 0.42);
      ctx.fill();
      ctx.strokeStyle = '#8b9a3c';
      ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x - s * 0.15 - s * 0.6 + i * s * 0.12, y + s * 0.05 - s * 0.12 + i * s * 0.06 + s * 0.18);
        ctx.lineTo(x - s * 0.15 + s * 0.0 + i * s * 0.12, y + s * 0.05 + s * 0.18 + i * s * 0.06 - s * 0.18);
        ctx.stroke();
      }
      isoBox(ctx, x + s * 0.45, y - s * 0.1, s * 0.3, s * 0.15, s * 0.32 * grow, '#9e3b2c');
      gableRoof(ctx, x + s * 0.45, y - s * 0.1 - s * 0.32 * grow, s * 0.34, s * 0.17, s * 0.25, '#6b4a2b');
      break;
    }
    case 'sawmill': {
      isoBox(ctx, x, y, s * 0.6, s * 0.3, s * 0.4 * grow, base);
      gableRoof(ctx, x, y - s * 0.4 * grow, s * 0.66, s * 0.33, s * 0.32, roof);
      ctx.fillStyle = '#7a4f2a';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(x - s * 0.7 + i * s * 0.14, y + s * 0.2 - i * s * 0.07, s * 0.08, s * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c99a62';
        ctx.beginPath();
        ctx.ellipse(x - s * 0.7 + i * s * 0.14, y + s * 0.2 - i * s * 0.07, s * 0.045, s * 0.045, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a4f2a';
      }
      break;
    }
    case 'quarry': {
      ctx.fillStyle = '#7d776f';
      ctx.beginPath();
      diamond(ctx, x, y, s * 0.85, s * 0.42);
      ctx.fill();
      isoBox(ctx, x - s * 0.25, y - s * 0.05, s * 0.28, s * 0.14, s * 0.25 * grow, base);
      isoBox(ctx, x + s * 0.25, y + s * 0.05, s * 0.22, s * 0.11, s * 0.18 * grow, shade(base, 0.1));
      isoBox(ctx, x + s * 0.1, y - s * 0.25, s * 0.2, s * 0.1, s * 0.4 * grow, shade(base, -0.05));
      ctx.strokeStyle = '#4a3a28';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.55, y);
      ctx.lineTo(x + s * 0.55, y - s * 0.9);
      ctx.lineTo(x + s * 0.2, y - s * 0.6);
      ctx.stroke();
      break;
    }
    case 'gold_mine': {
      ctx.fillStyle = '#6a625a';
      ctx.beginPath();
      ctx.moveTo(x - s * 0.9, y + s * 0.1);
      ctx.lineTo(x - s * 0.2, y - s * 0.85 * grow);
      ctx.lineTo(x + s * 0.3, y - s * 0.55 * grow);
      ctx.lineTo(x + s * 0.9, y + s * 0.1);
      ctx.lineTo(x, y + s * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2a211b';
      ctx.beginPath();
      ctx.moveTo(x - s * 0.2, y + s * 0.25);
      ctx.quadraticCurveTo(x, y - s * 0.3, x + s * 0.2, y + s * 0.25);
      ctx.closePath();
      ctx.fill();
      const glint = 0.5 + 0.5 * Math.sin(t / 250);
      ctx.fillStyle = `rgba(255, 210, 80, ${0.5 + glint * 0.5})`;
      for (const [dx, dy] of [
        [-0.45, -0.1],
        [0.35, -0.2],
        [0.05, -0.5],
      ]) {
        ctx.beginPath();
        ctx.arc(x + dx * s, y + dy * s, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'warehouse': {
      isoBox(ctx, x, y, s * 0.8, s * 0.4, s * 0.38 * grow, base);
      gableRoof(ctx, x, y - s * 0.38 * grow, s * 0.86, s * 0.43, s * 0.35, roof);
      ctx.fillStyle = '#5a3d22';
      ctx.beginPath();
      ctx.moveTo(x - s * 0.3, y + s * 0.25);
      ctx.lineTo(x - s * 0.1, y + s * 0.35);
      ctx.lineTo(x - s * 0.1, y + s * 0.1);
      ctx.lineTo(x - s * 0.3, y);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  if (level >= 5) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x - s * 0.8, y - s * 0.15, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Andaimes animados durante a obra. */
export function scaffolding(ctx: Ctx, x: number, y: number, s: number, t: number) {
  ctx.strokeStyle = 'rgba(120, 80, 40, 0.9)';
  ctx.lineWidth = 2;
  const h = s * 1.1;
  for (const dx of [-0.7, -0.25, 0.25, 0.7]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y + Math.abs(dx) * -0.1 * s + s * 0.2);
    ctx.lineTo(x + dx * s, y - h + s * 0.2);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const yy = y - i * s * 0.35;
    ctx.beginPath();
    ctx.moveTo(x - 0.7 * s, yy);
    ctx.lineTo(x + 0.7 * s, yy);
    ctx.stroke();
  }
  const bob = Math.sin(t / 200) * s * 0.1;
  ctx.fillStyle = '#f2c14e';
  ctx.beginPath();
  ctx.arc(x + s * 0.3, y - h + bob, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
}
