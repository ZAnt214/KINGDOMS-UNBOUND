import { Texture } from 'pixi.js';
import type { BuildingType } from '../../../shared/rules';
import { plotFor } from '../../../shared/cityLayout';
import { buildingsUrl, BUILDING_FRAME } from './atlas';
import environmentUrl from './art/atlas/environment.webp';

/** Two original, alpha-transparent sheets. World anchors refer to the ground,
 * never the image bottom, so selection, construction and depth remain aligned. */
export interface IllustratedTexture {
  texture: Texture;
  ox: number; oy: number; w: number; h: number; res: number;
  alpha: Uint8ClampedArray | null; cw: number;
}
export type EnvironmentArt = 'cottageBlue' | 'cottageClay' | 'oak' | 'pine' | 'autumn' | 'bush';
const ENVIRONMENT_FRAME: Record<EnvironmentArt, { cell: number; width: number; groundY: number }> = {
  cottageBlue: { cell: 0, width: 184, groundY: 416 },
  cottageClay: { cell: 1, width: 184, groundY: 416 },
  oak: { cell: 2, width: 112, groundY: 478 },
  pine: { cell: 3, width: 115, groundY: 464 },
  autumn: { cell: 4, width: 108, groundY: 465 },
  bush: { cell: 5, width: 60, groundY: 444 },
};
const images = new Map<string, Promise<HTMLImageElement>>();
const frames = new Map<string, Promise<{ texture: Texture; pixels: Uint8ClampedArray | null; canvas: HTMLCanvasElement }>>();
function source(url: string) {
  let pending = images.get(url);
  if (!pending) {
    pending = (async () => { const img = new Image(); img.src = url; await img.decode(); return img; })();
    images.set(url, pending);
    pending.catch(() => images.delete(url));
  }
  return pending;
}
function frame(url: string, cell: number, roof = '') {
  const key = `${url}:${cell}:${roof}`;
  let pending = frames.get(key);
  if (!pending) {
    pending = (async () => {
      const img = await source(url);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, (cell % 3) * 512, Math.floor(cell / 3) * 512, 512, 512, 0, 0, 512, 512);
      const image = ctx.getImageData(0, 0, 512, 512);
      // Only saturated blue/teal roof pixels change heraldry. Preserve limestone,
      // foliage, gold, shadows and alpha; avoid tinting the whole building sprite.
      if (roof && roof !== '#2f6fb3') {
        const n = parseInt(roof.slice(1), 16), color = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        const max = Math.max(...color);
        for (let i = 0; i < image.data.length; i += 4) {
          const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2], a = image.data[i + 3];
          if (a > 20 && b > r * 1.22 && g > r * 1.18 && Math.max(g, b) - r > 38) {
            const light = Math.max(g, b);
            for (let c = 0; c < 3; c++) image.data[i+c] = Math.round(color[c] / max * light);
          }
        }
        ctx.putImageData(image, 0, 0);
      }
      return { texture: Texture.from(canvas), pixels: url === buildingsUrl ? image.data : null, canvas };
    })();
    frames.set(key, pending);
    pending.catch(() => frames.delete(key));
  }
  return pending;
}
async function texture(url: string, cell: number, groundY: number, worldWidth: number, roof = '', interactive = false): Promise<IllustratedTexture> {
  const f = await frame(url, cell, roof);
  const res = 512 / worldWidth;
  return { texture: f.texture, ox: 256 / res, oy: groundY / res, w: worldWidth, h: worldWidth, res,
    alpha: interactive ? f.pixels : null, cw: 512 };
}
export function illustratedBuilding(b: BuildingType, stage: 1 | 2 | 3, roof: string) {
  const f = BUILDING_FRAME[b];
  return texture(buildingsUrl, f.cell, f.groundY, plotFor(b).size[stage - 1] * 128, roof, true);
}
export function illustratedEnvironment(kind: EnvironmentArt) {
  const f = ENVIRONMENT_FRAME[kind];
  return texture(environmentUrl, f.cell, f.groundY, f.width);
}

