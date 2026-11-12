// Fase F — Diplomacia: regras compartilhadas entre servidor, bots e tela.
import { type ResourceMap, RESOURCES } from './economy';
import { type Army, UNIT_TYPES } from './military';
import type { GameMode } from './rules';

export const DIPLOMACY_RULES_VERSION = 1;

export const DIPLOMACY = {
  /** Validade do pedido de aliança (minutos): a campanha dura dias; a partida rápida, minutos. */
  requestMinutes: { campaign: 24 * 60, quick: 10, team: 10 } as Record<GameMode, number>,
  /** Quebra de aliança (visão, seção 14): perde 10% do poder militar e 20% dos recursos. */
  breakTroopLoss: 0.1,
  breakResourceLoss: 0.2,
  /** Quem rompe não pode atacar os antigos aliados por 30 minutos. */
  breakBlockMinutes: 30,
  /** Porcentagens de tropas que um aliado pode mandar a uma operação. */
  helpPercents: [25, 50, 75, 100] as const,
  /** Partida rápida: o bot só aceita quem não é o mais forte da partida (por poder). */
  botLeaderRule: true,
};

/** Penalidade de quem rompe: 10% de cada tipo de tropa em casa e 20% de cada recurso (para baixo). */
export function breakPenalty(home: Army, amounts: ResourceMap): { troops: Army; resources: ResourceMap } {
  const troops: Army = {};
  for (const u of UNIT_TYPES) {
    const n = Math.floor((home[u] ?? 0) * DIPLOMACY.breakTroopLoss);
    if (n > 0) troops[u] = n;
  }
  const resources = {} as ResourceMap;
  for (const r of RESOURCES) resources[r] = Math.floor(Math.max(0, amounts[r] ?? 0) * DIPLOMACY.breakResourceLoss);
  return { troops, resources };
}

/**
 * Envio de recursos a um aliado: chega o que cabe no armazém dele (capacidade de cada recurso).
 * Só é cobrado o que chega.
 */
export function deliverable(asked: Partial<ResourceMap>, receiver: ResourceMap, capacity: number): Partial<ResourceMap> {
  const out: Partial<ResourceMap> = {};
  for (const r of RESOURCES) {
    const want = Math.floor(asked[r] ?? 0);
    if (want <= 0) continue;
    const room = Math.floor(Math.max(0, capacity - (receiver[r] ?? 0)));
    const n = Math.min(want, room);
    if (n > 0) out[r] = n;
  }
  return out;
}

/**
 * Resposta do bot a um pedido de aliança, por regra fixa e pública:
 *   recusa quem está em guerra com ele (operação ou míssil entre os dois em andamento),
 *   quem já rompeu uma aliança com ele nesta partida,
 *   e quem é a nação mais forte da partida (bots não se aliam ao líder);
 *   aceita os demais.
 */
export function botAnswer(input: { atWar: boolean; brokeBefore: boolean; requesterPower: number; strongestOther: number }): { accept: boolean; reason: string } {
  if (input.atWar) return { accept: false, reason: 'está em guerra com você' };
  if (input.brokeBefore) return { accept: false, reason: 'você já rompeu uma aliança com esta nação' };
  if (DIPLOMACY.botLeaderRule && input.requesterPower > 0 && input.requesterPower > input.strongestOther) return { accept: false, reason: 'não se alia à nação mais forte da partida' };
  return { accept: true, reason: 'aceitou' };
}
