import type { IncomingMessage, Server } from 'node:http';
import pg from 'pg';
import { WebSocket, WebSocketServer } from 'ws';
import { authFromToken, loadGovernor, parseCookies, SESSION_COOKIE } from './auth.js';
import { clientConfig, type Db } from './db.js';

interface Conn {
  ws: WebSocket;
  userId: number;
  governorId: number | null;
  kingdomId: number | null;
  allianceId: number | null;
  alive: boolean;
}

export type ServerEvent = { type: string; [k: string]: unknown };

type Envelope =
  | { k: 'user' | 'governor' | 'kingdom' | 'alliance'; id: number; e: ServerEvent }
  | { k: 'all'; e: ServerEvent }
  | { k: 'refresh'; id: number; gov: { id: number; kingdomId: number; allianceId: number | null } | null };

const CHANNEL = 'ku_events';
// Limite do payload de NOTIFY é 8000 bytes; eventos maiores viram pedido de ressincronização.
const MAX_PAYLOAD = 7900;

/**
 * Distribui eventos em tempo real. A audiência de cada evento é decidida no servidor
 * a partir do estado persistido (reino/aliança), nunca do que o cliente declara.
 * Eventos passam por Postgres LISTEN/NOTIFY, então várias instâncias (réplicas do
 * Railway ou funções da Vercel) entregam a todos os jogadores conectados em qualquer uma.
 */
export class Hub {
  private conns = new Set<Conn>();
  private wss = new WebSocketServer({ noServer: true });
  private heartbeat?: NodeJS.Timeout;
  private seq = 0;
  private bus: pg.Client | null = null;
  private busUrl: string | null = null;
  private closed = false;

  constructor(private db: Db) {}

  /** Conecta o barramento. Usa conexão direta (sem pooler), exigida por LISTEN. */
  async startBus(url: string) {
    this.busUrl = url;
    const client = new pg.Client(clientConfig(url));
    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        this.dispatch(JSON.parse(msg.payload));
      } catch {
        /* payload inválido é ignorado */
      }
    });
    client.on('error', () => this.reconnectBus(client));
    client.on('end', () => this.reconnectBus(client));
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    this.bus = client;
  }

  private reconnectBus(client: pg.Client) {
    if (this.bus !== client) return;
    this.bus = null;
    if (this.closed || !this.busUrl) return;
    console.error(JSON.stringify({ level: 'error', msg: 'barramento de eventos caiu; reconectando' }));
    setTimeout(() => {
      this.startBus(this.busUrl!).catch(() => this.reconnectBus(client));
    }, 1000);
  }

  /** Publica em ordem pela mesma conexão; sem barramento, entrega só localmente. */
  private publish(env: Envelope) {
    let payload = JSON.stringify(env);
    if (Buffer.byteLength(payload) > MAX_PAYLOAD && 'e' in env) {
      payload = JSON.stringify({ ...env, e: { type: 'resync' } });
    }
    const bus = this.bus;
    if (!bus) {
      this.dispatch(JSON.parse(payload));
      return;
    }
    bus.query('SELECT pg_notify($1, $2)', [CHANNEL, payload]).catch(() => this.dispatch(JSON.parse(payload)));
  }

  private dispatch(env: Envelope) {
    switch (env.k) {
      case 'refresh':
        for (const c of this.conns) {
          if (c.userId !== env.id) continue;
          c.governorId = env.gov?.id ?? null;
          c.kingdomId = env.gov?.kingdomId ?? null;
          c.allianceId = env.gov?.allianceId ?? null;
        }
        return;
      case 'all':
        return this.emit((c) => c.governorId !== null, env.e);
      case 'user':
        return this.emit((c) => c.userId === env.id, env.e);
      case 'governor':
        return this.emit((c) => c.governorId === env.id, env.e);
      case 'kingdom':
        return this.emit((c) => c.kingdomId === env.id, env.e);
      case 'alliance':
        return this.emit((c) => c.allianceId !== null && c.allianceId === env.id, env.e);
    }
  }

  attach(server: Server) {
    server.on('upgrade', (req, socket, head) => {
      if (!req.url?.startsWith('/ws')) {
        socket.destroy();
        return;
      }
      if (!this.originAllowed(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      authFromToken(this.db, token)
        .then((auth) => {
          if (!auth) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }
          this.wss.handleUpgrade(req, socket, head, (ws) => {
            const conn: Conn = {
              ws,
              userId: auth.userId,
              governorId: auth.governor?.id ?? null,
              kingdomId: auth.governor?.kingdomId ?? null,
              allianceId: auth.governor?.allianceId ?? null,
              alive: true,
            };
            this.conns.add(conn);
            ws.on('pong', () => (conn.alive = true));
            ws.on('message', (raw) => {
              if (raw.toString() === '{"type":"ping"}') this.send(conn, { type: 'pong', serverTime: Date.now() });
            });
            ws.on('close', () => this.conns.delete(conn));
            ws.on('error', () => this.conns.delete(conn));
            this.send(conn, { type: 'hello', serverTime: Date.now(), governorId: conn.governorId });
          });
        })
        .catch(() => socket.destroy());
    });
    this.heartbeat = setInterval(() => {
      for (const c of this.conns) {
        if (!c.alive) {
          c.ws.terminate();
          this.conns.delete(c);
          continue;
        }
        c.alive = false;
        c.ws.ping();
      }
    }, 25000);
  }

  private originAllowed(req: IncomingMessage) {
    const origin = req.headers.origin;
    if (!origin) return true; // clientes não-browser (testes) não enviam Origin
    try {
      const o = new URL(origin);
      const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host;
      return o.host === host || o.hostname === 'localhost' || o.hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }

  close() {
    this.closed = true;
    const bus = this.bus;
    this.bus = null;
    bus?.end().catch(() => {});
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const c of this.conns) c.ws.terminate();
    this.conns.clear();
    this.wss.close();
  }

  private send(c: Conn, event: ServerEvent) {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify({ ...event, seq: ++this.seq }));
  }

  private emit(filter: (c: Conn) => boolean, event: ServerEvent) {
    for (const c of this.conns) if (filter(c)) this.send(c, event);
  }

  toUser(userId: number, e: ServerEvent) {
    this.publish({ k: 'user', id: userId, e });
  }
  toGovernor(governorId: number, e: ServerEvent) {
    this.publish({ k: 'governor', id: governorId, e });
  }
  toKingdom(kingdomId: number, e: ServerEvent) {
    this.publish({ k: 'kingdom', id: kingdomId, e });
  }
  toAlliance(allianceId: number, e: ServerEvent) {
    this.publish({ k: 'alliance', id: allianceId, e });
  }
  toAllGovernors(e: ServerEvent) {
    this.publish({ k: 'all', e });
  }

  /** Propaga a todas as instâncias o reino/aliança atual de um usuário após mudança persistida. */
  async refreshUser(userId: number) {
    const gov = await loadGovernor(this.db, userId);
    this.publish({ k: 'refresh', id: userId, gov: gov && { id: gov.id, kingdomId: gov.kingdomId, allianceId: gov.allianceId } });
  }

  async refreshGovernor(governorId: number) {
    const { rows } = await this.db.query('SELECT user_id FROM governors WHERE id = $1', [governorId]);
    if (rows[0]) await this.refreshUser(rows[0].user_id);
  }

  onlineCount() {
    return this.conns.size;
  }
}
