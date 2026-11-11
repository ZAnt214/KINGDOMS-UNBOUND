import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildProblem, type EconomyInput, ECONOMY, expansionCost, missing, STRUCTURES, type StructureType } from '../../../shared/play/economy';
import { QUICK } from '../../../shared/play/match';
import { expansionSeconds, MILESTONES, milestoneProgress } from '../../../shared/play/rules';
import type { NationView, StructureView } from '../../../shared/play/types';
import { COUNTRIES, COUNTRY_BY_CODE } from '../../../shared/world';
import { countryOccupation, dominatedCountries, landmassSize, REGION_BY_ID, REGIONS_BY_COUNTRY, START_POINT_BY_ID, START_POINTS, type StartPoint } from '../../../shared/world/regions';
import { api, ApiError, serverNow } from '../api';
import { useTick } from '../hooks';
import type { RealtimeStatus } from '../realtime';
import type { MapFill, MapFlag, MapLabel, MapPick, MapPoint, MapStructure, WorldMapEngine } from '../worldmap/engine';
import { audio } from './audio';
import { PointCard, RegionCard } from './cards';
import { BuildGrid, EconomySheet, Glyph, ResourceStrip, StructurePanel, useAmounts } from './economyUi';
import { STRUCTURE_GLYPH } from './glyphs';
import { Banner, type BannerData, Dock, IdentityPill, MatchClock, ObjectiveChip, OccupationCapsule, StatChips, type Toast, Toasts, ZoomButtons } from './hud';
import { draftFlagSrc, flagCanvasImage, type IdentityDraft, nationFlagSrc } from './identity';
import { fmtArea, myTargets, nationStats, objective, progressOf, ranking } from './model';
import { BuildSheet, NationSheet, RankingSheet, SettingsSheet } from './sheets';
import { regionsOf, structuresOf, type WorldMoment, type WorldState } from './store';

const LABELS: MapLabel[] = COUNTRIES.map((c) => ({ code: c.code, text: c.name, at: c.labelAt, rank: c.labelRank }));
const BLOOM_MS = 2200;

interface Props {
  engine: WorldMapEngine;
  state: WorldState;
  status: RealtimeStatus;
  /** Falso enquanto outra tela cobre o mapa: a cena continua sincronizada, mas sem HUD nem toques. */
  active: boolean;
  draft: IdentityDraft;
  onDraft: (d: IdentityDraft) => void;
  username: string;
  /** Assina os acontecimentos do mundo; devolve a função que cancela. */
  subscribe: (fn: (m: WorldMoment, state: WorldState) => void) => () => void;
  found: (pointId: string) => Promise<void>;
  expand: (region: string) => Promise<void>;
  build: (region: string, type: StructureType) => Promise<void>;
  upgrade: (structureId: number) => Promise<void>;
  onEditIdentity: () => void;
  onSwitchMode: () => void;
  onLeave: () => Promise<void>;
  onLogout: () => void;
}

type Sheet = 'nation' | 'ranking' | 'settings' | 'economy' | 'build' | null;
type Panel = { kind: 'new'; region: string; type: StructureType } | { kind: 'existing'; id: number } | null;
interface Bloom {
  color: string;
  origin: [number, number];
  startAt: number;
  endAt: number;
}

const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * O jogo sobre o mapa: sincroniza o motor com o estado do servidor, anima os acontecimentos e
 * mostra o HUD. Não decide regra nenhuma: tudo que muda o mundo passa por found, expand, build e upgrade.
 */
export function MapStage(props: Props) {
  const { engine, state, status, active, draft, onDraft, username, subscribe, found, expand, build, upgrade } = props;
  const me = state.me !== null ? (state.nations.get(state.me) ?? null) : null;
  const quick = state.world.mode === 'quick';
  const arena = state.world.arena;
  const arenaSet = useMemo(() => (arena ? new Set(arena) : null), [arena]);
  const [point, setPoint] = useState<StartPoint | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [blooms, setBlooms] = useState<Record<string, Bloom>>({});
  const [flagTick, setFlagTick] = useState(0);
  const [reduced, setReduced] = useState(() => {
    try {
      const saved = localStorage.getItem('ku.reducedMotion');
      return saved === null ? prefersReduced() : saved === '1';
    } catch {
      return prefersReduced();
    }
  });
  const planted = useRef(new Map<string, number>());
  const completed = useRef(new Map<number, number>());
  const toastId = useRef(0);
  const live = useRef({ state, me, active });
  live.current = { state, me, active };

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info', flag?: string) => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, text, tone, flag }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);

  const stats = useMemo(() => (me ? nationStats(state, me) : null), [state, me]);
  const myStructures = useMemo(() => (me ? structuresOf(state, me.id) : []), [state, me]);
  const capitalRegion = me ? (START_POINT_BY_ID[me.capital]?.region ?? null) : null;
  const myOccupation = me ? (state.occupations.find((o) => o.nationId === me.id) ?? null) : null;
  const targets = useMemo(() => {
    if (!stats || myOccupation || state.world.finishedAt) return [];
    const list = myTargets(state, stats.regions);
    return arenaSet ? list.filter((r) => arenaSet.has(r)) : list;
  }, [state, stats, myOccupation, arenaSet]);
  const board = useMemo(() => ranking(state), [state]);
  const econInput: EconomyInput | null = useMemo(
    () => (stats ? { regions: stats.regions, capitalRegion, structures: myStructures.filter((s) => s.level > 0).map((s) => ({ type: s.type, level: s.level, region: s.region })) } : null),
    [stats, capitalRegion, myStructures],
  );
  const queue = myStructures.filter((s) => s.building).length;
  const building = myStructures.some((s) => s.building);
  useTick(myOccupation || building || quick ? 250 : 1000);
  const have = useAmounts(state.economy);

  // ---------- motor: dados estáveis ----------

  useEffect(() => {
    engine.setLabels(LABELS);
    engine.setLayerVisible('graticule', true);
    return () => {
      // Ao trocar de mundo, nada do anterior fica no mapa.
      engine.setTerritories([]);
      engine.setFills([]);
      engine.setFlags([]);
      engine.setStructures([]);
      engine.setExpansionHints([], '#ffffff');
      engine.setPreview(null);
      engine.setSelectedRegion(null);
      engine.setArena(null);
    };
  }, [engine]);
  useEffect(() => {
    engine.setReducedMotion(reduced);
    try {
      localStorage.setItem('ku.reducedMotion', reduced ? '1' : '0');
    } catch {
      /* preferência vale só nesta sessão */
    }
  }, [engine, reduced]);
  useEffect(() => {
    engine.setPadding({ top: me ? 104 : 64, right: 0 });
  }, [engine, me]);
  useEffect(() => {
    engine.setArena(arena);
    if (arena && !me) engine.flyToRegions(arena, 0.86, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, arena]);

  // ---------- motor: territórios, ocupações, pontos, bandeiras, construções ----------

  useEffect(() => {
    const by = new Map<number, string[]>();
    for (const [rid, owner] of state.control) {
      if (blooms[rid]) continue; // ainda florescendo: o preenchimento animado cobre a região
      const list = by.get(owner);
      if (list) list.push(rid);
      else by.set(owner, [rid]);
    }
    engine.setTerritories([...by].map(([id, regions]) => ({ id: String(id), color: state.nations.get(id)?.color ?? '#8792a6', regions, own: id === state.me })));
  }, [engine, state, blooms]);

  useEffect(() => {
    const fills: MapFill[] = state.occupations.map((o) => ({
      id: `o${o.id}`,
      region: o.region,
      color: state.nations.get(o.nationId)?.color ?? '#8792a6',
      fromRegion: o.from,
      startAt: o.startedAt,
      endAt: o.endsAt,
    }));
    for (const [rid, b] of Object.entries(blooms)) fills.push({ id: `b${rid}`, region: rid, color: b.color, origin: b.origin, startAt: b.startAt, endAt: b.endAt });
    engine.setFills(fills);
  }, [engine, state, blooms]);

  useEffect(() => {
    if (me) {
      engine.setPoints([]);
      return;
    }
    const busyRegions = new Set(state.occupations.map((o) => o.region));
    const points: MapPoint[] = START_POINTS.filter((p) => !arenaSet || arenaSet.has(p.region)).map((p) => ({
      id: p.id,
      lon: p.at[0],
      lat: p.at[1],
      kind: p.kind,
      label: p.name,
      state: state.control.has(p.region) || busyRegions.has(p.region) ? 'taken' : point?.id === p.id ? 'selected' : 'free',
    }));
    engine.setPoints(points, true);
  }, [engine, state, me, point, arenaSet]);

  useEffect(() => {
    const redraw = () => setFlagTick((n) => n + 1);
    const flags: MapFlag[] = [];
    for (const n of state.nations.values()) {
      const cap = START_POINT_BY_ID[n.capital];
      if (!cap) continue;
      const image = flagCanvasImage(nationFlagSrc(n), redraw);
      const regions = regionsOf(state, n.id);
      flags.push({ id: `cap:${n.id}`, lon: cap.at[0], lat: cap.at[1], image, color: n.color, scale: 1.25, label: n.name, plantedAt: planted.current.get(`cap:${n.id}`) });
      for (const rid of regions) {
        if (rid === cap.region || blooms[rid]) continue;
        const r = REGION_BY_ID[rid];
        if (r) flags.push({ id: `reg:${rid}`, lon: r.at[0], lat: r.at[1], image, color: n.color, scale: 0.72, minZoom: 3.2, plantedAt: planted.current.get(`reg:${rid}`) });
      }
      for (const code of dominatedCountries(regions)) {
        const c = COUNTRY_BY_CODE[code];
        // País de uma região só: a bandeira da região (ou da capital) já basta.
        if (!c || REGIONS_BY_COUNTRY[code].length < 2) continue;
        flags.push({ id: `cty:${code}`, lon: c.labelAt[0], lat: c.labelAt[1] - 1.2, image, color: n.color, scale: 1.7, plantedAt: planted.current.get(`cty:${code}`) });
      }
    }
    engine.setFlags(flags);
  }, [engine, state, blooms, flagTick]);

  useEffect(() => {
    const byRegion = new Map<string, StructureView[]>();
    for (const s of state.structures.values()) {
      const list = byRegion.get(s.region);
      if (list) list.push(s);
      else byRegion.set(s.region, [s]);
    }
    const list: MapStructure[] = [];
    for (const [rid, items] of byRegion) {
      const owner = state.nations.get(items[0].nationId);
      const cap = owner ? START_POINT_BY_ID[owner.capital] : null;
      const anchor: [number, number] = cap && cap.region === rid ? cap.at : (REGION_BY_ID[rid]?.at ?? [0, 0]);
      const own = items[0].nationId === state.me;
      items
        .sort((a, b) => a.id - b.id)
        .forEach((s, i) =>
          list.push({
            id: String(s.id),
            anchor,
            slot: i,
            slots: items.length,
            color: owner?.color ?? '#8792a6',
            glyph: STRUCTURE_GLYPH[s.type],
            level: s.level,
            building: s.building ? { startAt: s.building.startedAt, endAt: s.building.endsAt } : null,
            completedAt: completed.current.get(s.id),
            own,
            minZoom: own ? 1.6 : 2.8,
          }),
        );
    }
    engine.setStructures(list);
  }, [engine, state]);

  useEffect(() => {
    engine.setExpansionHints(targets, me?.color ?? '#ffffff');
  }, [engine, targets, me]);
  useEffect(() => {
    engine.setPreview(!me && point ? [point.region] : null, draft.color);
  }, [engine, me, point, draft.color]);
  useEffect(() => {
    engine.setSelectedRegion(region);
  }, [engine, region]);

  // ---------- seleção no mapa ----------

  const selectPoint = useCallback(
    (p: StartPoint) => {
      audio.play('select');
      setCardError(null);
      setPoint(p);
      engine.playEffect({ kind: 'ring', at: p.at, color: '#bfe4ff', ms: 900 });
      engine.flyToRegions([p.region], window.innerWidth < 720 ? 0.5 : 0.36, 12);
      api
        .get<{ blocked: string[] }>(`/play/colors?pointId=${encodeURIComponent(p.id)}`)
        .then((r) => setBlocked(r.blocked))
        .catch(() => setBlocked([]));
    },
    [engine],
  );

  const openRegion = useCallback((rid: string) => {
    setPanel(null);
    setCardError(null);
    setRegion(rid);
  }, []);

  // Com um cartão aberto, a região fica na metade de cima da tela, à vista.
  const cardOpen = !!region || !!panel || !!point;
  useEffect(() => {
    const narrow = window.innerWidth < 720;
    engine.setPadding({ bottom: cardOpen && narrow ? window.innerHeight * 0.56 : narrow ? 150 : 90, left: cardOpen && !narrow ? 420 : 0 });
    const focus = region ?? (panel?.kind === 'new' ? panel.region : panel ? state.structures.get(panel.id)?.region : null);
    if (focus) engine.flyToRegions([focus], 0.62, 9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, cardOpen, region, panel]);

  useEffect(() => {
    const onPick = (pick: MapPick | null) => {
      const { state: s, me: mine, active: on } = live.current;
      if (!on) return;
      setCardError(null);
      if (!pick) {
        setRegion(null);
        setPoint(null);
        setPanel(null);
        return;
      }
      if (pick.kind === 'structure') {
        audio.play('tap');
        setRegion(null);
        setPanel({ kind: 'existing', id: Number(pick.id) });
        return;
      }
      if (pick.kind === 'flag' && !mine) {
        // Antes de fundar, bandeiras só informam de quem é o lugar.
        const [kind, id] = pick.id.split(':');
        const owner = kind === 'cap' ? s.nations.get(Number(id)) : kind === 'reg' ? s.nations.get(s.control.get(id) ?? -1) : undefined;
        if (owner) toast(`Território de ${owner.name}.`, 'info', nationFlagSrc(owner));
        return;
      }
      if (pick.kind === 'flag') {
        const [kind, id] = pick.id.split(':');
        if (kind === 'reg') return void (audio.play('tap'), openRegion(id));
        if (kind === 'cap') {
          const nation = s.nations.get(Number(id));
          const cap = nation && START_POINT_BY_ID[nation.capital];
          if (cap) return void (audio.play('tap'), openRegion(cap.region));
        }
        return;
      }
      if (!mine) {
        const inArena = (rid: string) => !s.world.arena || s.world.arena.includes(rid);
        const taken = (rid: string) => s.control.has(rid) || s.occupations.some((o) => o.region === rid);
        if (pick.kind === 'point') {
          const p = START_POINT_BY_ID[pick.id];
          if (p && !taken(p.region) && inArena(p.region)) selectPoint(p);
          return;
        }
        if (pick.kind === 'region') {
          const p = START_POINTS.find((sp) => sp.region === pick.id);
          if (p && !taken(p.region) && inArena(p.region)) selectPoint(p);
          else {
            setPoint(null);
            const owner = s.control.get(pick.id);
            toast(
              !inArena(pick.id)
                ? 'Esta região fica fora da área da partida.'
                : owner !== undefined
                  ? `${REGION_BY_ID[pick.id]?.name ?? 'Esta região'} já pertence a ${s.nations.get(owner)?.name ?? 'outra nação'}.`
                  : 'Toque em um ponto luminoso para fundar sua nação ali.',
            );
          }
        }
        return;
      }
      if (pick.kind === 'region') {
        audio.play('tap');
        openRegion(pick.id);
      }
    };
    return engine.on('select', onPick);
  }, [engine, selectPoint, toast, openRegion]);

  // ---------- acontecimentos do mundo ----------

  useEffect(
    () =>
      subscribe((m, s) => {
        // `s` é o estado já com a mudança aplicada (a tela ainda pode não ter redesenhado).
        const mine = s.me !== null ? (s.nations.get(s.me) ?? null) : null;
        const now = performance.now();
        if (m.kind === 'nation') {
          const cap = START_POINT_BY_ID[m.nation.capital];
          const origin = cap?.at ?? REGION_BY_ID[m.region]?.at;
          if (!origin) return;
          const own = m.nation.id === s.me;
          const start = serverNow() + (own ? 500 : 0);
          setBlooms((b) => ({ ...b, [m.region]: { color: m.nation.color, origin, startAt: start, endAt: start + BLOOM_MS } }));
          window.setTimeout(() => setBlooms(({ [m.region]: _done, ...rest }) => rest), BLOOM_MS + (own ? 700 : 200));
          planted.current.set(`cap:${m.nation.id}`, now + (own ? 900 : 300));
          engine.playEffect({ kind: 'beacon', at: origin, color: m.nation.color, ms: 1900 });
          if (own) {
            audio.play('found');
            engine.flyToRegions([m.region], window.innerWidth < 720 ? 0.55 : 0.4, 12);
            window.setTimeout(() => engine.playEffect({ kind: 'conquest', region: m.region, color: m.nation.color }), BLOOM_MS + 400);
            // O aviso entra depois que a cor terminou de se espalhar: o mapa é o espetáculo.
            window.setTimeout(() => setBanner({ id: now, title: m.nation.name, text: `Nação fundada em ${cap?.name ?? REGION_BY_ID[m.region]?.name}`, flag: nationFlagSrc(m.nation) }), BLOOM_MS + 300);
          } else if (!m.nation.bot || s.me !== null) {
            audio.play('notify');
            toast(`${m.nation.name} foi fundada em ${cap?.name ?? 'um novo ponto'}.`, 'info', nationFlagSrc(m.nation));
          }
          return;
        }
        if (m.kind === 'occupation') {
          if (m.occupation.nationId !== s.me) return;
          audio.play('expand');
          const r = REGION_BY_ID[m.occupation.region];
          if (r) engine.playEffect({ kind: 'ring', at: r.at, color: mine?.color ?? '#ffffff', ms: 1000 });
          return;
        }
        if (m.kind === 'region') {
          const nation = s.nations.get(m.nationId);
          if (!nation) return;
          planted.current.set(`reg:${m.region}`, now + 150);
          engine.playEffect({ kind: 'conquest', region: m.region, color: nation.color });
          if (m.nationId !== s.me) return;
          audio.play('conquest');
          toast(`${REGION_BY_ID[m.region]?.name ?? 'Região'} ocupada. Sua bandeira está lá.`, 'good', nationFlagSrc(nation));
          const after = nationStats(s, nation);
          const before = { ...progressOf(after), regions: after.regions.length - 1 };
          const reached = MILESTONES.find((ms) => ms.kind === 'regions' && milestoneProgress(ms, progressOf(after)).done && !milestoneProgress(ms, before).done);
          if (reached) window.setTimeout(() => toast(`Meta cumprida: ${reached.title.toLowerCase()}.`, 'good'), 900);
          return;
        }
        if (m.kind === 'structure') {
          if (m.completed) completed.current.set(m.structure.id, now);
          if (m.structure.nationId !== s.me) return;
          const def = STRUCTURES[m.structure.type];
          const where = REGION_BY_ID[m.structure.region]?.name ?? '';
          if (m.completed) {
            audio.play('built');
            toast(m.structure.level === 1 ? `${def.name} concluída em ${where}.` : `${def.name} de ${where} chegou ao nível ${m.structure.level}.`, 'good');
            const after = mine ? nationStats(s, mine) : null;
            if (after) {
              const before = { ...progressOf(after), structures: after.structures - (m.structure.level === 1 ? 1 : 0) };
              const reached = MILESTONES.find((ms) => ms.kind === 'structures' && milestoneProgress(ms, progressOf(after)).done && !milestoneProgress(ms, before).done);
              if (reached) window.setTimeout(() => toast(`Meta cumprida: ${reached.title.toLowerCase()}.`, 'good'), 900);
            }
          } else audio.play('build');
          return;
        }
        if (m.kind === 'match') {
          const won = m.world.winner !== null && m.world.winner === s.me;
          audio.play(won ? 'victory' : 'defeat');
          return;
        }
        if (m.kind === 'country') {
          const nation = s.nations.get(m.nationId);
          const country = COUNTRY_BY_CODE[m.country];
          if (!nation || !country) return;
          planted.current.set(`cty:${m.country}`, now + 500);
          if (m.nationId === s.me) {
            window.setTimeout(() => audio.play('country'), 500);
            setBanner({ id: now, title: `${country.name} é seu`, text: '100% do território ocupado', flag: nationFlagSrc(nation) });
          } else toast(`${nation.name} dominou ${country.name}.`, 'info', nationFlagSrc(nation));
        }
      }),
    [engine, subscribe, toast],
  );

  // Subida de nível: anunciada quando o nível derivado do território e das construções muda.
  const level = stats?.level.level ?? 0;
  const lastLevel = useRef(level);
  useEffect(() => {
    if (level > lastLevel.current && lastLevel.current > 0) {
      window.setTimeout(() => {
        audio.play('level');
        toast(`Sua nação chegou ao nível ${level}.`, 'good');
      }, 1600);
    }
    lastLevel.current = level;
  }, [level, toast]);

  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), 3600);
    return () => window.clearTimeout(id);
  }, [banner]);

  // Ao entrar com a nação já fundada, a câmera começa no território.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || !stats || !stats.regions.length) return;
    framed.current = true;
    if (stats.regions.length === 1 && blooms[stats.regions[0]]) return;
    engine.flyToRegions(arena && quick ? arena : stats.regions, quick ? 0.86 : 0.5, 10);
  }, [engine, stats, blooms, arena, quick]);

  // ---------- ações ----------

  const run = async (fn: () => Promise<void>, onError?: (e: unknown) => void) => {
    if (busy) return false;
    setBusy(true);
    setCardError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      audio.play('deny');
      setCardError(e instanceof ApiError ? e.message : 'Não foi possível concluir. Tente de novo.');
      onError?.(e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirmPoint = () =>
    point &&
    void run(
      async () => {
        await found(point.id);
        setPoint(null);
        setRegion(null);
      },
      (e) => {
        if (e instanceof ApiError && e.code === 'color_taken') setBlocked((b) => [...new Set([...b, draft.color])]);
      },
    );

  const occupy = (rid: string) => void run(async () => (await expand(rid), setRegion(null)));

  const actOnPanel = () => {
    if (!panel) return;
    if (panel.kind === 'new') void run(async () => (await build(panel.region, panel.type), setPanel(null)));
    else void run(async () => (await upgrade(panel.id), setPanel(null)));
  };

  const goCapital = () => {
    if (!me || !stats) return;
    audio.play('tap');
    engine.flyToRegions(stats.regions, 0.5, 10);
  };
  const showTargets = () => {
    if (!stats) return;
    audio.play('tap');
    if (myOccupation) return void engine.flyToRegions([myOccupation.region, myOccupation.from], 0.5, 12);
    if (!targets.length) {
      const reach = landmassSize(stats.regions[0]) <= stats.regions.length;
      return void toast(reach ? 'Não há mais regiões alcançáveis por terra. A travessia marítima depende da Marinha, que ainda não existe.' : 'Todas as regiões vizinhas já têm dono ou estão sendo ocupadas.');
    }
    engine.flyToRegions([...stats.regions, ...targets], 0.62, 10);
    toast(`${targets.length} ${targets.length === 1 ? 'região vizinha livre' : 'regiões vizinhas livres'}. Toque em uma área tracejada.`);
  };

  const goal = stats ? objective(stats) : null;
  const regionDef = region ? REGION_BY_ID[region] : null;
  const panelStructure = panel?.kind === 'existing' ? (state.structures.get(panel.id) ?? null) : null;
  const panelType = panel?.kind === 'new' ? panel.type : (panelStructure?.type ?? null);
  const panelRegion = panel?.kind === 'new' ? panel.region : (panelStructure?.region ?? null);
  const sameType = (t: StructureType) => myStructures.filter((s) => s.type === t).length;
  const arenaMine = arena && stats ? stats.regions.filter((r) => arenaSet!.has(r)).length : 0;
  const majority = Math.floor((arena?.length ?? 0) * QUICK.majority) + 1;
  if (!active) return null;

  return (
    <div className="ku-stage" style={{ ['--nation' as string]: me?.color ?? draft.color }} data-testid="map-stage" data-phase={me ? 'play' : 'select'}>
      <div className="ku-top">
        {me && stats ? (
          <IdentityPill nation={me} level={stats.level} onOpen={() => setSheet('nation')} />
        ) : (
          <button type="button" className="ku-pill ku-pill-draft" onClick={props.onEditIdentity} data-testid="edit-identity">
            <img src={draftFlagSrc(draft)} alt="" />
            <span>
              <b>{draft.name || 'Sua nação'}</b>
              <small>Trocar bandeira e cor</small>
            </span>
          </button>
        )}
        <StatChips stats={stats} nations={state.nations.size} status={status} onRanking={() => setSheet('ranking')} onSettings={() => setSheet('settings')} />
      </div>

      <div className="ku-sub">
        {me && state.economy && <ResourceStrip economy={state.economy} onOpen={() => setSheet('economy')} />}
        {quick && state.world.endsAt && !state.world.finishedAt && <MatchClock endsAt={state.world.endsAt} />}
      </div>

      {me && quick && arena && <ObjectiveChip title={`Domine ${majority} das ${arena.length} regiões`} value={arenaMine} target={majority} />}
      {me && !quick && goal && <ObjectiveChip title={goal.milestone.title} value={goal.value} target={goal.milestone.target} />}
      {!me && !point && (
        <p className="ku-guide" data-testid="guide">
          {quick ? `${state.nations.size} nações do servidor já fundaram. Escolha um ponto luminoso na arena` : 'Escolha um ponto luminoso para fundar sua nação'}
        </p>
      )}

      <Toasts toasts={toasts} />
      {banner && <Banner key={banner.id} data={banner} />}
      <ZoomButtons onIn={() => engine.zoomBy(1.7)} onOut={() => engine.zoomBy(1 / 1.7)} onHome={() => (arena ? engine.flyToRegions(arena, 0.86, 8) : engine.home())} />

      {me && stats && (
        <div className="ku-bottom">
          {myOccupation && (
            <OccupationCapsule
              name={REGION_BY_ID[myOccupation.region]?.name ?? 'Região'}
              startedAt={myOccupation.startedAt}
              endsAt={myOccupation.endsAt}
              onFocus={() => engine.flyToRegions([myOccupation.region, myOccupation.from], 0.5, 12)}
            />
          )}
          {!region && !panel && (
            <Dock
              targets={targets.length}
              occupying={!!myOccupation}
              building={queue}
              onExpand={showTargets}
              onCapital={goCapital}
              onBuild={() => {
                audio.play('tap');
                setSheet('build');
              }}
              onRanking={() => setSheet('ranking')}
            />
          )}
        </div>
      )}

      {!me && point && (
        <PointCard
          point={point}
          color={draft.color}
          blocked={blocked}
          busy={busy}
          error={cardError}
          onColor={(hex) => {
            audio.play('tap');
            setCardError(null);
            onDraft({ ...draft, color: hex });
          }}
          onConfirm={confirmPoint}
          onClose={() => setPoint(null)}
        />
      )}

      {me && stats && regionDef && !panel && (
        <RegionCard
          region={regionDef}
          me={me}
          owner={state.control.has(regionDef.id) ? (state.nations.get(state.control.get(regionDef.id)!) ?? null) : null}
          occupation={state.occupations.find((o) => o.region === regionDef.id) ?? null}
          occupier={(id) => state.nations.get(id) ?? null}
          canTarget={targets.includes(regionDef.id)}
          slotBusy={!!myOccupation}
          adjacent={regionDef.neighbors.some((n) => stats.regions.includes(n))}
          seconds={expansionSeconds(regionDef.area, stats.regions.length, state.world.mode)}
          countryShare={countryOccupation(regionDef.country, (id) => state.control.get(id) === me.id)}
          cost={expansionCost(stats.regions.length)}
          have={have}
          outside={!!arenaSet && !arenaSet.has(regionDef.id)}
          busy={busy || (targets.includes(regionDef.id) && !!have && Object.keys(missing(have, expansionCost(stats.regions.length))).length > 0)}
          error={cardError}
          onOccupy={() => occupy(regionDef.id)}
          onClose={() => setRegion(null)}
        >
          {state.control.get(regionDef.id) === me.id && (
            <RegionStructures
              structures={myStructures.filter((s) => s.region === regionDef.id)}
              onOpen={(s) => {
                audio.play('tap');
                setPanel({ kind: 'existing', id: s.id });
              }}
            />
          )}
          {state.control.get(regionDef.id) === me.id && !state.world.finishedAt && (
            <BuildGrid
              region={regionDef.id}
              capitalRegion={capitalRegion}
              structures={myStructures.filter((s) => s.region === regionDef.id)}
              queue={queue}
              have={have}
              sameType={sameType}
              onPick={(t) => {
                audio.play('tap');
                setCardError(null);
                setPanel({ kind: 'new', region: regionDef.id, type: t });
              }}
            />
          )}
        </RegionCard>
      )}

      {panel && panelType && panelRegion && (
        <StructurePanel
          type={panelType}
          region={panelRegion}
          structure={panelStructure}
          own={panel.kind === 'new' || panelStructure?.nationId === state.me}
          ownerName={panelStructure ? state.nations.get(panelStructure.nationId)?.name : undefined}
          input={econInput}
          mode={state.world.mode}
          have={have}
          sameType={sameType(panelType)}
          problem={
            panel.kind === 'new'
              ? buildProblem(panelType, {
                  region: panelRegion,
                  coast: REGION_BY_ID[panelRegion].coast,
                  capitalRegion,
                  inRegion: myStructures.filter((s) => s.region === panelRegion).map((s) => s.type),
                  queue,
                })
              : queue >= ECONOMY.buildQueue && !panelStructure?.building
                ? `Já há ${ECONOMY.buildQueue} obras em andamento. Aguarde uma terminar.`
                : null
          }
          busy={busy || !!state.world.finishedAt}
          error={cardError}
          onAct={actOnPanel}
          onClose={() => {
            setPanel(null);
            setCardError(null);
          }}
        />
      )}

      {sheet === 'nation' && me && stats && (
        <NationSheet
          stats={stats}
          milestones={MILESTONES.map((ms) => ({ milestone: ms, ...milestoneProgress(ms, progressOf(stats)) }))}
          area={fmtArea(stats.area)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'economy' && state.economy && <EconomySheet economy={state.economy} onClose={() => setSheet(null)} />}
      {sheet === 'build' && stats && (
        <BuildSheet
          regions={stats.regions}
          capitalRegion={capitalRegion}
          structures={myStructures}
          onRegion={(rid) => {
            setSheet(null);
            engine.flyToRegions([rid], 0.45, 12);
            openRegion(rid);
          }}
          onStructure={(s) => {
            setSheet(null);
            setPanel({ kind: 'existing', id: s.id });
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'ranking' && (
        <RankingSheet
          board={board}
          me={state.me}
          world={state.world.name}
          onPick={(n: NationView) => {
            setSheet(null);
            engine.flyToRegions(regionsOf(state, n.id), 0.5, 10);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'settings' && (
        <SettingsSheet
          username={username}
          reduced={reduced}
          onReduced={setReduced}
          quick={quick && !state.world.finishedAt}
          onSwitchMode={() => {
            setSheet(null);
            props.onSwitchMode();
          }}
          onLeave={async () => {
            setSheet(null);
            await props.onLeave();
          }}
          onLogout={props.onLogout}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

/** Construções de uma região do jogador, com nível e obra. */
function RegionStructures({ structures, onOpen }: { structures: StructureView[]; onOpen: (s: StructureView) => void }) {
  if (!structures.length) return null;
  const now = serverNow();
  return (
    <div className="ku-region-structures" data-testid="region-structures">
      {structures.map((s) => {
        const p = s.building ? Math.max(0, Math.min(1, (now - s.building.startedAt) / Math.max(1, s.building.endsAt - s.building.startedAt))) : 1;
        return (
          <button type="button" key={s.id} onClick={() => onOpen(s)} data-testid={`structure-${s.type}`}>
            <Glyph d={STRUCTURE_GLYPH[s.type]} size={20} />
            <span>
              <b>{STRUCTURES[s.type].name}</b>
              <small>{s.building ? `Obra ${Math.floor(p * 100)}%` : `Nível ${s.level}`}</small>
            </span>
            {s.building && <i style={{ transform: `scaleX(${p})` }} />}
          </button>
        );
      })}
    </div>
  );
}

