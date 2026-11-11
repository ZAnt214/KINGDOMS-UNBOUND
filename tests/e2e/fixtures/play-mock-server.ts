// SERVIDOR FALSO, SÓ PARA TESTE VISUAL. Não é o servidor do jogo e nunca roda em produção.
//
// Guarda tudo em memória e responde às rotas que a tela usa, aplicando as mesmas regras
// compartilhadas (shared/play, shared/world) para que a interface possa ser exercitada num
// navegador sem Postgres. Persistência, concorrência, sessões e isolamento NÃO são provados aqui:
// isso é papel de tests/integration/*.test.ts, que usam o servidor real.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  buildProblem,
  computeEconomy,
  type Cost,
  describeCost,
  ECONOMY,
  expansionCost,
  missing,
  project,
  type ResourceMap,
  STRUCTURE_TYPES,
  structureCost,
  structureSeconds,
  type StructureType,
} from '../../../shared/play/economy';
import { inspectFlagImage, parseFlag } from '../../../shared/play/flags';
import { botIdentities, buildArena, matchOutcome, pickBotPoints, QUICK, rank, THEATERS } from '../../../shared/play/match';
import { cleanNationName, COLOR_EXCLUSION_KM, expansionSeconds, type GameMode, MODES_AVAILABLE, NATION_COLOR_BY_HEX, nationNameProblem } from '../../../shared/play/rules';
import type { EconomyView, NationView, OccupationView, StructureView, WorldView } from '../../../shared/play/types';
import { freePointIn, regionAt } from '../../../server/src/geo';
import { borderingRegion, distanceKm, expansionTargets, REGION_BY_ID, START_POINT_BY_ID, type StartPoint } from '../../../shared/world/regions';

const PORT = Number(process.env.PORT ?? 4173);
const STATIC = process.env.STATIC_DIR ?? 'public';
/** Divide as durações para a captura não esperar o tempo real (padrão: 1 = igual ao jogo). */
const SPEED = Number(process.env.MOCK_SPEED ?? 1);

interface World {
  view: WorldView;
  nations: Map<number, NationView & { image?: { bytes: Buffer; type: string } }>;
  control: Map<string, number>;
  occupations: OccupationView[];
  structures: Map<number, StructureView>;
  wallet: Map<number, { amounts: ResourceMap; settledAt: number }>;
  bots: Set<number>;
}
interface Session {
  userId: number;
  username: string;
  seats: Map<number, number>; // mundo → governador
}

let nextId = 1;
const id = () => nextId++;
const worlds = new Map<number, World>();
const newWorld = (wid: number, name: string, mode: GameMode, arena: string[] | null): World => ({
  view: { id: wid, name, mode, arena, endsAt: null, finishedAt: null, outcome: null, winner: null, results: [] },
  nations: new Map(),
  control: new Map(),
  occupations: [],
  structures: new Map(),
  wallet: new Map(),
  bots: new Set(),
});
worlds.set(1, newWorld(1, 'Campanha · Mundo 1 (servidor falso)', 'campaign', null));
const sessions = new Map<string, Session>();
const sockets = new Map<WebSocket, { world: number; gov: number | null }>();

const send = (wid: number, event: object, gov: number | null = null) => {
  const data = JSON.stringify({ ...event, serverTime: Date.now() });
  for (const [ws, c] of sockets) if (c.world === wid && (gov === null || c.gov === gov)) ws.send(data);
};

class Fail extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// ---------- economia ----------

const inputs = (w: World, gid: number) => ({
  regions: [...w.control].filter(([, o]) => o === gid).map(([r]) => r),
  capitalRegion: START_POINT_BY_ID[w.nations.get(gid)!.capital].region,
  structures: [...w.structures.values()].filter((s) => s.nationId === gid && s.level > 0).map((s) => ({ id: s.id, type: s.type, level: s.level, region: s.region, at: s.at })),
});
function settle(w: World, gid: number, at = Date.now()) {
  const wal = w.wallet.get(gid)!;
  if (at <= wal.settledAt) return wal.amounts;
  const e = computeEconomy(inputs(w, gid), w.view.mode);
  wal.amounts = project(wal.amounts, wal.settledAt, e.rates, e.capacity, at);
  wal.settledAt = at;
  return wal.amounts;
}
function spend(w: World, gid: number, cost: Cost, what: string) {
  const have = settle(w, gid);
  const short = missing(have, cost);
  if (Object.keys(short).length) throw new Fail(409, 'insufficient', `Recursos insuficientes para ${what}. Faltam ${describeCost(short)}.`);
  for (const [r, v] of Object.entries(cost) as [keyof ResourceMap, number][]) have[r] -= v;
}
function economyView(w: World, gid: number): EconomyView | null {
  const wal = w.wallet.get(gid);
  if (!wal) return null;
  const e = computeEconomy(inputs(w, gid), w.view.mode);
  return { amounts: { ...wal.amounts }, settledAt: wal.settledAt, rates: e.rates, capacity: e.capacity, energy: e.energy, efficiency: e.efficiency, logistics: e.logistics };
}
const announceEconomy = (w: World, gid: number) => send(w.view.id, { type: 'play.economy', economy: economyView(w, gid) }, gid);

// ---------- relógio: ocupações, obras, partidas, bots ----------

function tick() {
  const now = Date.now();
  for (const w of worlds.values()) {
    if (w.view.finishedAt) continue;
    for (const o of w.occupations.filter((x) => x.endsAt <= now)) {
      w.occupations = w.occupations.filter((x) => x.id !== o.id);
      if (w.control.has(o.region)) continue;
      settle(w, o.nationId, o.endsAt);
      w.control.set(o.region, o.nationId);
      send(w.view.id, { type: 'play.region', region: o.region, nationId: o.nationId, occupationId: o.id, at: o.endsAt });
      announceEconomy(w, o.nationId);
    }
    for (const s of w.structures.values()) {
      if (!s.building || s.building.endsAt > now) continue;
      settle(w, s.nationId, s.building.endsAt);
      const done: StructureView = { ...s, level: s.building.to, building: null };
      w.structures.set(s.id, done);
      send(w.view.id, { type: 'play.structure', structure: done, completed: true });
      announceEconomy(w, s.nationId);
    }
    if (w.view.mode === 'quick' && w.view.endsAt) {
      for (const b of w.bots) botStep(w, b);
      checkMatch(w);
    }
  }
}
setInterval(tick, 250);

const nextThink = new Map<number, number>();
function botStep(w: World, gid: number) {
  if ((nextThink.get(gid) ?? 0) > Date.now()) return;
  nextThink.set(gid, Date.now() + (QUICK.botThink[0] + Math.random() * (QUICK.botThink[1] - QUICK.botThink[0])) * 1000);
  const cap = START_POINT_BY_ID[w.nations.get(gid)!.capital].region;
  if (![...w.structures.values()].some((s) => s.nationId === gid && s.type === 'city')) {
    try {
      const at = freePointIn(cap, [...w.structures.values()].map((s) => s.at), ECONOMY.minDistanceKm + 5);
      if (at) build(w, gid, at, 'city', cap);
    } catch {
      /* sem recursos: tenta depois */
    }
  }
  if (w.occupations.some((o) => o.nationId === gid)) return;
  const mine = [...w.control].filter(([, o]) => o === gid).map(([r]) => r);
  const busy = new Set(w.occupations.map((o) => o.region));
  const arena = new Set(w.view.arena!);
  const targets = expansionTargets(mine, (r) => arena.has(r) && !w.control.has(r) && !busy.has(r));
  if (targets.length) {
    try {
      expand(w, gid, targets[Math.floor(Math.random() * targets.length)]);
    } catch {
      /* sem recursos: tenta depois */
    }
  }
}
function standings(w: World) {
  const by = new Map([...w.nations.keys()].map((n) => [n, { nationId: n, regions: 0, area: 0 }]));
  let owned = 0;
  for (const [r, o] of w.control) {
    if (!w.view.arena!.includes(r)) continue;
    owned++;
    const s = by.get(o)!;
    s.regions++;
    s.area += REGION_BY_ID[r].area;
  }
  return { list: [...by.values()], neutral: w.view.arena!.length - owned };
}
function finish(w: World, reason: WorldView['outcome'], loser: number | null = null) {
  if (w.view.finishedAt) return;
  let ranking = rank(standings(w).list);
  if (loser !== null) ranking = [...ranking.filter((s) => s.nationId !== loser), ...ranking.filter((s) => s.nationId === loser)];
  w.view = { ...w.view, finishedAt: Date.now(), outcome: reason, winner: ranking[0]?.nationId ?? null, results: ranking.map((s, i) => ({ ...s, rank: i + 1 })) };
  w.occupations = [];
  send(w.view.id, { type: 'play.match', world: w.view });
}
function checkMatch(w: World) {
  const s = standings(w);
  const out = matchOutcome({ arenaSize: w.view.arena!.length, standings: s.list, now: Date.now(), endsAt: w.view.endsAt, neutralLeft: s.neutral, activeOccupations: w.occupations.length });
  if (out.over) finish(w, out.reason);
}

// ---------- comandos ----------

function blockedColors(w: World, pointId: string): string[] {
  const point = START_POINT_BY_ID[pointId];
  if (!point) return [];
  return [...new Set([...w.nations.values()].filter((n) => distanceKm(point.at, START_POINT_BY_ID[n.capital].at) < COLOR_EXCLUSION_KM).map((n) => n.color))];
}
function createNation(w: World, gid: number, point: StartPoint, name: string, color: string, flag: NationView['flag'], image?: { bytes: Buffer; type: string }, bot = false) {
  if (w.nations.has(gid)) throw new Fail(409, 'nation_exists', 'Você já fundou sua nação neste mundo.');
  if (w.view.arena && !w.view.arena.includes(point.region)) throw new Fail(409, 'outside_arena', 'Este ponto fica fora da área da partida.');
  if (w.control.has(point.region)) throw new Fail(409, 'region_taken', 'Esta região já pertence a outra nação. Escolha outro ponto.');
  if ([...w.nations.values()].some((n) => n.name.toLowerCase() === name.toLowerCase())) throw new Fail(409, 'name_taken', 'Já existe uma nação com este nome neste mundo.');
  if (blockedColors(w, point.id).includes(color)) throw new Fail(409, 'color_taken', 'Uma nação vizinha já usa esta cor. Escolha outra para que as fronteiras fiquem legíveis.');
  const nation: NationView = { id: gid, name, color, flag, flagImage: image ? 1 : null, capital: point.id, foundedAt: Date.now(), bot, alliance: null };
  w.nations.set(gid, { ...nation, image });
  w.control.set(point.region, gid);
  w.wallet.set(gid, { amounts: { ...ECONOMY.starting }, settledAt: Date.now() });
  if (bot) w.bots.add(gid);
  return nation;
}
function expand(w: World, gid: number, region: string) {
  const target = REGION_BY_ID[region];
  if (!target) throw new Fail(404, 'not_found', 'Região desconhecida.');
  if (w.view.finishedAt) throw new Fail(409, 'match_over', 'Esta partida já terminou.');
  if (w.view.arena && !w.view.arena.includes(region)) throw new Fail(409, 'outside_arena', 'Esta região fica fora da área da partida.');
  if (w.occupations.some((o) => o.nationId === gid)) throw new Fail(409, 'occupation_busy', 'Sua nação já está ocupando uma região. Aguarde a conclusão.');
  if (w.control.has(region)) throw new Fail(409, 'region_taken', 'Esta região pertence a outra nação. Ataques ainda não existem no servidor.');
  if (w.occupations.some((o) => o.region === region)) throw new Fail(409, 'region_contested', 'Outra nação já está ocupando esta região.');
  const owned = [...w.control].filter(([, o]) => o === gid).map(([r]) => r);
  const from = borderingRegion(owned, region);
  if (!from) throw new Fail(409, 'not_adjacent', 'Só é possível ocupar regiões que fazem fronteira terrestre com o seu território.');
  spend(w, gid, expansionCost(owned.length), 'ocupar esta região');
  const seconds = expansionSeconds(target.area, owned.length, w.view.mode);
  const now = Date.now();
  const occupation: OccupationView = { id: id(), nationId: gid, region, from, startedAt: now, endsAt: now + (seconds * 1000) / SPEED };
  w.occupations.push(occupation);
  send(w.view.id, { type: 'play.occupation', occupation });
  announceEconomy(w, gid);
  return { occupation, seconds };
}
function build(w: World, gid: number, at: [number, number], type: StructureType, hint?: string) {
  if (!STRUCTURE_TYPES.includes(type)) throw new Fail(400, 'invalid_type', 'Construção desconhecida.');
  if (w.view.finishedAt) throw new Fail(409, 'match_over', 'Esta partida já terminou.');
  const owned = [...w.control].filter(([, o]) => o === gid).map(([r]) => r);
  const region = regionAt(at[0], at[1], hint ? [hint, ...owned] : owned);
  if (!region || w.control.get(region) !== gid) throw new Fail(409, 'not_owner', 'Construa dentro do seu território.');
  const all = [...w.structures.values()];
  if (all.some((s) => distanceKm(s.at, at) < ECONOMY.minDistanceKm)) throw new Fail(409, 'too_close', `Muito perto de outra construção. Deixe pelo menos ${ECONOMY.minDistanceKm} km.`);
  const mine = all.filter((s) => s.nationId === gid);
  const problem = buildProblem(type, {
    region,
    coast: REGION_BY_ID[region].coast,
    capitalRegion: START_POINT_BY_ID[w.nations.get(gid)!.capital].region,
    inRegion: all.filter((s) => s.region === region).length,
    queue: mine.filter((s) => s.building).length,
  });
  if (problem) throw new Fail(409, 'cannot_build', problem);
  spend(w, gid, structureCost(type, 0, mine.filter((s) => s.type === type).length), 'esta construção');
  const now = Date.now();
  const s: StructureView = { id: id(), nationId: gid, region, type, at, level: 0, building: { to: 1, startedAt: now, endsAt: now + (structureSeconds(type, 0, w.view.mode) * 1000) / SPEED } };
  w.structures.set(s.id, s);
  send(w.view.id, { type: 'play.structure', structure: s, completed: false });
  announceEconomy(w, gid);
  return s;
}
function upgrade(w: World, gid: number, sid: number) {
  const s = w.structures.get(sid);
  if (!s || s.nationId !== gid) throw new Fail(404, 'not_found', 'Construção não encontrada.');
  if (w.view.finishedAt) throw new Fail(409, 'match_over', 'Esta partida já terminou.');
  if (s.building) throw new Fail(409, 'cannot_build', 'Esta construção já está em obra.');
  if (s.level >= ECONOMY.maxLevel) throw new Fail(409, 'cannot_build', `Nível máximo (${ECONOMY.maxLevel}) alcançado.`);
  if ([...w.structures.values()].filter((x) => x.nationId === gid && x.building).length >= ECONOMY.buildQueue) {
    throw new Fail(409, 'cannot_build', `Já há ${ECONOMY.buildQueue} obras em andamento. Aguarde uma terminar.`);
  }
  spend(w, gid, structureCost(s.type, s.level), 'esta melhoria');
  const now = Date.now();
  const up: StructureView = { ...s, building: { to: s.level + 1, startedAt: now, endsAt: now + (structureSeconds(s.type, s.level, w.view.mode) * 1000) / SPEED } };
  w.structures.set(sid, up);
  send(w.view.id, { type: 'play.structure', structure: up, completed: false });
  announceEconomy(w, gid);
  return up;
}

const snapshot = (w: World, gid: number | null) => ({
  serverTime: Date.now(),
  world: w.view,
  me: gid !== null && w.nations.has(gid) ? gid : null,
  nations: [...w.nations.values()].map(({ image: _image, ...n }) => n),
  control: [...w.control],
  occupations: w.occupations,
  structures: [...w.structures.values()],
  economy: gid !== null ? economyView(w, gid) : null,
});

const seatsOf = (s: Session) =>
  [...s.seats].map(([wid, gid]) => ({ id: wid, name: worlds.get(wid)!.view.name, mode: worlds.get(wid)!.view.mode, governorId: gid, finished: !!worlds.get(wid)!.view.finishedAt, endsAt: worlds.get(wid)!.view.endsAt }));

function route(method: string, url: URL, body: any, s: Session | null, worldHeader: number | null, setCookie: (v: string) => void): unknown {
  const p = url.pathname.replace(/^\/api/, '');
  if (p === '/meta') return { modes: MODES_AVAILABLE, serverTime: Date.now(), worlds: [{ id: 1, name: worlds.get(1)!.view.name, status: 'open', mode: 'campaign', population: 0, capacity: 500 }] };
  if (p === '/auth/register' || p === '/auth/login') {
    const token = `t${id()}`;
    sessions.set(token, { userId: id(), username: String(body.username), seats: new Map() });
    setCookie(`ku_session=${token}; Path=/; HttpOnly`);
    return { ok: true };
  }
  if (p === '/auth/logout') {
    setCookie('ku_session=; Path=/; Max-Age=0');
    return { ok: true };
  }
  if (!s) throw new Fail(401, 'unauthenticated', 'Faça login para continuar.');
  const wid = worldHeader !== null && s.seats.has(worldHeader) ? worldHeader : 1;
  const gid = s.seats.get(wid) ?? null;
  if (p === '/me') return { userId: s.userId, username: s.username, governor: gid ? { id: gid, kingdomId: wid } : null, worlds: seatsOf(s), serverTime: Date.now() };
  if (p === '/governor') {
    s.seats.set(1, id());
    return { governorId: s.seats.get(1) };
  }
  if (p === '/quick/start') {
    const open = [...s.seats.keys()].find((k) => worlds.get(k)!.view.mode === 'quick' && !worlds.get(k)!.view.finishedAt);
    if (open) return { worldId: open, created: false };
    const seed = Math.floor(Math.random() * 1000);
    const theater = THEATERS[Number(process.env.MOCK_THEATER ?? seed) % THEATERS.length];
    const arena = buildArena(theater.id);
    const qid = 1000 + id();
    const w = newWorld(qid, `Partida rápida · ${theater.name}`, 'quick', arena);
    worlds.set(qid, w);
    s.seats.set(qid, id());
    const points = pickBotPoints(arena, QUICK.bots, seed);
    botIdentities(QUICK.bots, seed).forEach((look, i) => createNation(w, id(), points[i], look.name, look.color, look.flag, undefined, true));
    return { worldId: qid, created: true };
  }
  if (gid === null) throw new Fail(409, 'no_governor', 'Você ainda não entrou neste mundo.');
  const w = worlds.get(wid)!;
  if (p === '/quick/leave') return (finish(w, 'abandoned', gid), { ok: true });
  if (p === '/play/state') return snapshot(w, gid);
  if (p === '/play/colors') return { blocked: blockedColors(w, url.searchParams.get('pointId') ?? '') };
  if (p === '/play/found' && method === 'POST') {
    const point = START_POINT_BY_ID[body.pointId];
    if (!point) throw new Fail(404, 'not_found', 'Ponto de partida desconhecido.');
    const name = cleanNationName(String(body.name ?? ''));
    const problem = nationNameProblem(name);
    if (problem) throw new Fail(400, 'invalid_name', problem);
    const flag = parseFlag(body.flag);
    if (!flag) throw new Fail(400, 'invalid_flag', 'Bandeira inválida.');
    if (!NATION_COLOR_BY_HEX[body.color]) throw new Fail(400, 'invalid_color', 'Cor fora da paleta.');
    let image: { bytes: Buffer; type: string } | undefined;
    if (body.flagImage) {
      const bytes = Buffer.from(String(body.flagImage), 'base64');
      const check = inspectFlagImage(bytes);
      if (!check.ok) throw new Fail(400, 'invalid_flag_image', check.reason);
      image = { bytes, type: check.type };
    }
    const nation = createNation(w, gid, point, name, body.color, flag, image);
    if (w.view.mode === 'quick' && !w.view.endsAt) w.view = { ...w.view, endsAt: Date.now() + QUICK.minutes * 60_000 };
    send(w.view.id, { type: 'play.nation', nation, region: point.region });
    send(w.view.id, { type: 'play.match', world: w.view });
    return snapshot(w, gid);
  }
  if (p === '/play/expand' && method === 'POST') return expand(w, gid, body.region);
  if (p === '/play/build' && method === 'POST') return { structure: build(w, gid, body.at, body.type, body.region) };
  if (p === '/play/upgrade' && method === 'POST') return { structure: upgrade(w, gid, Number(body.structureId)) };
  throw new Fail(404, 'not_found', 'Rota inexistente.');
}

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
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
    const image = [...worlds.values()].map((w) => w.nations.get(Number(flag[1]))?.image).find(Boolean);
    res.writeHead(image ? 200 : 404, { 'Content-Type': image?.type ?? 'text/plain' });
    res.end(image?.bytes);
    return;
  }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    try {
      const wh = Number(req.headers['x-ku-world']);
      const out = route(req.method ?? 'GET', url, raw ? JSON.parse(raw) : {}, sessionOf(req), Number.isInteger(wh) && wh > 0 ? wh : null, (v) => res.setHeader('Set-Cookie', v));
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
  const s = sessionOf(req);
  if (!s) return ws.close();
  const wq = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('world'));
  const wid = s.seats.has(wq) ? wq : 1;
  sockets.set(ws, { world: wid, gov: s.seats.get(wid) ?? null });
  ws.on('close', () => sockets.delete(ws));
  ws.send(JSON.stringify({ type: 'hello', serverTime: Date.now() }));
});
server.listen(PORT, '127.0.0.1', () => console.log(`servidor falso de teste em http://127.0.0.1:${PORT}`));
