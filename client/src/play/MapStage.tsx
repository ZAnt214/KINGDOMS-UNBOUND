import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildProblem, type EconomyInput, ECONOMY, expansionCost, missing, type Resource, RESOURCE_INFO, type ResourceMap, STRUCTURES, structureCost, type StructureType } from '../../../shared/play/economy';
import { LOGISTICS, previewLinks } from '../../../shared/play/logistics';
import { type TechType, TECHS, type UnitType, UNITS } from '../../../shared/play/military';
import { ArmySheet } from './armyUi';
import { attackOrigin, missileRange, WAR, type Weapon } from '../../../shared/play/war';
import { AttackSheet, EnemyActions, MissileConfirm, OperationCapsules, OperationSheet, opProgress } from './warUi';
import { DiplomacySheet, GiftSheet, PactCeremony, PactMark, PactPrompt } from './diplomacyUi';
import { expansionSeconds, MILESTONES, milestoneProgress } from '../../../shared/play/rules';
import type { NationView, StructureView } from '../../../shared/play/types';
import { COUNTRIES, COUNTRY_BY_CODE } from '../../../shared/world';
import { countryOccupation, distanceKm, dominatedCountries, landmassSize, REGION_BY_ID, REGIONS_BY_COUNTRY, START_POINT_BY_ID, START_POINTS, type StartPoint } from '../../../shared/world/regions';
import { api, ApiError, serverNow } from '../api';
import type { RealtimeStatus } from '../realtime';
import type { MapFill, MapFlag, MapLabel, MapPact, MapPick, MapPoint, MapRail, MapStructure, WorldMapEngine } from '../worldmap/engine';
import { audio } from './audio';
import { PointCard, RegionCard } from './cards';
import { amountsNow, BuildBar, EconomySheet, Glyph, ResourceStrip, StructurePanel } from './economyUi';
import { STRUCTURE_GLYPH } from './glyphs';
import { Banner, type BannerData, Dock, IdentityPill, MatchClock, ObjectiveChip, OccupationCapsule, StatChips, type Toast, Toasts, ZoomButtons } from './hud';
import { draftFlagSrc, flagCanvasImage, type IdentityDraft, nationFlagSrc } from './identity';
import { fmtAmount, fmtArea, linkKey, myTargets, nationStats, objective, progressOf, ranking, worldNetwork } from './model';
import { NationSheet, RankingSheet, SettingsSheet } from './sheets';
import { regionsOf, structuresOf, type WorldMoment, type WorldState } from './store';

const LABELS: MapLabel[] = COUNTRIES.map((c) => ({ code: c.code, text: c.name, at: c.labelAt, rank: c.labelRank }));
const BLOOM_MS = 2200;
/** Silo próprio, concluído, e o alcance dele com a pesquisa atual. */
function siloOf(s: WorldState, siloId: number) {
  const silo = s.structures.get(siloId);
  if (!silo || silo.nationId !== s.me || silo.type !== 'missile_silo' || silo.level < 1) return null;
  return { silo, range: missileRange(silo.level, 'missile') };
}

/** Quem rompeu uma aliança não ataca os antigos aliados por 30 minutos (Fase F). */
function pactBlock(s: WorldState, owner: number): string | null {
  const until = s.diplomacy?.blocks.find((b) => b.nationId === owner)?.until ?? 0;
  const left = until - serverNow();
  return left > 0 ? `Você rompeu a aliança com esta nação: ataques liberados em ${Math.max(1, Math.ceil(left / 60_000))} min.` : null;
}

/** Mesmas regras do servidor para o alvo de um míssil (null = pode). */
function missileProblem(s: WorldState, siloId: number, rid: string): string | null {
  const info = siloOf(s, siloId);
  if (!info) return 'Silo indisponível.';
  const owner = s.control.get(rid);
  if (owner === undefined || owner === s.me) return 'Escolha uma região de outra nação.';
  const me = s.me !== null ? s.nations.get(s.me) : null;
  if (me?.alliance !== null && me?.alliance === s.nations.get(owner)?.alliance) return 'Não é possível atacar um aliado.';
  const block = pactBlock(s, owner);
  if (block) return block;
  if (s.world.arena && !s.world.arena.includes(rid)) return 'Esta região fica fora da área da partida.';
  const km = distanceKm(info.silo.at, REGION_BY_ID[rid].at);
  if (km > info.range) return `Fora do alcance: ${Math.round(km).toLocaleString('pt-BR')} km (alcance de ${info.range.toLocaleString('pt-BR')} km).`;
  return null;
}

/** Mesmas regras do servidor para um ataque (null = pode), e a origem por terra ou mar. */
function attackCheck(s: WorldState, rid: string): { problem: string | null; origin: { from: string; naval: boolean } | null } {
  const owner = s.control.get(rid);
  if (s.me === null || owner === undefined || owner === s.me) return { problem: 'Região sem dono inimigo.', origin: null };
  const me = s.nations.get(s.me);
  const enemy = s.nations.get(owner);
  if (me?.alliance !== null && me?.alliance === enemy?.alliance) return { problem: 'Não é possível atacar um aliado.', origin: null };
  const block = pactBlock(s, owner);
  if (block) return { problem: block, origin: null };
  if (s.world.arena && !s.world.arena.includes(rid)) return { problem: 'Esta região fica fora da área da partida.', origin: null };
  const origin = attackOrigin(regionsOf(s, s.me), rid, (s.military?.army.navy ?? 0) > 0);
  if (!origin) {
    return {
      problem: REGION_BY_ID[rid].coast ? `Sem fronteira terrestre. Por mar, é preciso ter navios e litoral seu a até ${WAR.seaRangeKm} km.` : 'Sem fronteira terrestre com o seu território.',
      origin: null,
    };
  }
  const active = [...s.operations.values()].filter((o) => o.status === 'active');
  if (active.some((o) => o.region === rid)) return { problem: 'Já há uma operação militar nesta região.', origin };
  if (active.filter((o) => o.attackerId === s.me).length >= WAR.maxOperations) return { problem: `Sua nação já conduz ${WAR.maxOperations} operações. Aguarde uma terminar.`, origin };
  return { problem: null, origin };
}

/** Concordância dos avisos: "Cidade concluída", "Porto concluído". */
const FEMININE = new Set<StructureType>(['city', 'factory', 'refinery', 'power', 'military_base', 'arms_factory', 'air_base', 'naval_base']);

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
  build: (at: [number, number], type: StructureType, region: string) => Promise<void>;
  upgrade: (structureId: number) => Promise<void>;
  train: (unit: UnitType, amount: number) => Promise<void>;
  research: (tech: TechType) => Promise<void>;
  attack: (region: string, percent: number) => Promise<void>;
  reinforce: (operationId: number, percent: number) => Promise<void>;
  launch: (siloId: number, region: string, weapon: Weapon) => Promise<void>;
  /** Fase F: diplomacia (pedido, resposta, cancelamento, quebra e envio de recursos). */
  pact: {
    request: (nationId: number) => Promise<{ accepted: boolean; reason?: string; allianceId?: number | null }>;
    answer: (requestId: number, accept: boolean) => Promise<{ allianceId: number | null }>;
    cancel: (requestId: number) => Promise<unknown>;
    breakAlliance: () => Promise<unknown>;
    gift: (nationId: number, resources: Partial<ResourceMap>) => Promise<{ sent: Partial<ResourceMap> }>;
  };
  onEditIdentity: () => void;
  onSwitchMode: () => void;
  onLeave: () => Promise<void>;
  onLogout: () => void;
}

type Sheet = 'nation' | 'ranking' | 'settings' | 'economy' | 'army' | 'diplomacy' | null;
type Panel = { kind: 'existing'; id: number } | null;
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
  const { engine, state, status, active, draft, onDraft, username, subscribe, found, expand, build, upgrade, train, research, attack, reinforce, launch, pact } = props;
  const me = state.me !== null ? (state.nations.get(state.me) ?? null) : null;
  const quick = state.world.mode === 'quick';
  const arena = state.world.arena;
  const arenaSet = useMemo(() => (arena ? new Set(arena) : null), [arena]);
  const [point, setPoint] = useState<StartPoint | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  /** Barra de construção aberta e tipo escolhido (modo de posicionamento). */
  const [buildOpen, setBuildOpen] = useState(false);
  const [placing, setPlacing] = useState<StructureType | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  /** Fase E: região a atacar (folha de ataque), operação aberta, mira do silo e alvo escolhido. */
  const [attackOn, setAttackOn] = useState<string | null>(null);
  const [opOpen, setOpOpen] = useState<number | null>(null);
  const [aiming, setAiming] = useState<{ siloId: number } | null>(null);
  const [missileTarget, setMissileTarget] = useState<string | null>(null);
  /** Fase F: aliado escolhido para receber recursos, pedido adiado e cerimônia de aliança. */
  const [giftTo, setGiftTo] = useState<number | null>(null);
  const [later, setLater] = useState<Set<number>>(() => new Set());
  const [ceremony, setCeremony] = useState<{ a: number; b: number; broken?: boolean; id: number } | null>(null);
  const pactBorn = useRef(new Map<number, number>());
  const closeCeremony = useCallback(() => setCeremony(null), []);
  const pactBroken = useRef(new Map<number, { from: [number, number]; to: [number, number]; at: number }>());
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
  const live = useRef({ state, me, active, placing, aiming });
  live.current = { state, me, active, placing, aiming };

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
  const allies = useMemo(() => {
    const out = new Set<number>();
    if (!me || me.alliance === null) return out;
    for (const n of state.nations.values()) if (n.id !== me.id && n.alliance === me.alliance) out.add(n.id);
    return out;
  }, [state, me]);
  // Operações próprias e as de aliados (para ajudar).
  const myOps = useMemo(
    () => [...state.operations.values()].filter((o) => o.status === 'active' && (o.attackerId === state.me || o.defenderId === state.me || allies.has(o.defenderId) || allies.has(o.attackerId))),
    [state, allies],
  );
  const received = useMemo(() => (state.diplomacy?.requests ?? []).filter((r) => r.toId === state.me && r.expiresAt > serverNow()), [state]);
  const mySilo = useMemo(
    () => [...state.structures.values()].filter((x) => x.nationId === state.me && x.type === 'missile_silo' && x.level > 0).sort((a, b) => b.level - a.level)[0] ?? null,
    [state],
  );
  const econInput: EconomyInput | null = useMemo(() => {
    if (!stats || !me) return null;
    // Construções concluídas dos aliados: entram nas conexões logísticas (mesma regra do servidor).
    const allied = me.alliance === null ? [] : [...worldNetwork(state).nodes.values()].filter((n) => n.nation !== me.id && state.nations.get(n.nation)?.alliance === me.alliance);
    return {
      regions: stats.regions,
      capitalRegion,
      structures: myStructures.filter((s) => s.level > 0).map((s) => ({ id: s.id, type: s.type, level: s.level, region: s.region, at: s.at })),
      allied,
    };
  }, [state, stats, me, capitalRegion, myStructures]);
  const queue = myStructures.filter((s) => s.building).length;

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
    engine.setTerritories([...by].map(([id, regions]) => ({ id: String(id), color: state.nations.get(id)?.color ?? '#8792a6', regions, own: id === state.me, ally: allies.has(id) })));
  }, [engine, state, blooms, allies]);

  // Fase F: arcos de aliança entre a capital própria e as dos aliados (e a quebra animada).
  useEffect(() => {
    const capOf = (id: number) => START_POINT_BY_ID[state.nations.get(id)?.capital ?? '']?.at ?? null;
    const mine = state.me !== null ? capOf(state.me) : null;
    const list: MapPact[] = [];
    if (mine) {
      for (const id of allies) {
        const to = capOf(id);
        if (to) list.push({ id: `p${id}`, from: mine, to, appearAt: pactBorn.current.get(id) });
      }
    }
    const t = performance.now();
    for (const [id, b] of pactBroken.current) {
      if (t - b.at > 2000 || allies.has(id)) pactBroken.current.delete(id);
      else list.push({ id: `x${id}`, from: b.from, to: b.to, brokenAt: b.at });
    }
    engine.setPacts(list);
  }, [engine, state, allies, ceremony]);
  useEffect(() => () => engine.setPacts([]), [engine]);

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
    // Ocupação de guerra (Fase E): o preenchimento acompanha o progresso da batalha, que não é linear;
    // o intervalo é recalculado a cada aviso do servidor a partir do valor e da variação atuais.
    for (const o of state.operations.values()) {
      if (o.status !== 'active') continue;
      const v = o.progress.value;
      const r = o.progress.rate;
      const span = r > 1e-6 ? 1000 / r : 1e12;
      const startAt = o.progress.at - v * span;
      fills.push({
        id: `w${o.id}`,
        region: o.region,
        color: state.nations.get(o.attackerId)?.color ?? '#8792a6',
        ...(o.naval ? { origin: REGION_BY_ID[o.from]?.at } : { fromRegion: o.from }),
        startAt,
        endAt: Math.min(startAt + span, o.endsAt + 1),
      });
    }
    engine.setFills(fills);
  }, [engine, state, blooms]);

  // Fase E: setas e selos das operações, e mísseis.
  useEffect(() => {
    engine.setOperations(
      [...state.operations.values()]
        .filter((o) => o.status === 'active')
        .map((o) => ({
          id: String(o.id),
          from: REGION_BY_ID[o.from]?.at ?? [0, 0],
          to: REGION_BY_ID[o.region]?.at ?? [0, 0],
          color: state.nations.get(o.attackerId)?.color ?? '#8792a6',
          naval: o.naval,
          own: o.attackerId === state.me,
          against: o.defenderId === state.me,
          progress: o.progress,
        })),
    );
    engine.setMissiles(
      [...state.strikes.values()].map((x) => ({
        id: String(x.id),
        from: x.from,
        to: x.to,
        color: state.nations.get(x.attackerId)?.color ?? '#ff7a59',
        launchedAt: x.launchedAt,
        flightAt: x.flightAt,
        interceptAt: x.interceptAt,
        impactAt: x.impactAt,
        intercepted: x.intercepted,
        weapon: x.weapon,
      })),
    );
  }, [engine, state]);
  useEffect(
    () => () => {
      engine.setOperations([]);
      engine.setMissiles([]);
      engine.setMissileRange(null);
    },
    [engine],
  );
  // Mira do silo: círculo de alcance e regiões inimigas atingíveis destacadas.
  const aimTargets = useMemo(() => {
    if (!aiming) return [];
    const out: string[] = [];
    for (const [rid] of state.control) if (!missileProblem(state, aiming.siloId, rid)) out.push(rid);
    return out;
  }, [aiming, state]);
  useEffect(() => {
    const info = aiming ? siloOf(state, aiming.siloId) : null;
    engine.setMissileRange(info ? { center: info.silo.at, km: info.range, color: '#ff7a59' } : null);
  }, [engine, aiming, state]);

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
      // Capital tomada (Fase E): a bandeira grande sai; a região ganha a bandeira do novo dono.
      const holdsCapital = state.control.get(cap.region) === n.id;
      if (holdsCapital) flags.push({ id: `cap:${n.id}`, lon: cap.at[0], lat: cap.at[1], image, color: n.color, scale: 1.25, label: n.name, plantedAt: planted.current.get(`cap:${n.id}`) });
      for (const rid of regions) {
        if ((rid === cap.region && holdsCapital) || blooms[rid]) continue;
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
    const list: MapStructure[] = [];
    for (const s of state.structures.values()) {
      const own = s.nationId === state.me;
      list.push({
        id: String(s.id),
        lon: s.at[0],
        lat: s.at[1],
        color: state.nations.get(s.nationId)?.color ?? '#8792a6',
        glyph: STRUCTURE_GLYPH[s.type],
        level: s.level,
        building: s.building ? { startAt: s.building.startedAt, endAt: s.building.endsAt } : null,
        completedAt: completed.current.get(s.id),
        own,
        minZoom: own ? 1.6 : 2.8,
      });
    }
    engine.setStructures(list);
  }, [engine, state]);

  /** Instante em que cada trecho de ferrovia surgiu nesta sessão (para desenhá-lo aos poucos). */
  const railBorn = useRef(new Map<string, number>());
  useEffect(() => {
    const net = worldNetwork(state);
    const rails: MapRail[] = [];
    for (const l of net.links) {
      const a = net.nodes.get(l.a);
      const b = net.nodes.get(l.b);
      if (!a || !b) continue;
      const own = a.nation === state.me || b.nation === state.me;
      rails.push({
        id: linkKey(l),
        from: a.at,
        to: b.at,
        color: state.nations.get(a.nation)?.color ?? '#8792a6',
        ally: l.ally,
        own,
        appearAt: railBorn.current.get(linkKey(l)),
        minZoom: own ? 1.6 : 2.8,
      });
    }
    engine.setRails(rails);
  }, [engine, state]);
  useEffect(() => () => engine.setRails([]), [engine]);

  useEffect(() => {
    if (aiming) engine.setExpansionHints(aimTargets, '#ff7a59');
    else engine.setExpansionHints(targets, me?.color ?? '#ffffff');
  }, [engine, targets, me, aiming, aimTargets]);
  useEffect(() => {
    engine.setPreview(!me && point ? [point.region] : null, draft.color);
  }, [engine, me, point, draft.color]);
  useEffect(() => {
    engine.setSelectedRegion(region);
  }, [engine, region]);

  // ---------- construção por toque ----------

  /** Mesmas regras do servidor, para responder na hora (o servidor confere de novo). */
  const placeProblem = useCallback(
    (s: WorldState, type: StructureType, rid: string, at: [number, number]): string | null => {
      if (s.me === null || s.control.get(rid) !== s.me) return 'Construa dentro do seu território.';
      const mine = [...s.structures.values()].filter((x) => x.nationId === s.me);
      const capital = START_POINT_BY_ID[s.nations.get(s.me)!.capital]?.region ?? null;
      const problem = buildProblem(type, {
        region: rid,
        coast: REGION_BY_ID[rid].coast,
        capitalRegion: capital,
        inRegion: [...s.structures.values()].filter((x) => x.region === rid).length,
        queue: mine.filter((x) => x.building).length,
      });
      if (problem) return problem;
      if ([...s.structures.values()].some((x) => distanceKm(x.at, at) < ECONOMY.minDistanceKm)) return 'Muito perto de outra construção.';
      const have = amountsNow(s.economy);
      if (have && Object.keys(missing(have, structureCost(type, 0, mine.filter((x) => x.type === type).length))).length) return 'Recursos insuficientes.';
      return null;
    },
    [],
  );

  useEffect(() => {
    engine.setPlacement(
      placing
        ? {
            glyph: STRUCTURE_GLYPH[placing],
            color: me?.color ?? '#ffffff',
            accepts: (rid, at) => placeProblem(live.current.state, placing, rid, at) === null,
            links: (rid, at) => {
              const s = live.current.state;
              const own = [...worldNetwork(s).nodes.values()].filter((n) => n.nation === s.me);
              return previewLinks(own, { nation: s.me ?? 0, type: placing, level: 1, region: rid, at });
            },
          }
        : null,
    );
  }, [engine, placing, me, placeProblem]);
  useEffect(() => () => engine.setPlacement(null), [engine]);

  const pending = useRef(false);
  const place = useCallback(
    async (type: StructureType, rid: string, at: [number, number]) => {
      const problem = placeProblem(live.current.state, type, rid, at);
      if (problem) {
        audio.play('deny');
        toast(problem, 'bad');
        return;
      }
      if (pending.current) return;
      pending.current = true;
      try {
        await build(at, type, rid);
      } catch (e) {
        audio.play('deny');
        toast(e instanceof ApiError ? e.message : 'Não foi possível construir aqui.', 'bad');
      } finally {
        pending.current = false;
      }
    },
    [build, placeProblem, toast],
  );

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
  const barOpen = buildOpen && !!me;
  useEffect(() => {
    const narrow = window.innerWidth < 720;
    engine.setPadding({ bottom: cardOpen && narrow ? window.innerHeight * 0.56 : barOpen ? 190 : narrow ? 150 : 90, left: cardOpen && !narrow ? 420 : 0 });
    const focus = region ?? (panel ? state.structures.get(panel.id)?.region : null);
    if (focus) engine.flyToRegions([focus], 0.62, 9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, cardOpen, barOpen, region, panel]);

  useEffect(() => {
    const onPick = (pick: MapPick | null) => {
      const { state: s, me: mine, active: on, placing: type, aiming: aim } = live.current;
      if (!on) return;
      setCardError(null);
      if (aim) {
        // Mira do silo: só regiões inimigas no alcance.
        const rid = pick?.kind === 'region' ? pick.id : pick?.kind === 'flag' && pick.id.startsWith('reg:') ? pick.id.slice(4) : null;
        const why = rid ? missileProblem(s, aim.siloId, rid) : 'Toque numa região de outra nação.';
        if (why) return void (audio.play('deny'), toast(why, 'bad'));
        audio.play('select');
        setMissileTarget(rid);
        return;
      }
      if (type) {
        if (pick?.kind === 'region') void place(type, pick.id, pick.at);
        else toast('Toque em terra, dentro do seu território.', 'bad');
        return;
      }
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
  }, [engine, selectPoint, toast, openRegion, place]);

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
          // Conquista de guerra tem o próprio aviso (com as baixas).
          const byWar = [...s.operations.values()].some((o) => o.region === m.region && o.status === 'won');
          if (!byWar) toast(`${REGION_BY_ID[m.region]?.name ?? 'Região'} ocupada. Sua bandeira está lá.`, 'good', nationFlagSrc(nation));
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
            toast(m.structure.level === 1 ? `${def.name} ${FEMININE.has(m.structure.type) ? 'concluída' : 'concluído'} em ${where}.` : `${def.name} de ${where} chegou ao nível ${m.structure.level}.`, 'good');
            const after = mine ? nationStats(s, mine) : null;
            if (after) {
              const before = { ...progressOf(after), structures: after.structures - (m.structure.level === 1 ? 1 : 0) };
              const reached = MILESTONES.find((ms) => ms.kind === 'structures' && milestoneProgress(ms, progressOf(after)).done && !milestoneProgress(ms, before).done);
              if (reached) window.setTimeout(() => toast(`Meta cumprida: ${reached.title.toLowerCase()}.`, 'good'), 900);
            }
          } else audio.play('build');
          return;
        }
        if (m.kind === 'pact') {
          const n = m.news;
          const name = (id: number) => s.nations.get(id)?.name ?? 'Uma nação';
          const flagOf = (id: number) => {
            const x = s.nations.get(id);
            return x ? nationFlagSrc(x) : undefined;
          };
          if (n.kind === 'request') {
            if (n.to === s.me) {
              audio.play('notify');
              setLater((l) => {
                const next = new Set(l);
                next.delete(n.requestId);
                return next;
              });
            } else if (n.from === s.me) toast(`Pedido de aliança enviado a ${name(n.to)}.`, 'info', flagOf(n.to));
          } else if (n.kind === 'declined') {
            if (n.from === s.me) {
              audio.play('deny');
              toast(`${name(n.to)} recusou a aliança${n.reason ? `: ${n.reason}` : ''}.`, 'bad', flagOf(n.to));
            }
          } else if (n.kind === 'accepted') {
            const involved = n.from === s.me || n.to === s.me;
            const other = n.from === s.me ? n.to : n.from;
            if (involved) {
              // Momento especial: a aliança se forma (arco dourado nasce no mapa e a cerimônia aparece).
              pactBorn.current.set(other, now + 350);
              audio.play('pact');
              // A cerimônia e o arco aparecem sobre o mapa livre.
              setSheet(null);
              setRegion(null);
              setCeremony({ a: n.from, b: n.to, id: now });
              const a = START_POINT_BY_ID[s.nations.get(n.from)?.capital ?? '']?.region;
              const b = START_POINT_BY_ID[s.nations.get(n.to)?.capital ?? '']?.region;
              if (a && b) engine.flyToRegions([a, b], 0.5, 8);
            } else if (mine && mine.alliance !== null && s.nations.get(other)?.alliance === mine.alliance && s.nations.get(n.from)?.alliance === mine.alliance) {
              pactBorn.current.set(n.from === s.me ? n.to : n.from, now + 200);
              toast(`${name(n.from)} e ${name(n.to)} agora fazem parte da sua aliança.`, 'good');
            } else toast(`${name(n.from)} e ${name(n.to)} formaram uma aliança.`, 'info', flagOf(n.from));
          } else if (n.kind === 'broken') {
            const meBroke = n.by === s.me;
            const hitMe = s.me !== null && n.formers.includes(s.me);
            if (meBroke || hitMe) {
              audio.play('pactBreak');
              const capOf = (id: number) => START_POINT_BY_ID[s.nations.get(id)?.capital ?? '']?.at ?? null;
              const myCap = s.me !== null ? capOf(s.me) : null;
              for (const f of meBroke ? n.formers : [n.by]) {
                const to = capOf(f);
                if (myCap && to) pactBroken.current.set(f, { from: myCap, to, at: now });
                pactBorn.current.delete(f);
              }
              setSheet(null);
              setCeremony({ a: n.by, b: meBroke ? n.formers[0] : (s.me as number), broken: true, id: now });
            }
            if (meBroke) {
              const lost = Object.entries(n.penalty.resources)
                .filter(([, v]) => (v ?? 0) > 0)
                .map(([r, v]) => `${fmtAmount(v as number)} de ${RESOURCE_INFO[r as Resource].short.toLowerCase()}`)
                .slice(0, 3)
                .join(', ');
              toast(`Aliança rompida. Penalidade: ${n.penalty.troops} tropas${lost ? `, ${lost}` : ''}. Ataques contra ex-aliados liberados em 30 min.`, 'bad');
            } else if (hitMe) toast(`${name(n.by)} rompeu a aliança com você e pagou a penalidade.`, 'bad', flagOf(n.by));
            else toast(`${name(n.by)} rompeu uma aliança.`, 'info', flagOf(n.by));
          } else if (n.kind === 'gift') {
            if (n.to === s.me) {
              audio.play('gift');
              const what = Object.entries(n.resources)
                .map(([r, v]) => `${fmtAmount(v as number)} de ${RESOURCE_INFO[r as Resource].short.toLowerCase()}`)
                .join(', ');
              toast(`${name(n.from)} enviou ${what}.`, 'good', flagOf(n.from));
            } else if (n.from === s.me) {
              audio.play('gift');
              toast(`Recursos enviados a ${name(n.to)}.`, 'good', flagOf(n.to));
            }
          } else if (n.kind === 'help') {
            const o = s.operations.get(n.operationId);
            const rn = o ? (REGION_BY_ID[o.region]?.name ?? 'Região') : 'a batalha';
            if (n.by === s.me) {
              audio.play('war');
              toast(`~${n.troops} tropas suas a caminho de ${rn}.`, 'good');
            } else if (o && (o.defenderId === s.me || o.attackerId === s.me)) {
              audio.play('confirm');
              toast(`${name(n.by)} mandou ~${n.troops} tropas para ${n.side === 'defender' ? 'defender' : 'atacar'} ${rn}.`, 'good', flagOf(n.by));
            }
          }
          return;
        }
        if (m.kind === 'operation') {
          const o = m.operation;
          const rn = REGION_BY_ID[o.region]?.name ?? 'Região';
          const attacker = s.nations.get(o.attackerId);
          const defender = s.nations.get(o.defenderId);
          if (m.started) {
            if (o.attackerId === s.me) {
              // Momento especial: lançar uma operação militar.
              audio.play('war');
              engine.flyToRegions([o.from, o.region], 0.55, 10);
              if (attacker) setBanner({ id: now, title: 'Operação iniciada', text: `Tropas a caminho de ${rn}.`, flag: nationFlagSrc(attacker) });
            } else if (o.defenderId === s.me) {
              audio.play('alarm');
              toast(`Sob ataque! ${attacker?.name ?? 'Uma nação'} invadiu ${rn}. Toque no aviso vermelho para defender.`, 'bad', attacker ? nationFlagSrc(attacker) : undefined);
            }
            return;
          }
          const losses = o.result ? ` Baixas: ${o.result.attackerLosses} suas, ${o.result.defenderLosses} do inimigo.` : '';
          if (o.attackerId === s.me) {
            if (o.status === 'failed') {
              audio.play('defeat');
              toast(`A operação em ${rn} fracassou.${o.result ? ` Baixas: ${o.result.attackerLosses} suas, ${o.result.defenderLosses} de ${defender?.name ?? 'inimigo'}.` : ''}`, 'bad');
            } else window.setTimeout(() => toast(`${rn} conquistada.${losses}`, 'good'), 1800);
          } else if (o.defenderId === s.me) {
            if (o.status === 'failed') {
              audio.play('repelled');
              toast(`Você repeliu o ataque em ${rn}.${o.result ? ` Baixas: ${o.result.defenderLosses} suas, ${o.result.attackerLosses} do atacante.` : ''}`, 'good');
            } else {
              audio.play('defeat');
              toast(`${rn} foi tomada por ${attacker?.name ?? 'outra nação'}.`, 'bad');
            }
          }
          return;
        }
        if (m.kind === 'strike') {
          const x = m.strike;
          const mineStrike = x.attackerId === s.me;
          const target = x.defenderId === s.me;
          const rn = REGION_BY_ID[x.region]?.name ?? 'Região';
          if (m.launched) {
            if (mineStrike || target) {
              // Câmera enquadra o silo e o alvo para o voo inteiro ficar à vista.
              const fromRegion = [...s.structures.values()].find((st) => st.type === 'missile_silo' && distanceKm(st.at, x.from) < 1)?.region;
              engine.flyToRegions(fromRegion ? [fromRegion, x.region] : [x.region], 0.6, 9);
              // Sons no tempo do servidor: preparação, ignição, voo e o desfecho.
              const at = (ms: number) => Math.max(0, ms - serverNow());
              if (mineStrike) audio.play('silo');
              window.setTimeout(() => audio.play('launch'), at(x.flightAt));
              window.setTimeout(() => audio.play('whoosh'), at(x.flightAt + 900));
              window.setTimeout(() => audio.play(x.intercepted ? 'intercept' : 'boom'), at(x.intercepted ? x.interceptAt : x.impactAt));
              if (target) {
                audio.play('alarm');
                const by = s.nations.get(x.attackerId);
                toast(`Míssil a caminho de ${rn}! Lançado por ${by?.name ?? 'outra nação'}.`, 'bad', by ? nationFlagSrc(by) : undefined);
              }
            }
            return;
          }
          if (!mineStrike && !target) return;
          if (x.status === 'intercepted') toast(mineStrike ? `Seu míssil foi interceptado antes de ${rn}.` : `Míssil interceptado sobre ${rn}.`, mineStrike ? 'bad' : 'good');
          else if (x.status === 'impact' && x.result) {
            const st = x.result.structure;
            const what = st ? (st.to === 0 ? `${STRUCTURES[st.type].name} destruída` : `${STRUCTURES[st.type].name} caiu para o nível ${st.to}`) : 'nenhuma construção atingida';
            toast(
              `${mineStrike ? 'Impacto em' : 'Míssil atingiu'} ${rn}: ${what}; ${x.result.troopsLost} ${x.result.troopsLost === 1 ? 'tropa perdida' : 'tropas perdidas'}${x.result.engaged ? '; tropas em combate atingidas' : ''}.`,
              mineStrike ? 'good' : 'bad',
            );
          }
          return;
        }
        if (m.kind === 'military') {
          if (m.done.kind === 'training') {
            audio.play('drill');
            const d = UNITS[m.done.unit];
            toast(`${m.done.amount} ${m.done.amount === 1 ? 'unidade' : 'unidades'} de ${d.short.toLowerCase()} prontas. Poder militar: ${(s.military?.power.power ?? 0).toLocaleString('pt-BR')}.`, 'good');
          } else {
            audio.play('built');
            const t = TECHS[m.done.tech];
            toast(`Pesquisa concluída: ${t.name}, nível ${m.done.level}.${t.unlocks && m.done.level === 1 ? ` ${UNITS[t.unlocks].short} liberados.` : ''}`, 'good');
          }
          return;
        }
        if (m.kind === 'rail') {
          // A obra que completa o trecho chega no mesmo instante: a linha começa depois do selo saltar.
          railBorn.current.set(linkKey(m.link), now + 450);
          const net = worldNetwork(s);
          const a = net.nodes.get(m.link.a);
          const b = net.nodes.get(m.link.b);
          if (!a || !b || (a.nation !== s.me && b.nation !== s.me)) return;
          window.setTimeout(() => audio.play('rail'), 500);
          const pct = Math.round((m.link.ally ? LOGISTICS.allyBonus : LOGISTICS.linkBonus + LOGISTICS.qualityBonus * (m.link.quality - 1)) * 100);
          const text = m.link.ally
            ? `Conexão com aliado: ${STRUCTURES[a.type].name} ↔ ${STRUCTURES[b.type].name}, +${pct}% de produção.`
            : `Ferrovia ligou ${STRUCTURES[a.type].name} e ${STRUCTURES[b.type].name}: +${pct}% de produção nas duas.`;
          window.setTimeout(() => toast(text, 'good'), 1200);
          if (!m.link.ally && mine) {
            const after = nationStats(s, mine);
            const before = { ...progressOf(after), links: after.links - 1 };
            const reached = MILESTONES.find((ms) => ms.kind === 'links' && milestoneProgress(ms, progressOf(after)).done && !milestoneProgress(ms, before).done);
            if (reached) window.setTimeout(() => toast(`Meta cumprida: ${reached.title.toLowerCase()}.`, 'good'), 2200);
          }
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
    void run(async () => (await upgrade(panel.id), setPanel(null)));
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
      return void toast(reach ? 'Não há mais regiões alcançáveis por terra. Atravessar o mar exigirá operações navais, que ainda não estão disponíveis.' : 'Todas as regiões vizinhas já têm dono ou estão sendo ocupadas.');
    }
    engine.flyToRegions([...stats.regions, ...targets], 0.62, 10);
    toast(`${targets.length} ${targets.length === 1 ? 'região vizinha livre' : 'regiões vizinhas livres'}. Toque em uma área tracejada.`);
  };

  // ---------- diplomacia (Fase F) ----------
  const pactState = (n: NationView): 'none' | 'sent' | 'received' | 'other-alliance' | 'blocked' => {
    const d = state.diplomacy;
    const now = serverNow();
    if (d?.blocks.some((b) => b.nationId === n.id && b.until > now)) return 'blocked';
    if (d?.requests.some((r) => r.toId === state.me && r.fromId === n.id && r.expiresAt > now)) return 'received';
    if (d?.requests.some((r) => r.fromId === state.me && r.toId === n.id && r.expiresAt > now)) return 'sent';
    if (me && me.alliance !== null && n.alliance !== null && n.alliance !== me.alliance) return 'other-alliance';
    return 'none';
  };
  const requestPact = (id: number) =>
    void run(async () => {
      audio.play('select');
      await pact.request(id);
    });
  const answerPact = (requestId: number, accept: boolean) =>
    void run(async () => {
      await pact.answer(requestId, accept);
      if (!accept) audio.play('tap');
    });

  const goal = stats ? objective(stats) : null;
  const regionDef = region ? REGION_BY_ID[region] : null;
  const enemyOwner = regionDef && me && state.control.has(regionDef.id) && state.control.get(regionDef.id) !== me.id ? (state.nations.get(state.control.get(regionDef.id)!) ?? null) : null;
  const enemyCheck = enemyOwner && regionDef ? attackCheck(state, regionDef.id) : null;
  const panelStructure = panel ? (state.structures.get(panel.id) ?? null) : null;
  const panelType = panelStructure?.type ?? null;
  const panelRegion = panelStructure?.region ?? null;
  const panelRail = useMemo(() => {
    if (!panelStructure || panelStructure.level < 1) return null;
    const net = worldNetwork(state);
    const mine = net.links.filter((l) => l.a === panelStructure.id || l.b === panelStructure.id);
    return { links: mine.filter((l) => !l.ally).length, ally: mine.filter((l) => l.ally).length, bonus: net.bonus.get(panelStructure.id) ?? 0 };
  }, [state, panelStructure]);
  const sameType = (t: StructureType) => myStructures.filter((s) => s.type === t).length;
  const arenaMine = arena && stats ? stats.regions.filter((r) => arenaSet!.has(r)).length : 0;
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
        {quick && state.world.startedAt && !state.world.finishedAt && <MatchClock startedAt={state.world.startedAt} />}
      </div>

      {me && quick && arena && <ObjectiveChip title={`Conquiste as ${arena.length} regiões da arena`} value={arenaMine} target={arena.length} />}
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
          {buildOpen && !region && !panel && (
            <BuildBar
              economy={state.economy}
              selected={placing}
              sameType={sameType}
              input={econInput}
              mode={state.world.mode}
              queue={queue}
              onSelect={(t) => {
                audio.play(t ? 'select' : 'tap');
                setPlacing(t);
              }}
              onClose={() => {
                audio.play('tap');
                setPlacing(null);
                setBuildOpen(false);
              }}
            />
          )}
          {me && myOps.length > 0 && !buildOpen && !aiming && <OperationCapsules ops={myOps} me={me.id} allies={allies} onOpen={(id) => (audio.play('tap'), setOpOpen(id))} />}
          {aiming && (
            <div className="ku-aim" data-testid="missile-aiming">
              <span>Toque numa região inimiga dentro do círculo de alcance.</span>
              <button
                type="button"
                className="ku-btn"
                onClick={() => {
                  setAiming(null);
                  setMissileTarget(null);
                }}
              >
                Cancelar
              </button>
            </div>
          )}
          {myOccupation && !buildOpen && (
            <OccupationCapsule
              name={REGION_BY_ID[myOccupation.region]?.name ?? 'Região'}
              startedAt={myOccupation.startedAt}
              endsAt={myOccupation.endsAt}
              onFocus={() => engine.flyToRegions([myOccupation.region, myOccupation.from], 0.5, 12)}
            />
          )}
          {!region && !panel && !buildOpen && !aiming && (
            <Dock
              targets={targets.length}
              occupying={!!myOccupation}
              building={queue}
              onExpand={showTargets}
              onCapital={goCapital}
              onBuild={() => {
                audio.play('tap');
                setBuildOpen(true);
              }}
              onRanking={() => setSheet('ranking')}
              training={state.military?.training.length ?? 0}
              pacts={received.length}
              onDiplomacy={() => {
                audio.play('tap');
                setCardError(null);
                setSheet('diplomacy');
              }}
              onArmy={() => {
                audio.play('tap');
                setCardError(null);
                setSheet('army');
              }}
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
          economy={state.economy}
          outside={!!arenaSet && !arenaSet.has(regionDef.id)}
          busy={busy}
          error={cardError}
          onOccupy={() => occupy(regionDef.id)}
          onClose={() => setRegion(null)}
        >
          {enemyOwner && allies.has(enemyOwner.id) && (
            <div className="ku-enemy ally" data-testid="ally-actions">
              <p className="ku-pact-tag">
                <PactMark size={15} /> Território aliado · poder {enemyOwner.power.toLocaleString('pt-BR')}
              </p>
              <div className="ku-row-actions">
                <button type="button" className="ku-btn" onClick={() => (audio.play('tap'), engine.flyToRegions(regionsOf(state, enemyOwner.id), 0.5, 10))}>
                  Ver território
                </button>
                <button type="button" className="ku-btn" onClick={() => (audio.play('tap'), setCardError(null), setGiftTo(enemyOwner.id))} data-testid="ally-gift">
                  Enviar recursos
                </button>
                <button type="button" className="ku-cta small" onClick={() => (audio.play('tap'), setRegion(null), setSheet('diplomacy'))}>
                  Diplomacia
                </button>
              </div>
            </div>
          )}
          {enemyOwner && !allies.has(enemyOwner.id) && (
            <EnemyActions
              pact={pactState(enemyOwner)}
              onPact={() => requestPact(enemyOwner.id)}
              owner={enemyOwner}
              ownerRegions={regionsOf(state, enemyOwner.id).length}
              capital={START_POINT_BY_ID[enemyOwner.capital]?.region === regionDef.id}
              problem={enemyCheck?.problem ?? null}
              naval={!!enemyCheck?.origin?.naval}
              canStrike={!!mySilo && !missileProblem(state, mySilo.id, regionDef.id)}
              onStrike={() => {
                if (!mySilo) return;
                audio.play('select');
                setRegion(null);
                setAiming({ siloId: mySilo.id });
                setMissileTarget(regionDef.id);
              }}
              onAttack={() => {
                audio.play('select');
                setCardError(null);
                setAttackOn(regionDef.id);
              }}
              onView={() => {
                audio.play('tap');
                engine.flyToRegions(regionsOf(state, enemyOwner.id), 0.5, 10);
              }}
            />
          )}
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
            <button
              type="button"
              className="ku-btn"
              onClick={() => {
                audio.play('tap');
                setRegion(null);
                setBuildOpen(true);
              }}
              data-testid="build-here"
            >
              Construir nesta região
            </button>
          )}
        </RegionCard>
      )}

      {panel && panelType && panelRegion && (
        <StructurePanel
          type={panelType}
          region={panelRegion}
          structure={panelStructure}
          own={panelStructure?.nationId === state.me}
          ownerName={panelStructure ? state.nations.get(panelStructure.nationId)?.name : undefined}
          input={econInput}
          mode={state.world.mode}
          economy={state.economy}
          sameType={sameType(panelType)}
          rail={panelRail}
          problem={queue >= ECONOMY.buildQueue && !panelStructure?.building ? `Já há ${ECONOMY.buildQueue} obras em andamento. Aguarde uma terminar.` : null}
          busy={busy || !!state.world.finishedAt}
          error={cardError}
          onAct={actOnPanel}
          onClose={() => {
            setPanel(null);
            setCardError(null);
          }}
        >
          {panelStructure?.type === 'missile_silo' && panelStructure.nationId === state.me && panelStructure.level > 0 && (
            <div className="ku-silo" data-testid="silo-actions">
              <p>
                Lança direto, pagando cada lançamento. Alcance: míssil <b>{missileRange(panelStructure.level, 'missile').toLocaleString('pt-BR')} km</b>, bomba{' '}
                <b>{missileRange(panelStructure.level, 'bomb').toLocaleString('pt-BR')} km</b>.
              </p>
              {[...state.strikes.values()].some((x) => x.status === 'flying' && x.attackerId === state.me && distanceKm(x.from, panelStructure.at) < 1) ? (
                <p className="ku-note">Míssil em voo. O silo recarrega quando ele chegar.</p>
              ) : (
                <button
                  type="button"
                  className="ku-cta"
                  onClick={() => {
                    audio.play('select');
                    setPanel(null);
                    setAiming({ siloId: panelStructure.id });
                    setMissileTarget(null);
                  }}
                  data-testid="silo-aim"
                >
                  Escolher alvo
                </button>
              )}
            </div>
          )}
        </StructurePanel>
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
      {attackOn && me && state.military && state.nations.get(state.control.get(attackOn) ?? -1) && (() => {
        const owner = state.nations.get(state.control.get(attackOn)!)!;
        const check = attackCheck(state, attackOn);
        return (
          <AttackSheet
            region={attackOn}
            owner={owner}
            ownerRegions={regionsOf(state, owner.id).length}
            me={me}
            home={state.military.army}
            research={state.military.research}
            origin={check.origin ?? { from: attackOn, naval: false }}
            mode={state.world.mode}
            busy={busy}
            error={cardError ?? check.problem}
            onConfirm={(percent) =>
              void run(async () => {
                await attack(attackOn, percent);
                setAttackOn(null);
                setRegion(null);
              })
            }
            onClose={() => setAttackOn(null)}
          />
        );
      })()}
      {opOpen !== null && state.operations.get(opOpen) && (() => {
        const o = state.operations.get(opOpen)!;
        const counter = me && o.defenderId === me.id ? attackCheck(state, o.from) : null;
        const silo = mySilo;
        return (
          <OperationSheet
            op={o}
            attacker={state.nations.get(o.attackerId)}
            defender={state.nations.get(o.defenderId)}
            me={state.me}
            role={o.defenderId === state.me ? 'defender' : o.attackerId === state.me ? null : allies.has(o.defenderId) ? 'ally-defender' : allies.has(o.attackerId) ? 'ally-attacker' : null}
            allies={o.allies.flatMap((a) => {
              const n = state.nations.get(a.id);
              return n ? [{ nation: n, side: a.side }] : [];
            })}
            home={state.military?.army ?? {}}
            canCounter={!!counter && !counter.problem}
            canMissile={!!silo && !missileProblem(state, silo.id, o.from)}
            busy={busy}
            error={cardError}
            onReinforce={(percent) => void run(async () => (await reinforce(o.id, percent), audio.play('war')))}
            onCounter={() => {
              setOpOpen(null);
              setAttackOn(o.from);
            }}
            onMissile={() => {
              if (!silo) return;
              setOpOpen(null);
              setAiming({ siloId: silo.id });
              setMissileTarget(o.from);
            }}
            onFocus={() => {
              setOpOpen(null);
              engine.flyToRegions([o.from, o.region], 0.55, 10);
            }}
            onClose={() => setOpOpen(null)}
          />
        );
      })()}
      {aiming && missileTarget && state.nations.get(state.control.get(missileTarget) ?? -1) && siloOf(state, aiming.siloId) && (
        <MissileConfirm
          from={siloOf(state, aiming.siloId)!.silo.at}
          region={missileTarget}
          owner={state.nations.get(state.control.get(missileTarget)!)!}
          ownerStructures={structuresOf(state, state.control.get(missileTarget)!).filter((x) => x.level > 0)}
          siloLevel={siloOf(state, aiming.siloId)!.silo.level}
          mode={state.world.mode}
          economy={state.economy}
          busy={busy}
          error={cardError}
          onConfirm={(weapon) =>
            void run(async () => {
              await launch(aiming.siloId, missileTarget, weapon);
              setAiming(null);
              setMissileTarget(null);
            })
          }
          onCancel={() => setMissileTarget(null)}
        />
      )}
      {sheet === 'army' && state.military && state.economy && (
        <ArmySheet
          military={state.military}
          economy={state.economy}
          structures={myStructures.filter((x) => x.level > 0)}
          mode={state.world.mode}
          busy={busy}
          error={cardError}
          onTrain={(unit, amount) => void run(async () => (await train(unit, amount), audio.play('build')))}
          onResearch={(tech) => void run(async () => (await research(tech), audio.play('build')))}
          onBuild={(type) => {
            setSheet(null);
            setBuildOpen(true);
            setPlacing(type);
            toast(`Toque no seu território para construir: ${STRUCTURES[type].name.toLowerCase()}.`);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'diplomacy' && me && (
        <DiplomacySheet
          me={me}
          nations={state.nations}
          regionsOf={(id) => regionsOf(state, id).length}
          diplomacy={state.diplomacy}
          economy={state.economy}
          home={state.military?.army ?? {}}
          busy={busy}
          error={cardError}
          onRequest={requestPact}
          onAnswer={answerPact}
          onCancel={(id) => void run(async () => void (await pact.cancel(id)))}
          onGift={(n) => (audio.play('tap'), setCardError(null), setGiftTo(n.id))}
          onView={(n) => {
            setSheet(null);
            engine.flyToRegions(regionsOf(state, n.id), 0.5, 10);
          }}
          onBreak={() => void run(async () => (await pact.breakAlliance(), setSheet(null)))}
          onClose={() => setSheet(null)}
        />
      )}
      {giftTo !== null && state.nations.get(giftTo) && (
        <GiftSheet
          ally={state.nations.get(giftTo)!}
          economy={state.economy}
          busy={busy}
          error={cardError}
          onSend={(r) => void run(async () => (await pact.gift(giftTo, r), setGiftTo(null)))}
          onClose={() => setGiftTo(null)}
        />
      )}
      {me && active && !sheet && giftTo === null && !ceremony && (() => {
        const r = received.find((x) => !later.has(x.id));
        const from = r ? state.nations.get(r.fromId) : null;
        if (!r || !from) return null;
        return (
          <PactPrompt
            from={from}
            expiresAt={r.expiresAt}
            busy={busy}
            onAccept={() => answerPact(r.id, true)}
            onDecline={() => answerPact(r.id, false)}
            onLater={() => setLater((l) => new Set(l).add(r.id))}
          />
        );
      })()}
      {ceremony && state.nations.get(ceremony.a) && state.nations.get(ceremony.b) && (
        <PactCeremony key={ceremony.id} a={state.nations.get(ceremony.a)!} b={state.nations.get(ceremony.b)!} broken={ceremony.broken} onDone={closeCeremony} />
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

