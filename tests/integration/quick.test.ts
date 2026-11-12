import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_FLAG } from '../../shared/play/flags.js';
import { arenaStartPoints, QUICK } from '../../shared/play/match.js';
import { NATION_COLORS } from '../../shared/play/rules.js';
import { REGION_BY_ID, START_POINTS } from '../../shared/world/regions.js';
import type { Db } from '../../server/src/db.js';
import { freePointIn } from '../../server/src/geo.js';
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
    // Sem prazo de fim: a partida começa na fundação e vai até a conquista total.
    expect(r.data.world.endsAt).toBeNull();
    expect(Math.abs(r.data.world.startedAt - Date.now())).toBeLessThan(5000);
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

  it('mais da metade não encerra; 100% da arena encerra com vitória e classificação', async () => {
    await Q.connect();
    const s = await state(Q);
    const owned = new Set(s.control.map((c: any) => c[0]));
    const busy = new Set(s.occupations.map((o: any) => o.region));
    const free = s.world.arena.filter((r: string) => !owned.has(r) && !busy.has(r));
    const half = Math.floor(QUICK.arenaSize / 2);
    for (const r of free.slice(0, half)) {
      await db.query('INSERT INTO region_control (kingdom_id, region_id, governor_id) VALUES ($1, $2, $3)', [world, r, qg]);
    }
    await srv.services.match.check(world);
    expect((await state(Q)).world.finishedAt).toBeNull();
    // Toma a arena inteira, inclusive as regiões e capitais dos bots.
    for (const r of s.world.arena as string[]) {
      await db.query(
        'INSERT INTO region_control (kingdom_id, region_id, governor_id) VALUES ($1, $2, $3) ON CONFLICT (kingdom_id, region_id) DO UPDATE SET governor_id = $3',
        [world, r, qg],
      );
    }
    await srv.services.match.check(world);
    const ev = await Q.waitFor((e) => e.type === 'play.match' && e.world.finishedAt);
    expect(ev.world).toMatchObject({ outcome: 'conquest', winner: qg });
    expect(ev.world.results[0]).toMatchObject({ nationId: qg, rank: 1 });
    expect(ev.world.results).toHaveLength(QUICK.bots + 1);
    expect(s.world.arena.length).toBe(QUICK.arenaSize);
  });

  it('depois do fim, nada mais muda', async () => {
    const s = await state(Q);
    const mine = s.control.find((c: any) => c[1] === qg)[0];
    expect((await Q.post('/play/build', { at: freePointIn(mine, [], 40), type: 'city' })).data.error).toBe('match_over');
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

  it('jogador sem nenhuma região perde; sem fundação, a partida expira; não há fim por tempo', async () => {
    const m = await newMatch(Q);
    const s0 = await state(Q);
    const pick = await freePoint(s0);
    const used = new Set(s0.nations.map((n: any) => n.color));
    await Q.post('/play/found', { pointId: pick.id, name: 'Sitiado', color: NATION_COLORS.find((c) => !used.has(c.hex))!.hex, flag: DEFAULT_FLAG });
    // Uma hora depois da fundação, a partida continua.
    await db.query(`UPDATE kingdoms SET started_at = now() - interval '1 hour' WHERE id = $1`, [m.worldId]);
    await srv.services.match.check(m.worldId);
    expect((await state(Q)).world.finishedAt).toBeNull();
    // Perdeu a última região: derrota, em último.
    const bot = s0.nations.find((n: any) => n.bot).id;
    await db.query('UPDATE region_control SET governor_id = $2 WHERE kingdom_id = $1 AND governor_id = $3', [m.worldId, bot, qg]);
    await srv.services.match.check(m.worldId);
    const s = await state(Q);
    expect(s.world.outcome).toBe('eliminated');
    expect(s.world.results.at(-1).nationId).toBe(qg);
    expect(s.world.winner).not.toBe(qg);

    const n = await newMatch(Q);
    await db.query(`UPDATE kingdoms SET created_at = now() - interval '1 hour' WHERE id = $1`, [n.worldId]);
    await srv.services.match.check(n.worldId);
    const e = await state(Q);
    expect(e.world).toMatchObject({ outcome: 'expired', winner: null });
  });
});
