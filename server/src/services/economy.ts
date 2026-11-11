import {
  computeEconomy,
  type Cost,
  describeCost,
  ECONOMY,
  ECONOMY_RULES_VERSION,
  type EconomyInput,
  buildProblem,
  missing,
  RESOURCES,
  type ResourceMap,
  STRUCTURE_TYPES,
  structureCost,
  structureSeconds,
  type StructureType,
  zero,
} from '../../../shared/play/economy.js';
import type { GameMode } from '../../../shared/play/rules.js';
import type { EconomyView, StructureView } from '../../../shared/play/types.js';
import { distanceKm, REGION_BY_ID, START_POINT_BY_ID } from '../../../shared/world/regions.js';
import { regionAt } from '../geo.js';
import type { GovernorCtx } from '../auth.js';
import { type Db, type Tx, tx } from '../db.js';
import { bad, conflict, HttpError, notFound } from '../http.js';
import type { Hub } from '../hub.js';

type Queryable = Pick<Db, 'query'> | Pick<Tx, 'query'>;

const pointOf = (r: any): [number, number] => (r.lon === null || r.lon === undefined ? (REGION_BY_ID[r.region_id]?.at ?? [0, 0]) : [r.lon, r.lat]);

export const structureView = (r: any): StructureView => ({
  id: Number(r.id),
  nationId: Number(r.governor_id),
  region: r.region_id,
  type: r.type as StructureType,
  at: pointOf(r),
  level: r.level,
  building: r.target_level === null ? null : { to: r.target_level, startedAt: new Date(r.started_at).getTime(), endsAt: new Date(r.ends_at).getTime() },
});

const STRUCTURE_COLUMNS = 'id, governor_id, region_id, type, level, target_level, started_at, ends_at, lon, lat';

/**
 * Economia autoritativa: saldo, produção e construções.
 *
 * O saldo é guardado como "valor no instante settled_at" e cresce linearmente com a produção.
 * Antes de qualquer mudança que altere a produção (região ganha, obra concluída) ou o saldo (gasto),
 * o saldo é acertado até aquele instante com a produção antiga. Assim nada depende de o jogador
 * estar conectado nem de um temporizador vivo.
 */
export class EconomyService {
  constructor(
    private db: Db,
    private hub: Hub,
  ) {}

  /** Entradas do cálculo de produção, lidas do banco. */
  async inputs(q: Queryable, governorId: number): Promise<EconomyInput> {
    const [regions, structures, nation, allied] = await Promise.all([
      q.query('SELECT region_id FROM region_control WHERE governor_id = $1', [governorId]),
      q.query('SELECT id, type, level, region_id, lon, lat FROM structures WHERE governor_id = $1 AND level > 0', [governorId]),
      q.query('SELECT capital_point FROM nations WHERE governor_id = $1', [governorId]),
      // Construções concluídas das outras nações da mesma aliança ativa (conexões entre aliados).
      q.query(
        `SELECT s.id, s.governor_id, s.type, s.level, s.region_id, s.lon, s.lat
           FROM alliance_members me
           JOIN alliances a ON a.id = me.alliance_id AND a.status = 'active'
           JOIN alliance_members other ON other.alliance_id = me.alliance_id AND other.governor_id <> me.governor_id
           JOIN structures s ON s.governor_id = other.governor_id AND s.level > 0
          WHERE me.governor_id = $1`,
        [governorId],
      ),
    ]);
    return {
      regions: regions.rows.map((r) => r.region_id),
      capitalRegion: START_POINT_BY_ID[nation.rows[0]?.capital_point]?.region ?? null,
      structures: structures.rows.map((r) => ({ id: Number(r.id), type: r.type, level: r.level, region: r.region_id, at: pointOf(r) })),
      allied: allied.rows.map((r) => ({ id: Number(r.id), nation: Number(r.governor_id), type: r.type, level: r.level, region: r.region_id, at: pointOf(r) })),
    };
  }

  /** Nação e os outros membros da aliança dela: quem tem a produção afetada por uma mudança na rede. */
  async network(q: Queryable, governorId: number): Promise<number[]> {
    const { rows } = await q.query(
      `SELECT other.governor_id FROM alliance_members me
         JOIN alliances a ON a.id = me.alliance_id AND a.status = 'active'
         JOIN alliance_members other ON other.alliance_id = me.alliance_id
        WHERE me.governor_id = $1`,
      [governorId],
    );
    return [...new Set([governorId, ...rows.map((r) => Number(r.governor_id))])].sort((a, b) => a - b);
  }

  /**
   * Acerta o saldo de várias nações (sempre em ordem crescente de id, a mesma em toda transação,
   * para duas conclusões simultâneas não travarem uma à outra).
   */
  async settleMany(client: Tx, governorIds: number[], at: Date) {
    for (const id of [...new Set(governorIds)].sort((a, b) => a - b)) await this.settle(client, id, at);
  }

  async modeOf(q: Queryable, governorId: number): Promise<GameMode> {
    const { rows } = await q.query('SELECT k.mode FROM governors g JOIN kingdoms k ON k.id = g.kingdom_id WHERE g.id = $1', [governorId]);
    return (rows[0]?.mode ?? 'campaign') as GameMode;
  }

  /** Saldo inicial da nação recém-fundada (na mesma transação da fundação). */
  async init(client: Tx, governorId: number) {
    for (const r of RESOURCES) {
      await client.query('INSERT INTO nation_resources (governor_id, resource, amount, settled_at) VALUES ($1, $2, $3, now())', [governorId, r, ECONOMY.starting[r]]);
    }
  }

  /** Lê o saldo travando as linhas (ordem fixa por recurso: evita impasse entre transações). */
  private async lock(client: Tx, governorId: number): Promise<{ amounts: ResourceMap; settledAt: number }> {
    const { rows } = await client.query(
      'SELECT resource, amount::float8 AS amount, settled_at FROM nation_resources WHERE governor_id = $1 ORDER BY resource FOR UPDATE',
      [governorId],
    );
    const amounts = zero();
    let settledAt = 0;
    for (const r of rows) {
      amounts[r.resource as keyof ResourceMap] = r.amount;
      settledAt = Math.max(settledAt, new Date(r.settled_at).getTime());
    }
    return { amounts, settledAt };
  }

  /**
   * Acerta o saldo até `at` com a produção atual e devolve o saldo acertado.
   * Se o saldo já estiver acertado depois de `at` (evento processado fora de ordem), não volta no tempo.
   */
  async settle(client: Tx, governorId: number, at: Date): Promise<ResourceMap> {
    const { amounts, settledAt } = await this.lock(client, governorId);
    if (!settledAt) return amounts; // sem nação fundada: nada a acertar
    const when = Math.max(at.getTime(), settledAt);
    if (when === settledAt) return amounts;
    const econ = computeEconomy(await this.inputs(client, governorId), await this.modeOf(client, governorId));
    const h = (when - settledAt) / 3_600_000;
    const out = zero();
    for (const r of RESOURCES) {
      const a = amounts[r];
      out[r] = a >= econ.capacity ? a : Math.min(econ.capacity, a + econ.rates[r] * h);
      await client.query('UPDATE nation_resources SET amount = $3, settled_at = $4 WHERE governor_id = $1 AND resource = $2', [governorId, r, out[r], new Date(when)]);
    }
    return out;
  }

  /** Acerta o saldo agora e desconta o custo, ou recusa sem mudar nada. */
  async spend(client: Tx, governorId: number, cost: Cost, what: string) {
    const have = await this.settle(client, governorId, new Date());
    const short = missing(have, cost);
    if (Object.keys(short).length) throw new HttpError(409, 'insufficient', `Recursos insuficientes para ${what}. Faltam ${describeCost(short)}.`);
    for (const [r, v] of Object.entries(cost) as [keyof ResourceMap, number][]) {
      if (!v) continue;
      await client.query('UPDATE nation_resources SET amount = amount - $3 WHERE governor_id = $1 AND resource = $2', [governorId, r, v]);
    }
  }

  async view(q: Queryable, governorId: number): Promise<EconomyView | null> {
    const { rows } = await q.query('SELECT resource, amount::float8 AS amount, settled_at FROM nation_resources WHERE governor_id = $1', [governorId]);
    if (!rows.length) return null;
    const amounts = zero();
    let settledAt = 0;
    for (const r of rows) {
      amounts[r.resource as keyof ResourceMap] = r.amount;
      settledAt = Math.max(settledAt, new Date(r.settled_at).getTime());
    }
    const econ = computeEconomy(await this.inputs(q, governorId), await this.modeOf(q, governorId));
    return { amounts, settledAt, rates: econ.rates, capacity: econ.capacity, energy: econ.energy, efficiency: econ.efficiency, logistics: econ.logistics };
  }

  async structures(kingdomId: number, q: Queryable = this.db): Promise<StructureView[]> {
    const { rows } = await q.query(`SELECT ${STRUCTURE_COLUMNS} FROM structures WHERE kingdom_id = $1 ORDER BY id`, [kingdomId]);
    return rows.map(structureView);
  }

  /** Avisa o dono do novo saldo e produção (só ele recebe a própria economia). */
  async announceEconomy(governorId: number) {
    const economy = await this.view(this.db, governorId);
    if (economy) this.hub.toGovernor(governorId, { type: 'play.economy', economy, serverTime: Date.now() });
  }

  private async open(client: Tx, kingdomId: number) {
    const { rows } = await client.query('SELECT finished_at FROM kingdoms WHERE id = $1', [kingdomId]);
    if (rows[0]?.finished_at) throw conflict('match_over', 'Esta partida já terminou.');
  }

  private async queue(client: Tx, governorId: number): Promise<number> {
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM structures WHERE governor_id = $1 AND target_level IS NOT NULL', [governorId]);
    return rows[0].n;
  }

  /**
   * Nova construção no ponto escolhido pelo jogador. O servidor descobre a região pelo ponto
   * (a sugerida pelo cliente é só um atalho) e confere dono, espaços, distância e recursos.
   */
  async build(g: GovernorCtx, at: [number, number], type: StructureType, hint: string | null = null): Promise<StructureView> {
    if (!STRUCTURE_TYPES.includes(type)) throw bad('invalid_type', 'Construção desconhecida.');
    const [lon, lat] = at;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) throw bad('invalid_point', 'Ponto inválido.');
    await this.completeDue(g.kingdomId);
    const created = await tx(this.db, async (client) => {
      const nation = await client.query('SELECT capital_point FROM nations WHERE governor_id = $1 FOR UPDATE', [g.id]);
      if (!nation.rowCount) throw new HttpError(409, 'no_nation', 'Funde sua nação antes de construir.');
      await this.open(client, g.kingdomId);
      const mine = await client.query('SELECT region_id FROM region_control WHERE kingdom_id = $1 AND governor_id = $2', [g.kingdomId, g.id]);
      const owned: string[] = mine.rows.map((r) => r.region_id);
      const regionId = regionAt(lon, lat, hint && owned.includes(hint) ? [hint, ...owned] : owned);
      if (!regionId || !owned.includes(regionId)) throw conflict('not_owner', 'Construa dentro do seu território.');
      const region = REGION_BY_ID[regionId];
      const near = await client.query('SELECT region_id, lon, lat FROM structures WHERE kingdom_id = $1 AND (region_id = $2 OR lon IS NULL OR lon BETWEEN $3::float8 AND $4::float8)', [g.kingdomId, regionId, lon - 3, lon + 3]);
      const others = near.rows.map((r) => (r.lon === null ? (REGION_BY_ID[r.region_id]?.at ?? [0, 0]) : [r.lon, r.lat]) as [number, number]);
      if (others.some((p) => distanceKm(p, at) < ECONOMY.minDistanceKm)) throw conflict('too_close', `Muito perto de outra construção. Deixe pelo menos ${ECONOMY.minDistanceKm} km.`);
      const capitalRegion = START_POINT_BY_ID[nation.rows[0].capital_point]?.region ?? null;
      const problem = buildProblem(type, {
        region: regionId,
        coast: region.coast,
        capitalRegion,
        inRegion: near.rows.filter((r) => r.region_id === regionId).length,
        queue: await this.queue(client, g.id),
      });
      if (problem) throw conflict('cannot_build', problem);
      const same = await client.query('SELECT COUNT(*)::int AS n FROM structures WHERE governor_id = $1 AND type = $2', [g.id, type]);
      const mode = await this.modeOf(client, g.id);
      await this.spend(client, g.id, structureCost(type, 0, same.rows[0].n), 'esta construção');
      const { rows } = await client.query(
        `INSERT INTO structures (kingdom_id, governor_id, region_id, type, level, target_level, started_at, ends_at, rules_version, lon, lat)
         VALUES ($1, $2, $3, $4, 0, 1, now(), now() + make_interval(secs => $5::double precision), $6, $7, $8) RETURNING ${STRUCTURE_COLUMNS}`,
        [g.kingdomId, g.id, regionId, type, structureSeconds(type, 0, mode), ECONOMY_RULES_VERSION, lon, lat],
      );
      return structureView(rows[0]);
    });
    this.hub.toKingdom(g.kingdomId, { type: 'play.structure', structure: created, completed: false, serverTime: Date.now() });
    await this.announceEconomy(g.id);
    return created;
  }

  /** Melhora uma construção concluída para o próximo nível. */
  async upgrade(g: GovernorCtx, structureId: number): Promise<StructureView> {
    await this.completeDue(g.kingdomId);
    const updated = await tx(this.db, async (client) => {
      // Trava a construção antes do saldo: mesma ordem da conclusão de obras.
      const { rows } = await client.query(`SELECT ${STRUCTURE_COLUMNS}, kingdom_id FROM structures WHERE id = $1 FOR UPDATE`, [structureId]);
      const s = rows[0];
      if (!s || Number(s.governor_id) !== g.id || s.kingdom_id !== g.kingdomId) throw notFound('Construção não encontrada.');
      await this.open(client, g.kingdomId);
      if (s.target_level !== null) throw conflict('cannot_build', 'Esta construção já está em obra.');
      if (s.level >= ECONOMY.maxLevel) throw conflict('cannot_build', `Nível máximo (${ECONOMY.maxLevel}) alcançado.`);
      if ((await this.queue(client, g.id)) >= ECONOMY.buildQueue) throw conflict('cannot_build', `Já há ${ECONOMY.buildQueue} obras em andamento. Aguarde uma terminar.`);
      const mode = await this.modeOf(client, g.id);
      await this.spend(client, g.id, structureCost(s.type, s.level), 'esta melhoria');
      const done = await client.query(
        `UPDATE structures SET target_level = level + 1, started_at = now(), ends_at = now() + make_interval(secs => $2::double precision), rules_version = $3
          WHERE id = $1 RETURNING ${STRUCTURE_COLUMNS}`,
        [structureId, structureSeconds(s.type, s.level, mode), ECONOMY_RULES_VERSION],
      );
      return structureView(done.rows[0]);
    });
    this.hub.toKingdom(g.kingdomId, { type: 'play.structure', structure: updated, completed: false, serverTime: Date.now() });
    await this.announceEconomy(g.id);
    return updated;
  }

  /**
   * Conclui obras vencidas pelo relógio do banco, uma por transação: acerta o saldo até o fim da
   * obra com a produção antiga e só então sobe o nível. `SKIP LOCKED` evita conclusão em dobro.
   */
  async completeDue(kingdomId: number | null = null, limit = 100): Promise<number> {
    const due = await this.db.query(
      `SELECT id FROM structures WHERE target_level IS NOT NULL AND ends_at <= now() AND ($1::int IS NULL OR kingdom_id = $1) ORDER BY ends_at, id LIMIT $2`,
      [kingdomId, limit],
    );
    let n = 0;
    for (const { id } of due.rows) {
      const done = await tx(this.db, async (client) => {
        const { rows } = await client.query(
          `SELECT ${STRUCTURE_COLUMNS}, kingdom_id FROM structures WHERE id = $1 AND target_level IS NOT NULL AND ends_at <= now() FOR UPDATE SKIP LOCKED`,
          [id],
        );
        const s = rows[0];
        if (!s) return null;
        // A obra concluída pode criar trechos de ferrovia ou conexões com aliados: acerta o saldo de
        // todos que têm a produção afetada até o fim da obra, com a produção antiga.
        const affected = s.level === 0 ? await this.network(client, Number(s.governor_id)) : [Number(s.governor_id)];
        await this.settleMany(client, affected, new Date(s.ends_at));
        const up = await client.query(
          `UPDATE structures SET level = target_level, target_level = NULL, started_at = NULL, ends_at = NULL WHERE id = $1 RETURNING ${STRUCTURE_COLUMNS}`,
          [id],
        );
        return { kingdomId: s.kingdom_id as number, structure: structureView(up.rows[0]), affected };
      });
      if (!done) continue;
      n++;
      this.hub.toKingdom(done.kingdomId, { type: 'play.structure', structure: done.structure, completed: true, serverTime: Date.now() });
      for (const id of done.affected) await this.announceEconomy(id);
    }
    return n;
  }

  processDue() {
    return this.completeDue(null);
  }
}
