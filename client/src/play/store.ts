import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StructureType } from '../../../shared/play/economy';
import type { EconomyView, FoundInput, NationView, OccupationView, PlayEvent, PlaySnapshot, StructureView, WorldView } from '../../../shared/play/types';
import { dominatedCountries } from '../../../shared/world/regions';
import { api, ApiError, serverNow } from '../api';
import { Realtime, type RealtimeStatus } from '../realtime';

/** Estado do mundo no cliente: cópia do que o servidor informou, nunca uma fonte própria. */
export interface WorldState {
  world: WorldView;
  me: number | null;
  nations: Map<number, NationView>;
  /** região → nação */
  control: Map<string, number>;
  occupations: OccupationView[];
  structures: Map<number, StructureView>;
  economy: EconomyView | null;
}

/** Acontecimentos que a interface anima (derivados de eventos do servidor ou da diferença entre estados). */
export type WorldMoment =
  | { kind: 'nation'; nation: NationView; region: string }
  | { kind: 'occupation'; occupation: OccupationView }
  | { kind: 'region'; region: string; nationId: number }
  | { kind: 'country'; country: string; nationId: number }
  | { kind: 'structure'; structure: StructureView; completed: boolean }
  | { kind: 'match'; world: WorldView };

function fromSnapshot(s: PlaySnapshot): WorldState {
  return {
    world: s.world,
    me: s.me,
    nations: new Map(s.nations.map((n) => [n.id, n])),
    control: new Map(s.control),
    occupations: s.occupations,
    structures: new Map(s.structures.map((x) => [x.id, x])),
    economy: s.economy,
  };
}

export function regionsOf(state: WorldState, nationId: number): string[] {
  const out: string[] = [];
  for (const [region, owner] of state.control) if (owner === nationId) out.push(region);
  return out;
}

export function structuresOf(state: WorldState, nationId: number): StructureView[] {
  return [...state.structures.values()].filter((s) => s.nationId === nationId);
}

/**
 * Liga a tela ao mundo `worldId` (null = campanha): lê o estado, aplica os eventos em tempo real e
 * relê quando reconecta ou quando algo vence. `onMoment` recebe o que merece animação.
 */
export function usePlayWorld(worldId: number | null, governorId: number | null, onMoment: (m: WorldMoment, state: WorldState) => void) {
  const [state, setState] = useState<WorldState | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const current = useRef<WorldState | null>(null);
  const moment = useRef(onMoment);
  moment.current = onMoment;
  const enabled = governorId !== null;

  const commit = useCallback((next: WorldState, announce: boolean) => {
    const prev = current.current;
    current.current = next;
    setState(next);
    if (!prev || !announce || prev.world.id !== next.world.id) return;
    // Diferença entre estados: cobre eventos perdidos (reconexão) e respostas diretas do servidor.
    for (const n of next.nations.values()) {
      if (!prev.nations.has(n.id)) {
        const region = [...next.control].find(([, owner]) => owner === n.id)?.[0];
        if (region) moment.current({ kind: 'nation', nation: n, region }, next);
      }
    }
    const gained = new Map<number, string[]>();
    for (const [region, owner] of next.control) {
      if (prev.control.get(region) === owner) continue;
      if (!prev.nations.has(owner)) continue; // já anunciado como fundação
      moment.current({ kind: 'region', region, nationId: owner }, next);
      gained.set(owner, [...(gained.get(owner) ?? []), region]);
    }
    for (const nationId of gained.keys()) {
      const before = new Set(dominatedCountries(regionsOf(prev, nationId)));
      for (const country of dominatedCountries(regionsOf(next, nationId))) {
        if (!before.has(country)) moment.current({ kind: 'country', country, nationId }, next);
      }
    }
    for (const o of next.occupations) {
      if (!prev.occupations.some((p) => p.id === o.id)) moment.current({ kind: 'occupation', occupation: o }, next);
    }
    for (const s of next.structures.values()) {
      const old = prev.structures.get(s.id);
      if (!old) moment.current({ kind: 'structure', structure: s, completed: false }, next);
      else if (s.level > old.level) moment.current({ kind: 'structure', structure: s, completed: true }, next);
      else if (s.building && !old.building) moment.current({ kind: 'structure', structure: s, completed: false }, next);
    }
    if (next.world.finishedAt && !prev.world.finishedAt) moment.current({ kind: 'match', world: next.world }, next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      commit(fromSnapshot(await api.get<PlaySnapshot>('/play/state')), true);
      setError(null);
    } catch (e) {
      if (!current.current) setError(e instanceof ApiError ? e.message : 'Falha ao carregar o mundo.');
    }
  }, [commit]);

  // Troca de mundo: começa do zero.
  useEffect(() => {
    current.current = null;
    setState(null);
  }, [worldId]);

  useEffect(() => {
    if (!enabled) return;
    const apply = (event: PlayEvent | { type: string }) => {
      const prev = current.current;
      if (!prev) return;
      if (event.type === 'resync') return void refresh();
      if (!event.type.startsWith('play.')) return;
      const e = event as PlayEvent;
      const next: WorldState = { ...prev, nations: new Map(prev.nations), control: new Map(prev.control), structures: new Map(prev.structures) };
      if (e.type === 'play.nation') {
        next.nations.set(e.nation.id, e.nation);
        next.control.set(e.region, e.nation.id);
        // O aviso pode chegar antes da resposta do próprio pedido de fundação.
        if (e.nation.id === governorId) next.me = governorId;
      } else if (e.type === 'play.occupation') {
        if (!prev.occupations.some((o) => o.id === e.occupation.id)) next.occupations = [...prev.occupations, e.occupation];
      } else if (e.type === 'play.region') {
        next.control.set(e.region, e.nationId);
        next.occupations = prev.occupations.filter((o) => o.id !== e.occupationId);
      } else if (e.type === 'play.occupation.failed') {
        next.occupations = prev.occupations.filter((o) => o.id !== e.occupationId);
      } else if (e.type === 'play.structure') {
        next.structures.set(e.structure.id, e.structure);
      } else if (e.type === 'play.economy') {
        next.economy = e.economy;
      } else if (e.type === 'play.match') {
        next.world = e.world;
        if (e.world.finishedAt) next.occupations = [];
      }
      commit(next, true);
    };
    const rt = new Realtime(apply, setStatus, () => void refresh());
    rt.connect();
    return () => rt.stop();
  }, [enabled, governorId, worldId, refresh, commit]);

  // Quando a próxima ocupação ou obra vence, relê o estado: a leitura faz o servidor concluir e avisar.
  const nextEnd = useMemo(() => {
    if (!state || state.world.finishedAt) return null;
    const ends = [...state.occupations.map((o) => o.endsAt), ...[...state.structures.values()].flatMap((s) => (s.building ? [s.building.endsAt] : []))];
    if (state.world.endsAt) ends.push(state.world.endsAt);
    return ends.length ? Math.min(...ends) : null;
  }, [state]);
  useEffect(() => {
    if (nextEnd === null) return;
    const wait = Math.max(150, nextEnd - serverNow() + 250);
    const id = window.setTimeout(() => void refresh(), wait);
    // Se o aviso não chegar (rede instável), insiste a cada poucos segundos.
    const retry = window.setInterval(() => void refresh(), 4000 + wait);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(retry);
    };
  }, [nextEnd, refresh]);

  const found = useCallback(
    async (input: FoundInput) => {
      commit(fromSnapshot(await api.post<PlaySnapshot>('/play/found', input)), true);
    },
    [commit],
  );

  const expand = useCallback(
    async (region: string) => {
      const { occupation } = await api.post<{ occupation: OccupationView; seconds: number }>('/play/expand', { region });
      const prev = current.current;
      if (prev && !prev.occupations.some((o) => o.id === occupation.id)) commit({ ...prev, occupations: [...prev.occupations, occupation] }, true);
    },
    [commit],
  );

  const upsertStructure = useCallback(
    (structure: StructureView) => {
      const prev = current.current;
      if (!prev) return;
      const structures = new Map(prev.structures);
      structures.set(structure.id, structure);
      commit({ ...prev, structures }, true);
    },
    [commit],
  );

  const build = useCallback(
    async (at: [number, number], type: StructureType, region: string) => upsertStructure((await api.post<{ structure: StructureView }>('/play/build', { at, type, region })).structure),
    [upsertStructure],
  );
  const upgrade = useCallback(
    async (structureId: number) => upsertStructure((await api.post<{ structure: StructureView }>('/play/upgrade', { structureId })).structure),
    [upsertStructure],
  );

  return { state, status, error, refresh, found, expand, build, upgrade };
}
