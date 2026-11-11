// Geometria das regiões: decodifica a topologia gerada por tools/build-regions.mjs e monta os
// caminhos usados pelo motor. Vizinhos compartilham o mesmo arco, então fronteiras nunca se
// desencontram e cada linha é desenhada uma única vez.
import type { Projection } from './projection';
import type { RegionTopology } from './types';

export type Box = [number, number, number, number];

export interface RegionShape {
  id: string;
  country: string;
  name: string;
  at: [number, number];
  path: Path2D;
  box: Box;
  /** Índices dos arcos do contorno. */
  arcs: number[];
}

export interface CountryShape {
  id: string;
  path: Path2D;
  box: Box;
  /** Linhas por tipo, já sem duplicatas: costa, divisa entre países e divisa interna. */
  coast: Path2D;
  national: Path2D;
  internal: Path2D;
}

export interface TerritoryShape {
  id: string;
  color: string;
  fill: Path2D;
  frontier: Path2D;
  box: Box;
}

const grow = (box: Box, x: number, y: number) => {
  if (x < box[0]) box[0] = x;
  if (y < box[1]) box[1] = y;
  if (x > box[2]) box[2] = x;
  if (y > box[3]) box[3] = y;
};
const emptyBox = (): Box => [Infinity, Infinity, -Infinity, -Infinity];

export class RegionGeometry {
  /** Arcos projetados: x0, y0, x1, y1… em unidades de mundo. */
  readonly arcs: Float32Array[];
  readonly regions = new Map<string, RegionShape>();
  readonly regionList: RegionShape[] = [];
  readonly countries = new Map<string, CountryShape>();
  readonly countryList: CountryShape[] = [];
  readonly land = new Path2D();
  /** Regiões que usam cada arco (1 = costa, 2 = divisa). */
  private users: string[][];

  constructor(topo: RegionTopology, projection: Projection) {
    this.arcs = topo.arcs.map((flat) => {
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
    this.users = this.arcs.map(() => []);

    for (const r of topo.regions) {
      const path = new Path2D();
      const box = emptyBox();
      const arcs: number[] = [];
      for (const ring of r.r) {
        let first = true;
        for (const ref of ring) {
          const idx = ref < 0 ? ~ref : ref;
          arcs.push(idx);
          const pts = this.arcs[idx];
          const n = pts.length / 2;
          for (let k = 0; k < n; k++) {
            const i = (ref < 0 ? n - 1 - k : k) * 2;
            if (first) {
              path.moveTo(pts[i], pts[i + 1]);
              first = false;
            } else if (k > 0) path.lineTo(pts[i], pts[i + 1]);
            grow(box, pts[i], pts[i + 1]);
          }
        }
        path.closePath();
      }
      const shape: RegionShape = { id: r.id, country: r.c, name: r.n, at: r.at, path, box, arcs };
      this.regions.set(r.id, shape);
      this.regionList.push(shape);
      for (const idx of new Set(arcs)) this.users[idx].push(r.id);
      this.land.addPath(path);
    }

    for (const r of this.regionList) {
      let c = this.countries.get(r.country);
      if (!c) {
        c = { id: r.country, path: new Path2D(), box: emptyBox(), coast: new Path2D(), national: new Path2D(), internal: new Path2D() };
        this.countries.set(r.country, c);
        this.countryList.push(c);
      }
      c.path.addPath(r.path);
      grow(c.box, r.box[0], r.box[1]);
      grow(c.box, r.box[2], r.box[3]);
    }
    // Cada arco entra em um único país (o da primeira região que o usa): nada é traçado em dobro.
    this.arcs.forEach((pts, idx) => {
      const users = this.users[idx];
      if (!users.length) return;
      const a = this.regions.get(users[0])!;
      const b = users[1] ? this.regions.get(users[1])! : null;
      const c = this.countries.get(a.country)!;
      const target = !b ? c.coast : a.country !== b.country ? c.national : c.internal;
      this.trace(target, pts);
    });
  }

  private trace(path: Path2D, pts: Float32Array) {
    path.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
  }

  /** Preenchimento único e fronteira externa de um conjunto de regiões (o território de uma nação). */
  territory(id: string, color: string, regionIds: string[]): TerritoryShape {
    const fill = new Path2D();
    const frontier = new Path2D();
    const box = emptyBox();
    const count = new Map<number, number>();
    for (const rid of regionIds) {
      const r = this.regions.get(rid);
      if (!r) continue;
      fill.addPath(r.path);
      grow(box, r.box[0], r.box[1]);
      grow(box, r.box[2], r.box[3]);
      for (const idx of new Set(r.arcs)) count.set(idx, (count.get(idx) ?? 0) + 1);
    }
    for (const [idx, n] of count) if (n === 1) this.trace(frontier, this.arcs[idx]);
    return { id, color, fill, frontier, box };
  }

  /** Contorno de um grupo de regiões como caminho (prévia, alvos de expansão). */
  outline(regionIds: string[]): { fill: Path2D; box: Box } {
    const t = this.territory('', '', regionIds);
    return { fill: t.fill, box: t.box };
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
      if (!best || this.arcs[idx].length > best.length) best = this.arcs[idx];
    }
    if (!best) return null;
    const mid = Math.floor(best.length / 4) * 2;
    return [best[mid], best[mid + 1]];
  }
}
