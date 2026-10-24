import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';
import type { Db } from './db.js';
import { HttpError } from './http.js';

export const SESSION_COOKIE = 'ku_session';

export interface GovernorCtx {
  id: number;
  name: string;
  kingdomId: number;
  civilization: string;
  cityId: number;
  allianceId: number | null;
  allianceRank: number | null;
}

export interface AuthCtx {
  userId: number;
  username: string;
  governor: GovernorCtx | null;
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

export async function loadGovernor(db: Db, userId: number): Promise<GovernorCtx | null> {
  const { rows } = await db.query(
    `SELECT g.id, g.name, g.kingdom_id, g.civilization, c.id AS city_id, m.alliance_id, m.rank
       FROM governors g
       JOIN cities c ON c.governor_id = g.id
       LEFT JOIN alliance_members m ON m.governor_id = g.id
      WHERE g.user_id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    kingdomId: r.kingdom_id,
    civilization: r.civilization,
    cityId: r.city_id,
    allianceId: r.alliance_id ?? null,
    allianceRank: r.rank ?? null,
  };
}

export async function authFromToken(db: Db, token: string | undefined): Promise<AuthCtx | null> {
  if (!token) return null;
  const { rows } = await db.query(
    `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const u = rows[0];
  if (!u) return null;
  return { userId: u.id, username: u.username, governor: await loadGovernor(db, u.id) };
}

export function authMiddleware(db: Db) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    authFromToken(db, token)
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
  if (!auth.governor) throw new HttpError(409, 'no_governor', 'Crie seu governador primeiro.');
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
