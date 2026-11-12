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
import { STRUCTURES } from '../../shared/play/economy.js';
import { MilitaryService } from './services/military.js';
import { WarService } from './services/war.js';
import { DiplomacyService } from './services/diplomacy.js';
import { EconomyService } from './services/economy.js';
import { MatchService } from './services/match.js';
import { NationService } from './services/nation.js';
import { TerritoryService } from './services/territory.js';

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
  const chat = new ChatService(db, hub);
  const economy = new EconomyService(db, hub);
  // Entrar ou sair de uma aliança muda as conexões logísticas entre aliados (Fase C).
  const military = new MilitaryService(db, hub, economy);
  const diplomacy = new DiplomacyService(db, hub, economy, military);
  const alliance = new AllianceService(db, hub, {
    before: (client, ids) => economy.settleMany(client, ids, new Date()),
    // Sair pela rota antiga também é quebra de aliança, com a mesma penalidade (Fase F).
    leaving: (client, id, formers, allianceId) => diplomacy.penalize(client, id, formers, allianceId),
    left: (kingdomId, id, formers, result) => diplomacy.afterBreak(kingdomId, id, formers, result as Parameters<DiplomacyService['afterBreak']>[3]),
    after: async (ids, changed) => {
      hub.toKingdom(changed.kingdomId, { type: 'play.alliance', nationId: changed.governorId, alliance: changed.allianceId, serverTime: Date.now() });
      for (const id of ids) await economy.announceEconomy(id);
    },
  });
  const territory = new TerritoryService(db, hub, economy);
  // Instalações militares contam no poder militar: recalcula quando uma obra termina.
  economy.afterStructure = async (governorId, type) => {
    if (STRUCTURES[type]?.military) await military.refreshPower(governorId);
  };
  const war = new WarService(db, hub, economy, military);
  const nation = new NationService(db, hub, territory, economy, military, war);
  nation.diplomacy = diplomacy;
  const match = new MatchService(db, hub, nation, territory, economy);
  match.military = military;
  match.war = war;
  match.diplomacy = diplomacy;
  war.onRegion = (kingdomId) => match.check(kingdomId);
  // Toda região conquistada numa partida rápida pode decidir a partida.
  territory.onRegion = (kingdomId) => match.check(kingdomId);

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

  app.use('/api', express.json({ limit: '16kb' }), csrfGuard, authMiddleware(db), apiRouter(db, hub, { alliance, chat, nation, territory, economy, match, military, war, diplomacy }));
  app.use('/api', errorMiddleware);

  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(opts.staticDir!, 'index.html')));
  }

  // Worker: conclui ocupações e obras vencidas, conduz os bots e encerra partidas. O estado vem do
  // banco, então reiniciar o processo não perde nada (o worker só antecipa o que a leitura faria).
  // A trava vence em 30 s: em serverless um ciclo pode ficar congelado e nunca terminar.
  let running = 0;
  const worker = setInterval(() => {
    if (running && Date.now() - running < 30_000) return;
    running = Date.now();
    (async () => {
      await territory.processDue();
      await economy.processDue();
      await military.processDue();
      await war.processDue();
      await match.check();
      await match.tick();
    })()
      .catch((err) => console.error(JSON.stringify({ level: 'error', msg: 'worker', err: String(err) })))
      .finally(() => (running = 0));
  }, config.workerIntervalMs);

  return {
    app,
    server,
    hub,
    services: { nation, territory, economy, match },
    async close() {
      clearInterval(worker);
      hub.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
