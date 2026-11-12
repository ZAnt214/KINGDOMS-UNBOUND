// Geometria das regiões no servidor, em longitude/latitude, para validar onde uma construção
// pode ficar. Lê a mesma topologia que o cliente desenha (client/public/world/regions.topo.json).
import topo from '../../client/public/world/regions.topo.json';
import { distanceKm, REGION_BY_ID } from '../../shared/world/regions.js';

interface Topo {
  q: number;
  arcs: number[][];
  regions: { id: string; r: number[][] }[];
}
type Ring = Float64Array;

const T = topo as unknown as Topo;
let arcs: Float64Array[] | null = null;
const rings = new Map<string, { rings: Ring[]; box: [number, number, number, number] }>();

function decodedArcs(): Float64Array[] {
  if (!arcs) {
    arcs = T.arcs.map((flat) => {
      const out = new Float64Array(flat.length);
      let x = 0;
      let y = 0;
      for (let i = 0; i < flat.length; i += 2) {
        x += flat[i];
        y += flat[i + 1];
        out[i] = x / T.q;
        out[i + 1] = y / T.q;
      }
      return out;
    });
  }
  return arcs;
}

const byId = new Map(T.regions.map((r) => [r.id, r]));

function shape(regionId: string) {
  let s = rings.get(regionId);
  if (s) return s;
  const r = byId.get(regionId);
  if (!r) return null;
  const a = decodedArcs();
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const out: Ring[] = r.r.map((ring) => {
    const pts: number[] = [];
    for (const ref of ring) {
      const arc = a[ref < 0 ? ~ref : ref];
      const n = arc.length / 2;
      for (let k = pts.length ? 1 : 0; k < n; k++) {
        const i = (ref < 0 ? n - 1 - k : k) * 2;
        pts.push(arc[i], arc[i + 1]);
        if (arc[i] < box[0]) box[0] = arc[i];
        if (arc[i + 1] < box[1]) box[1] = arc[i + 1];
        if (arc[i] > box[2]) box[2] = arc[i];
        if (arc[i + 1] > box[3]) box[3] = arc[i + 1];
      }
    }
    return Float64Array.from(pts);
  });
  s = { rings: out, box };
  rings.set(regionId, s);
  return s;
}

/** O ponto está dentro da região (regra par-ímpar sobre todos os anéis)? */
export function regionContains(regionId: string, lon: number, lat: number): boolean {
  const s = shape(regionId);
  if (!s || lon < s.box[0] || lon > s.box[2] || lat < s.box[1] || lat > s.box[3]) return false;
  let inside = false;
  for (const ring of s.rings) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i * 2];
      const yi = ring[i * 2 + 1];
      const xj = ring[j * 2];
      const yj = ring[j * 2 + 1];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Região que contém o ponto, procurando primeiro entre as sugeridas. */
export function regionAt(lon: number, lat: number, hints: string[] = []): string | null {
  for (const id of hints) if (regionContains(id, lon, lat)) return id;
  for (const r of T.regions) if (regionContains(r.id, lon, lat)) return r.id;
  return null;
}

/**
 * Um ponto livre dentro da região, perto do ponto de rótulo, a pelo menos `minKm` de `avoid`.
 * Usado pelos bots, que não tocam na tela.
 */
export function freePointIn(regionId: string, avoid: [number, number][], minKm: number): [number, number] | null {
  const r = REGION_BY_ID[regionId];
  if (!r) return null;
  const [cx, cy] = r.at;
  for (let ring = 0; ring < 14; ring++) {
    const steps = ring === 0 ? 1 : 8 * ring;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const d = ring * 0.35;
      const p: [number, number] = [cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8];
      if (!regionContains(regionId, p[0], p[1])) continue;
      if (avoid.every((q) => distanceKm(q, p) >= minKm)) return p;
    }
  }
  return null;
}
