import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_FLAG } from '../../shared/play/flags.js';
import { NATION_COLORS } from '../../shared/play/rules.js';
import { garrison, interceptRoll, WAR } from '../../shared/play/war.js';
import { REGION_BY_ID, REGIONS, START_POINTS } from '../../shared/world/regions.js';
import type { Db } from '../../server/src/db.js';
import { Player, resetDb, startServer, type TestPlayer } from './helpers.js';

// Fase E: ataque terrestre, reforço, conquista, mísseis e interceptação, contra o servidor real e o PostgreSQL.

let db: Db;
let srv: Awaited<ReturnType<typeof startServer>>;
let A: TestPlayer;
let B: TestPlayer;
let aId = 0;
let bId = 0;

const brasilia = START_POINTS.find((p) => p.id === 'cap-bra-brasilia')!; // Goiás
const bh = START_POINTS.find((p) => p.id === 'city-bra-belo-horizonte')!; // Minas Gerais (capital de B)
// Região de B que faz fronteira com Goiás e não é a capital dele.
const FRONT = REGION_BY_ID[brasilia.region].neighbors.find((n) => n !== bh.region && REGION_BY_ID[n].country === 'BRA')!;
const FAR = REGIONS.find((r) => r.country === 'JPN')!.id;
const state = async (p: TestPlayer) => (await p.get('/play/state')).data;
const setArmy = async (gid: number, unit: string, amount: number) =>
  db.query('INSERT INTO army (governor_id, unit, amount) VALUES ($1, $2, $3) ON CONFLICT (governor_id, unit) DO UPDATE SET amount = $3', [gid, unit, amount]);
const addStructure = async (gid: number, region: string, type: string, level: number) =>
  (
    await db.query(
      `INSERT INTO structures (kingdom_id, governor_id, region_id, type, level, rules_version, lon, lat) VALUES (1, $1, $2, $3, $4, 1, $5, $6) RETURNING id`,
      [gid, region, type, level, REGION_BY_ID[region].at[0], REGION_BY_ID[region].at[1]],
    )
  ).rows[0].id as string;

/** Adianta a operação para o fim previsto, mantendo os acontecimentos no mesmo lugar da batalha. */
async function fastForward(opId: number) {
  const { rows } = await db.query('SELECT started_at, ends_at, events FROM operations WHERE id = $1', [opId]);
  const shift = new Date(rows[0].ends_at).getTime() - Date.now() + 1000;
  const events = (rows[0].events as { at: number }[]).map((e) => ({ ...e, at: e.at - shift }));
  await db.query(
    `UPDATE operations SET started_at = started_at - make_interval(secs => $2::double precision), ends_at = ends_at - make_interval(secs => $2::double precision), events = $3 WHERE id = $1`,
    [opId, shift / 1000, JSON.stringify(events)],
  );
}

beforeAll(async () => {
  db = await resetDb();
  srv = await startServer(db);
  A = (await Player.create(srv.base, 'Atacante', 1)) as TestPlayer;
  B = (await Player.create(srv.base, 'Defensor', 1)) as TestPlayer;
  await Promise.all([A, B].map((p) => p.connect()));
  expect((await A.post('/play/found', { pointId: brasilia.id, name: 'Planalto', color: NATION_COLORS[0].hex, flag: DEFAULT_FLAG })).status).toBe(200);
  expect((await B.post('/play/found', { pointId: bh.id, name: 'Gerais', color: NATION_COLORS[7].hex, flag: DEFAULT_FLAG })).status).toBe(200);
  aId = (await state(A)).me;
  bId = (await state(B)).me;
  await db.query('INSERT INTO region_control (kingdom_id, region_id, governor_id) VALUES (1, $1, $2), (1, $3, $2)', [FRONT, bId, FAR]);
  await db.query('UPDATE nation_resources SET amount = 50000');
  await setArmy(aId, 'infantry', 200);
  await setArmy(bId, 'infantry', 20);
});

afterAll(async () => {
  for (const p of [A, B]) p?.close();
  await srv?.close();
  await db?.end();
});

describe('ataque terrestre', () => {
  let opId = 0;
  let frontStructure = '';

  it('recusa porcentagem abaixo de 25%, a capital e regiões sem fronteira', async () => {
    expect((await A.post('/play/attack', { region: FRONT, percent: 10 })).status).toBe(400);
    expect((await A.post('/play/attack', { region: bh.region, percent: 50 })).data.code).toBe('capital');
    expect((await A.post('/play/attack', { region: FAR, percent: 50 })).data.code).toBe('not_adjacent');
    expect((await A.post('/play/attack', { region: brasilia.region, percent: 50 })).data.code).toBe('not_enemy');
  });

  it('inicia a operação: tropas saem dos dois lados e o defensor é avisado', async () => {
    frontStructure = await addStructure(bId, FRONT, 'city', 2);
    const res = await A.post('/play/attack', { region: FRONT, percent: 50 });
    expect(res.status).toBe(200);
    opId = res.data.operation.id;
    expect(res.data.operation).toMatchObject({ attackerId: aId, defenderId: bId, region: FRONT, from: brasilia.region, naval: false, status: 'active' });
    expect(res.data.operation.mine).toMatchObject({ side: 'attacker', sent: { infantry: 100 } });
    const op = await B.waitFor((e) => e.type === 'play.operation' && e.operation.id === opId && e.operation.mine?.side === 'defender');
    // B tem 3 regiões (capital, FRONT e FAR): guarnição de 1/√3 das tropas em casa.
    expect(op.operation.mine.sent).toEqual(garrison({ infantry: 20 }, 3));
    const sa = await state(A);
    expect(sa.military.army.infantry).toBe(100);
    expect(sa.military.engaged.infantry).toBe(100);
    expect(sa.operations.find((o: any) => o.id === opId)).toBeTruthy();
    // Uma operação por região.
    expect((await A.post('/play/attack', { region: FRONT, percent: 25 })).data.code).toBe('region_contested');
  });

  it('o defensor reforça; só ele pode', async () => {
    expect((await A.post('/play/reinforce', { operationId: opId, percent: 50 })).data.code).toBe('not_defender');
    const before = (await state(B)).operations.find((o: any) => o.id === opId).endsAt;
    const res = await B.post('/play/reinforce', { operationId: opId, percent: 100 });
    expect(res.status).toBe(200);
    expect(res.data.operation.mine.sent.infantry).toBe(20);
    expect(res.data.operation.endsAt).not.toBe(before);
    expect((await state(B)).military.army.infantry ?? 0).toBe(0);
  });

  it('ao chegar a 100%, a região, a bandeira e as construções passam ao vencedor; sobreviventes voltam', async () => {
    await fastForward(opId);
    const s = await state(A);
    expect(s.control.find(([r]: [string, number]) => r === FRONT)[1]).toBe(aId);
    expect(s.structures.find((x: any) => String(x.id) === String(frontStructure)).nationId).toBe(aId);
    expect(s.operations.find((o: any) => o.id === opId)).toBeUndefined();
    const inf = s.military.army.infantry;
    expect(inf).toBeGreaterThan(150);
    expect(inf).toBeLessThan(200);
    expect(s.military.engaged).toEqual({});
    const { rows } = await db.query('SELECT status, result FROM operations WHERE id = $1', [opId]);
    expect(rows[0].status).toBe('won');
    expect(rows[0].result.attackerLosses).toBe(200 - inf);
    expect(rows[0].result.defenderLosses).toBeGreaterThan(10);
    await B.waitFor((e) => e.type === 'play.region' && e.region === FRONT && e.nationId === aId);
    await B.waitFor((e) => e.type === 'play.transfer' && e.structures.some((x: any) => String(x.id) === String(frontStructure)));
  });
});

describe('mísseis', () => {
  let silo = '';

  it('exige silo concluído, míssil e alcance; um míssil em voo por silo', async () => {
    silo = await addStructure(aId, brasilia.region, 'missile_silo', 1);
    expect((await A.post('/play/launch', { siloId: Number(silo), region: bh.region })).data.code).toBe('no_missile');
    await setArmy(aId, 'missile', 2);
    expect((await A.post('/play/launch', { siloId: Number(silo), region: FAR })).data.code).toBe('out_of_range');
    expect((await A.post('/play/launch', { siloId: Number(silo), region: brasilia.region })).data.code).toBe('not_enemy');
  });

  it('lança, voa e no impacto danifica a maior construção e as tropas em casa do alvo', async () => {
    await setArmy(bId, 'infantry', 100);
    const target = await addStructure(bId, bh.region, 'factory', 3);
    const res = await A.post('/play/launch', { siloId: Number(silo), region: bh.region });
    expect(res.status).toBe(200);
    const strike = res.data.strike;
    expect(strike).toMatchObject({ attackerId: aId, defenderId: bId, region: bh.region, status: 'flying', intercepted: false });
    expect(strike.flightAt).toBeGreaterThan(strike.launchedAt);
    expect(strike.impactAt).toBeGreaterThan(strike.interceptAt);
    await B.waitFor((e) => e.type === 'play.strike' && e.strike.id === strike.id);
    expect((await A.post('/play/launch', { siloId: Number(silo), region: bh.region })).data.code).toBe('silo_busy');
    expect((await state(A)).military.army.missile).toBe(1);
    await db.query(`UPDATE strikes SET impact_at = now() - interval '1 second' WHERE id = $1`, [strike.id]);
    const sb = await state(B);
    expect(sb.strikes.find((x: any) => x.id === strike.id)).toBeUndefined();
    expect(sb.structures.find((x: any) => String(x.id) === String(target)).level).toBe(2);
    expect(sb.military.army.infantry).toBe(100 - Math.floor(100 * WAR.missile.homeLoss));
    const done = await A.waitFor((e) => e.type === 'play.strike' && e.strike.id === strike.id && e.strike.status === 'impact');
    expect(done.strike.result.structure).toEqual({ type: 'factory', from: 3, to: 2 });
  });

  it('com sistema antimísseis, a interceptação segue a chance e o sorteio reproduzível', async () => {
    await addStructure(bId, bh.region, 'antimissile', 4);
    await db.query(`INSERT INTO research (governor_id, kingdom_id, tech, level) VALUES ($1, 1, 'interception', 3)`, [bId]);
    const res = await A.post('/play/launch', { siloId: Number(silo), region: bh.region });
    expect(res.status).toBe(200);
    const { rows } = await db.query('SELECT chance, intercepted FROM strikes WHERE id = $1', [res.data.strike.id]);
    expect(rows[0].chance).toBeCloseTo(WAR.missile.maxChance, 5);
    expect(rows[0].intercepted).toBe(interceptRoll(res.data.strike.id) < WAR.missile.maxChance);
    const levels = (await state(B)).structures.filter((x: any) => x.nationId === bId).map((x: any) => x.level);
    await db.query(`UPDATE strikes SET impact_at = now() - interval '1 second' WHERE id = $1`, [res.data.strike.id]);
    await state(A);
    const after = await db.query('SELECT status FROM strikes WHERE id = $1', [res.data.strike.id]);
    expect(after.rows[0].status).toBe(rows[0].intercepted ? 'intercepted' : 'impact');
    if (rows[0].intercepted) expect((await state(B)).structures.filter((x: any) => x.nationId === bId).map((x: any) => x.level)).toEqual(levels);
  });
});
