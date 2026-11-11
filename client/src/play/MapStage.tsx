import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { expansionSeconds, MILESTONES, milestoneProgress } from '../../../shared/play/rules';
import type { NationView } from '../../../shared/play/types';
import { COUNTRIES, COUNTRY_BY_CODE } from '../../../shared/world';
import { countryOccupation, dominatedCountries, landmassSize, REGION_BY_ID, REGIONS_BY_COUNTRY, START_POINT_BY_ID, START_POINTS, type StartPoint } from '../../../shared/world/regions';
import { api, ApiError, serverNow } from '../api';
import { useTick } from '../hooks';
import type { RealtimeStatus } from '../realtime';
import type { MapFill, MapFlag, MapLabel, MapPick, MapPoint, WorldMapEngine } from '../worldmap/engine';
import { audio } from './audio';
import { PointCard, RegionCard } from './cards';
import { Banner, type BannerData, Dock, IdentityPill, ObjectiveChip, OccupationCapsule, StatChips, type Toast, Toasts, ZoomButtons } from './hud';
import { draftFlagSrc, flagCanvasImage, type IdentityDraft, nationFlagSrc } from './identity';
import { fmtArea, myTargets, nationStats, objective, ranking } from './model';
import { NationSheet, RankingSheet, SettingsSheet } from './sheets';
import { regionsOf, type WorldMoment, type WorldState } from './store';

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
  onEditIdentity: () => void;
  onLogout: () => void;
}

type Sheet = 'nation' | 'ranking' | 'settings' | null;
interface Bloom {
  color: string;
  origin: [number, number];
  startAt: number;
  endAt: number;
}

const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * O jogo sobre o mapa: sincroniza o motor com o estado do servidor, anima os acontecimentos e
 * mostra o HUD. Não decide regra nenhuma: tudo que muda o mundo passa por `found` e `expand`.
 */
export function MapStage({ engine, state, status, active, draft, onDraft, username, subscribe, found, expand, onEditIdentity, onLogout }: Props) {
  const me = state.me !== null ? (state.nations.get(state.me) ?? null) : null;
  const [point, setPoint] = useState<StartPoint | null>(null);
  const [region, setRegion] = useState<string | null>(null);
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
  const toastId = useRef(0);
  const live = useRef({ state, me, active });
  live.current = { state, me, active };

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info', flag?: string) => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, text, tone, flag }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);

  const stats = useMemo(() => (me ? nationStats(state, me) : null), [state, me]);
  const myOccupation = me ? (state.occupations.find((o) => o.nationId === me.id) ?? null) : null;
  const targets = useMemo(() => (stats && !myOccupation ? myTargets(state, stats.regions) : []), [state, stats, myOccupation]);
  const board = useMemo(() => ranking(state), [state]);
  useTick(myOccupation ? 250 : 60000);

  // ---------- motor: dados estáveis ----------

  useEffect(() => {
    engine.setLabels(LABELS);
    engine.setLayerVisible('graticule', true);
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
    const narrow = window.innerWidth < 720;
    engine.setPadding({ top: 64, bottom: narrow ? 150 : 90, left: 0, right: 0 });
  }, [engine]);

  // ---------- motor: territórios, ocupações, pontos, bandeiras ----------

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
    const points: MapPoint[] = START_POINTS.map((p) => ({
      id: p.id,
      lon: p.at[0],
      lat: p.at[1],
      kind: p.kind,
      label: p.name,
      state: state.control.has(p.region) || busyRegions.has(p.region) ? 'taken' : point?.id === p.id ? 'selected' : 'free',
    }));
    engine.setPoints(points, true);
  }, [engine, state, me, point]);

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

  useEffect(() => {
    const onPick = (pick: MapPick | null) => {
      const { state: s, me: mine, active: on } = live.current;
      if (!on) return;
      setCardError(null);
      if (!pick) {
        setRegion(null);
        setPoint(null);
        return;
      }
      if (pick.kind === 'flag') {
        const [kind, id] = pick.id.split(':');
        if (kind === 'reg') return void (audio.play('tap'), setRegion(id));
        if (kind === 'cap') {
          const nation = s.nations.get(Number(id));
          const cap = nation && START_POINT_BY_ID[nation.capital];
          if (cap) return void (audio.play('tap'), setRegion(cap.region));
        }
        return;
      }
      if (!mine) {
        const taken = (rid: string) => s.control.has(rid) || s.occupations.some((o) => o.region === rid);
        if (pick.kind === 'point') {
          const p = START_POINT_BY_ID[pick.id];
          if (p && !taken(p.region)) selectPoint(p);
          return;
        }
        if (pick.kind === 'region') {
          const p = START_POINTS.find((sp) => sp.region === pick.id);
          if (p && !taken(p.region)) selectPoint(p);
          else {
            setPoint(null);
            const owner = s.control.get(pick.id);
            toast(owner !== undefined ? `${REGION_BY_ID[pick.id]?.name ?? 'Esta região'} já pertence a ${s.nations.get(owner)?.name ?? 'outra nação'}.` : 'Toque em um ponto luminoso para fundar sua nação ali.');
          }
        }
        return;
      }
      if (pick.kind === 'region') {
        audio.play('tap');
        setRegion(pick.id);
      }
    };
    return engine.on('select', onPick);
  }, [engine, selectPoint, toast]);

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
          } else {
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
          const before = after.regions.length - 1;
          const reached = MILESTONES.find((ms) => ms.kind === 'regions' && ms.target === after.regions.length && before < ms.target);
          if (reached) window.setTimeout(() => toast(`Meta cumprida: ${reached.title.toLowerCase()}.`, 'good'), 900);
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

  // Subida de nível: anunciada quando o nível derivado do território muda.
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
    engine.flyToRegions(stats.regions, 0.5, 10);
  }, [engine, stats, blooms]);

  // ---------- ações ----------

  const confirmPoint = async () => {
    if (!point || busy) return;
    setBusy(true);
    setCardError(null);
    try {
      await found(point.id);
      setPoint(null);
    } catch (e) {
      audio.play('deny');
      setCardError(e instanceof ApiError ? e.message : 'Não foi possível fundar a nação. Tente de novo.');
      if (e instanceof ApiError && e.code === 'color_taken') setBlocked((b) => [...new Set([...b, draft.color])]);
    } finally {
      setBusy(false);
    }
  };

  const occupy = async (rid: string) => {
    if (busy) return;
    setBusy(true);
    setCardError(null);
    try {
      await expand(rid);
      setRegion(null);
    } catch (e) {
      audio.play('deny');
      setCardError(e instanceof ApiError ? e.message : 'Não foi possível iniciar a ocupação.');
    } finally {
      setBusy(false);
    }
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
    if (!targets.length) return void toast(landmassSize(stats.regions[0]) <= stats.regions.length ? 'Não há mais regiões alcançáveis por terra. A travessia marítima depende da Marinha, que ainda não existe.' : 'Todas as regiões vizinhas já têm dono ou estão sendo ocupadas.');
    engine.flyToRegions([...stats.regions, ...targets], 0.62, 10);
    toast(`${targets.length} ${targets.length === 1 ? 'região vizinha livre' : 'regiões vizinhas livres'}. Toque em uma área tracejada.`);
  };

  const goal = stats ? objective(stats) : null;
  const regionDef = region ? REGION_BY_ID[region] : null;
  if (!active) return null;

  return (
    <div className="ku-stage" style={{ ['--nation' as string]: me?.color ?? draft.color }} data-testid="map-stage" data-phase={me ? 'play' : 'select'}>
      <div className="ku-top">
        {me && stats ? (
          <IdentityPill nation={me} level={stats.level} onOpen={() => setSheet('nation')} />
        ) : (
          <button type="button" className="ku-pill ku-pill-draft" onClick={onEditIdentity} data-testid="edit-identity">
            <img src={draftFlagSrc(draft)} alt="" />
            <span>
              <b>{draft.name || 'Sua nação'}</b>
              <small>Trocar bandeira e cor</small>
            </span>
          </button>
        )}
        <StatChips stats={stats} nations={state.nations.size} status={status} onRanking={() => setSheet('ranking')} onSettings={() => setSheet('settings')} />
      </div>

      {me && goal && <ObjectiveChip title={goal.milestone.title} value={goal.value} target={goal.milestone.target} />}
      {!me && !point && (
        <p className="ku-guide" data-testid="guide">
          Escolha um ponto luminoso para fundar sua nação
        </p>
      )}

      <Toasts toasts={toasts} />
      {banner && <Banner key={banner.id} data={banner} />}
      <ZoomButtons onIn={() => engine.zoomBy(1.7)} onOut={() => engine.zoomBy(1 / 1.7)} onHome={() => engine.home()} />

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
          {!region && <Dock targets={targets.length} occupying={!!myOccupation} onExpand={showTargets} onCapital={goCapital} onRanking={() => setSheet('ranking')} />}
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
          onConfirm={() => void confirmPoint()}
          onClose={() => setPoint(null)}
        />
      )}

      {me && stats && regionDef && (
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
          busy={busy}
          error={cardError}
          onOccupy={() => void occupy(regionDef.id)}
          onClose={() => setRegion(null)}
        />
      )}

      {sheet === 'nation' && me && stats && (
        <NationSheet
          stats={stats}
          milestones={MILESTONES.map((ms) => ({ milestone: ms, ...milestoneProgress(ms, stats.regions.length, stats.countries.length) }))}
          area={fmtArea(stats.area)}
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
      {sheet === 'settings' && <SettingsSheet username={username} reduced={reduced} onReduced={setReduced} onLogout={onLogout} onClose={() => setSheet(null)} />}
    </div>
  );
}
