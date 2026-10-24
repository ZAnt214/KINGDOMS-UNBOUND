import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upgradeCost } from '../../shared/rules.js';
import type { Db } from '../../server/src/db.js';
import { Player, resetDb, startServer, type TestPlayer } from './helpers.js';

let db: Db;
let srv: Awaited<ReturnType<typeof startServer>>;
let A: TestPlayer;
let B: TestPlayer;
let C: TestPlayer; // reino 2
let D: TestPlayer; // reino 1, fora da aliança

const key = () => `k-${Math.random().toString(36).slice(2)}${Date.now()}`;

async function forceQueueDue(cityId: number) {
  // Simula a passagem do tempo movendo o relógio da obra para o passado.
  await db.query(
    `UPDATE building_queues SET started_at = started_at - interval '1 hour', ends_at = now() - interval '1 second'
      WHERE city_id = $1 AND status = 'active'`,
    [cityId],
  );
}

async function ledgerMatchesBalance(cityId: number) {
  const { rows } = await db.query(
    `SELECT b.resource, b.amount::float8 AS amount, COALESCE(SUM(l.delta), 0)::float8 AS ledger
       FROM resource_balances b LEFT JOIN resource_ledger l ON l.city_id = b.city_id AND l.resource = b.resource
      WHERE b.city_id = $1 GROUP BY b.resource, b.amount`,
    [cityId],
  );
  for (const r of rows) expect(Math.abs(r.amount - r.ledger)).toBeLessThan(0.01);
}

beforeAll(async () => {
  db = await resetDb();
  srv = await startServer(db);
  A = (await Player.create(srv.base, 'Alfa', 1, 'auren')) as TestPlayer;
  B = (await Player.create(srv.base, 'Beta', 1, 'kharuun')) as TestPlayer;
  C = (await Player.create(srv.base, 'Gama', 2, 'veyra')) as TestPlayer;
  D = (await Player.create(srv.base, 'Delta', 1, 'veyra')) as TestPlayer;
  await Promise.all([A, B, C, D].map((p) => p.connect()));
});

afterAll(async () => {
  for (const p of [A, B, C, D]) p?.close();
  await srv?.close();
  await db?.end();
});

describe('A1 identidade e mundo', () => {
  it('A-01/A-02: contas independentes no mesmo reino', async () => {
    expect(A.governor.id).not.toBe(B.governor.id);
    expect(A.governor.cityId).not.toBe(B.governor.cityId);
    expect(A.governor.kingdomId).toBe(1);
    expect(B.governor.kingdomId).toBe(1);
    expect(C.governor.kingdomId).toBe(2);
  });

  it('rejeita nome de governador duplicado e segundo governador', async () => {
    const p = new Player(srv.base);
    await p.post('/auth/register', { username: `dup${Date.now()}`, password: 'senha-segura-1' });
    const dup = await p.post('/governor', { name: A.governor.name.toUpperCase(), civilization: 'auren', kingdomId: 1 });
    expect(dup.status).toBe(409);
    const again = await A.post('/governor', { name: 'Outro', civilization: 'auren', kingdomId: 1 });
    expect(again.status).toBe(409);
  });

  it('sessão: sem cookie → 401; sem cabeçalho anti-CSRF → 403; login funciona', async () => {
    const anon = new Player(srv.base);
    expect((await anon.get('/city')).status).toBe(401);
    const noCsrf = await A.req('POST', '/city/upgrade', { building: 'farm', idempotencyKey: key() }, { 'X-KU': '0' });
    expect(noCsrf.status).toBe(403);
    const fresh = new Player(srv.base);
    const bad = await fresh.post('/auth/login', { username: A.username, password: 'errada-123' });
    expect(bad.status).toBe(401);
    const ok = await fresh.post('/auth/login', { username: A.username, password: 'senha-segura-1' });
    expect(ok.status).toBe(200);
    expect((await fresh.get('/me')).data.governor.id).toBe(A.governor.id);
  });
});

describe('A2 cidade e economia', () => {
  it('A-03: recursos isolados por governador', async () => {
    const a = (await A.get('/city')).data;
    const b = (await B.get('/city')).data;
    expect(a.cityId).not.toBe(b.cityId);
    expect(a.resources.food).toBeGreaterThanOrEqual(3000);
    // B não consegue ver/alterar a cidade de A: a API só expõe a própria cidade.
    expect(b.cityId).toBe(B.governor.cityId);
  });

  it('A-04/A-20: custo debitado uma vez, chave repetida não cobra de novo', async () => {
    const before = (await A.get('/city')).data;
    const k = key();
    // Mesmo comando enviado 5 vezes em paralelo (duplo toque/reenvio de rede).
    const results = await Promise.all(Array.from({ length: 5 }, () => A.post('/city/upgrade', { building: 'town_hall', idempotencyKey: k })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.data.replayed === false)).toHaveLength(1);
    const queueIds = new Set(results.map((r) => r.data.queueId));
    expect(queueIds.size).toBe(1);
    const after = (await A.get('/city')).data;
    const cost = upgradeCost('town_hall', 1);
    expect(before.resources.food - after.resources.food).toBeGreaterThan(cost.food! - 5);
    expect(before.resources.food - after.resources.food).toBeLessThan(cost.food! + 1);
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM resource_ledger WHERE city_id = $1 AND reason = 'build_cost'`, [
      A.governor.cityId,
    ]);
    expect(rows[0].n).toBe(3); // alimento, madeira e pedra: uma linha cada
    await ledgerMatchesBalance(A.governor.cityId);
  });

  it('fila única: segunda obra concorrente é rejeitada', async () => {
    const r = await A.post('/city/upgrade', { building: 'farm', idempotencyKey: key() });
    expect(r.status).toBe(409);
    expect(r.data.error).toBe('queue_busy');
  });

  it('servidor ignora custo/duração enviados pelo cliente e valida requisitos', async () => {
    const r = await B.post('/city/upgrade', { building: 'farm', idempotencyKey: key(), cost: { food: 0 }, duration: 0 });
    expect(r.status).toBe(400);
    expect(r.data.error).toBe('requirement'); // fazenda não pode passar a prefeitura
    const bogus = await B.post('/city/upgrade', { building: 'castelo_dourado', idempotencyKey: key() });
    expect(bogus.status).toBe(400);
  });

  it('rejeita obra sem recursos e não debita nada', async () => {
    await db.query(`UPDATE resource_balances SET amount = 10, settled_at = now() WHERE city_id = $1`, [D.governor.cityId]);
    const r = await D.post('/city/upgrade', { building: 'town_hall', idempotencyKey: key() });
    expect(r.status).toBe(400);
    expect(r.data.error).toBe('insufficient_resources');
    const q = await db.query(`SELECT COUNT(*)::int AS n FROM building_queues WHERE city_id = $1`, [D.governor.cityId]);
    expect(q.rows[0].n).toBe(0);
  });

  it('A-06/A-05: obra conclui pelo relógio do servidor (worker) e notifica em tempo real', async () => {
    A.events.length = 0;
    B.events.length = 0;
    await forceQueueDue(A.governor.cityId);
    const ev = await A.waitFor((e) => e.type === 'city.updated' && e.state.levels.town_hall === 2, 4000);
    expect(ev.state.queue).toBeNull();
    // B (mesmo reino) recebe atualização do mapa sem recarregar (A-08)
    const m = await B.waitFor((e) => e.type === 'map.city' && e.city.cityId === A.governor.cityId && e.city.hallLevel === 2);
    expect(m.city.power).toBeGreaterThan(0);
    // C (outro reino) não recebe
    await C.expectNone((e) => e.type === 'map.city' && e.city.cityId === A.governor.cityId, 200);
    // Persistência: nova sessão vê o mesmo estado
    const s = (await A.get('/city')).data;
    expect(s.levels.town_hall).toBe(2);
    const done = await db.query(`SELECT COUNT(*)::int AS n FROM building_queues WHERE city_id = $1 AND status = 'done'`, [A.governor.cityId]);
    expect(done.rows[0].n).toBe(1);
    await ledgerMatchesBalance(A.governor.cityId);
  });

  it('obra vencida com servidor parado conclui após reinício sem duplicar nível', async () => {
    const r = await B.post('/city/upgrade', { building: 'town_hall', idempotencyKey: key() });
    expect(r.status).toBe(200);
    await srv.close();
    await forceQueueDue(B.governor.cityId);
    srv = await startServer(db);
    for (const p of [A, B, C, D]) {
      p.base = srv.base;
      p.close();
    }
    await Promise.all([A, B, C, D].map((p) => p.connect()));
    const s = (await B.get('/city')).data;
    expect(s.levels.town_hall).toBe(2);
    const s2 = (await B.get('/city')).data;
    expect(s2.levels.town_hall).toBe(2);
    await ledgerMatchesBalance(B.governor.cityId);
  });

  it('produção offline acumula até a capacidade, com ledger', async () => {
    await db.query(`UPDATE resource_balances SET settled_at = now() - interval '100 hours' WHERE city_id = $1`, [D.governor.cityId]);
    const s = (await D.get('/city')).data;
    expect(s.resources.food).toBe(s.capacity);
    expect(s.resources.gold).toBe(10); // sem mina de ouro, não produz ouro
  });
});

describe('A3 mapa compartilhado', () => {
  it('A-07: cidades do mesmo reino aparecem; outro reino não', async () => {
    const r = await B.get('/map/cities?x0=0&y0=0&x1=119&y1=119');
    const ids = r.data.cities.map((c: any) => c.cityId);
    expect(ids).toContain(A.governor.cityId);
    expect(ids).toContain(B.governor.cityId);
    expect(ids).not.toContain(C.governor.cityId);
    expect((await B.get(`/map/city/${C.governor.cityId}`)).status).toBe(404);
  });

  it('cidades em posições únicas e terreno válido', async () => {
    const { rows } = await db.query('SELECT kingdom_id, x, y FROM cities');
    const keys = rows.map((r) => `${r.kingdom_id}:${r.x}:${r.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('A4 alianças e RBAC', () => {
  let allianceId: number;
  let appId: number;

  it('A-09: A cria, B solicita', async () => {
    const r = await A.post('/alliances', { name: 'Guardiões do Vale', tag: 'GDV', description: 'Teste' });
    expect(r.status).toBe(200);
    allianceId = r.data.allianceId;
    const dup = await D.post('/alliances', { name: 'guardiões do vale', tag: 'XYZ' });
    expect(dup.status).toBe(409);
    A.events.length = 0;
    const ap = await B.post(`/alliances/${allianceId}/apply`, { message: 'Quero entrar' });
    expect(ap.status).toBe(200);
    appId = ap.data.applicationId;
    await A.waitFor((e) => e.type === 'alliance.updated');
    const again = await B.post(`/alliances/${allianceId}/apply`, {});
    expect(again.status).toBe(409);
  });

  it('isolamento: governador de outro reino não vê nem solicita', async () => {
    expect((await C.get(`/alliances/${allianceId}`)).status).toBe(404);
    expect((await C.post(`/alliances/${allianceId}/apply`, {})).status).toBe(404);
  });

  it('A-10: não-membro não aprova; líder aprova; membros sincronizam', async () => {
    expect((await D.post(`/alliance/applications/${appId}/approve`)).status).toBe(403);
    expect((await B.post(`/alliance/applications/${appId}/approve`)).status).toBe(403);
    B.events.length = 0;
    const ok = await A.post(`/alliance/applications/${appId}/approve`);
    expect(ok.status).toBe(200);
    await B.waitFor((e) => e.type === 'membership.changed');
    const detail = (await B.get(`/alliances/${allianceId}`)).data;
    expect(detail.isMember).toBe(true);
    expect(detail.members.map((m: any) => m.governor_id).sort()).toEqual([A.governor.id, B.governor.id].sort());
    const me = (await B.get('/me')).data.governor;
    expect(me.allianceId).toBe(allianceId);
    expect(me.allianceRank).toBe(1);
  });

  it('R1 não expulsa nem promove; líder não sai sem transferir', async () => {
    expect((await B.post(`/alliance/members/${A.governor.id}/kick`)).status).toBe(403);
    expect((await B.post(`/alliance/members/${A.governor.id}/rank`, { rank: 4 })).status).toBe(403);
    expect((await B.post(`/alliance/members/${B.governor.id}/rank`, { rank: 4 })).status).toBe(403);
    expect((await A.post('/alliance/leave')).status).toBe(409);
    expect((await A.post(`/alliance/members/${B.governor.id}/rank`, { rank: 5 })).status).toBe(400);
    expect((await A.post(`/alliance/members/${B.governor.id}/rank`, { rank: 3 })).status).toBe(200);
    expect((await B.get('/me')).data.governor.allianceRank).toBe(3);
  });

  it('D candidata-se; R3 não aprova; R4 aprova', async () => {
    const ap = await D.post(`/alliances/${allianceId}/apply`, {});
    expect((await B.post(`/alliance/applications/${ap.data.applicationId}/approve`)).status).toBe(403);
    await A.post(`/alliance/members/${B.governor.id}/rank`, { rank: 4 });
    expect((await B.post(`/alliance/applications/${ap.data.applicationId}/approve`)).status).toBe(200);
    // R4 expulsa R1, mas não expulsa o R5
    expect((await B.post(`/alliance/members/${A.governor.id}/kick`)).status).toBe(403);
    expect((await B.post(`/alliance/members/${D.governor.id}/kick`)).status).toBe(200);
    expect((await D.get('/me')).data.governor.allianceId).toBeNull();
  });
});

describe('A5 chat', () => {
  let channels: Record<string, number>;

  beforeAll(async () => {
    const r = await A.get('/chat/channels');
    channels = Object.fromEntries(r.data.channels.map((c: any) => [c.type, c.id]));
  });

  it('A-11: chat do reino transmite entre A e B, não para outro reino', async () => {
    B.events.length = 0;
    C.events.length = 0;
    const r = await A.post(`/chat/${channels.kingdom}/messages`, { body: 'Olá reino! Encontro em X:12 Y:40' });
    expect(r.status).toBe(200);
    const ev = await B.waitFor((e) => e.type === 'chat.message' && e.message.id === r.data.message.id);
    expect(ev.message.attachments).toEqual([{ kind: 'coords', kingdomId: 1, x: 12, y: 40 }]);
    await C.expectNone((e) => e.type === 'chat.message' && e.message.id === r.data.message.id, 200);
    expect((await C.get(`/chat/${channels.kingdom}/messages`)).status).toBe(403);
  });

  it('A-12/A-15: chat da aliança só para membros', async () => {
    expect(channels.alliance).toBeTruthy();
    B.events.length = 0;
    D.events.length = 0;
    const r = await B.post(`/chat/${channels.alliance}/messages`, { body: 'Mensagem secreta da aliança' });
    expect(r.status).toBe(200);
    await A.waitFor((e) => e.type === 'chat.message' && e.message.id === r.data.message.id);
    await D.expectNone((e) => e.type === 'chat.message' && e.message.id === r.data.message.id, 200);
    expect((await D.get(`/chat/${channels.alliance}/messages`)).status).toBe(403);
    expect((await D.post(`/chat/${channels.alliance}/messages`, { body: 'invasão' })).status).toBe(403);
    expect((await C.get(`/chat/${channels.alliance}/messages`)).status).toBe(403);
  });

  it('A-13: chat global cruza reinos', async () => {
    C.events.length = 0;
    const r = await A.post(`/chat/${channels.global}/messages`, { body: 'Saudações a todos os reinos' });
    const ev = await C.waitFor((e) => e.type === 'chat.message' && e.message.id === r.data.message.id);
    expect(ev.message.author.kingdomId).toBe(1);
    const fromC = await C.post(`/chat/${channels.global}/messages`, { body: 'Resposta do reino 2' });
    await A.waitFor((e) => e.type === 'chat.message' && e.message.id === fromC.data.message.id);
  });

  it('A-14: histórico persiste e pagina; não lidas contam', async () => {
    for (let i = 0; i < 4; i++) {
      await B.post(`/chat/${channels.kingdom}/messages`, { body: `msg ${i}` });
    }
    const page1 = (await D.get(`/chat/${channels.kingdom}/messages?limit=2`)).data;
    expect(page1.messages.map((m: any) => m.body)).toEqual(['msg 2', 'msg 3']);
    expect(page1.hasMore).toBe(true);
    const page2 = (await D.get(`/chat/${channels.kingdom}/messages?limit=2&before=${page1.messages[0].id}`)).data;
    expect(page2.messages.map((m: any) => m.body)).toEqual(['msg 0', 'msg 1']);
    const ch = (await D.get('/chat/channels')).data.channels.find((c: any) => c.type === 'kingdom');
    expect(ch.unread).toBe(5);
    await D.post(`/chat/${channels.kingdom}/read`, { messageId: page1.messages[1].id });
    const ch2 = (await D.get('/chat/channels')).data.channels.find((c: any) => c.type === 'kingdom');
    expect(ch2.unread).toBe(0);
  });

  it('valida conteúdo e aplica rate limit', async () => {
    expect((await A.post(`/chat/${channels.kingdom}/messages`, { body: '   ' })).status).toBe(400);
    expect((await A.post(`/chat/${channels.kingdom}/messages`, { body: 'x'.repeat(501) })).status).toBe(400);
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await A.post(`/chat/${channels.kingdom}/messages`, { body: `spam ${i}` })).status);
    expect(statuses).toContain(429);
  });

  it('A-16: sair da aliança revoga acesso imediatamente (REST e tempo real)', async () => {
    // B é R4; A (líder) transfere liderança para B, depois sai.
    expect((await A.post(`/alliance/members/${B.governor.id}/transfer`)).status).toBe(200);
    expect((await A.post('/alliance/leave')).status).toBe(200);
    A.events.length = 0;
    await new Promise((r) => setTimeout(r, 2200)); // B respeita o rate limit do chat
    const r = await B.post(`/chat/${channels.alliance}/messages`, { body: 'depois da saída' });
    expect(r.status).toBe(200);
    await A.expectNone((e) => e.type === 'chat.message' && e.message.id === r.data.message.id, 300);
    expect((await A.get(`/chat/${channels.alliance}/messages`)).status).toBe(403);
    // Último membro sai → aliança dissolvida e canal arquivado
    expect((await B.post('/alliance/leave')).status).toBe(200);
    expect((await B.get(`/alliances/${(await db.query('SELECT id FROM alliances LIMIT 1')).rows[0].id}`)).status).toBe(404);
    const audit = await db.query(`SELECT action FROM audit_logs WHERE action LIKE 'alliance.%' ORDER BY id`);
    expect(audit.rows.map((r) => r.action)).toContain('alliance.disbanded');
  });
});
