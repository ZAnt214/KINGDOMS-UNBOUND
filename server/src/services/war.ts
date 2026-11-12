import { type Army, UNIT_TYPES } from '../../../shared/play/military.js';
import type { GameMode } from '../../../shared/play/rules.js';
import type { OperationView, StrikeView, StructureView } from '../../../shared/play/types.js';
import {
  attackOrigin,
  attackPower,
  type BattleEvent,
  type BattleSetup,
  battleSeconds,
  defenseMultiplier,
  contributions,
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
  splitSurvivors,
  survivors,
  troops,
  WAR,
  WAR_RULES_VERSION,
  type Weapon,
  WEAPON_TYPES,
  WEAPONS,
  sumArmies,
} from '../../../shared/play/war.js';
import { distanceKm, REGION_BY_ID, START_POINT_BY_ID } from '../../../shared/world/regions.js';
import type { GovernorCtx } from '../auth.js';
import { type Db, type Tx, tx } from '../db.js';
import { bad, conflict, HttpError, notFound } from '../http.js';
import type { Hub } from '../hub.js';
import type { EconomyService } from './economy.js';
import { structureView } from './economy.js';
import type { MilitaryService } from './military.js';

type Queryable = Pick<Db, 'query'> | Pick<Tx, 'query'>;

/** Tempo entre o lançamento e o início do voo: preparação e abertura do silo (animadas na tela). */
const PREP_MS = 2200;

const OP_COLUMNS = 'id, kingdom_id, attacker_id, defender_id, region_id, from_region, naval, started_at, ends_at, setup, events, status, result, allies';

function setupOf(r: any): BattleSetup {
  return { ...r.setup, startedAt: new Date(r.started_at).getTime(), events: r.events as BattleEvent[] };
}

/** Visão pública de uma operação no instante `now`; `viewer` recebe as próprias tropas. */
export function operationView(r: any, now: number, viewer: number | null = null): OperationView {
  const setup = setupOf(r);
  const attackerId = Number(r.attacker_id);
  const defenderId = Number(r.defender_id);
  const at = r.status === 'active' ? Math.min(now, new Date(r.ends_at).getTime()) : new Date(r.ends_at).getTime();
  const sim = simulate(setup, at);
  const view: OperationView = {
    id: Number(r.id),
    attackerId,
    defenderId,
    region: r.region_id,
    from: r.from_region,
    naval: r.naval,
    startedAt: setup.startedAt,
    endsAt: new Date(r.ends_at).getTime(),
    progress: { at, value: r.status === 'won' ? 1 : sim.progress, rate: r.status === 'active' ? sim.rate : 0 },
    attackerTroops: estimate(troops(survivors(sim.attacker))),
    defenderTroops: estimate(troops(survivors(sim.defender))),
    status: r.status,
    allies: [],
  };
  if (r.result) view.result = { attackerLosses: r.result.attackerLosses, defenderLosses: r.result.defenderLosses };
  const op = { attackerId, defenderId, setup, events: setup.events };
  const sides = { attacker: contributions(op, 'attacker'), defender: contributions(op, 'defender') };
  for (const side of ['attacker', 'defender'] as const) {
    for (const id of sides[side].keys()) if (id !== attackerId && id !== defenderId) view.allies.push({ id, side });
  }
  if (viewer !== null) {
    const side = sides.attacker.has(viewer) ? 'attacker' : sides.defender.has(viewer) ? 'defender' : null;
    if (side) {
      const alive = survivors(side === 'attacker' ? sim.attacker : sim.defender);
      view.mine = { side, sent: sides[side].get(viewer)!, remaining: splitSurvivors(sides[side], alive).get(viewer) ?? {} };
    }
  }
  return view;
}

export function strikeView(r: any, _now: number): StrikeView {
  const interceptAt = new Date(r.intercept_at).getTime();
  return {
    id: Number(r.id),
    attackerId: Number(r.attacker_id),
    defenderId: Number(r.defender_id),
    from: [r.from_lon, r.from_lat],
    region: r.region_id,
    to: REGION_BY_ID[r.region_id]?.at ?? [0, 0],
    launchedAt: new Date(r.launched_at).getTime(),
    flightAt: new Date(r.flight_at).getTime(),
    interceptAt,
    impactAt: new Date(r.impact_at).getTime(),
    // Decidido no lançamento e público desde então: a tela anima o interceptador a tempo.
    intercepted: r.intercepted,
    status: r.status,
    weapon: (r.weapon ?? 'missile') as Weapon,
    result: r.result ?? undefined,
  };
}

/**
 * Guerra autoritativa (Fase E). Operações e mísseis concluem pelo relógio do banco, como as obras:
 * worker a cada 1 s, na leitura do estado e antes de cada pedido. As tropas saem do exército ao
 * partir e os sobreviventes voltam ao fim; a manutenção das tropas enviadas segue até o fim.
 */
export class WarService {
  /** Chamado quando uma região muda de dono (decide partidas rápidas). */
  onRegion: ((kingdomId: number) => Promise<void>) | null = null;

  constructor(
    private db: Db,
    private hub: Hub,
    private economy: EconomyService,
    private military: MilitaryService,
  ) {}

  async operations(kingdomId: number, viewer: number | null, q: Queryable = this.db): Promise<OperationView[]> {
    const { rows } = await q.query(`SELECT ${OP_COLUMNS} FROM operations WHERE kingdom_id = $1 AND status = 'active' ORDER BY id`, [kingdomId]);
    const now = Date.now();
    return rows.map((r) => operationView(r, now, viewer));
  }

  async strikes(kingdomId: number, q: Queryable = this.db): Promise<StrikeView[]> {
    const { rows } = await q.query(`SELECT * FROM strikes WHERE kingdom_id = $1 AND status = 'flying' ORDER BY id`, [kingdomId]);
    const now = Date.now();
    return rows.map((r) => strikeView(r, now));
  }

  /** Avisa o mundo (visão pública) e os dois lados (com as próprias tropas). */
  private announceOperation(r: any) {
    const now = Date.now();
    const kingdomId = r.kingdom_id as number;
    this.hub.toKingdom(kingdomId, { type: 'play.operation', operation: operationView(r, now), serverTime: now });
    for (const id of [Number(r.attacker_id), Number(r.defender_id), ...((r.allies ?? []) as (string | number)[]).map(Number)]) {
      this.hub.toGovernor(id, { type: 'play.operation', operation: operationView(r, now, id), serverTime: now });
    }
  }

  private async open(client: Tx, kingdomId: number) {
    const { rows } = await client.query('SELECT finished_at, arena FROM kingdoms WHERE id = $1', [kingdomId]);
    if (rows[0]?.finished_at) throw conflict('match_over', 'Esta partida já terminou.');
    return rows[0] as { arena: string[] | null };
  }

  private async home(q: Queryable, governorId: number): Promise<Army> {
    const { rows } = await q.query('SELECT unit, amount FROM army WHERE governor_id = $1', [governorId]);
    return Object.fromEntries(rows.map((r) => [r.unit, r.amount]));
  }

  private async research(q: Queryable, governorId: number) {
    const { rows } = await q.query('SELECT tech, level FROM research WHERE governor_id = $1 AND level > 0', [governorId]);
    return Object.fromEntries(rows.map((r) => [r.tech, r.level]));
  }

  private async built(q: Queryable, governorId: number) {
    const { rows } = await q.query('SELECT type, level FROM structures WHERE governor_id = $1 AND level > 0', [governorId]);
    return rows.map((r) => ({ type: r.type, level: r.level }));
  }

  private async allied(q: Queryable, a: number, b: number): Promise<boolean> {
    const { rowCount } = await q.query(
      `SELECT 1 FROM alliance_members x JOIN alliance_members y ON y.alliance_id = x.alliance_id
         JOIN alliances al ON al.id = x.alliance_id AND al.status = 'active'
        WHERE x.governor_id = $1 AND y.governor_id = $2`,
      [a, b],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Quem rompeu uma aliança não ataca os antigos aliados por 30 minutos (Fase F). */
  private async blocked(q: Queryable, breaker: number, target: number) {
    const { rows } = await q.query(
      `SELECT max(until) AS until FROM alliance_breaks WHERE breaker_id = $1 AND former_id = $2 AND until > now()`,
      [breaker, target],
    );
    if (!rows[0]?.until) return;
    const min = Math.max(1, Math.ceil((new Date(rows[0].until).getTime() - Date.now()) / 60_000));
    throw conflict('pact_block', `Você rompeu a aliança com esta nação: ataques liberados em ${min} min.`);
  }

  private async take(client: Tx, governorId: number, army: Army) {
    for (const u of UNIT_TYPES) {
      const n = army[u] ?? 0;
      if (n > 0) await client.query('UPDATE army SET amount = amount - $3 WHERE governor_id = $1 AND unit = $2', [governorId, u, n]);
    }
  }

  private async give(client: Tx, governorId: number, army: Army) {
    for (const u of UNIT_TYPES) {
      const n = army[u] ?? 0;
      if (n > 0) {
        await client.query(
          `INSERT INTO army (governor_id, unit, amount) VALUES ($1, $2, $3) ON CONFLICT (governor_id, unit) DO UPDATE SET amount = army.amount + EXCLUDED.amount`,
          [governorId, u, n],
        );
      }
    }
  }

  private async modeOf(q: Queryable, kingdomId: number): Promise<GameMode> {
    const { rows } = await q.query('SELECT mode FROM kingdoms WHERE id = $1', [kingdomId]);
    return (rows[0]?.mode ?? 'campaign') as GameMode;
  }

  /** Concluir o que venceu antes de validar um pedido. */
  async settleWorld(kingdomId: number) {
    await this.economy.completeDue(kingdomId);
    await this.military.completeDue(kingdomId);
    await this.completeDue(kingdomId);
  }

  /** Ataque terrestre (ou naval) a uma região inimiga, com a porcentagem do exército escolhida. */
  async attack(g: GovernorCtx, regionId: string, percent: number): Promise<OperationView> {
    if (!REGION_BY_ID[regionId]) throw notFound('Região desconhecida.');
    if (!(WAR.percents as readonly number[]).includes(percent)) throw bad('invalid_percent', `Escolha ${WAR.percents.join(', ')}% das tropas. Menos de ${WAR.minPercent}% não é permitido.`);
    await this.settleWorld(g.kingdomId);
    let row: any;
    try {
      row = await tx(this.db, async (client) => {
        const world = await this.open(client, g.kingdomId);
        if (world.arena && !world.arena.includes(regionId)) throw conflict('outside_arena', 'Esta região fica fora da área da partida.');
        const owner = await client.query('SELECT governor_id FROM region_control WHERE kingdom_id = $1 AND region_id = $2', [g.kingdomId, regionId]);
        if (!owner.rowCount) throw conflict('not_enemy', 'Região sem dono: ocupe-a pela expansão.');
        const defenderId = Number(owner.rows[0].governor_id);
        if (defenderId === g.id) throw conflict('not_enemy', 'Esta região já é sua.');
        // Trava as duas nações em ordem de id (a mesma em toda transação).
        const both = await client.query('SELECT governor_id, capital_point FROM nations WHERE governor_id IN ($1, $2) ORDER BY governor_id FOR UPDATE', [g.id, defenderId]);
        if (!both.rows.some((r) => Number(r.governor_id) === g.id)) throw new HttpError(409, 'no_nation', 'Funde sua nação antes de atacar.');
        // A capital pode ser tomada (vence quem conquistar 100%), mas defende 50% mais.
        const defCapital = START_POINT_BY_ID[both.rows.find((r) => Number(r.governor_id) === defenderId)?.capital_point]?.region;
        const capitalBonus = defCapital === regionId ? WAR.capitalBonus : 1;
        if (await this.allied(client, g.id, defenderId)) throw conflict('allied', 'Não é possível atacar um aliado.');
        await this.blocked(client, g.id, defenderId);
        const busy = await client.query(`SELECT 1 FROM operations WHERE kingdom_id = $1 AND region_id = $2 AND status = 'active'`, [g.kingdomId, regionId]);
        if (busy.rowCount) throw conflict('region_contested', 'Já há uma operação militar nesta região.');
        const mine = await client.query(`SELECT COUNT(*)::int AS n FROM operations WHERE attacker_id = $1 AND status = 'active'`, [g.id]);
        if (mine.rows[0].n >= WAR.maxOperations) throw conflict('operations_busy', `Sua nação já conduz ${WAR.maxOperations} operações. Aguarde uma terminar.`);
        const owned = (await client.query('SELECT region_id FROM region_control WHERE kingdom_id = $1 AND governor_id = $2', [g.kingdomId, g.id])).rows.map((r) => r.region_id as string);
        const home = await this.home(client, g.id);
        const origin = attackOrigin(owned, regionId, (home.navy ?? 0) > 0);
        if (!origin) {
          throw conflict(
            'not_adjacent',
            REGION_BY_ID[regionId].coast
              ? `Sem fronteira terrestre. Por mar, é preciso ter navios e uma região litorânea sua a até ${WAR.seaRangeKm} km.`
              : 'Sem fronteira terrestre com o seu território.',
          );
        }
        const attackerResearch = await this.research(client, g.id);
        const sent = share(home, percent, origin.naval);
        if (attackPower(sent, attackerResearch, origin.naval) <= 0) throw conflict('no_troops', 'Não há tropas suficientes para esta porcentagem. Treine unidades no Exército.');
        const defHome = await this.home(client, defenderId);
        const defRegions = (await client.query('SELECT COUNT(*)::int AS n FROM region_control WHERE kingdom_id = $1 AND governor_id = $2', [g.kingdomId, defenderId])).rows[0].n;
        const defenders = garrison(defHome, defRegions);
        const [defenderResearch, defBuilt, mode] = await Promise.all([this.research(client, defenderId), this.built(client, defenderId), this.modeOf(client, g.kingdomId)]);
        const startedAt = Date.now();
        const setup: BattleSetup = {
          startedAt,
          base: battleSeconds(regionId, mode),
          naval: origin.naval,
          attacker: sent,
          attackerResearch,
          defender: defenders,
          defenderResearch,
          defenderMultiplier: defenseMultiplier(defenderResearch, defBuilt) * capitalBonus,
          events: [],
        };
        await this.take(client, g.id, sent);
        await this.take(client, defenderId, defenders);
        const { startedAt: _s, events: _e, ...stored } = setup;
        const { rows } = await client.query(
          `INSERT INTO operations (kingdom_id, attacker_id, defender_id, region_id, from_region, naval, started_at, ends_at, setup, rules_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${OP_COLUMNS}`,
          [g.kingdomId, g.id, defenderId, regionId, origin.from, origin.naval, new Date(startedAt), new Date(predictEnd(setup)), JSON.stringify(stored), WAR_RULES_VERSION],
        );
        return rows[0];
      });
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23505' && e.constraint === 'operations_one_per_region') throw conflict('region_contested', 'Já há uma operação militar nesta região.');
      throw err;
    }
    this.announceOperation(row);
    await this.military.announce(g.id);
    await this.military.announce(Number(row.defender_id));
    return operationView(row, Date.now(), g.id);
  }

  /**
   * Mais tropas para uma operação: o defensor reforça a própria região; aliados do defensor ajudam a
   * defender e aliados do atacante entram no ataque (Fase F). Sobreviventes voltam a quem mandou.
   */
  async reinforce(g: GovernorCtx, operationId: number, percent: number): Promise<OperationView> {
    if (!(WAR.percents as readonly number[]).includes(percent)) throw bad('invalid_percent', 'Porcentagem inválida.');
    await this.settleWorld(g.kingdomId);
    let side: 'attacker' | 'defender' = 'defender';
    let sentTroops = 0;
    const row = await tx(this.db, async (client) => {
      const { rows } = await client.query(`SELECT ${OP_COLUMNS} FROM operations WHERE id = $1 FOR UPDATE`, [operationId]);
      const r = rows[0];
      if (!r || r.kingdom_id !== g.kingdomId) throw notFound('Operação não encontrada.');
      if (r.status !== 'active') throw conflict('operation_over', 'Esta operação já terminou.');
      const attackerId = Number(r.attacker_id);
      const defenderId = Number(r.defender_id);
      let ally = false;
      if (g.id === defenderId) side = 'defender';
      else if (g.id === attackerId) throw conflict('not_defender', 'Quem ataca não reforça a própria operação: abra outra ou aguarde.');
      else if (await this.allied(client, g.id, defenderId)) {
        side = 'defender';
        ally = true;
      } else if (await this.allied(client, g.id, attackerId)) {
        side = 'attacker';
        ally = true;
      } else throw conflict('not_defender', 'Só o defensor e os aliados de um dos lados podem mandar tropas.');
      if (ally) {
        const nation = await client.query('SELECT 1 FROM nations WHERE governor_id = $1', [g.id]);
        if (!nation.rowCount) throw new HttpError(409, 'no_nation', 'Funde sua nação antes de mandar tropas.');
      }
      const naval = side === 'attacker' && r.naval;
      const sent = share(await this.home(client, g.id), percent, naval);
      if (!Object.keys(sent).length) throw conflict('no_troops', naval ? 'Ataque naval: só navios podem entrar. Não há navios em casa.' : 'Não há tropas em casa para enviar.');
      sentTroops = troops(sent);
      await this.economy.settleMany(client, [g.id], new Date());
      await this.take(client, g.id, sent);
      const event: BattleEvent = ally ? { at: Date.now(), kind: 'reinforce', army: sent, side, by: g.id } : { at: Date.now(), kind: 'reinforce', army: sent };
      const events = [...(r.events as BattleEvent[]), event];
      const ends = predictEnd({ ...setupOf(r), events });
      const up = await client.query(
        `UPDATE operations SET events = $2, ends_at = $3, allies = CASE WHEN $4::bigint IS NULL OR $4 = ANY(allies) THEN allies ELSE array_append(allies, $4::bigint) END
          WHERE id = $1 RETURNING ${OP_COLUMNS}`,
        [operationId, JSON.stringify(events), new Date(ends), ally ? g.id : null],
      );
      return { row: up.rows[0], ally };
    });
    this.announceOperation(row.row);
    await this.military.announce(g.id);
    if (row.ally) {
      await this.economy.announceEconomy(g.id);
      const news = { kind: 'help' as const, by: g.id, operationId, side, troops: estimate(sentTroops) };
      this.hub.toKingdom(g.kingdomId, { type: 'play.pact', news, serverTime: Date.now() });
    }
    return operationView(row.row, Date.now(), g.id);
  }

  /** Lança um míssil do silo contra uma região inimiga no alcance. */
  async launch(g: GovernorCtx, siloId: number, regionId: string, weapon: Weapon = 'missile'): Promise<StrikeView> {
    const target = REGION_BY_ID[regionId];
    if (!target) throw notFound('Região desconhecida.');
    if (!WEAPON_TYPES.includes(weapon)) throw bad('invalid_weapon', 'Arma desconhecida.');
    await this.settleWorld(g.kingdomId);
    let row: any;
    try {
      row = await tx(this.db, async (client) => {
        const world = await this.open(client, g.kingdomId);
        if (world.arena && !world.arena.includes(regionId)) throw conflict('outside_arena', 'Esta região fica fora da área da partida.');
        const nation = await client.query('SELECT 1 FROM nations WHERE governor_id = $1 FOR UPDATE', [g.id]);
        if (!nation.rowCount) throw new HttpError(409, 'no_nation', 'Funde sua nação antes de lançar mísseis.');
        const silo = (await client.query('SELECT id, governor_id, type, level, region_id, lon, lat FROM structures WHERE id = $1', [siloId])).rows[0];
        if (!silo || Number(silo.governor_id) !== g.id || silo.type !== 'missile_silo') throw notFound('Silo não encontrado.');
        if (silo.level < 1) throw conflict('silo_not_ready', 'O silo ainda está em obra.');
        const owner = await client.query('SELECT governor_id FROM region_control WHERE kingdom_id = $1 AND region_id = $2', [g.kingdomId, regionId]);
        if (!owner.rowCount || Number(owner.rows[0].governor_id) === g.id) throw conflict('not_enemy', 'Escolha uma região de outra nação.');
        const defenderId = Number(owner.rows[0].governor_id);
        if (await this.allied(client, g.id, defenderId)) throw conflict('allied', 'Não é possível atacar um aliado.');
        await this.blocked(client, g.id, defenderId);
        const from: [number, number] = silo.lon === null ? REGION_BY_ID[silo.region_id].at : [silo.lon, silo.lat];
        const km = distanceKm(from, target.at);
        const range = missileRange(silo.level, weapon);
        if (km > range) throw conflict('out_of_range', `Fora do alcance da ${WEAPONS[weapon].name.toLowerCase()}: ${Math.round(km).toLocaleString('pt-BR')} km (alcance de ${range.toLocaleString('pt-BR')} km).`);
        // Silo pronto lança direto: só o custo do lançamento.
        await this.economy.spend(client, g.id, WEAPONS[weapon].cost, 'o lançamento');
        const [defBuilt, defResearch, mode] = await Promise.all([this.built(client, defenderId), this.research(client, defenderId), this.modeOf(client, g.kingdomId)]);
        const chance = interceptChance(defBuilt, defResearch);
        const now = Date.now();
        const flight = missileSeconds(km, mode, weapon) * 1000;
        const flightAt = now + PREP_MS;
        const ins = await client.query(
          `INSERT INTO strikes (kingdom_id, attacker_id, defender_id, silo_id, from_lon, from_lat, region_id, launched_at, flight_at, intercept_at, impact_at, chance, intercepted, rules_version, weapon)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, $13, $14) RETURNING id`,
          [g.kingdomId, g.id, defenderId, siloId, from[0], from[1], regionId, new Date(now), new Date(flightAt), new Date(flightAt + flight * WAR.missile.interceptAt), new Date(flightAt + flight), chance, WAR_RULES_VERSION, weapon],
        );
        const id = Number(ins.rows[0].id);
        const { rows } = await client.query('UPDATE strikes SET intercepted = $2 WHERE id = $1 RETURNING *', [id, interceptRoll(id) < chance]);
        return rows[0];
      });
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23505' && e.constraint === 'strikes_one_per_silo') throw conflict('silo_busy', 'Este silo já tem um míssil em voo.');
      throw err;
    }
    const view = strikeView(row, Date.now());
    this.hub.toKingdom(g.kingdomId, { type: 'play.strike', strike: view, serverTime: Date.now() });
    await this.economy.announceEconomy(g.id);
    await this.military.announce(g.id);
    return view;
  }

  /** Conclui operações e mísseis vencidos, um por transação (SKIP LOCKED evita conclusão em dobro). */
  async completeDue(kingdomId: number | null = null, limit = 100): Promise<number> {
    const due = await this.db.query(
      `SELECT 'op' AS kind, id, ends_at AS at FROM operations WHERE status = 'active' AND ends_at <= now() AND ($1::int IS NULL OR kingdom_id = $1)
       UNION ALL
       SELECT 'strike', id, impact_at FROM strikes WHERE status = 'flying' AND impact_at <= now() AND ($1::int IS NULL OR kingdom_id = $1)
       ORDER BY at, id LIMIT $2`,
      [kingdomId, limit],
    );
    let n = 0;
    for (const d of due.rows) {
      const ok = d.kind === 'op' ? await this.finishOperation(Number(d.id)) : await this.impact(Number(d.id));
      if (ok) n++;
    }
    return n;
  }

  processDue() {
    return this.completeDue(null);
  }

  private async finishOperation(id: number): Promise<boolean> {
    const done = await tx(this.db, async (client) => {
      const { rows } = await client.query(`SELECT ${OP_COLUMNS} FROM operations WHERE id = $1 AND status = 'active' AND ends_at <= now() FOR UPDATE SKIP LOCKED`, [id]);
      const r = rows[0];
      if (!r) return null;
      const setup = setupOf(r);
      const end = new Date(r.ends_at).getTime();
      const sim = simulate(setup, end + 1000);
      const status = sim.status === 'won' ? 'won' : 'failed';
      const attackerId = Number(r.attacker_id);
      const defenderId = Number(r.defender_id);
      const op = { attackerId, defenderId, setup, events: setup.events };
      const sides = { attacker: contributions(op, 'attacker'), defender: contributions(op, 'defender') };
      const everyone = [...new Set([...sides.attacker.keys(), ...sides.defender.keys()])];
      // Saldo de todos os envolvidos acertado até o fim com a manutenção de antes das baixas.
      await this.economy.settleMany(client, everyone, new Date(end));
      const attSent = sumArmies(...sides.attacker.values());
      const defSent = sumArmies(...sides.defender.values());
      const attBack = survivors(sim.attacker);
      const defBack = survivors(sim.defender);
      // Sobreviventes voltam a quem mandou, na proporção do que cada um mandou.
      for (const [id, army] of splitSurvivors(sides.attacker, attBack)) await this.give(client, id, army);
      for (const [id, army] of splitSurvivors(sides.defender, defBack)) await this.give(client, id, army);
      let transferred: StructureView[] = [];
      if (status === 'won') {
        await client.query('UPDATE region_control SET governor_id = $3, since = $4 WHERE kingdom_id = $1 AND region_id = $2', [r.kingdom_id, r.region_id, attackerId, new Date(end)]);
        const moved = await client.query(
          `UPDATE structures SET governor_id = $3 WHERE kingdom_id = $1 AND region_id = $2 AND governor_id = $4
           RETURNING id, governor_id, region_id, type, level, target_level, started_at, ends_at, lon, lat`,
          [r.kingdom_id, r.region_id, attackerId, defenderId],
        );
        transferred = moved.rows.map(structureView);
      }
      const result = { attackerLosses: troops(losses(attSent, attBack)), defenderLosses: troops(losses(defSent, defBack)) };
      const up = await client.query(`UPDATE operations SET status = $2, finished_at = $3, result = $4 WHERE id = $1 RETURNING ${OP_COLUMNS}`, [id, status, new Date(end), JSON.stringify(result)]);
      return { row: up.rows[0], status, end, attackerId, defenderId, transferred, everyone };
    });
    if (!done) return false;
    const { row, attackerId } = done;
    const kingdomId = row.kingdom_id as number;
    this.announceOperation(row);
    if (done.status === 'won') {
      this.hub.toKingdom(kingdomId, { type: 'play.region', region: row.region_id, nationId: attackerId, occupationId: -row.id, at: done.end, serverTime: Date.now() });
      if (done.transferred.length) this.hub.toKingdom(kingdomId, { type: 'play.transfer', structures: done.transferred, serverTime: Date.now() });
    }
    for (const id of done.everyone) {
      await this.military.refreshPower(id);
      await this.economy.announceEconomy(id);
      await this.military.announce(id);
    }
    if (done.status === 'won') await this.onRegion?.(kingdomId);
    return true;
  }

  private async impact(id: number): Promise<boolean> {
    const done = await tx(this.db, async (client) => {
      const { rows } = await client.query(`SELECT * FROM strikes WHERE id = $1 AND status = 'flying' AND impact_at <= now() FOR UPDATE SKIP LOCKED`, [id]);
      const s = rows[0];
      if (!s) return null;
      if (s.intercepted) {
        const up = await client.query(`UPDATE strikes SET status = 'intercepted' WHERE id = $1 RETURNING *`, [id]);
        return { row: up.rows[0], damaged: null as StructureView | null, removed: null as number | null, ops: [] as any[] };
      }
      const defenderId = Number(s.defender_id);
      const at = new Date(s.impact_at);
      const w = WEAPONS[(s.weapon as Weapon) ?? 'missile'] ?? WEAPONS.missile;
      await this.economy.settle(client, defenderId, at);
      // Tropas em casa do alvo: 6% de cada tipo (míssil) ou 12% (bomba).
      const home = await this.home(client, defenderId);
      let lost = 0;
      for (const u of UNIT_TYPES) {
        const k = Math.floor((home[u] ?? 0) * w.homeLoss);
        if (k > 0) {
          lost += k;
          await client.query('UPDATE army SET amount = amount - $3 WHERE governor_id = $1 AND unit = $2', [defenderId, u, k]);
        }
      }
      // A maior construção concluída da região perde um nível (no nível 1, é destruída).
      const target = (
        await client.query(
          `SELECT id, governor_id, region_id, type, level, target_level, started_at, ends_at, lon, lat FROM structures
            WHERE kingdom_id = $1 AND region_id = $2 AND governor_id = $3 AND level > 0 AND target_level IS NULL
            ORDER BY level DESC, id LIMIT 1 FOR UPDATE`,
          [s.kingdom_id, s.region_id, defenderId],
        )
      ).rows[0];
      let damaged: StructureView | null = null;
      let removed: number | null = null;
      let structure: { type: any; from: number; to: number } | null = null;
      if (target) {
        const to = Math.max(0, target.level - w.levels);
        structure = { type: target.type, from: target.level, to };
        if (to === 0) {
          await client.query('DELETE FROM structures WHERE id = $1', [target.id]);
          removed = Number(target.id);
        } else {
          const up = await client.query(
            'UPDATE structures SET level = $2 WHERE id = $1 RETURNING id, governor_id, region_id, type, level, target_level, started_at, ends_at, lon, lat',
            [target.id, to],
          );
          damaged = structureView(up.rows[0]);
        }
      }
      // Tropas engajadas: as do alvo defendendo esta região e as que partiram dela para atacar.
      const ops = await client.query(
        `SELECT ${OP_COLUMNS} FROM operations WHERE kingdom_id = $1 AND status = 'active'
            AND ((region_id = $2 AND defender_id = $3) OR (from_region = $2 AND attacker_id = $3)) FOR UPDATE`,
        [s.kingdom_id, s.region_id, defenderId],
      );
      const touched: any[] = [];
      for (const o of ops.rows) {
        const side = Number(o.defender_id) === defenderId && o.region_id === s.region_id ? 'defender' : 'attacker';
        const events = [...(o.events as BattleEvent[]), { at: at.getTime(), kind: 'strike', side, fraction: w.engagedLoss } as BattleEvent];
        const ends = predictEnd({ ...setupOf(o), events });
        const up = await client.query(`UPDATE operations SET events = $2, ends_at = $3 WHERE id = $1 RETURNING ${OP_COLUMNS}`, [o.id, JSON.stringify(events), new Date(Math.max(ends, Date.now()))]);
        touched.push(up.rows[0]);
      }
      const result = { troopsLost: estimate(lost), structure, engaged: touched.length > 0 };
      const up = await client.query(`UPDATE strikes SET status = 'impact', result = $2 WHERE id = $1 RETURNING *`, [id, JSON.stringify(result)]);
      return { row: up.rows[0], damaged, removed, ops: touched };
    });
    if (!done) return false;
    const kingdomId = done.row.kingdom_id as number;
    this.hub.toKingdom(kingdomId, { type: 'play.strike', strike: strikeView(done.row, Date.now()), serverTime: Date.now() });
    if (done.damaged) this.hub.toKingdom(kingdomId, { type: 'play.structure', structure: done.damaged, completed: false, serverTime: Date.now() });
    if (done.removed !== null) this.hub.toKingdom(kingdomId, { type: 'play.structure.removed', structureId: done.removed, serverTime: Date.now() });
    for (const o of done.ops) this.announceOperation(o);
    if (done.row.status === 'impact') {
      const defenderId = Number(done.row.defender_id);
      await this.military.refreshPower(defenderId);
      await this.economy.announceEconomy(defenderId);
      await this.military.announce(defenderId);
    }
    return true;
  }
}
