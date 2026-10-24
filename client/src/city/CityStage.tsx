import { useEffect, useRef, useState } from 'react';
import type { BuildingType, CivilizationDef } from '../../../shared/rules';
import type { CityState } from '../api';
import { CityView } from '../components/CityView';
import type { CityScene, SceneInput } from './CityScene';

interface Props {
  state: CityState;
  civ: CivilizationDef;
  selected: BuildingType | null;
  upgradable: BuildingType[];
  onSelect: (b: BuildingType | null) => void;
  now: () => number;
}

/** Monta a cena PixiJS (código carregado sob demanda) e recai no Canvas 2D sem WebGL. */
export function CityStage(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<CityScene | null>(null);
  const [mode, setMode] = useState<'loading' | 'webgl' | 'fallback'>('loading');
  const live = useRef(props);
  live.current = props;

  const input = (): SceneInput => ({
    levels: live.current.state.levels,
    civ: live.current.civ,
    queue: live.current.state.queue,
    selected: live.current.selected,
    upgradable: live.current.upgradable,
    now: live.current.now,
  });

  useEffect(() => {
    let cancelled = false;
    const gl = (() => {
      try {
        const c = document.createElement('canvas');
        return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
      } catch {
        return false;
      }
    })();
    if (!gl) {
      setMode('fallback');
      return;
    }
    (async () => {
      try {
        const { CityScene } = await import('./CityScene');
        if (cancelled || !host.current) return;
        const s = new CityScene(input());
        scene.current = s;
        s.onSelect = (b) => live.current.onSelect(b);
        s.onReady = () => !cancelled && setMode('webgl');
        await s.init(host.current);
      } catch (err) {
        console.error('cena WebGL indisponível, usando Canvas 2D', err);
        scene.current?.destroy();
        scene.current = null;
        if (!cancelled) setMode('fallback');
      }
    })();
    return () => {
      cancelled = true;
      scene.current?.destroy();
      scene.current = null;
    };
  }, []);

  const levelsKey = JSON.stringify(props.state.levels);
  const queueKey = props.state.queue ? `${props.state.queue.building}:${props.state.queue.startedAt}` : '';
  useEffect(() => {
    scene.current?.update(input());
  }, [levelsKey, queueKey, props.selected, props.upgradable.join(','), props.civ.id]);

  if (mode === 'fallback') {
    return <CityView state={props.state} civ={props.civ} selected={props.selected} onSelect={props.onSelect} now={props.now} />;
  }
  return (
    <div ref={host} className="stage city-host" data-mode={mode}>
      {mode === 'loading' && (
        <div className="stage-loading" role="status">
          <div className="spinner" aria-hidden />
          Preparando a cidade…
        </div>
      )}
    </div>
  );
}
