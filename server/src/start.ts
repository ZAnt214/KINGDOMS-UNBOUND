import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express } from 'express';
import { createGameServer, log } from './app.js';
import { config } from './config.js';
import { createPool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// O cliente é gerado em public/ (servido pela CDN na Vercel e pelo Express nos demais ambientes).
const staticDir = process.env.STATIC_DIR ?? path.resolve(here, here.endsWith('dist') ? '../public' : '../../public');

/** Sobe o servidor do jogo sobre o app Express recebido e escuta em PORT. */
export async function start(app: Express) {
  const db = createPool(config.databaseUrl);
  let game: Awaited<ReturnType<typeof createGameServer>>;
  try {
    game = await createGameServer(db, { staticDir, app });
  } catch (err) {
    // Sem banco o jogo não pode rodar; responde 503 explicando em vez de derrubar o processo.
    console.error(JSON.stringify({ level: 'error', msg: 'falha ao iniciar (banco indisponível?)', err: String(err) }));
    await db.end().catch(() => {});
    const server = http.createServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '30' });
      res.end('KINGDOMS UNBOUND: servidor sem banco de dados configurado. Tente novamente em instantes.');
    });
    server.listen(config.port, '0.0.0.0');
    return null;
  }
  game.server.listen(config.port, '0.0.0.0', () => log('servidor iniciado', { port: config.port, staticDir }));

  const shutdown = async (signal: string) => {
    log('encerrando', { signal });
    await game.close().catch(() => {});
    await db.end().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  return game;
}
