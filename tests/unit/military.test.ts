import { describe, expect, it } from 'vitest';
import { computeEconomy, projectOne, STRUCTURE_TYPES, STRUCTURES } from '../../shared/play/economy.js';
import {
  MILITARY,
  MILITARY_STRUCTURES,
  militaryPower,
  projectRecruits,
  recruitment,
  researchProblem,
  TECH_TYPES,
  TECHS,
  techCost,
  techSeconds,
  trainCost,
  trainSeconds,
  UNIT_TYPES,
  unitProblem,
  UNITS,
  upkeep,
} from '../../shared/play/military.js';

const base = { type: 'military_base' as const, level: 1 };

describe('recrutamento', () => {
  it('sem instalações o exército cresce devagar; base militar acelera e aumenta o teto', () => {
    const none = recruitment([]);
    const withBase = recruitment([base]);
    expect(none.rate).toBe(MILITARY.recruitBase);
    expect(withBase.rate).toBe(MILITARY.recruitBase + MILITARY.recruitPerBase);
    expect(withBase.cap).toBe(none.cap + MILITARY.recruitCapPerBase);
    expect(recruitment([{ type: 'city', level: 2 }]).cap).toBe(none.cap + 2 * MILITARY.recruitCapPerCity);
    expect(recruitment([], 'quick').rate > none.rate).toBe(true);
  });

  it('recrutas crescem até o teto e o que passou do teto fica', () => {
    expect(projectRecruits(0, 0, 10, 100, 3_600_000)).toBe(10);
    expect(projectRecruits(95, 0, 10, 100, 3_600_000)).toBe(100);
    expect(projectRecruits(120, 0, 10, 100, 3_600_000)).toBe(120);
  });
});

describe('unidades e treinamento', () => {
  it('todas as categorias da visão (menos mísseis, Fase E) com custo, tempo, ataque, defesa e manutenção', () => {
    expect(UNIT_TYPES.length).toBe(8);
    for (const u of UNIT_TYPES) {
      const d = UNITS[u];
      expect(d.seconds > 0 && d.attack > 0 && d.defense > 0 && d.recruits >= 1).toBe(true);
      expect(Object.keys(d.cost).length > 0 && Object.keys(d.upkeep).length > 0).toBe(true);
      if (d.structure) expect(STRUCTURE_TYPES.includes(d.structure)).toBe(true);
      if (d.research) expect(TECHS[d.research].unlocks === u || u === 'mechanized' || u === 'armor').toBe(true);
    }
  });

  it('cada unidade exige sua instalação e pesquisa; infantaria não exige nada', () => {
    expect(unitProblem('infantry', [], {})).toBeNull();
    expect(unitProblem('mechanized', [], {})).toMatch(/base militar/i);
    expect(unitProblem('mechanized', [base], {})).toMatch(/Motorização/);
    expect(unitProblem('mechanized', [base], { motorization: 1 })).toBeNull();
    expect(unitProblem('navy', [{ type: 'naval_base', level: 1 }], {})).toMatch(/Engenharia naval/);
    expect(unitProblem('artillery', [{ type: 'arms_factory', level: 1 }], {})).toBeNull();
    // Obra ainda no nível 0 não libera nada.
    expect(unitProblem('defense', [{ type: 'defense_center', level: 0 }], {})).toMatch(/centro de defesa/i);
  });

  it('sem base militar a infantaria treina 3× mais devagar; centro de treinamento e pesquisa aceleram, com teto', () => {
    const slow = trainSeconds('infantry', 100, [], {});
    const normal = trainSeconds('infantry', 100, [base], {});
    expect(slow).toBe(normal * MILITARY.untrainedSlowdown);
    const fast = trainSeconds('infantry', 100, [base, { type: 'training_center', level: 2 }], { training_methods: 2 });
    expect(fast).toBe(Math.round(normal * (1 - 2 * MILITARY.trainingCenterPerLevel - 2 * 0.1)));
    const capped = trainSeconds('infantry', 100, [base, { type: 'training_center', level: 5 }], { training_methods: 3 });
    expect(capped).toBe(Math.round(normal * (1 - MILITARY.maxTrainingCut)));
    expect(trainSeconds('infantry', 100, [base], {}, 'quick') < normal).toBe(true);
  });

  it('custo do lote é proporcional e consome recrutas pela tripulação', () => {
    expect(trainCost('armor', 10)).toEqual({ cost: { money: 2600, metal: 1100, oil: 300 }, recruits: 30 });
  });
});

describe('pesquisa', () => {
  it('exige centro tecnológico concluído, uma de cada vez, até o nível 3', () => {
    const tech = [{ type: 'tech' as const, level: 1 }];
    expect(researchProblem('doctrine', [], {}, false)).toMatch(/centro tecnológico/);
    expect(researchProblem('doctrine', tech, {}, true)).toMatch(/em andamento/);
    expect(researchProblem('doctrine', tech, { doctrine: 3 }, false)).toMatch(/máximo/);
    expect(researchProblem('doctrine', tech, { doctrine: 2 }, false)).toBeNull();
  });

  it('custo dobra e tempo cresce a cada nível', () => {
    for (const t of TECH_TYPES) {
      expect(techCost(t, 1).money).toBe(TECHS[t].cost.money! * 2);
      expect(techSeconds(t, 1) > techSeconds(t, 0)).toBe(true);
    }
  });
});

describe('poder militar', () => {
  it('soma unidades (média de ataque e defesa) e infraestrutura militar', () => {
    const p = militaryPower({ infantry: 100 }, {}, []);
    expect(p.power).toBe(Math.round((100 * 1 + 100 * 1.2) / 2));
    expect(p.troops).toBe(100);
    expect(p.groups.troops).toBe(p.power);
    const withBase = militaryPower({ infantry: 100 }, {}, [base]);
    expect(withBase.power - p.power).toBe(MILITARY.infrastructurePerLevel);
    expect(withBase.groups.infrastructure).toBe(MILITARY.infrastructurePerLevel);
  });

  it('pesquisa reforça as unidades certas; fortificação e centro de defesa reforçam só a defesa', () => {
    const plain = militaryPower({ infantry: 100, armor: 10 }, {}, []);
    const drilled = militaryPower({ infantry: 100, armor: 10 }, { doctrine: 2 }, []);
    expect(drilled.groups.troops).toBe(Math.round(plain.groups.troops * 1.2));
    expect(drilled.groups.equipment).toBe(plain.groups.equipment);
    const fort = militaryPower({ defense: 10 }, { fortification: 1 }, [{ type: 'defense_center', level: 1 }]);
    expect(fort.attack).toBe(10);
    expect(fort.defense).toBe(Math.round(120 * (1 + 0.08 + 0.1)));
    expect(drilled.techShare).toBeGreaterThan(0);
  });

  it('cada instalação militar existe como construção, sem produção de recursos', () => {
    for (const t of MILITARY_STRUCTURES) {
      expect(STRUCTURES[t].military).toBe(true);
      expect(Object.keys(STRUCTURES[t].produces).length).toBe(0);
    }
    expect(STRUCTURES.naval_base.coastal).toBe(true);
  });
});

describe('manutenção na economia', () => {
  it('a manutenção sai da produção e a pesquisa de logística militar reduz', () => {
    const input = { regions: ['BRA-1294'], capitalRegion: 'BRA-1294', structures: [] };
    const peace = computeEconomy(input);
    const war = computeEconomy({ ...input, army: { infantry: 100, armor: 10 } });
    expect(war.upkeep.money).toBe(100 * 3 + 10 * 10);
    expect(war.upkeep.oil).toBe(40);
    expect(peace.rates.money - war.rates.money).toBeCloseTo(400, 6);
    const lean = computeEconomy({ ...input, army: { infantry: 100 }, research: { military_logistics: 2 } });
    expect(lean.upkeep.money).toBeCloseTo(300 * 0.8, 6);
    expect(upkeep({ infantry: 10 }, {}, 'quick').money).toBeGreaterThan(30);
  });

  it('com produção negativa o saldo cai até zero, nunca abaixo', () => {
    expect(projectOne(100, -50, 8000, 1)).toBe(50);
    expect(projectOne(100, -50, 8000, 3)).toBe(0);
    // Acima da capacidade e com manutenção maior que a produção: cai.
    expect(projectOne(9000, -100, 8000, 1)).toBe(8900);
  });
});
