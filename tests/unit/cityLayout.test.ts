import { describe, expect, it } from 'vitest';
import { COTTAGES, PLOTS, WALL_HALF } from '../../shared/cityLayout';

const overlap = (a: { dx: number; dy: number }, ha: number, b: { dx: number; dy: number }, hb: number) =>
  Math.abs(a.dx - b.dx) < ha + hb && Math.abs(a.dy - b.dy) < ha + hb;

describe('plano urbano da cidade', () => {
  for (const tier of [1, 2, 3] as const) {
    const plots = PLOTS.filter((p) => p.tier <= tier);
    const R = WALL_HALF[tier];

    it(`estágio ${tier}: lotes não se sobrepõem em nenhuma fase visual dos edifícios`, () => {
      for (const stage of [0, 1, 2] as const) {
        for (let i = 0; i < plots.length; i++) {
          for (let j = i + 1; j < plots.length; j++) {
            const a = plots[i];
            const b = plots[j];
            expect(overlap(a, a.size[stage] / 2, b, b.size[stage] / 2), `${a.id} × ${b.id}`).toBe(false);
          }
        }
      }
    });

    it(`estágio ${tier}: lotes e casas ficam dentro das muralhas`, () => {
      for (const p of plots) expect(Math.max(Math.abs(p.dx), Math.abs(p.dy)) + p.size[2] / 2, p.id).toBeLessThan(R - 0.8);
      for (const c of COTTAGES.filter((c) => c.tier <= tier)) expect(Math.max(Math.abs(c.dx), Math.abs(c.dy)) + 0.8).toBeLessThan(R - 0.8);
    });

    it(`estágio ${tier}: casas não invadem lotes`, () => {
      for (const c of COTTAGES.filter((c) => c.tier <= tier)) {
        for (const p of plots) expect(overlap(c, 0.8, p, p.size[2] / 2), `casa ${c.dx},${c.dy} × ${p.id}`).toBe(false);
      }
    });
  }
});
