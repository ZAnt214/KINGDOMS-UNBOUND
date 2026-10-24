import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { authMiddleware, csrfGuard } from './auth.js';
import { config } from './config.js';
import type { Db } from './db.js';
import { errorMiddleware } from './http.js';
import { Hub } from './hub.js';
import { migrate, seedWorld } from './migrate.js';
import { apiRouter } from './routes.js';
import { AllianceService } from './services/alliance.js';
import { ChatService } from './services/chat.js';
import { CityService } from './services/city.js';

export const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), msg, ...extra }));

export async function createGameServer(db: Db, opts: { staticDir?: string } = {}) {
  await migrate(db, log);
  await seedWorld(db);

  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  const server = http.createServer(app);
  const hub = new Hub(db);
  hub.attach(server);
  const city = new CityService(db, hub);
  const alliance = new AllianceService(db, hub);
  const chat = new ChatService(db, hub);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    );
    next();
  });

  app.get('/healthz', (_req, res) => {
    db.query('SELECT 1')
      .then(() => res.json({ ok: true, online: hub.onlineCount() }))
      .catch(() => res.status(503).json({ ok: false }));
  });

  app.use('/api', express.json({ limit: '16kb' }), csrfGuard, authMiddleware(db), apiRouter(db, hub, { city, alliance, chat }));
  app.use('/api', errorMiddleware);

  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(opts.staticDir!, 'index.html')));
  }

  // Worker de obras: estado vem do banco, então reiniciar o processo não perde nada.
  let running = false;
  const worker = setInterval(() => {
    if (running) return;
    running = true;
    city
      .processDue()
      .catch((err) => console.error(JSON.stringify({ level: 'error', msg: 'worker', err: String(err) })))
      .finally(() => (running = false));
  }, config.workerIntervalMs);

  return {
    app,
    server,
    hub,
    async close() {
      clearInterval(worker);
      hub.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
