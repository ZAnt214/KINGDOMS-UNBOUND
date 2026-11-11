// Geometria das regiões: decodifica a topologia gerada por tools/build-regions.mjs e monta os
// caminhos usados pelo motor, em vários níveis de detalhe. Vizinhos compartilham o mesmo arco,
// então fronteiras nunca se desencontram, e cada arco é simplificado uma vez por nível: as
// divisas continuam coincidindo em qualquer zoom.
import type { Projection } from './projection';
import type { RegionTopology } from './types';

export type Box = [number, number, number, number];

export interface RegionShape {
  id: string;
  country: string;
  name: string;
  at: [number, number];
  box: Box;
  /** Anéis como referências a arcos (negativo = invertido). */
  rings: number[][];
  /** Índices dos arcos do contorno, sem repetição. */
  arcs: number[];
}

export interface CountryShape {
  id: string;
  box: Box;
  coast: number[];
  national: number[];
  internal: number[];
}

/** Conjunto de regiões (território de uma nação, arena, prévia): preenchimento e fronteira externa. */
export class Group {
  readonly box: Box;
  private fills = new Map<number, Path2D>();
  private frontiers = new Map<number, Path2D>();
  constructor(
    private geo: RegionGeometry,
    readonly regions: string[],
    private frontierArcs: number[],
  ) {
    this.box = emptyBox();
    for (const id of regions) {
      const r = geo.regions.get(id);
      if (r) union(this.box, r.box);
    }
  }
  fill(level: number): Path2D {
    let p = this.fills.get(level);
    if (!p) {
      p = new Path2D();
      for (const id of this.regions) {
        const r = this.geo.regionPath(id, level);
        if (r) p.addPath(r);
      }
      this.fills.set(level, p);
    }
    return p;
  }
  frontier(level: number): Path2D {
    let p = this.frontiers.get(level);
    if (!p) {
      p = this.geo.linePath(this.frontierArcs, level);
      this.frontiers.set(level, p);
    }
    return p;
  }
}

const grow = (box: Box, x: number, y: number) => {
  if (x < box[0]) box[0] = x;
  if (y < box[1]) box[1] = y;
  if (x > box[2]) box[2] = x;
  if (y > box[3]) box[3] = y;
};
const union = (box: Box, b: Box) => {
  grow(box, b[0], b[1]);
  grow(box, b[2], b[3]);
};
const emptyBox = (): Box => [Infinity, Infinity, -Infinity, -Infinity];

/** Douglas–Peucker sobre um arco já projetado (pares x, y). Mantém as pontas. */
function simplify(pts: Float32Array, tol: number): Float32Array {
  const n = pts.length / 2;
  if (n <= 2 || tol <= 0) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  const t2 = tol * tol;
  while (stack.length) {
    const b = stack.pop()!;
    const a = stack.pop()!;
    const ax = pts[a * 2];
    const ay = pts[a * 2 + 1];
    const dx = pts[b * 2] - ax;
    const dy = pts[b * 2 + 1] - ay;
    const len = dx * dx + dy * dy;
    let worst = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i * 2] - ax;
      const py = pts[i * 2 + 1] - ay;
      const t = len ? Math.max(0, Math.min(1, (px * dx + py * dy) / len)) : 0;
      const d = (px - t * dx) ** 2 + (py - t * dy) ** 2;
      if (d > worst) [worst, idx] = [d, i];
    }
    if (idx >= 0 && worst > t2) {
      keep[idx] = 1;
      stack.push(a, idx, idx, b);
    }
  }
  let m = 0;
  for (let i = 0; i < n; i++) m += keep[i];
  // Anel fechado muito pequeno: preserva ao menos um triângulo para não sumir.
  if (m < 4 && pts[0] === pts[pts.length - 2] && pts[1] === pts[pts.length - 1] && n >= 4) {
    keep[Math.floor(n / 3)] = keep[Math.floor((2 * n) / 3)] = 1;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return Float32Array.from(out);
}

/**
 * Tolerâncias de simplificação (unidades do mundo) de cada nível; o último é o detalhe completo.
 * O motor escolhe o nível mais grosso cujo erro fica abaixo de ~0,7 px no zoom atual.
 */
export const LOD_TOLERANCE = [1.4, 0.45, 0.14, 0];

export class RegionGeometry {
  readonly regions = new Map<string, RegionShape>();
  readonly regionList: RegionShape[] = [];
  readonly countries = new Map<string, CountryShape>();
  readonly countryList: CountryShape[] = [];
  /** Arcos projetados em detalhe completo. */
  private full: Float32Array[];
  private arcBox: Box[];
  private levels: Float32Array[][] = [];
  private regionPaths = new Map<string, Path2D>();
  private countryPaths = new Map<string, { coast: Path2D; national: Path2D; internal: Path2D }>();
  private lands = new Map<number, Path2D>();
  private coasts = new Map<number, Path2D>();
  private users: string[][];

  constructor(topo: RegionTopology, projection: Projection) {
    this.full = topo.arcs.map((flat) => {
      const out = new Float32Array(flat.length);
      let lon = 0;
      let lat = 0;
      for (let i = 0; i < flat.length; i += 2) {
        lon += flat[i];
        lat += flat[i + 1];
        const [x, y] = projection.project(lon / topo.q, lat / topo.q);
        out[i] = x;
        out[i + 1] = y;
      }
      return out;
    });
    this.arcBox = this.full.map((pts) => {
      const b = emptyBox();
      for (let i = 0; i < pts.length; i += 2) grow(b, pts[i], pts[i + 1]);
      return b;
    });
    this.users = this.full.map(() => []);
    for (const r of topo.regions) {
      const box = emptyBox();
      const arcs = new Set<number>();
      for (const ring of r.r) for (const ref of ring) arcs.add(ref < 0 ? ~ref : ref);
      for (const a of arcs) union(box, this.arcBox[a]);
      const shape: RegionShape = { id: r.id, country: r.c, name: r.n, at: r.at, box, rings: r.r, arcs: [...arcs] };
      this.regions.set(r.id, shape);
      this.regionList.push(shape);
      for (const a of arcs) this.users[a].push(r.id);
    }
    for (const r of this.regionList) {
      let c = this.countries.get(r.country);
      if (!c) {
        c = { id: r.country, box: emptyBox(), coast: [], national: [], internal: [] };
        this.countries.set(r.country, c);
        this.countryList.push(c);
      }
      union(c.box, r.box);
    }
    // Cada arco entra em um único país (o da primeira região que o usa): nada é traçado em dobro.
    this.full.forEach((_, idx) => {
      const users = this.users[idx];
      if (!users.length) return;
      const a = this.regions.get(users[0])!;
      const b = users[1] ? this.regions.get(users[1])! : null;
      const c = this.countries.get(a.country)!;
      (!b ? c.coast : a.country !== b.country ? c.national : c.internal).push(idx);
    });
  }

  /** Nível de detalhe para uma escala (px por unidade do mundo). */
  levelFor(k: number): number {
    for (let i = 0; i < LOD_TOLERANCE.length - 1; i++) if (LOD_TOLERANCE[i] * k <= 0.7) return i;
    return LOD_TOLERANCE.length - 1;
  }
  get maxLevel() {
    return LOD_TOLERANCE.length - 1;
  }

  private arcs(level: number): Float32Array[] {
    if (level >= this.maxLevel) return this.full;
    let a = this.levels[level];
    if (!a) {
      a = this.full.map((pts) => simplify(pts, LOD_TOLERANCE[level]));
      this.levels[level] = a;
    }
    return a;
  }

  regionPath(id: string, level: number): Path2D | null {
    const key = `${level}:${id}`;
    let p = this.regionPaths.get(key);
    if (p) return p;
    const r = this.regions.get(id);
    if (!r) return null;
    const arcs = this.arcs(level);
    p = new Path2D();
    for (const ring of r.rings) {
      let first = true;
      for (const ref of ring) {
        const pts = arcs[ref < 0 ? ~ref : ref];
        const n = pts.length / 2;
        for (let k = 0; k < n; k++) {
          const i = (ref < 0 ? n - 1 - k : k) * 2;
          if (first) {
            p.moveTo(pts[i], pts[i + 1]);
            first = false;
          } else if (k > 0) p.lineTo(pts[i], pts[i + 1]);
        }
      }
      p.closePath();
    }
    this.regionPaths.set(key, p);
    return p;
  }

  /** Linhas abertas de um conjunto de arcos. */
  linePath(arcIds: number[], level: number): Path2D {
    const arcs = this.arcs(level);
    const p = new Path2D();
    for (const idx of arcIds) {
      const pts = arcs[idx];
      p.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    }
    return p;
  }

  countryLines(code: string, level: number) {
    const key = `${level}:${code}`;
    let l = this.countryPaths.get(key);
    if (!l) {
      const c = this.countries.get(code)!;
      l = { coast: this.linePath(c.coast, level), national: this.linePath(c.national, level), internal: this.linePath(c.internal, level) };
      this.countryPaths.set(key, l);
    }
    return l;
  }

  land(level: number): Path2D {
    let p = this.lands.get(level);
    if (!p) {
      p = new Path2D();
      for (const r of this.regionList) p.addPath(this.regionPath(r.id, level)!);
      this.lands.set(level, p);
    }
    return p;
  }

  /** Todo o litoral do mundo num caminho só (halo costeiro). */
  coast(level: number): Path2D {
    let p = this.coasts.get(level);
    if (!p) {
      p = this.linePath(
        this.countryList.flatMap((c) => c.coast),
        level,
      );
      this.coasts.set(level, p);
    }
    return p;
  }

  group(regionIds: string[]): Group {
    const count = new Map<number, number>();
    for (const rid of regionIds) {
      const r = this.regions.get(rid);
      if (!r) continue;
      for (const idx of r.arcs) count.set(idx, (count.get(idx) ?? 0) + 1);
    }
    const frontier: number[] = [];
    for (const [idx, n] of count) if (n === 1) frontier.push(idx);
    return new Group(this, regionIds, frontier);
  }

  /** Ponto do mundo no meio da maior divisa entre duas regiões, ou null se não são vizinhas. */
  borderPoint(a: string, b: string): [number, number] | null {
    const ra = this.regions.get(a);
    const rb = this.regions.get(b);
    if (!ra || !rb) return null;
    const mine = new Set(ra.arcs);
    let best: Float32Array | null = null;
    for (const idx of rb.arcs) {
      if (!mine.has(idx)) continue;
      if (!best || this.full[idx].length > best.length) best = this.full[idx];
    }
    if (!best) return null;
    const mid = Math.floor(best.length / 4) * 2;
    return [best[mid], best[mid + 1]];
  }
}
