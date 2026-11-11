// Partida rápida: teatros, arena, bots e regra de vitória. Funções puras usadas pelo servidor
// (autoridade) e pelo cliente (exibição). Documentação em docs/PLAY_RULES.md.
import { distanceKm, REGION_BY_ID, START_POINT_BY_ID, START_POINTS, type StartPoint } from '../world/regions';
import { FLAG_PRESETS, type FlagSpec } from './flags';
import { NATION_COLORS } from './rules';

export const QUICK = {
  /** Regiões disponíveis na arena. */
  arenaSize: 40,
  bots: 3,
  /** Bots só começam a atacar depois destes minutos de partida. */
  botWarAfterMinutes: 4,
  /** Sem fundar em 10 minutos, a partida é encerrada sem vencedor. */
  foundDeadlineMinutes: 10,
  /** Intervalo (s) entre decisões de um bot: sorteado nesta faixa. */
  botThink: [3, 7] as [number, number],
};

/** Teatros: o centro de cada arena. Cada um tem pelo menos 8 pontos de partida dentro dos 40 vizinhos. */
export const THEATERS = [
  { id: 'brasil', name: 'Brasil Central', center: 'cap-bra-brasilia' },
  { id: 'europa', name: 'Europa Central', center: 'cap-deu-berlin' },
  { id: 'china', name: 'China Oriental', center: 'cap-chn-beijing' },
  { id: 'atlantico-norte', name: 'Costa Leste da América do Norte', center: 'cap-usa-washington-d-c' },
  { id: 'africa-austral', name: 'África Austral', center: 'cap-zaf-pretoria' },
  { id: 'india', name: 'Norte da Índia', center: 'cap-ind-new-delhi' },
  { id: 'mesoamerica', name: 'Mesoamérica', center: 'cap-mex-mexico-city' },
  { id: 'levante', name: 'Levante e Nilo', center: 'cap-egy-cairo' },
] as const;
export type TheaterId = (typeof THEATERS)[number]['id'];

/**
 * Arena: as `size` regiões mais próximas do centro que se alcançam por terra (crescimento por
 * vizinhança, sempre a região de fronteira mais perto do centro). Determinística.
 */
export function buildArena(theater: TheaterId, size = QUICK.arenaSize): string[] {
  const t = THEATERS.find((x) => x.id === theater);
  const center = t && START_POINT_BY_ID[t.center];
  if (!center) throw new Error(`teatro desconhecido: ${theater}`);
  const origin = REGION_BY_ID[center.region];
  const got = new Set([origin.id]);
  const front = new Set(origin.neighbors);
  while (got.size < size && front.size) {
    let best = '';
    let bestD = Infinity;
    for (const id of front) {
      const d = distanceKm(REGION_BY_ID[id].at, origin.at);
      if (d < bestD || (d === bestD && id < best)) [best, bestD] = [id, d];
    }
    front.delete(best);
    got.add(best);
    for (const n of REGION_BY_ID[best].neighbors) if (!got.has(n)) front.add(n);
  }
  return [...got].sort();
}

export function arenaStartPoints(arena: Iterable<string>): StartPoint[] {
  const set = new Set(arena);
  return START_POINTS.filter((p) => set.has(p.region));
}

/** Pontos dos bots: espalhados (cada um o mais longe possível dos já escolhidos), deixando o centro livre. */
export function pickBotPoints(arena: string[], count: number, seed: number): StartPoint[] {
  const points = arenaStartPoints(arena);
  if (points.length < count + 2) throw new Error('arena com poucos pontos de partida');
  const mid: [number, number] = [points.reduce((a, p) => a + p.at[0], 0) / points.length, points.reduce((a, p) => a + p.at[1], 0) / points.length];
  const chosen: StartPoint[] = [];
  // Primeiro bot: entre os mais afastados do centro, escolhido pela semente.
  const far = [...points].sort((a, b) => distanceKm(b.at, mid) - distanceKm(a.at, mid)).slice(0, 4);
  chosen.push(far[seed % far.length]);
  while (chosen.length < count) {
    let best: StartPoint | null = null;
    let bestD = -1;
    for (const p of points) {
      if (chosen.includes(p)) continue;
      const d = Math.min(...chosen.map((c) => distanceKm(c.at, p.at)));
      if (d > bestD) [best, bestD] = [p, d];
    }
    chosen.push(best!);
  }
  return chosen;
}

const BOT_NAMES = ['Liga Austral', 'Confederação Boreal', 'União Meridiana', 'Pacto do Levante', 'República Atlântica', 'Coalizão Andina', 'Federação Orion', 'Aliança Delta'];

/** Identidade dos bots: nomes, cores e bandeiras diferentes entre si e da cor do jogador. */
export function botIdentities(count: number, seed: number, avoidColor: string | null = null): { name: string; color: string; flag: FlagSpec }[] {
  const colors = NATION_COLORS.filter((c) => c.hex !== avoidColor);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      name: BOT_NAMES[(seed + i * 3) % BOT_NAMES.length],
      color: colors[(seed * 5 + i * 4) % colors.length].hex,
      flag: FLAG_PRESETS[(seed + i * 5) % FLAG_PRESETS.length].flag,
    });
  }
  return out;
}

export interface Standing {
  nationId: number;
  regions: number;
  area: number;
}

/** Classificação: mais regiões da arena; empate por área; depois quem fundou antes (menor id). */
export function rank(standings: Standing[]): Standing[] {
  return [...standings].sort((a, b) => b.regions - a.regions || b.area - a.area || a.nationId - b.nationId);
}

/**
 * Situação da partida.
 * - Vitória imediata: uma nação com mais da metade das regiões da arena.
 * - Fim por tempo, ou quando não sobra região neutra nem ocupação em andamento: vence quem tiver mais regiões.
 */
/**
 * Fim da partida rápida (visão: vence quem conquistar 100% do território disponível):
 * - uma nação controla todas as regiões da arena → 'conquest';
 * - o jogador humano perdeu todas as regiões → 'eliminated' (ele fica em último).
 * Não há fim por tempo nem por "todas as regiões ocupadas": a guerra continua até a conquista.
 */
export function matchOutcome(o: { arenaSize: number; standings: Standing[]; human: number | null }):
  | { over: false }
  | { over: true; reason: 'conquest' | 'eliminated'; ranking: Standing[]; loser: number | null } {
  const ranking = rank(o.standings);
  if (ranking[0] && ranking[0].regions >= o.arenaSize) return { over: true, reason: 'conquest', ranking, loser: null };
  const human = o.standings.find((s) => s.nationId === o.human);
  if (human && human.regions === 0) return { over: true, reason: 'eliminated', ranking, loser: human.nationId };
  return { over: false };
}

export const OUTCOME_LABEL = {
  conquest: 'Conquista de 100% da arena',
  eliminated: 'Sua nação perdeu todas as regiões',
  majority: 'Domínio de mais da metade da arena',
  time: 'Fim do tempo',
  exhausted: 'Todas as regiões ocupadas',
  abandoned: 'Partida abandonada',
  expired: 'Ninguém fundou a tempo',
} as const;
export type OutcomeReason = keyof typeof OUTCOME_LABEL;
