import { useCallback, useEffect, useMemo, useState } from 'react';
import { RESOURCE_LABELS, type ResourceType } from '../../../shared/rules';
import { COUNTRY_BY_CODE } from '../../../shared/world';
import { api, ApiError, type CityState, type Governor, type MapCity, serverNow, type WorldSnapshot } from '../api';
import type { RealtimeStatus } from '../realtime';
import type { MapEvents, WorldMapEngine } from '../worldmap/engine';
import { WorldMapView } from '../worldmap/WorldMapView';
import './command.css';
import { Legend, MilitaryDock, type NavKey, SideNav, TerritoryPanel, TopBar, WarPanel } from './hud';
import { IcHome, IcMinus, IcPlus } from './icons';
import { countryStyles, MAP_LABELS, MODULES, type ModuleKey, territoryInfo } from './model';
import {
  EnlistSheet,
  type MapSettings,
  ModuleSheet,
  PendingSheet,
  RankingSheet,
  ResourceSheet,
  SettingsSheet,
  Sheet,
  TerritoryDetails,
  WarsSheet,
} from './sheets';

type SheetState =
  | { kind: 'territory' | 'wars' | 'ranking' | 'missions' | 'shop' | 'settings' | 'enlist' }
  | { kind: 'module'; module: ModuleKey }
  | { kind: 'resource'; resource: ResourceType };

interface Props {
  governor: Governor;
  city: CityState;
  /** Cidades do reino (ranking de comandantes). */
  cities: MapCity[];
  status: RealtimeStatus;
  unread: number;
  /** Muda quando o servidor avisa que o mundo mudou; dispara nova leitura. */
  refreshKey: number;
  onOpenCity: () => void;
  onOpenAlliance: () => void;
  onOpenChat: () => void;
  onLogout: () => void;
}

const SETTINGS_KEY = 'ku.command.map';
const DEFAULT_SETTINGS: MapSettings = {
  labels: true,
  cities: true,
  grid: true,
  reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
};

function loadSettings(): MapSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const SHEET_TITLE: Record<Exclude<SheetState['kind'], 'module' | 'resource' | 'territory'>, string> = {
  wars: 'Guerras ativas',
  ranking: 'Ranking',
  missions: 'Missões',
  shop: 'Loja',
  settings: 'Configurações',
  enlist: 'Alistamento',
};

/**
 * Tela de comando: compõe o mapa (motor independente) com o HUD e liga os dois ao estado do
 * servidor. Não guarda nenhuma verdade de jogo — tudo vem de `/api/world`, da cidade e do reino.
 */
export function CommandCenter(props: Props) {
  const [world, setWorld] = useState<WorldSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [engine, setEngine] = useState<WorldMapEngine | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; sub: string } | null>(null);
  const [settings, setSettings] = useState(loadSettings);
  const [compact, setCompact] = useState(() => window.innerWidth < 980);
  const [legendOpen, setLegendOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setWorld(await api.get<WorldSnapshot>('/world'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falha ao carregar o estado do mundo.');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, props.refreshKey]);

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 980);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const changeSettings = useCallback((s: MapSettings) => {
    setSettings(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* preferência só desta sessão */
    }
  }, []);

  const styles = useMemo(() => countryStyles(world), [world]);
  const info = useMemo(() => territoryInfo(world, selected), [world, selected]);
  const myBloc = world?.blocs.find((b) => b.id === world.myBlocId) ?? null;
  const padding = useMemo(
    () => (compact ? { top: 104, right: 8, bottom: 84, left: 56 } : { top: 76, right: 16, bottom: 122, left: 150 }),
    [compact],
  );

  const onSelect = useCallback((pick: MapEvents['select']) => {
    if (!pick) setSelected(null);
    else if (pick.kind !== 'marker') setSelected(pick.code);
  }, []);

  const onHover = useCallback(
    (hover: MapEvents['hover']) => {
      if (!hover || hover.pick.kind === 'marker') return setTip(null);
      const country = COUNTRY_BY_CODE[hover.pick.code];
      if (!country) return setTip(null);
      const t = territoryInfo(world, country.code);
      setTip({
        x: hover.x,
        y: hover.y,
        title: hover.pick.kind === 'city' ? `${hover.pick.city.n} · ${country.name}` : country.name,
        sub: t?.bloc?.name ?? 'Neutro',
      });
    },
    [world],
  );

  const onNav = (key: NavKey) => {
    if (key === 'map') setSheet(null);
    else if (key === 'alliances') props.onOpenAlliance();
    else setSheet({ kind: key });
  };
  const active: NavKey = sheet && (sheet.kind === 'wars' || sheet.kind === 'ranking' || sheet.kind === 'missions' || sheet.kind === 'shop') ? sheet.kind : 'map';
  const close = useCallback(() => setSheet(null), []);

  const sheetTitle = !sheet
    ? ''
    : sheet.kind === 'module'
      ? MODULES[sheet.module].title
      : sheet.kind === 'resource'
        ? RESOURCE_LABELS[sheet.resource]
        : sheet.kind === 'territory'
          ? 'Detalhes do território'
          : SHEET_TITLE[sheet.kind];

  return (
    <div className={`cc ${compact ? 'compact' : ''}`} data-testid="command-center">
      <div className="cc-map">
        <WorldMapView
          styles={styles}
          labels={MAP_LABELS}
          selected={selected}
          showLabels={settings.labels}
          showCities={settings.cities}
          showGrid={settings.grid}
          reducedMotion={settings.reducedMotion}
          padding={padding}
          now={serverNow}
          onSelect={onSelect}
          onHover={onHover}
          onReady={setEngine}
        />
      </div>

      <TopBar
        name={props.governor.name}
        city={props.city}
        bloc={myBloc}
        status={props.status}
        unread={props.unread}
        onResource={(resource) => setSheet({ kind: 'resource', resource })}
        onMessages={props.onOpenChat}
        onRanking={() => setSheet({ kind: 'ranking' })}
        onSettings={() => setSheet({ kind: 'settings' })}
        onLogout={props.onLogout}
      />
      <SideNav active={active} wars={world?.wars.length ?? 0} onNav={onNav} />

      {world && (
        <div className={`cc-legend-wrap ${legendOpen ? 'open' : ''}`}>
          <button type="button" className="cc-legend-toggle" onClick={() => setLegendOpen((o) => !o)} aria-expanded={legendOpen}>
            Alianças
          </button>
          <Legend world={world} onEnlist={() => setSheet({ kind: 'enlist' })} />
        </div>
      )}

      <div className="cc-zoom">
        <button type="button" onClick={() => engine?.zoomBy(1.6)} aria-label="Aproximar">
          <IcPlus size={18} />
        </button>
        <button type="button" onClick={() => engine?.zoomBy(1 / 1.6)} aria-label="Afastar">
          <IcMinus size={18} />
        </button>
        <button type="button" onClick={() => engine?.home()} aria-label="Ver o mundo inteiro">
          <IcHome size={18} />
        </button>
      </div>

      {(!compact || info) && (
        <TerritoryPanel
          info={info}
          engine={engine}
          onDetails={() => setSheet({ kind: 'territory' })}
          onFocus={() => selected && engine?.flyToCountry(selected)}
        />
      )}
      <MilitaryDock onOpen={(module) => setSheet({ kind: 'module', module })} />
      {world && !compact && <WarPanel world={world} onOpen={() => setSheet({ kind: 'wars' })} />}

      {error && (
        <div className="cc-error-bar" role="alert">
          {error}
          <button type="button" onClick={load}>
            Tentar de novo
          </button>
        </div>
      )}
      {tip && !sheet && (
        <div className="cc-tip" style={{ left: tip.x, top: tip.y }}>
          <strong>{tip.title}</strong>
          <span>{tip.sub}</span>
        </div>
      )}

      {sheet && (
        <Sheet title={sheetTitle} onClose={close} testid={`cc-sheet-${sheet.kind}`}>
          {sheet.kind === 'territory' && (info ? <TerritoryDetails info={info} /> : <p>Selecione um país no mapa.</p>)}
          {sheet.kind === 'wars' && world && <WarsSheet world={world} />}
          {sheet.kind === 'ranking' && world && <RankingSheet world={world} cities={props.cities} myCityId={props.city.cityId} />}
          {sheet.kind === 'missions' && <PendingSheet what="O sistema de missões" />}
          {sheet.kind === 'shop' && <PendingSheet what="A loja" />}
          {sheet.kind === 'module' && <ModuleSheet module={sheet.module} city={props.city} onOpenCity={props.onOpenCity} />}
          {sheet.kind === 'resource' && <ResourceSheet resource={sheet.resource} city={props.city} onOpenCity={props.onOpenCity} />}
          {sheet.kind === 'settings' && (
            <SettingsSheet settings={settings} onChange={changeSettings} onOpenCity={props.onOpenCity} onLogout={props.onLogout} />
          )}
          {sheet.kind === 'enlist' && world && (
            <EnlistSheet
              world={world}
              onDone={(w) => {
                setWorld(w);
                setSheet(null);
              }}
            />
          )}
        </Sheet>
      )}
    </div>
  );
}
