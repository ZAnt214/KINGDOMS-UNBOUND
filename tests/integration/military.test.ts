import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_FLAG } from '../../shared/play/flags.js';
import { MILITARY, militaryPower, trainSeconds, UNITS } from '../../shared/play/military.js';
import { NATION_COLORS } from '../../shared/play/rules.js';
import { START_POINTS } from '../../shared/world/regions.js';
import type { Db } from '../../server/src/db.js';
import { freePointIn } from '../../server/src/geo.js';
import { Player, resetDb, startServer, type TestPlayer } from './helpers.js';

// Fase D: recrutas, treinamento, pesquisa e poder militar, contra o servidor real e o PostgreSQL.

let db: Db;
let srv: Awaited<ReturnType<typeof startServer>>;
let A: TestPlayer;
let B: TestPlayer;
let aId = 0;

const brasilia = START_POINTS.find((p) => p.id === 'cap-bra-brasilia')!;
const bh = START_POINTS.find((p) => p.id === 'city-bra-belo-horizonte')!;
const state = async (p: TestPlayer) => (await p.get('/play/state')).data;
const finishTraining = () => db.query(`UPDATE training SET started_at = started_at - interval '2 hours', ends_at = now() - interval '1 second' WHERE governor_id = $1`, [aId]);
const finishResearch = () =>
  db.query(`UPDATE research SET started_at = started_at - interval '2 hours', ends_at = now() - interval '1 second' WHERE governor_id = $1 AND target_level IS NOT NULL`, [aId]);
const finishStructures = () =>
  db.query(`UPDATE structures SET started_at = started_at - interval '2 hours', ends_at = now() - interval '1 second' WHERE governor_id = $1 AND target_level IS NOT NULL`, [aId]);

beforeAll(async () => {
  db = await resetDb();
  srv = await startServer(db);
  A = (await Player.create(srv.base, 'General', 1)) as TestPlayer;
  B = (await Player.create(srv.base, 'Vizinho', 1)) as TestPlayer;
  await Promise.all([A, B].map((p) => p.connect()));
  expect((await A.post('/play/found', { pointId: brasilia.id, name: 'Planalto', color: NATION_COLORS[0].hex, flag: DEFAULT_FLAG })).status).toBe(200);
  expect((await B.post('/play/found', { pointId: bh.id, name: 'Gerais', color: NATION_COLORS[7].hex, flag: DEFAULT_FLAG })).status).toBe(200);
  aId = (await state(A)).me;
  await db.query('UPDATE nation_resources SET amount = 50000 WHERE governor_id = $1', [aId]);
});

afterAll(async () => {
  for (const p of [A, B]) p?.close();
  await srv?.close();
  await db?.end();
});

describe('exército progressivo', () => {
  it('nação nova começa com recrutas, sem exército e com poder 0', async () => {
    const s = await state(A);
    expect(s.military.recruits.amount).toBeCloseTo(MILITARY.recruitsStarting, 0);
    expect(s.military.recruits.rate).toBe(MILITARY.recruitBase);
    expect(s.military.army).toEqual({});
    expect(s.military.power.power).toBe(0);
    expect(s.nations.find((n: any) => n.id === aId).power).toBe(0);
  });

  it('sem base militar só treina infantaria, devagar, gastando dinheiro e recrutas', async () => {
    const before = await state(A);
    const res = await A.post('/play/train', { unit: 'infantry', amount: 20 });
    expect(res.status).toBe(200);
    const t = res.data.military.training[0];
    expect(t).toMatchObject({ unit: 'infantry', amount: 20 });
    expect(Math.round((t.endsAt - t.startedAt) / 1000)).toBe(trainSeconds('infantry', 20, [], {}));
    expect(res.data.military.recruits.amount).toBeLessThan(before.military.recruits.amount - 19);
    const money = (await state(A)).economy.amounts.money;
    expect(money).toBeLessThan(50000 - 20 * UNITS.infantry.cost.money! + 1);
    const mech = await A.post('/play/train', { unit: 'mechanized', amount: 5 });
    expect(mech.status).toBe(409);
    expect(mech.data.message).toMatch(/base militar/i);
  });

  it('o segundo lote começa quando o primeiro termina; falta de recrutas é recusada', async () => {
    const second = await A.post('/play/train', { unit: 'infantry', amount: 10 });
    expect(second.status).toBe(200);
    const [first, next] = second.data.military.training;
    expect(next.startedAt).toBe(first.endsAt);
    const tooMany = await A.post('/play/train', { unit: 'infantry', amount: 400 });
    expect(tooMany.status).toBe(409);
    expect(tooMany.data.message).toMatch(/Recrutas insuficientes/);
    expect((await A.post('/play/train', { unit: 'infantry', amount: 0 })).status).toBe(400);
    expect((await A.post('/play/train', { unit: 'missile', amount: 1 })).status).toBe(400);
  });

  it('lotes concluídos entram no exército, cobram manutenção e o poder é avisado a todos', async () => {
    const t0 = Date.now();
    await finishTraining();
    const s = await state(A);
    expect(s.military.army.infantry).toBe(30);
    expect(s.military.training).toHaveLength(0);
    expect(s.economy.upkeep.money).toBe(30 * UNITS.infantry.upkeep.money!);
    const expected = militaryPower({ infantry: 30 }, {}, []).power;
    expect(s.military.power.power).toBe(expected);
    await B.waitFor((e) => e.type === 'play.power' && e.nationId === aId && e.power === expected);
    expect((await state(B)).nations.find((n: any) => n.id === aId).power).toBe(expected);
    // Saldo acertado até o fim do lote antes da manutenção começar.
    const { rows } = await db.query('SELECT max(settled_at) AS at FROM nation_resources WHERE governor_id = $1', [aId]);
    expect(new Date(rows[0].at).getTime()).toBeGreaterThan(t0 - 5000);
  });
});

describe('instalações e pesquisa', () => {
  it('base militar concluída acelera recrutas, libera unidades e soma ao poder', async () => {
    const at = freePointIn(brasilia.region, (await state(A)).structures.map((x: any) => x.at), 40)!;
    expect((await A.post('/play/build', { at, type: 'military_base' })).status).toBe(200);
    await finishStructures();
    const s = await state(A);
    expect(s.military.recruits.rate).toBe(MILITARY.recruitBase + MILITARY.recruitPerBase);
    expect(s.military.power.groups.infrastructure).toBe(MILITARY.infrastructurePerLevel);
    expect(s.nations.find((n: any) => n.id === aId).power).toBe(s.military.power.power);
    expect((await A.post('/play/train', { unit: 'mechanized', amount: 5 })).data.message).toMatch(/Motorização/);
  });

  it('pesquisa exige centro tecnológico; concluída, libera a unidade e reforça o poder', async () => {
    expect((await A.post('/play/research', { tech: 'motorization' })).status).toBe(409);
    const at = freePointIn(brasilia.region, (await state(A)).structures.map((x: any) => x.at), 40)!;
    expect((await A.post('/play/build', { at, type: 'tech' })).status).toBe(200);
    await finishStructures();
    const r = await A.post('/play/research', { tech: 'doctrine' });
    expect(r.status).toBe(200);
    expect(r.data.military.researching).toMatchObject({ tech: 'doctrine', to: 1 });
    expect((await A.post('/play/research', { tech: 'motorization' })).data.message).toMatch(/em andamento/);
    const before = (await state(A)).military.power.groups.troops;
    await finishResearch();
    const s = await state(A);
    expect(s.military.research.doctrine).toBe(1);
    expect(s.military.researching).toBeNull();
    expect(s.military.power.groups.troops).toBe(Math.round(before * 1.1));
    await A.waitFor((e) => e.type === 'play.military' && e.done?.kind === 'research' && e.done.tech === 'doctrine');
    // Motorização liberada pela pesquisa: mecanizados passam a treinar.
    expect((await A.post('/play/research', { tech: 'motorization' })).status).toBe(200);
    await finishResearch();
    await state(A);
    expect((await A.post('/play/train', { unit: 'mechanized', amount: 5 })).status).toBe(200);
  });
});
