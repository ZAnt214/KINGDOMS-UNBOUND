// Plano urbano da cidade: posições, pegadas e crescimento visual derivados do estado
// autoritativo (níveis dos edifícios). Não altera regras de jogo; só onde e como
// cada coisa aparece. Coordenadas em tiles isométricos.

import type { BuildingLevels, BuildingType } from './rules';

/** Tamanho total do terreno da cidade (inclui campos e floresta fora das muralhas). */
export const CITY_GRID = 44;
export const CITY_CENTER = CITY_GRID / 2;

/** Estágio visual da cidade (expansão de muralhas) derivado do nível da prefeitura. */
export function cityTier(hallLevel: number): 1 | 2 | 3 {
  return hallLevel >= 7 ? 3 : hallLevel >= 4 ? 2 : 1;
}

/** Meia-largura (tiles) do anel de muralhas por estágio. */
export const WALL_HALF: Record<1 | 2 | 3, number> = { 1: 9, 2: 11, 3: 13 };

/** Estágio visual de um edifício pelo nível (aparência evolui em três fases). */
export function buildingStage(level: number): 0 | 1 | 2 | 3 {
  if (level <= 0) return 0;
  return level >= 7 ? 3 : level >= 4 ? 2 : 1;
}

export interface Plot {
  id: string;
  /** Edifício que ocupa o lote; `null` para lotes reservados a construções futuras. */
  building: BuildingType | null;
  /** Centro relativo ao centro da cidade, em tiles. */
  dx: number;
  dy: number;
  /** Pegada (lado do quadrado, em tiles) por estágio visual 1..3. */
  size: [number, number, number];
  /** Estágio da cidade em que o lote passa a existir. */
  tier: 1 | 2 | 3;
}

// A entrada principal fica na muralha +x (canto inferior direito da tela) e a avenida
// corre ao longo do eixo x até a praça diante da prefeitura.
export const PLOTS: Plot[] = [
  { id: 'hall', building: 'town_hall', dx: -0.5, dy: -0.5, size: [4, 4.6, 5.2], tier: 1 },
  { id: 'warehouse', building: 'warehouse', dx: -5, dy: -4.6, size: [3, 3.2, 3.4], tier: 1 },
  { id: 'farm', building: 'farm', dx: 1.2, dy: 5.8, size: [3.4, 3.6, 3.8], tier: 1 },
  { id: 'quarry', building: 'quarry', dx: 2.2, dy: -6, size: [3, 3.2, 3.4], tier: 1 },
  { id: 'sawmill', building: 'sawmill', dx: -5.8, dy: 2.4, size: [3, 3.2, 3.4], tier: 1 },
  { id: 'gold_mine', building: 'gold_mine', dx: -6.4, dy: -1.2, size: [2.6, 2.8, 3], tier: 1 },
  // Lotes reservados para quartéis, academia, hospital etc. (Fase B) — aparecem com a expansão.
  { id: 'reserve_a', building: null, dx: 6.5, dy: -8.5, size: [3, 3, 3], tier: 2 },
  { id: 'reserve_b', building: null, dx: -8, dy: 6, size: [3, 3, 3], tier: 2 },
  { id: 'reserve_c', building: null, dx: 9, dy: 8.5, size: [3, 3, 3], tier: 3 },
  { id: 'reserve_d', building: null, dx: -10.5, dy: -9, size: [3, 3, 3], tier: 3 },
];

export function plotFor(building: BuildingType): Plot {
  return PLOTS.find((p) => p.building === building)!;
}

export function plotSize(plot: Plot, level: number): number {
  const stage = buildingStage(level);
  return plot.size[Math.max(0, stage - 1)];
}

/** Lotes visíveis para os níveis atuais. */
export function visiblePlots(levels: BuildingLevels): Plot[] {
  const tier = cityTier(levels.town_hall ?? 1);
  return PLOTS.filter((p) => p.tier <= tier);
}

/** Casas de moradores (decoração), liberadas conforme a cidade cresce. */
export const COTTAGES: { dx: number; dy: number; tier: 1 | 2 | 3; variant: number }[] = [
  { dx: 4.6, dy: 2.6, tier: 1, variant: 0 },
  { dx: 5.6, dy: -2.8, tier: 1, variant: 1 },
  { dx: -1.8, dy: -7, tier: 1, variant: 2 },
  { dx: 4.2, dy: 6.6, tier: 1, variant: 1 },
  { dx: -3.6, dy: 6.8, tier: 1, variant: 0 },
  { dx: 7.4, dy: 0.4, tier: 2, variant: 2 },
  { dx: -9, dy: -2.2, tier: 2, variant: 0 },
  { dx: 0.4, dy: 9.2, tier: 2, variant: 1 },
  { dx: 9.8, dy: -4.4, tier: 3, variant: 2 },
  { dx: -4, dy: 11.1, tier: 3, variant: 0 },
];
