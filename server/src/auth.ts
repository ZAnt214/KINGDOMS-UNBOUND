import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';
import type { Db } from './db.js';
import type { GameMode } from '../../shared/play/rules.js';
import type { WorldSeat } from '../../shared/play/types.js';
import { HttpError } from './http.js';

export const SESSION_COOKIE = 'ku_session';

export interface GovernorCtx {
  id: number;
  name: string;
  kingdomId: number;
  mode: GameMode;
  allianceId: number | null;
  allianceRank: number | null;
}

export interface AuthCtx {
  userId: number;
  username: string;
  /** Lugar do usuário no mundo pedido (cabeçalho X-KU-World); sem pedido, o da campanha. */
  governor: GovernorCtx | null;
  worlds: WorldSeat[];
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthCtx;
  }
}

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* cookie malformado é ignorado */
    }
  }
  return out;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(db: Db, userId: number, res: Response) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 86400_000);
  await db.query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
    userId,
    hashToken(token),
    expires,
  ]);
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expires.toUTCString()}`,
  ];
  if (config.production) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

interface Seat extends GovernorCtx {
  worldName: string;
  finished: boolean;
  endsAt: number | null;
  startedAt: number | null;
}

/** Todos os lugares do usuário: campanha primeiro, depois partidas rápidas da mais recente para a mais antiga. */
export async function loadSeats(db: Db, userId: number): Promise<Seat[]> {
  const { rows } = await db.query(
    `SELECT g.id, g.name, g.kingdom_id, k.mode, k.name AS world_name, k.finished_at, k.ends_at, k.started_at, m.alliance_id, m.rank
       FROM governors g
       JOIN kingdoms k ON k.id = g.kingdom_id
       LEFT JOIN alliance_members m ON m.governor_id = g.id
      WHERE g.user_id = $1
      ORDER BY (k.mode = 'campaign') DESC, g.id DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    kingdomId: r.kingdom_id,
    mode: r.mode as GameMode,
    allianceId: r.alliance_id === null ? null : Number(r.alliance_id),
    allianceRank: r.rank ?? null,
    worldName: r.world_name,
    finished: r.finished_at !== null,
    endsAt: r.ends_at ? new Date(r.ends_at).getTime() : null,
    startedAt: r.started_at ? new Date(r.started_at).getTime() : null,
  }));
}

/** Escolhe o lugar do mundo pedido; sem pedido (ou pedido de mundo onde não está), o da campanha. */
export function pickSeat<T extends { kingdomId: number; mode: GameMode }>(seats: T[], worldId: number | null): T | null {
  return (worldId !== null ? seats.find((s) => s.kingdomId === worldId) : undefined) ?? seats.find((s) => s.mode === 'campaign') ?? null;
}

const toCtx = (s: Seat): GovernorCtx => ({ id: s.id, name: s.name, kingdomId: s.kingdomId, mode: s.mode, allianceId: s.allianceId, allianceRank: s.allianceRank });

export async function authFromToken(db: Db, token: string | undefined, worldId: number | null = null): Promise<AuthCtx | null> {
  if (!token) return null;
  const { rows } = await db.query(
    `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const u = rows[0];
  if (!u) return null;
  const seats = await loadSeats(db, Number(u.id));
  const seat = pickSeat(seats, worldId);
  return {
    userId: Number(u.id),
    username: u.username,
    governor: seat && toCtx(seat),
    worlds: seats.map((s) => ({ id: s.kingdomId, name: s.worldName, mode: s.mode, governorId: s.id, finished: s.finished, endsAt: s.endsAt, startedAt: s.startedAt })),
  };
}

export const worldParam = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export function authMiddleware(db: Db) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    authFromToken(db, token, worldParam(req.headers['x-ku-world']))
      .then((auth) => {
        if (auth) req.auth = auth;
        next();
      })
      .catch(next);
  };
}

export function requireUser(req: Request): AuthCtx {
  if (!req.auth) throw new HttpError(401, 'unauthenticated', 'Faça login para continuar.');
  return req.auth;
}

export function requireGovernor(req: Request): GovernorCtx {
  const auth = requireUser(req);
  if (!auth.governor) throw new HttpError(409, 'no_governor', 'Você ainda não entrou neste mundo.');
  return auth.governor;
}

/** Defesa CSRF: mutações precisam de um cabeçalho que formulários cross-site não conseguem enviar. */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-ku'] !== '1') {
    next(new HttpError(403, 'csrf', 'Requisição rejeitada.'));
    return;
  }
  next();
}
