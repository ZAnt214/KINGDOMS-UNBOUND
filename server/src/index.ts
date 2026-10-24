import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameServer, log } from './app.js';
import { config } from './config.js';
import { createPool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Em produção o bundle fica em dist/server.js e o cliente em dist/client.
const staticDir = process.env.STATIC_DIR ?? path.resolve(here, here.endsWith('dist') ? 'client' : '../../dist/client');

const db = createPool(config.databaseUrl);
const game = await createGameServer(db, { staticDir });
game.server.listen(config.port, '0.0.0.0', () => log('servidor iniciado', { port: config.port, staticDir }));

const shutdown = async (signal: string) => {
  log('encerrando', { signal });
  await game.close().catch(() => {});
  await db.end().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
