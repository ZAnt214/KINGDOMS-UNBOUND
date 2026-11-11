// Regras centralizadas do ciclo territorial (Fase A). Valores são decisões de balanceamento
// iniciais do KINGDOMS UNBOUND e ficam todos aqui: o servidor aplica, o cliente só exibe.
// Fórmulas documentadas em docs/PLAY_RULES.md.

export const PLAY_RULES_VERSION = 1;

export const GAME_MODES = ['campaign', 'quick', 'team'] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** Modos que o servidor já sabe conduzir. Os demais aparecem bloqueados na seleção. */
export const MODES_AVAILABLE: Record<GameMode, boolean> = { campaign: true, quick: false, team: false };

// ---------- identidade ----------

export interface NationColor {
  id: string;
  name: string;
  hex: string;
}

/** Cores de território: vivas, distintas entre si e legíveis sobre o oceano escuro. */
export const NATION_COLORS: NationColor[] = [
  { id: 'crimson', name: 'Carmesim', hex: '#e5484d' },
  { id: 'orange', name: 'Laranja', hex: '#f76b15' },
  { id: 'amber', name: 'Âmbar', hex: '#f5b800' },
  { id: 'lime', name: 'Lima', hex: '#99d52a' },
  { id: 'green', name: 'Esmeralda', hex: '#30a46c' },
  { id: 'teal', name: 'Turquesa', hex: '#12a594' },
  { id: 'cyan', name: 'Ciano', hex: '#05a2c2' },
  { id: 'blue', name: 'Azul', hex: '#0090ff' },
  { id: 'indigo', name: 'Índigo', hex: '#3e63dd' },
  { id: 'violet', name: 'Violeta', hex: '#8e4ec6' },
  { id: 'magenta', name: 'Magenta', hex: '#d6409f' },
  { id: 'rose', name: 'Rosa', hex: '#ff6f91' },
  { id: 'bronze', name: 'Bronze', hex: '#b9793d' },
  { id: 'sand', name: 'Areia', hex: '#e2c275' },
  { id: 'mint', name: 'Menta', hex: '#5fd4a9' },
  { id: 'sky', name: 'Celeste', hex: '#7ccbff' },
];
export const NATION_COLOR_BY_HEX: Record<string, NationColor> = Object.fromEntries(NATION_COLORS.map((c) => [c.hex, c]));

/**
 * Duas nações com a mesma cor não podem ter capitais a menos desta distância, para que vizinhos
 * continuem distinguíveis. Se todas as cores já estiverem em uso por perto, a regra é dispensada.
 */
export const COLOR_EXCLUSION_KM = 2500;

export const NATION_NAME = { min: 3, max: 22, pattern: /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u };

export function cleanNationName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function nationNameProblem(name: string): string | null {
  if (name.length < NATION_NAME.min) return `O nome precisa de pelo menos ${NATION_NAME.min} caracteres.`;
  if (name.length > NATION_NAME.max) return `O nome pode ter no máximo ${NATION_NAME.max} caracteres.`;
  if (!NATION_NAME.pattern.test(name)) return 'Use letras, números, espaço, ponto, apóstrofo ou hífen.';
  return null;
}

// ---------- expansão ----------

export const EXPANSION = {
  /** Tempo base (s) para ocupar uma região do tamanho de referência com uma nação de 1 região. */
  baseSeconds: 20,
  /** Área de referência (km²): regiões maiores demoram mais, na raiz quadrada da proporção. */
  areaRefKm2: 50000,
  sizeMin: 0.6,
  sizeMax: 3,
  /** Custo progressivo: cada região já controlada acrescenta esta fração ao tempo. */
  growthPerRegion: 0.12,
  minSeconds: 15,
  maxSeconds: 900,
  /** Operações de ocupação simultâneas por nação. */
  maxActive: 1,
  /** Multiplicador de velocidade por modo de jogo. */
  modeSpeed: { campaign: 1, quick: 3, team: 1.5 } as Record<GameMode, number>,
};

/**
 * Tempo (s) para ocupar uma região neutra.
 *
 *   tamanho = limitar(√(área / 50 000 km²), 0,6, 3)
 *   tempo   = limitar(20 s · tamanho · (1 + 0,12 · (regiões − 1)), 15 s, 900 s) ÷ velocidade do modo
 */
export function expansionSeconds(areaKm2: number, ownedRegions: number, mode: GameMode = 'campaign'): number {
  const size = Math.max(EXPANSION.sizeMin, Math.min(EXPANSION.sizeMax, Math.sqrt(Math.max(0, areaKm2) / EXPANSION.areaRefKm2)));
  const raw = EXPANSION.baseSeconds * size * (1 + EXPANSION.growthPerRegion * Math.max(0, ownedRegions - 1));
  const bounded = Math.max(EXPANSION.minSeconds, Math.min(EXPANSION.maxSeconds, raw));
  return Math.max(1, Math.round(bounded / EXPANSION.modeSpeed[mode]));
}

// ---------- progressão ----------

export const XP = { perRegion: 100, perCountry: 400 };

export function nationXp(regions: number, countries: number): number {
  return regions * XP.perRegion + countries * XP.perCountry;
}

/** Nível da nação: o nível n exige 120·(n−1)² de experiência. */
export function nationLevel(xp: number): { level: number; progress: number; floor: number; next: number } {
  const p = Math.max(0, xp);
  const level = Math.floor(Math.sqrt(p / 120)) + 1;
  const floor = 120 * (level - 1) ** 2;
  const next = 120 * level ** 2;
  return { level, progress: (p - floor) / (next - floor), floor, next };
}

export interface Milestone {
  id: string;
  title: string;
  kind: 'regions' | 'countries';
  target: number;
}

/** Metas de expansão, em ordem. Derivadas do estado real; não concedem nada além do registro. */
export const MILESTONES: Milestone[] = [
  { id: 'r1', title: 'Fundar a nação', kind: 'regions', target: 1 },
  { id: 'r3', title: 'Ocupar 3 regiões', kind: 'regions', target: 3 },
  { id: 'r6', title: 'Ocupar 6 regiões', kind: 'regions', target: 6 },
  { id: 'c1', title: 'Dominar um país inteiro', kind: 'countries', target: 1 },
  { id: 'r12', title: 'Ocupar 12 regiões', kind: 'regions', target: 12 },
  { id: 'r25', title: 'Ocupar 25 regiões', kind: 'regions', target: 25 },
  { id: 'c3', title: 'Dominar 3 países', kind: 'countries', target: 3 },
  { id: 'r50', title: 'Ocupar 50 regiões', kind: 'regions', target: 50 },
  { id: 'c8', title: 'Dominar 8 países', kind: 'countries', target: 8 },
  { id: 'r100', title: 'Ocupar 100 regiões', kind: 'regions', target: 100 },
];

export function milestoneProgress(m: Milestone, regions: number, countries: number): { value: number; done: boolean } {
  const value = Math.min(m.target, m.kind === 'regions' ? regions : countries);
  return { value, done: value >= m.target };
}

/** Primeira meta ainda não cumprida, ou null se todas foram. */
export function nextMilestone(regions: number, countries: number): Milestone | null {
  return MILESTONES.find((m) => !milestoneProgress(m, regions, countries).done) ?? null;
}
