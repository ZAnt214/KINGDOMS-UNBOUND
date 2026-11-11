import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_FLAG } from '../../shared/play/flags.js';
import { arenaStartPoints, QUICK } from '../../shared/play/match.js';
import { NATION_COLORS } from '../../shared/play/rules.js';
import { REGION_BY_ID, START_POINTS } from '../../shared/world/regions.js';
import type { Db } from '../../server/src/db.js';
import { Player, resetDb, startServer, type TestPlayer } from './helpers.js';

let db: Db;
let srv: Awaited<ReturnType<typeof startServer>>;
let Q: TestPlayer;
let other: TestPlayer;

const state = async (p: TestPlayer) => (await p.get('/play/state')).data;
async function freePoint(s: any) {
  const taken = new Set(s.control.map((c: any) => c[0]));
  return arenaStartPoints(s.world.arena).find((p) => !taken.has(p.region))!;
}
/** Governador do jogador na partida (diferente do da campanha). */
let qg = 0;
async function newMatch(p: TestPlayer) {
  p.world = null;
  const r = await p.post('/quick/start');
  expect(r.status).toBe(200);
  p.world = r.data.worldId;
  qg = (await p.get('/me')).data.worlds.find((w: any) => w.id === r.data.worldId).governorId;
  return r.data;
}

beforeAll(async () => {
  db = await resetDb();
  srv = await startServer(db);
  Q = (await Player.create(srv.base, 'Rapido', 1)) as TestPlayer;
  other = (await Player.create(srv.base, 'Outro', 1)) as TestPlayer;
});

afterAll(async () => {
  Q?.close();
  await srv?.close();
  await db?.end();
});

describe('partida rápida', () => {
  let world: number;

  it('cria um mundo próprio com arena e três bots; repetir devolve a mesma partida', async () => {
    const first = await newMatch(Q);
    expect(first.created).toBe(true);
    world = first.worldId;
    expect(world).toBeGreaterThanOrEqual(1000);
    Q.world = null;
    expect((await Q.post('/quick/start')).data).toEqual({ worldId: world, created: false });
    Q.world = world;
    const s = await state(Q);
    expect(s.world).toMatchObject({ id: world, mode: 'quick', endsAt: null, finishedAt: null });
    expect(s.world.arena).toHaveLength(QUICK.arenaSize);
    expect(s.nations).toHaveLength(QUICK.bots);
    expect(s.nations.every((n: any) => n.bot)).toBe(true);
    expect(s.me).toBeNull();
    for (const [region] of s.control) expect(s.world.arena).toContain(region);
    const me = (await Q.get('/me')).data;
    expect(me.worlds.map((w: any) => w.mode).sort()).toEqual(['campaign', 'quick']);
  });

  it('a campanha continua separada', async () => {
    Q.world = null;
    expect((await state(Q)).world.mode).toBe('campaign');
    other.world = world;
    // Quem não está na partida não entra nela pelo cabeçalho: cai na própria campanha.
    expect((await state(other)).world.mode).toBe('campaign');
    Q.world = world;
  });

  it('fundação só dentro da arena; o relógio começa na fundação', async () => {
    const s = await state(Q);
    const outside = START_POINTS.find((p) => !s.world.arena.includes(p.region))!;
    expect((await Q.post('/play/found', { pointId: outside.id, name: 'Fora', color: NATION_COLORS[1].hex, flag: DEFAULT_FLAG })).data.error).toBe('outside_arena');
    const pick = await freePoint(s);
    const used = new Set(s.nations.map((n: any) => n.color));
    const color = NATION_COLORS.find((c) => !used.has(c.hex))!.hex;
    const r = await Q.post('/play/found', { pointId: pick.id, name: 'Relâmpago', color, flag: DEFAULT_FLAG });
    expect(r.status).toBe(200);
    expect(r.data.world.endsAt - Date.now()).toBeGreaterThan((QUICK.minutes - 1) * 60_000);
    expect(r.data.world.endsAt - Date.now()).toBeLessThanOrEqual(QUICK.minutes * 60_000 + 2000);
    const mine = r.data.control.find((c: any) => c[1] === qg)?.[0] ?? null;
    expect(mine).toBe(pick.region);
    const outsideNeighbor = REGION_BY_ID[pick.region].neighbors.find((n) => !s.world.arena.includes(n));
    if (outsideNeighbor) expect((await Q.post('/play/expand', { region: outsideNeighbor })).data.error).toBe('outside_arena');
  });

  it('os bots jogam pelas mesmas regras: ocupam regiões da arena', async () => {
    await srv.services.match.tick();
    const s = await state(Q);
    const botOccupations = s.occupations.filter((o: any) => s.nations.find((n: any) => n.id === o.nationId)?.bot);
    const botStructures = s.structures.filter((x: any) => s.nations.find((n: any) => n.id === x.nationId)?.bot);
    expect(botOccupations.length + botStructures.length).toBeGreaterThan(0);
    for (const o of botOccupations) expect(s.world.arena).toContain(o.region);
  });

  it('mais da metade da arena encerra a partida com vitória e classificação', async () => {
    await Q.connect();
    const s = await state(Q);
    const owned = new Set(s.control.map((c: any) => c[0]));
    const busy = new Set(s.occupations.map((o: any) => o.region));
    const free = s.world.arena.filter((r: string) => !owned.has(r) && !busy.has(r));
    // Já tem 1 região: com mais `need` passa da metade.
    const need = Math.floor(QUICK.arenaSize * QUICK.majority);
    for (const r of free.slice(0, need)) {
      await db.query('INSERT INTO region_control (kingdom_id, region_id, governor_id) VALUES ($1, $2, $3)', [world, r, qg]);
    }
    await srv.services.match.check(world);
    const ev = await Q.waitFor((e) => e.type === 'play.match' && e.world.finishedAt);
    expect(ev.world).toMatchObject({ outcome: 'majority', winner: qg });
    expect(ev.world.results[0]).toMatchObject({ nationId: qg, rank: 1 });
    expect(ev.world.results).toHaveLength(QUICK.bots + 1);
    expect(s.world.arena.length).toBe(QUICK.arenaSize);
  });

  it('depois do fim, nada mais muda', async () => {
    const s = await state(Q);
    const mine = s.control.find((c: any) => c[1] === qg)[0];
    expect((await Q.post('/play/build', { region: mine, type: 'city' })).data.error).toBe('match_over');
    const target = REGION_BY_ID[mine].neighbors.find((n: string) => s.world.arena.includes(n) && !s.control.some((c: any) => c[0] === n));
    if (target) expect((await Q.post('/play/expand', { region: target })).data.error).toBe('match_over');
    expect(s.occupations).toEqual([]);
  });

  it('abandonar encerra a partida e coloca quem saiu em último', async () => {
    const m = await newMatch(Q);
    expect(m.created).toBe(true);
    const s = await state(Q);
    const pick = await freePoint(s);
    const used = new Set(s.nations.map((n: any) => n.color));
    await Q.post('/play/found', { pointId: pick.id, name: 'Desistente', color: NATION_COLORS.find((c) => !used.has(c.hex))!.hex, flag: DEFAULT_FLAG });
    expect((await Q.post('/quick/leave')).status).toBe(200);
    const after = await state(Q);
    expect(after.world.outcome).toBe('abandoned');
    expect(after.world.results.at(-1).nationId).toBe(qg);
    expect(after.world.winner).not.toBe(qg);
  });

  it('fim do tempo decide pela maior quantidade de regiões; sem fundação, a partida expira', async () => {
    const m = await newMatch(Q);
    await db.query(`UPDATE kingdoms SET ends_at = now() - interval '1 second' WHERE id = $1`, [m.worldId]);
    await srv.services.match.check(m.worldId);
    const s = await state(Q);
    expect(s.world.outcome).toBe('time');
    expect(s.world.winner).toBe(s.world.results[0].nationId);

    const n = await newMatch(Q);
    await db.query(`UPDATE kingdoms SET created_at = now() - interval '1 hour' WHERE id = $1`, [n.worldId]);
    await srv.services.match.check(n.worldId);
    const e = await state(Q);
    expect(e.world).toMatchObject({ outcome: 'expired', winner: null });
  });
});
