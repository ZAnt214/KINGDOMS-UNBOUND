import {
  BUILDINGS,
  BUILDING_TYPES,
  type BuildingLevels,
  type BuildingType,
  CIVILIZATION_BY_ID,
  cityPower,
  productionPerHour,
  RESOURCE_TYPES,
  type ResourceMap,
  RULES_VERSION,
  STARTING_RESOURCES,
  storageCapacity,
  upgradeBlocker,
  upgradeCost,
  upgradeDurationSec,
} from '../../../shared/rules.js';
import { biomeAt, isBuildable } from '../../../shared/terrain.js';
import type { GovernorCtx } from '../auth.js';
import { type Db, type Tx, tx } from '../db.js';
import { bad, conflict, HttpError } from '../http.js';
import type { Hub } from '../hub.js';

interface LockedCity {
  id: number;
  governorId: number;
  kingdomId: number;
  civilization: string;
}

async function lockCity(client: Tx, cityId: number): Promise<LockedCity> {
  const { rows } = await client.query(
    `SELECT c.id, c.governor_id, c.kingdom_id, g.civilization
       FROM cities c JOIN governors g ON g.id = c.governor_id
      WHERE c.id = $1 FOR UPDATE OF c`,
    [cityId],
  );
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Cidade não encontrada.');
  const r = rows[0];
  return { id: r.id, governorId: r.governor_id, kingdomId: r.kingdom_id, civilization: r.civilization };
}

async function getLevels(client: Tx | Db, cityId: number): Promise<BuildingLevels> {
  const { rows } = await client.query('SELECT building_type, level FROM city_buildings WHERE city_id = $1', [cityId]);
  const levels = Object.fromEntries(BUILDING_TYPES.map((t) => [t, 0])) as BuildingLevels;
  for (const r of rows) levels[r.building_type as BuildingType] = r.level;
  return levels;
}

/** Materializa a produção até `until`, com os níveis vigentes nesse intervalo. */
async function settle(client: Tx, city: LockedCity, levels: BuildingLevels, until: Date, ref: string) {
  const rates = productionPerHour(levels, city.civilization);
  const cap = storageCapacity(levels);
  const { rows } = await client.query(
    'SELECT resource, amount, settled_at FROM resource_balances WHERE city_id = $1 FOR UPDATE',
    [city.id],
  );
  for (const r of rows) {
    const settledAt = new Date(r.settled_at);
    if (until <= settledAt) continue;
    const amount = Number(r.amount);
    const hours = (until.getTime() - settledAt.getTime()) / 3_600_000;
    const gain = amount >= cap ? 0 : Math.min(cap - amount, rates[r.resource as keyof ResourceMap] * hours);
    const after = amount + gain;
    await client.query(
      'UPDATE resource_balances SET amount = $3, settled_at = $4, version = version + 1 WHERE city_id = $1 AND resource = $2',
      [city.id, r.resource, after.toFixed(4), until],
    );
    if (gain > 0.0001) {
      await client.query(
        `INSERT INTO resource_ledger (city_id, resource, delta, balance_after, reason, ref, created_at)
         VALUES ($1, $2, $3, $4, 'production', $5, $6)`,
        [city.id, r.resource, gain.toFixed(4), after.toFixed(4), ref, until],
      );
    }
  }
}

export interface CompletedBuild {
  queueId: number;
  building: BuildingType;
  level: number;
}

/** Conclui obras vencidas pelo relógio do servidor. Seguro após reinício/crash. */
async function completeDue(client: Tx, city: LockedCity, now: Date): Promise<CompletedBuild[]> {
  const { rows } = await client.query(
    `SELECT id, building_type, from_level, to_level, ends_at FROM building_queues
      WHERE city_id = $1 AND status = 'active' AND ends_at <= $2 ORDER BY ends_at FOR UPDATE`,
    [city.id, now],
  );
  const done: CompletedBuild[] = [];
  for (const q of rows) {
    const levels = await getLevels(client, city.id);
    await settle(client, city, levels, new Date(q.ends_at), `queue:${q.id}`);
    const upd = await client.query(
      'UPDATE city_buildings SET level = $3 WHERE city_id = $1 AND building_type = $2 AND level = $4',
      [city.id, q.building_type, q.to_level, q.from_level],
    );
    if (upd.rowCount !== 1) throw new Error(`queue ${q.id}: nível inconsistente`);
    await client.query(`UPDATE building_queues SET status = 'done', completed_at = $2 WHERE id = $1`, [q.id, now]);
    levels[q.building_type as BuildingType] = q.to_level;
    await client.query('UPDATE governors SET power = $2 WHERE id = $1', [city.governorId, cityPower(levels)]);
    await client.query(
      `INSERT INTO audit_logs (actor_governor_id, action, target_type, target_id, data)
       VALUES ($1, 'building.completed', 'building_queue', $2, $3)`,
      [city.governorId, String(q.id), { building: q.building_type, level: q.to_level }],
    );
    done.push({ queueId: q.id, building: q.building_type, level: q.to_level });
  }
  return done;
}

export interface CityState {
  cityId: number;
  x: number;
  y: number;
  civilization: string;
  power: number;
  serverTime: number;
  rulesVersion: number;
  levels: BuildingLevels;
  resources: ResourceMap;
  resourcesAt: number;
  ratesPerHour: ResourceMap;
  capacity: number;
  queue: null | {
    id: number;
    building: BuildingType;
    toLevel: number;
    startedAt: number;
    endsAt: number;
  };
}

async function readState(client: Tx, city: LockedCity, now: Date): Promise<CityState> {
  const levels = await getLevels(client, city.id);
  const rates = productionPerHour(levels, city.civilization);
  const cap = storageCapacity(levels);
  const bal = await client.query('SELECT resource, amount, settled_at FROM resource_balances WHERE city_id = $1', [
    city.id,
  ]);
  const resources: ResourceMap = { food: 0, wood: 0, stone: 0, gold: 0 };
  for (const r of bal.rows) {
    const amount = Number(r.amount);
    const hours = Math.max(0, (now.getTime() - new Date(r.settled_at).getTime()) / 3_600_000);
    const res = r.resource as keyof ResourceMap;
    resources[res] = amount >= cap ? amount : Math.min(cap, amount + rates[res] * hours);
  }
  const meta = await client.query(
    'SELECT c.x, c.y, g.power FROM cities c JOIN governors g ON g.id = c.governor_id WHERE c.id = $1',
    [city.id],
  );
  const q = await client.query(
    `SELECT id, building_type, to_level, started_at, ends_at FROM building_queues WHERE city_id = $1 AND status = 'active'`,
    [city.id],
  );
  const qr = q.rows[0];
  return {
    cityId: city.id,
    x: meta.rows[0].x,
    y: meta.rows[0].y,
    civilization: city.civilization,
    power: meta.rows[0].power,
    serverTime: now.getTime(),
    rulesVersion: RULES_VERSION,
    levels,
    resources,
    resourcesAt: now.getTime(),
    ratesPerHour: rates,
    capacity: cap,
    queue: qr
      ? {
          id: qr.id,
          building: qr.building_type,
          toLevel: qr.to_level,
          startedAt: new Date(qr.started_at).getTime(),
          endsAt: new Date(qr.ends_at).getTime(),
        }
      : null,
  };
}

export class CityService {
  constructor(
    private db: Db,
    private hub: Hub,
  ) {}

  /** Cria cidade em posição válida do reino. Chamado dentro da transação de criação do governador. */
  async createCity(client: Tx, governorId: number, kingdomId: number) {
    const k = await client.query('SELECT seed, width, height FROM kingdoms WHERE id = $1', [kingdomId]);
    const { seed, width, height } = k.rows[0];
    let pos: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 400 && !pos; attempt++) {
      const x = 8 + Math.floor(Math.random() * (width - 16));
      const y = 8 + Math.floor(Math.random() * (height - 16));
      if (!isBuildable(biomeAt(x, y, seed, width, height))) continue;
      const near = await client.query(
        'SELECT 1 FROM cities WHERE kingdom_id = $1 AND abs(x - $2) <= 3 AND abs(y - $3) <= 3 LIMIT 1',
        [kingdomId, x, y],
      );
      if (near.rowCount === 0) pos = { x, y };
    }
    if (!pos) throw conflict('kingdom_full', 'Não há espaço livre neste reino. Escolha outro.');
    const city = await client.query('INSERT INTO cities (governor_id, kingdom_id, x, y) VALUES ($1, $2, $3, $4) RETURNING id', [
      governorId,
      kingdomId,
      pos.x,
      pos.y,
    ]);
    const cityId: number = city.rows[0].id;
    const levels = {} as BuildingLevels;
    for (const t of BUILDING_TYPES) {
      levels[t] = BUILDINGS[t].startLevel;
      await client.query('INSERT INTO city_buildings (city_id, building_type, level) VALUES ($1, $2, $3)', [
        cityId,
        t,
        levels[t],
      ]);
    }
    for (const r of RESOURCE_TYPES) {
      await client.query('INSERT INTO resource_balances (city_id, resource, amount, settled_at) VALUES ($1, $2, $3, now())', [
        cityId,
        r,
        STARTING_RESOURCES[r],
      ]);
      await client.query(
        `INSERT INTO resource_ledger (city_id, resource, delta, balance_after, reason) VALUES ($1, $2, $3, $3, 'starting_grant')`,
        [cityId, r, STARTING_RESOURCES[r]],
      );
    }
    await client.query('UPDATE governors SET power = $2 WHERE id = $1', [governorId, cityPower(levels)]);
    return { cityId, ...pos };
  }

  async state(gov: GovernorCtx): Promise<CityState> {
    const { state, completed } = await tx(this.db, async (client) => {
      const city = await lockCity(client, gov.cityId);
      const now = new Date();
      const completed = await completeDue(client, city, now);
      return { state: await readState(client, city, now), completed };
    });
    if (completed.length) await this.announce(gov.id, gov.kingdomId, state);
    return state;
  }

  async upgrade(gov: GovernorCtx, building: BuildingType, idempotencyKey: string) {
    const command = `upgrade:${building}`;
    const result = await tx(this.db, async (client) => {
      const idem = await client.query(
        `INSERT INTO command_idempotency (governor_id, key, command) VALUES ($1, $2, $3)
         ON CONFLICT (governor_id, key) DO NOTHING RETURNING key`,
        [gov.id, idempotencyKey, command],
      );
      if (idem.rowCount === 0) {
        const prev = await client.query('SELECT command, response FROM command_idempotency WHERE governor_id = $1 AND key = $2', [
          gov.id,
          idempotencyKey,
        ]);
        if (prev.rows[0].command !== command) throw conflict('idempotency_mismatch', 'Chave de comando já usada para outra ação.');
        return { replay: true as const, response: prev.rows[0].response };
      }

      const city = await lockCity(client, gov.cityId);
      const now = new Date();
      const completed = await completeDue(client, city, now);
      const active = await client.query(`SELECT 1 FROM building_queues WHERE city_id = $1 AND status = 'active'`, [city.id]);
      if (active.rowCount) throw conflict('queue_busy', 'Já existe uma obra em andamento.');

      const levels = await getLevels(client, city.id);
      const blocker = upgradeBlocker(building, levels);
      if (blocker) throw bad('requirement', blocker);

      await settle(client, city, levels, now, `cmd:${idempotencyKey}`);
      const from = levels[building];
      const cost = upgradeCost(building, from);
      const bal = await client.query('SELECT resource, amount FROM resource_balances WHERE city_id = $1 FOR UPDATE', [city.id]);
      const have = Object.fromEntries(bal.rows.map((r) => [r.resource, Number(r.amount)]));
      for (const r of RESOURCE_TYPES) {
        if ((cost[r] ?? 0) > (have[r] ?? 0)) throw bad('insufficient_resources', 'Recursos insuficientes para esta obra.');
      }
      const duration = upgradeDurationSec(building, from, city.civilization);
      const endsAt = new Date(now.getTime() + duration * 1000);
      const q = await client.query(
        `INSERT INTO building_queues (city_id, building_type, from_level, to_level, cost, rules_version, started_at, ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [city.id, building, from, from + 1, cost, RULES_VERSION, now, endsAt],
      );
      const queueId: number = q.rows[0].id;
      for (const r of RESOURCE_TYPES) {
        const amt = cost[r];
        if (!amt) continue;
        const after = have[r] - amt;
        await client.query('UPDATE resource_balances SET amount = $3, version = version + 1 WHERE city_id = $1 AND resource = $2', [
          city.id,
          r,
          after.toFixed(4),
        ]);
        await client.query(
          `INSERT INTO resource_ledger (city_id, resource, delta, balance_after, reason, ref)
           VALUES ($1, $2, $3, $4, 'build_cost', $5)`,
          [city.id, r, -amt, after.toFixed(4), `queue:${queueId}`],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (actor_governor_id, action, target_type, target_id, data)
         VALUES ($1, 'building.started', 'building_queue', $2, $3)`,
        [gov.id, String(queueId), { building, from, to: from + 1, cost, duration }],
      );
      const state = await readState(client, city, now);
      const response = { queueId, state };
      await client.query('UPDATE command_idempotency SET response = $3 WHERE governor_id = $1 AND key = $2', [
        gov.id,
        idempotencyKey,
        response,
      ]);
      return { replay: false as const, response, completed };
    });
    if (!result.replay) await this.announce(gov.id, gov.kingdomId, result.response.state);
    return { ...result.response, replayed: result.replay };
  }

  private async announce(governorId: number, kingdomId: number, state: CityState) {
    this.hub.toGovernor(governorId, { type: 'city.updated', state });
    const summary = await mapCitySummary(this.db, state.cityId);
    if (summary) this.hub.toKingdom(kingdomId, { type: 'map.city', city: summary });
  }

  /** Worker: conclui obras vencidas mesmo com todos os jogadores offline. */
  async processDue(limit = 50) {
    const { rows } = await this.db.query(
      `SELECT DISTINCT q.city_id, c.governor_id, c.kingdom_id FROM building_queues q JOIN cities c ON c.id = q.city_id
        WHERE q.status = 'active' AND q.ends_at <= now() LIMIT $1`,
      [limit],
    );
    for (const r of rows) {
      const { state, completed } = await tx(this.db, async (client) => {
        const city = await lockCity(client, r.city_id);
        const now = new Date();
        const completed = await completeDue(client, city, now);
        return { state: await readState(client, city, now), completed };
      });
      if (completed.length) await this.announce(r.governor_id, r.kingdom_id, state);
    }
    return rows.length;
  }
}

export interface MapCity {
  cityId: number;
  governorId: number;
  name: string;
  civilization: string;
  power: number;
  x: number;
  y: number;
  hallLevel: number;
  allianceTag: string | null;
  allianceId: number | null;
}

const MAP_CITY_SQL = `
  SELECT c.id AS city_id, g.id AS governor_id, g.name, g.civilization, g.power, c.x, c.y,
         b.level AS hall_level, a.tag, a.id AS alliance_id
    FROM cities c
    JOIN governors g ON g.id = c.governor_id
    JOIN city_buildings b ON b.city_id = c.id AND b.building_type = 'town_hall'
    LEFT JOIN alliance_members m ON m.governor_id = g.id
    LEFT JOIN alliances a ON a.id = m.alliance_id`;

function toMapCity(r: Record<string, any>): MapCity {
  return {
    cityId: r.city_id,
    governorId: r.governor_id,
    name: r.name,
    civilization: r.civilization,
    power: r.power,
    x: r.x,
    y: r.y,
    hallLevel: r.hall_level,
    allianceTag: r.tag ?? null,
    allianceId: r.alliance_id ?? null,
  };
}

export async function mapCitySummary(db: Db, cityId: number): Promise<MapCity | null> {
  const { rows } = await db.query(`${MAP_CITY_SQL} WHERE c.id = $1`, [cityId]);
  return rows[0] ? toMapCity(rows[0]) : null;
}

export async function mapCitiesInArea(db: Db, kingdomId: number, x0: number, y0: number, x1: number, y1: number) {
  const { rows } = await db.query(
    `${MAP_CITY_SQL} WHERE c.kingdom_id = $1 AND c.x BETWEEN $2 AND $4 AND c.y BETWEEN $3 AND $5 ORDER BY c.id LIMIT 2000`,
    [kingdomId, x0, y0, x1, y1],
  );
  return rows.map(toMapCity);
}

export function civilizationExists(id: string) {
  return Boolean(CIVILIZATION_BY_ID[id]);
}
