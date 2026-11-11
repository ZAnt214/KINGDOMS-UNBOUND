import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { authMiddleware, csrfGuard } from './auth.js';
import { config } from './config.js';
import { createPool, type Db } from './db.js';
import { errorMiddleware } from './http.js';
import { Hub } from './hub.js';
import { migrate, seedWorld } from './migrate.js';
import { apiRouter } from './routes.js';
import { AllianceService } from './services/alliance.js';
import { ChatService } from './services/chat.js';
import { CityService } from './services/city.js';
import { NationService } from './services/nation.js';
import { TerritoryService } from './services/territory.js';
import { seedGeopolitics, WorldService } from './services/world.js';

export const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), msg, ...extra }));

export async function createGameServer(
  db: Db,
  opts: { staticDir?: string; directUrl?: string; app?: express.Express } = {},
) {
  // Migrações usam conexão direta: advisory locks não sobrevivem a poolers em modo transação.
  const directUrl = opts.directUrl ?? config.directDatabaseUrl;
  const direct = createPool(directUrl, 1);
  try {
    await migrate(direct, log);
    await seedWorld(direct);
    await seedGeopolitics(direct);
  } finally {
    await direct.end();
  }

  const app = opts.app ?? express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  const server = http.createServer(app);
  const hub = new Hub(db);
  hub.attach(server);
  await hub.startBus(directUrl);
  const city = new CityService(db, hub);
  const alliance = new AllianceService(db, hub);
  const chat = new ChatService(db, hub);
  const world = new WorldService(db, hub);
  const territory = new TerritoryService(db, hub);
  const nation = new NationService(db, hub, territory);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    );
    next();
  });

  app.get('/healthz', (_req, res) => {
    db.query('SELECT 1')
      .then(() => res.json({ ok: true, online: hub.onlineCount() }))
      .catch(() => res.status(503).json({ ok: false }));
  });

  app.use('/api', express.json({ limit: '16kb' }), csrfGuard, authMiddleware(db), apiRouter(db, hub, { city, alliance, chat, world, nation, territory }));
  app.use('/api', errorMiddleware);

  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(opts.staticDir!, 'index.html')));
  }

  // Worker de obras e ocupações: o estado vem do banco, então reiniciar o processo não perde nada.
  let running = false;
  const worker = setInterval(() => {
    if (running) return;
    running = true;
    Promise.all([city.processDue(), territory.processDue()])
      .catch((err) => console.error(JSON.stringify({ level: 'error', msg: 'worker', err: String(err) })))
      .finally(() => (running = false));
  }, config.workerIntervalMs);

  return {
    app,
    server,
    hub,
    services: { world, nation, territory },
    async close() {
      clearInterval(worker);
      hub.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
