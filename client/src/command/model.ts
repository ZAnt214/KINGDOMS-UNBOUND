// Derivações puras entre o estado do servidor e o que o HUD mostra. Sem React, sem canvas.
import { COUNTRIES, COUNTRY_BY_CODE, type CountryDef, NEUTRAL_COLOR, type TerritoryAction, territoryActions } from '../../../shared/world';
import type { WorldBloc, WorldSnapshot, WorldWar } from '../api';
import type { CountryStyle, MapLabel } from '../worldmap/engine';

export const MAP_LABELS: MapLabel[] = COUNTRIES.map((c) => ({ code: c.code, text: c.name, at: c.labelAt, rank: c.labelRank }));

export interface TerritoryInfo {
  country: CountryDef;
  bloc: WorldBloc | null;
  color: string;
  relation: Relation;
  wars: WorldWar[];
  actions: TerritoryAction[];
}

export type Relation = 'own' | 'enemy' | 'other' | 'neutral' | 'unaligned';

export const RELATION_LABEL: Record<Relation, string> = {
  own: 'Território do seu bloco',
  enemy: 'Em guerra com o seu bloco',
  other: 'Outro bloco, sem guerra com o seu',
  neutral: 'Neutro',
  unaligned: 'Você ainda não se alistou em um bloco',
};

const between = (w: WorldWar, a: number | null, b: number | null) =>
  a !== null && b !== null && ((w.attackerBlocId === a && w.defenderBlocId === b) || (w.attackerBlocId === b && w.defenderBlocId === a));

export function countryStyles(world: WorldSnapshot | null): Record<string, CountryStyle> {
  if (!world) return {};
  const color = new Map(world.blocs.map((b) => [b.id, b.color]));
  const contested = new Set(world.wars.map((w) => w.countryCode));
  const out: Record<string, CountryStyle> = {};
  for (const t of world.territories) {
    out[t.code] = { fill: (t.blocId !== null && color.get(t.blocId)) || NEUTRAL_COLOR, contested: contested.has(t.code) };
  }
  return out;
}

export function territoryInfo(world: WorldSnapshot | null, code: string | null): TerritoryInfo | null {
  const country = code ? COUNTRY_BY_CODE[code] : undefined;
  if (!world || !country) return null;
  const blocId = world.territories.find((t) => t.code === country.code)?.blocId ?? null;
  const bloc = world.blocs.find((b) => b.id === blocId) ?? null;
  const atWar = world.wars.some((w) => between(w, world.myBlocId, blocId));
  const relation: Relation = !bloc ? 'neutral' : world.myBlocId === null ? 'unaligned' : bloc.id === world.myBlocId ? 'own' : atWar ? 'enemy' : 'other';
  return {
    country,
    bloc,
    color: bloc?.color ?? NEUTRAL_COLOR,
    relation,
    wars: world.wars.filter((w) => w.countryCode === country.code),
    actions: territoryActions({ myBlocId: world.myBlocId, territoryBlocId: blocId, atWar }, world.systems),
  };
}

export function fmtPopulation(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (n >= 1e3) return `${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return n.toLocaleString('pt-BR');
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (v: number) => String(v).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h >= 100 ? `${Math.floor(h / 24)}d ${two(h % 24)}h` : `${two(h)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

export type ModuleKey = 'army' | 'air' | 'navy' | 'research' | 'build';

/** Módulos militares. `system` diz de qual sistema do servidor o módulo depende. */
export const MODULES: Record<ModuleKey, { title: string; system: 'armies' | 'research' | 'city'; scope: string[] }> = {
  army: { title: 'Exército', system: 'armies', scope: ['Infantaria', 'Blindados', 'Artilharia', 'Tropas especiais', 'Bases terrestres', 'Movimentação de tropas'] },
  air: { title: 'Aviação', system: 'armies', scope: ['Caças', 'Bombardeiros', 'Helicópteros', 'Aeronaves de reconhecimento', 'Bases aéreas'] },
  navy: { title: 'Marinha', system: 'armies', scope: ['Navios de guerra', 'Porta-aviões', 'Submarinos', 'Destróieres', 'Bases navais'] },
  research: {
    title: 'Pesquisa',
    system: 'research',
    scope: ['Tecnologia militar', 'Desenvolvimento de armamentos', 'Melhorias de produção', 'Inteligência', 'Defesa territorial'],
  },
  build: { title: 'Construção', system: 'city', scope: [] },
};
