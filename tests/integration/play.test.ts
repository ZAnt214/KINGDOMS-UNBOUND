import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_FLAG } from '../../shared/play/flags.js';
import { expansionSeconds, NATION_COLORS } from '../../shared/play/rules.js';
import { REGION_BY_ID, REGIONS, START_POINTS, type StartPoint } from '../../shared/world/regions.js';
import type { Db } from '../../server/src/db.js';
import { Player, resetDb, startServer, type TestPlayer } from './helpers.js';

let db: Db;
let srv: Awaited<ReturnType<typeof startServer>>;
let A: TestPlayer;
let B: TestPlayer;
let C: TestPlayer; // mundo 2
let D: TestPlayer;
let E: TestPlayer;

// Dois pontos de partida em regiões vizinhas, com uma terceira região neutra que faz fronteira com as duas.
function pickScenario(): { p: StartPoint; q: StartPoint; shared: string; onlyP: string } {
  const startRegions = new Set(START_POINTS.map((s) => s.region));
  for (const p of START_POINTS) {
    for (const q of START_POINTS) {
      if (p === q || !REGION_BY_ID[p.region].neighbors.includes(q.region)) continue;
      const shared = REGION_BY_ID[p.region].neighbors.find((n) => n !== q.region && REGION_BY_ID[q.region].neighbors.includes(n) && !startRegions.has(n));
      const onlyP = REGION_BY_ID[p.region].neighbors.find((n) => n !== q.region && n !== shared && !REGION_BY_ID[q.region].neighbors.includes(n) && !startRegions.has(n));
      if (shared && onlyP) return { p, q, shared, onlyP };
    }
  }
  throw new Error('nenhum cenário de teste nos dados de regiões');
}
const S = pickScenario();
const [RED, BLUE] = [NATION_COLORS[0].hex, NATION_COLORS[7].hex];
const found = (pointId: string, name: string, color: string, extra: Record<string, unknown> = {}) => ({ pointId, name, color, flag: DEFAULT_FLAG, ...extra });
const owner = (snapshot: any, region: string) => snapshot.control.find((c: any) => c[0] === region)?.[1] ?? null;
/** Faz as ocupações ativas vencerem, como se o tempo tivesse passado com todos desconectados. */
const expire = () => db.query(`UPDATE occupations SET started_at = started_at - interval '1 hour', ends_at = now() - interval '1 second' WHERE status = 'active'`);
// PNG 1×1 válido.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

beforeAll(async () => {
  db = await resetDb();
  srv = await startServer(db);
  A = (await Player.create(srv.base, 'Alfa', 1)) as TestPlayer;
  B = (await Player.create(srv.base, 'Beta', 1)) as TestPlayer;
  C = (await Player.create(srv.base, 'Gama', 2)) as TestPlayer;
  D = (await Player.create(srv.base, 'Delta', 1)) as TestPlayer;
  E = (await Player.create(srv.base, 'Echo', 1)) as TestPlayer;
  await Promise.all([A, B, C].map((p) => p.connect()));
});

afterAll(async () => {
  for (const p of [A, B, C]) p?.close();
  await srv?.close();
  await db?.end();
});

describe('fundação da nação', () => {
  it('exige sessão e começa com o mundo neutro', async () => {
    expect((await new Player(srv.base).get('/play/state')).status).toBe(401);
    const { status, data } = await A.get('/play/state');
    expect(status).toBe(200);
    expect(data.world).toMatchObject({ id: 1, mode: 'campaign' });
    expect(data).toMatchObject({ me: null, nations: [], control: [], occupations: [] });
  });

  it('recusa identidade inválida sem criar nada', async () => {
    expect((await A.post('/play/found', found('nao-existe', 'Aurora', RED))).status).toBe(404);
    expect((await A.post('/play/found', found(S.p.id, 'A', RED))).data.error).toBe('invalid_name');
    expect((await A.post('/play/found', found(S.p.id, '<script>', RED))).data.error).toBe('invalid_name');
    expect((await A.post('/play/found', found(S.p.id, 'Aurora', '#123456'))).data.error).toBe('invalid_color');
    expect((await A.post('/play/found', { ...found(S.p.id, 'Aurora', RED), flag: { pattern: 'x', colors: [], emblem: 'none' } })).data.error).toBe('invalid_flag');
    expect((await A.post('/play/found', found(S.p.id, 'Aurora', RED, { flagImage: 'QUJDREVGRw==' }))).data.error).toBe('invalid_flag_image');
    expect((await A.get('/play/state')).data.nations).toEqual([]);
  });

  it('funda a nação, entrega a região inicial e avisa só o mesmo mundo', async () => {
    B.events.length = 0;
    C.events.length = 0;
    const { status, data } = await A.post('/play/found', found(S.p.id, '  República   Aurora ', RED, { flagImage: PNG }));
    expect(status).toBe(200);
    expect(data.me).toBe(A.governor.id);
    expect(data.nations).toHaveLength(1);
    expect(data.nations[0]).toMatchObject({ id: A.governor.id, name: 'República Aurora', color: RED, capital: S.p.id, flag: DEFAULT_FLAG, flagImage: 1 });
    expect(data.control).toEqual([[S.p.region, A.governor.id]]);
    const event = await B.waitFor((e) => e.type === 'play.nation');
    expect(event).toMatchObject({ region: S.p.region, nation: { id: A.governor.id, name: 'República Aurora' } });
    await C.expectNone((e) => e.type === 'play.nation');
    expect((await C.get('/play/state')).data.nations).toEqual([]);
  });

  it('serve a imagem de bandeira enviada, só para o mesmo mundo', async () => {
    const res = await B.raw(`/play/flag/${A.governor.id}?v=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer()).toString('base64')).toBe(PNG);
    expect((await C.raw(`/play/flag/${A.governor.id}`)).status).toBe(404);
    expect((await B.raw(`/play/flag/${B.governor.id}`)).status).toBe(404);
  });

  it('uma nação por jogador; ponto, nome e cor vizinha são exclusivos', async () => {
    expect((await A.post('/play/found', found(S.q.id, 'Outra', BLUE))).data.error).toBe('nation_exists');
    expect((await B.post('/play/found', found(S.p.id, 'Boreal', BLUE))).data.error).toBe('region_taken');
    expect((await B.post('/play/found', found(S.q.id, 'república aurora', BLUE))).data.error).toBe('name_taken');
    expect((await B.get(`/play/colors?pointId=${S.q.id}`)).data.blocked).toEqual([RED]);
    expect((await B.post('/play/found', found(S.q.id, 'Boreal', RED))).data.error).toBe('color_taken');
    const ok = await B.post('/play/found', found(S.q.id, 'Boreal', BLUE));
    expect(ok.status).toBe(200);
    expect(owner(ok.data, S.q.region)).toBe(B.governor.id);
    expect(ok.data.nations).toHaveLength(2);
  });

  it('o mesmo ponto pode ser fundado em outro mundo', async () => {
    const { status, data } = await C.post('/play/found', found(S.p.id, 'República Aurora', RED));
    expect(status).toBe(200);
    expect(data.control).toEqual([[S.p.region, C.governor.id]]);
  });

  it('duas fundações simultâneas no mesmo ponto: só uma vence', async () => {
    const free = START_POINTS.find((s) => s.region !== S.p.region && s.region !== S.q.region && s.region !== S.shared && s.region !== S.onlyP)!;
    const results = await Promise.all([D.post('/play/found', found(free.id, 'Delta Um', NATION_COLORS[3].hex)), E.post('/play/found', found(free.id, 'Echo Dois', NATION_COLORS[4].hex))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const state = (await A.get('/play/state')).data;
    expect(state.control.filter((c: any) => c[0] === free.region)).toHaveLength(1);
  });
});

describe('expansão territorial', () => {
  it('valida região, vizinhança e existência da nação', async () => {
    const loser = (await D.get('/play/state')).data.me === null ? D : E;
    expect((await loser.post('/play/expand', { region: S.shared })).data.error).toBe('no_nation');
    expect((await A.post('/play/expand', { region: 'XXX-0' })).status).toBe(404);
    expect((await A.post('/play/expand', { region: S.p.region })).data.error).toBe('region_owned');
    expect((await A.post('/play/expand', { region: S.q.region })).data.error).toBe('region_taken');
    const starts = new Set(START_POINTS.map((s) => s.region));
    const far = REGIONS.find((r) => !starts.has(r.id) && !REGION_BY_ID[S.p.region].neighbors.includes(r.id))!;
    expect((await A.post('/play/expand', { region: far.id })).data.error).toBe('not_adjacent');
    expect((await A.get('/play/state')).data.occupations).toEqual([]);
  });

  it('inicia a ocupação com a duração calculada pelo servidor e ignora valores do cliente', async () => {
    B.events.length = 0;
    C.events.length = 0;
    const { status, data } = await A.post('/play/expand', { region: S.shared, seconds: 1, endsAt: 0, from: S.q.region });
    expect(status).toBe(200);
    const expected = expansionSeconds(REGION_BY_ID[S.shared].area, 1, 'campaign');
    expect(data.seconds).toBe(expected);
    expect(data.occupation).toMatchObject({ nationId: A.governor.id, region: S.shared, from: S.p.region });
    expect(data.occupation.endsAt - data.occupation.startedAt).toBe(expected * 1000);
    const event = await B.waitFor((e) => e.type === 'play.occupation');
    expect(event.occupation.id).toBe(data.occupation.id);
    await C.expectNone((e) => e.type === 'play.occupation');
    // Ainda não venceu: a região continua neutra.
    expect(owner((await B.get('/play/state')).data, S.shared)).toBeNull();
  });

  it('uma ocupação por nação e uma por região, mesmo com pedidos simultâneos', async () => {
    expect((await A.post('/play/expand', { region: S.onlyP })).data.error).toBe('occupation_busy');
    expect((await B.post('/play/expand', { region: S.shared })).data.error).toBe('region_contested');
    const burst = await Promise.all(Array.from({ length: 5 }, () => A.post('/play/expand', { region: S.onlyP })));
    expect(burst.every((r) => r.status === 409)).toBe(true);
    const count = await db.query(`SELECT COUNT(*)::int AS n FROM occupations WHERE status = 'active'`);
    expect(count.rows[0].n).toBe(1);
  });

  it('conclui pelo relógio do servidor, sem ninguém pedir, e avisa o mundo', async () => {
    A.events.length = 0;
    B.events.length = 0;
    C.events.length = 0;
    await expire();
    // O worker roda a cada segundo; nenhum jogador faz requisição.
    const event = await B.waitFor((e) => e.type === 'play.region', 5000);
    expect(event).toMatchObject({ region: S.shared, nationId: A.governor.id });
    await A.waitFor((e) => e.type === 'play.region');
    await C.expectNone((e) => e.type === 'play.region');
    const state = (await B.get('/play/state')).data;
    expect(owner(state, S.shared)).toBe(A.governor.id);
    expect(state.occupations).toEqual([]);
    const done = await db.query(`SELECT status, completed_at = ends_at AS on_time FROM occupations`);
    expect(done.rows).toEqual([{ status: 'done', on_time: true }]);
  });

  it('a leitura do estado também conclui o que venceu (sem depender do worker)', async () => {
    const start = await A.post('/play/expand', { region: S.onlyP });
    expect(start.status).toBe(200);
    // Custo progressivo: com 2 regiões a mesma área demora mais do que com 1.
    expect(start.data.seconds).toBe(expansionSeconds(REGION_BY_ID[S.onlyP].area, 2, 'campaign'));
    await expire();
    const direct = await srv.services.territory.completeDue(1);
    const state = (await A.get('/play/state')).data;
    expect(owner(state, S.onlyP)).toBe(A.governor.id);
    expect(state.control.filter((c: any) => c[1] === A.governor.id)).toHaveLength(3);
    // Concluir de novo não duplica nada.
    expect(direct + (await srv.services.territory.completeDue(1))).toBeLessThanOrEqual(1);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM region_control WHERE kingdom_id = 1 AND region_id = $1', [S.onlyP])).rows[0].n).toBe(1);
  });

  it('nova ocupação fica liberada assim que a anterior vence', async () => {
    const next = REGION_BY_ID[S.shared].neighbors.find((n) => owner({ control: [] }, n) === null && n !== S.p.region && n !== S.q.region && n !== S.onlyP);
    if (!next) return;
    const state = (await A.get('/play/state')).data;
    if (owner(state, next) !== null) return;
    const first = await A.post('/play/expand', { region: next });
    expect(first.status).toBe(200);
    await expire();
    const other = REGION_BY_ID[S.p.region].neighbors.concat(REGION_BY_ID[S.shared].neighbors, REGION_BY_ID[S.onlyP].neighbors).find((n) => n !== next && owner(state, n) === null);
    if (!other) return;
    // Sem esperar o worker: o próprio pedido conclui a ocupação vencida antes de validar.
    expect((await A.post('/play/expand', { region: other })).status).toBe(200);
  });
});
