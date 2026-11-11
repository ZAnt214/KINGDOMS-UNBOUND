import { computeEconomy } from '../../../shared/play/economy.js';
import {
  type Army,
  MILITARY,
  MILITARY_RULES_VERSION,
  militaryPower,
  type Research,
  researchProblem,
  TECH_TYPES,
  type TechType,
  techCost,
  techSeconds,
  trainCost,
  trainSeconds,
  UNIT_TYPES,
  unitProblem,
  type UnitType,
} from '../../../shared/play/military.js';
import type { MilitaryDone, MilitaryView } from '../../../shared/play/types.js';
import type { GovernorCtx } from '../auth.js';
import { type Db, type Tx, tx } from '../db.js';
import { bad, conflict, HttpError } from '../http.js';
import type { Hub } from '../hub.js';
import type { EconomyService } from './economy.js';

type Queryable = Pick<Db, 'query'> | Pick<Tx, 'query'>;

/**
 * Sistema militar autoritativo (Fase D): treinamento em fila, pesquisa e poder militar.
 *
 * Igual às obras: lotes e pesquisas terminam pelo relógio do banco (worker a cada 1 s, e também na
 * leitura e antes de cada pedido). Antes de o exército mudar, o saldo é acertado até o fim do
 * lote com a manutenção antiga.
 */
export class MilitaryService {
  constructor(
    private db: Db,
    private hub: Hub,
    private economy: EconomyService,
  ) {}

  private async structures(q: Queryable, governorId: number) {
    const { rows } = await q.query('SELECT type, level FROM structures WHERE governor_id = $1 AND level > 0', [governorId]);
    return rows.map((r) => ({ type: r.type, level: r.level }));
  }

  private async army(q: Queryable, governorId: number): Promise<Army> {
    const { rows } = await q.query('SELECT unit, amount FROM army WHERE governor_id = $1', [governorId]);
    return Object.fromEntries(rows.map((r) => [r.unit, r.amount]));
  }

  private async research(q: Queryable, governorId: number): Promise<{ levels: Research; active: any | null }> {
    const { rows } = await q.query('SELECT tech, level, target_level, started_at, ends_at FROM research WHERE governor_id = $1', [governorId]);
    return {
      levels: Object.fromEntries(rows.filter((r) => r.level > 0).map((r) => [r.tech, r.level])),
      active: rows.find((r) => r.target_level !== null) ?? null,
    };
  }

  async view(q: Queryable, governorId: number): Promise<MilitaryView | null> {
    const mil = await q.query('SELECT recruits::float8 AS recruits, settled_at FROM military WHERE governor_id = $1', [governorId]);
    if (!mil.rows[0]) return null;
    const [structures, army, research, training, econ] = await Promise.all([
      this.structures(q, governorId),
      this.army(q, governorId),
      this.research(q, governorId),
      q.query('SELECT id, unit, amount, started_at, ends_at FROM training WHERE governor_id = $1 ORDER BY ends_at, id', [governorId]),
      Promise.all([this.economy.inputs(q, governorId), this.economy.modeOf(q, governorId)]).then(([input, mode]) => computeEconomy(input, mode)),
    ]);
    return {
      recruits: { amount: mil.rows[0].recruits, settledAt: new Date(mil.rows[0].settled_at).getTime(), rate: econ.recruits.rate, cap: econ.recruits.cap },
      army,
      training: training.rows.map((r) => ({
        id: Number(r.id),
        unit: r.unit as UnitType,
        amount: r.amount,
        startedAt: new Date(r.started_at).getTime(),
        endsAt: new Date(r.ends_at).getTime(),
      })),
      research: research.levels,
      researching: research.active
        ? {
            tech: research.active.tech as TechType,
            to: research.active.target_level,
            startedAt: new Date(research.active.started_at).getTime(),
            endsAt: new Date(research.active.ends_at).getTime(),
          }
        : null,
      power: militaryPower(army, research.levels, structures),
    };
  }

  /** Recalcula o poder militar guardado e avisa o mundo se mudou. */
  async refreshPower(governorId: number) {
    const [structures, army, research] = await Promise.all([this.structures(this.db, governorId), this.army(this.db, governorId), this.research(this.db, governorId)]);
    const power = militaryPower(army, research.levels, structures).power;
    const { rows } = await this.db.query(
      'UPDATE military m SET power = $2 FROM (SELECT power AS old FROM military WHERE governor_id = $1) o WHERE m.governor_id = $1 RETURNING o.old, m.kingdom_id',
      [governorId, power],
    );
    if (rows[0] && rows[0].old !== power) this.hub.toKingdom(rows[0].kingdom_id, { type: 'play.power', nationId: governorId, power, serverTime: Date.now() });
  }

  async announce(governorId: number, done?: MilitaryDone) {
    const military = await this.view(this.db, governorId);
    if (military) this.hub.toGovernor(governorId, { type: 'play.military', military, done, serverTime: Date.now() });
  }

  private async open(client: Tx, kingdomId: number) {
    const { rows } = await client.query('SELECT finished_at FROM kingdoms WHERE id = $1', [kingdomId]);
    if (rows[0]?.finished_at) throw conflict('match_over', 'Esta partida já terminou.');
  }

  /** Põe um lote de unidades na fila de treinamento. */
  async train(g: GovernorCtx, unit: UnitType, amount: number): Promise<MilitaryView> {
    if (!UNIT_TYPES.includes(unit)) throw bad('invalid_unit', 'Unidade desconhecida.');
    if (!Number.isInteger(amount) || amount < 1 || amount > MILITARY.maxBatch) throw bad('invalid_amount', `Escolha de 1 a ${MILITARY.maxBatch} unidades.`);
    await this.completeDue(g.kingdomId);
    await tx(this.db, async (client) => {
      const nation = await client.query('SELECT 1 FROM nations WHERE governor_id = $1 FOR UPDATE', [g.id]);
      if (!nation.rowCount) throw new HttpError(409, 'no_nation', 'Funde sua nação antes de formar um exército.');
      await this.open(client, g.kingdomId);
      const [structures, research] = await Promise.all([this.structures(client, g.id), this.research(client, g.id)]);
      const problem = unitProblem(unit, structures, research.levels);
      if (problem) throw conflict('cannot_train', problem);
      const queue = await client.query('SELECT COUNT(*)::int AS n, max(ends_at) AS last FROM training WHERE governor_id = $1', [g.id]);
      if (queue.rows[0].n >= MILITARY.queue) throw conflict('cannot_train', `A fila já tem ${MILITARY.queue} lotes. Aguarde um terminar.`);
      const { cost, recruits } = trainCost(unit, amount);
      // Saldo e recrutas acertados agora (a mesma chamada acerta os dois).
      await this.economy.spend(client, g.id, cost, 'este treinamento');
      const mil = await client.query('SELECT recruits::float8 AS recruits FROM military WHERE governor_id = $1 FOR UPDATE', [g.id]);
      if ((mil.rows[0]?.recruits ?? 0) + 1e-6 < recruits) {
        throw new HttpError(409, 'insufficient', `Recrutas insuficientes: este lote precisa de ${recruits} e há ${Math.floor(mil.rows[0]?.recruits ?? 0)}.`);
      }
      await client.query('UPDATE military SET recruits = recruits - $2 WHERE governor_id = $1', [g.id, recruits]);
      const mode = await this.economy.modeOf(client, g.id);
      const seconds = trainSeconds(unit, amount, structures, research.levels, mode);
      await client.query(
        `INSERT INTO training (kingdom_id, governor_id, unit, amount, started_at, ends_at, rules_version)
         SELECT $1, $2, $3, $4, s, s + make_interval(secs => $5::double precision), $6
           FROM (SELECT GREATEST(now(), COALESCE($7::timestamptz, now())) AS s) t`,
        [g.kingdomId, g.id, unit, amount, seconds, MILITARY_RULES_VERSION, queue.rows[0].last],
      );
    });
    await this.economy.announceEconomy(g.id);
    await this.announce(g.id);
    return (await this.view(this.db, g.id))!;
  }

  /** Começa a pesquisa do próximo nível de uma tecnologia. */
  async startResearch(g: GovernorCtx, tech: TechType): Promise<MilitaryView> {
    if (!TECH_TYPES.includes(tech)) throw bad('invalid_tech', 'Pesquisa desconhecida.');
    await this.completeDue(g.kingdomId);
    await tx(this.db, async (client) => {
      const nation = await client.query('SELECT 1 FROM nations WHERE governor_id = $1 FOR UPDATE', [g.id]);
      if (!nation.rowCount) throw new HttpError(409, 'no_nation', 'Funde sua nação antes de pesquisar.');
      await this.open(client, g.kingdomId);
      const [structures, research] = await Promise.all([this.structures(client, g.id), this.research(client, g.id)]);
      const problem = researchProblem(tech, structures, research.levels, research.active !== null);
      if (problem) throw conflict('cannot_research', problem);
      const from = research.levels[tech] ?? 0;
      await this.economy.spend(client, g.id, techCost(tech, from), 'esta pesquisa');
      const mode = await this.economy.modeOf(client, g.id);
      await client.query(
        `INSERT INTO research (governor_id, kingdom_id, tech, level, target_level, started_at, ends_at)
         VALUES ($1, $2, $3, $4::int, $4::int + 1, now(), now() + make_interval(secs => $5::double precision))
         ON CONFLICT (governor_id, tech) DO UPDATE SET target_level = research.level + 1, started_at = now(), ends_at = EXCLUDED.ends_at`,
        [g.id, g.kingdomId, tech, from, techSeconds(tech, from, mode)],
      );
    });
    await this.economy.announceEconomy(g.id);
    await this.announce(g.id);
    return (await this.view(this.db, g.id))!;
  }

  /**
   * Conclui lotes e pesquisas vencidos, um por transação: acerta o saldo até o fim com a
   * manutenção antiga, depois muda o exército ou o nível. `SKIP LOCKED` evita conclusão em dobro.
   */
  async completeDue(kingdomId: number | null = null, limit = 100): Promise<number> {
    let n = 0;
    const due = await this.db.query(
      `SELECT 'training' AS kind, id::text AS key, ends_at FROM training WHERE ends_at <= now() AND ($1::int IS NULL OR kingdom_id = $1)
       UNION ALL
       SELECT 'research', governor_id::text || ':' || tech, ends_at FROM research WHERE target_level IS NOT NULL AND ends_at <= now() AND ($1::int IS NULL OR kingdom_id = $1)
       ORDER BY ends_at LIMIT $2`,
      [kingdomId, limit],
    );
    for (const d of due.rows) {
      const done = await tx(this.db, async (client): Promise<{ governorId: number; done: MilitaryDone } | null> => {
        if (d.kind === 'training') {
          const { rows } = await client.query('SELECT * FROM training WHERE id = $1 AND ends_at <= now() FOR UPDATE SKIP LOCKED', [d.key]);
          const t = rows[0];
          if (!t) return null;
          const governorId = Number(t.governor_id);
          await this.economy.settle(client, governorId, new Date(t.ends_at));
          await client.query(
            `INSERT INTO army (governor_id, unit, amount) VALUES ($1, $2, $3)
             ON CONFLICT (governor_id, unit) DO UPDATE SET amount = army.amount + EXCLUDED.amount`,
            [governorId, t.unit, t.amount],
          );
          await client.query('DELETE FROM training WHERE id = $1', [t.id]);
          return { governorId, done: { kind: 'training', unit: t.unit, amount: t.amount } };
        }
        const [gid, tech] = String(d.key).split(':');
        const { rows } = await client.query(
          'SELECT * FROM research WHERE governor_id = $1 AND tech = $2 AND target_level IS NOT NULL AND ends_at <= now() FOR UPDATE SKIP LOCKED',
          [gid, tech],
        );
        const r = rows[0];
        if (!r) return null;
        const governorId = Number(r.governor_id);
        await this.economy.settle(client, governorId, new Date(r.ends_at));
        await client.query('UPDATE research SET level = target_level, target_level = NULL, started_at = NULL, ends_at = NULL WHERE governor_id = $1 AND tech = $2', [gid, tech]);
        return { governorId, done: { kind: 'research', tech: r.tech, level: r.target_level } };
      });
      if (!done) continue;
      n++;
      await this.refreshPower(done.governorId);
      await this.economy.announceEconomy(done.governorId);
      await this.announce(done.governorId, done.done);
    }
    return n;
  }

  processDue() {
    return this.completeDue(null);
  }
}
