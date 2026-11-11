import { EXPANSION, expansionSeconds, type GameMode, PLAY_RULES_VERSION } from '../../../shared/play/rules.js';
import type { OccupationView } from '../../../shared/play/types.js';
import { borderingRegion, REGION_BY_ID } from '../../../shared/world/regions.js';
import type { GovernorCtx } from '../auth.js';
import { type Db, type Tx, tx } from '../db.js';
import { conflict, HttpError, notFound } from '../http.js';
import type { Hub } from '../hub.js';

type Queryable = Pick<Db, 'query'> | Pick<Tx, 'query'>;

const occupationView = (r: any): OccupationView => ({
  id: Number(r.id),
  nationId: Number(r.governor_id),
  region: r.region_id,
  from: r.from_region_id,
  startedAt: new Date(r.started_at).getTime(),
  endsAt: new Date(r.ends_at).getTime(),
});

interface Completed {
  kingdomId: number;
  occupationId: number;
  nationId: number;
  region: string;
  at: number;
  ok: boolean;
}

/**
 * Controle territorial: quem é dono de cada região e as ocupações em andamento.
 * Toda regra (vizinhança, região livre, uma operação por vez, duração) é decidida aqui com dados
 * do banco; o cliente só envia a intenção "ocupar a região X".
 */
export class TerritoryService {
  constructor(
    private db: Db,
    private hub: Hub,
  ) {}

  async control(kingdomId: number, q: Queryable = this.db): Promise<[string, number][]> {
    const { rows } = await q.query('SELECT region_id, governor_id FROM region_control WHERE kingdom_id = $1 ORDER BY region_id', [kingdomId]);
    return rows.map((r) => [r.region_id, Number(r.governor_id)]);
  }

  async occupations(kingdomId: number, q: Queryable = this.db): Promise<OccupationView[]> {
    const { rows } = await q.query(
      `SELECT id, governor_id, region_id, from_region_id, started_at, ends_at
         FROM occupations WHERE kingdom_id = $1 AND status = 'active' ORDER BY id`,
      [kingdomId],
    );
    return rows.map(occupationView);
  }

  /** Entrega uma região neutra a uma nação. Devolve false se já tinha dono. */
  async claim(client: Tx, kingdomId: number, regionId: string, governorId: number, at: Date | null = null): Promise<boolean> {
    const done = await client.query(
      `INSERT INTO region_control (kingdom_id, region_id, governor_id, since) VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))
       ON CONFLICT (kingdom_id, region_id) DO NOTHING`,
      [kingdomId, regionId, governorId, at],
    );
    return (done.rowCount ?? 0) > 0;
  }

  /** Há ocupação ativa de outra nação sobre a região? */
  async contested(client: Tx, kingdomId: number, regionId: string): Promise<boolean> {
    const { rowCount } = await client.query(`SELECT 1 FROM occupations WHERE kingdom_id = $1 AND region_id = $2 AND status = 'active'`, [kingdomId, regionId]);
    return (rowCount ?? 0) > 0;
  }

  /** Inicia a ocupação de uma região neutra vizinha. */
  async expand(g: GovernorCtx, regionId: string): Promise<{ occupation: OccupationView; seconds: number }> {
    const target = REGION_BY_ID[regionId];
    if (!target) throw notFound('Região desconhecida.');
    // Conclui o que já venceu antes de validar: a operação anterior libera a vaga na hora certa.
    await this.completeDue(g.kingdomId);
    let created: { occupation: OccupationView; seconds: number };
    try {
      created = await tx(this.db, async (client) => {
        const nation = await client.query('SELECT governor_id FROM nations WHERE governor_id = $1 FOR UPDATE', [g.id]);
        if (!nation.rowCount) throw new HttpError(409, 'no_nation', 'Funde sua nação antes de expandir.');
        const active = await client.query(`SELECT COUNT(*)::int AS n FROM occupations WHERE governor_id = $1 AND status = 'active'`, [g.id]);
        if (active.rows[0].n >= EXPANSION.maxActive) throw conflict('occupation_busy', 'Sua nação já está ocupando uma região. Aguarde a conclusão.');
        const owner = await client.query('SELECT governor_id FROM region_control WHERE kingdom_id = $1 AND region_id = $2', [g.kingdomId, regionId]);
        if (owner.rowCount) {
          throw Number(owner.rows[0].governor_id) === g.id
            ? conflict('region_owned', 'Esta região já é sua.')
            : conflict('region_taken', 'Esta região pertence a outra nação. Ataques ainda não existem no servidor.');
        }
        const mine = await client.query('SELECT region_id FROM region_control WHERE governor_id = $1', [g.id]);
        const owned: string[] = mine.rows.map((r) => r.region_id);
        const from = borderingRegion(owned, regionId);
        if (!from) throw conflict('not_adjacent', 'Só é possível ocupar regiões que fazem fronteira terrestre com o seu território.');
        const mode = (await client.query('SELECT mode FROM kingdoms WHERE id = $1', [g.kingdomId])).rows[0].mode as GameMode;
        const seconds = expansionSeconds(target.area, owned.length, mode);
        const { rows } = await client.query(
          `INSERT INTO occupations (kingdom_id, governor_id, region_id, from_region_id, rules_version, started_at, ends_at)
           VALUES ($1, $2, $3, $4, $5, now(), now() + make_interval(secs => $6::double precision))
           RETURNING id, governor_id, region_id, from_region_id, started_at, ends_at`,
          [g.kingdomId, g.id, regionId, from, PLAY_RULES_VERSION, seconds],
        );
        return { occupation: occupationView(rows[0]), seconds };
      });
    } catch (err) {
      // Índices parciais únicos: outra requisição simultânea ganhou a corrida.
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23505' && e.constraint === 'occupations_one_per_region') throw conflict('region_contested', 'Outra nação já está ocupando esta região.');
      if (e.code === '23505' && e.constraint === 'occupations_one_per_nation') throw conflict('occupation_busy', 'Sua nação já está ocupando uma região. Aguarde a conclusão.');
      throw err;
    }
    this.hub.toKingdom(g.kingdomId, { type: 'play.occupation', occupation: created.occupation, serverTime: Date.now() });
    return created;
  }

  /**
   * Conclui ocupações vencidas pelo relógio do banco. É chamada na leitura do estado, antes de
   * novas ocupações e pelo worker: o resultado não depende de alguém estar conectado nem de um
   * temporizador vivo. `SKIP LOCKED` evita que duas instâncias concluam a mesma ocupação.
   */
  async completeDue(kingdomId: number | null = null, limit = 200): Promise<number> {
    const completed = await tx(this.db, async (client) => {
      const { rows } = await client.query(
        `SELECT id, kingdom_id, governor_id, region_id, ends_at FROM occupations
          WHERE status = 'active' AND ends_at <= now() AND ($1::int IS NULL OR kingdom_id = $1)
          ORDER BY ends_at, id LIMIT $2 FOR UPDATE SKIP LOCKED`,
        [kingdomId, limit],
      );
      const out: Completed[] = [];
      for (const r of rows) {
        const ok = await this.claim(client, r.kingdom_id, r.region_id, Number(r.governor_id), r.ends_at);
        await client.query(`UPDATE occupations SET status = $2, completed_at = ends_at WHERE id = $1`, [r.id, ok ? 'done' : 'failed']);
        out.push({ kingdomId: r.kingdom_id, occupationId: Number(r.id), nationId: Number(r.governor_id), region: r.region_id, at: new Date(r.ends_at).getTime(), ok });
      }
      return out;
    });
    for (const c of completed) {
      this.hub.toKingdom(
        c.kingdomId,
        c.ok
          ? { type: 'play.region', region: c.region, nationId: c.nationId, occupationId: c.occupationId, at: c.at, serverTime: Date.now() }
          : { type: 'play.occupation.failed', occupationId: c.occupationId, region: c.region, nationId: c.nationId, serverTime: Date.now() },
      );
    }
    return completed.length;
  }

  processDue() {
    return this.completeDue(null);
  }
}
