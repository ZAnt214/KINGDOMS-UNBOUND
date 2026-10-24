// Terreno determinístico e original por reino: o mesmo seed gera o mesmo mapa no
// servidor (validação de posição de cidades) e no cliente (renderização).

export type Biome = 'deep_water' | 'water' | 'sand' | 'grass' | 'forest' | 'hills' | 'mountain';

export const BIOME_COLORS: Record<Biome, string> = {
  deep_water: '#1d4e7a',
  water: '#2f6f9f',
  sand: '#d9c58f',
  grass: '#6fa04b',
  forest: '#3e7a3a',
  hills: '#8f9a5a',
  mountain: '#8a8378',
};

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function fbm(x: number, y: number, seed: number): number {
  let total = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < 4; i++) {
    total += valueNoise(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / norm;
}

export function biomeAt(x: number, y: number, seed: number, width: number, height: number): Biome {
  // Bordas viram oceano para dar contorno ao reino.
  const dx = (x - width / 2) / (width / 2);
  const dy = (y - height / 2) / (height / 2);
  const edge = Math.max(Math.abs(dx), Math.abs(dy));
  const e = fbm(x / 18, y / 18, seed) - Math.max(0, edge - 0.75) * 2.2;
  const moisture = fbm(x / 11 + 50, y / 11 + 50, seed + 7);
  if (e < 0.3) return 'deep_water';
  if (e < 0.38) return 'water';
  if (e < 0.41) return 'sand';
  if (e > 0.72) return 'mountain';
  if (e > 0.63) return 'hills';
  return moisture > 0.55 ? 'forest' : 'grass';
}

export function isBuildable(biome: Biome): boolean {
  return biome === 'grass' || biome === 'forest' || biome === 'sand' || biome === 'hills';
}
