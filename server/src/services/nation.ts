import { type FlagSpec, inspectFlagImage, parseFlag } from '../../../shared/play/flags.js';
import { QUICK } from '../../../shared/play/match.js';
import { cleanNationName, COLOR_EXCLUSION_KM, type GameMode, NATION_COLOR_BY_HEX, NATION_COLORS, nationNameProblem } from '../../../shared/play/rules.js';
import type { FoundInput, NationView, PlaySnapshot, WorldView } from '../../../shared/play/types.js';
import { distanceKm, START_POINT_BY_ID, type StartPoint } from '../../../shared/world/regions.js';
import type { GovernorCtx } from '../auth.js';
import { type Db, type Tx, tx } from '../db.js';
import { bad, conflict, notFound } from '../http.js';
import type { Hub } from '../hub.js';
import type { MilitaryService } from './military.js';
import type { WarService } from './war.js';
import type { DiplomacyService } from './diplomacy.js';
import type { EconomyService } from './economy.js';
import type { TerritoryService } from './territory.js';

type Queryable = Pick<Db, 'query'> | Pick<Tx, 'query'>;

const NATION_SQL = `SELECT n.governor_id, n.name, n.color, n.flag, n.flag_image_version, (n.flag_image IS NOT NULL) AS has_image,
                           n.capital_point, n.founded_at, g.is_bot,
                           (SELECT m.alliance_id FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id AND a.status = 'active'
                             WHERE m.governor_id = n.governor_id) AS alliance_id,
                           COALESCE(mil.power, 0) AS power, COALESCE(mil.troops, 0) AS troops
                      FROM nations n JOIN governors g ON g.id = n.governor_id
                      LEFT JOIN military mil ON mil.governor_id = n.governor_id`;

const nationView = (r: any): NationView => ({
  id: Number(r.governor_id),
  name: r.name,
  color: r.color,
  flag: r.flag as FlagSpec,
  flagImage: r.has_image ? r.flag_image_version : null,
  capital: r.capital_point,
  foundedAt: new Date(r.founded_at).getTime(),
  bot: r.is_bot === true,
  alliance: r.alliance_id === null || r.alliance_id === undefined ? null : Number(r.alliance_id),
  power: Number(r.power ?? 0),
  troops: Number(r.troops ?? 0),
});

export interface NewNation {
  governorId: number;
  kingdomId: number;
  point: StartPoint;
  name: string;
  color: string;
  flag: FlagSpec;
  image?: { bytes: Buffer; type: string } | null;
}

/**
 * Nações: identidade (nome, cor, bandeira) e fundação no ponto de partida escolhido.
 * A fundação é uma transação única: valida a identidade, reserva o ponto, entrega a região inicial
 * e abre o saldo inicial.
 */
export class NationService {
  /** Diplomacia (Fase F), ligada em app.ts. */
  diplomacy: DiplomacyService | null = null;

  constructor(
    private db: Db,
    private hub: Hub,
    private territory: TerritoryService,
    private economy: EconomyService,
    private military: MilitaryService | null = null,
    private war: WarService | null = null,
  ) {}

  async list(kingdomId: number, q: Queryable = this.db): Promise<NationView[]> {
    const { rows } = await q.query(`${NATION_SQL} WHERE n.kingdom_id = $1 ORDER BY n.founded_at, n.governor_id`, [kingdomId]);
    return rows.map(nationView);
  }

  async world(kingdomId: number, q: Queryable = this.db): Promise<WorldView> {
    const [w, results] = await Promise.all([
      q.query('SELECT id, name, mode, arena, ends_at, started_at, finished_at, outcome, winner_governor_id FROM kingdoms WHERE id = $1', [kingdomId]),
      q.query('SELECT governor_id, rank, regions, area FROM match_results WHERE kingdom_id = $1 ORDER BY rank', [kingdomId]),
    ]);
    const r = w.rows[0];
    return {
      id: r.id,
      name: r.name,
      mode: r.mode as GameMode,
      arena: (r.arena as string[] | null) ?? null,
      endsAt: r.ends_at ? new Date(r.ends_at).getTime() : null,
      startedAt: r.started_at ? new Date(r.started_at).getTime() : null,
      finishedAt: r.finished_at ? new Date(r.finished_at).getTime() : null,
      outcome: r.outcome ?? null,
      winner: r.winner_governor_id === null ? null : Number(r.winner_governor_id),
      results: results.rows.map((x) => ({ nationId: Number(x.governor_id), rank: x.rank, regions: x.regions, area: Number(x.area) })),
    };
  }

  /** Estado completo do mundo do governador. Conclui antes o que já venceu. */
  async snapshot(g: GovernorCtx): Promise<PlaySnapshot> {
    await this.territory.completeDue(g.kingdomId);
    await this.economy.completeDue(g.kingdomId);
    await this.military?.completeDue(g.kingdomId);
    await this.war?.completeDue(g.kingdomId);
    const [world, nations, control, occupations, structures] = await Promise.all([
      this.world(g.kingdomId),
      this.list(g.kingdomId),
      this.territory.control(g.kingdomId),
      this.territory.occupations(g.kingdomId),
      this.economy.structures(g.kingdomId),
    ]);
    // Na campanha, quem perdeu todas as regiões volta a escolher um ponto de partida.
    const defeated = world.mode === 'campaign' && !control.some(([, owner]) => owner === g.id);
    const mine = nations.some((n) => n.id === g.id) && !defeated;
    return {
      serverTime: Date.now(),
      world,
      me: mine ? g.id : null,
      nations,
      control,
      occupations,
      structures,
      economy: mine ? await this.economy.view(this.db, g.id) : null,
      military: mine && this.military ? await this.military.view(this.db, g.id) : null,
      operations: this.war ? await this.war.operations(g.kingdomId, mine ? g.id : null) : [],
      strikes: this.war ? await this.war.strikes(g.kingdomId) : [],
      diplomacy: mine && this.diplomacy ? await this.diplomacy.view(this.db, g.id) : null,
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

  /** Cria a nação dentro de uma transação que já travou o mundo. Usado por jogadores e bots. */
  async create(client: Tx, n: NewNation): Promise<NationView> {
    const exists = await client.query('SELECT 1 FROM nations WHERE governor_id = $1', [n.governorId]);
    if (exists.rowCount) {
      // Nação derrotada (perdeu todas as regiões) na campanha: pode fundar de novo; a antiga sai do mundo.
      const left = await client.query('SELECT 1 FROM region_control WHERE governor_id = $1 LIMIT 1', [n.governorId]);
      const mode = (await client.query('SELECT mode FROM kingdoms WHERE id = $1', [n.kingdomId])).rows[0]?.mode;
      if (left.rowCount || mode !== 'campaign') throw conflict('nation_exists', 'Você já fundou sua nação neste mundo.');
      await client.query('DELETE FROM nations WHERE governor_id = $1', [n.governorId]);
    }
    const world = (await client.query('SELECT arena, finished_at FROM kingdoms WHERE id = $1', [n.kingdomId])).rows[0];
    if (world.finished_at) throw conflict('match_over', 'Esta partida já terminou.');
    if (world.arena && !(world.arena as string[]).includes(n.point.region)) throw conflict('outside_arena', 'Este ponto fica fora da área da partida.');
    const taken = await client.query('SELECT 1 FROM region_control WHERE kingdom_id = $1 AND region_id = $2', [n.kingdomId, n.point.region]);
    if (taken.rowCount) throw conflict('region_taken', 'Esta região já pertence a outra nação. Escolha outro ponto.');
    if (await this.territory.contested(client, n.kingdomId, n.point.region)) {
      throw conflict('region_contested', 'Outra nação está ocupando esta região agora. Escolha outro ponto.');
    }
    const sameName = await client.query('SELECT 1 FROM nations WHERE kingdom_id = $1 AND lower(name) = lower($2)', [n.kingdomId, n.name]);
    if (sameName.rowCount) throw conflict('name_taken', 'Já existe uma nação com este nome neste mundo.');
    if ((await this.blockedColors(n.kingdomId, n.point.id, client)).includes(n.color)) {
      throw conflict('color_taken', 'Uma nação vizinha já usa esta cor. Escolha outra para que as fronteiras fiquem legíveis.');
    }
    const { rows } = await client.query(
      `INSERT INTO nations (governor_id, kingdom_id, name, color, flag, flag_image, flag_image_type, flag_image_version, capital_point)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING governor_id`,
      [n.governorId, n.kingdomId, n.name, n.color, JSON.stringify(n.flag), n.image?.bytes ?? null, n.image?.type ?? null, n.image ? 1 : 0, n.point.id],
    );
    await this.territory.claim(client, n.kingdomId, n.point.region, n.governorId);
    await this.economy.init(client, n.governorId);
    const view = await client.query(`${NATION_SQL} WHERE n.governor_id = $1`, [rows[0].governor_id]);
    return nationView(view.rows[0]);
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
      const created = await this.create(client, { governorId: g.id, kingdomId: g.kingdomId, point, name, color, flag, image });
      // Partida rápida: começa quando o jogador funda a nação (sem prazo de fim: vence a conquista total).
      await client.query(`UPDATE kingdoms SET started_at = now() WHERE id = $1 AND mode = 'quick' AND started_at IS NULL`, [g.kingdomId]);
      await client.query(
        `INSERT INTO audit_logs (actor_governor_id, action, target_type, target_id, data) VALUES ($1, 'nation.founded', 'region', $2, $3)`,
        [g.id, point.region, { kingdomId: g.kingdomId, point: point.id, color }],
      );
      return created;
    });
    this.hub.toKingdom(g.kingdomId, { type: 'play.nation', nation, region: point.region, serverTime: Date.now() });
    this.hub.toKingdom(g.kingdomId, { type: 'play.match', world: await this.world(g.kingdomId), serverTime: Date.now() });
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
