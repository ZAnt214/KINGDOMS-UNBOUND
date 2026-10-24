import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { createGameServer } from '../../server/src/app.js';
import { createPool, type Db } from '../../server/src/db.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://ku:ku@localhost:5432/ku_test';

export async function resetDb(): Promise<Db> {
  const db = createPool(TEST_DB);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  return db;
}

export async function startServer(db: Db) {
  const game = await createGameServer(db, { directUrl: TEST_DB });
  await new Promise<void>((r) => game.server.listen(0, '127.0.0.1', () => r()));
  const port = (game.server.address() as AddressInfo).port;
  return { ...game, base: `http://127.0.0.1:${port}`, port };
}

/** Sessão independente de jogador (cookie próprio), como um navegador separado. */
export class Player {
  cookie = '';
  ws: WebSocket | null = null;
  events: any[] = [];

  constructor(public base: string) {}

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${this.base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-KU': '1', ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const data: any = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }
  get(path: string) {
    return this.req('GET', path);
  }
  post(path: string, body: unknown = {}) {
    return this.req('POST', path, body);
  }

  static async create(base: string, name: string, kingdomId = 1, civilization = 'auren') {
    const p = new Player(base);
    const username = `${name.toLowerCase()}${Math.random().toString(36).slice(2, 6)}`;
    const reg = await p.post('/auth/register', { username, password: 'senha-segura-1' });
    if (reg.status !== 200) throw new Error(`register ${reg.status} ${JSON.stringify(reg.data)}`);
    const gov = await p.post('/governor', { name: `${name}${Math.random().toString(36).slice(2, 5)}`, civilization, kingdomId });
    if (gov.status !== 200) throw new Error(`governor ${gov.status} ${JSON.stringify(gov.data)}`);
    const me = await p.get('/me');
    return Object.assign(p, { governor: me.data.governor, username });
  }

  async connect() {
    const url = this.base.replace('http', 'ws') + '/ws';
    this.ws = new WebSocket(url, { headers: { Cookie: this.cookie } });
    this.ws.on('message', (m) => this.events.push(JSON.parse(m.toString())));
    await new Promise<void>((resolve, reject) => {
      this.ws!.once('open', () => resolve());
      this.ws!.once('error', reject);
    });
    await this.waitFor((e) => e.type === 'hello');
  }

  async waitFor(pred: (e: any) => boolean, timeout = 3000): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = this.events.find(pred);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('evento não recebido no tempo limite');
  }

  /** Garante que nenhum evento que satisfaça `pred` chega no intervalo. */
  async expectNone(pred: (e: any) => boolean, ms = 400) {
    await new Promise((r) => setTimeout(r, ms));
    if (this.events.some(pred)) throw new Error('evento indevido recebido');
  }

  close() {
    this.ws?.close();
  }
}

export type TestPlayer = Player & { governor: any; username: string };
