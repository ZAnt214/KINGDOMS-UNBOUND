// Definições de jogo versionadas da Fase A. Valores são DECISÕES DE BALANCEAMENTO
// iniciais do KINGDOMS UNBOUND (não números de outros jogos) e ficam num único lugar
// para cliente e servidor. O servidor é a única autoridade: o cliente só usa estes
// dados para exibir custos e tempos.

export const RULES_VERSION = 1;

export const RESOURCE_TYPES = ['food', 'wood', 'stone', 'gold'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type ResourceMap = Record<ResourceType, number>;

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  food: 'Alimento',
  wood: 'Madeira',
  stone: 'Pedra',
  gold: 'Ouro',
};

export const STARTING_RESOURCES: ResourceMap = { food: 3000, wood: 3000, stone: 1500, gold: 500 };

export interface CivilizationDef {
  id: string;
  name: string;
  motto: string;
  description: string;
  /** Bônus percentual de produção por recurso (0.1 = +10%). */
  production: Partial<ResourceMap>;
  /** Bônus de velocidade de construção (0.1 = obras 10% mais rápidas). */
  buildSpeed: number;
  color: string;
  accent: string;
}

export const CIVILIZATIONS: CivilizationDef[] = [
  {
    id: 'auren',
    name: 'Coroa de Auren',
    motto: 'Celeiros cheios, muralhas firmes.',
    description: 'Reino de planícies férteis. +15% produção de alimento.',
    production: { food: 0.15 },
    buildSpeed: 0,
    color: '#2f6fb3',
    accent: '#f2c14e',
  },
  {
    id: 'kharuun',
    name: 'Clãs de Kharuun',
    motto: 'A montanha não se curva.',
    description: 'Povo das pedreiras do norte. +15% produção de pedra.',
    production: { stone: 0.15 },
    buildSpeed: 0,
    color: '#8e3b2f',
    accent: '#d9d2c3',
  },
  {
    id: 'veyra',
    name: 'Ligas de Veyra',
    motto: 'Quem constrói primeiro, governa depois.',
    description: 'Mestres-arquitetos das costas. Obras 10% mais rápidas.',
    production: {},
    buildSpeed: 0.1,
    color: '#2f8a5f',
    accent: '#e7e1b5',
  },
];

export const CIVILIZATION_BY_ID: Record<string, CivilizationDef> = Object.fromEntries(
  CIVILIZATIONS.map((c) => [c.id, c]),
);

export const BUILDING_TYPES = ['town_hall', 'farm', 'sawmill', 'quarry', 'gold_mine', 'warehouse'] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

export interface BuildingDef {
  id: BuildingType;
  name: string;
  description: string;
  maxLevel: number;
  startLevel: number;
  /** Custo para subir do nível 0→1; cresce geometricamente por nível. */
  baseCost: Partial<ResourceMap>;
  costGrowth: number;
  baseDurationSec: number;
  durationGrowth: number;
  produces?: ResourceType;
  /** Produção por hora no nível 1. */
  baseRate?: number;
  powerPerLevel: number;
  /** Nível mínimo da prefeitura para construir (nível 0→1). */
  unlockHallLevel?: number;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  town_hall: {
    id: 'town_hall',
    name: 'Prefeitura',
    description: 'Coração da cidade. Limita o nível de todos os outros edifícios.',
    maxLevel: 10,
    startLevel: 1,
    baseCost: { food: 400, wood: 400, stone: 200 },
    costGrowth: 1.8,
    baseDurationSec: 30,
    durationGrowth: 1.9,
    powerPerLevel: 120,
  },
  farm: {
    id: 'farm',
    name: 'Fazenda',
    description: 'Produz alimento continuamente, mesmo com o jogo fechado.',
    maxLevel: 10,
    startLevel: 1,
    baseCost: { food: 80, wood: 160 },
    costGrowth: 1.6,
    baseDurationSec: 10,
    durationGrowth: 1.7,
    produces: 'food',
    baseRate: 600,
    powerPerLevel: 30,
  },
  sawmill: {
    id: 'sawmill',
    name: 'Serraria',
    description: 'Produz madeira continuamente.',
    maxLevel: 10,
    startLevel: 1,
    baseCost: { food: 160, wood: 80 },
    costGrowth: 1.6,
    baseDurationSec: 10,
    durationGrowth: 1.7,
    produces: 'wood',
    baseRate: 600,
    powerPerLevel: 30,
  },
  quarry: {
    id: 'quarry',
    name: 'Pedreira',
    description: 'Extrai pedra para obras maiores.',
    maxLevel: 10,
    startLevel: 1,
    baseCost: { food: 150, wood: 150 },
    costGrowth: 1.6,
    baseDurationSec: 15,
    durationGrowth: 1.7,
    produces: 'stone',
    baseRate: 300,
    powerPerLevel: 35,
  },
  gold_mine: {
    id: 'gold_mine',
    name: 'Mina de Ouro',
    description: 'Extrai ouro. Liberada na Prefeitura nível 2.',
    maxLevel: 10,
    startLevel: 0,
    baseCost: { food: 300, wood: 300, stone: 150 },
    costGrowth: 1.65,
    baseDurationSec: 20,
    durationGrowth: 1.75,
    produces: 'gold',
    baseRate: 150,
    powerPerLevel: 45,
    unlockHallLevel: 2,
  },
  warehouse: {
    id: 'warehouse',
    name: 'Armazém',
    description: 'Define a capacidade máxima de cada recurso.',
    maxLevel: 10,
    startLevel: 1,
    baseCost: { food: 200, wood: 250, stone: 100 },
    costGrowth: 1.6,
    baseDurationSec: 15,
    durationGrowth: 1.7,
    powerPerLevel: 25,
  },
};

export type BuildingLevels = Record<BuildingType, number>;

export function upgradeCost(type: BuildingType, fromLevel: number): Partial<ResourceMap> {
  const def = BUILDINGS[type];
  const mult = Math.pow(def.costGrowth, fromLevel);
  const cost: Partial<ResourceMap> = {};
  for (const r of RESOURCE_TYPES) {
    const base = def.baseCost[r];
    if (base) cost[r] = Math.round(base * mult);
  }
  return cost;
}

export function upgradeDurationSec(type: BuildingType, fromLevel: number, civId: string): number {
  const def = BUILDINGS[type];
  const civ = CIVILIZATION_BY_ID[civId];
  const raw = def.baseDurationSec * Math.pow(def.durationGrowth, fromLevel);
  return Math.max(1, Math.round(raw / (1 + (civ?.buildSpeed ?? 0))));
}

/** Produção por hora de um recurso, dado os níveis da cidade e a civilização. */
export function productionPerHour(levels: BuildingLevels, civId: string): ResourceMap {
  const civ = CIVILIZATION_BY_ID[civId];
  const out: ResourceMap = { food: 0, wood: 0, stone: 0, gold: 0 };
  for (const type of BUILDING_TYPES) {
    const def = BUILDINGS[type];
    const level = levels[type] ?? 0;
    if (!def.produces || !def.baseRate || level <= 0) continue;
    const rate = def.baseRate * level * Math.pow(1.15, level - 1);
    out[def.produces] += rate * (1 + (civ?.production[def.produces] ?? 0));
  }
  return out;
}

/** Capacidade de armazenamento por recurso. */
export function storageCapacity(levels: BuildingLevels): number {
  const level = Math.max(1, levels.warehouse ?? 1);
  return Math.round(10000 * level * Math.pow(1.35, level - 1));
}

export function cityPower(levels: BuildingLevels): number {
  let p = 0;
  for (const type of BUILDING_TYPES) {
    const level = levels[type] ?? 0;
    p += BUILDINGS[type].powerPerLevel * level * (1 + level * 0.25);
  }
  return Math.round(p);
}

/** Retorna null se a melhoria é permitida; caso contrário, a mensagem do bloqueio. */
export function upgradeBlocker(type: BuildingType, levels: BuildingLevels): string | null {
  const def = BUILDINGS[type];
  const current = levels[type] ?? 0;
  if (current >= def.maxLevel) return `${def.name} já está no nível máximo.`;
  const hall = levels.town_hall ?? 1;
  if (type === 'town_hall') {
    const target = current + 1;
    if (target >= 3 && (levels.warehouse ?? 0) < target - 1) {
      return `Prefeitura nível ${target} exige Armazém nível ${target - 1}.`;
    }
    return null;
  }
  if (current === 0 && def.unlockHallLevel && hall < def.unlockHallLevel) {
    return `Exige Prefeitura nível ${def.unlockHallLevel}.`;
  }
  if (current + 1 > hall) return `Nível não pode superar a Prefeitura (nível ${hall}).`;
  return null;
}

export const ALLIANCE_RANKS = [1, 2, 3, 4, 5] as const;
export const ALLIANCE_MAX_MEMBERS = 100;
export const ALLIANCE_RANK_LABELS: Record<number, string> = {
  1: 'R1 · Recruta',
  2: 'R2 · Membro',
  3: 'R3 · Veterano',
  4: 'R4 · Oficial',
  5: 'R5 · Líder',
};

/** Matriz de permissões da aliança (Fase A). Verificada SEMPRE no servidor. */
export const ALLIANCE_PERMISSIONS = {
  readChat: 1,
  writeChat: 1,
  reviewApplications: 4,
  kick: 4,
  setRank: 5,
  transferLeadership: 5,
} as const;
export type AlliancePermission = keyof typeof ALLIANCE_PERMISSIONS;

export function hasAlliancePermission(rank: number, perm: AlliancePermission): boolean {
  return rank >= ALLIANCE_PERMISSIONS[perm];
}

export const CHAT_MAX_LENGTH = 500;
export const CHAT_RATE = { messages: 5, perSeconds: 10 };

/** Extrai referências de coordenadas como "X:12 Y:40" ou "12,40" com prefixo. */
export function extractCoordinates(body: string, width: number, height: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const re = /\bX\s*[:=]?\s*(\d{1,4})\s*[,;]?\s*Y\s*[:=]?\s*(\d{1,4})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) && out.length < 5) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (x < width && y < height) out.push({ x, y });
  }
  return out;
}
