import { describe, expect, it } from 'vitest';
import { botAnswer, breakPenalty, deliverable, DIPLOMACY } from '../../shared/play/diplomacy.js';
import { type BattleSetup, contributions, engagedIn, predictEnd, simulate, splitSurvivors } from '../../shared/play/war.js';

const zero = { money: 0, materials: 0, metal: 0, oil: 0, tech: 0, special: 0 };

const setup = (attacker: object, defender: object, events: BattleSetup['events'] = []): BattleSetup => ({
  startedAt: 0,
  base: 60,
  naval: false,
  attacker,
  attackerResearch: {},
  defender,
  defenderResearch: {},
  defenderMultiplier: 1,
  events,
});

describe('quebra de aliança', () => {
  it('perde 10% de cada tropa em casa e 20% de cada recurso (para baixo)', () => {
    const p = breakPenalty({ infantry: 105, armor: 9 }, { ...zero, money: 1000, metal: 55.9 });
    expect(p.troops).toEqual({ infantry: 10 });
    expect(p.resources.money).toBe(200);
    expect(p.resources.metal).toBe(11);
    expect(p.resources.oil).toBe(0);
    expect(DIPLOMACY.breakBlockMinutes).toBe(30);
  });
});

describe('envio de recursos', () => {
  it('chega só o que cabe no armazém de quem recebe; ignora zeros', () => {
    expect(deliverable({ money: 500, oil: 0, metal: 300 }, { ...zero, money: 7800, metal: 100 }, 8000)).toEqual({ money: 200, metal: 300 });
    expect(deliverable({ money: 500 }, { ...zero, money: 8000 }, 8000)).toEqual({});
  });
});

describe('resposta dos bots', () => {
  const ok = { atWar: false, brokeBefore: false, requesterPower: 100, strongestOther: 300 };
  it('aceita por padrão; recusa guerra, quebra anterior e a nação mais forte', () => {
    expect(botAnswer(ok).accept).toBe(true);
    expect(botAnswer({ ...ok, atWar: true }).accept).toBe(false);
    expect(botAnswer({ ...ok, brokeBefore: true }).accept).toBe(false);
    expect(botAnswer({ ...ok, requesterPower: 400 }).accept).toBe(false);
    // Sem exército não é "a mais forte".
    expect(botAnswer({ ...ok, requesterPower: 0, strongestOther: 0 }).accept).toBe(true);
  });
});

describe('tropas de aliados nas operações', () => {
  const op = {
    attackerId: 1,
    defenderId: 2,
    setup: { attacker: { infantry: 10 }, defender: { infantry: 5 } },
    events: [
      { at: 1, kind: 'reinforce' as const, army: { infantry: 3 } },
      { at: 2, kind: 'reinforce' as const, army: { infantry: 6 }, side: 'defender' as const, by: 3 },
      { at: 3, kind: 'reinforce' as const, army: { infantry: 4, armor: 2 }, side: 'attacker' as const, by: 4 },
    ],
  };
  it('cada um responde pelo que mandou, de cada lado', () => {
    expect(engagedIn(op, 1)).toEqual({ infantry: 10 });
    expect(engagedIn(op, 2)).toEqual({ infantry: 8 });
    expect(engagedIn(op, 3)).toEqual({ infantry: 6 });
    expect(engagedIn(op, 4)).toEqual({ infantry: 4, armor: 2 });
    expect([...contributions(op, 'attacker').keys()]).toEqual([1, 4]);
  });

  it('aliado do atacante soma ao ataque e acelera a conquista', () => {
    const alone = setup({ infantry: 60 }, { infantry: 30 });
    const helped = setup({ infantry: 60 }, { infantry: 30 }, [{ at: 0, kind: 'reinforce', army: { infantry: 60 }, side: 'attacker', by: 9 }]);
    expect(predictEnd(helped)).toBeLessThan(predictEnd(alone));
    expect(simulate(helped, predictEnd(helped) + 1000).status).toBe('won');
  });

  it('aliado do defensor pode virar a batalha', () => {
    const lost = setup({ infantry: 60 }, { infantry: 20 });
    const saved = setup({ infantry: 60 }, { infantry: 20 }, [{ at: 0, kind: 'reinforce', army: { infantry: 120 }, side: 'defender', by: 9 }]);
    expect(simulate(lost, predictEnd(lost) + 1000).status).toBe('won');
    expect(simulate(saved, predictEnd(saved) + 1000).status).toBe('failed');
  });

  it('sobreviventes divididos na proporção do que cada um mandou, sem perder unidade', () => {
    const c = new Map([
      [1, { infantry: 10, armor: 1 }],
      [4, { infantry: 30 }],
    ]);
    const back = splitSurvivors(c, { infantry: 21, armor: 1 });
    expect(back.get(1)).toEqual({ infantry: 5, armor: 1 });
    expect(back.get(4)).toEqual({ infantry: 16 });
    // Nunca devolve mais do que o enviado.
    expect(splitSurvivors(new Map([[1, { infantry: 2 }]]), { infantry: 5 }).get(1)).toEqual({ infantry: 2 });
  });
});
