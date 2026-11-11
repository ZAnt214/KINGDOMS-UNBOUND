import { buildProblem, computeEconomy, ECONOMY, missing, project, structureCost, type StructureType } from '../../../shared/play/economy.js';
import { botIdentities, buildArena, matchOutcome, type OutcomeReason, pickBotPoints, QUICK, rank, type Standing, THEATERS } from '../../../shared/play/match.js';
import { expansionTargets, REGION_BY_ID, START_POINT_BY_ID } from '../../../shared/world/regions.js';
import { freePointIn } from '../geo.js';
import type { GovernorCtx } from '../auth.js';
import { type Db, tx } from '../db.js';
import { conflict } from '../http.js';
import type { Hub } from '../hub.js';
import { MILITARY, projectRecruits, UNITS, unitProblem, type UnitType } from '../../../shared/play/military.js';
import type { MilitaryService } from './military.js';
import type { EconomyService } from './economy.js';
import type { NationService } from './nation.js';
import type { TerritoryService } from './territory.js';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Partida rápida: cria o mundo com arena e bots, conduz os bots e encerra a partida.
 * Os bots são nações comuns sem usuário: passam pelas mesmas regras e serviços que um jogador.
 */
export class MatchService {
  private nextThink = new Map<number, number>();
  private ticking = false;

  constructor(
    private db: Db,
    private hub: Hub,
    private nations: NationService,
    private territory: TerritoryService,
    private economy: EconomyService,
  ) {}

  /** Exército dos bots (Fase D). Definido em app.ts. */
  military: MilitaryService | null = null;

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
      `SELECT id, arena, ends_at, created_at FROM kingdoms WHERE mode = 'quick' AND finished_at IS NULL AND ($1::int IS NULL OR id = $1)`,
      [kingdomId],
    );
    for (const k of rows) {
      const endsAt = k.ends_at ? new Date(k.ends_at).getTime() : null;
      if (endsAt === null) {
        if (Date.now() - new Date(k.created_at).getTime() > QUICK.foundDeadlineMinutes * 60_000) await this.finish(k.id, 'expired');
        continue;
      }
      const s = await this.standings(k.id, k.arena);
      const out = matchOutcome({ arenaSize: k.arena.length, standings: s.standings, now: Date.now(), endsAt, neutralLeft: s.neutralLeft, activeOccupations: s.active });
      if (out.over) await this.finish(k.id, out.reason);
    }
  }

  /** Um passo dos bots de todas as partidas em andamento (chamado pelo worker). */
  async tick(kingdomId: number | null = null) {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const { rows } = await this.db.query(
        `SELECT g.id, g.name, g.kingdom_id, k.arena FROM governors g
           JOIN kingdoms k ON k.id = g.kingdom_id
           JOIN nations n ON n.governor_id = g.id
          WHERE g.is_bot AND k.mode = 'quick' AND k.finished_at IS NULL AND k.ends_at IS NOT NULL AND ($1::int IS NULL OR k.id = $1)`,
        [kingdomId],
      );
      const now = Date.now();
      for (const b of rows) {
        const id = Number(b.id);
        if ((this.nextThink.get(id) ?? 0) > now) continue;
        this.nextThink.set(id, now + rand(QUICK.botThink[0], QUICK.botThink[1]) * 1000);
        const ctx: GovernorCtx = { id, name: b.name, kingdomId: b.kingdom_id, mode: 'quick', allianceId: null, allianceRank: null };
        await this.botBuild(ctx).catch(() => {});
        await this.botArmy(ctx).catch(() => {});
        await this.botExpand(ctx, b.arena as string[]).catch(() => {});
      }
    } finally {
      this.ticking = false;
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

  /** Bots treinam com os recrutas que têm, gastando no máximo 40% do dinheiro por vez. */
  private async botArmy(g: GovernorCtx) {
    if (!this.military) return;
    const [mil, view] = await Promise.all([this.military.view(this.db, g.id), this.economy.view(this.db, g.id)]);
    if (!mil || !view || mil.training.length) return;
    const now = Date.now();
    const recruits = Math.floor(projectRecruits(mil.recruits.amount, mil.recruits.settledAt, mil.recruits.rate, mil.recruits.cap, now));
    const money = project(view.amounts, view.settledAt, view.rates, view.capacity, now).money;
    const structures = (await this.economy.inputs(this.db, g.id)).structures;
    const unit: UnitType = !unitProblem('defense', structures, mil.research) && (mil.army.defense ?? 0) < (mil.army.infantry ?? 0) / 4 ? 'defense' : 'infantry';
    const per = UNITS[unit];
    const amount = Math.min(MILITARY.maxBatch, Math.floor(recruits / per.recruits), Math.floor((money * 0.4) / (per.cost.money ?? 1)));
    if (amount >= 10) await this.military.train(g, unit, amount);
  }
}
