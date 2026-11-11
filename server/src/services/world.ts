import { COUNTRIES, COUNTRY_BY_CODE, INITIAL_CONTROL, WORLD_BLOCS, WORLD_SYSTEMS } from '../../../shared/world/index.js';
import type { GovernorCtx } from '../auth.js';
import type { Db } from '../db.js';
import { bad, conflict, notFound } from '../http.js';
import type { Hub } from '../hub.js';

export interface WorldSnapshot {
  serverTime: number;
  myBlocId: number | null;
  blocs: { id: number; key: string; name: string; color: string; territories: number; members: number }[];
  territories: { code: string; blocId: number | null; version: number }[];
  wars: { id: number; attackerBlocId: number; defenderBlocId: number; theater: string; countryCode: string | null; startedAt: number }[];
  systems: Record<keyof typeof WORLD_SYSTEMS, boolean>;
}

/**
 * Estado geopolítico de cada reino: blocos, controle dos países e guerras.
 * O servidor é a única fonte de quem controla cada território; o cliente só lê e desenha.
 */
export class WorldService {
  constructor(
    private db: Db,
    private hub: Hub,
  ) {}

  async snapshot(g: GovernorCtx): Promise<WorldSnapshot> {
    const [me, blocs, territories, wars] = await Promise.all([
      this.db.query<{ bloc_id: number | null }>('SELECT bloc_id FROM governors WHERE id = $1', [g.id]),
      this.db.query(
        `SELECT b.id, b.key, b.name, b.color,
                (SELECT COUNT(*)::int FROM world_territories t WHERE t.bloc_id = b.id) AS territories,
                (SELECT COUNT(*)::int FROM governors gv WHERE gv.bloc_id = b.id) AS members
           FROM world_blocs b WHERE b.kingdom_id = $1 ORDER BY b.position, b.id`,
        [g.kingdomId],
      ),
      this.db.query('SELECT country_code, bloc_id, version FROM world_territories WHERE kingdom_id = $1 ORDER BY country_code', [g.kingdomId]),
      this.db.query(
        `SELECT id, attacker_bloc_id, defender_bloc_id, theater, country_code, started_at
           FROM world_wars WHERE kingdom_id = $1 AND ended_at IS NULL ORDER BY started_at`,
        [g.kingdomId],
      ),
    ]);
    return {
      serverTime: Date.now(),
      myBlocId: me.rows[0]?.bloc_id ?? null,
      blocs: blocs.rows.map((r) => ({ id: r.id, key: r.key, name: r.name, color: r.color, territories: r.territories, members: r.members })),
      territories: territories.rows.map((r) => ({ code: r.country_code, blocId: r.bloc_id, version: r.version })),
      wars: wars.rows.map((r) => ({
        id: Number(r.id),
        attackerBlocId: r.attacker_bloc_id,
        defenderBlocId: r.defender_bloc_id,
        theater: r.theater,
        countryCode: r.country_code,
        startedAt: new Date(r.started_at).getTime(),
      })),
      systems: { ...WORLD_SYSTEMS },
    };
  }

  /** Alistamento do governador em um bloco do próprio reino. Escolha única nesta versão. */
  async enlist(g: GovernorCtx, blocId: number): Promise<WorldSnapshot> {
    const bloc = await this.db.query('SELECT 1 FROM world_blocs WHERE id = $1 AND kingdom_id = $2', [blocId, g.kingdomId]);
    if (!bloc.rowCount) throw notFound('Bloco não encontrado neste reino.');
    const done = await this.db.query('UPDATE governors SET bloc_id = $1 WHERE id = $2 AND bloc_id IS NULL', [blocId, g.id]);
    if (!done.rowCount) throw conflict('already_enlisted', 'Você já pertence a um bloco.');
    this.hub.toKingdom(g.kingdomId, { type: 'world.updated', serverTime: Date.now() });
    return this.snapshot(g);
  }

  /**
   * Troca o controlador de um território. Não é exposta por rota: será chamada pelos sistemas
   * autoritativos de combate e diplomacia quando existirem. Publica a mudança para o reino.
   */
  async setControl(kingdomId: number, countryCode: string, blocId: number | null): Promise<void> {
    if (!COUNTRY_BY_CODE[countryCode]) throw bad('unknown_country', 'País desconhecido.');
    if (blocId !== null) {
      const bloc = await this.db.query('SELECT 1 FROM world_blocs WHERE id = $1 AND kingdom_id = $2', [blocId, kingdomId]);
      if (!bloc.rowCount) throw notFound('Bloco não encontrado neste reino.');
    }
    const done = await this.db.query(
      `UPDATE world_territories SET bloc_id = $3, version = version + 1, updated_at = now()
        WHERE kingdom_id = $1 AND country_code = $2 AND bloc_id IS DISTINCT FROM $3`,
      [kingdomId, countryCode, blocId],
    );
    if (done.rowCount) this.hub.toKingdom(kingdomId, { type: 'world.updated', serverTime: Date.now() });
  }
}

/** Cenário inicial de cada reino (idempotente): blocos e distribuição dos países. */
export async function seedGeopolitics(db: Db) {
  await db.query(
    `INSERT INTO world_blocs (kingdom_id, key, name, color, position)
     SELECT k.id, b.key, b.name, b.color, b.position
       FROM kingdoms k CROSS JOIN unnest($1::text[], $2::text[], $3::text[], $4::int[]) AS b(key, name, color, position)
     ON CONFLICT (kingdom_id, key) DO NOTHING`,
    [WORLD_BLOCS.map((b) => b.key), WORLD_BLOCS.map((b) => b.name), WORLD_BLOCS.map((b) => b.color), WORLD_BLOCS.map((_, i) => i)],
  );
  const blocOf: Record<string, string> = {};
  for (const [key, codes] of Object.entries(INITIAL_CONTROL)) for (const code of codes) blocOf[code] = key;
  await db.query(
    `INSERT INTO world_territories (kingdom_id, country_code, bloc_id)
     SELECT k.id, t.code, b.id
       FROM kingdoms k CROSS JOIN unnest($1::text[], $2::text[]) AS t(code, bloc_key)
       LEFT JOIN world_blocs b ON b.kingdom_id = k.id AND b.key = t.bloc_key
     ON CONFLICT (kingdom_id, country_code) DO NOTHING`,
    [COUNTRIES.map((c) => c.code), COUNTRIES.map((c) => blocOf[c.code] ?? null)],
  );
}
