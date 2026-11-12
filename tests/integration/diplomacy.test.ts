import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_FLAG } from '../../shared/play/flags.js';
import { NATION_COLORS } from '../../shared/play/rules.js';
import { REGION_BY_ID, START_POINTS } from '../../shared/world/regions.js';
import type { Db } from '../../server/src/db.js';
import { Player, resetDb, startServer, type TestPlayer } from './helpers.js';

// Fase F: pedido de aliança, recusa e aceite, envio de recursos, defesa por aliado, quebra com
// penalidade e bloqueio, e resposta automática dos bots — contra o servidor real e o PostgreSQL.

let db: Db;
let srv: Awaited<ReturnType<typeof startServer>>;
let A: TestPlayer;
let B: TestPlayer;
let C: TestPlayer;
let aId = 0;
let bId = 0;
let cId = 0;

const brasilia = START_POINTS.find((p) => p.id === 'cap-bra-brasilia')!; // Goiás (A)
const bh = START_POINTS.find((p) => p.id === 'city-bra-belo-horizonte')!; // Minas Gerais (B)
const rio = START_POINTS.find((p) => p.id === 'city-bra-rio-de-janeiro')!; // Rio (C)
// Região vizinha da capital de B, dada a C para ele poder atacar B.
const C_FRONT = REGION_BY_ID[bh.region].neighbors.find((n) => n !== brasilia.region && n !== rio.region)!;

const state = async (p: TestPlayer) => (await p.get('/play/state')).data;
const army = async (gid: number) =>
  Object.fromEntries((await db.query('SELECT unit, amount FROM army WHERE governor_id = $1', [gid])).rows.map((r) => [r.unit, r.amount]));
const money = async (gid: number) => Number((await db.query(`SELECT amount FROM nation_resources WHERE governor_id = $1 AND resource = 'money'`, [gid])).rows[0].amount);
const setArmy = async (gid: number, unit: string, amount: number) =>
  db.query('INSERT INTO army (governor_id, unit, amount) VALUES ($1, $2, $3) ON CONFLICT (governor_id, unit) DO UPDATE SET amount = $3', [gid, unit, amount]);

async function fastForward(opId: number) {
  const { rows } = await db.query('SELECT ends_at, events FROM operations WHERE id = $1', [opId]);
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
  A = (await Player.create(srv.base, 'Diplomata', 1)) as TestPlayer;
  B = (await Player.create(srv.base, 'Vizinho', 1)) as TestPlayer;
  C = (await Player.create(srv.base, 'Terceiro', 1)) as TestPlayer;
  await Promise.all([A, B, C].map((p) => p.connect()));
  expect((await A.post('/play/found', { pointId: brasilia.id, name: 'Planalto', color: NATION_COLORS[0].hex, flag: DEFAULT_FLAG })).status).toBe(200);
  expect((await B.post('/play/found', { pointId: bh.id, name: 'Gerais', color: NATION_COLORS[7].hex, flag: DEFAULT_FLAG })).status).toBe(200);
  expect((await C.post('/play/found', { pointId: rio.id, name: 'Guanabara', color: NATION_COLORS[3].hex, flag: DEFAULT_FLAG })).status).toBe(200);
  aId = (await state(A)).me;
  bId = (await state(B)).me;
  cId = (await state(C)).me;
  await db.query('INSERT INTO region_control (kingdom_id, region_id, governor_id) VALUES (1, $1, $2) ON CONFLICT (kingdom_id, region_id) DO UPDATE SET governor_id = $2', [C_FRONT, cId]);
  await db.query('UPDATE nation_resources SET amount = 2000');
  await setArmy(aId, 'infantry', 200);
  await setArmy(bId, 'infantry', 20);
  await setArmy(cId, 'infantry', 150);
});

afterAll(async () => {
  for (const p of [A, B, C]) p?.close();
  await srv?.close();
  await db?.end();
});

describe('pedido de aliança', () => {
  it('pede, o outro lado é avisado; repetido ou a si mesmo é recusado', async () => {
    const r = await A.post('/play/pact/request', { nationId: bId });
    expect(r.status).toBe(200);
    expect(r.data.accepted).toBe(false);
    await B.waitFor((e) => e.type === 'play.pact' && e.news.kind === 'request' && e.news.from === aId);
    const d = (await state(B)).diplomacy;
    expect(d.requests).toHaveLength(1);
    expect(d.requests[0]).toMatchObject({ fromId: aId, toId: bId });
    expect((await A.post('/play/pact/request', { nationId: bId })).data.error).toBe('already_requested');
    expect((await A.post('/play/pact/request', { nationId: aId })).status).toBe(400);
    // Só quem recebeu responde.
    expect((await A.post('/play/pact/answer', { requestId: d.requests[0].id, accept: true })).status).toBe(404);
  });

  it('recusado, nada muda e quem pediu é avisado', async () => {
    const req = (await state(B)).diplomacy.requests[0];
    expect((await B.post('/play/pact/answer', { requestId: req.id, accept: false })).status).toBe(200);
    await A.waitFor((e) => e.type === 'play.pact' && e.news.kind === 'declined');
    expect((await state(A)).diplomacy.requests).toHaveLength(0);
    expect((await state(A)).nations.find((n: any) => n.id === aId).alliance).toBeNull();
  });

  it('aceito, as duas nações viram aliadas e todos veem', async () => {
    await A.post('/play/pact/request', { nationId: bId });
    const req = (await state(B)).diplomacy.requests[0];
    const res = await B.post('/play/pact/answer', { requestId: req.id, accept: true });
    expect(res.status).toBe(200);
    await C.waitFor((e) => e.type === 'play.pact' && e.news.kind === 'accepted' && e.news.from === aId && e.news.to === bId);
    const s = await state(C);
    const allianceOf = (id: number) => s.nations.find((n: any) => n.id === id).alliance;
    expect(allianceOf(aId)).toBe(res.data.allianceId);
    expect(allianceOf(bId)).toBe(res.data.allianceId);
    expect((await state(A)).diplomacy.allianceName).toBe('Planalto e Gerais');
    // Aliados não se atacam.
    expect((await A.post('/play/attack', { region: bh.region, percent: 50 })).data.error).toBe('allied');
  });
});

describe('cooperação', () => {
  it('envia recursos a um aliado; só chega o que cabe no armazém', async () => {
    const before = await money(bId);
    const res = await A.post('/play/pact/gift', { nationId: bId, resources: { money: 500 } });
    expect(res.status).toBe(200);
    expect(res.data.sent).toEqual({ money: 500 });
    expect((await money(bId)) - before).toBeGreaterThanOrEqual(500);
    await B.waitFor((e) => e.type === 'play.pact' && e.news.kind === 'gift' && e.news.resources.money === 500);
    // Armazém cheio: nada é cobrado.
    await db.query(`UPDATE nation_resources SET amount = 1e9 WHERE governor_id = $1 AND resource = 'money'`, [bId]);
    const mine = await money(aId);
    expect((await A.post('/play/pact/gift', { nationId: bId, resources: { money: 100 } })).data.error).toBe('storage_full');
    expect(Math.round(await money(aId))).toBeGreaterThanOrEqual(Math.round(mine));
    await db.query(`UPDATE nation_resources SET amount = 2000 WHERE governor_id = $1 AND resource = 'money'`, [bId]);
    // Só para aliados.
    expect((await A.post('/play/pact/gift', { nationId: cId, resources: { money: 10 } })).data.error).toBe('not_allied');
  });

  it('aliado ajuda a defender; os sobreviventes voltam a quem mandou', async () => {
    const op = await C.post('/play/attack', { region: bh.region, percent: 100 });
    expect(op.status).toBe(200);
    const opId = op.data.operation.id;
    const homeBefore = (await army(aId)).infantry;
    const help = await A.post('/play/reinforce', { operationId: opId, percent: 50 });
    expect(help.status).toBe(200);
    expect(help.data.operation.mine.side).toBe('defender');
    expect(help.data.operation.mine.sent).toEqual({ infantry: 100 });
    expect(help.data.operation.allies).toEqual([{ id: aId, side: 'defender' }]);
    expect((await army(aId)).infantry).toBe(homeBefore - 100);
    expect((await db.query('SELECT allies FROM operations WHERE id = $1', [opId])).rows[0].allies.map(Number)).toEqual([aId]);
    await B.waitFor((e) => e.type === 'play.pact' && e.news.kind === 'help' && e.news.by === aId);
    // Quem não é aliado de nenhum lado não entra.
    const D = (await Player.create(srv.base, 'Curioso', 1)) as TestPlayer;
    expect((await D.post('/play/reinforce', { operationId: opId, percent: 50 })).data.error).toBe('not_defender');
    D.close();
    await fastForward(opId);
    await state(A);
    const done = (await db.query('SELECT status, result FROM operations WHERE id = $1', [opId])).rows[0];
    expect(['won', 'failed']).toContain(done.status);
    const back = (await army(aId)).infantry - (homeBefore - 100);
    expect(back).toBeGreaterThan(0);
    expect(back).toBeLessThanOrEqual(100);
  });
});

describe('quebra de aliança', () => {
  it('quem rompe perde 10% das tropas e 20% dos recursos, e não ataca o ex-aliado por 30 min', async () => {
    await db.query('UPDATE nation_resources SET amount = 1000 WHERE governor_id = $1', [aId]);
    await setArmy(aId, 'infantry', 150);
    const res = await A.post('/play/pact/break');
    expect(res.status).toBe(200);
    expect(res.data.penalty.troops).toEqual({ infantry: 15 });
    expect(res.data.penalty.resources.money).toBeGreaterThanOrEqual(200);
    expect((await army(aId)).infantry).toBe(135);
    expect(await money(aId)).toBeLessThan(1000 * 0.8 + 50);
    await B.waitFor((e) => e.type === 'play.pact' && e.news.kind === 'broken' && e.news.by === aId && e.news.formers.includes(bId));
    const s = await state(B);
    expect(s.nations.find((n: any) => n.id === aId).alliance).toBeNull();
    expect(s.nations.find((n: any) => n.id === bId).alliance).toBeNull();
    const blocked = await A.post('/play/attack', { region: bh.region, percent: 50 });
    expect(blocked.data.error).toBe('pact_block');
    expect(blocked.data.message).toMatch(/liberados em (29|30) min/);
    expect((await state(A)).diplomacy.blocks).toEqual([{ nationId: bId, until: expect.any(Number) }]);
    // Quem foi deixado não sofre bloqueio.
    expect((await state(B)).diplomacy.blocks).toEqual([]);
    const audit = await db.query(`SELECT action FROM audit_logs WHERE action LIKE 'pact.%' ORDER BY id`);
    expect(audit.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['pact.requested', 'pact.declined', 'pact.accepted', 'pact.gift', 'pact.broken']));
    expect((await A.post('/play/pact/break')).status).toBe(400);
  });

  it('pedido cruzado: se o outro já pediu, a aliança se forma na hora; sair pela rota antiga também é quebra', async () => {
    await B.post('/play/pact/request', { nationId: aId });
    const res = await A.post('/play/pact/request', { nationId: bId });
    expect(res.data.accepted).toBe(true);
    expect((await state(A)).nations.find((n: any) => n.id === bId).alliance).toBe(res.data.allianceId);
    // Quem pediu primeiro (B) lidera; A sai pela rota antiga e sofre a mesma penalidade.
    await setArmy(aId, 'infantry', 100);
    expect((await A.post('/alliance/leave')).status).toBe(200);
    expect((await army(aId)).infantry).toBe(90);
    const breaks = await db.query('SELECT breaker_id, former_id FROM alliance_breaks WHERE breaker_id = $1', [aId]);
    expect(breaks.rowCount).toBe(2);
  });
});

describe('bots', () => {
  it('respondem na hora pela regra pública; recusam quem já rompeu com eles', async () => {
    await db.query('UPDATE governors SET is_bot = true WHERE id = $1', [cId]);
    await db.query(`UPDATE operations SET status = 'failed' WHERE status = 'active'`);
    // A não é a nação mais forte (C tem mais poder).
    await db.query('UPDATE military SET power = 99999 WHERE governor_id = $1', [cId]);
    const ok = await A.post('/play/pact/request', { nationId: cId });
    expect(ok.status).toBe(200);
    expect(ok.data.accepted).toBe(true);
    expect((await A.post('/play/pact/break')).status).toBe(200);
    const no = await A.post('/play/pact/request', { nationId: cId });
    expect(no.data.accepted).toBe(false);
    expect(no.data.reason).toMatch(/rompeu/);
  });
});
