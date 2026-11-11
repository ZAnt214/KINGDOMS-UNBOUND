import { type Milestone, milestoneProgress, nationLevel, nationXp, nextMilestone } from '../../../shared/play/rules';
import type { NationView } from '../../../shared/play/types';
import { dominatedCountries, expansionTargets, REGION_BY_ID } from '../../../shared/world/regions';
import { regionsOf, structuresOf, type WorldState } from './store';

export interface NationStats {
  nation: NationView;
  regions: string[];
  countries: string[];
  area: number;
  /** Construções concluídas (nível ≥ 1). */
  structures: number;
  structureLevels: number;
  xp: number;
  level: ReturnType<typeof nationLevel>;
}

export function nationStats(state: WorldState, nation: NationView): NationStats {
  const regions = regionsOf(state, nation.id);
  const countries = dominatedCountries(regions);
  const area = regions.reduce((sum, id) => sum + (REGION_BY_ID[id]?.area ?? 0), 0);
  const built = structuresOf(state, nation.id).filter((x) => x.level > 0);
  const structureLevels = built.reduce((sum, x) => sum + x.level, 0);
  const xp = nationXp(regions.length, countries.length, structureLevels);
  return { nation, regions, countries, area, structures: built.length, structureLevels, xp, level: nationLevel(xp) };
}

/** Todas as nações do mundo, da maior para a menor (regiões, depois área). */
export function ranking(state: WorldState): NationStats[] {
  return [...state.nations.values()]
    .map((n) => nationStats(state, n))
    .sort((a, b) => b.regions.length - a.regions.length || b.area - a.area || a.nation.foundedAt - b.nation.foundedAt);
}

/** Regiões neutras, vizinhas e sem ocupação em andamento: onde dá para expandir agora. */
export function myTargets(state: WorldState, mine: string[]): string[] {
  const busy = new Set(state.occupations.map((o) => o.region));
  return expansionTargets(mine, (id) => !state.control.has(id) && !busy.has(id));
}

export function objective(stats: NationStats): { milestone: Milestone; value: number } | null {
  const p = progressOf(stats);
  const m = nextMilestone(p);
  return m ? { milestone: m, value: milestoneProgress(m, p).value } : null;
}

export const progressOf = (s: NationStats) => ({ regions: s.regions.length, countries: s.countries.length, structures: s.structures });

/** Número compacto para o HUD: 950, 12,4 mil, 1,2 mi. */
export function fmtAmount(n: number): string {
  const v = Math.floor(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (v >= 10_000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString('pt-BR');
}

/** Produção por hora, ou por minuto quando o ritmo é alto (partida rápida). */
export function fmtRate(perHour: number): string {
  if (perHour >= 6000) return `+${fmtAmount(perHour / 60)}/min`;
  return `+${fmtAmount(perHour)}/h`;
}

export const fmtArea = (km2: number) =>
  km2 >= 1_000_000 ? `${(km2 / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi km²` : `${Math.round(km2).toLocaleString('pt-BR')} km²`;

export const fmtPeople = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : n >= 1000 ? `${Math.round(n / 1000).toLocaleString('pt-BR')} mil` : String(n);

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}min ${r}s` : `${m}min`;
}
