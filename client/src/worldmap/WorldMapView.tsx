import { useEffect, useRef, useState } from 'react';
import { type CountryStyle, type GeoData, type MapCity, type MapEvents, type MapLabel, type MapMarker, type MapRoute, WorldMapEngine } from './engine';

interface Props {
  styles: Record<string, CountryStyle>;
  labels: MapLabel[];
  selected: string | null;
  markers?: MapMarker[];
  routes?: MapRoute[];
  showLabels?: boolean;
  showCities?: boolean;
  showGrid?: boolean;
  reducedMotion?: boolean;
  padding?: { top: number; right: number; bottom: number; left: number };
  now?: () => number;
  onSelect: (pick: MapEvents['select']) => void;
  onHover?: (hover: MapEvents['hover']) => void;
  /** Entrega o motor para quem precisa comandar a câmera ou gerar miniaturas. */
  onReady?: (engine: WorldMapEngine | null) => void;
}

/**
 * Ponte entre React e o motor do mapa. Só repassa dados; o canvas nunca é recriado quando
 * painéis abrem ou fecham, então câmera e seleção sobrevivem a qualquer mudança do HUD.
 */
export function WorldMapView(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<WorldMapEngine | null>(null);
  const live = useRef(props);
  live.current = props;
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const e = new WorldMapEngine(host.current!, { now: live.current.now, reducedMotion: live.current.reducedMotion });
    engine.current = e;
    e.on('select', (p) => live.current.onSelect(p));
    e.on('hover', (h) => live.current.onHover?.(h));
    live.current.onReady?.(e);
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
      live.current.onReady?.(null);
      engine.current = null;
      e.destroy();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    const load = async <T,>(url: string): Promise<T> => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return res.json();
    };
    load<GeoData>('/world/countries.geo.json')
      .then((geo) => {
        if (cancelled) return;
        engine.current?.setGeometry(geo);
        setState('ready');
        // Cidades são um nível de detalhe opcional: falhar aqui não derruba o mapa.
        load<{ cities: MapCity[] }>('/world/cities.json')
          .then((c) => !cancelled && engine.current?.setCities(c.cities))
          .catch(() => {});
      })
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => engine.current?.setCountryStyles(props.styles), [props.styles]);
  useEffect(() => engine.current?.setLabels(props.labels), [props.labels]);
  useEffect(() => engine.current?.setSelected(props.selected), [props.selected]);
  useEffect(() => engine.current?.setMarkers(props.markers ?? []), [props.markers]);
  useEffect(() => engine.current?.setRoutes(props.routes ?? []), [props.routes]);
  useEffect(() => engine.current?.setLayerVisible('labels', props.showLabels ?? true), [props.showLabels]);
  useEffect(() => engine.current?.setLayerVisible('cities', props.showCities ?? true), [props.showCities]);
  useEffect(() => engine.current?.setLayerVisible('graticule', props.showGrid ?? true), [props.showGrid]);
  useEffect(() => engine.current?.setReducedMotion(props.reducedMotion ?? false), [props.reducedMotion]);
  const pad = props.padding;
  useEffect(() => {
    if (pad) engine.current?.setPadding(pad);
  }, [pad?.top, pad?.right, pad?.bottom, pad?.left]);

  return (
    <div ref={host} className="wm-host" data-testid="world-map" data-state={state}>
      {state !== 'ready' && (
        <div className="wm-status" role="status">
          {state === 'loading' ? (
            'Carregando mapa…'
          ) : (
            <>
              Não foi possível carregar o mapa.
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Tentar de novo
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
