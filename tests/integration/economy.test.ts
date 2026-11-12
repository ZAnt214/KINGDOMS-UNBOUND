import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeEconomy, ECONOMY, expansionCost, project, structureCost, structureSeconds } from '../../shared/play/economy.js';
import { DEFAULT_FLAG } from '../../shared/play/flags.js';
import { NATION_COLORS } from '../../shared/play/rules.js';
import { REGION_BY_ID, START_POINTS } from '../../shared/world/regions.js';
import type { Db } from '../../server/src/db.js';
import { freePointIn, regionContains } from '../../server/src/geo.js';
import { Player, resetDb, startServer, type TestPlayer } from './helpers.js';

let db: Db;
let srv: Awaited<ReturnType<typeof startServer>>;
let A: TestPlayer;
let B: TestPlayer;

const inland = START_POINTS.find((p) => p.id === 'cap-bra-brasilia')!; // Goiás, sem litoral
const coastal = START_POINTS.find((p) => p.id === 'city-bra-rio-de-janeiro')!;
const found = (p: TestPlayer, pointId: string, name: string, color: string) => p.post('/play/found', { pointId, name, color, flag: DEFAULT_FLAG });
const state = async (p: TestPlayer) => (await p.get('/play/state')).data;
const money = async (p: TestPlayer) => {
  const e = (await state(p)).economy;
  return project(e.amounts, e.settledAt, e.rates, e.capacity, Date.now()).money;
};
const P1 = inland.at;
const P2 = () => freePointIn(inland.region, [P1], 60)!;
const due = (id: number) => db.query(`UPDATE structures SET started_at = started_at - interval '1 hour', ends_at = now() - interval '1 second' WHERE id = $1`, [id]);

beforeAll(async () => {
  db = await resetDb();
  srv = await startServer(db);
  A = (await Player.create(srv.base, 'Eco', 1)) as TestPlayer;
  B = (await Player.create(srv.base, 'Mar', 1)) as TestPlayer;
  await Promise.all([A, B].map((p) => p.connect()));
  expect((await found(A, inland.id, 'Cerrado', NATION_COLORS[0].hex)).status).toBe(200);
  expect((await found(B, coastal.id, 'Guanabara', NATION_COLORS[7].hex)).status).toBe(200);
});

afterAll(async () => {
  for (const p of [A, B]) p?.close();
  await srv?.close();
  await db?.end();
});

describe('economia', () => {
  it('a nação começa com o saldo inicial e a produção do território', async () => {
    const s = await state(A);
    expect(s.economy.amounts).toEqual(ECONOMY.starting);
    const expected = computeEconomy({ regions: [inland.region], capitalRegion: inland.region, structures: [] });
    expect(s.economy.rates).toEqual(expected.rates);
    expect(s.economy.energy).toEqual({ supply: ECONOMY.territory.capitalEnergy, demand: 0 });
    expect(s.structures).toEqual([]);
    // Economia é privada: o outro jogador não recebe a de A.
    expect((await state(B)).economy.amounts).toEqual(ECONOMY.starting);
  });

  it('constrói: desconta o custo do servidor uma vez e ignora valores do cliente', async () => {
    const before = await money(A);
    B.events.length = 0;
    expect(regionContains(inland.region, P1[0], P1[1])).toBe(true);
    const r = await A.post('/play/build', { at: P1, type: 'city', region: coastal.region, cost: {}, level: 5, endsAt: 0 });
    expect(r.status).toBe(200);
    // A região vem do ponto, não da sugestão do cliente.
    expect(r.data.structure).toMatchObject({ region: inland.region, type: 'city', level: 0, at: P1, building: { to: 1 } });
    const b = r.data.structure.building;
    expect(b.endsAt - b.startedAt).toBe(structureSeconds('city', 0) * 1000);
    expect(await money(A)).toBeCloseTo(before - structureCost('city', 0).money!, -1);
    // Todo o mundo vê o canteiro de obras no mapa.
    await B.waitFor((e) => e.type === 'play.structure' && e.structure.id === r.data.structure.id && !e.completed);
  });

  it('recusa construção inválida sem cobrar nada', async () => {
    const before = await money(A);
    expect((await A.post('/play/build', { at: [P1[0] + 0.05, P1[1]], type: 'depot' })).data.error).toBe('too_close');
    expect((await A.post('/play/build', { at: P2(), type: 'port' })).data.error).toBe('cannot_build');
    expect((await A.post('/play/build', { at: coastal.at, type: 'depot' })).data.error).toBe('not_owner');
    expect((await A.post('/play/build', { at: [-30, -20], type: 'depot' })).data.error).toBe('not_owner');
    expect((await A.post('/play/build', { at: P2(), type: 'castelo' })).status).toBe(400);
    expect((await A.post('/play/build', { at: [500, 0], type: 'city' })).status).toBe(400);
    expect((await B.post('/play/build', { at: coastal.at, type: 'port' })).status).toBe(200);
    expect(await money(A)).toBeCloseTo(before, -1);
  });

  it('limita obras simultâneas e recusa sem recursos', async () => {
    const p2 = P2();
    expect((await A.post('/play/build', { at: p2, type: 'depot' })).status).toBe(200);
    const third = await A.post('/play/build', { at: freePointIn(inland.region, [P1, p2], 60), type: 'factory' });
    expect(third.data.error).toBe('cannot_build');
    expect(third.data.message).toMatch(/obras em andamento/);
    await db.query(`UPDATE nation_resources SET amount = 0, settled_at = now() WHERE governor_id = $1`, [B.governor.id]);
    const poor = await B.post('/play/build', { at: freePointIn(coastal.region, [coastal.at], 40), type: 'city' });
    expect(poor.status).toBe(409);
    expect(poor.data.error).toBe('insufficient');
    expect((await db.query('SELECT COUNT(*)::int AS n FROM structures WHERE governor_id = $1', [B.governor.id])).rows[0].n).toBe(1);
  });

  it('obra vencida conclui pelo worker, sem requisição, e a produção sobe', async () => {
    const city = (await state(A)).structures.find((s: any) => s.type === 'city');
    const before = (await state(A)).economy.rates.money;
    A.events.length = 0;
    B.events.length = 0;
    await due(city.id);
    await B.waitFor((e) => e.type === 'play.structure' && e.completed && e.structure.id === city.id, 5000);
    const eco = await A.waitFor((e) => e.type === 'play.economy' && e.economy.rates.money > before, 5000);
    expect(eco.economy.energy.demand).toBe(1);
    const after = (await state(A)).structures.find((s: any) => s.id === city.id);
    expect(after).toMatchObject({ level: 1, building: null });
  });

  it('saldo acumula pelo tempo do servidor até a capacidade', async () => {
    const s = await state(A);
    const rate = s.economy.rates.money;
    // Simula meia hora sem ninguém conectado.
    await db.query(`UPDATE nation_resources SET amount = 0, settled_at = now() - interval '30 minutes' WHERE governor_id = $1`, [A.governor.id]);
    const cost = structureCost('city', 1).money!;
    const up = await A.post('/play/upgrade', { structureId: s.structures.find((x: any) => x.type === 'city').id });
    expect(up.status).toBe(200);
    const left = await db.query(`SELECT amount::float8 AS a FROM nation_resources WHERE governor_id = $1 AND resource = 'money'`, [A.governor.id]);
    expect(left.rows[0].a).toBeGreaterThan(rate * 0.5 - cost - 20);
    expect(left.rows[0].a).toBeLessThan(rate * 0.5 - cost + 20);
    // Capacidade: dez horas depois o saldo para no teto.
    await db.query(`UPDATE nation_resources SET amount = 0, settled_at = now() - interval '10 hours' WHERE governor_id = $1`, [A.governor.id]);
    await db.query('UPDATE structures SET ends_at = now() - interval \'1 second\' WHERE governor_id = $1 AND target_level IS NOT NULL', [A.governor.id]);
    await srv.services.economy.completeDue(1);
    const capped = await db.query(`SELECT amount::float8 AS a FROM nation_resources WHERE governor_id = $1 AND resource = 'money'`, [A.governor.id]);
    expect(capped.rows[0].a).toBeLessThanOrEqual(ECONOMY.baseCapacity + 3000 * 1 + 1);
  });

  it('melhoria: uma por vez, só do dono, até o nível máximo', async () => {
    const city = (await state(A)).structures.find((s: any) => s.type === 'city');
    expect(city.level).toBe(2);
    const burst = await Promise.all([1, 2, 3].map(() => A.post('/play/upgrade', { structureId: city.id })));
    expect(burst.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await B.post('/play/upgrade', { structureId: city.id })).status).toBe(404);
    await db.query(`UPDATE structures SET level = $2, target_level = NULL, started_at = NULL, ends_at = NULL WHERE id = $1`, [city.id, ECONOMY.maxLevel]);
    expect((await A.post('/play/upgrade', { structureId: city.id })).data.message).toMatch(/Nível máximo/);
  });

  it('expandir agora custa recursos', async () => {
    await db.query(`UPDATE nation_resources SET amount = 5000, settled_at = now() WHERE governor_id = $1`, [A.governor.id]);
    const target = REGION_BY_ID[inland.region].neighbors.find((n) => !START_POINTS.some((p) => p.region === n))!;
    const r = await A.post('/play/expand', { region: target });
    expect(r.status).toBe(200);
    const m = await db.query(`SELECT amount::float8 AS a FROM nation_resources WHERE governor_id = $1 AND resource = 'money'`, [A.governor.id]);
    expect(m.rows[0].a).toBeCloseTo(5000 - expansionCost(1).money!, -1);
    await db.query(`UPDATE nation_resources SET amount = 0, settled_at = now() WHERE governor_id = $1`, [B.governor.id]);
    const other = REGION_BY_ID[coastal.region].neighbors.find((n) => n !== target && !START_POINTS.some((p) => p.region === n))!;
    expect((await B.post('/play/expand', { region: other })).data.error).toBe('insufficient');
  });
});
