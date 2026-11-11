/**
 * Sistema militar (Fase D): recrutas, unidades, treinamento, pesquisa e poder militar.
 *
 * Mesmas funções no servidor (que aplica) e no cliente (que mostra custos, tempos e o poder).
 * Combate, ataques e mísseis são da Fase E. Documentação em docs/PLAY_RULES.md.
 */
import type { Cost, Resource, ResourceMap, StructureType } from './economy';
import { ECONOMY_SPEED, type GameMode, MODE_SPEED } from './rules';

export const MILITARY_RULES_VERSION = 1;

export const UNIT_TYPES = ['infantry', 'mechanized', 'armor', 'artillery', 'special', 'defense', 'aviation', 'navy', 'missile'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const TECH_TYPES = [
  'doctrine',
  'motorization',
  'armor',
  'ballistics',
  'special_ops',
  'fortification',
  'jets',
  'naval',
  'military_logistics',
  'training_methods',
  'rocketry',
  'interception',
] as const;
export type TechType = (typeof TECH_TYPES)[number];

export type Army = Partial<Record<UnitType, number>>;
export type Research = Partial<Record<TechType, number>>;

/** Grupo da unidade no detalhamento do poder militar. */
export type PowerGroup = 'troops' | 'equipment' | 'aviation' | 'navy' | 'defense' | 'missiles';

export interface UnitDef {
  id: UnitType;
  name: string;
  /** Nome curto para botões e listas. */
  short: string;
  role: string;
  group: PowerGroup;
  /** Custo de uma unidade (além dos recrutas). */
  cost: Cost;
  /** Recrutas consumidos por unidade (tripulação). */
  recruits: number;
  /** Segundos de treinamento por unidade, no ritmo da campanha. */
  seconds: number;
  /** Poder de combate (ataque) por unidade. */
  attack: number;
  /** Resistência (defesa) por unidade. */
  defense: number;
  /** Manutenção por unidade e por hora (campanha). */
  upkeep: Cost;
  /** Instalação exigida para treinar. Infantaria: nenhuma (sem base, treina devagar). */
  structure: StructureType | null;
  /** Pesquisa exigida (nível 1). */
  research: TechType | null;
}

export const UNITS: Record<UnitType, UnitDef> = {
  infantry: {
    id: 'infantry',
    name: 'Infantaria',
    short: 'Infantaria',
    role: 'Soldados a pé. Base de todo exército; sem base militar, treina devagar.',
    group: 'troops',
    cost: { money: 30 },
    recruits: 1,
    seconds: 1.5,
    attack: 1,
    defense: 1.2,
    upkeep: { money: 3 },
    structure: null,
    research: null,
  },
  mechanized: {
    id: 'mechanized',
    name: 'Tropas mecanizadas',
    short: 'Mecanizados',
    role: 'Infantaria em veículos blindados de transporte: rápida e resistente.',
    group: 'troops',
    cost: { money: 80, metal: 20, oil: 8 },
    recruits: 1,
    seconds: 4,
    attack: 3,
    defense: 3,
    upkeep: { money: 5, oil: 1 },
    structure: 'military_base',
    research: 'motorization',
  },
  armor: {
    id: 'armor',
    name: 'Blindados',
    short: 'Blindados',
    role: 'Carros de combate. Grande poder de ataque.',
    group: 'equipment',
    cost: { money: 260, metal: 110, oil: 30 },
    recruits: 3,
    seconds: 10,
    attack: 12,
    defense: 9,
    upkeep: { money: 10, oil: 4 },
    structure: 'arms_factory',
    research: 'armor',
  },
  artillery: {
    id: 'artillery',
    name: 'Artilharia',
    short: 'Artilharia',
    role: 'Canhões e lançadores de longo alcance: muito ataque, pouca defesa.',
    group: 'equipment',
    cost: { money: 200, metal: 80, oil: 12 },
    recruits: 4,
    seconds: 8,
    attack: 10,
    defense: 3,
    upkeep: { money: 7, oil: 1 },
    structure: 'arms_factory',
    research: null,
  },
  special: {
    id: 'special',
    name: 'Forças especiais',
    short: 'Especiais',
    role: 'Tropas de elite para operações difíceis.',
    group: 'troops',
    cost: { money: 180, tech: 6 },
    recruits: 1,
    seconds: 12,
    attack: 8,
    defense: 6,
    upkeep: { money: 12 },
    structure: 'training_center',
    research: 'special_ops',
  },
  defense: {
    id: 'defense',
    name: 'Defesa terrestre',
    short: 'Defesa',
    role: 'Posições fortificadas, antiaéreas e antitanque. Quase só defende.',
    group: 'defense',
    cost: { money: 140, materials: 60, metal: 40 },
    recruits: 2,
    seconds: 6,
    attack: 1,
    defense: 12,
    upkeep: { money: 4 },
    structure: 'defense_center',
    research: null,
  },
  aviation: {
    id: 'aviation',
    name: 'Aviação',
    short: 'Aviação',
    role: 'Caças e aviões de ataque. Caros, poderosos e exigem petróleo.',
    group: 'aviation',
    cost: { money: 700, metal: 240, oil: 150, tech: 20 },
    recruits: 2,
    seconds: 30,
    attack: 34,
    defense: 16,
    upkeep: { money: 28, oil: 12 },
    structure: 'air_base',
    research: 'jets',
  },
  navy: {
    id: 'navy',
    name: 'Marinha',
    short: 'Marinha',
    role: 'Navios de guerra. Só com base naval no litoral.',
    group: 'navy',
    cost: { money: 1000, metal: 450, oil: 180, tech: 12 },
    recruits: 12,
    seconds: 40,
    attack: 32,
    defense: 34,
    upkeep: { money: 34, oil: 14 },
    structure: 'naval_base',
    research: 'naval',
  },
  // Fase E: estoque de mísseis, lançados do silo contra regiões distantes (não entram no combate terrestre).
  missile: {
    id: 'missile',
    name: 'Mísseis balísticos',
    short: 'Mísseis',
    role: 'Lançados do silo contra regiões distantes: danificam construções e tropas no alvo.',
    group: 'missiles',
    cost: { money: 900, metal: 300, oil: 200, tech: 40 },
    recruits: 1,
    seconds: 45,
    attack: 25,
    defense: 1,
    upkeep: { money: 10 },
    structure: 'missile_silo',
    research: 'rocketry',
  },
};

export interface TechDef {
  id: TechType;
  name: string;
  role: string;
  /** Unidade liberada pelo nível 1. */
  unlocks?: UnitType;
  /** Efeito por nível. */
  effect:
    | { kind: 'units'; units: UnitType[]; perLevel: number }
    | { kind: 'defense'; perLevel: number }
    | { kind: 'upkeep'; perLevel: number }
    | { kind: 'training'; perLevel: number }
    | { kind: 'range'; perLevel: number }
    | { kind: 'interception'; perLevel: number };
  /** Custo do nível 1 (dobra a cada nível). */
  cost: Cost;
  /** Segundos do nível 1 (campanha). */
  seconds: number;
}

export const TECHS: Record<TechType, TechDef> = {
  doctrine: {
    id: 'doctrine',
    name: 'Doutrina de infantaria',
    role: 'Táticas modernas de pequenos grupos.',
    effect: { kind: 'units', units: ['infantry', 'special'], perLevel: 0.1 },
    cost: { money: 500, tech: 30 },
    seconds: 45,
  },
  motorization: {
    id: 'motorization',
    name: 'Motorização',
    role: 'Veículos para levar a infantaria ao combate.',
    unlocks: 'mechanized',
    effect: { kind: 'units', units: ['mechanized'], perLevel: 0.08 },
    cost: { money: 600, metal: 100, tech: 40 },
    seconds: 60,
  },
  armor: {
    id: 'armor',
    name: 'Blindagem composta',
    role: 'Carros de combate e proteção para os veículos.',
    unlocks: 'armor',
    effect: { kind: 'units', units: ['armor', 'mechanized'], perLevel: 0.08 },
    cost: { money: 900, metal: 250, tech: 60 },
    seconds: 90,
  },
  ballistics: {
    id: 'ballistics',
    name: 'Balística',
    role: 'Alcance e precisão da artilharia.',
    effect: { kind: 'units', units: ['artillery'], perLevel: 0.1 },
    cost: { money: 700, metal: 150, tech: 50 },
    seconds: 75,
  },
  special_ops: {
    id: 'special_ops',
    name: 'Operações especiais',
    role: 'Seleção e preparo de tropas de elite.',
    unlocks: 'special',
    effect: { kind: 'units', units: ['special'], perLevel: 0.1 },
    cost: { money: 800, tech: 70 },
    seconds: 80,
  },
  fortification: {
    id: 'fortification',
    name: 'Fortificação',
    role: 'Engenharia de defesa: aumenta a defesa de todo o exército.',
    effect: { kind: 'defense', perLevel: 0.08 },
    cost: { money: 700, materials: 300, tech: 40 },
    seconds: 70,
  },
  jets: {
    id: 'jets',
    name: 'Caças a jato',
    role: 'Aviação militar moderna.',
    unlocks: 'aviation',
    effect: { kind: 'units', units: ['aviation'], perLevel: 0.08 },
    cost: { money: 1500, metal: 400, oil: 200, tech: 120 },
    seconds: 150,
  },
  naval: {
    id: 'naval',
    name: 'Engenharia naval',
    role: 'Projeto e construção de navios de guerra.',
    unlocks: 'navy',
    effect: { kind: 'units', units: ['navy'], perLevel: 0.08 },
    cost: { money: 1400, metal: 500, oil: 150, tech: 100 },
    seconds: 150,
  },
  military_logistics: {
    id: 'military_logistics',
    name: 'Logística militar',
    role: 'Abastecimento eficiente: reduz a manutenção do exército.',
    effect: { kind: 'upkeep', perLevel: 0.1 },
    cost: { money: 800, materials: 200, tech: 50 },
    seconds: 70,
  },
  training_methods: {
    id: 'training_methods',
    name: 'Métodos de treinamento',
    role: 'Simuladores e instrução: treinamento mais rápido.',
    effect: { kind: 'training', perLevel: 0.1 },
    cost: { money: 600, tech: 40 },
    seconds: 60,
  },
  rocketry: {
    id: 'rocketry',
    name: 'Foguetes balísticos',
    role: 'Propulsão e guiagem de mísseis.',
    unlocks: 'missile',
    effect: { kind: 'range', perLevel: 0.2 },
    cost: { money: 1600, metal: 400, oil: 300, tech: 140 },
    seconds: 150,
  },
  interception: {
    id: 'interception',
    name: 'Interceptação',
    role: 'Radares e mísseis interceptadores: aumenta a chance de derrubar mísseis inimigos.',
    effect: { kind: 'interception', perLevel: 0.1 },
    cost: { money: 1200, metal: 300, tech: 100 },
    seconds: 120,
  },
};

export const MILITARY = {
  /** Recrutas por hora (campanha) sem nenhuma instalação militar. */
  recruitBase: 8,
  /** Recrutas por hora a mais por nível de base militar e de centro de treinamento. */
  recruitPerBase: 30,
  recruitPerTraining: 15,
  /** Teto de recrutas acumulados: base + por nível de cidade + por nível de base militar. */
  recruitCapBase: 150,
  recruitCapPerCity: 60,
  recruitCapPerBase: 250,
  recruitsStarting: 40,
  /** Sem base militar, a infantaria treina 3× mais devagar. */
  untrainedSlowdown: 3,
  /** Cada nível de centro de treinamento corta 12% do tempo de treinamento. */
  trainingCenterPerLevel: 0.12,
  /** Cada nível de centro de defesa soma 10% à defesa. */
  defenseCenterPerLevel: 0.1,
  /** Poder de infraestrutura por nível de instalação militar. */
  infrastructurePerLevel: 40,
  /** Lotes de treinamento na fila, e tamanho máximo de um lote. */
  queue: 3,
  maxBatch: 500,
  researchMaxLevel: 3,
  /** Custo da pesquisa dobra e o tempo cresce 1,8× a cada nível. */
  researchCostGrowth: 2,
  researchTimeGrowth: 1.8,
  /** Teto da redução de tempo (centros de treinamento + pesquisa). */
  maxTrainingCut: 0.6,
};

export const MILITARY_STRUCTURES: StructureType[] = ['military_base', 'training_center', 'arms_factory', 'air_base', 'naval_base', 'defense_center', 'missile_silo', 'antimissile'];

type Built = { type: StructureType; level: number }[];

export const levelOf = (structures: Built, type: StructureType) => structures.filter((s) => s.type === type && s.level > 0).reduce((n, s) => n + s.level, 0);

/** Recrutamento: recrutas por hora e teto, já no ritmo do modo. */
export function recruitment(structures: Built, mode: GameMode = 'campaign'): { rate: number; cap: number } {
  const base = levelOf(structures, 'military_base');
  const training = levelOf(structures, 'training_center');
  const cities = levelOf(structures, 'city');
  const rate = (MILITARY.recruitBase + MILITARY.recruitPerBase * base + MILITARY.recruitPerTraining * training) * ECONOMY_SPEED[mode];
  const cap = MILITARY.recruitCapBase + MILITARY.recruitCapPerCity * cities + MILITARY.recruitCapPerBase * base;
  return { rate, cap };
}

/** Recrutas projetados até `at` (crescem até o teto; o que passou do teto fica). */
export function projectRecruits(amount: number, settledAt: number, rate: number, cap: number, at: number): number {
  if (amount >= cap) return amount;
  return Math.min(cap, amount + (rate * Math.max(0, at - settledAt)) / 3_600_000);
}

/** Por que esta unidade não pode ser treinada agora (null = pode). */
export function unitProblem(unit: UnitType, structures: Built, research: Research): string | null {
  const def = UNITS[unit];
  if (def.structure && levelOf(structures, def.structure) < 1) return `Exige ${(STRUCTURE_NAMES[def.structure] ?? def.structure).toLowerCase()}.`;
  if (def.research && (research[def.research] ?? 0) < 1) return `Exige a pesquisa ${TECHS[def.research].name}.`;
  return null;
}

/** Nomes das instalações militares (evita importar economy.ts aqui e criar ciclo). */
export const STRUCTURE_NAMES: Partial<Record<StructureType, string>> = {
  military_base: 'Base militar',
  training_center: 'Centro de treinamento',
  arms_factory: 'Instalação de produção militar',
  air_base: 'Base aérea',
  naval_base: 'Base naval',
  defense_center: 'Centro de defesa',
  missile_silo: 'Silo de lançamento de mísseis',
  antimissile: 'Sistema antimísseis',
  tech: 'Centro tecnológico',
};

export function trainCost(unit: UnitType, amount: number): { cost: Cost; recruits: number } {
  const def = UNITS[unit];
  const cost: Cost = {};
  for (const [r, v] of Object.entries(def.cost) as [Resource, number][]) cost[r] = Math.round(v * amount);
  return { cost, recruits: def.recruits * amount };
}

/** Duração (s) de um lote de treinamento. */
export function trainSeconds(unit: UnitType, amount: number, structures: Built, research: Research, mode: GameMode = 'campaign'): number {
  const def = UNITS[unit];
  const noBase = levelOf(structures, 'military_base') < 1;
  const cut = Math.min(
    MILITARY.maxTrainingCut,
    MILITARY.trainingCenterPerLevel * levelOf(structures, 'training_center') + TECHS.training_methods.effect.perLevel * (research.training_methods ?? 0),
  );
  const slow = unit === 'infantry' && noBase ? MILITARY.untrainedSlowdown : 1;
  return Math.max(1, Math.round((def.seconds * amount * slow * (1 - cut)) / MODE_SPEED[mode]));
}

export function techCost(tech: TechType, from: number): Cost {
  const factor = MILITARY.researchCostGrowth ** from;
  const out: Cost = {};
  for (const [r, v] of Object.entries(TECHS[tech].cost) as [Resource, number][]) out[r] = Math.round(v * factor);
  return out;
}

export function techSeconds(tech: TechType, from: number, mode: GameMode = 'campaign'): number {
  return Math.max(1, Math.round((TECHS[tech].seconds * MILITARY.researchTimeGrowth ** from) / MODE_SPEED[mode]));
}

/** Por que não dá para pesquisar agora (null = pode). */
export function researchProblem(tech: TechType, structures: Built, research: Research, busy: boolean): string | null {
  if (levelOf(structures, 'tech') < 1) return 'Exige um centro tecnológico concluído.';
  if ((research[tech] ?? 0) >= MILITARY.researchMaxLevel) return 'Pesquisa no nível máximo.';
  if (busy) return 'Já há uma pesquisa em andamento.';
  return null;
}

/** Manutenção por hora do exército, já no ritmo econômico do modo. */
export function upkeep(army: Army, research: Research, mode: GameMode = 'campaign'): ResourceMap {
  const out: ResourceMap = { money: 0, materials: 0, metal: 0, oil: 0, tech: 0, special: 0 };
  const cut = 1 - TECHS.military_logistics.effect.perLevel * (research.military_logistics ?? 0);
  for (const unit of UNIT_TYPES) {
    const n = army[unit] ?? 0;
    if (!n) continue;
    for (const [r, v] of Object.entries(UNITS[unit].upkeep) as [Resource, number][]) out[r] += v * n * cut * ECONOMY_SPEED[mode];
  }
  return out;
}

/** Multiplicador da pesquisa para uma unidade. */
export function techBonus(unit: UnitType, research: Research): number {
  let b = 0;
  for (const t of TECH_TYPES) {
    const e = TECHS[t].effect;
    if (e.kind === 'units' && e.units.includes(unit)) b += e.perLevel * (research[t] ?? 0);
  }
  return b;
}

export interface MilitaryPower {
  /** Poder total: média de ataque e defesa mais a infraestrutura militar. */
  power: number;
  attack: number;
  defense: number;
  /** Quantidade de tropas (soma das unidades). */
  troops: number;
  /** Detalhamento do poder por grupo (já com tecnologias), mais infraestrutura. */
  groups: Record<PowerGroup | 'infrastructure', number>;
  /** Quanto das tecnologias soma ao poder das unidades (0,12 = +12%). */
  techShare: number;
}

/**
 * Poder militar. Por unidade: (ataque × (1 + pesquisa) + defesa × (1 + pesquisa) × (1 + fortificação + centro de defesa)) ÷ 2.
 * Total = soma das unidades + 40 por nível de instalação militar. Usado para comparar nações.
 */
export function militaryPower(army: Army, research: Research, structures: Built): MilitaryPower {
  const defenseMult = 1 + TECHS.fortification.effect.perLevel * (research.fortification ?? 0) + MILITARY.defenseCenterPerLevel * levelOf(structures, 'defense_center');
  const groups: MilitaryPower['groups'] = { troops: 0, equipment: 0, aviation: 0, navy: 0, defense: 0, missiles: 0, infrastructure: 0 };
  let attack = 0;
  let defense = 0;
  let troops = 0;
  let raw = 0;
  for (const unit of UNIT_TYPES) {
    const n = army[unit] ?? 0;
    if (!n) continue;
    const def = UNITS[unit];
    const tb = 1 + techBonus(unit, research);
    const a = def.attack * n * tb;
    const d = def.defense * n * tb * defenseMult;
    attack += a;
    defense += d;
    troops += n;
    groups[def.group] += (a + d) / 2;
    raw += ((def.attack + def.defense) * n) / 2;
  }
  for (const t of MILITARY_STRUCTURES) groups.infrastructure += MILITARY.infrastructurePerLevel * levelOf(structures, t);
  const units = (attack + defense) / 2;
  const power = Math.round(units + groups.infrastructure);
  for (const k of Object.keys(groups) as (keyof typeof groups)[]) groups[k] = Math.round(groups[k]);
  return { power, attack: Math.round(attack), defense: Math.round(defense), troops, groups, techShare: raw ? units / raw - 1 : 0 };
}
