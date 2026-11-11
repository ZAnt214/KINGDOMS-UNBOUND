#!/usr/bin/env node
/**
 * Gera as regiões conquistáveis do mapa a partir do Natural Earth (domínio público).
 *
 *   node tools/build-regions.mjs <dir-geojson-natural-earth>
 *
 * Entradas: ne_10m_admin_1_states_provinces.geojson e ne_50m_populated_places.geojson
 * (github.com/nvkelso/natural-earth-vector, pasta geojson/).
 *
 * O que faz:
 *  1. monta uma topologia (arcos compartilhados) para que vizinhos usem exatamente a mesma linha;
 *  2. funde regiões pequenas na vizinha do mesmo país (regras em PARAMS), para que o mundo tenha
 *     regiões jogáveis em vez de milhares de municípios;
 *  3. simplifica cada arco uma única vez (fronteiras continuam coincidindo);
 *  4. calcula área, vizinhança terrestre e os pontos de partida (capitais e cidades estratégicas).
 *
 * Saídas:
 *   client/public/world/regions.topo.json  geometria + nomes (cliente)
 *   shared/world/regions.json              área e vizinhança (servidor e regras)
 *   shared/world/startpoints.json          pontos de partida (cliente e servidor)
 *
 * Os ids das regiões (`adm1_code` da maior região fundida) ficam gravados no banco. Mudar PARAMS
 * muda quais regiões existem: só regenere com outros parâmetros junto de uma migração.
 */
import fs from 'node:fs';
import path from 'node:path';

const [src] = process.argv.slice(2);
if (!src) throw new Error('uso: node tools/build-regions.mjs <dir-natural-earth>');
const root = path.resolve(import.meta.dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(src, f), 'utf8'));

export const PARAMS = {
  /** Quantização: 0,01 grau (~1,1 km). */
  Q: 100,
  /** Tolerância de simplificação em unidades quantizadas (Douglas–Peucker). */
  TOLERANCE: 3,
  /** Regiões menores que isto (km²) são fundidas na vizinha do mesmo país. */
  MIN_REGION_KM2: 12000,
  /** Máximo de regiões por país; acima disso as menores continuam sendo fundidas. */
  MAX_REGIONS_PER_COUNTRY: 48,
  /** Ilhas/exclaves pequenos só se fundem a uma região a até esta distância (km). */
  MAX_MERGE_DISTANCE_KM: 450,
  /** Possessões minúsculas e remotas (km²) se fundem à região mais próxima do país, a qualquer distância. */
  REMOTE_SPECK_KM2: 1500,
  /** Anéis (ilhotas) menores que isto somem do desenho, exceto se forem a região inteira. */
  MIN_RING_KM2: 120,
  /** Cidade não capital vira ponto estratégico a partir desta população. */
  STRATEGIC_POPULATION: 2500000,
  /** Região fundida que contém a capital nacional leva o nome da capital, até este tamanho (km²). */
  CAPITAL_NAMED_MAX_KM2: 150000,
};

const R = 6371.0088;
const RAD = Math.PI / 180;
const { Q } = PARAMS;

// O Natural Earth traz os nomes em português europeu; o jogo usa as formas do Brasil.
const PT_BR = {
  Benim: 'Benin', Chéquia: 'Tchéquia', 'República da Irlanda': 'Irlanda', Irão: 'Irã', Mónaco: 'Mônaco', Madagáscar: 'Madagascar',
  Maurícia: 'Maurício', Vietname: 'Vietnã', Iémen: 'Iêmen', Moscovo: 'Moscou', Teerão: 'Teerã', Bagdade: 'Bagdá', Amesterdão: 'Amsterdã',
  Banguecoque: 'Bangkok', Copenhaga: 'Copenhague', Helsínquia: 'Helsinque', Tunes: 'Túnis', 'Nova Deli': 'Nova Délhi', Lusaca: 'Lusaka',
  Tiblíssi: 'Tbilisi', Jamena: "N'Djamena", Brazavile: 'Brazzaville', Tasquente: 'Tashkent', Bisqueque: 'Bishkek', Duchambe: 'Duchambé',
  Erevan: 'Ierevan', Sana: 'Sanaa', 'Nur-Sultã': 'Astana', Vienciana: 'Vientiane', Melequeoque: 'Ngerulmud', Mebabane: 'Mbabane',
  'Nova Iorque': 'Nova York', Bombaim: 'Mumbai', Xangai: 'Xangai', Pequim: 'Pequim',
};
const ptBR = (name) => (PT_BR[name] ?? name).replace(/ónia\b/g, 'ônia').replace(/énia\b/g, 'ênia').replace(/ónio\b/g, 'ônio');

const countries = JSON.parse(fs.readFileSync(path.join(root, 'shared/world/countries.json'), 'utf8'));
const knownCountry = new Set(countries.map((c) => c.code));

// ---------- 1. leitura e quantização ----------

/** Área esférica (km²) de um anel em graus. */
function ringArea(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [l1, p1] = ring[j];
    const [l2, p2] = ring[i];
    let d = (l2 - l1) * RAD;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    s += d * (2 + Math.sin(p1 * RAD) + Math.sin(p2 * RAD));
  }
  return Math.abs((s * R * R) / 2);
}
const haversine = (a, b) => {
  const dp = (b[1] - a[1]) * RAD;
  const dl = (b[0] - a[0]) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

const admin1 = read('ne_10m_admin_1_states_provinces.geojson');
const K = 100000; // chave de vértice: x * K + y, com deslocamento para ficar positivo
const vkey = (x, y) => (x + 18000) * K + (y + 9000);
const vx = (k) => Math.floor(k / K) - 18000;
const vy = (k) => (k % K) - 9000;

/** units[i]: uma região original do Natural Earth. */
const units = [];
/** rings[i]: { unit, pts: number[] (chaves de vértice, sem repetir o primeiro), area } */
const rings = [];
for (const f of admin1.features) {
  const p = f.properties;
  if (!knownCountry.has(p.adm0_a3) || !f.geometry) continue;
  const rawName = p.name_pt || p.name || p.name_en || p.gn_name || '';
  const unit = {
    id: p.adm1_code,
    country: p.adm0_a3,
    name: /\?/.test(rawName) ? '' : ptBR(rawName),
    area: 0,
    rings: [],
    polys: [],
  };
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    unit.polys.push(poly);
    poly.forEach((ring, hole) => {
      const a = ringArea(ring);
      unit.area += hole ? -a : a;
      const pts = [];
      for (const [lon, lat] of ring) {
        const k = vkey(Math.round(lon * Q), Math.round(lat * Q));
        if (pts[pts.length - 1] !== k) pts.push(k);
      }
      if (pts.length > 1 && pts[0] === pts[pts.length - 1]) pts.pop();
      if (pts.length < 3) return;
      unit.rings.push(rings.length);
      rings.push({ unit: units.length, pts, area: a, hole: hole > 0 });
    });
  }
  if (unit.rings.length) units.push(unit);
}

// ---------- 2. topologia: junções e arcos ----------

const neighbors = new Map();
const link = (a, b) => {
  let s = neighbors.get(a);
  if (!s) neighbors.set(a, (s = new Set()));
  s.add(b);
};
for (const r of rings) {
  const n = r.pts.length;
  for (let i = 0; i < n; i++) {
    link(r.pts[i], r.pts[(i + 1) % n]);
    link(r.pts[(i + 1) % n], r.pts[i]);
  }
}
const isJunction = (k) => neighbors.get(k).size > 2;

const arcs = []; // { pts: number[], closed }
const arcIndex = new Map();
function arcRef(pts, closed) {
  let seq = pts;
  if (closed) {
    // Anel sem junção: gira para começar no menor vértice e escolhe um sentido canônico.
    let m = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] < seq[m]) m = i;
    seq = [...seq.slice(m), ...seq.slice(0, m)];
    const rev = [seq[0], ...seq.slice(1).reverse()];
    const fwdKey = seq.join(',');
    const revKey = rev.join(',');
    const reversed = revKey < fwdKey;
    const key = reversed ? revKey : fwdKey;
    let idx = arcIndex.get(key);
    if (idx === undefined) {
      idx = arcs.length;
      arcIndex.set(key, idx);
      const base = reversed ? rev : seq;
      arcs.push({ pts: [...base, base[0]], closed: true });
    }
    return reversed ? ~idx : idx;
  }
  const a = seq[0];
  const b = seq[seq.length - 1];
  let reversed = b < a;
  if (a === b) reversed = seq[seq.length - 2] < seq[1];
  const base = reversed ? [...seq].reverse() : seq;
  const key = base.join(',');
  let idx = arcIndex.get(key);
  if (idx === undefined) {
    idx = arcs.length;
    arcIndex.set(key, idx);
    arcs.push({ pts: base, closed: false });
  }
  return reversed ? ~idx : idx;
}

for (const r of rings) {
  const n = r.pts.length;
  const cuts = [];
  for (let i = 0; i < n; i++) if (isJunction(r.pts[i])) cuts.push(i);
  if (!cuts.length) {
    r.arcs = [arcRef(r.pts, true)];
    continue;
  }
  r.arcs = [];
  for (let c = 0; c < cuts.length; c++) {
    const from = cuts[c];
    const to = cuts[(c + 1) % cuts.length];
    const seq = [];
    for (let i = from; ; i = (i + 1) % n) {
      seq.push(r.pts[i]);
      if (i === to && seq.length > 1) break;
      if (seq.length > n + 1) throw new Error('anel sem fim');
    }
    r.arcs.push(arcRef(seq, false));
  }
}

const arcLen = arcs.map((a) => {
  let d = 0;
  for (let i = 1; i < a.pts.length; i++) d += haversine([vx(a.pts[i - 1]) / Q, vy(a.pts[i - 1]) / Q], [vx(a.pts[i]) / Q, vy(a.pts[i]) / Q]);
  return d;
});
/** Quais unidades usam cada arco. */
const arcUnits = arcs.map(() => []);
for (const r of rings) for (const ref of r.arcs) arcUnits[ref < 0 ? ~ref : ref].push(r.unit);

// ---------- 3. fusão de regiões pequenas ----------

const parent = units.map((_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const groupArea = units.map((u) => u.area);
const groupMembers = units.map((_, i) => [i]);
const centroid = units.map((u) => {
  // Centro do maior polígono (média dos vértices: suficiente para medir distância entre regiões).
  let best = u.polys[0];
  let bestA = 0;
  for (const poly of u.polys) {
    const a = ringArea(poly[0]);
    if (a > bestA) [best, bestA] = [poly, a];
  }
  let x = 0;
  let y = 0;
  for (const [lon, lat] of best[0]) {
    x += lon;
    y += lat;
  }
  return [x / best[0].length, y / best[0].length];
});

/** Comprimento de fronteira (km) entre o grupo g e cada grupo vizinho do mesmo país. */
function sameCountryBorders(g) {
  const out = new Map();
  for (const m of groupMembers[g]) {
    for (const ri of units[m].rings) {
      for (const ref of rings[ri].arcs) {
        const idx = ref < 0 ? ~ref : ref;
        for (const other of arcUnits[idx]) {
          const og = find(other);
          if (og === g || units[other].country !== units[m].country) continue;
          out.set(og, (out.get(og) ?? 0) + arcLen[idx]);
        }
      }
    }
  }
  return out;
}

function union(a, b) {
  // O grupo maior dá o id e o nome.
  const [keep, drop] = groupArea[a] >= groupArea[b] ? [a, b] : [b, a];
  parent[drop] = keep;
  groupArea[keep] += groupArea[drop];
  groupMembers[keep].push(...groupMembers[drop]);
  groupMembers[drop] = [];
  return keep;
}

const byCountry = new Map();
units.forEach((u, i) => {
  if (!byCountry.has(u.country)) byCountry.set(u.country, []);
  byCountry.get(u.country).push(i);
});

for (const [, list] of byCountry) {
  const stuck = new Set();
  const countryArea = list.reduce((sum, i) => sum + units[i].area, 0);
  for (;;) {
    const groups = [...new Set(list.map(find))];
    if (groups.length <= 1) break;
    const candidates = groups.filter((g) => !stuck.has(g)).sort((a, b) => groupArea[a] - groupArea[b]);
    const g = candidates[0];
    if (g === undefined) break;
    const tooMany = groups.length > PARAMS.MAX_REGIONS_PER_COUNTRY;
    if (groupArea[g] >= PARAMS.MIN_REGION_KM2 && !tooMany) break;
    const borders = sameCountryBorders(g);
    let target = null;
    if (borders.size) {
      target = [...borders.entries()].sort((a, b) => b[1] - a[1])[0][0];
    } else {
      // Ilha ou exclave: a região mais próxima do mesmo país, se estiver perto. País-arquipélago
      // pequeno e possessões minúsculas se fundem a qualquer distância.
      const anyDistance = countryArea < PARAMS.MIN_REGION_KM2 || groupArea[g] < PARAMS.REMOTE_SPECK_KM2;
      let bestD = anyDistance ? Infinity : PARAMS.MAX_MERGE_DISTANCE_KM;
      for (const og of groups) {
        if (og === g) continue;
        for (const m of groupMembers[g]) for (const om of groupMembers[og]) {
          const d = haversine(centroid[m], centroid[om]);
          if (d < bestD) [bestD, target] = [d, og];
        }
      }
    }
    if (target === null) stuck.add(g);
    else {
      const kept = union(g, target);
      stuck.delete(kept);
    }
  }
}

// ---------- 4. regiões finais: anéis sem arcos internos ----------

const groupIds = [...new Set(units.map((_, i) => find(i)))];
const regions = [];
const regionOfUnit = new Map();
for (const g of groupIds) {
  const members = groupMembers[g];
  // Id e nome vêm da maior unidade fundida.
  const lead = units[members.reduce((a, b) => (units[b].area > units[a].area ? b : a))];
  const countryName = countries.find((c) => c.code === lead.country).name;
  const name = lead.name || countryName;
  const use = new Map(); // arco -> soma das orientações
  for (const m of members) for (const ri of units[m].rings) for (const ref of rings[ri].arcs) {
    const idx = ref < 0 ? ~ref : ref;
    const e = use.get(idx) ?? { fwd: 0, rev: 0 };
    if (ref < 0) e.rev++;
    else e.fwd++;
    use.set(idx, e);
  }
  // Arco percorrido nos dois sentidos dentro do grupo é fronteira interna: some.
  const refs = [];
  for (const [idx, e] of use) {
    // (Unidades sobrepostas na fonte repetem o arco no mesmo sentido: conta uma vez só.)
    const n = e.fwd - e.rev;
    if (n !== 0) refs.push(n > 0 ? idx : ~idx);
  }
  regions.push({ g, id: lead.id, country: lead.country, name: members.length === byCountry.get(lead.country).length && members.length > 1 ? countryName : name, area: groupArea[g], refs, members });
  for (const m of members) regionOfUnit.set(m, regions.length - 1);
}

const endpoints = (ref) => {
  const a = arcs[ref < 0 ? ~ref : ref];
  return ref < 0 ? [a.pts[a.pts.length - 1], a.pts[0]] : [a.pts[0], a.pts[a.pts.length - 1]];
};
for (const reg of regions) {
  const starts = new Map();
  for (const ref of reg.refs) {
    const [s] = endpoints(ref);
    if (!starts.has(s)) starts.set(s, []);
    starts.get(s).push(ref);
  }
  reg.rings = [];
  const used = new Set();
  for (const first of reg.refs) {
    if (used.has(first)) continue;
    const ring = [];
    let ref = first;
    const origin = endpoints(first)[0];
    for (;;) {
      used.add(ref);
      ring.push(ref);
      const end = endpoints(ref)[1];
      if (end === origin) break;
      const next = (starts.get(end) ?? []).find((r) => !used.has(r));
      if (next === undefined) throw new Error(`anel aberto em ${reg.id}`);
      ref = next;
    }
    reg.rings.push(ring);
  }
}

// ---------- 5. simplificação dos arcos e descarte de ilhotas ----------

function simplify(pts, tol, closed) {
  const n = pts.length;
  if (n <= 2) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  if (closed) {
    // Anel fechado: fixa também o ponto mais distante do início para não degenerar.
    let far = 0;
    let farD = -1;
    for (let i = 1; i < n - 1; i++) {
      const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
      if (d > farD) [far, farD] = [i, d];
    }
    keep[far] = 1;
    stack.length = 0;
    stack.push([0, far], [far, n - 1]);
  }
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    let worst = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
      const d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      if (d > worst) [worst, idx] = [d, i];
    }
    if (idx >= 0 && worst > tol * tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const arcPts = arcs.map((a) => a.pts.map((k) => [vx(k), vy(k)]));
const arcAreaKm2 = (idx) => ringArea(arcPts[idx].map(([x, y]) => [x / Q, y / Q]));

for (const reg of regions) {
  // Ilhotas: anel de um único arco fechado, pequeno, quando a região tem outros anéis maiores.
  const sized = reg.rings.map((ring) => ({ ring, islet: ring.length === 1 && arcs[ring[0] < 0 ? ~ring[0] : ring[0]].closed, area: 0 }));
  for (const s of sized) if (s.islet) s.area = arcAreaKm2(s.ring[0] < 0 ? ~s.ring[0] : s.ring[0]);
  const biggest = Math.max(...sized.map((s) => (s.islet ? s.area : Infinity)));
  reg.rings = sized.filter((s) => !s.islet || s.area >= PARAMS.MIN_RING_KM2 || s.area === biggest).map((s) => s.ring);
}

const usedArc = new Map();
const outArcs = [];
const remap = (ref) => {
  const idx = ref < 0 ? ~ref : ref;
  let n = usedArc.get(idx);
  if (n === undefined) {
    n = outArcs.length;
    usedArc.set(idx, n);
    const s = simplify(arcPts[idx], PARAMS.TOLERANCE, arcs[idx].closed);
    const flat = [];
    let px = 0;
    let py = 0;
    for (const [x, y] of s) {
      flat.push(x - px, y - py);
      px = x;
      py = y;
    }
    outArcs.push(flat);
  }
  return ref < 0 ? ~n : n;
};
for (const reg of regions) reg.rings = reg.rings.map((ring) => ring.map(remap));

// ---------- 6. vizinhança terrestre ----------

const regionArcOwners = new Map();
regions.forEach((reg, i) => {
  for (const ring of reg.rings) for (const ref of ring) {
    const idx = ref < 0 ? ~ref : ref;
    if (!regionArcOwners.has(idx)) regionArcOwners.set(idx, new Set());
    regionArcOwners.get(idx).add(i);
  }
});
const adjacency = regions.map(() => new Set());
let coastArcs = 0;
for (const owners of regionArcOwners.values()) {
  const list = [...owners];
  if (list.length === 1) coastArcs++;
  for (const a of list) for (const b of list) if (a !== b) adjacency[a].add(b);
}

// ---------- 7. rótulo e pontos de partida ----------

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function unitContains(u, lon, lat) {
  for (const poly of u.polys) {
    if (!pointInRing(lon, lat, poly[0])) continue;
    if (poly.slice(1).some((hole) => pointInRing(lon, lat, hole))) continue;
    return true;
  }
  return false;
}
const unitBox = units.map((u) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of u.polys) for (const [x, y] of poly[0]) {
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
  return b;
});
function regionAt(lon, lat, country) {
  for (let i = 0; i < units.length; i++) {
    const b = unitBox[i];
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    if (unitContains(units[i], lon, lat)) return regionOfUnit.get(i);
  }
  // Cidade costeira fora do polígono por arredondamento: a região mais próxima do mesmo país.
  let best = null;
  let bestD = 80;
  for (let i = 0; i < units.length; i++) {
    if (country && units[i].country !== country) continue;
    for (const poly of units[i].polys) for (let k = 0; k < poly[0].length; k += 3) {
      const d = haversine([lon, lat], poly[0][k]);
      if (d < bestD) [bestD, best] = [d, i];
    }
  }
  return best === null ? null : regionOfUnit.get(best);
}

/** Ponto do rótulo: centro do maior polígono da maior unidade; se cair fora, um vértice interno aproximado. */
for (const reg of regions) {
  const lead = units[reg.g];
  let [lon, lat] = centroid[reg.g];
  if (!unitContains(lead, lon, lat)) {
    // Busca um ponto interno numa varredura horizontal na latitude do centro.
    let best = null;
    for (const poly of lead.polys) {
      const xs = [];
      const ring = poly[0];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat) xs.push(((xj - xi) * (lat - yi)) / (yj - yi) + xi);
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
    }
    if (best) lon = (best[0] + best[1]) / 2;
  }
  reg.at = [+lon.toFixed(2), +lat.toFixed(2)];
}

const places = read('ne_50m_populated_places.geojson').features.map((f) => f.properties);
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const startPoints = [];
const takenRegion = new Set();
const pushPoint = (p, kind) => {
  const country = knownCountry.has(p.ADM0_A3) ? p.ADM0_A3 : null;
  const ri = regionAt(p.LONGITUDE, p.LATITUDE, country);
  if (ri === null || ri === undefined) return;
  // Um ponto de partida por região: a região inicial de cada jogador é exclusiva.
  if (takenRegion.has(ri)) return;
  takenRegion.add(ri);
  const reg = regions[ri];
  const cityName = ptBR(p.NAME_PT || p.NAME);
  const nameFree = !regions.some((r) => r !== reg && r.country === reg.country && r.name === cityName);
  if (kind === 'capital' && nameFree && reg.members.length > 1 && reg.area < PARAMS.CAPITAL_NAMED_MAX_KM2 && reg.members.length < byCountry.get(reg.country).length) {
    reg.name = cityName;
  }
  startPoints.push({
    id: `${kind === 'capital' ? 'cap' : 'city'}-${reg.country.toLowerCase()}-${slug(p.NAME)}`,
    kind,
    name: ptBR(p.NAME_PT || p.NAME),
    country: reg.country,
    region: reg.id,
    at: [+p.LONGITUDE.toFixed(3), +p.LATITUDE.toFixed(3)],
    population: Math.round(p.POP_MAX),
  });
};
const capitals = places.filter((p) => p.ADM0CAP === 1).sort((a, b) => b.POP_MAX - a.POP_MAX);
for (const p of capitals) pushPoint(p, 'capital');
const strategic = places.filter((p) => p.ADM0CAP !== 1 && p.POP_MAX >= PARAMS.STRATEGIC_POPULATION).sort((a, b) => b.POP_MAX - a.POP_MAX);
for (const p of strategic) pushPoint(p, 'strategic');
startPoints.sort((a, b) => a.id.localeCompare(b.id));

// Nomes repetidos dentro do país (pedaços separados da mesma unidade) ganham o ponto cardeal.
const sameName = new Map();
for (const reg of regions) {
  const k = `${reg.country}|${reg.name}`;
  if (!sameName.has(k)) sameName.set(k, []);
  sameName.get(k).push(reg);
}
for (const list of sameName.values()) {
  if (list.length < 2) continue;
  const lons = list.map((r) => r.at[0]);
  const lats = list.map((r) => r.at[1]);
  const byLat = Math.max(...lats) - Math.min(...lats) >= (Math.max(...lons) - Math.min(...lons)) * 0.6;
  const ordered = [...list].sort((a, b) => (byLat ? b.at[1] - a.at[1] : a.at[0] - b.at[0]));
  const tags = byLat ? ['Norte', 'Centro', 'Sul'] : ['Oeste', 'Centro', 'Leste'];
  ordered.forEach((r, i) => {
    const tag = ordered.length === 2 ? tags[i * 2] : (tags[i] ?? `${i + 1}`);
    r.name = `${r.name} ${tag}`;
  });
}
if (new Set(startPoints.map((p) => p.id)).size !== startPoints.length) throw new Error('id de ponto de partida duplicado');

// ---------- 8. saída ----------

const order = regions.map((_, i) => i).sort((a, b) => regions[a].id.localeCompare(regions[b].id));
const pos = new Map(order.map((i, n) => [i, n]));
const sorted = order.map((i) => regions[i]);
if (new Set(sorted.map((r) => r.id)).size !== sorted.length) throw new Error('id de região duplicado');

const write = (rel, data) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  console.log(rel, `${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
};
write('client/public/world/regions.topo.json', {
  v: 1,
  source: 'Natural Earth 1:10m admin-1',
  q: Q,
  arcs: outArcs,
  regions: sorted.map((r) => ({ id: r.id, c: r.country, n: r.name, at: r.at, r: r.rings })),
});
write(
  'shared/world/regions.json',
  sorted.map((r, n) => ({
    id: r.id,
    country: r.country,
    name: r.name,
    area: Math.round(r.area),
    at: r.at,
    neighbors: [...adjacency[order[n]]].map((i) => sorted[pos.get(i)].id).sort(),
  })),
);
write('shared/world/startpoints.json', startPoints);

const points = outArcs.reduce((s, a) => s + a.length / 2, 0);
const per = {};
for (const r of sorted) per[r.country] = (per[r.country] ?? 0) + 1;
const areas = sorted.map((r) => r.area).sort((a, b) => a - b);
console.log(`${units.length} unidades -> ${sorted.length} regiões em ${Object.keys(per).length} países; ${outArcs.length} arcos (${coastArcs} de costa), ${points} vértices`);
console.log(`área mediana ${Math.round(areas[areas.length >> 1])} km²; isoladas (sem vizinho terrestre): ${adjacency.filter((s) => !s.size).length}`);
console.log(`pontos de partida: ${startPoints.length} (${startPoints.filter((p) => p.kind === 'capital').length} capitais)`);
console.log('mais regiões:', Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 14).map((e) => e.join(':')).join(' '));
