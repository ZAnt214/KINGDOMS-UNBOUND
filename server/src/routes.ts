import { Router } from 'express';
import { z } from 'zod';
import { ECONOMY_RULES_VERSION, STRUCTURE_TYPES } from '../../shared/play/economy.js';
import { MILITARY, MILITARY_RULES_VERSION, TECH_TYPES, UNIT_TYPES } from '../../shared/play/military.js';
import type { MilitaryService } from './services/military.js';
import { MODES_AVAILABLE, PLAY_RULES_VERSION } from '../../shared/play/rules.js';
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
import type { FoundInput } from '../../shared/play/types.js';
import type { Hub } from './hub.js';
import { AllianceService } from './services/alliance.js';
import { ChatService } from './services/chat.js';
import type { EconomyService } from './services/economy.js';
import type { MatchService } from './services/match.js';
import type { NationService } from './services/nation.js';
import type { TerritoryService } from './services/territory.js';

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

export function apiRouter(
  db: Db,
  hub: Hub,
  services: { alliance: AllianceService; chat: ChatService; nation: NationService; territory: TerritoryService; economy: EconomyService; match: MatchService; military: MilitaryService },
) {
  const r = Router();
  const { alliance, chat, nation, territory, economy, match, military } = services;
  const authLimiter = new RateLimiter(config.authRatePerMinute, 60);

  r.get(
    '/meta',
    handler(async () => {
      const k = await db.query(
        `SELECT k.id, k.name, k.status, k.mode, COUNT(g.id)::int AS population
           FROM kingdoms k LEFT JOIN governors g ON g.kingdom_id = k.id
          WHERE k.mode = 'campaign' GROUP BY k.id ORDER BY k.id`,
      );
      return {
        playRulesVersion: PLAY_RULES_VERSION,
        economyRulesVersion: ECONOMY_RULES_VERSION,
        militaryRulesVersion: MILITARY_RULES_VERSION,
        modes: MODES_AVAILABLE,
        serverTime: Date.now(),
        worlds: k.rows.map((row) => ({ ...row, capacity: config.kingdomCapacity })),
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
      return { userId: auth.userId, username: auth.username, governor: auth.governor, worlds: auth.worlds, serverTime: Date.now() };
    }),
  );

  // Lugar do usuário num mundo da campanha (um por usuário). Partidas rápidas usam /quick/start.
  r.post(
    '/governor',
    handler(async (req) => {
      const auth = requireUser(req);
      if (auth.worlds.some((w) => w.mode === 'campaign')) throw conflict('governor_exists', 'Você já tem lugar na campanha.');
      const input = parse(
        z.object({
          name: z
            .string()
            .trim()
            .min(3, 'mínimo de 3 caracteres')
            .max(16, 'máximo de 16 caracteres')
            .regex(/^[\p{L}\p{N}_ ]+$/u, 'use letras, números, espaço e _'),
          kingdomId: id,
        }),
        req.body,
      );
      const created = await tx(db, async (client) => {
        const k = await client.query('SELECT id, status, mode FROM kingdoms WHERE id = $1 FOR UPDATE', [input.kingdomId]);
        if (!k.rows[0] || k.rows[0].status !== 'open' || k.rows[0].mode !== 'campaign') throw notFound('Mundo indisponível.');
        const pop = await client.query('SELECT COUNT(*)::int AS n FROM governors WHERE kingdom_id = $1', [input.kingdomId]);
        if (pop.rows[0].n >= config.kingdomCapacity) throw conflict('kingdom_full', 'Este mundo está lotado.');
        const taken = await client.query('SELECT 1 FROM governors WHERE lower(name) = lower($1)', [input.name]);
        if (taken.rowCount) throw conflict('name_taken', 'Nome de comandante já em uso.');
        const g = await client.query('INSERT INTO governors (user_id, kingdom_id, name) VALUES ($1, $2, $3) RETURNING id', [auth.userId, input.kingdomId, input.name]);
        const governorId = Number(g.rows[0].id);
        await client.query(`INSERT INTO audit_logs (actor_governor_id, action, target_type, target_id, data) VALUES ($1, 'governor.created', 'kingdom', $2, '{}')`, [
          governorId,
          String(input.kingdomId),
        ]);
        return { governorId };
      });
      await hub.refreshUser(auth.userId);
      return created;
    }),
  );

  // Partida rápida: entrar (ou criar com bots) e abandonar.
  r.post(
    '/quick/start',
    handler(async (req) => {
      const auth = requireUser(req);
      const out = await match.start(auth.userId);
      await hub.refreshUser(auth.userId);
      return out;
    }),
  );
  r.post('/quick/leave', handler(async (req) => (await match.leave(requireGovernor(req)), { ok: true })));

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

  // Nações e território (ciclo principal): estado do mundo, fundação e expansão.
  r.get(
    '/play/state',
    handler(async (req) => {
      const g = requireGovernor(req);
      // Partida rápida: a leitura também move os bots e confere o fim. Assim a partida anda mesmo
      // onde o worker não fica vivo entre requisições (funções serverless).
      if (g.mode === 'quick') {
        await match.check(g.kingdomId);
        await match.tick(g.kingdomId);
      }
      return nation.snapshot(g);
    }),
  );
  r.get(
    '/play/colors',
    handler(async (req) => {
      const gov = requireGovernor(req);
      const q = parse(z.object({ pointId: z.string().min(1).max(80) }), req.query);
      return { blocked: await nation.blockedColors(gov.kingdomId, q.pointId) };
    }),
  );
  r.post(
    '/play/found',
    handler(async (req) =>
      nation.found(
        requireGovernor(req),
        parse(
          z.object({
            pointId: z.string().min(1).max(80),
            name: z.string().max(60),
            color: z.string().max(9),
            flag: z.unknown(),
            flagImage: z.string().max(13000).nullish(),
          }),
          req.body,
        ) as FoundInput,
      ),
    ),
  );
  r.post(
    '/play/expand',
    handler(async (req) => territory.expand(requireGovernor(req), parse(z.object({ region: z.string().min(1).max(40) }), req.body).region)),
  );
  r.post(
    '/play/build',
    handler(async (req) => {
      const input = parse(
        z.object({ at: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]), type: z.enum(STRUCTURE_TYPES), region: z.string().max(40).optional() }),
        req.body,
      );
      return { structure: await economy.build(requireGovernor(req), input.at, input.type, input.region ?? null) };
    }),
  );
  // Fase D: treinamento e pesquisa militar.
  r.post(
    '/play/train',
    handler(async (req) => {
      const body = parse(z.object({ unit: z.enum(UNIT_TYPES), amount: z.number().int().min(1).max(MILITARY.maxBatch) }), req.body);
      return { military: await military.train(requireGovernor(req), body.unit, body.amount) };
    }),
  );
  r.post(
    '/play/research',
    handler(async (req) => ({ military: await military.startResearch(requireGovernor(req), parse(z.object({ tech: z.enum(TECH_TYPES) }), req.body).tech) })),
  );
  r.post('/play/upgrade', handler(async (req) => ({ structure: await economy.upgrade(requireGovernor(req), parse(z.object({ structureId: id }), req.body).structureId) })));
  r.get(
    '/play/flag/:id',
    handler(async (req, res) => {
      const gov = requireGovernor(req);
      const image = await nation.flagImage(gov.kingdomId, parse(id, req.params.id));
      if (!image) throw notFound('Bandeira não encontrada.');
      // O conteúdo foi validado na fundação; a versão na URL permite cache longo.
      res.setHeader('Content-Type', image.type);
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      res.end(image.bytes);
    }),
  );

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
