import { Router } from 'express';
import { z } from 'zod';
import { BUILDING_TYPES, BUILDINGS, CIVILIZATIONS, RULES_VERSION } from '../../shared/rules.js';
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  hashToken,
  parseCookies,
  requireGovernor,
  requireUser,
  SESSION_COOKIE,
  verifyPassword,
} from './auth.js';
import { config } from './config.js';
import { type Db, tx } from './db.js';
import { conflict, handler, HttpError, notFound, parse, RateLimiter } from './http.js';
import type { Hub } from './hub.js';
import { AllianceService } from './services/alliance.js';
import { ChatService } from './services/chat.js';
import { CityService, civilizationExists, mapCitiesInArea, mapCitySummary } from './services/city.js';

const id = z.coerce.number().int().positive();
const credentials = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'mínimo de 3 caracteres')
    .max(20, 'máximo de 20 caracteres')
    .regex(/^[A-Za-z0-9_.-]+$/, 'use letras, números, _ . -'),
  password: z.string().min(8, 'mínimo de 8 caracteres').max(128),
});

export function apiRouter(db: Db, hub: Hub, services: { city: CityService; alliance: AllianceService; chat: ChatService }) {
  const r = Router();
  const { city, alliance, chat } = services;
  const authLimiter = new RateLimiter(config.authRatePerMinute, 60);

  r.get(
    '/meta',
    handler(async () => {
      const k = await db.query(
        `SELECT k.id, k.name, k.width, k.height, k.seed, k.status, COUNT(g.id)::int AS population
           FROM kingdoms k LEFT JOIN governors g ON g.kingdom_id = k.id GROUP BY k.id ORDER BY k.id`,
      );
      return {
        rulesVersion: RULES_VERSION,
        serverTime: Date.now(),
        civilizations: CIVILIZATIONS,
        buildings: BUILDING_TYPES.map((t) => BUILDINGS[t]),
        kingdoms: k.rows.map((row) => ({ ...row, capacity: config.kingdomCapacity })),
      };
    }),
  );

  r.post(
    '/auth/register',
    handler(async (req, res) => {
      if (!authLimiter.take(`reg:${req.ip}`)) throw new HttpError(429, 'rate_limited', 'Muitas tentativas. Aguarde.');
      const { username, password } = parse(credentials, req.body);
      const exists = await db.query('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username]);
      if (exists.rowCount) throw conflict('username_taken', 'Este usuário já existe.');
      const u = await db.query('INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id', [
        username,
        await hashPassword(password),
      ]);
      await createSession(db, u.rows[0].id, res);
      return { ok: true };
    }),
  );

  r.post(
    '/auth/login',
    handler(async (req, res) => {
      const { username, password } = parse(credentials.pick({ username: true }).extend({ password: z.string().max(128) }), req.body);
      if (!authLimiter.take(`login:${req.ip}:${username.toLowerCase()}`)) {
        throw new HttpError(429, 'rate_limited', 'Muitas tentativas. Aguarde um minuto.');
      }
      const u = await db.query('SELECT id, password_hash FROM users WHERE lower(username) = lower($1)', [username]);
      if (!u.rows[0] || !(await verifyPassword(password, u.rows[0].password_hash))) {
        throw new HttpError(401, 'invalid_credentials', 'Usuário ou senha incorretos.');
      }
      await createSession(db, u.rows[0].id, res);
      return { ok: true };
    }),
  );

  r.post(
    '/auth/logout',
    handler(async (req, res) => {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
      clearSessionCookie(res);
      return { ok: true };
    }),
  );

  r.get(
    '/me',
    handler(async (req) => {
      const auth = requireUser(req);
      return { userId: auth.userId, username: auth.username, governor: auth.governor, serverTime: Date.now() };
    }),
  );

  r.post(
    '/governor',
    handler(async (req) => {
      const auth = requireUser(req);
      if (auth.governor) throw conflict('governor_exists', 'Você já possui um governador.');
      const input = parse(
        z.object({
          name: z
            .string()
            .trim()
            .min(3, 'mínimo de 3 caracteres')
            .max(16, 'máximo de 16 caracteres')
            .regex(/^[\p{L}\p{N}_ ]+$/u, 'use letras, números, espaço e _'),
          civilization: z.string(),
          kingdomId: id,
        }),
        req.body,
      );
      if (!civilizationExists(input.civilization)) throw new HttpError(400, 'invalid_civilization', 'Civilização indisponível.');
      const created = await tx(db, async (client) => {
        const k = await client.query('SELECT id, status FROM kingdoms WHERE id = $1 FOR UPDATE', [input.kingdomId]);
        if (!k.rows[0] || k.rows[0].status !== 'open') throw notFound('Reino indisponível.');
        const pop = await client.query('SELECT COUNT(*)::int AS n FROM governors WHERE kingdom_id = $1', [input.kingdomId]);
        if (pop.rows[0].n >= config.kingdomCapacity) throw conflict('kingdom_full', 'Este reino está lotado.');
        const taken = await client.query('SELECT 1 FROM governors WHERE lower(name) = lower($1)', [input.name]);
        if (taken.rowCount) throw conflict('name_taken', 'Nome de governador já em uso.');
        const g = await client.query(
          'INSERT INTO governors (user_id, kingdom_id, name, civilization) VALUES ($1, $2, $3, $4) RETURNING id',
          [auth.userId, input.kingdomId, input.name, input.civilization],
        );
        const governorId = g.rows[0].id;
        const c = await city.createCity(client, governorId, input.kingdomId);
        await client.query(
          `INSERT INTO audit_logs (actor_governor_id, action, target_type, target_id, data) VALUES ($1, 'governor.created', 'city', $2, $3)`,
          [governorId, String(c.cityId), { kingdomId: input.kingdomId, x: c.x, y: c.y }],
        );
        return { governorId, ...c };
      });
      await hub.refreshUser(auth.userId);
      const summary = await mapCitySummary(db, created.cityId);
      if (summary) hub.toKingdom(input.kingdomId, { type: 'map.city', city: summary });
      return created;
    }),
  );

  r.get('/city', handler(async (req) => city.state(requireGovernor(req))));

  r.post(
    '/city/upgrade',
    handler(async (req) => {
      const gov = requireGovernor(req);
      const input = parse(
        z.object({ building: z.enum(BUILDING_TYPES), idempotencyKey: z.string().min(8).max(64) }),
        req.body,
      );
      return city.upgrade(gov, input.building, input.idempotencyKey);
    }),
  );

  r.get(
    '/map/cities',
    handler(async (req) => {
      const gov = requireGovernor(req);
      const q = parse(z.object({ x0: z.coerce.number().int(), y0: z.coerce.number().int(), x1: z.coerce.number().int(), y1: z.coerce.number().int() }), req.query);
      // Área de interesse limitada pelo servidor.
      const x1 = Math.min(q.x1, q.x0 + 200);
      const y1 = Math.min(q.y1, q.y0 + 200);
      return { cities: await mapCitiesInArea(db, gov.kingdomId, q.x0, q.y0, x1, y1) };
    }),
  );

  r.get(
    '/map/city/:id',
    handler(async (req) => {
      const gov = requireGovernor(req);
      const c = await mapCitySummary(db, parse(id, req.params.id));
      const own = await db.query('SELECT kingdom_id FROM cities WHERE id = $1', [req.params.id]);
      if (!c || own.rows[0]?.kingdom_id !== gov.kingdomId) throw notFound('Cidade não encontrada.');
      return { city: c };
    }),
  );

  // Alianças
  r.get('/alliances', handler(async (req) => ({ alliances: await alliance.list(requireGovernor(req), String(req.query.q ?? '').slice(0, 40)) })));
  r.get('/alliances/:id', handler(async (req) => alliance.detail(requireGovernor(req), parse(id, req.params.id))));
  r.get('/alliance/applications', handler(async (req) => ({ applications: await alliance.myApplications(requireGovernor(req)) })));
  r.post(
    '/alliances',
    handler(async (req) =>
      alliance.create(
        requireGovernor(req),
        parse(
          z.object({
            name: z.string().trim().min(3, 'mínimo de 3 caracteres').max(24, 'máximo de 24 caracteres'),
            tag: z
              .string()
              .trim()
              .regex(/^[A-Za-z0-9]{2,4}$/, 'sigla de 2 a 4 letras/números'),
            description: z.string().trim().max(300).default(''),
          }),
          req.body,
        ),
      ),
    ),
  );
  r.post(
    '/alliances/:id/apply',
    handler(async (req) =>
      alliance.apply(requireGovernor(req), parse(id, req.params.id), parse(z.object({ message: z.string().trim().max(200).default('') }), req.body ?? {}).message),
    ),
  );
  r.post('/alliance/applications/:id/approve', handler(async (req) => alliance.decide(requireGovernor(req), parse(id, req.params.id), true)));
  r.post('/alliance/applications/:id/reject', handler(async (req) => alliance.decide(requireGovernor(req), parse(id, req.params.id), false)));
  r.post('/alliance/applications/:id/cancel', handler(async (req) => alliance.cancelApplication(requireGovernor(req), parse(id, req.params.id))));
  r.post('/alliance/leave', handler(async (req) => alliance.leave(requireGovernor(req))));
  r.post('/alliance/members/:id/kick', handler(async (req) => alliance.kick(requireGovernor(req), parse(id, req.params.id))));
  r.post(
    '/alliance/members/:id/rank',
    handler(async (req) =>
      alliance.setRank(requireGovernor(req), parse(id, req.params.id), parse(z.object({ rank: z.number().int() }), req.body).rank),
    ),
  );
  r.post('/alliance/members/:id/transfer', handler(async (req) => alliance.transfer(requireGovernor(req), parse(id, req.params.id))));

  // Chat
  r.get('/chat/channels', handler(async (req) => ({ channels: await chat.channels(requireGovernor(req)) })));
  r.get(
    '/chat/:id/messages',
    handler(async (req) => {
      const q = parse(z.object({ before: id.optional(), limit: z.coerce.number().int().min(1).max(50).default(30) }), req.query);
      return chat.history(requireGovernor(req), parse(id, req.params.id), q.before ?? null, q.limit);
    }),
  );
  r.post(
    '/chat/:id/messages',
    handler(async (req) => chat.post(requireGovernor(req), parse(id, req.params.id), parse(z.object({ body: z.string().max(2000) }), req.body).body)),
  );
  r.post(
    '/chat/:id/read',
    handler(async (req) => chat.markRead(requireGovernor(req), parse(id, req.params.id), parse(z.object({ messageId: z.number().int().min(0) }), req.body).messageId)),
  );

  r.use(() => {
    throw notFound('Rota inexistente.');
  });
  return r;
}
