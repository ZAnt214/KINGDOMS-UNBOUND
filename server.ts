// Ponto de entrada detectado pela Vercel (preset Express): cria o app e sobe o
// servidor HTTP + WebSocket do jogo com listen(). Em Docker/Railway e localmente
// use `npm run build && npm start`.
import express from 'express';
import { start } from './server/src/start.js';

const app = express();
await start(app);
