import { buildProblem, computeEconomy, ECONOMY, missing, project, structureCost, type StructureType } from '../../../shared/play/economy.js';
import { botIdentities, buildArena, matchOutcome, type OutcomeReason, pickBotPoints, QUICK, rank, type Standing, THEATERS } from '../../../shared/play/match.js';
import { expansionTargets, REGION_BY_ID, START_POINT_BY_ID } from '../../../shared/world/regions.js';
import { freePointIn } from '../geo.js';
import type { GovernorCtx } from '../auth.js';
import { type Db, tx } from '../db.js';
import { conflict, HttpError } from '../http.js';
import type { Hub } from '../hub.js';
import { MILITARY, UNITS, unitProblem, type UnitType } from '../../../shared/play/military.js';
import type { MilitaryService } from './military.js';
import type { WarService } from './war.js';
import type { DiplomacyService } from './diplomacy.js';
import { attackPower, estimatedDefense, share, WAR } from '../../../shared/play/war.js';
import type { EconomyService } from './economy.js';
import type { NationService } from './nation.js';
import type { TerritoryService } from './territory.js';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Partida rápida: cria o mundo com arena e bots, conduz os bots e encerra a partida.
 * Os bots são nações comuns sem usuário: passam pelas mesmas regras e serviços que um jogador.
 */
/** Recusas de regra (falta de recurso, região ocupada) são normais para um bot; o resto vai para o log. */
const botFailed = (bot: number, step: string) => (err: unknown) => {
  if (err instanceof HttpError && err.status < 500) return;
  console.error(JSON.stringify({ level: 'error', msg: 'bot', bot, step, err: String(err) }));
};

export class MatchService {
  private nextThink = new Map<number, number>();
  /**
   * Passo dos bots em andamento, por mundo (null = todos), com o instante em que começou. Numa
   * função serverless, um passo pode ficar congelado no meio quando a resposta termina e nunca
   * concluir; por isso a trava vence sozinha depois de 20 s em vez de bloquear os bots para sempre.
   */
  private ticking = new Map<number | null, number>();

  constructor(
    private db: Db,
    private hub: Hub,
    private nations: NationService,
    private territory: TerritoryService,
    private economy: EconomyService,
  ) {}

  /** Exército dos bots (Fase D). Definido em app.ts. */
  military: MilitaryService | null = null;
  /** Guerra dos bots (Fase E). Definido em app.ts. */
  war: WarService | null = null;
  /** Diplomacia (Fase F): bots não atacam aliados e ajudam a defender. */
  diplomacy: DiplomacyService | null = null;

  /** Entra na partida rápida em andamento do usuário ou cria uma nova. */
  async start(userId: number): Promise<{ worldId: number; created: boolean }> {
    const current = await this.db.query(
      `SELECT k.id FROM governors g JOIN kingdoms k ON k.id = g.kingdom_id
        WHERE g.user_id = $1 AND k.mode = 'quick' AND k.finished_at IS NULL ORDER BY k.id DESC LIMIT 1`,
      [userId],
    );
    if (current.rows[0]) return { worldId: current.rows[0].id, created: false };
    const seed = Math.floor(Math.random() * 1_000_000);
    const theater = THEATERS[seed % THEATERS.length];
    const arena = buildArena(theater.id);
    const worldId = await tx(this.db, async (client) => {
      // Uma partida aberta por usuário, mesmo com dois cliques simultâneos.
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const again = await client.query(
        `SELECT k.id FROM governors g JOIN kingdoms k ON k.id = g.kingdom_id WHERE g.user_id = $1 AND k.mode = 'quick' AND k.finished_at IS NULL LIMIT 1`,
        [userId],
      );
      if (again.rows[0]) return again.rows[0].id as number;
      const { rows } = await client.query(
        `INSERT INTO kingdoms (name, seed, width, height, status, mode, theater, arena, owner_user_id)
         VALUES ($1, $2, 0, 0, 'open', 'quick', $3, $4, $5) RETURNING id`,
        [`Partida rápida · ${theater.name}`, seed, theater.id, JSON.stringify(arena), userId],
      );
      const id: number = rows[0].id;
      await client.query('INSERT INTO governors (user_id, kingdom_id, name) VALUES ($1, $2, $3)', [userId, id, `q${id}u${userId}`]);
      const points = pickBotPoints(arena, QUICK.bots, seed);
      const looks = botIdentities(QUICK.bots, seed);
      for (let i = 0; i < QUICK.bots; i++) {
        const bot = await client.query('INSERT INTO governors (user_id, kingdom_id, name, is_bot) VALUES (NULL, $1, $2, true) RETURNING id', [id, `q${id}b${i}`]);
        await this.nations.create(client, { governorId: Number(bot.rows[0].id), kingdomId: id, point: points[i], ...looks[i] });
      }
      return id;
    });
    return { worldId, created: true };
  }

  /** Abandonar encerra a partida na hora: quem saiu fica em último. */
  async leave(g: GovernorCtx) {
    if (g.mode !== 'quick') throw conflict('not_quick', 'Só partidas rápidas podem ser abandonadas.');
    await this.finish(g.kingdomId, 'abandoned', g.id);
  }

  private async standings(kingdomId: number, arena: string[]): Promise<{ standings: Standing[]; neutralLeft: number; active: number }> {
    const set = new Set(arena);
    const [nations, control, active] = await Promise.all([
      this.db.query('SELECT governor_id FROM nations WHERE kingdom_id = $1', [kingdomId]),
      this.db.query('SELECT region_id, governor_id FROM region_control WHERE kingdom_id = $1', [kingdomId]),
      this.db.query(`SELECT COUNT(*)::int AS n FROM occupations WHERE kingdom_id = $1 AND status = 'active'`, [kingdomId]),
    ]);
    const by = new Map<number, Standing>(nations.rows.map((r) => [Number(r.governor_id), { nationId: Number(r.governor_id), regions: 0, area: 0 }]));
    let owned = 0;
    for (const r of control.rows) {
      if (!set.has(r.region_id)) continue;
      owned++;
      const s = by.get(Number(r.governor_id));
      if (!s) continue;
      s.regions++;
      s.area += REGION_BY_ID[r.region_id]?.area ?? 0;
    }
    return { standings: [...by.values()], neutralLeft: arena.length - owned, active: active.rows[0].n };
  }

  /** Encerra a partida (uma vez só), grava a classificação e avisa o mundo. */
  async finish(kingdomId: number, reason: OutcomeReason, loser: number | null = null) {
    const k = await this.db.query(`SELECT arena FROM kingdoms WHERE id = $1 AND mode = 'quick'`, [kingdomId]);
    if (!k.rows[0]) return;
    const { standings } = await this.standings(kingdomId, k.rows[0].arena);
    let ranking = rank(standings);
    if (loser !== null) ranking = [...ranking.filter((s) => s.nationId !== loser), ...ranking.filter((s) => s.nationId === loser)];
    const winner = reason === 'expired' ? null : (ranking[0]?.nationId ?? null);
    const done = await tx(this.db, async (client) => {
      const lock = await client.query('SELECT finished_at FROM kingdoms WHERE id = $1 FOR UPDATE', [kingdomId]);
      if (lock.rows[0].finished_at) return false;
      for (const [i, s] of ranking.entries()) {
        await client.query('INSERT INTO match_results (kingdom_id, governor_id, rank, regions, area) VALUES ($1, $2, $3, $4, $5)', [kingdomId, s.nationId, i + 1, s.regions, Math.round(s.area)]);
      }
      // Ocupações em andamento não terminam mais: a partida acabou.
      await client.query(`UPDATE occupations SET status = 'failed', completed_at = now() WHERE kingdom_id = $1 AND status = 'active'`, [kingdomId]);
      await client.query(`UPDATE kingdoms SET finished_at = now(), status = 'closed', outcome = $2, winner_governor_id = $3 WHERE id = $1`, [kingdomId, reason, winner]);
      return true;
    });
    if (!done) return;
    this.hub.toKingdom(kingdomId, { type: 'play.match', world: await this.nations.world(kingdomId), serverTime: Date.now() });
  }

  /** Confere vitória, fim de tempo e prazo de fundação das partidas em andamento. */
  async check(kingdomId: number | null = null) {
    const { rows } = await this.db.query(
      `SELECT k.id, k.arena, k.started_at, k.created_at,
              (SELECT g.id FROM governors g WHERE g.kingdom_id = k.id AND NOT g.is_bot ORDER BY g.id LIMIT 1) AS human
         FROM kingdoms k WHERE k.mode = 'quick' AND k.finished_at IS NULL AND ($1::int IS NULL OR k.id = $1)`,
      [kingdomId],
    );
    for (const k of rows) {
      if (!k.started_at) {
        if (Date.now() - new Date(k.created_at).getTime() > QUICK.foundDeadlineMinutes * 60_000) await this.finish(k.id, 'expired');
        continue;
      }
      const s = await this.standings(k.id, k.arena);
      const out = matchOutcome({ arenaSize: k.arena.length, standings: s.standings, human: k.human === null ? null : Number(k.human) });
      if (out.over) await this.finish(k.id, out.reason, out.loser);
    }
  }

  /** Um passo dos bots de todas as partidas em andamento (chamado pelo worker). */
  async tick(kingdomId: number | null = null) {
    // Só o próprio passo bloqueia: o worker (null) congelado não pode travar o passo pedido pela leitura.
    const since = this.ticking.get(kingdomId);
    if (since !== undefined && Date.now() - since < 20_000) return;
    this.ticking.set(kingdomId, Date.now());
    try {
      const { rows } = await this.db.query(
        `SELECT g.id, g.name, g.kingdom_id, k.arena, k.started_at FROM governors g
           JOIN kingdoms k ON k.id = g.kingdom_id
           JOIN nations n ON n.governor_id = g.id
          WHERE g.is_bot AND k.mode = 'quick' AND k.finished_at IS NULL AND k.started_at IS NOT NULL AND ($1::int IS NULL OR k.id = $1)`,
        [kingdomId],
      );
      const now = Date.now();
      for (const b of rows) {
        const id = Number(b.id);
        if ((this.nextThink.get(id) ?? 0) > now) continue;
        this.nextThink.set(id, now + rand(QUICK.botThink[0], QUICK.botThink[1]) * 1000);
        const ctx: GovernorCtx = { id, name: b.name, kingdomId: b.kingdom_id, mode: 'quick', allianceId: null, allianceRank: null };
        await this.botBuild(ctx).catch(botFailed(id, 'build'));
        await this.botArmy(ctx).catch(botFailed(id, 'army'));
        await this.botWar(ctx, b.started_at ? new Date(b.started_at).getTime() : null).catch(botFailed(id, 'war'));
        await this.botExpand(ctx, b.arena as string[]).catch(botFailed(id, 'expand'));
      }
    } finally {
      this.ticking.delete(kingdomId);
    }
  }

  private async botExpand(g: GovernorCtx, arena: string[]) {
    const [control, active] = await Promise.all([
      this.territory.control(g.kingdomId),
      this.db.query(`SELECT region_id, governor_id FROM occupations WHERE kingdom_id = $1 AND status = 'active'`, [g.kingdomId]),
    ]);
    if (active.rows.some((r) => Number(r.governor_id) === g.id)) return;
    const owners = new Map(control);
    const busy = new Set(active.rows.map((r) => r.region_id));
    const inArena = new Set(arena);
    const mine = control.filter(([, o]) => o === g.id).map(([r]) => r);
    const targets = expansionTargets(mine, (id) => inArena.has(id) && !owners.has(id) && !busy.has(id));
    if (!targets.length) return;
    // Prefere fechar o próprio território (mais vizinhos seus) e regiões menores (mais rápidas).
    const mineSet = new Set(mine);
    const score = (id: string) => REGION_BY_ID[id].neighbors.filter((n) => mineSet.has(n)).length * 2 - REGION_BY_ID[id].area / 150_000 + Math.random();
    const target = targets.sort((a, b) => score(b) - score(a))[0];
    await this.territory.expand(g, target);
  }

  private async botBuild(g: GovernorCtx) {
    const view = await this.economy.view(this.db, g.id);
    if (!view) return;
    const [inputs, nation, structures] = await Promise.all([
      this.economy.inputs(this.db, g.id),
      this.db.query('SELECT capital_point FROM nations WHERE governor_id = $1', [g.id]),
      this.economy.structures(g.kingdomId),
    ]);
    const mine = structures.filter((s) => s.nationId === g.id);
    if (mine.some((s) => s.building)) return;
    const have = project(view.amounts, view.settledAt, view.rates, view.capacity, Date.now());
    const capital = START_POINT_BY_ID[nation.rows[0].capital_point]?.region ?? null;
    const count = (t: StructureType) => mine.filter((s) => s.type === t).length;
    const affordable = (t: StructureType, from: number) => !Object.keys(missing(have, structureCost(t, from, from === 0 ? count(t) : 0))).length;
    const avoid = structures.map((s) => s.at);
    const tryBuild = async (t: StructureType, region: string) => {
      const inRegion = structures.filter((s) => s.region === region).length;
      if (buildProblem(t, { region, coast: REGION_BY_ID[region].coast, capitalRegion: capital, inRegion, queue: 0 }) || !affordable(t, 0)) return false;
      const at = freePointIn(region, avoid, ECONOMY.minDistanceKm + 5);
      if (!at) return false;
      await this.economy.build(g, at, t, region);
      return true;
    };
    const has = (t: StructureType, region: string | null) => mine.some((s) => s.type === t && (region === null || s.region === region));
    const econ = computeEconomy(inputs, 'quick');
    if (capital && !has('city', capital) && (await tryBuild('city', capital))) return;
    if (capital && econ.energy.demand + 2 > econ.energy.supply && (await tryBuild('power', capital))) return;
    if (capital && !has('factory', capital) && (await tryBuild('factory', capital))) return;
    for (const r of inputs.regions) if (r !== capital && !has('city', r) && (await tryBuild('city', r))) return;
    // Exército: base militar depois da economia básica, centro de defesa depois.
    if (capital && mine.length >= 3 && !has('military_base', null) && (await tryBuild('military_base', capital))) return;
    if (capital && mine.length >= 5 && !has('defense_center', null) && (await tryBuild('defense_center', capital))) return;
    // Melhora a construção mais barata de melhorar.
    const up = mine.filter((s) => s.level >= 1 && s.level < ECONOMY.maxLevel && (s.type === 'city' || s.type === 'factory')).sort((a, b) => a.level - b.level)[0];
    if (up && affordable(up.type, up.level)) await this.economy.upgrade(g, up.id);
  }

  /**
   * Bots na guerra: reforçam uma vez a região atacada (50% das tropas em casa) e, passados 4 minutos
   * de partida, atacam a região inimiga mais fraca vizinha quando o ataque com 50% das tropas passa
   * de 2,5× a defesa estimada (a mesma estimativa pública que o jogador vê; capital ×1,5).
   */
  private async botWar(g: GovernorCtx, startedAt: number | null) {
    if (!this.war) return;
    const ops = await this.db.query(`SELECT id, attacker_id, defender_id, region_id, events FROM operations WHERE kingdom_id = $1 AND status = 'active'`, [g.kingdomId]);
    // Aliados (Fase F) e nações com quem o bot rompeu há menos de 30 min ficam fora dos alvos.
    const friends = new Set(
      (
        await this.db.query(
          `SELECT other.governor_id FROM alliance_members me JOIN alliances a ON a.id = me.alliance_id AND a.status = 'active'
             JOIN alliance_members other ON other.alliance_id = me.alliance_id AND other.governor_id <> me.governor_id WHERE me.governor_id = $1
           UNION SELECT former_id FROM alliance_breaks WHERE breaker_id = $1 AND until > now()`,
          [g.id],
        )
      ).rows.map((r) => Number(r.governor_id)),
    );
    for (const o of ops.rows) {
      const events = o.events as { kind: string; by?: number }[];
      if (Number(o.defender_id) === g.id && !events.some((e) => e.kind === 'reinforce' && e.by === undefined)) {
        await this.war.reinforce(g, Number(o.id), 50).catch(() => {});
      }
      // Ajuda um aliado atacado uma vez, com 25% das tropas em casa.
      if (friends.has(Number(o.defender_id)) && !events.some((e) => e.kind === 'reinforce' && e.by === g.id)) {
        await this.war.reinforce(g, Number(o.id), 25).catch(() => {});
      }
    }
    if (!startedAt || Date.now() - startedAt < QUICK.botWarAfterMinutes * 60_000) return;
    if (ops.rows.some((o) => Number(o.attacker_id) === g.id)) return;
    const [control, nations, home, research] = await Promise.all([
      this.territory.control(g.kingdomId),
      this.db.query(
        `SELECT n.governor_id, n.capital_point, COALESCE(m.power, 0) AS power FROM nations n LEFT JOIN military m ON m.governor_id = n.governor_id WHERE n.kingdom_id = $1`,
        [g.kingdomId],
      ),
      this.db.query('SELECT unit, amount FROM army WHERE governor_id = $1', [g.id]),
      this.db.query('SELECT tech, level FROM research WHERE governor_id = $1 AND level > 0', [g.id]),
    ]);
    const army = Object.fromEntries(home.rows.map((r) => [r.unit, r.amount]));
    const sent = attackPower(share(army, 50), Object.fromEntries(research.rows.map((r) => [r.tech, r.level])));
    if (sent <= 0) return;
    const owner = new Map(control);
    const regionsOf = (id: number) => control.filter(([, o]) => o === id).length;
    const info = new Map(nations.rows.map((r) => [Number(r.governor_id), { power: Number(r.power), capital: START_POINT_BY_ID[r.capital_point]?.region }]));
    const mine = control.filter(([, o]) => o === g.id).map(([r]) => r);
    const busy = new Set(ops.rows.map((o) => o.region_id));
    let best: { region: string; def: number } | null = null;
    for (const r of mine) {
      for (const n of REGION_BY_ID[r].neighbors) {
        const o = owner.get(n);
        if (o === undefined || o === g.id || busy.has(n) || friends.has(o)) continue;
        const capital = info.get(o)?.capital === n ? WAR.capitalBonus : 1;
        const def = estimatedDefense(info.get(o)?.power ?? 0, regionsOf(o)) * capital + WAR.militia;
        if (!best || def < best.def) best = { region: n, def };
      }
    }
    if (best && sent >= 2.5 * best.def) await this.war.attack(g, best.region, 50);
  }

  /** Bots criam tropas com até 25% do dinheiro por vez (defesa quando há centro de defesa). */
  private async botArmy(g: GovernorCtx) {
    if (!this.military) return;
    const [mil, view] = await Promise.all([this.military.view(this.db, g.id), this.economy.view(this.db, g.id)]);
    if (!mil || !view) return;
    const now = Date.now();
    const money = project(view.amounts, view.settledAt, view.rates, view.capacity, now).money;
    const structures = (await this.economy.inputs(this.db, g.id)).structures;
    const unit: UnitType = !unitProblem('defense', structures, mil.research) && (mil.army.defense ?? 0) < (mil.army.infantry ?? 0) / 4 ? 'defense' : 'infantry';
    const per = UNITS[unit];
    // Unidades saem na hora: o bot gasta só 25% do dinheiro por vez, para seguir construindo e expandindo.
    const amount = Math.min(MILITARY.maxBatch, Math.floor((money * 0.25) / (per.cost.money ?? 1)));
    if (amount >= 10) await this.military.train(g, unit, amount);
  }
}
