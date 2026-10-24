import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../server/src/db.js';
import { Player, resetDb, startServer, type TestPlayer } from './helpers.js';

// Simula várias instâncias (funções Vercel ou réplicas Railway) sobre o mesmo banco:
// cada jogador está conectado a um processo diferente e o tempo real precisa atravessar.
let db: Db;
let s1: Awaited<ReturnType<typeof startServer>>;
let s2: Awaited<ReturnType<typeof startServer>>;
let A: TestPlayer;
let B: TestPlayer;

beforeAll(async () => {
  db = await resetDb();
  s1 = await startServer(db);
  s2 = await startServer(db);
  A = (await Player.create(s1.base, 'Inst1')) as TestPlayer;
  B = (await Player.create(s2.base, 'Inst2')) as TestPlayer;
  await A.connect();
  await B.connect();
});

afterAll(async () => {
  A?.close();
  B?.close();
  await s1?.close();
  await s2?.close();
  await db?.end();
});

describe('tempo real entre instâncias', () => {
  it('chat do reino de A (instância 1) chega a B (instância 2)', async () => {
    const ch = (await A.get('/chat/channels')).data.channels.find((c: any) => c.type === 'kingdom');
    const r = await A.post(`/chat/${ch.id}/messages`, { body: 'atravessando instâncias' });
    await B.waitFor((e) => e.type === 'chat.message' && e.message.id === r.data.message.id);
  });

  it('aprovação na aliança atualiza a ACL da conexão de B na outra instância', async () => {
    const created = await A.post('/alliances', { name: 'Ponte', tag: 'PNT' });
    const ap = await B.post(`/alliances/${created.data.allianceId}/apply`, {});
    await A.waitFor((e) => e.type === 'alliance.updated');
    expect((await A.post(`/alliance/applications/${ap.data.applicationId}/approve`)).status).toBe(200);
    await B.waitFor((e) => e.type === 'membership.changed');
    const ch = (await B.get('/chat/channels')).data.channels.find((c: any) => c.type === 'alliance');
    const r = await A.post(`/chat/${ch.id}/messages`, { body: 'bem-vindo' });
    await B.waitFor((e) => e.type === 'chat.message' && e.message.id === r.data.message.id);
    // Depois de sair, B não recebe mais nada da aliança, em nenhuma instância.
    expect((await B.post('/alliance/leave')).status).toBe(200);
    await new Promise((res) => setTimeout(res, 150));
    const r2 = await A.post(`/chat/${ch.id}/messages`, { body: 'segredo' });
    await B.expectNone((e) => e.type === 'chat.message' && e.message.id === r2.data.message.id, 300);
  });

  it('obra concluída por um worker notifica jogador em outra instância, uma única vez', async () => {
    const k = `k-${Date.now()}`;
    expect((await B.post('/city/upgrade', { building: 'town_hall', idempotencyKey: k })).status).toBe(200);
    A.events.length = 0;
    B.events.length = 0;
    await db.query(`UPDATE building_queues SET ends_at = now() - interval '1 second' WHERE city_id = $1 AND status = 'active'`, [
      B.governor.cityId,
    ]);
    await B.waitFor((e) => e.type === 'city.updated' && e.state.levels.town_hall === 2, 4000);
    await A.waitFor((e) => e.type === 'map.city' && e.city.cityId === B.governor.cityId && e.city.hallLevel === 2);
    // Os dois workers competem pela mesma obra: o lock garante uma conclusão só.
    await new Promise((res) => setTimeout(res, 1500));
    const done = await db.query(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'building.completed'`);
    expect(done.rows[0].n).toBe(1);
    expect(B.events.filter((e) => e.type === 'city.updated' && e.state.levels.town_hall === 2)).toHaveLength(1);
  });
});
