#!/usr/bin/env node
/**
 * Gera os dados geográficos do mapa mundial a partir do Natural Earth (domínio público).
 *
 *   node tools/build-world-data.mjs <dir-geojson-natural-earth> [<dir-flag-icons>/flags/4x3]
 *
 * Entradas esperadas no diretório: ne_50m_admin_0_countries.geojson e
 * ne_50m_populated_places.geojson (github.com/nvkelso/natural-earth-vector).
 * Bandeiras: github.com/lipis/flag-icons (MIT).
 *
 * Saídas (separadas de propósito):
 *   client/public/world/countries.geo.json  geometria simplificada (só forma)
 *   client/public/world/cities.json         cidades para os níveis de zoom regionais
 *   shared/world/countries.json             dados estáticos dos países (cliente + servidor)
 *   client/public/flags/<iso2>.svg          bandeiras
 */
import fs from 'node:fs';
import path from 'node:path';

const [src, flagsDir] = process.argv.slice(2);
if (!src) throw new Error('uso: node tools/build-world-data.mjs <dir-natural-earth> [dir-bandeiras]');
const root = path.resolve(import.meta.dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(src, f), 'utf8'));

const Q = 100; // 0,01 grau
const TOLERANCE = 0.035; // graus (Douglas–Peucker)
const MIN_AREA = 0.02; // graus²; ilhas menores somem, exceto se forem o país inteiro

const CONTINENT = {
  'North America': 'América do Norte',
  'South America': 'América do Sul',
  Europe: 'Europa',
  Africa: 'África',
  Asia: 'Ásia',
  Oceania: 'Oceania',
  Antarctica: 'Antártida',
  'Seven seas (open ocean)': 'Ilhas oceânicas',
};

// O Natural Earth traz os nomes em português europeu; o jogo usa as formas do Brasil.
const PT_BR = {
  Benim: 'Benin', Chéquia: 'Tchéquia', 'República da Irlanda': 'Irlanda', Irão: 'Irã', Mónaco: 'Mônaco', Madagáscar: 'Madagascar',
  Maurícia: 'Maurício', Vietname: 'Vietnã', Iémen: 'Iêmen', Moscovo: 'Moscou', Teerão: 'Teerã', Bagdade: 'Bagdá', Amesterdão: 'Amsterdã',
  Banguecoque: 'Bangkok', Copenhaga: 'Copenhague', Helsínquia: 'Helsinque', Tunes: 'Túnis', 'Nova Deli': 'Nova Délhi', Lusaca: 'Lusaka',
  Tiblíssi: 'Tbilisi', Jamena: "N'Djamena", Brazavile: 'Brazzaville', Tasquente: 'Tashkent', Bisqueque: 'Bishkek', Duchambe: 'Duchambé',
  Erevan: 'Ierevan', Sana: 'Sanaa', 'Nur-Sultã': 'Astana', Vienciana: 'Vientiane', Melequeoque: 'Ngerulmud', Mebabane: 'Mbabane',
  'Nova Iorque': 'Nova York', Bombaim: 'Mumbai', Calcutá: 'Calcutá', Zurique: 'Zurique',
};
const ptBR = (name) => (PT_BR[name] ?? name).replace(/ónia\b/g, 'ônia').replace(/énia\b/g, 'ênia').replace(/ónio\b/g, 'ônio');

function simplify(ring, tol) {
  const n = ring.length;
  if (n < 6) return ring;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    let worst = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
      const d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      if (d > worst) {
        worst = d;
        idx = i;
      }
    }
    if (idx >= 0 && worst > tol * tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}

const area = (ring) => {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(s / 2);
};

function encode(ring) {
  const out = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of ring) {
    const qx = Math.round(x * Q);
    const qy = Math.round(y * Q);
    if (out.length && qx === px && qy === py) continue;
    out.push(qx - px, qy - py);
    px = qx;
    py = qy;
  }
  return out;
}

const admin = read('ne_50m_admin_0_countries.geojson');
const places = read('ne_50m_populated_places.geojson');

const capitals = new Map();
for (const f of places.features) {
  const p = f.properties;
  if (p.ADM0CAP !== 1) continue;
  const cur = capitals.get(p.ADM0_A3);
  if (!cur || p.POP_MAX > cur.POP_MAX) capitals.set(p.ADM0_A3, p);
  // Alguns territórios usam códigos diferentes entre os dois arquivos; o ISO-2 serve de reserva.
  if (p.ISO_A2 && !capitals.has(`iso:${p.ISO_A2}`)) capitals.set(`iso:${p.ISO_A2}`, p);
}

const geo = [];
const meta = [];
const seen = new Set();
let points = 0;
for (const f of admin.features) {
  const p = f.properties;
  const code = p.ADM0_A3;
  if (seen.has(code)) throw new Error(`código duplicado: ${code}`);
  seen.add(code);
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const sized = polys.map((rings) => ({ rings, a: area(rings[0]) })).sort((x, y) => y.a - x.a);
  const kept = sized.filter((s, i) => i === 0 || s.a >= MIN_AREA);
  const encoded = kept.map((s) =>
    s.rings
      .filter((r, i) => i === 0 || area(r) >= MIN_AREA)
      .map((r) => encode(simplify(r, TOLERANCE)))
      .filter((r) => r.length >= 8),
  ).filter((rings) => rings.length);
  for (const rings of encoded) for (const r of rings) points += r.length / 2;
  geo.push({ id: code, p: encoded });

  const iso2 = /^[A-Z]{2}$/.test(p.ISO_A2_EH) ? p.ISO_A2_EH.toLowerCase() : null;
  const cap = capitals.get(code) ?? (iso2 ? capitals.get(`iso:${iso2.toUpperCase()}`) : undefined);
  meta.push({
    code,
    iso2,
    name: ptBR(p.NAME_PT || p.NAME_LONG),
    continent: CONTINENT[p.CONTINENT] ?? p.CONTINENT,
    sovereign: p.TYPE === 'Sovereign country' || p.TYPE === 'Country',
    population: Math.round(p.POP_EST),
    capital: cap ? ptBR(cap.NAME_PT || cap.NAME) : null,
    capitalAt: cap ? [+cap.LONGITUDE.toFixed(3), +cap.LATITUDE.toFixed(3)] : null,
    labelAt: [+p.LABEL_X.toFixed(2), +p.LABEL_Y.toFixed(2)],
    labelRank: p.LABELRANK,
  });
}
meta.sort((a, b) => a.code.localeCompare(b.code));
geo.sort((a, b) => a.id.localeCompare(b.id));

const cities = places.features
  .map((f) => f.properties)
  .map((p) => ({ n: ptBR(p.NAME_PT || p.NAME), c: p.ADM0_A3, x: +p.LONGITUDE.toFixed(3), y: +p.LATITUDE.toFixed(3), p: p.POP_MAX, k: p.ADM0CAP === 1 ? 1 : 0, r: p.SCALERANK }))
  .sort((a, b) => a.r - b.r || b.p - a.p);

const write = (rel, data) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  console.log(rel, `${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
};
write('client/public/world/countries.geo.json', { v: 1, source: 'Natural Earth 1:50m', q: Q, countries: geo });
write('client/public/world/cities.json', { v: 1, source: 'Natural Earth 1:50m populated places', cities });
write('shared/world/countries.json', meta);
console.log(`${geo.length} países, ${points} vértices, ${cities.length} cidades`);

if (flagsDir) {
  const out = path.join(root, 'client/public/flags');
  fs.mkdirSync(out, { recursive: true });
  let n = 0;
  const missing = [];
  for (const m of meta) {
    if (!m.iso2) continue;
    const from = path.join(flagsDir, `${m.iso2}.svg`);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(out, `${m.iso2}.svg`));
      n++;
    } else missing.push(m.code);
  }
  console.log(`${n} bandeiras copiadas; sem bandeira: ${missing.join(', ') || 'nenhuma'}`);
}
