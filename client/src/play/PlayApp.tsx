import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameMode } from '../../../shared/play/rules';
import { START_POINTS } from '../../../shared/world/regions';
import { api, ApiError, type Me, type Meta, serverNow, setWorld } from '../api';
import { type RegionTopology, WorldMapEngine } from '../worldmap/engine';
import { audio } from './audio';
import { type IdentityDraft, loadDraft, saveDraft } from './identity';
import { MapStage } from './MapStage';
import { IdentityScreen, MatchEnd, ModeSelect, TitleScreen } from './screens';
import { usePlayWorld, type WorldMoment, type WorldState } from './store';

type Stage = 'title' | 'mode' | 'identity' | 'map';

interface Props {
  meta: Meta;
  me: Me | null;
  /** Garante conta e lugar na campanha (cria uma conta de teste se preciso) e recarrega `me`. */
  enter: () => Promise<void>;
  reloadMe: () => Promise<void>;
  onLoginForm: () => void;
  onLogout: () => void;
}

/**
 * Fluxo principal do jogo: tela inicial → modo → identidade → mapa. O mapa fica montado o tempo
 * todo atrás das telas; elas só se sobrepõem a ele. Cada mundo (campanha ou partida rápida) é
 * lido e sincronizado separadamente.
 */
export function PlayApp({ me, enter, reloadMe, onLoginForm, onLogout }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<WorldMapEngine | null>(null);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<Stage>('title');
  const [busy, setBusy] = useState(false);
  const [modeBusy, setModeBusy] = useState<GameMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [worldId, setWorldId] = useState<number | null>(null);
  /** Mundo para onde a escolha de modo está levando (null = campanha), até o estado dele chegar. */
  const [routing, setRouting] = useState<{ to: number | null } | null>(null);
  const [draft, setDraftState] = useState<IdentityDraft>(loadDraft);
  const listeners = useRef(new Set<(m: WorldMoment, s: WorldState) => void>());
  const seat = me?.worlds.find((w) => (worldId === null ? w.mode === 'campaign' : w.id === worldId)) ?? null;

  const world = usePlayWorld(worldId, seat?.governorId ?? null, (m, s) => {
    for (const fn of listeners.current) fn(m, s);
  });
  const subscribe = useCallback((fn: (m: WorldMoment, s: WorldState) => void) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  const setDraft = useCallback((d: IdentityDraft) => {
    setDraftState(d);
    saveDraft(d);
  }, []);

  // Motor do mapa: criado uma vez, independente das telas e dos mundos.
  useEffect(() => {
    const e = new WorldMapEngine(host.current!, { now: serverNow, neutralFill: '#3a4a6b', maxZoom: 40 });
    e.setLayerVisible('cities', false);
    setEngine(e);
    // Gancho para testes automatizados e depuração; não é API de jogo.
    (window as unknown as { __kuMap?: unknown }).__kuMap = {
      project: (lon: number, lat: number) => {
        const [x, y] = e.projection.project(lon, lat);
        const r = e.canvas.getBoundingClientRect();
        const v = e.viewState();
        return [(x - v.x) * v.k + r.width / 2 + r.left, (y - v.y) * v.k + r.height / 2 + r.top];
      },
      get zoom() {
        return e.zoom;
      },
    };
    return () => {
      setEngine(null);
      e.destroy();
    };
  }, []);

  useEffect(() => {
    if (!engine) return;
    let cancelled = false;
    setMapState('loading');
    fetch('/world/regions.topo.json')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<RegionTopology>;
      })
      .then((topo) => {
        if (cancelled) return;
        engine.setTopology(topo);
        setMapState('ready');
      })
      .catch(() => !cancelled && setMapState('error'));
    return () => {
      cancelled = true;
    };
  }, [engine, attempt]);

  // Sem estado do mundo (visitante ou trocando de mundo): o mapa neutro com todos os pontos.
  useEffect(() => {
    if (!engine || world.state) return;
    engine.setArena(null);
    engine.setPoints(
      START_POINTS.map((p) => ({ id: p.id, lon: p.at[0], lat: p.at[1], kind: p.kind, state: 'free' as const, label: p.name })),
      true,
    );
  }, [engine, world.state]);

  // Depois de escolher o modo: quem já tem nação naquele mundo vai direto ao mapa.
  useEffect(() => {
    const s = world.state;
    if (!routing || !s) return;
    // Ignora o estado do mundo anterior, que ainda pode estar na tela durante a troca.
    if (routing.to === null ? s.world.mode !== 'campaign' : s.world.id !== routing.to) return;
    setRouting(null);
    setModeBusy(null);
    setStage(world.state.me !== null ? 'map' : 'identity');
  }, [routing, world.state]);

  // Saiu da conta: volta para a tela inicial.
  useEffect(() => {
    if (me) return;
    setWorldId(null);
    setWorld(null);
    setStage('title');
    audio.music(false);
  }, [me]);

  const start = async () => {
    audio.unlock();
    audio.play('confirm');
    audio.music(true);
    setBusy(true);
    setError(null);
    try {
      await enter();
      setStage('mode');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const go = (id: number | null) => {
    setWorld(id);
    setWorldId(id);
    setRouting({ to: id });
  };

  const pickMode = async (mode: GameMode) => {
    setError(null);
    setModeBusy(mode);
    if (mode === 'campaign') return go(null);
    try {
      setWorld(null);
      const r = await api.post<{ worldId: number }>('/quick/start');
      await reloadMe();
      go(r.worldId);
    } catch (e) {
      setModeBusy(null);
      setStage('mode');
      setError(e instanceof ApiError ? e.message : 'Não foi possível criar a partida.');
    }
  };

  const leave = async () => {
    await api.post('/quick/leave').catch(() => {});
    await world.refresh();
  };

  const found = useCallback(
    (pointId: string) => world.found({ pointId, name: draft.name, color: draft.color, flag: draft.flag, flagImage: draft.image?.base64 ?? null }),
    [world, draft],
  );

  const state = world.state;
  const finished = state?.world.mode === 'quick' && state.world.finishedAt !== null;

  return (
    <div className={`ku-root stage-${stage}`} data-testid="play-root" data-stage={stage} data-map={mapState} data-world={state?.world.mode ?? ''}>
      <div ref={host} className="ku-map" />
      {mapState === 'error' && (
        <div className="ku-map-error" role="alert">
          Não foi possível carregar o mapa.
          <button type="button" className="ku-btn" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      )}
      {(stage !== 'map' || finished) && <div className="ku-veil" />}

      {engine && state && mapState === 'ready' && (
        <MapStage
          key={state.world.id}
          engine={engine}
          state={state}
          status={world.status}
          active={stage === 'map' && !finished}
          draft={draft}
          onDraft={setDraft}
          username={me?.username ?? ''}
          subscribe={subscribe}
          found={found}
          expand={world.expand}
          build={world.build}
          upgrade={world.upgrade}
          onEditIdentity={() => setStage('identity')}
          onSwitchMode={() => setStage('mode')}
          onLeave={leave}
          onLogout={onLogout}
        />
      )}

      {stage === 'title' && <TitleScreen busy={busy} error={error} returning={!!me?.worlds.length} onStart={() => void start()} onLogin={onLoginForm} />}
      {stage === 'mode' && (
        <ModeSelect
          seats={me?.worlds ?? []}
          busy={modeBusy}
          error={error ?? (routing ? world.error : null)}
          onPick={(m) => void pickMode(m)}
          onBack={() => setStage('title')}
        />
      )}
      {stage === 'identity' && <IdentityScreen draft={draft} onChange={setDraft} onDone={() => setStage('map')} onBack={() => setStage(state?.me != null ? 'map' : 'mode')} />}
      {stage === 'map' && finished && state && (
        <MatchEnd world={state.world} me={state.me ?? seat?.governorId ?? null} nations={state.nations} onAgain={() => void pickMode('quick')} onCampaign={() => void pickMode('campaign')} />
      )}
    </div>
  );
}
