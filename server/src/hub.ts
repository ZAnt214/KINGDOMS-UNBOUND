import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { authFromToken, loadGovernor, parseCookies, SESSION_COOKIE } from './auth.js';
import type { Db } from './db.js';

interface Conn {
  ws: WebSocket;
  userId: number;
  governorId: number | null;
  kingdomId: number | null;
  allianceId: number | null;
  alive: boolean;
}

export type ServerEvent = { type: string; [k: string]: unknown };

/**
 * Distribui eventos em tempo real. A audiência de cada evento é decidida no servidor
 * a partir do estado persistido (reino/aliança), nunca do que o cliente declara.
 * Instância única na Fase A; múltiplas instâncias exigiriam pub/sub (Redis).
 */
export class Hub {
  private conns = new Set<Conn>();
  private wss = new WebSocketServer({ noServer: true });
  private heartbeat?: NodeJS.Timeout;
  private seq = 0;

  constructor(private db: Db) {}

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
    this.emit((c) => c.userId === userId, e);
  }
  toGovernor(governorId: number, e: ServerEvent) {
    this.emit((c) => c.governorId === governorId, e);
  }
  toKingdom(kingdomId: number, e: ServerEvent) {
    this.emit((c) => c.kingdomId === kingdomId, e);
  }
  toAlliance(allianceId: number, e: ServerEvent) {
    this.emit((c) => c.allianceId !== null && c.allianceId === allianceId, e);
  }
  toAllGovernors(e: ServerEvent) {
    this.emit((c) => c.governorId !== null, e);
  }

  /** Recarrega reino/aliança das conexões de um usuário após mudança persistida. */
  async refreshUser(userId: number) {
    const gov = await loadGovernor(this.db, userId);
    for (const c of this.conns) {
      if (c.userId !== userId) continue;
      c.governorId = gov?.id ?? null;
      c.kingdomId = gov?.kingdomId ?? null;
      c.allianceId = gov?.allianceId ?? null;
    }
  }

  async refreshGovernor(governorId: number) {
    const { rows } = await this.db.query('SELECT user_id FROM governors WHERE id = $1', [governorId]);
    if (rows[0]) await this.refreshUser(rows[0].user_id);
  }

  onlineCount() {
    return this.conns.size;
  }
}
