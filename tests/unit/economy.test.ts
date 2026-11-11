import { describe, expect, it } from 'vitest';
import {
  buildProblem,
  computeEconomy,
  ECONOMY,
  expansionCost,
  missing,
  project,
  regionDeposit,
  RESOURCES,
  slotsFor,
  STRUCTURE_TYPES,
  STRUCTURES,
  structureCost,
  structureSeconds,
  zero,
} from '../../shared/play/economy.js';
import { arenaStartPoints, botIdentities, buildArena, matchOutcome, pickBotPoints, QUICK, rank, THEATERS } from '../../shared/play/match.js';
import { REGION_BY_ID, REGIONS } from '../../shared/world/regions.js';

const capital = 'BRA-1294';

describe('economia: fórmulas', () => {
  it('território produz e a capital fornece energia', () => {
    const e = computeEconomy({ regions: [capital], capitalRegion: capital, structures: [] });
    expect(e.rates.money).toBe(ECONOMY.territory.capital.money! + (regionDeposit(capital) === null ? 0 : 0));
    expect(e.energy).toEqual({ supply: ECONOMY.territory.capitalEnergy, demand: 0 });
    expect(e.capacity).toBe(ECONOMY.baseCapacity);
    expect(e.efficiency).toBe(1);
  });

  it('construções produzem com retorno decrescente por nível', () => {
    const at = (level: number) => computeEconomy({ regions: [capital], capitalRegion: capital, structures: [{ type: 'city', level, region: capital }] }).rates.money;
    const base = at(0);
    const l1 = at(1) - base;
    const l5 = at(5) - base;
    expect(l1).toBeCloseTo(STRUCTURES.city.produces.money!, 5);
    expect(l5).toBeLessThan(l1 * 5);
    expect(l5).toBeGreaterThan(l1 * 4);
  });

  it('falta de energia reduz a produção das construções na mesma proporção', () => {
    const structures = [
      { type: 'factory' as const, level: 3, region: capital },
      { type: 'city' as const, level: 2, region: capital },
    ];
    const e = computeEconomy({ regions: [capital], capitalRegion: capital, structures });
    expect(e.energy.demand).toBe(8);
    expect(e.efficiency).toBeCloseTo(6 / 8, 5);
    const powered = computeEconomy({ regions: [capital], capitalRegion: capital, structures: [...structures, { type: 'power', level: 1, region: capital }] });
    expect(powered.efficiency).toBe(1);
    expect(powered.rates.metal).toBeGreaterThan(e.rates.metal);
  });

  it('bônus tecnológico tem teto e a partida rápida produz mais', () => {
    const e = computeEconomy({ regions: [capital], capitalRegion: capital, structures: [{ type: 'tech', level: 5, region: capital }, { type: 'power', level: 5, region: capital }] });
    expect(e.efficiency).toBeCloseTo(1 + ECONOMY.maxEfficiencyBonus, 5);
    const quick = computeEconomy({ regions: [capital], capitalRegion: capital, structures: [] }, 'quick');
    expect(quick.rates.money).toBeGreaterThan(computeEconomy({ regions: [capital], capitalRegion: capital, structures: [] }).rates.money);
  });

  it('jazida certa rende mais', () => {
    const oil = REGIONS.find((r) => regionDeposit(r.id) === 'oil')!.id;
    const dry = REGIONS.find((r) => regionDeposit(r.id) === null)!.id;
    const refinery = (region: string) => computeEconomy({ regions: [region], capitalRegion: null, structures: [{ type: 'refinery', level: 1, region }] });
    // Sem capital não há energia: compara a parte das construções com eficiência igual (zero).
    const withPower = (region: string) =>
      computeEconomy({ regions: [region], capitalRegion: region, structures: [{ type: 'refinery', level: 1, region }] }).rates.oil -
      computeEconomy({ regions: [region], capitalRegion: region, structures: [] }).rates.oil;
    expect(withPower(oil)).toBeCloseTo(withPower(dry) * (1 + ECONOMY.depositBonus), 5);
    expect(refinery(dry).efficiency).toBe(0);
  });

  it('jazidas: determinísticas e nas proporções previstas', () => {
    expect(regionDeposit(capital)).toBe(regionDeposit(capital));
    const n = { oil: 0, metal: 0, special: 0 };
    for (const r of REGIONS) {
      const d = regionDeposit(r.id);
      if (d) n[d]++;
    }
    expect(n.oil / REGIONS.length).toBeGreaterThan(0.12);
    expect(n.oil / REGIONS.length).toBeLessThan(0.24);
    expect(n.special / REGIONS.length).toBeGreaterThan(0.03);
    expect(n.special / REGIONS.length).toBeLessThan(0.11);
  });

  it('custos e tempos progressivos, componentes nos níveis altos', () => {
    for (const t of STRUCTURE_TYPES) {
      for (let l = 0; l < ECONOMY.maxLevel - 1; l++) {
        expect(structureCost(t, l + 1).money!).toBeGreaterThan(structureCost(t, l).money!);
        expect(structureSeconds(t, l + 1)).toBeGreaterThan(structureSeconds(t, l));
      }
      expect(structureSeconds(t, 0)).toBeGreaterThanOrEqual(15);
      expect(structureSeconds(t, 0, 'quick')).toBeLessThan(structureSeconds(t, 0));
    }
    expect(structureCost('city', 0, 2).money).toBe(Math.round(STRUCTURES.city.cost.money! * 1.6));
    expect(structureCost('city', 2).tech).toBeUndefined();
    expect(structureCost('city', 3).tech).toBe(ECONOMY.techForLevel[4]);
    expect(structureCost('tech', 1).special).toBeGreaterThan(0);
    expect(expansionCost(11).money).toBe(600);
  });

  it('projeção do saldo respeita a capacidade', () => {
    const amounts = { ...zero(), money: 100, materials: 9000 };
    const rates = { ...zero(), money: 3600, materials: 3600 };
    const p = project(amounts, 0, rates, 8000, 3_600_000);
    expect(p.money).toBe(3700);
    expect(p.materials).toBe(9000);
    expect(project(amounts, 0, rates, 1000, 3_600_000).money).toBe(1000);
    expect(missing({ ...zero(), money: 50 }, { money: 80, oil: 1 })).toEqual({ money: 30, oil: 1 });
    expect(RESOURCES).toHaveLength(6);
  });

  it('regras de construção', () => {
    const coast = REGIONS.find((r) => r.coast)!.id;
    const ctx = { region: capital, coast: false, capitalRegion: capital, inRegion: 0, queue: 0 };
    expect(buildProblem('city', ctx)).toBeNull();
    expect(buildProblem('port', ctx)).toMatch(/litoral/);
    expect(buildProblem('port', { ...ctx, region: coast, coast: true })).toBeNull();
    // Goiás tem ~348 mil km²: 4 espaços, +2 por ser a capital.
    expect(slotsFor(capital, capital)).toBe(6);
    expect(slotsFor(capital, null)).toBe(4);
    expect(buildProblem('depot', { ...ctx, inRegion: 6 })).toMatch(/espaços/);
    expect(buildProblem('depot', { ...ctx, capitalRegion: null, inRegion: 4 })).toMatch(/espaços/);
    const tiny = REGIONS.reduce((a, r) => (r.area < a.area ? r : a));
    expect(slotsFor(tiny.id, null)).toBe(ECONOMY.slotsMin);
    expect(buildProblem('city', { ...ctx, queue: ECONOMY.buildQueue })).toMatch(/obras/);
  });
});

describe('partida rápida: regras', () => {
  it('cada teatro gera uma arena conectada com pontos suficientes', () => {
    for (const t of THEATERS) {
      const arena = buildArena(t.id);
      expect(arena, t.id).toHaveLength(QUICK.arenaSize);
      expect(buildArena(t.id)).toEqual(arena);
      expect(arenaStartPoints(arena).length, t.id).toBeGreaterThanOrEqual(QUICK.bots + 3);
      const set = new Set(arena);
      const seen = new Set([arena[0]]);
      const stack = [arena[0]];
      while (stack.length) for (const n of REGION_BY_ID[stack.pop()!].neighbors) if (set.has(n) && !seen.has(n)) (seen.add(n), stack.push(n));
      expect(seen.size, `${t.id} conectada`).toBe(arena.length);
      const bots = pickBotPoints(arena, QUICK.bots, 7);
      expect(new Set(bots.map((b) => b.region)).size).toBe(QUICK.bots);
    }
  });

  it('bots têm identidades distintas', () => {
    const ids = botIdentities(3, 11, '#e5484d');
    expect(new Set(ids.map((i) => i.name)).size).toBe(3);
    expect(new Set(ids.map((i) => i.color)).size).toBe(3);
    expect(ids.some((i) => i.color === '#e5484d')).toBe(false);
  });

  it('vitória por maioria, por tempo ou por esgotamento', () => {
    const s = [
      { nationId: 1, regions: 10, area: 5 },
      { nationId: 2, regions: 21, area: 1 },
    ];
    expect(matchOutcome({ arenaSize: 40, standings: s, now: 0, endsAt: 100, neutralLeft: 9, activeOccupations: 0 })).toMatchObject({ over: true, reason: 'majority' });
    const even = [
      { nationId: 1, regions: 10, area: 5 },
      { nationId: 2, regions: 10, area: 9 },
    ];
    expect(matchOutcome({ arenaSize: 40, standings: even, now: 50, endsAt: 100, neutralLeft: 20, activeOccupations: 1 })).toEqual({ over: false });
    const t = matchOutcome({ arenaSize: 40, standings: even, now: 100, endsAt: 100, neutralLeft: 20, activeOccupations: 1 });
    expect(t.over && t.ranking[0].nationId).toBe(2);
    expect(matchOutcome({ arenaSize: 40, standings: even, now: 50, endsAt: 100, neutralLeft: 0, activeOccupations: 0 })).toMatchObject({ reason: 'exhausted' });
    expect(matchOutcome({ arenaSize: 40, standings: even, now: 50, endsAt: null, neutralLeft: 0, activeOccupations: 0 })).toEqual({ over: false });
    expect(rank([{ nationId: 5, regions: 3, area: 1 }, { nationId: 4, regions: 3, area: 1 }])[0].nationId).toBe(4);
  });
});
