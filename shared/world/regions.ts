// Regiões conquistáveis e pontos de partida. Dados gerados por tools/build-regions.mjs a partir do
// Natural Earth; aqui só há leitura e funções puras, usadas pelo cliente e pelo servidor.
import regionsJson from './regions.json';
import startPointsJson from './startpoints.json';

export interface RegionDef {
  /** `adm1_code` do Natural Earth da maior unidade da região; é o id gravado no banco. */
  id: string;
  /** País (código de `countries.json`). */
  country: string;
  name: string;
  /** Área em km². */
  area: number;
  /** Ponto de rótulo [longitude, latitude]. */
  at: [number, number];
  /** Regiões com fronteira terrestre. */
  neighbors: string[];
}

export interface StartPoint {
  id: string;
  kind: 'capital' | 'strategic';
  name: string;
  country: string;
  /** Região inicial de quem funda a nação neste ponto. */
  region: string;
  at: [number, number];
  /** População da cidade (estimativa do Natural Earth; dado geográfico, não saldo de jogo). */
  population: number;
}

export const REGIONS = regionsJson as RegionDef[];
export const REGION_BY_ID: Record<string, RegionDef> = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
export const START_POINTS = startPointsJson as StartPoint[];
export const START_POINT_BY_ID: Record<string, StartPoint> = Object.fromEntries(START_POINTS.map((p) => [p.id, p]));

export const REGIONS_BY_COUNTRY: Record<string, RegionDef[]> = {};
for (const r of REGIONS) (REGIONS_BY_COUNTRY[r.country] ??= []).push(r);

const R_KM = 6371.0088;
const RAD = Math.PI / 180;

/** Distância em km entre dois pontos [longitude, latitude]. */
export function distanceKm(a: readonly [number, number], b: readonly [number, number]): number {
  const dp = (b[1] - a[1]) * RAD;
  const dl = (b[0] - a[0]) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dl / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

let landmassCache: Map<string, number> | null = null;

/** Quantas regiões são alcançáveis por terra a partir de uma região (inclui ela mesma). */
export function landmassSize(regionId: string): number {
  if (!landmassCache) {
    landmassCache = new Map();
    const seen = new Set<string>();
    for (const start of REGIONS) {
      if (seen.has(start.id)) continue;
      const group: string[] = [];
      const stack = [start.id];
      seen.add(start.id);
      while (stack.length) {
        const id = stack.pop()!;
        group.push(id);
        for (const n of REGION_BY_ID[id].neighbors) {
          if (seen.has(n)) continue;
          seen.add(n);
          stack.push(n);
        }
      }
      for (const id of group) landmassCache.set(id, group.length);
    }
  }
  return landmassCache.get(regionId) ?? 0;
}

/**
 * Regiões neutras para onde um dono pode expandir agora: vizinhas terrestres de alguma região
 * dele que ainda não têm dono. `owned` e `isFree` vêm do estado autoritativo.
 */
export function expansionTargets(owned: Iterable<string>, isFree: (regionId: string) => boolean): string[] {
  const mine = new Set(owned);
  const out = new Set<string>();
  for (const id of mine) {
    for (const n of REGION_BY_ID[id]?.neighbors ?? []) if (!mine.has(n) && isFree(n)) out.add(n);
  }
  return [...out];
}

/** Uma região de `owned` que faz fronteira com `target` (origem da ocupação), ou null. */
export function borderingRegion(owned: Iterable<string>, target: string): string | null {
  const neighbors = new Set(REGION_BY_ID[target]?.neighbors ?? []);
  let best: string | null = null;
  for (const id of owned) {
    if (!neighbors.has(id)) continue;
    // Determinístico: a de menor id, para cliente e servidor escolherem a mesma origem.
    if (best === null || id < best) best = id;
  }
  return best;
}

/** Países em que o conjunto `owned` contém todas as regiões (ocupação de 100%). */
export function dominatedCountries(owned: Iterable<string>): string[] {
  const count: Record<string, number> = {};
  for (const id of owned) {
    const r = REGION_BY_ID[id];
    if (r) count[r.country] = (count[r.country] ?? 0) + 1;
  }
  return Object.keys(count)
    .filter((c) => count[c] === REGIONS_BY_COUNTRY[c].length)
    .sort();
}

/** Ocupação de um país por um dono, de 0 a 1, ponderada pela área das regiões. */
export function countryOccupation(country: string, isMine: (regionId: string) => boolean): number {
  const list = REGIONS_BY_COUNTRY[country] ?? [];
  let total = 0;
  let mine = 0;
  for (const r of list) {
    total += r.area;
    if (isMine(r.id)) mine += r.area;
  }
  return total ? mine / total : 0;
}
