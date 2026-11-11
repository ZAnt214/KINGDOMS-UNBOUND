// Economia e construções (Fase B). Todos os valores e fórmulas ficam aqui: o servidor aplica,
// o cliente usa as mesmas funções para mostrar custos, tempos e a produção prevista.
// Documentação em docs/PLAY_RULES.md.
import { type LogisticsNode, LOGISTICS, logistics } from './logistics';
import { type Army, recruitment, type Research, upkeep } from './military';
import { REGION_BY_ID } from '../world/regions';
import { ECONOMY_SPEED, type GameMode, MODE_SPEED } from './rules';

export const ECONOMY_RULES_VERSION = 2;

export const RESOURCES = ['money', 'materials', 'metal', 'oil', 'tech', 'special'] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResourceMap = Record<Resource, number>;
export type Cost = Partial<ResourceMap>;

export const RESOURCE_INFO: Record<Resource, { name: string; short: string; use: string; color: string }> = {
  money: { name: 'Dinheiro', short: 'Dinheiro', use: 'Paga toda construção e a expansão territorial.', color: '#ffc53d' },
  materials: { name: 'Materiais de construção', short: 'Materiais', use: 'Base de qualquer obra.', color: '#e8a36b' },
  metal: { name: 'Metal', short: 'Metal', use: 'Portos, refinarias e centros tecnológicos; depois, equipamentos militares.', color: '#a9b8cc' },
  oil: { name: 'Petróleo', short: 'Petróleo', use: 'Usinas e centros tecnológicos; depois, veículos, aviões e navios.', color: '#7c8cff' },
  tech: { name: 'Componentes tecnológicos', short: 'Componentes', use: 'Exigidos para levar qualquer construção aos níveis 4 e 5.', color: '#5ee0c8' },
  special: { name: 'Recursos especiais', short: 'Especiais', use: 'Só vêm de regiões com jazida especial; exigidos pelo centro tecnológico a partir do nível 2.', color: '#ff7ad9' },
};

export const ENERGY_INFO = {
  name: 'Energia',
  use: 'Não é estocada. Cada construção consome; se a demanda passar da oferta, a produção de todas as construções cai na mesma proporção.',
};

export const STRUCTURE_TYPES = [
  'city',
  'factory',
  'port',
  'refinery',
  'power',
  'tech',
  'depot',
  'military_base',
  'training_center',
  'arms_factory',
  'air_base',
  'naval_base',
  'defense_center',
] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];

export type Deposit = 'oil' | 'metal' | 'special';

export interface StructureDef {
  id: StructureType;
  name: string;
  /** Nome curto para botões. */
  short: string;
  /** O que a construção faz, em uma frase. */
  role: string;
  tier: 'Básica' | 'Intermediária' | 'Complexa' | 'Militar';
  /** Instalação militar (Fase D): não produz recursos; libera unidades e recrutamento. */
  military?: boolean;
  /** Custo para construir (nível 1). */
  cost: Cost;
  /** Tempo do nível 1, em segundos, no ritmo da campanha. */
  seconds: number;
  /** Produção por hora no nível 1 (campanha). */
  produces: Cost;
  /** Consumo de energia por nível. */
  energy: number;
  /** Oferta de energia por nível. */
  supply?: number;
  /** Capacidade de estoque somada por nível. */
  capacity?: number;
  /** Eficiência somada a todas as construções da nação, por nível. */
  efficiency?: number;
  /** Só em região com litoral. */
  coastal?: boolean;
  /** Jazida que aumenta a produção desta construção. */
  deposit?: Deposit;
}

export const STRUCTURES: Record<StructureType, StructureDef> = {
  city: {
    id: 'city',
    short: 'Cidade',
    name: 'Cidade',
    role: 'Aumenta a população e a atividade econômica: gera dinheiro e um pouco de materiais.',
    tier: 'Básica',
    cost: { money: 400, materials: 300 },
    seconds: 15,
    produces: { money: 2400, materials: 480 },
    energy: 1,
  },
  depot: {
    id: 'depot',
    short: 'Depósito',
    name: 'Depósito logístico',
    role: 'Amplia o estoque máximo de todos os recursos.',
    tier: 'Básica',
    cost: { money: 300, materials: 400 },
    seconds: 20,
    produces: {},
    energy: 0,
    capacity: 3000,
  },
  factory: {
    id: 'factory',
    short: 'Fábrica',
    name: 'Fábrica',
    role: 'Produz materiais de construção e metal. Rende mais em região com jazida de metal.',
    tier: 'Intermediária',
    cost: { money: 600, materials: 400 },
    seconds: 30,
    produces: { materials: 1920, metal: 960 },
    energy: 2,
    deposit: 'metal',
  },
  power: {
    id: 'power',
    short: 'Usina',
    name: 'Usina de energia',
    role: 'Abastece as demais construções.',
    tier: 'Intermediária',
    cost: { money: 550, materials: 300, oil: 80 },
    seconds: 40,
    produces: {},
    energy: 0,
    supply: 6,
  },
  port: {
    id: 'port',
    short: 'Porto',
    name: 'Porto',
    role: 'Comércio marítimo e capacidade logística: gera dinheiro, um pouco de petróleo e amplia o estoque. Só no litoral.',
    tier: 'Intermediária',
    cost: { money: 700, materials: 450, metal: 150 },
    seconds: 45,
    produces: { money: 1440, oil: 240 },
    energy: 1,
    capacity: 1500,
    coastal: true,
  },
  refinery: {
    id: 'refinery',
    short: 'Refinaria',
    name: 'Refinaria',
    role: 'Produz petróleo e derivados. Rende mais em região com jazida de petróleo.',
    tier: 'Complexa',
    cost: { money: 800, materials: 400, metal: 200 },
    seconds: 60,
    produces: { oil: 1440 },
    energy: 2,
    deposit: 'oil',
  },
  tech: {
    id: 'tech',
    short: 'Tecnologia',
    name: 'Centro tecnológico',
    role: 'Produz componentes tecnológicos e melhora a eficiência de todas as construções da nação.',
    tier: 'Complexa',
    cost: { money: 1200, materials: 600, metal: 300, oil: 150 },
    seconds: 90,
    produces: { tech: 360 },
    energy: 3,
    efficiency: 0.03,
  },
  // Instalações militares (Fase D). Efeitos em shared/play/military.ts.
  military_base: {
    id: 'military_base',
    short: 'Base militar',
    name: 'Base militar',
    role: 'Ativa o treinamento de tropas e acelera o recrutamento (+30 recrutas/h por nível, +250 de teto).',
    tier: 'Militar',
    military: true,
    cost: { money: 900, materials: 600, metal: 200 },
    seconds: 60,
    produces: {},
    energy: 2,
  },
  training_center: {
    id: 'training_center',
    short: 'Treinamento',
    name: 'Centro de treinamento',
    role: 'Treinamento 12% mais rápido por nível, mais recrutas e libera as forças especiais.',
    tier: 'Militar',
    military: true,
    cost: { money: 1000, materials: 500, metal: 250 },
    seconds: 75,
    produces: {},
    energy: 2,
  },
  arms_factory: {
    id: 'arms_factory',
    short: 'Prod. militar',
    name: 'Instalação de produção militar',
    role: 'Fabrica equipamentos pesados: libera blindados e artilharia.',
    tier: 'Militar',
    military: true,
    cost: { money: 1400, materials: 700, metal: 500, oil: 150 },
    seconds: 90,
    produces: {},
    energy: 3,
  },
  air_base: {
    id: 'air_base',
    short: 'Base aérea',
    name: 'Base aérea',
    role: 'Pistas e hangares: libera a aviação.',
    tier: 'Militar',
    military: true,
    cost: { money: 1800, materials: 900, metal: 600, oil: 400 },
    seconds: 120,
    produces: {},
    energy: 3,
  },
  naval_base: {
    id: 'naval_base',
    short: 'Base naval',
    name: 'Base naval',
    role: 'Estaleiro e cais militar: libera a marinha. Só no litoral.',
    tier: 'Militar',
    military: true,
    cost: { money: 1600, materials: 800, metal: 700, oil: 300 },
    seconds: 120,
    produces: {},
    energy: 2,
    coastal: true,
  },
  defense_center: {
    id: 'defense_center',
    short: 'Defesa',
    name: 'Centro de defesa',
    role: 'Comando da defesa: libera a defesa terrestre e soma 10% de defesa por nível.',
    tier: 'Militar',
    military: true,
    cost: { money: 1000, materials: 700, metal: 300 },
    seconds: 70,
    produces: {},
    energy: 2,
  },
};

export const ECONOMY = {
  maxLevel: 5,
  /** Custo cresce 1,6× a cada nível. */
  costGrowth: 1.6,
  /** Tempo cresce 1,7× a cada nível. */
  timeGrowth: 1.7,
  /** Produção do nível n = produção do nível 1 × n^0,9 (retorno decrescente). */
  levelExponent: 0.9,
  /** Cada construção do mesmo tipo que a nação já tem encarece a próxima em 30%. */
  sameTypeSurcharge: 0.3,
  /** Componentes tecnológicos exigidos pelos níveis 4 e 5. */
  techForLevel: { 4: 15, 5: 30 } as Record<number, number>,
  /** Recursos especiais exigidos por nível do centro tecnológico (a partir do 2). */
  specialPerTechLevel: 6,
  /** Espaços de construção: √(área ÷ 25.000 km²), entre 2 e 6; a região da capital ganha +2. */
  slotsMin: 2,
  slotsMax: 6,
  slotsCapitalBonus: 2,
  /** Distância mínima entre duas construções (km), para os selos não se sobreporem. */
  minDistanceKm: 25,
  /** Obras simultâneas por nação. */
  buildQueue: 2,
  baseCapacity: 8000,
  /** Teto do bônus de eficiência dos centros tecnológicos. */
  maxEfficiencyBonus: 0.15,
  starting: { money: 1500, materials: 1200, metal: 300, oil: 200, tech: 0, special: 0 } as ResourceMap,
  /** Produção por hora (campanha) que vem do território, sem construções. */
  territory: {
    capital: { money: 3600, materials: 2400 } as Cost,
    capitalEnergy: 6,
    region: { money: 600, materials: 400 } as Cost,
    deposit: { oil: { oil: 480 }, metal: { metal: 480 }, special: { special: 120 } } as Record<Deposit, Cost>,
  },
  /** Construção sobre a jazida certa produz 60% a mais. */
  depositBonus: 0.6,
};

export const zero = (): ResourceMap => ({ money: 0, materials: 0, metal: 0, oil: 0, tech: 0, special: 0 });

/**
 * Jazida da região (regra do jogo, não dado geológico real): sorteio determinístico pelo id,
 * para cliente e servidor concordarem sem guardar nada. ~18% petróleo, ~18% metal, ~7% especial.
 */
export function regionDeposit(regionId: string): Deposit | null {
  let h = 0x811c9dc5;
  for (let i = 0; i < regionId.length; i++) {
    h ^= regionId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const roll = (h >>> 0) % 100;
  if (roll < 18) return 'oil';
  if (roll < 36) return 'metal';
  if (roll < 43) return 'special';
  return null;
}

export const DEPOSIT_LABEL: Record<Deposit, string> = { oil: 'Jazida de petróleo', metal: 'Jazida de metal', special: 'Jazida especial' };

/** Custo para levar uma construção do nível `from` ao `from + 1`. `sameType` = quantas do tipo a nação já tem (só pesa na construção nova). */
export function structureCost(type: StructureType, from: number, sameType = 0): Cost {
  const def = STRUCTURES[type];
  const factor = ECONOMY.costGrowth ** from * (from === 0 ? 1 + ECONOMY.sameTypeSurcharge * sameType : 1);
  const out: Cost = {};
  for (const [r, v] of Object.entries(def.cost) as [Resource, number][]) out[r] = Math.round(v * factor);
  const tech = ECONOMY.techForLevel[from + 1];
  if (tech) out.tech = (out.tech ?? 0) + tech;
  if (type === 'tech' && from >= 1) out.special = (out.special ?? 0) + ECONOMY.specialPerTechLevel * (from + 1);
  return out;
}

/** Duração (s) da obra do nível `from` ao `from + 1`. */
export function structureSeconds(type: StructureType, from: number, mode: GameMode = 'campaign'): number {
  return Math.max(1, Math.round((STRUCTURES[type].seconds * ECONOMY.timeGrowth ** from) / MODE_SPEED[mode]));
}

export interface EconomyInput {
  regions: string[];
  capitalRegion: string | null;
  /** Só construções com nível ≥ 1 produzem (a obra do nível 1 ainda não conta). */
  structures: { type: StructureType; level: number; region: string; id?: number; at?: [number, number] }[];
  /** Construções concluídas das outras nações da mesma aliança (para as conexões entre aliados). */
  allied?: LogisticsNode[];
  /** Exército e pesquisas (Fase D): a manutenção sai da produção. */
  army?: Army;
  research?: Research;
}

export interface EconomyOutput {
  /** Produção por hora já multiplicada pelo ritmo do modo. */
  rates: ResourceMap;
  /** Parte da produção que vem do território (sem construções). */
  territory: ResourceMap;
  capacity: number;
  energy: { supply: number; demand: number };
  /** Multiplicador aplicado às construções: energia × (1 + bônus tecnológico). */
  efficiency: number;
  /** Rede logística da nação: trechos próprios, conexões com aliados e bônus médio das construções ligadas. */
  logistics: { links: number; allyLinks: number; connected: number; averageBonus: number };
  /** Manutenção do exército por hora (já descontada de `rates`). */
  upkeep: ResourceMap;
  /** Recrutamento: recrutas por hora e teto. */
  recruits: { rate: number; cap: number };
}

const add = (into: ResourceMap, cost: Cost, k = 1) => {
  for (const [r, v] of Object.entries(cost) as [Resource, number][]) into[r] += v * k;
};

/**
 * Produção da nação.
 *
 *   território = capital (3.600 dinheiro, 2.400 materiais) + 600/400 por região + jazidas
 *   construção = produção do nível 1 × nível^0,9 × (1,6 se estiver na jazida certa)
 *   eficiência = min(1, oferta ÷ demanda de energia) × (1 + min(15%, 3% × níveis de centro tecnológico))
 *   ferrovia   = construção × (1 + bônus logístico da construção, ver logistics.ts)
 *   total/h    = (território + construções × eficiência) × ritmo econômico do modo
 */
export function computeEconomy(input: EconomyInput, mode: GameMode = 'campaign'): EconomyOutput {
  const T = ECONOMY.territory;
  const territory = zero();
  for (const r of input.regions) {
    add(territory, r === input.capitalRegion ? T.capital : T.region);
    const d = regionDeposit(r);
    if (d) add(territory, T.deposit[d]);
  }
  let supply = input.capitalRegion && input.regions.includes(input.capitalRegion) ? T.capitalEnergy : 0;
  let demand = 0;
  let capacity = ECONOMY.baseCapacity;
  let bonus = 0;
  const built = zero();
  const net = networkOf(input);
  for (const s of input.structures) {
    if (s.level < 1) continue;
    const def = STRUCTURES[s.type];
    const rail = s.id === undefined ? 0 : (net.bonus.get(s.id) ?? 0);
    const linked = s.id !== undefined && net.connected.has(s.id);
    demand += def.energy * s.level;
    supply += (def.supply ?? 0) * s.level;
    capacity += (def.capacity ?? 0) * s.level * (linked ? 1 + LOGISTICS.storageBonus : 1);
    bonus += (def.efficiency ?? 0) * s.level;
    const deposit = def.deposit && regionDeposit(s.region) === def.deposit ? 1 + ECONOMY.depositBonus : 1;
    add(built, def.produces, s.level ** ECONOMY.levelExponent * deposit * (1 + rail));
  }
  const energyFactor = demand <= supply || demand === 0 ? 1 : supply / demand;
  const efficiency = energyFactor * (1 + Math.min(ECONOMY.maxEfficiencyBonus, bonus));
  const speed = ECONOMY_SPEED[mode];
  const rates = zero();
  for (const r of RESOURCES) {
    rates[r] = (territory[r] + built[r] * efficiency) * speed;
    territory[r] *= speed;
  }
  const ownIds = new Set(input.structures.map((s) => s.id));
  const mineConnected = [...net.connected].filter((id) => ownIds.has(id));
  const logisticsOut = {
    links: net.links.filter((l) => !l.ally && ownIds.has(l.a)).length,
    allyLinks: net.links.filter((l) => l.ally && (ownIds.has(l.a) || ownIds.has(l.b))).length,
    connected: mineConnected.length,
    averageBonus: mineConnected.length ? mineConnected.reduce((sum, id) => sum + (net.bonus.get(id) ?? 0), 0) / mineConnected.length : 0,
  };
  const upkeepOut = upkeep(input.army ?? {}, input.research ?? {}, mode);
  for (const r of RESOURCES) rates[r] -= upkeepOut[r];
  return {
    rates,
    territory,
    capacity,
    energy: { supply, demand },
    efficiency,
    logistics: logisticsOut,
    upkeep: upkeepOut,
    recruits: recruitment(input.structures.filter((s) => s.level > 0), mode),
  };
}

/** Nós da rede logística a partir da entrada da economia: a nação é 0, aliados mantêm o id da nação deles (todos na aliança 1). */
export function networkOf(input: EconomyInput) {
  const own: LogisticsNode[] = [];
  for (const s of input.structures) {
    if (s.id === undefined || !s.at || s.level < 1) continue;
    own.push({ id: s.id, nation: 0, type: s.type, level: s.level, region: s.region, at: s.at });
  }
  const allied = (input.allied ?? []).filter((n) => n.level >= 1 && n.nation !== 0);
  return logistics([...own, ...allied], () => 1);
}

/** Saldo projetado: cada recurso cresce linearmente até a capacidade (o que já passou dela fica). */
export function project(amounts: ResourceMap, settledAt: number, rates: ResourceMap, capacity: number, at: number): ResourceMap {
  const h = Math.max(0, at - settledAt) / 3_600_000;
  const out = zero();
  for (const r of RESOURCES) {
    out[r] = projectOne(amounts[r], rates[r], capacity, h);
  }
  return out;
}

/**
 * Um recurso após `h` horas: cresce até a capacidade (o que já passou dela fica) e, com produção
 * negativa (manutenção maior que a produção), cai até zero.
 */
export function projectOne(a: number, rate: number, capacity: number, h: number): number {
  if (rate < 0) return Math.max(0, a + rate * h);
  return a >= capacity ? a : Math.min(capacity, a + rate * h);
}

export function missing(have: ResourceMap, cost: Cost): Cost {
  const out: Cost = {};
  for (const [r, v] of Object.entries(cost) as [Resource, number][]) if (have[r] + 1e-6 < v) out[r] = Math.ceil(v - have[r]);
  return out;
}

export function describeCost(cost: Cost): string {
  return (Object.entries(cost) as [Resource, number][]).map(([r, v]) => `${Math.ceil(v).toLocaleString('pt-BR')} de ${RESOURCE_INFO[r].short.toLowerCase()}`).join(', ');
}

export function slotsFor(regionId: string, capitalRegion: string | null): number {
  const area = REGION_BY_ID[regionId]?.area ?? 0;
  const base = Math.max(ECONOMY.slotsMin, Math.min(ECONOMY.slotsMax, Math.round(Math.sqrt(area / 25000))));
  return base + (regionId === capitalRegion ? ECONOMY.slotsCapitalBonus : 0);
}

/**
 * Por que não dá para construir este tipo nesta região agora (null = pode). Mesma regra no cliente
 * e no servidor. A posição exata (dentro da região, longe de outras construções) é conferida à parte.
 */
export function buildProblem(type: StructureType, ctx: { region: string; coast: boolean; capitalRegion: string | null; inRegion: number; queue: number }): string | null {
  const def = STRUCTURES[type];
  if (def.coastal && !ctx.coast) return 'Só em região com litoral.';
  const slots = slotsFor(ctx.region, ctx.capitalRegion);
  if (ctx.inRegion >= slots) return `A região já usa todos os ${slots} espaços de construção.`;
  if (ctx.queue >= ECONOMY.buildQueue) return `Já há ${ECONOMY.buildQueue} obras em andamento. Aguarde uma terminar.`;
  return null;
}

/** Custo da expansão para uma região: cresce 20% a cada região já controlada. */
export function expansionCost(ownedRegions: number): Cost {
  const k = 1 + 0.2 * Math.max(0, ownedRegions - 1);
  return { money: Math.round(200 * k), materials: Math.round(100 * k) };
}
