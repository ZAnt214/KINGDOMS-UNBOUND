import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeEconomy } from '../../shared/play/economy.js';
import { DEFAULT_FLAG } from '../../shared/play/flags.js';
import { LOGISTICS } from '../../shared/play/logistics.js';
import { NATION_COLORS } from '../../shared/play/rules.js';
import { distanceKm, START_POINTS } from '../../shared/world/regions.js';
import type { Db } from '../../server/src/db.js';
import { regionContains } from '../../server/src/geo.js';
import { Player, resetDb, startServer, type TestPlayer } from './helpers.js';

// Fase C: ferrovias automáticas e conexões entre aliados, contra o servidor real e o PostgreSQL.

let db: Db;
let srv: Awaited<ReturnType<typeof startServer>>;
let A: TestPlayer;
let B: TestPlayer;

const brasilia = START_POINTS.find((p) => p.id === 'cap-bra-brasilia')!; // Goiás
const bh = START_POINTS.find((p) => p.id === 'city-bra-belo-horizonte')!; // Minas Gerais, vizinha de Goiás
const found = (p: TestPlayer, pointId: string, name: string, color: string) => p.post('/play/found', { pointId, name, color, flag: DEFAULT_FLAG });
const state = async (p: TestPlayer) => (await p.get('/play/state')).data;
const finish = async (id: number) => {
  await db.query(`UPDATE structures SET started_at = started_at - interval '1 hour', ends_at = now() - interval '1 second' WHERE id = $1`, [id]);
};
const settledAt = async (governorId: number) => {
  const { rows } = await db.query('SELECT max(settled_at) AS at FROM nation_resources WHERE governor_id = $1', [governorId]);
  return new Date(rows[0].at).getTime();
};
const giveResources = (governorId: number) => db.query(`UPDATE nation_resources SET amount = 50000 WHERE governor_id = $1`, [governorId]);

/** Dois pontos reais, um em cada região, a menos de 150 km um do outro (perto da divisa). */
function borderPair(a: string, b: string): [[number, number], [number, number]] {
  for (let lat = -14; lat >= -20; lat -= 0.25) {
    for (let lon = -52; lon <= -45; lon += 0.25) {
      if (!regionContains(a, lon, lat)) continue;
      for (const [dx, dy] of [[0.6, 0], [0, -0.6], [0.6, -0.6], [-0.6, -0.6], [0.9, 0], [0, -0.9]]) {
        const q: [number, number] = [lon + dx, lat + dy];
        if (regionContains(b, q[0], q[1]) && distanceKm([lon, lat], q) < 150) return [[lon, lat], q];
      }
    }
  }
  throw new Error('sem par de pontos na divisa');
}

const [GO_EDGE, MG_EDGE] = borderPair(brasilia.region, bh.region);
const GO_EDGE_2: [number, number] = [GO_EDGE[0] - 0.8, GO_EDGE[1] + 0.3];

let aId = 0;
let bId = 0;
let factoryId = 0;

beforeAll(async () => {
  db = await resetDb();
  srv = await startServer(db);
  A = (await Player.create(srv.base, 'Trilho', 1)) as TestPlayer;
  B = (await Player.create(srv.base, 'Minas', 1)) as TestPlayer;
  await Promise.all([A, B].map((p) => p.connect()));
  expect((await found(A, brasilia.id, 'Planalto', NATION_COLORS[0].hex)).status).toBe(200);
  expect((await found(B, bh.id, 'Gerais', NATION_COLORS[7].hex)).status).toBe(200);
  const s = await state(A);
  aId = s.me;
  bId = (await state(B)).me;
  await giveResources(aId);
  await giveResources(bId);
});

afterAll(async () => {
  for (const p of [A, B]) p?.close();
  await srv?.close();
  await db?.end();
});

describe('ferrovias automáticas', () => {
  it('duas construções próximas ligam sozinhas ao concluir, e a produção do servidor inclui o bônus', async () => {
    expect(regionContains(brasilia.region, GO_EDGE_2[0], GO_EDGE_2[1])).toBe(true);
    const f = await A.post('/play/build', { at: GO_EDGE, type: 'factory' });
    expect(f.status).toBe(200);
    factoryId = f.data.structure.id;
    const c = await A.post('/play/build', { at: GO_EDGE_2, type: 'city' });
    expect(c.status).toBe(200);
    await finish(factoryId);
    await state(A);
    // Uma construção sozinha não tem trecho.
    expect((await state(A)).economy.logistics).toMatchObject({ links: 0, connected: 0 });
    await finish(c.data.structure.id);
    const s = await state(A);
    expect(s.economy.logistics).toMatchObject({ links: 1, allyLinks: 0, connected: 2 });
    expect(s.economy.logistics.averageBonus).toBeCloseTo(LOGISTICS.linkBonus, 6);
    // Mesma conta, feita pela função compartilhada a partir do estado: o cliente desenha o que o servidor paga.
    const mine = s.structures.filter((x: any) => x.nationId === aId);
    const expected = computeEconomy({
      regions: s.control.filter(([, o]: [string, number]) => o === aId).map(([r]: [string, number]) => r),
      capitalRegion: brasilia.region,
      structures: mine.map((x: any) => ({ id: x.id, type: x.type, level: x.level, region: x.region, at: x.at })),
    });
    expect(s.economy.rates).toEqual(expected.rates);
    const noRail = computeEconomy({
      regions: [brasilia.region],
      capitalRegion: brasilia.region,
      structures: mine.map((x: any) => ({ type: x.type, level: x.level, region: x.region })),
    });
    expect(s.economy.rates.materials > noRail.rates.materials).toBe(true);
  });
});

describe('conexões entre aliados', () => {
  it('entrar na aliança acerta o saldo dos dois antes e avisa a nação nova da aliança a todos', async () => {
    const created = await A.post('/alliances', { name: 'Ferrovia Central', tag: 'FCT' });
    expect(created.status).toBe(200);
    await B.waitFor((e) => e.type === 'play.alliance' && e.nationId === aId && e.alliance === created.data.allianceId);
    // Cidade de B na divisa, concluída antes da aliança: ainda sem conexão com A.
    const city = await B.post('/play/build', { at: MG_EDGE, type: 'city' });
    expect(city.status).toBe(200);
    await finish(city.data.structure.id);
    expect((await state(B)).economy.logistics.allyLinks).toBe(0);
    const ap = await B.post(`/alliances/${created.data.allianceId}/apply`, {});
    const t0 = Date.now();
    A.events.length = 0;
    expect((await A.post(`/alliance/applications/${ap.data.applicationId}/approve`)).status).toBe(200);
    // Saldos acertados no instante da mudança (com a produção antiga) e economia nova avisada.
    expect((await settledAt(aId)) >= t0 - 1000).toBe(true);
    expect((await settledAt(bId)) >= t0 - 1000).toBe(true);
    await A.waitFor((e) => e.type === 'play.economy' && e.economy.logistics.allyLinks === 1);
    await A.waitFor((e) => e.type === 'play.alliance' && e.nationId === bId);
    const sa = await state(A);
    expect(sa.nations.find((n: any) => n.id === bId).alliance).toBe(created.data.allianceId);
    const sb = await state(B);
    expect(sb.economy.logistics.allyLinks).toBe(1);
    // A produção de A bate com a função compartilhada incluindo a cidade aliada.
    const mine = sa.structures.filter((x: any) => x.nationId === aId);
    const allied = sa.structures.filter((x: any) => x.nationId === bId && x.level > 0);
    const expected = computeEconomy({
      regions: [brasilia.region],
      capitalRegion: brasilia.region,
      structures: mine.map((x: any) => ({ id: x.id, type: x.type, level: x.level, region: x.region, at: x.at })),
      allied: allied.map((x: any) => ({ id: x.id, nation: bId, type: x.type, level: x.level, region: x.region, at: x.at })),
    });
    expect(sa.economy.rates).toEqual(expected.rates);
  });

  it('sair da aliança desfaz a conexão e acerta o saldo antes', async () => {
    const t0 = Date.now();
    expect((await B.post('/alliance/leave')).status).toBe(200);
    expect((await settledAt(aId)) >= t0 - 1000).toBe(true);
    expect((await state(A)).economy.logistics.allyLinks).toBe(0);
    expect((await state(B)).nations.find((n: any) => n.id === bId).alliance).toBeNull();
  });
});
