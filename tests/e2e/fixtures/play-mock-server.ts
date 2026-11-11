// SERVIDOR FALSO, SÓ PARA TESTE VISUAL. Não é o servidor do jogo e nunca roda em produção.
//
// Guarda o mundo em memória e responde às rotas que a tela usa, aplicando as mesmas regras
// compartilhadas (shared/play, shared/world) para que a interface possa ser exercitada num
// navegador sem Postgres. Persistência, concorrência, sessões e isolamento por mundo NÃO são
// provados aqui: isso é papel de tests/integration/play.test.ts, que usa o servidor real.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { inspectFlagImage, parseFlag } from '../../../shared/play/flags';
import { cleanNationName, COLOR_EXCLUSION_KM, expansionSeconds, MODES_AVAILABLE, NATION_COLOR_BY_HEX, nationNameProblem } from '../../../shared/play/rules';
import type { NationView, OccupationView } from '../../../shared/play/types';
import { borderingRegion, distanceKm, REGION_BY_ID, START_POINT_BY_ID } from '../../../shared/world/regions';

const PORT = Number(process.env.PORT ?? 4173);
const STATIC = process.env.STATIC_DIR ?? 'public';
/** Divide as durações para a captura não esperar o tempo real (padrão: 1 = igual ao jogo). */
const SPEED = Number(process.env.MOCK_SPEED ?? 1);

interface Session {
  userId: number;
  username: string;
  governor: { id: number; name: string; kingdomId: number; civilization: string; cityId: number; allianceId: null; allianceRank: null } | null;
}
const sessions = new Map<string, Session>();
const nations = new Map<number, NationView & { image?: { bytes: Buffer; type: string } }>();
const control = new Map<string, number>();
let occupations: OccupationView[] = [];
let nextId = 1;
const sockets = new Set<WebSocket>();
const broadcast = (event: object) => {
  const data = JSON.stringify({ ...event, serverTime: Date.now() });
  for (const ws of sockets) ws.send(data);
};

function completeDue() {
  const now = Date.now();
  for (const o of occupations.filter((x) => x.endsAt <= now)) {
    occupations = occupations.filter((x) => x.id !== o.id);
    if (control.has(o.region)) continue;
    control.set(o.region, o.nationId);
    broadcast({ type: 'play.region', region: o.region, nationId: o.nationId, occupationId: o.id, at: o.endsAt });
  }
}
setInterval(completeDue, 250);

const snapshot = (s: Session) => ({
  serverTime: Date.now(),
  world: { id: 1, name: 'Mundo de teste (falso)', mode: 'campaign' as const },
  me: s.governor && nations.has(s.governor.id) ? s.governor.id : null,
  nations: [...nations.values()].map(({ image: _image, ...n }) => n),
  control: [...control],
  occupations,
});

class Fail extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function blockedColors(pointId: string): string[] {
  const point = START_POINT_BY_ID[pointId];
  if (!point) return [];
  return [...new Set([...nations.values()].filter((n) => distanceKm(point.at, START_POINT_BY_ID[n.capital].at) < COLOR_EXCLUSION_KM).map((n) => n.color))];
}

function route(method: string, url: URL, body: any, s: Session | null, setCookie: (v: string) => void): unknown {
  const p = url.pathname.replace(/^\/api/, '');
  if (p === '/meta') {
    return { rulesVersion: 1, playRulesVersion: 1, modes: MODES_AVAILABLE, serverTime: Date.now(), civilizations: [{ id: 'auren' }], buildings: [], kingdoms: [{ id: 1, name: 'Mundo de teste (falso)', width: 1, height: 1, seed: 1, status: 'open', mode: 'campaign', population: nations.size, capacity: 500 }] };
  }
  if (p === '/auth/register' || p === '/auth/login') {
    const token = `t${nextId++}`;
    sessions.set(token, { userId: nextId++, username: String(body.username), governor: null });
    setCookie(`ku_session=${token}; Path=/; HttpOnly`);
    return { ok: true };
  }
  if (p === '/auth/logout') {
    setCookie('ku_session=; Path=/; Max-Age=0');
    return { ok: true };
  }
  if (!s) throw new Fail(401, 'unauthenticated', 'Faça login para continuar.');
  if (p === '/me') return { userId: s.userId, username: s.username, governor: s.governor, serverTime: Date.now() };
  if (p === '/governor') {
    s.governor = { id: nextId++, name: String(body.name), kingdomId: 1, civilization: 'auren', cityId: nextId++, allianceId: null, allianceRank: null };
    return { governorId: s.governor.id };
  }
  const g = s.governor;
  if (!g) throw new Fail(409, 'no_governor', 'Crie seu governador primeiro.');
  completeDue();
  if (p === '/play/state') return snapshot(s);
  if (p === '/play/colors') return { blocked: blockedColors(url.searchParams.get('pointId') ?? '') };
  if (p === '/play/found' && method === 'POST') {
    const point = START_POINT_BY_ID[body.pointId];
    if (!point) throw new Fail(404, 'not_found', 'Ponto de partida desconhecido.');
    const name = cleanNationName(String(body.name ?? ''));
    const problem = nationNameProblem(name);
    if (problem) throw new Fail(400, 'invalid_name', problem);
    const flag = parseFlag(body.flag);
    if (!flag) throw new Fail(400, 'invalid_flag', 'Bandeira inválida.');
    if (!NATION_COLOR_BY_HEX[body.color]) throw new Fail(400, 'invalid_color', 'Cor fora da paleta.');
    if (nations.has(g.id)) throw new Fail(409, 'nation_exists', 'Você já fundou sua nação neste mundo.');
    if (control.has(point.region)) throw new Fail(409, 'region_taken', 'Esta região já pertence a outra nação. Escolha outro ponto.');
    if ([...nations.values()].some((n) => n.name.toLowerCase() === name.toLowerCase())) throw new Fail(409, 'name_taken', 'Já existe uma nação com este nome neste mundo.');
    if (blockedColors(point.id).includes(body.color)) throw new Fail(409, 'color_taken', 'Uma nação vizinha já usa esta cor. Escolha outra para que as fronteiras fiquem legíveis.');
    let image: { bytes: Buffer; type: string } | undefined;
    if (body.flagImage) {
      const bytes = Buffer.from(String(body.flagImage), 'base64');
      const check = inspectFlagImage(bytes);
      if (!check.ok) throw new Fail(400, 'invalid_flag_image', check.reason);
      image = { bytes, type: check.type };
    }
    const nation: NationView = { id: g.id, name, color: body.color, flag, flagImage: image ? 1 : null, capital: point.id, foundedAt: Date.now() };
    nations.set(g.id, { ...nation, image });
    control.set(point.region, g.id);
    broadcast({ type: 'play.nation', nation, region: point.region });
    return snapshot(s);
  }
  if (p === '/play/expand' && method === 'POST') {
    const target = REGION_BY_ID[body.region];
    if (!target) throw new Fail(404, 'not_found', 'Região desconhecida.');
    if (!nations.has(g.id)) throw new Fail(409, 'no_nation', 'Funde sua nação antes de expandir.');
    if (occupations.some((o) => o.nationId === g.id)) throw new Fail(409, 'occupation_busy', 'Sua nação já está ocupando uma região. Aguarde a conclusão.');
    if (control.has(target.id)) throw new Fail(409, 'region_taken', 'Esta região pertence a outra nação. Ataques ainda não existem no servidor.');
    if (occupations.some((o) => o.region === target.id)) throw new Fail(409, 'region_contested', 'Outra nação já está ocupando esta região.');
    const owned = [...control].filter(([, o]) => o === g.id).map(([r]) => r);
    const from = borderingRegion(owned, target.id);
    if (!from) throw new Fail(409, 'not_adjacent', 'Só é possível ocupar regiões que fazem fronteira terrestre com o seu território.');
    const seconds = expansionSeconds(target.area, owned.length, 'campaign');
    const now = Date.now();
    const occupation: OccupationView = { id: nextId++, nationId: g.id, region: target.id, from, startedAt: now, endsAt: now + (seconds * 1000) / SPEED };
    occupations.push(occupation);
    broadcast({ type: 'play.occupation', occupation });
    return { occupation, seconds };
  }
  throw new Fail(404, 'not_found', 'Rota inexistente.');
}

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const sessionOf = (req: http.IncomingMessage) => sessions.get(/ku_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? '') ?? null;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (!url.pathname.startsWith('/api')) {
    let file = path.join(STATIC, url.pathname);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(STATIC, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  const flag = /^\/api\/play\/flag\/(\d+)/.exec(url.pathname);
  if (flag) {
    const image = nations.get(Number(flag[1]))?.image;
    res.writeHead(image ? 200 : 404, { 'Content-Type': image?.type ?? 'text/plain' });
    res.end(image?.bytes);
    return;
  }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    try {
      const out = route(req.method ?? 'GET', url, raw ? JSON.parse(raw) : {}, sessionOf(req), (v) => res.setHeader('Set-Cookie', v));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      const f = e instanceof Fail ? e : new Fail(500, 'internal', String(e));
      res.writeHead(f.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: f.code, message: f.message }));
    }
  });
});
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  if (!sessionOf(req)) return ws.close();
  sockets.add(ws);
  ws.on('close', () => sockets.delete(ws));
  ws.send(JSON.stringify({ type: 'hello', serverTime: Date.now() }));
});
server.listen(PORT, '127.0.0.1', () => console.log(`servidor falso de teste em http://127.0.0.1:${PORT}`));
