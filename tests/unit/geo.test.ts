import { describe, expect, it } from 'vitest';
import { freePointIn, regionAt, regionContains } from '../../server/src/geo.js';
import { distanceKm, START_POINT_BY_ID } from '../../shared/world/regions.js';

describe('geometria do servidor', () => {
  it('ponto de partida cai na própria região; oceano não cai em nenhuma', () => {
    for (const id of ['cap-bra-brasilia', 'cap-fra-paris', 'city-usa-chicago', 'cap-jpn-tokyo']) {
      const p = START_POINT_BY_ID[id];
      if (!p) continue;
      expect(regionContains(p.region, p.at[0], p.at[1]), id).toBe(true);
      expect(regionAt(p.at[0], p.at[1])).toBe(p.region);
    }
    expect(regionAt(-30, -20)).toBeNull();
    expect(regionAt(-150, 0)).toBeNull();
  });

  it('ponto livre fica na região e longe dos outros', () => {
    const p = START_POINT_BY_ID['cap-bra-brasilia'];
    const a = freePointIn(p.region, [p.at], 60)!;
    expect(regionContains(p.region, a[0], a[1])).toBe(true);
    expect(distanceKm(a, p.at)).toBeGreaterThanOrEqual(60);
  });
});
