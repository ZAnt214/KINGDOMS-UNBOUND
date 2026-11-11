// SERVIDOR FALSO, SÓ PARA TESTE VISUAL. Não é o servidor do jogo e nunca roda em produção.
//
// Guarda tudo em memória e responde às rotas que a tela usa, aplicando as mesmas regras
// compartilhadas (shared/play, shared/world) para que a interface possa ser exercitada num
// navegador sem Postgres. Persistência, concorrência, sessões e isolamento NÃO são provados aqui:
// isso é papel de tests/integration/*.test.ts, que usam o servidor real.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  buildProblem,
  computeEconomy,
  type Cost,
  describeCost,
  ECONOMY,
  expansionCost,
  missing,
  project,
  type ResourceMap,
  STRUCTURE_TYPES,
  structureCost,
  structureSeconds,
  STRUCTURES,
  type StructureType,
} from '../../../shared/play/economy';
import {
  type Army,
  MILITARY,
  militaryPower,
  projectRecruits,
  type Research,
  researchProblem,
  TECH_TYPES,
  type TechType,
  techCost,
  techSeconds,
  trainCost,
  UNIT_TYPES,
  unitProblem,
  type UnitType,
} from '../../../shared/play/military';
import { FLAG_PRESETS, inspectFlagImage, parseFlag } from '../../../shared/play/flags';
import { botIdentities, buildArena, matchOutcome, pickBotPoints, QUICK, rank, THEATERS } from '../../../shared/play/match';
import { cleanNationName, COLOR_EXCLUSION_KM, expansionSeconds, type GameMode, MODES_AVAILABLE, NATION_COLOR_BY_HEX, nationNameProblem } from '../../../shared/play/rules';
import type { EconomyView, MilitaryView, NationView, OccupationView, OperationView, StrikeView, StructureView, WorldView } from '../../../shared/play/types';
import {
  attackOrigin,
  attackPower,
  battleSeconds,
  type BattleSetup,
  defenseMultiplier,
  engagedIn,
  estimate,
  garrison,
  interceptChance,
  interceptRoll,
  losses,
  missileRange,
  missileSeconds,
  predictEnd,
  share,
  simulate,
  sumArmies,
  survivors,
  troops,
  WAR,
  type Weapon,
  WEAPONS,
} from '../../../shared/play/war';
import { freePointIn, regionAt } from '../../../server/src/geo';
import { borderingRegion, distanceKm, expansionTargets, REGION_BY_ID, START_POINT_BY_ID, START_POINTS, type StartPoint } from '../../../shared/world/regions';

const PORT = Number(process.env.PORT ?? 4173);
const STATIC = process.env.STATIC_DIR ?? 'public';
/** Divide as durações para a captura não esperar o tempo real (padrão: 1 = igual ao jogo). */
const SPEED = Number(process.env.MOCK_SPEED ?? 1);

interface World {
  view: WorldView;
  nations: Map<number, NationView & { image?: { bytes: Buffer; type: string } }>;
  control: Map<string, number>;
  occupations: OccupationView[];
  structures: Map<number, StructureView>;
  wallet: Map<number, { amounts: ResourceMap; settledAt: number }>;
  bots: Set<number>;
  army: Map<number, MockArmy>;
  ops: Map<number, { view: OperationView; setup: BattleSetup }>;
  strikes: Map<number, StrikeView>;
}
interface MockArmy {
  recruits: number;
  settledAt: number;
  units: Army;
  research: Research;
  training: MilitaryView['training'];
  researching: MilitaryView['researching'];
}
interface Session {
  userId: number;
  username: string;
  seats: Map<number, number>; // mundo → governador
}

let nextId = 1;
const id = () => nextId++;
const worlds = new Map<number, World>();
const newWorld = (wid: number, name: string, mode: GameMode, arena: string[] | null): World => ({
  view: { id: wid, name, mode, arena, endsAt: null, startedAt: null, finishedAt: null, outcome: null, winner: null, results: [] },
  nations: new Map(),
  control: new Map(),
  occupations: [],
  structures: new Map(),
  wallet: new Map(),
  bots: new Set(),
  army: new Map(),
  ops: new Map(),
  strikes: new Map(),
});
worlds.set(1, newWorld(1, 'Campanha · Mundo 1 (servidor falso)', 'campaign', null));
const sessions = new Map<string, Session>();
const sockets = new Map<WebSocket, { world: number; gov: number | null }>();

const send = (wid: number, event: object, gov: number | null = null) => {
  const data = JSON.stringify({ ...event, serverTime: Date.now() });
  for (const [ws, c] of sockets) if (c.world === wid && (gov === null || c.gov === gov)) ws.send(data);
};

class Fail extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// ---------- economia ----------

const inputs = (w: World, gid: number) => ({
  regions: [...w.control].filter(([, o]) => o === gid).map(([r]) => r),
  capitalRegion: START_POINT_BY_ID[w.nations.get(gid)!.capital].region,
  structures: [...w.structures.values()].filter((s) => s.nationId === gid && s.level > 0).map((s) => ({ id: s.id, type: s.type, level: s.level, region: s.region, at: s.at })),
  army: w.army.get(gid)?.units ?? {},
  research: w.army.get(gid)?.research ?? {},
});
function settle(w: World, gid: number, at = Date.now()) {
  const wal = w.wallet.get(gid)!;
  const e = computeEconomy(inputs(w, gid), w.view.mode);
  const a = w.army.get(gid);
  if (a && at > a.settledAt) {
    a.recruits = projectRecruits(a.recruits, a.settledAt, e.recruits.rate, e.recruits.cap, at);
    a.settledAt = at;
  }
  if (at <= wal.settledAt) return wal.amounts;
  wal.amounts = project(wal.amounts, wal.settledAt, e.rates, e.capacity, at);
  wal.settledAt = at;
  return wal.amounts;
}

// ---------- guerra (mesmas regras de shared/play/war.ts) ----------

const homeOf = (w: World, gid: number) => w.army.get(gid)!.units;
function takeArmy(w: World, gid: number, a: Army) {
  const u = homeOf(w, gid);
  for (const [k, v] of Object.entries(a) as [UnitType, number][]) u[k] = (u[k] ?? 0) - v;
}
function giveArmy(w: World, gid: number, a: Army) {
  const u = homeOf(w, gid);
  for (const [k, v] of Object.entries(a) as [UnitType, number][]) u[k] = (u[k] ?? 0) + v;
}
function opView(w: World, id: number, viewer: number | null): OperationView {
  const { view, setup } = w.ops.get(id)!;
  const now = Date.now();
  const at = view.status === 'active' ? Math.min(now, view.endsAt) : view.endsAt;
  const sim = simulate(setup, at);
  const out: OperationView = {
    ...view,
    progress: { at, value: view.status === 'won' ? 1 : sim.progress, rate: view.status === 'active' ? sim.rate : 0 },
    attackerTroops: estimate(troops(survivors(sim.attacker))),
    defenderTroops: estimate(troops(survivors(sim.defender))),
  };
  if (viewer === view.attackerId || viewer === view.defenderId) {
    const side = viewer === view.attackerId ? 'attacker' : 'defender';
    out.mine = { side, sent: engagedIn({ ...view, setup, events: setup.events }, viewer), remaining: survivors(side === 'attacker' ? sim.attacker : sim.defender) };
  }
  return out;
}
function announceOp(w: World, id: number) {
  const v = w.ops.get(id)!.view;
  send(w.view.id, { type: 'play.operation', operation: opView(w, id, null) });
  for (const g of [v.attackerId, v.defenderId]) send(w.view.id, { type: 'play.operation', operation: opView(w, id, g) }, g);
}
function attackRegion(w: World, gid: number, region: string, percent: number) {
  if (!(WAR.percents as readonly number[]).includes(percent)) throw new Fail(400, 'invalid_percent', 'Porcentagem inválida.');
  const owner = w.control.get(region);
  if (owner === undefined || owner === gid) throw new Fail(409, 'not_enemy', 'Escolha uma região de outra nação.');
  if (START_POINT_BY_ID[w.nations.get(owner)!.capital].region === region) throw new Fail(409, 'capital', 'A região da capital não pode ser tomada por terra. Mísseis podem atingi-la.');
  if ([...w.ops.values()].some((o) => o.view.status === 'active' && o.view.region === region)) throw new Fail(409, 'region_contested', 'Já há uma operação militar nesta região.');
  const owned = [...w.control].filter(([, o]) => o === gid).map(([r]) => r);
  const origin = attackOrigin(owned, region, (homeOf(w, gid).navy ?? 0) > 0);
  if (!origin) throw new Fail(409, 'not_adjacent', 'Sem fronteira terrestre com o seu território.');
  const a = w.army.get(gid)!;
  const sent = share(a.units, percent, origin.naval);
  if (attackPower(sent, a.research, origin.naval) <= 0) throw new Fail(409, 'no_troops', 'Não há tropas suficientes para esta porcentagem.');
  const d = w.army.get(owner)!;
  const defenders = garrison(d.units, [...w.control.values()].filter((o) => o === owner).length);
  const setup: BattleSetup = {
    startedAt: Date.now(),
    base: battleSeconds(region, w.view.mode) / SPEED,
    naval: origin.naval,
    attacker: sent,
    attackerResearch: a.research,
    defender: defenders,
    defenderResearch: d.research,
    defenderMultiplier: defenseMultiplier(d.research, builtOf(w, owner)),
    events: [],
  };
  takeArmy(w, gid, sent);
  takeArmy(w, owner, defenders);
  const id = nextId++;
  const view: OperationView = {
    id,
    attackerId: gid,
    defenderId: owner,
    region,
    from: origin.from,
    naval: origin.naval,
    startedAt: setup.startedAt,
    endsAt: predictEnd(setup),
    progress: { at: setup.startedAt, value: 0, rate: 0 },
    attackerTroops: 0,
    defenderTroops: 0,
    status: 'active',
  };
  w.ops.set(id, { view, setup });
  announceOp(w, id);
  for (const g of [gid, owner]) send(w.view.id, { type: 'play.military', military: militaryView(w, g) }, g);
  return opView(w, id, gid);
}
function finishOps(w: World, now: number) {
  for (const [id, o] of w.ops) {
    if (o.view.status !== 'active' || o.view.endsAt > now) continue;
    const sim = simulate(o.setup, o.view.endsAt + 1000);
    const won = sim.status === 'won';
    const { attackerId: a, defenderId: d } = o.view;
    settle(w, a, o.view.endsAt);
    settle(w, d, o.view.endsAt);
    const attBack = survivors(sim.attacker);
    const defBack = survivors(sim.defender);
    giveArmy(w, a, attBack);
    giveArmy(w, d, defBack);
    o.view = {
      ...o.view,
      status: won ? 'won' : 'failed',
      result: { attackerLosses: troops(losses(o.setup.attacker, attBack)), defenderLosses: troops(losses(engagedIn({ ...o.view, setup: o.setup, events: o.setup.events }, d), defBack)) },
    };
    announceOp(w, id);
    if (won) {
      w.control.set(o.view.region, a);
      send(w.view.id, { type: 'play.region', region: o.view.region, nationId: a, occupationId: -id, at: o.view.endsAt });
      const moved = [...w.structures.values()].filter((x) => x.region === o.view.region && x.nationId === d).map((x) => ({ ...x, nationId: a }));
      for (const x of moved) w.structures.set(x.id, x);
      if (moved.length) send(w.view.id, { type: 'play.transfer', structures: moved });
    }
    for (const g of [a, d]) {
      refreshPower(w, g);
      announceEconomy(w, g);
      send(w.view.id, { type: 'play.military', military: militaryView(w, g) }, g);
    }
    if (w.view.mode === 'quick') checkMatch(w);
  }
}

function launchMissile(w: World, gid: number, siloId: number, region: string, weapon: Weapon) {
  const silo = w.structures.get(siloId);
  if (!silo || silo.nationId !== gid || silo.type !== 'missile_silo' || silo.level < 1) throw new Fail(404, 'not_found', 'Silo não encontrado.');
  const owner = w.control.get(region);
  if (owner === undefined || owner === gid) throw new Fail(409, 'not_enemy', 'Escolha uma região de outra nação.');
  const a = w.army.get(gid)!;
  const km = distanceKm(silo.at, REGION_BY_ID[region].at);
  const range = missileRange(silo.level, weapon);
  if (km > range) throw new Fail(409, 'out_of_range', 'Fora do alcance.');
  if ([...w.strikes.values()].some((x) => x.status === 'flying' && x.from[0] === silo.at[0] && x.from[1] === silo.at[1])) throw new Fail(409, 'silo_busy', 'Este silo já tem um míssil em voo.');
  spend(w, gid, WEAPONS[weapon].cost, 'o lançamento');
  const chance = interceptChance(builtOf(w, owner), w.army.get(owner)!.research);
  const now = Date.now();
  const flight = (missileSeconds(km, w.view.mode, weapon) * 1000) / SPEED;
  const id = nextId++;
  const strike: StrikeView = {
    id,
    attackerId: gid,
    defenderId: owner,
    from: silo.at,
    region,
    to: REGION_BY_ID[region].at,
    launchedAt: now,
    flightAt: now + 2200,
    interceptAt: now + 2200 + flight * WAR.missile.interceptAt,
    impactAt: now + 2200 + flight,
    intercepted: interceptRoll(id) < chance,
    status: 'flying',
    weapon,
  };
  w.strikes.set(id, strike);
  send(w.view.id, { type: 'play.strike', strike });
  announceEconomy(w, gid);
  send(w.view.id, { type: 'play.military', military: militaryView(w, gid) }, gid);
  return strike;
}
function finishStrikes(w: World, now: number) {
  for (const x of w.strikes.values()) {
    if (x.status !== 'flying' || x.impactAt > now) continue;
    if (x.intercepted) {
      x.status = 'intercepted';
    } else {
      x.status = 'impact';
      settle(w, x.defenderId, x.impactAt);
      const home = homeOf(w, x.defenderId);
      let lost = 0;
      for (const u of UNIT_TYPES) {
        const k = Math.floor((home[u] ?? 0) * WEAPONS[x.weapon].homeLoss);
        home[u] = (home[u] ?? 0) - k;
        lost += k;
      }
      const target = [...w.structures.values()].filter((s) => s.region === x.region && s.nationId === x.defenderId && s.level > 0 && !s.building).sort((a, b) => b.level - a.level)[0];
      let structure: { type: StructureType; from: number; to: number } | null = null;
      if (target) {
        const to = Math.max(0, target.level - WEAPONS[x.weapon].levels);
        structure = { type: target.type, from: target.level, to };
        if (to === 0) {
          w.structures.delete(target.id);
          send(w.view.id, { type: 'play.structure.removed', structureId: target.id });
        } else {
          const up = { ...target, level: to };
          w.structures.set(up.id, up);
          send(w.view.id, { type: 'play.structure', structure: up, completed: false });
        }
      }
      x.result = { troopsLost: estimate(lost), structure, engaged: false };
      refreshPower(w, x.defenderId);
    }
    send(w.view.id, { type: 'play.strike', strike: x });
  }
}

// ---------- exército (mesmas regras de shared/play/military.ts) ----------

const builtOf = (w: World, gid: number) => [...w.structures.values()].filter((s) => s.nationId === gid && s.level > 0).map((s) => ({ type: s.type, level: s.level }));
function militaryView(w: World, gid: number): MilitaryView | null {
  const a = w.army.get(gid);
  if (!a) return null;
  const e = computeEconomy(inputs(w, gid), w.view.mode);
  return {
    recruits: { amount: a.recruits, settledAt: a.settledAt, rate: e.recruits.rate, cap: e.recruits.cap },
    army: { ...a.units },
    training: [...a.training],
    research: { ...a.research },
    researching: a.researching,
    power: militaryPower(a.units, a.research, builtOf(w, gid)),
    engaged: sumArmies(...[...w.ops.values()].filter((o) => o.view.status === 'active').map((o) => engagedIn({ ...o.view, setup: o.setup, events: o.setup.events }, gid))),
  };
}
function refreshPower(w: World, gid: number) {
  const n = w.nations.get(gid);
  const power = militaryPower(w.army.get(gid)!.units, w.army.get(gid)!.research, builtOf(w, gid)).power;
  if (n && n.power !== power) {
    n.power = power;
    n.troops = estimate(militaryPower(w.army.get(gid)!.units, {}, []).troops);
    send(w.view.id, { type: 'play.power', nationId: gid, power, troops: n.troops });
  }
}
function train(w: World, gid: number, unit: UnitType, amount: number) {
  if (!UNIT_TYPES.includes(unit)) throw new Fail(400, 'invalid_unit', 'Unidade desconhecida.');
  if (!Number.isInteger(amount) || amount < 1 || amount > MILITARY.maxBatch) throw new Fail(400, 'invalid_amount', 'Quantidade inválida.');
  const a = w.army.get(gid)!;
  const problem = unitProblem(unit, builtOf(w, gid), a.research);
  if (problem) throw new Fail(409, 'cannot_train', problem);
  // Na hora: com a instalação e os recursos, as unidades entram no exército no mesmo pedido.
  spend(w, gid, trainCost(unit, amount).cost, 'estas unidades');
  a.units[unit] = (a.units[unit] ?? 0) + amount;
  refreshPower(w, gid);
  announceEconomy(w, gid);
  send(w.view.id, { type: 'play.military', military: militaryView(w, gid), done: { kind: 'training', unit, amount } }, gid);
  return militaryView(w, gid);
}
function startResearch(w: World, gid: number, tech: TechType) {
  if (!TECH_TYPES.includes(tech)) throw new Fail(400, 'invalid_tech', 'Pesquisa desconhecida.');
  const a = w.army.get(gid)!;
  const problem = researchProblem(tech, builtOf(w, gid), a.research, a.researching !== null);
  if (problem) throw new Fail(409, 'cannot_research', problem);
  const from = a.research[tech] ?? 0;
  spend(w, gid, techCost(tech, from), 'esta pesquisa');
  const now = Date.now();
  a.researching = { tech, to: from + 1, startedAt: now, endsAt: now + (techSeconds(tech, from, w.view.mode) * 1000) / SPEED };
  announceEconomy(w, gid);
  return militaryView(w, gid);
}
function militaryTick(w: World, gid: number, now: number) {
  const a = w.army.get(gid)!;
  while (a.training[0] && a.training[0].endsAt <= now) {
    const t = a.training.shift()!;
    settle(w, gid, t.endsAt);
    a.units[t.unit] = (a.units[t.unit] ?? 0) + t.amount;
    refreshPower(w, gid);
    announceEconomy(w, gid);
    send(w.view.id, { type: 'play.military', military: militaryView(w, gid), done: { kind: 'training', unit: t.unit, amount: t.amount } }, gid);
  }
  if (a.researching && a.researching.endsAt <= now) {
    const r = a.researching;
    settle(w, gid, r.endsAt);
    a.research[r.tech] = r.to;
    a.researching = null;
    refreshPower(w, gid);
    announceEconomy(w, gid);
    send(w.view.id, { type: 'play.military', military: militaryView(w, gid), done: { kind: 'research', tech: r.tech, level: r.to } }, gid);
  }
}
function spend(w: World, gid: number, cost: Cost, what: string) {
  const have = settle(w, gid);
  const short = missing(have, cost);
  if (Object.keys(short).length) throw new Fail(409, 'insufficient', `Recursos insuficientes para ${what}. Faltam ${describeCost(short)}.`);
  for (const [r, v] of Object.entries(cost) as [keyof ResourceMap, number][]) have[r] -= v;
}
function economyView(w: World, gid: number): EconomyView | null {
  const wal = w.wallet.get(gid);
  if (!wal) return null;
  const e = computeEconomy(inputs(w, gid), w.view.mode);
  return { amounts: { ...wal.amounts }, settledAt: wal.settledAt, rates: e.rates, capacity: e.capacity, energy: e.energy, efficiency: e.efficiency, logistics: e.logistics, upkeep: e.upkeep };
}
const announceEconomy = (w: World, gid: number) => send(w.view.id, { type: 'play.economy', economy: economyView(w, gid) }, gid);

// ---------- relógio: ocupações, obras, partidas, bots ----------

function tick() {
  const now = Date.now();
  for (const w of worlds.values()) {
    if (w.view.finishedAt) continue;
    for (const o of w.occupations.filter((x) => x.endsAt <= now)) {
      w.occupations = w.occupations.filter((x) => x.id !== o.id);
      if (w.control.has(o.region)) continue;
      settle(w, o.nationId, o.endsAt);
      w.control.set(o.region, o.nationId);
      send(w.view.id, { type: 'play.region', region: o.region, nationId: o.nationId, occupationId: o.id, at: o.endsAt });
      announceEconomy(w, o.nationId);
    }
    for (const s of w.structures.values()) {
      if (!s.building || s.building.endsAt > now) continue;
      settle(w, s.nationId, s.building.endsAt);
      const done: StructureView = { ...s, level: s.building.to, building: null };
      w.structures.set(s.id, done);
      send(w.view.id, { type: 'play.structure', structure: done, completed: true });
      announceEconomy(w, s.nationId);
      if (STRUCTURES[s.type].military) refreshPower(w, s.nationId);
    }
    for (const gid of w.army.keys()) militaryTick(w, gid, now);
    finishOps(w, now);
    finishStrikes(w, now);
    if (w.view.mode === 'quick' && w.view.startedAt) {
      for (const b of w.bots) botStep(w, b);
      checkMatch(w);
    }
  }
}
setInterval(tick, 250);

const nextThink = new Map<number, number>();
function botStep(w: World, gid: number) {
  if ((nextThink.get(gid) ?? 0) > Date.now()) return;
  nextThink.set(gid, Date.now() + (QUICK.botThink[0] + Math.random() * (QUICK.botThink[1] - QUICK.botThink[0])) * 1000);
  const cap = START_POINT_BY_ID[w.nations.get(gid)!.capital].region;
  if (![...w.structures.values()].some((s) => s.nationId === gid && s.type === 'city')) {
    try {
      const at = freePointIn(cap, [...w.structures.values()].map((s) => s.at), ECONOMY.minDistanceKm + 5);
      if (at) build(w, gid, at, 'city', cap);
    } catch {
      /* sem recursos: tenta depois */
    }
  }
  if (w.occupations.some((o) => o.nationId === gid)) return;
  const mine = [...w.control].filter(([, o]) => o === gid).map(([r]) => r);
  const busy = new Set(w.occupations.map((o) => o.region));
  const arena = new Set(w.view.arena!);
  const targets = expansionTargets(mine, (r) => arena.has(r) && !w.control.has(r) && !busy.has(r));
  if (targets.length) {
    try {
      expand(w, gid, targets[Math.floor(Math.random() * targets.length)]);
    } catch {
      /* sem recursos: tenta depois */
    }
  }
}
function standings(w: World) {
  const by = new Map([...w.nations.keys()].map((n) => [n, { nationId: n, regions: 0, area: 0 }]));
  let owned = 0;
  for (const [r, o] of w.control) {
    if (!w.view.arena!.includes(r)) continue;
    owned++;
    const s = by.get(o)!;
    s.regions++;
    s.area += REGION_BY_ID[r].area;
  }
  return { list: [...by.values()], neutral: w.view.arena!.length - owned };
}
function finish(w: World, reason: WorldView['outcome'], loser: number | null = null) {
  if (w.view.finishedAt) return;
  let ranking = rank(standings(w).list);
  if (loser !== null) ranking = [...ranking.filter((s) => s.nationId !== loser), ...ranking.filter((s) => s.nationId === loser)];
  w.view = { ...w.view, finishedAt: Date.now(), outcome: reason, winner: ranking[0]?.nationId ?? null, results: ranking.map((s, i) => ({ ...s, rank: i + 1 })) };
  w.occupations = [];
  send(w.view.id, { type: 'play.match', world: w.view });
}
function checkMatch(w: World) {
  const s = standings(w);
  const human = [...w.nations.keys()].find((id) => !w.bots.has(id)) ?? null;
  const out = matchOutcome({ arenaSize: w.view.arena!.length, standings: s.list, human });
  if (out.over) finish(w, out.reason, out.loser);
}

// ---------- comandos ----------

function blockedColors(w: World, pointId: string): string[] {
  const point = START_POINT_BY_ID[pointId];
  if (!point) return [];
  return [...new Set([...w.nations.values()].filter((n) => distanceKm(point.at, START_POINT_BY_ID[n.capital].at) < COLOR_EXCLUSION_KM).map((n) => n.color))];
}
function createNation(w: World, gid: number, point: StartPoint, name: string, color: string, flag: NationView['flag'], image?: { bytes: Buffer; type: string }, bot = false) {
  if (w.nations.has(gid)) throw new Fail(409, 'nation_exists', 'Você já fundou sua nação neste mundo.');
  if (w.view.arena && !w.view.arena.includes(point.region)) throw new Fail(409, 'outside_arena', 'Este ponto fica fora da área da partida.');
  if (w.control.has(point.region)) throw new Fail(409, 'region_taken', 'Esta região já pertence a outra nação. Escolha outro ponto.');
  if ([...w.nations.values()].some((n) => n.name.toLowerCase() === name.toLowerCase())) throw new Fail(409, 'name_taken', 'Já existe uma nação com este nome neste mundo.');
  if (blockedColors(w, point.id).includes(color)) throw new Fail(409, 'color_taken', 'Uma nação vizinha já usa esta cor. Escolha outra para que as fronteiras fiquem legíveis.');
  const nation: NationView = { id: gid, name, color, flag, flagImage: image ? 1 : null, capital: point.id, foundedAt: Date.now(), bot, alliance: null, power: 0, troops: 0 };
  w.nations.set(gid, { ...nation, image });
  w.control.set(point.region, gid);
  w.wallet.set(gid, { amounts: { ...ECONOMY.starting }, settledAt: Date.now() });
  w.army.set(gid, { recruits: MILITARY.recruitsStarting, settledAt: Date.now(), units: {}, research: {}, training: [], researching: null });
  if (bot) w.bots.add(gid);
  return nation;
}
function expand(w: World, gid: number, region: string) {
  const target = REGION_BY_ID[region];
  if (!target) throw new Fail(404, 'not_found', 'Região desconhecida.');
  if (w.view.finishedAt) throw new Fail(409, 'match_over', 'Esta partida já terminou.');
  if (w.view.arena && !w.view.arena.includes(region)) throw new Fail(409, 'outside_arena', 'Esta região fica fora da área da partida.');
  if (w.occupations.some((o) => o.nationId === gid)) throw new Fail(409, 'occupation_busy', 'Sua nação já está ocupando uma região. Aguarde a conclusão.');
  if (w.control.has(region)) throw new Fail(409, 'region_taken', 'Esta região pertence a outra nação. Para tomá-la, ataque.');
  if (w.occupations.some((o) => o.region === region)) throw new Fail(409, 'region_contested', 'Outra nação já está ocupando esta região.');
  const owned = [...w.control].filter(([, o]) => o === gid).map(([r]) => r);
  const from = borderingRegion(owned, region);
  if (!from) throw new Fail(409, 'not_adjacent', 'Só é possível ocupar regiões que fazem fronteira terrestre com o seu território.');
  spend(w, gid, expansionCost(owned.length), 'ocupar esta região');
  const seconds = expansionSeconds(target.area, owned.length, w.view.mode);
  const now = Date.now();
  const occupation: OccupationView = { id: id(), nationId: gid, region, from, startedAt: now, endsAt: now + (seconds * 1000) / SPEED };
  w.occupations.push(occupation);
  send(w.view.id, { type: 'play.occupation', occupation });
  announceEconomy(w, gid);
  return { occupation, seconds };
}
function build(w: World, gid: number, at: [number, number], type: StructureType, hint?: string) {
  if (!STRUCTURE_TYPES.includes(type)) throw new Fail(400, 'invalid_type', 'Construção desconhecida.');
  if (w.view.finishedAt) throw new Fail(409, 'match_over', 'Esta partida já terminou.');
  const owned = [...w.control].filter(([, o]) => o === gid).map(([r]) => r);
  const region = regionAt(at[0], at[1], hint ? [hint, ...owned] : owned);
  if (!region || w.control.get(region) !== gid) throw new Fail(409, 'not_owner', 'Construa dentro do seu território.');
  const all = [...w.structures.values()];
  if (all.some((s) => distanceKm(s.at, at) < ECONOMY.minDistanceKm)) throw new Fail(409, 'too_close', `Muito perto de outra construção. Deixe pelo menos ${ECONOMY.minDistanceKm} km.`);
  const mine = all.filter((s) => s.nationId === gid);
  const problem = buildProblem(type, {
    region,
    coast: REGION_BY_ID[region].coast,
    capitalRegion: START_POINT_BY_ID[w.nations.get(gid)!.capital].region,
    inRegion: all.filter((s) => s.region === region).length,
    queue: mine.filter((s) => s.building).length,
  });
  if (problem) throw new Fail(409, 'cannot_build', problem);
  spend(w, gid, structureCost(type, 0, mine.filter((s) => s.type === type).length), 'esta construção');
  const now = Date.now();
  const s: StructureView = { id: id(), nationId: gid, region, type, at, level: 0, building: { to: 1, startedAt: now, endsAt: now + (structureSeconds(type, 0, w.view.mode) * 1000) / SPEED } };
  w.structures.set(s.id, s);
  send(w.view.id, { type: 'play.structure', structure: s, completed: false });
  announceEconomy(w, gid);
  return s;
}
function upgrade(w: World, gid: number, sid: number) {
  const s = w.structures.get(sid);
  if (!s || s.nationId !== gid) throw new Fail(404, 'not_found', 'Construção não encontrada.');
  if (w.view.finishedAt) throw new Fail(409, 'match_over', 'Esta partida já terminou.');
  if (s.building) throw new Fail(409, 'cannot_build', 'Esta construção já está em obra.');
  if (s.level >= ECONOMY.maxLevel) throw new Fail(409, 'cannot_build', `Nível máximo (${ECONOMY.maxLevel}) alcançado.`);
  if ([...w.structures.values()].filter((x) => x.nationId === gid && x.building).length >= ECONOMY.buildQueue) {
    throw new Fail(409, 'cannot_build', `Já há ${ECONOMY.buildQueue} obras em andamento. Aguarde uma terminar.`);
  }
  spend(w, gid, structureCost(s.type, s.level), 'esta melhoria');
  const now = Date.now();
  const up: StructureView = { ...s, building: { to: s.level + 1, startedAt: now, endsAt: now + (structureSeconds(s.type, s.level, w.view.mode) * 1000) / SPEED } };
  w.structures.set(sid, up);
  send(w.view.id, { type: 'play.structure', structure: up, completed: false });
  announceEconomy(w, gid);
  return up;
}

/**
 * CENÁRIO DE TESTE (MOCK_WAR=1), só no servidor falso: ao fundar, cria uma nação rival vizinha com
 * uma região de fronteira e dá ao jogador tropas, um silo pronto e mísseis, para o passeio visual
 * da Fase E não precisar de horas de jogo. Não existe no servidor real.
 */
function seedWar(w: World, gid: number, point: StartPoint) {
  if ([...w.nations.values()].some((n) => n.name === 'Rival (teste)')) return;
  const capital = point.region;
  const front = REGION_BY_ID[capital].neighbors.find((n) => !w.control.has(n))!;
  const rivalCap = START_POINTS.find((p) => !w.control.has(p.region) && p.region !== front && REGION_BY_ID[p.region].neighbors.includes(front));
  if (!rivalCap) return;
  const rival = id();
  createNation(w, rival, rivalCap, 'Rival (teste)', '#2fd6a8', FLAG_PRESETS[3 % FLAG_PRESETS.length].flag, undefined, false);
  w.control.set(front, rival);
  w.army.get(rival)!.units = { infantry: 40 };
  w.army.get(gid)!.units = { infantry: 300, armor: 10 };
  const at = freePointIn(capital, [...w.structures.values()].map((x) => x.at), 40)!;
  w.structures.set(nextId, { id: nextId, nationId: gid, region: capital, type: 'missile_silo', at, level: 1, building: null });
  nextId++;
  // Longe do centro da região, para o toque no centro abrir o cartão da região e não o da construção.
  const fat = freePointIn(front, [REGION_BY_ID[front].at], 150) ?? REGION_BY_ID[front].at;
  w.structures.set(nextId, { id: nextId, nationId: rival, region: front, type: 'city', at: fat, level: 2, building: null });
  nextId++;
  refreshPower(w, gid);
  refreshPower(w, rival);
  send(w.view.id, { type: 'play.nation', nation: w.nations.get(rival), region: rivalCap.region });
}

const snapshot = (w: World, gid: number | null) => ({
  serverTime: Date.now(),
  world: w.view,
  me: gid !== null && w.nations.has(gid) ? gid : null,
  nations: [...w.nations.values()].map(({ image: _image, ...n }) => n),
  control: [...w.control],
  occupations: w.occupations,
  structures: [...w.structures.values()],
  economy: gid !== null ? economyView(w, gid) : null,
  military: gid !== null ? militaryView(w, gid) : null,
  operations: [...w.ops.keys()].filter((id) => w.ops.get(id)!.view.status === 'active').map((id) => opView(w, id, gid)),
  strikes: [...w.strikes.values()].filter((x) => x.status === 'flying'),
});

const seatsOf = (s: Session) =>
  [...s.seats].map(([wid, gid]) => ({ id: wid, name: worlds.get(wid)!.view.name, mode: worlds.get(wid)!.view.mode, governorId: gid, finished: !!worlds.get(wid)!.view.finishedAt, endsAt: worlds.get(wid)!.view.endsAt }));

function route(method: string, url: URL, body: any, s: Session | null, worldHeader: number | null, setCookie: (v: string) => void): unknown {
  const p = url.pathname.replace(/^\/api/, '');
  if (p === '/meta') return { modes: MODES_AVAILABLE, serverTime: Date.now(), worlds: [{ id: 1, name: worlds.get(1)!.view.name, status: 'open', mode: 'campaign', population: 0, capacity: 500 }] };
  if (p === '/auth/register' || p === '/auth/login') {
    const token = `t${id()}`;
    sessions.set(token, { userId: id(), username: String(body.username), seats: new Map() });
    setCookie(`ku_session=${token}; Path=/; HttpOnly`);
    return { ok: true };
  }
  if (p === '/auth/logout') {
    setCookie('ku_session=; Path=/; Max-Age=0');
    return { ok: true };
  }
  if (!s) throw new Fail(401, 'unauthenticated', 'Faça login para continuar.');
  const wid = worldHeader !== null && s.seats.has(worldHeader) ? worldHeader : 1;
  const gid = s.seats.get(wid) ?? null;
  if (p === '/me') return { userId: s.userId, username: s.username, governor: gid ? { id: gid, kingdomId: wid } : null, worlds: seatsOf(s), serverTime: Date.now() };
  if (p === '/governor') {
    s.seats.set(1, id());
    return { governorId: s.seats.get(1) };
  }
  if (p === '/quick/start') {
    const open = [...s.seats.keys()].find((k) => worlds.get(k)!.view.mode === 'quick' && !worlds.get(k)!.view.finishedAt);
    if (open) return { worldId: open, created: false };
    const seed = Math.floor(Math.random() * 1000);
    const theater = THEATERS[Number(process.env.MOCK_THEATER ?? seed) % THEATERS.length];
    const arena = buildArena(theater.id);
    const qid = 1000 + id();
    const w = newWorld(qid, `Partida rápida · ${theater.name}`, 'quick', arena);
    worlds.set(qid, w);
    s.seats.set(qid, id());
    const points = pickBotPoints(arena, QUICK.bots, seed);
    botIdentities(QUICK.bots, seed).forEach((look, i) => createNation(w, id(), points[i], look.name, look.color, look.flag, undefined, true));
    return { worldId: qid, created: true };
  }
  if (gid === null) throw new Fail(409, 'no_governor', 'Você ainda não entrou neste mundo.');
  const w = worlds.get(wid)!;
  if (p === '/quick/leave') return (finish(w, 'abandoned', gid), { ok: true });
  if (p === '/play/state') return snapshot(w, gid);
  if (p === '/play/colors') return { blocked: blockedColors(w, url.searchParams.get('pointId') ?? '') };
  if (p === '/play/found' && method === 'POST') {
    const point = START_POINT_BY_ID[body.pointId];
    if (!point) throw new Fail(404, 'not_found', 'Ponto de partida desconhecido.');
    const name = cleanNationName(String(body.name ?? ''));
    const problem = nationNameProblem(name);
    if (problem) throw new Fail(400, 'invalid_name', problem);
    const flag = parseFlag(body.flag);
    if (!flag) throw new Fail(400, 'invalid_flag', 'Bandeira inválida.');
    if (!NATION_COLOR_BY_HEX[body.color]) throw new Fail(400, 'invalid_color', 'Cor fora da paleta.');
    let image: { bytes: Buffer; type: string } | undefined;
    if (body.flagImage) {
      const bytes = Buffer.from(String(body.flagImage), 'base64');
      const check = inspectFlagImage(bytes);
      if (!check.ok) throw new Fail(400, 'invalid_flag_image', check.reason);
      image = { bytes, type: check.type };
    }
    const nation = createNation(w, gid, point, name, body.color, flag, image);
    if (process.env.MOCK_WAR === '1' && w.view.mode === 'campaign') seedWar(w, gid, point);
    if (w.view.mode === 'quick' && !w.view.startedAt) w.view = { ...w.view, startedAt: Date.now() };
    send(w.view.id, { type: 'play.nation', nation, region: point.region });
    send(w.view.id, { type: 'play.match', world: w.view });
    return snapshot(w, gid);
  }
  if (p === '/play/expand' && method === 'POST') return expand(w, gid, body.region);
  if (p === '/play/build' && method === 'POST') return { structure: build(w, gid, body.at, body.type, body.region) };
  if (p === '/play/launch' && method === 'POST') return { strike: launchMissile(w, gid, Number(body.siloId), String(body.region), body.weapon === 'bomb' ? 'bomb' : 'missile') };
  if (p === '/play/reinforce' && method === 'POST') throw new Fail(409, 'not_defender', 'Reforço não simulado no servidor falso.');
  if (p === '/play/attack' && method === 'POST') return { operation: attackRegion(w, gid, String(body.region), Number(body.percent)) };
  if (p === '/play/train' && method === 'POST') return { military: train(w, gid, body.unit, Number(body.amount)) };
  if (p === '/play/research' && method === 'POST') return { military: startResearch(w, gid, body.tech) };
  if (p === '/play/upgrade' && method === 'POST') return { structure: upgrade(w, gid, Number(body.structureId)) };
  throw new Fail(404, 'not_found', 'Rota inexistente.');
}

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const sessionOf = (req: http.IncomingMessage) => sessions.get(/ku_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? '') ?? null;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (!url.pathname.startsWith('/api')) {
    let file = path.join(STATIC, url.pathname);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(STATIC, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  const flag = /^\/api\/play\/flag\/(\d+)/.exec(url.pathname);
  if (flag) {
    const image = [...worlds.values()].map((w) => w.nations.get(Number(flag[1]))?.image).find(Boolean);
    res.writeHead(image ? 200 : 404, { 'Content-Type': image?.type ?? 'text/plain' });
    res.end(image?.bytes);
    return;
  }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    try {
      const wh = Number(req.headers['x-ku-world']);
      const out = route(req.method ?? 'GET', url, raw ? JSON.parse(raw) : {}, sessionOf(req), Number.isInteger(wh) && wh > 0 ? wh : null, (v) => res.setHeader('Set-Cookie', v));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      const f = e instanceof Fail ? e : new Fail(500, 'internal', String(e));
      res.writeHead(f.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: f.code, message: f.message }));
    }
  });
});
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const s = sessionOf(req);
  if (!s) return ws.close();
  const wq = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('world'));
  const wid = s.seats.has(wq) ? wq : 1;
  sockets.set(ws, { world: wid, gov: s.seats.get(wid) ?? null });
  ws.on('close', () => sockets.delete(ws));
  ws.send(JSON.stringify({ type: 'hello', serverTime: Date.now() }));
});
server.listen(PORT, '127.0.0.1', () => console.log(`servidor falso de teste em http://127.0.0.1:${PORT}`));
