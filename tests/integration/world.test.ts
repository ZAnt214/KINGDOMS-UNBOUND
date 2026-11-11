import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COUNTRIES, INITIAL_CONTROL, WORLD_BLOCS } from '../../shared/world/index.js';
import type { Db } from '../../server/src/db.js';
import { Player, resetDb, startServer, type TestPlayer } from './helpers.js';

let db: Db;
let srv: Awaited<ReturnType<typeof startServer>>;
let A: TestPlayer;
let B: TestPlayer;
let C: TestPlayer; // reino 2

beforeAll(async () => {
  db = await resetDb();
  srv = await startServer(db);
  A = (await Player.create(srv.base, 'Alfa', 1)) as TestPlayer;
  B = (await Player.create(srv.base, 'Beta', 1)) as TestPlayer;
  C = (await Player.create(srv.base, 'Gama', 2)) as TestPlayer;
  await Promise.all([A, B, C].map((p) => p.connect()));
});

afterAll(async () => {
  for (const p of [A, B, C]) p?.close();
  await srv?.close();
  await db?.end();
});

const blocByKey = (snapshot: any, key: string) => snapshot.blocs.find((b: any) => b.key === key);
const territory = (snapshot: any, code: string) => snapshot.territories.find((t: any) => t.code === code);

describe('mundo geopolítico', () => {
  it('exige sessão', async () => {
    const anon = new Player(srv.base);
    expect((await anon.get('/world')).status).toBe(401);
  });

  it('entrega o cenário inicial do reino: blocos, todos os países e nenhuma guerra', async () => {
    const { status, data } = await A.get('/world');
    expect(status).toBe(200);
    expect(data.blocs.map((b: any) => b.key)).toEqual(WORLD_BLOCS.map((b) => b.key));
    expect(data.territories).toHaveLength(COUNTRIES.length);
    expect(territory(data, 'BRA').blocId).toBe(blocByKey(data, 'liga').id);
    expect(territory(data, 'GRL').blocId).toBeNull();
    expect(blocByKey(data, 'otan').territories).toBe(INITIAL_CONTROL.otan.length);
    expect(data.wars).toEqual([]);
    expect(data.myBlocId).toBeNull();
  });

  it('isola o estado por reino', async () => {
    const a = (await A.get('/world')).data;
    const c = (await C.get('/world')).data;
    const idsA = new Set(a.blocs.map((b: any) => b.id));
    expect(c.blocs.some((b: any) => idsA.has(b.id))).toBe(false);
  });

  it('alista o governador uma única vez e apenas em bloco do próprio reino', async () => {
    const a = (await A.get('/world')).data;
    const c = (await C.get('/world')).data;
    expect((await A.post('/world/enlist', { blocId: blocByKey(c, 'liga').id })).status).toBe(404);
    const ok = await A.post('/world/enlist', { blocId: blocByKey(a, 'liga').id });
    expect(ok.status).toBe(200);
    expect(ok.data.myBlocId).toBe(blocByKey(a, 'liga').id);
    expect(blocByKey(ok.data, 'liga').members).toBe(1);
    expect((await A.post('/world/enlist', { blocId: blocByKey(a, 'otan').id })).status).toBe(409);
    expect((await B.get('/world')).data.myBlocId).toBeNull();
  });

  it('muda o controle só pelo servidor e avisa o reino em tempo real', async () => {
    const before = (await B.get('/world')).data;
    B.events.length = 0;
    C.events.length = 0;
    await srv.services.world.setControl(1, 'BRA', blocByKey(before, 'pacto').id);
    await B.waitFor((e) => e.type === 'world.updated');
    await C.expectNone((e) => e.type === 'world.updated');
    const after = (await B.get('/world')).data;
    expect(territory(after, 'BRA').blocId).toBe(blocByKey(after, 'pacto').id);
    expect(territory(after, 'BRA').version).toBe(territory(before, 'BRA').version + 1);
    expect(territory((await C.get('/world')).data, 'BRA').blocId).not.toBe(blocByKey(after, 'pacto').id);
    await expect(srv.services.world.setControl(1, 'XXX', null)).rejects.toThrow();
  });
});
