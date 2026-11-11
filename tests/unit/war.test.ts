import { describe, expect, it } from 'vitest';
import {
  attackOrigin,
  attackPower,
  battleSeconds,
  type BattleSetup,
  defenseMultiplier,
  engagedIn,
  estimate,
  estimatedDefense,
  garrison,
  interceptChance,
  interceptRoll,
  missileRange,
  missileSeconds,
  predictEnd,
  risk,
  share,
  simulate,
  survivors,
  WAR,
} from '../../shared/play/war.js';
import { REGION_BY_ID } from '../../shared/world/regions.js';

const GO = 'BRA-1294';
const MG = 'BRA-601';
const setup = (attacker: object, defender: object, extra: Partial<BattleSetup> = {}): BattleSetup => ({
  startedAt: 0,
  base: 60,
  naval: false,
  attacker,
  attackerResearch: {},
  defender,
  defenderResearch: {},
  defenderMultiplier: 1,
  events: [],
  ...extra,
});
const finish = (s: BattleSetup) => simulate(s, predictEnd(s) + 1000);

describe('seleção de tropas', () => {
  it('envia a mesma porcentagem de cada tipo; navios só por mar; mísseis nunca', () => {
    const army = { infantry: 101, armor: 10, navy: 4, missile: 3 };
    expect(share(army, 25)).toEqual({ infantry: 25, armor: 2 });
    expect(share(army, 100, true)).toEqual({ infantry: 101, armor: 10, navy: 4 });
    expect(WAR.percents[0]).toBe(25);
  });

  it('guarnição automática: 1/√(regiões) das tropas em casa, sem navios', () => {
    expect(garrison({ infantry: 100, navy: 5 }, 4)).toEqual({ infantry: 50 });
    expect(garrison({ infantry: 100 }, 1)).toEqual({ infantry: 100 });
  });
});

describe('combate', () => {
  it('sem resistência, ocupa sem perdas significativas', () => {
    const s = finish(setup({ infantry: 100 }, {}));
    expect(s.status).toBe('won');
    expect(survivors(s.attacker).infantry!).toBeGreaterThanOrEqual(97);
  });

  it('com resistência, os dois lados sofrem baixas e o mais forte vence', () => {
    const s = finish(setup({ infantry: 100 }, { infantry: 50 }));
    expect(s.status).toBe('won');
    expect(survivors(s.attacker).infantry!).toBeLessThan(90);
    expect(survivors(s.defender).infantry ?? 0).toBeLessThan(30);
  });

  it('forças iguais: o defensor (defesa maior) resiste e o ataque fracassa no tempo-limite', () => {
    const st = setup({ infantry: 100 }, { infantry: 100 });
    const s = finish(st);
    expect(s.status).toBe('failed');
    expect(s.endedAt).toBeLessThanOrEqual(st.base * WAR.maxFactor * 1000);
  });

  it('é determinístico e progressivo: a ocupação cresce com o tempo', () => {
    const st = setup({ infantry: 100 }, { infantry: 30 });
    const a = simulate(st, 20_000);
    const b = simulate(st, 40_000);
    expect(b.progress).toBeGreaterThan(a.progress);
    expect(simulate(st, 40_000)).toEqual(b);
    expect(a.rate).toBeGreaterThan(0);
  });

  it('reforço do defensor e míssil mudam o rumo da batalha', () => {
    const base = setup({ infantry: 100 }, { infantry: 30 });
    expect(finish(base).status).toBe('won');
    const reinforced = { ...base, events: [{ at: 5_000, kind: 'reinforce' as const, army: { defense: 30 } }] };
    expect(finish(reinforced).status).toBe('failed');
    const struck = { ...reinforced, events: [...reinforced.events, { at: 6_000, kind: 'strike' as const, side: 'defender' as const, fraction: 0.9 }] };
    expect(finish(struck).status).toBe('won');
  });

  it('pesquisa e fortificação entram no cálculo', () => {
    expect(attackPower({ infantry: 10 }, { doctrine: 2 })).toBeCloseTo(12, 6);
    expect(attackPower({ navy: 2 }, {})).toBe(0);
    expect(attackPower({ navy: 2 }, {}, true)).toBe(64);
    expect(defenseMultiplier({ fortification: 1 }, [{ type: 'defense_center', level: 2 }])).toBeCloseTo(1.28, 6);
  });

  it('tempo-base pela área, mais curto na partida rápida', () => {
    expect(battleSeconds(GO)).toBe(Math.round(WAR.baseMin + REGION_BY_ID[GO].area / WAR.baseAreaPerSecond));
    expect(battleSeconds(GO, 'quick')).toBeLessThan(battleSeconds(GO));
  });

  it('tropas engajadas: enviadas pelo atacante; guarnição e reforços pelo defensor', () => {
    const op = { attackerId: 1, defenderId: 2, setup: { attacker: { infantry: 10 }, defender: { infantry: 5 } }, events: [{ at: 1, kind: 'reinforce' as const, army: { infantry: 3 } }] };
    expect(engagedIn(op, 1)).toEqual({ infantry: 10 });
    expect(engagedIn(op, 2)).toEqual({ infantry: 8 });
    expect(engagedIn(op, 3)).toEqual({});
  });
});

describe('alcance do ataque', () => {
  it('por terra pela fronteira; por mar só com navios e litoral perto', () => {
    expect(attackOrigin([GO], MG, false)).toEqual({ from: GO, naval: false });
    // Ilha sem vizinhos: só por mar.
    const island = Object.values(REGION_BY_ID).find((r) => r.coast && r.neighbors.length === 0)!;
    const shore = Object.values(REGION_BY_ID).find((r) => r.coast && r.id !== island.id && Math.hypot(r.at[0] - island.at[0], r.at[1] - island.at[1]) < 4)!;
    expect(attackOrigin([shore.id], island.id, false)).toBeNull();
    const naval = attackOrigin([shore.id], island.id, true);
    expect(naval === null || naval.naval).toBe(true);
  });
});

describe('inteligência e risco', () => {
  it('estimativas arredondadas e risco pela razão', () => {
    expect(estimate(1234)).toBe(1200);
    expect(estimate(7)).toBe(7);
    expect(estimatedDefense(400, 4)).toBe(200);
    expect(risk(100, 10)).toBe('baixo');
    expect(risk(30, 15)).toBe('médio');
    expect(risk(10, 15)).toBe('alto');
  });
});

describe('mísseis', () => {
  it('alcance cresce com o nível do silo e a pesquisa; voo tem duração mínima', () => {
    expect(missileRange(1, { rocketry: 1 })).toBe(WAR.missile.rangeKm);
    expect(missileRange(2, { rocketry: 1 })).toBe(WAR.missile.rangeKm + WAR.missile.rangePerLevel);
    expect(missileRange(1, { rocketry: 2 })).toBe(Math.round(WAR.missile.rangeKm * 1.2));
    expect(missileSeconds(1500)).toBe(60);
    expect(missileSeconds(10)).toBe(WAR.missile.minSeconds);
  });

  it('sem antimísseis não há interceptação; com, 20% por nível + pesquisa, com teto', () => {
    expect(interceptChance([], { interception: 3 })).toBe(0);
    expect(interceptChance([{ type: 'antimissile', level: 2 }], { interception: 1 })).toBeCloseTo(0.5, 6);
    expect(interceptChance([{ type: 'antimissile', level: 5 }], { interception: 3 })).toBe(WAR.missile.maxChance);
  });

  it('o sorteio é reproduzível pelo id e bem distribuído', () => {
    expect(interceptRoll(42)).toBe(interceptRoll(42));
    const rolls = Array.from({ length: 2000 }, (_, i) => interceptRoll(i + 1));
    const below = rolls.filter((r) => r < 0.3).length / rolls.length;
    expect(below).toBeGreaterThan(0.25);
    expect(below).toBeLessThan(0.35);
    expect(rolls.every((r) => r >= 0 && r < 1)).toBe(true);
  });
});
