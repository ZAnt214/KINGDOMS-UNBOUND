import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameMode } from '../../../shared/play/rules';
import { START_POINTS } from '../../../shared/world/regions';
import { type Me, type Meta, serverNow } from '../api';
import { type RegionTopology, WorldMapEngine } from '../worldmap/engine';
import { audio } from './audio';
import { type IdentityDraft, loadDraft, saveDraft } from './identity';
import { MapStage } from './MapStage';
import { IdentityScreen, ModeSelect, TitleScreen } from './screens';
import { usePlayWorld, type WorldMoment, type WorldState } from './store';
import './play.css';

type Stage = 'title' | 'mode' | 'identity' | 'map';

interface Props {
  meta: Meta;
  me: Me | null;
  /** Garante conta e governador (cria uma conta de teste se preciso) e recarrega `me`. */
  enter: () => Promise<void>;
  onLoginForm: () => void;
  onLogout: () => void;
}

/**
 * Fluxo principal do jogo: tela inicial → modo → identidade → mapa. O mapa fica montado o tempo
 * todo atrás das telas; elas só se sobrepõem a ele.
 */
export function PlayApp({ meta, me, enter, onLoginForm, onLogout }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<WorldMapEngine | null>(null);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<Stage>('title');
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraftState] = useState<IdentityDraft>(loadDraft);
  const listeners = useRef(new Set<(m: WorldMoment, s: WorldState) => void>());
  const governor = me?.governor ?? null;

  const world = usePlayWorld(governor?.id ?? null, (m, s) => {
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

  // Motor do mapa: criado uma vez, independente das telas.
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

  // Sem estado do mundo (visitante): o mapa neutro com todos os pontos de partida.
  useEffect(() => {
    if (!engine || world.state) return;
    engine.setPoints(
      START_POINTS.map((p) => ({ id: p.id, lon: p.at[0], lat: p.at[1], kind: p.kind, state: 'free' as const, label: p.name })),
      true,
    );
  }, [engine, world.state]);

  // Depois do toque em começar: quem já tem nação vai direto ao mapa; quem não tem escolhe o modo.
  const routed = useRef(false);
  useEffect(() => {
    if (!started || routed.current || !world.state) return;
    routed.current = true;
    setStage(world.state.me !== null ? 'map' : 'mode');
  }, [started, world.state]);

  // Saiu da conta: volta para a tela inicial.
  useEffect(() => {
    if (me) return;
    routed.current = false;
    setStarted(false);
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
      if (!governor) await enter();
      setStarted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const found = useCallback(
    (pointId: string) => world.found({ pointId, name: draft.name, color: draft.color, flag: draft.flag, flagImage: draft.image?.base64 ?? null }),
    [world, draft],
  );

  const waiting = started && !world.state;
  const kingdom = meta.kingdoms.find((k) => k.id === governor?.kingdomId);

  return (
    <div className={`ku-root stage-${stage}`} data-testid="play-root" data-stage={stage} data-map={mapState}>
      <div ref={host} className="ku-map" />
      {mapState === 'error' && (
        <div className="ku-map-error" role="alert">
          Não foi possível carregar o mapa.
          <button type="button" className="ku-btn" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      )}
      {stage !== 'map' && <div className="ku-veil" />}

      {engine && world.state && mapState === 'ready' && (
        <MapStage
          engine={engine}
          state={world.state}
          status={world.status}
          active={stage === 'map'}
          draft={draft}
          onDraft={setDraft}
          username={me?.username ?? ''}
          subscribe={subscribe}
          found={found}
          expand={world.expand}
          onEditIdentity={() => setStage('identity')}
          onLogout={onLogout}
        />
      )}

      {stage === 'title' && (
        <TitleScreen
          busy={busy || waiting}
          error={error ?? (started ? world.error : null)}
          returning={world.state?.me != null}
          onStart={() => void start()}
          onLogin={onLoginForm}
        />
      )}
      {stage === 'mode' && (
        <ModeSelect
          worldName={world.state?.world.name ?? kingdom?.name ?? 'Mundo'}
          nations={world.state?.nations.size ?? 0}
          onPick={(_mode: GameMode) => setStage('identity')}
          onBack={() => {
            routed.current = false;
            setStarted(false);
            setStage('title');
          }}
        />
      )}
      {stage === 'identity' && <IdentityScreen draft={draft} onChange={setDraft} onDone={() => setStage('map')} onBack={() => setStage(world.state?.me != null ? 'map' : 'mode')} />}
    </div>
  );
}
