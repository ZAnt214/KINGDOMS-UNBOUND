import { type FlagSpec, inspectFlagImage, parseFlag } from '../../../shared/play/flags.js';
import { cleanNationName, COLOR_EXCLUSION_KM, type GameMode, NATION_COLOR_BY_HEX, NATION_COLORS, nationNameProblem } from '../../../shared/play/rules.js';
import type { FoundInput, NationView, PlaySnapshot } from '../../../shared/play/types.js';
import { distanceKm, START_POINT_BY_ID } from '../../../shared/world/regions.js';
import type { GovernorCtx } from '../auth.js';
import { type Db, type Tx, tx } from '../db.js';
import { bad, conflict, notFound } from '../http.js';
import type { Hub } from '../hub.js';
import type { TerritoryService } from './territory.js';

type Queryable = Pick<Db, 'query'> | Pick<Tx, 'query'>;

const NATION_SQL = `SELECT governor_id, name, color, flag, flag_image_version, (flag_image IS NOT NULL) AS has_image, capital_point, founded_at FROM nations`;

const nationView = (r: any): NationView => ({
  id: Number(r.governor_id),
  name: r.name,
  color: r.color,
  flag: r.flag as FlagSpec,
  flagImage: r.has_image ? r.flag_image_version : null,
  capital: r.capital_point,
  foundedAt: new Date(r.founded_at).getTime(),
});

/**
 * Nações: identidade (nome, cor, bandeira) e fundação no ponto de partida escolhido.
 * A fundação é uma transação única: valida a identidade, reserva o ponto e entrega a região inicial.
 */
export class NationService {
  constructor(
    private db: Db,
    private hub: Hub,
    private territory: TerritoryService,
  ) {}

  async list(kingdomId: number, q: Queryable = this.db): Promise<NationView[]> {
    const { rows } = await q.query(`${NATION_SQL} WHERE kingdom_id = $1 ORDER BY founded_at, governor_id`, [kingdomId]);
    return rows.map(nationView);
  }

  /** Estado completo do mundo do governador. Conclui antes o que já venceu. */
  async snapshot(g: GovernorCtx): Promise<PlaySnapshot> {
    await this.territory.completeDue(g.kingdomId);
    const [world, nations, control, occupations] = await Promise.all([
      this.db.query('SELECT id, name, mode FROM kingdoms WHERE id = $1', [g.kingdomId]),
      this.list(g.kingdomId),
      this.territory.control(g.kingdomId),
      this.territory.occupations(g.kingdomId),
    ]);
    const w = world.rows[0];
    return {
      serverTime: Date.now(),
      world: { id: w.id, name: w.name, mode: w.mode as GameMode },
      me: nations.some((n) => n.id === g.id) ? g.id : null,
      nations,
      control,
      occupations,
    };
  }

  /** Cores que não podem ser escolhidas num ponto: já usadas por nações com capital próxima. */
  async blockedColors(kingdomId: number, pointId: string, q: Queryable = this.db): Promise<string[]> {
    const point = START_POINT_BY_ID[pointId];
    if (!point) return [];
    const { rows } = await q.query('SELECT color, capital_point FROM nations WHERE kingdom_id = $1', [kingdomId]);
    const near = new Set<string>();
    for (const r of rows) {
      const other = START_POINT_BY_ID[r.capital_point];
      if (other && distanceKm(point.at, other.at) < COLOR_EXCLUSION_KM) near.add(r.color);
    }
    // Com todas as cores tomadas por perto a regra deixaria o ponto inutilizável: é dispensada.
    return near.size >= NATION_COLORS.length ? [] : [...near];
  }

  async found(g: GovernorCtx, input: FoundInput): Promise<PlaySnapshot> {
    const point = START_POINT_BY_ID[input.pointId];
    if (!point) throw notFound('Ponto de partida desconhecido.');
    const name = cleanNationName(input.name);
    const nameProblem = nationNameProblem(name);
    if (nameProblem) throw bad('invalid_name', nameProblem);
    const color = input.color.toLowerCase();
    if (!NATION_COLOR_BY_HEX[color]) throw bad('invalid_color', 'Cor fora da paleta.');
    const flag = parseFlag(input.flag);
    if (!flag) throw bad('invalid_flag', 'Bandeira inválida.');

    let image: { bytes: Buffer; type: string } | null = null;
    if (input.flagImage) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.flagImage)) throw bad('invalid_flag_image', 'Imagem inválida.');
      const bytes = Buffer.from(input.flagImage, 'base64');
      const check = inspectFlagImage(bytes);
      if (!check.ok) throw bad('invalid_flag_image', check.reason);
      image = { bytes, type: check.type };
    }

    const nation = await tx(this.db, async (client) => {
      // Fundações do mesmo mundo passam uma de cada vez: ponto, nome e cor são conferidos sem corrida.
      await client.query('SELECT id FROM kingdoms WHERE id = $1 FOR UPDATE', [g.kingdomId]);
      const exists = await client.query('SELECT 1 FROM nations WHERE governor_id = $1', [g.id]);
      if (exists.rowCount) throw conflict('nation_exists', 'Você já fundou sua nação neste mundo.');
      const taken = await client.query('SELECT 1 FROM region_control WHERE kingdom_id = $1 AND region_id = $2', [g.kingdomId, point.region]);
      if (taken.rowCount) throw conflict('region_taken', 'Esta região já pertence a outra nação. Escolha outro ponto.');
      if (await this.territory.contested(client, g.kingdomId, point.region)) {
        throw conflict('region_contested', 'Outra nação está ocupando esta região agora. Escolha outro ponto.');
      }
      const sameName = await client.query('SELECT 1 FROM nations WHERE kingdom_id = $1 AND lower(name) = lower($2)', [g.kingdomId, name]);
      if (sameName.rowCount) throw conflict('name_taken', 'Já existe uma nação com este nome neste mundo.');
      if ((await this.blockedColors(g.kingdomId, point.id, client)).includes(color)) {
        throw conflict('color_taken', 'Uma nação vizinha já usa esta cor. Escolha outra para que as fronteiras fiquem legíveis.');
      }
      const { rows } = await client.query(
        `WITH created AS (
           INSERT INTO nations (governor_id, kingdom_id, name, color, flag, flag_image, flag_image_type, flag_image_version, capital_point)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
         ) ${NATION_SQL.replace('FROM nations', 'FROM created')}`,
        [g.id, g.kingdomId, name, color, JSON.stringify(flag), image?.bytes ?? null, image?.type ?? null, image ? 1 : 0, point.id],
      );
      await this.territory.claim(client, g.kingdomId, point.region, g.id);
      await client.query(
        `INSERT INTO audit_logs (actor_governor_id, action, target_type, target_id, data) VALUES ($1, 'nation.founded', 'region', $2, $3)`,
        [g.id, point.region, { kingdomId: g.kingdomId, point: point.id, color }],
      );
      return nationView(rows[0]);
    });
    this.hub.toKingdom(g.kingdomId, { type: 'play.nation', nation, region: point.region, serverTime: Date.now() });
    return this.snapshot(g);
  }

  /** Imagem de bandeira enviada pelo jogador; só de nações do mesmo mundo de quem pede. */
  async flagImage(kingdomId: number, nationId: number): Promise<{ bytes: Buffer; type: string; version: number } | null> {
    const { rows } = await this.db.query('SELECT flag_image, flag_image_type, flag_image_version FROM nations WHERE governor_id = $1 AND kingdom_id = $2', [
      nationId,
      kingdomId,
    ]);
    const r = rows[0];
    if (!r?.flag_image) return null;
    return { bytes: r.flag_image, type: r.flag_image_type, version: r.flag_image_version };
  }
}
