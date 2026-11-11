/**
 * Guerra (Fase E): ataques terrestres e navais, combate progressivo, ocupação de território
 * inimigo, mísseis e interceptação.
 *
 * O combate é determinístico: dado o estado inicial e os acontecimentos (reforços, mísseis), a
 * batalha é simulada em passos de 1 segundo. O servidor guarda só o início e os acontecimentos e
 * simula de novo quando precisa; nada é sorteado no combate. Documentação em docs/PLAY_RULES.md.
 */
import { distanceKm, REGION_BY_ID } from '../world/regions';
import type { Cost, StructureType } from './economy';
import { type Army, levelOf, MILITARY, type Research, TECHS, techBonus, UNIT_TYPES, type UnitType, UNITS } from './military';
import { type GameMode, MODE_SPEED } from './rules';

export const WAR_RULES_VERSION = 1;

type Built = { type: StructureType; level: number }[];

export const WAR = {
  /** Porcentagens oferecidas; menos de 25% não é permitido. */
  percents: [25, 50, 75, 100] as const,
  minPercent: 25,
  /** Operações de ataque simultâneas por nação. */
  maxOperations: 2,
  /** Resistência local de qualquer região (defesa abstrata da população e da polícia). */
  militia: 3,
  /** A defesa automática de uma região usa 1/√(regiões do defensor) das tropas em casa. */
  garrisonExponent: 0.5,
  /** Segundos-base da batalha (campanha): 40 s + 1 s a cada 12.000 km², entre 40 e 180. */
  baseMin: 40,
  baseMax: 180,
  baseAreaPerSecond: 12_000,
  /** Intensidade das baixas por segundo-base. */
  lossRate: 0.9,
  /** A operação fracassa se o atacante cair abaixo de 10% do poder inicial ou passar de 3× o tempo-base. */
  failBelow: 0.1,
  maxFactor: 3,
  /** Ataque naval: região litorânea a até 700 km de uma região litorânea sua, com pelo menos 1 navio. */
  seaRangeKm: 700,
  /** Unidades que não entram no combate terrestre (mísseis são lançados do silo). */
  excluded: [] as UnitType[],
  /** A região da capital pode ser tomada, mas defende 50% mais (Fase E, partida até 100%). */
  capitalBonus: 1.5,
  /** Míssil: alcance, velocidade, custo de lançamento e efeitos. */
  missile: {
    rangeKm: 2500,
    rangePerLevel: 750,
    /** km por minuto (campanha). */
    speedKmPerMin: 1500,
    minSeconds: 20,
    /** A interceptação, se houver, acontece a 85% do trajeto. */
    interceptAt: 0.85,
    /** Chance por nível de sistema antimísseis e por nível de pesquisa de interceptação; teto. */
    perAntimissile: 0.2,
    maxChance: 0.85,
  },
};

/** Poder de ataque de um grupo de unidades (com pesquisa). Navios só contam em operação naval. */
export function attackPower(army: Army, research: Research, naval = false): number {
  let a = 0;
  for (const u of UNIT_TYPES) {
    const n = army[u] ?? 0;
    if (!n || WAR.excluded.includes(u) || (u === 'navy' && !naval)) continue;
    a += UNITS[u].attack * n * (1 + techBonus(u, research));
  }
  return a;
}

/** Multiplicador de defesa da nação: fortificação + centros de defesa. */
export function defenseMultiplier(research: Research, structures: Built): number {
  return 1 + TECHS.fortification.effect.perLevel * (research.fortification ?? 0) + MILITARY.defenseCenterPerLevel * levelOf(structures, 'defense_center');
}

/** Poder de defesa de um grupo de unidades. */
export function defensePower(army: Army, research: Research, multiplier: number): number {
  let d = 0;
  for (const u of UNIT_TYPES) {
    const n = army[u] ?? 0;
    if (!n || WAR.excluded.includes(u) || u === 'navy') continue;
    d += UNITS[u].defense * n * (1 + techBonus(u, research)) * multiplier;
  }
  return d;
}

/** Parte do exército enviada: a mesma porcentagem de cada tipo, arredondada para baixo. */
export function share(army: Army, percent: number, naval = false): Army {
  const out: Army = {};
  for (const u of UNIT_TYPES) {
    if (WAR.excluded.includes(u) || (u === 'navy' && !naval)) continue;
    const n = Math.floor(((army[u] ?? 0) * percent) / 100);
    if (n > 0) out[u] = n;
  }
  return out;
}

/** Guarnição automática: fração das tropas em casa do defensor que defende a região atacada. */
export function garrison(home: Army, regions: number): Army {
  const f = 1 / Math.max(1, regions) ** WAR.garrisonExponent;
  const out: Army = {};
  for (const u of UNIT_TYPES) {
    if (WAR.excluded.includes(u) || u === 'navy') continue;
    const n = Math.floor((home[u] ?? 0) * f);
    if (n > 0) out[u] = n;
  }
  return out;
}

export function battleSeconds(regionId: string, mode: GameMode = 'campaign'): number {
  const area = REGION_BY_ID[regionId]?.area ?? 0;
  const s = Math.min(WAR.baseMax, Math.max(WAR.baseMin, WAR.baseMin + area / WAR.baseAreaPerSecond));
  return Math.max(10, Math.round(s / MODE_SPEED[mode]));
}

export type BattleEvent =
  | { at: number; kind: 'reinforce'; army: Army }
  | { at: number; kind: 'strike'; side: 'attacker' | 'defender'; fraction: number };

export interface BattleSetup {
  startedAt: number;
  /** Segundos-base (já no ritmo do modo). */
  base: number;
  naval: boolean;
  attacker: Army;
  attackerResearch: Research;
  defender: Army;
  defenderResearch: Research;
  defenderMultiplier: number;
  events: BattleEvent[];
}

export interface BattleState {
  /** Ocupação do território: 0 a 1. */
  progress: number;
  /** Tropas restantes (fracionárias durante a batalha; arredondadas ao fim). */
  attacker: Army;
  defender: Army;
  attackPower: number;
  defensePower: number;
  status: 'running' | 'won' | 'failed';
  /** Instante em que terminou (se terminou). */
  endedAt: number | null;
  /** Variação da ocupação por segundo no instante simulado (para a tela extrapolar). */
  rate: number;
}

const add = (a: Army, b: Army): Army => {
  const out: Army = { ...a };
  for (const u of UNIT_TYPES) if (b[u]) out[u] = (out[u] ?? 0) + (b[u] ?? 0);
  return out;
};
const scale = (a: Army, k: number): Army => {
  const out: Army = {};
  for (const u of UNIT_TYPES) if (a[u]) out[u] = (a[u] ?? 0) * k;
  return out;
};

/**
 * Simula a batalha até `until` (ms). A cada segundo:
 *   r = A ÷ (A + D), com D = defesa das tropas + resistência local;
 *   ocupação += (2r − 1) ÷ base (não cai abaixo de 0);
 *   atacante perde lossRate × (1 − r)^1,5 ÷ base de cada tipo; defensor perde lossRate × r^1,5 ÷ base.
 * Vence ao chegar a 100%. Fracassa abaixo de 10% do poder inicial ou após 3× o tempo-base.
 */
export function simulate(setup: BattleSetup, until: number): BattleState {
  let att: Army = { ...setup.attacker };
  let def: Army = { ...setup.defender };
  const events = [...setup.events].sort((a, b) => a.at - b.at);
  let ei = 0;
  const applyUntil = (t: number) => {
    while (ei < events.length && events[ei].at <= t) {
      const e = events[ei++];
      if (e.kind === 'reinforce') def = add(def, e.army);
      else if (e.side === 'attacker') att = scale(att, 1 - e.fraction);
      else def = scale(def, 1 - e.fraction);
    }
  };
  const powers = () => [attackPower(att, setup.attackerResearch, setup.naval), defensePower(def, setup.defenderResearch, setup.defenderMultiplier) + WAR.militia] as const;
  const A0 = Math.max(1e-9, attackPower(att, setup.attackerResearch, setup.naval));
  const limit = setup.startedAt + setup.base * WAR.maxFactor * 1000;
  const end = Math.min(until, limit);
  let progress = 0;
  let t = setup.startedAt;
  while (t + 1000 <= end) {
    applyUntil(t);
    const [A, D] = powers();
    if (A < WAR.failBelow * A0) return done(att, def, progress, A, D, 'failed', t);
    const r = A / (A + D);
    progress = Math.max(0, Math.min(1, progress + (2 * r - 1) / setup.base));
    att = scale(att, 1 - (WAR.lossRate * (1 - r) ** 1.5) / setup.base);
    def = scale(def, 1 - (WAR.lossRate * r ** 1.5) / setup.base);
    t += 1000;
    if (progress >= 1) return done(att, def, 1, ...powers(), 'won', t);
    if (t >= limit) return done(att, def, progress, ...powers(), 'failed', t);
  }
  applyUntil(Math.max(t, until));
  const [A, D] = powers();
  if (A < WAR.failBelow * A0) return done(att, def, progress, A, D, 'failed', t);
  const r = A / (A + D);
  const rate = progress <= 0 && r < 0.5 ? 0 : (2 * r - 1) / setup.base;
  return { progress, attacker: att, defender: def, attackPower: A, defensePower: D, status: 'running', endedAt: null, rate };
}

function done(att: Army, def: Army, progress: number, A: number, D: number, status: 'won' | 'failed', at: number): BattleState {
  return { progress, attacker: att, defender: def, attackPower: A, defensePower: D, status, endedAt: at, rate: 0 };
}
/** Quando a batalha termina, com os acontecimentos conhecidos até agora. */
export function predictEnd(setup: BattleSetup): number {
  const s = simulate(setup, setup.startedAt + setup.base * WAR.maxFactor * 1000 + 1000);
  return s.endedAt ?? setup.startedAt + setup.base * WAR.maxFactor * 1000;
}

/** Arredonda as tropas sobreviventes (para baixo; o que sobra de fração é baixa). */
export function survivors(army: Army): Army {
  const out: Army = {};
  for (const u of UNIT_TYPES) {
    const n = Math.floor((army[u] ?? 0) + 1e-6);
    if (n > 0) out[u] = n;
  }
  return out;
}

export function losses(before: Army, after: Army): Army {
  const out: Army = {};
  for (const u of UNIT_TYPES) {
    const d = (before[u] ?? 0) - (after[u] ?? 0);
    if (d > 0) out[u] = d;
  }
  return out;
}

export const troops = (a: Army) => UNIT_TYPES.reduce((n, u) => n + (a[u] ?? 0), 0);

/** Estimativa pública (inteligência): número arredondado a 2 algarismos significativos. */
export function estimate(n: number): number {
  if (n < 10) return Math.round(n);
  const p = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

export type Risk = 'baixo' | 'médio' | 'alto';
/** Risco estimado do ataque pela razão entre o ataque enviado e a defesa estimada. */
export function risk(sentAttack: number, estimatedDefense: number): Risk {
  const ratio = sentAttack / Math.max(1, estimatedDefense + WAR.militia);
  return ratio >= 3 ? 'baixo' : ratio >= 1.5 ? 'médio' : 'alto';
}

/**
 * Defesa estimada de uma região a partir do que é público: o poder militar do dono, a fração de
 * guarnição pelo número de regiões dele. É só estimativa: a composição real é segredo.
 */
export function estimatedDefense(ownerPower: number, ownerRegions: number): number {
  return estimate(ownerPower / Math.max(1, ownerRegions) ** WAR.garrisonExponent);
}

/** Região de origem por terra (fronteira) ou por mar (litoral a até 700 km), ou null. */
export function attackOrigin(owned: string[], target: string, hasNavy: boolean): { from: string; naval: boolean } | null {
  const t = REGION_BY_ID[target];
  if (!t) return null;
  const set = new Set(owned);
  const land = t.neighbors.find((n) => set.has(n));
  if (land) return { from: land, naval: false };
  if (!hasNavy || !t.coast) return null;
  let best: { id: string; km: number } | null = null;
  for (const id of owned) {
    const r = REGION_BY_ID[id];
    if (!r?.coast) continue;
    const km = distanceKm(r.at, t.at);
    if (km <= WAR.seaRangeKm && (!best || km < best.km)) best = { id, km };
  }
  return best ? { from: best.id, naval: true } : null;
}

// ---------- mísseis ----------

/**
 * Armas do silo. Com o silo pronto, lança direto: sem pesquisa e sem estoque, pagando o custo de
 * cada lançamento. A bomba pesada causa mais estrago, alcança menos e voa mais devagar.
 */
export type Weapon = 'missile' | 'bomb';
export const WEAPONS: Record<
  Weapon,
  { name: string; short: string; cost: Cost; rangeFactor: number; speedKmPerMin: number; levels: number; homeLoss: number; engagedLoss: number }
> = {
  missile: { name: 'Míssil', short: 'Míssil', cost: { money: 500, oil: 80 }, rangeFactor: 1, speedKmPerMin: 1500, levels: 1, homeLoss: 0.06, engagedLoss: 0.25 },
  bomb: { name: 'Bomba pesada', short: 'Bomba', cost: { money: 1000, metal: 150, oil: 150 }, rangeFactor: 0.6, speedKmPerMin: 900, levels: 2, homeLoss: 0.12, engagedLoss: 0.4 },
};
export const WEAPON_TYPES: Weapon[] = ['missile', 'bomb'];

/** Alcance (km) do silo para a arma: 2.500 km + 750 km por nível acima do 1, × fator da arma. */
export function missileRange(siloLevel: number, weapon: Weapon = 'missile'): number {
  return Math.round((WAR.missile.rangeKm + WAR.missile.rangePerLevel * Math.max(0, siloLevel - 1)) * WEAPONS[weapon].rangeFactor);
}

export function missileSeconds(km: number, mode: GameMode = 'campaign', weapon: Weapon = 'missile'): number {
  return Math.max(WAR.missile.minSeconds / MODE_SPEED[mode], Math.round(((km / WEAPONS[weapon].speedKmPerMin) * 60) / MODE_SPEED[mode]));
}

/** Chance de interceptação do defensor: 20% por nível de antimísseis + 10% por nível de pesquisa; sem antimísseis, 0. */
export function interceptChance(defenderStructures: Built, defenderResearch: Research): number {
  const am = levelOf(defenderStructures, 'antimissile');
  if (am < 1) return 0;
  return Math.min(WAR.missile.maxChance, am * WAR.missile.perAntimissile + TECHS.interception.effect.perLevel * (defenderResearch.interception ?? 0));
}

/** Sorteio reproduzível pela identidade do lançamento (o servidor decide; qualquer um pode conferir). */
export function interceptRoll(strikeId: number): number {
  let h = 0x9e3779b9 ^ strikeId;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x1_0000_0000;
}

/** Tropas de uma nação presas numa operação (valores iniciais: a manutenção segue até o fim). */
export function engagedIn(op: { attackerId: number; defenderId: number; setup: Pick<BattleSetup, 'attacker' | 'defender'>; events: BattleEvent[] }, governorId: number): Army {
  if (op.attackerId === governorId) return { ...op.setup.attacker };
  if (op.defenderId !== governorId) return {};
  let out: Army = { ...op.setup.defender };
  for (const e of op.events) if (e.kind === 'reinforce') out = add(out, e.army);
  return out;
}

export const sumArmies = (...armies: Army[]): Army => armies.reduce((a, b) => add(a, b), {} as Army);
