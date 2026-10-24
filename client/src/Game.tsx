import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BUILDINGS, type BuildingType, CIVILIZATION_BY_ID } from '../../shared/rules';
import type { Biome } from '../../shared/terrain';
import { api, ApiError, type ChatChannel, type ChatMessage, type CityState, type MapCity, type Me, type Meta, serverNow } from './api';
import { AlliancePanel } from './components/AlliancePanel';
import { BuildingSheet } from './components/BuildingSheet';
import { ChatPanel } from './components/ChatPanel';
import { CityView } from './components/CityView';
import { ResourceBar } from './components/ResourceBar';
import { type MapFocus, WorldMap } from './components/WorldMap';
import { fmtDuration, fmtNum } from './format';
import { useTick } from './hooks';
import { Realtime, type RealtimeStatus } from './realtime';

type Tab = 'city' | 'world' | 'alliance';

interface Props {
  meta: Meta;
  me: Me;
  reloadMe: () => Promise<void>;
  onLogout: () => void;
}

const BIOME_LABEL: Record<Biome, string> = {
  deep_water: 'Oceano',
  water: 'Água rasa',
  sand: 'Praia',
  grass: 'Planície',
  forest: 'Floresta',
  hills: 'Colinas',
  mountain: 'Montanha',
};

export function Game({ meta, me, reloadMe, onLogout }: Props) {
  const governor = me.governor!;
  const civ = CIVILIZATION_BY_ID[governor.civilization];
  const kingdom = meta.kingdoms.find((k) => k.id === governor.kingdomId)!;

  const [tab, setTab] = useState<Tab>('city');
  const [city, setCity] = useState<CityState | null>(null);
  const [selected, setSelected] = useState<BuildingType | null>(null);
  const [cities, setCities] = useState<MapCity[]>([]);
  const [mapSel, setMapSel] = useState<{ city: MapCity | null; tile: { x: number; y: number; biome: Biome } } | null>(null);
  const [focus, setFocus] = useState<MapFocus>({ x: 0, y: 0, nonce: 0 });
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const [allianceKey, setAllianceKey] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<number | null>(null);
  const [chat, setChat] = useState<Record<number, { messages: ChatMessage[]; hasMore: boolean }>>({});
  const [goto, setGoto] = useState('');

  const live = useRef({ chatOpen, activeChannel, governorId: governor.id });
  live.current = { chatOpen, activeChannel, governorId: governor.id };
  const toastTimer = useRef<number>(undefined);

  const notify = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);
  const onError = useCallback((m: string) => notify(m, true), [notify]);

  const loadCity = useCallback(async () => {
    try {
      setCity(await api.get<CityState>('/city'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) location.reload();
    }
  }, []);
  const loadMap = useCallback(async () => {
    const r = await api.get<{ cities: MapCity[] }>(`/map/cities?x0=0&y0=0&x1=${kingdom.width - 1}&y1=${kingdom.height - 1}`);
    setCities(r.cities);
  }, [kingdom.width, kingdom.height]);
  const loadChannels = useCallback(async () => {
    const r = await api.get<{ channels: ChatChannel[] }>('/chat/channels');
    setChannels(r.channels);
    setActiveChannel((cur) => (cur && r.channels.some((c) => c.id === cur) ? cur : (r.channels[0]?.id ?? null)));
  }, []);
  const loadHistory = useCallback(async (channelId: number, before?: number) => {
    const r = await api.get<{ messages: ChatMessage[]; hasMore: boolean }>(
      `/chat/${channelId}/messages?limit=30${before ? `&before=${before}` : ''}`,
    );
    setChat((prev) => {
      const existing = before ? (prev[channelId]?.messages ?? []) : [];
      return { ...prev, [channelId]: { messages: [...r.messages, ...existing], hasMore: r.hasMore } };
    });
  }, []);

  // Snapshot completo: usado na entrada e a cada reconexão.
  const resync = useCallback(() => {
    loadCity();
    loadMap().catch(() => {});
    loadChannels().catch(() => {});
    setChat({});
    setAllianceKey((k) => k + 1);
  }, [loadCity, loadMap, loadChannels]);

  useEffect(() => {
    const rt = new Realtime(
      (ev) => {
        switch (ev.type) {
          case 'city.updated':
            setCity(ev.state);
            break;
          case 'map.city':
            setCities((prev) => {
              const i = prev.findIndex((c) => c.cityId === ev.city.cityId);
              if (i < 0) return [...prev, ev.city];
              const next = prev.slice();
              next[i] = ev.city;
              return next;
            });
            break;
          case 'chat.message': {
            const m: ChatMessage = ev.message;
            setChat((prev) => {
              const cur = prev[m.channelId];
              if (!cur || cur.messages.some((x) => x.id === m.id)) return prev;
              return { ...prev, [m.channelId]: { ...cur, messages: [...cur.messages, m] } };
            });
            const viewing = live.current.chatOpen && live.current.activeChannel === m.channelId;
            if (viewing) {
              api.post(`/chat/${m.channelId}/read`, { messageId: m.id }).catch(() => {});
            } else if (m.author.governorId !== live.current.governorId) {
              setChannels((prev) => prev.map((c) => (c.id === m.channelId ? { ...c, unread: c.unread + 1 } : c)));
            }
            break;
          }
          case 'alliance.updated':
            setAllianceKey((k) => k + 1);
            break;
          case 'membership.changed':
            reloadMe().then(() => loadChannels().catch(() => {}));
            setAllianceKey((k) => k + 1);
            break;
        }
      },
      setStatus,
      resync,
    );
    rt.connect();
    return () => rt.stop();
  }, [resync, reloadMe, loadChannels]);

  useEffect(() => {
    if (city && focus.nonce === 0) setFocus({ x: city.x, y: city.y, nonce: 1 });
  }, [city, focus.nonce]);

  // Rede de segurança: se a obra venceu e o evento não chegou, pede snapshot.
  useTick(1000);
  const queueDone = city?.queue && serverNow() > city.queue.endsAt + 1500;
  useEffect(() => {
    if (queueDone) loadCity();
  }, [queueDone, loadCity]);

  // Chat: histórico sob demanda, leitura e contagem de não lidas.
  useEffect(() => {
    if (!chatOpen || !activeChannel) return;
    if (!chat[activeChannel]) loadHistory(activeChannel).catch(() => {});
    setChannels((prev) => prev.map((c) => (c.id === activeChannel ? { ...c, unread: 0 } : c)));
  }, [chatOpen, activeChannel, chat, loadHistory]);
  const activeMsgs = activeChannel ? chat[activeChannel] : undefined;
  const lastId = activeMsgs?.messages[activeMsgs.messages.length - 1]?.id;
  useEffect(() => {
    if (chatOpen && activeChannel && lastId) api.post(`/chat/${activeChannel}/read`, { messageId: lastId }).catch(() => {});
  }, [chatOpen, activeChannel, lastId]);

  // Teclado virtual do iOS: mantém o input visível.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${kb}px`);
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  const goTo = useCallback((x: number, y: number) => {
    setTab('world');
    setChatOpen(false);
    setFocus((f) => ({ x, y, nonce: f.nonce + 1 }));
  }, []);

  const totalUnread = useMemo(() => channels.reduce((s, c) => s + c.unread, 0), [channels]);

  if (!city || !civ) {
    return (
      <div className="splash">
        <p className="muted">Carregando cidade…</p>
      </div>
    );
  }

  const q = city.queue;
  return (
    <div className="game">
      <header className="hud-top">
        <div className="gov">
          <div className="gov-avatar" style={{ background: civ.color, color: civ.accent }} aria-hidden>
            {governor.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="gov-info">
            <div className="gov-name" data-testid="gov-name">
              {governor.name}
            </div>
            <div className="gov-sub">
              ⚔ {fmtNum(city.power)} · {kingdom.name.split('·')[0].trim()}
            </div>
          </div>
          <div className={`net ${status}`} title={status === 'online' ? 'Conectado' : 'Reconectando…'} data-testid="net-status">
            {status === 'online' ? '●' : '◌'}
          </div>
          <button className="btn small" onClick={onLogout}>
            Sair
          </button>
        </div>
        <ResourceBar city={city} />
        {q && (
          <button className="queue-chip" onClick={() => (setTab('city'), setSelected(q.building))} data-testid="queue-chip">
            🔨 {BUILDINGS[q.building].name} → Nv {q.toLevel} · {fmtDuration((q.endsAt - serverNow()) / 1000)}
          </button>
        )}
      </header>

      <main className="viewport">
        {tab === 'city' && <CityView state={city} civ={civ} selected={selected} onSelect={setSelected} now={serverNow} />}
        {tab === 'world' && (
          <>
            <WorldMap
              kingdom={kingdom}
              cities={cities}
              myCityId={city.cityId}
              myAllianceId={governor.allianceId}
              selectedCityId={mapSel?.city?.cityId ?? null}
              focus={focus}
              onSelectCity={(c, tile) => setMapSel({ city: c, tile })}
              onCenter={(x, y) => setCenter({ x, y })}
            />
            <div className="map-hud">
              <div className="coords" data-testid="map-center">
                X:{center.x} Y:{center.y}
              </div>
              <form
                className="goto"
                onSubmit={(e) => {
                  e.preventDefault();
                  const m = goto.match(/(\d+)\D+(\d+)/);
                  if (m) goTo(Math.min(kingdom.width - 1, Number(m[1])), Math.min(kingdom.height - 1, Number(m[2])));
                }}
              >
                <input value={goto} onChange={(e) => setGoto(e.target.value)} placeholder="x, y" inputMode="numeric" aria-label="Ir para coordenada" />
                <button className="btn small">Ir</button>
              </form>
              <button className="btn small" onClick={() => goTo(city.x, city.y)}>
                🏰 Minha cidade
              </button>
            </div>
            {mapSel && (
              <div className="sheet" data-testid="map-sheet">
                <div className="sheet-head">
                  <div>
                    {mapSel.city ? (
                      <>
                        <h2>
                          {mapSel.city.allianceTag && `[${mapSel.city.allianceTag}] `}
                          {mapSel.city.name}
                        </h2>
                        <div className="muted small">
                          {CIVILIZATION_BY_ID[mapSel.city.civilization]?.name} · Prefeitura Nv {mapSel.city.hallLevel} · poder{' '}
                          {fmtNum(mapSel.city.power)}
                        </div>
                      </>
                    ) : (
                      <h2>{BIOME_LABEL[mapSel.tile.biome]}</h2>
                    )}
                    <div className="muted small">
                      X:{mapSel.city?.x ?? mapSel.tile.x} Y:{mapSel.city?.y ?? mapSel.tile.y}
                      {mapSel.city?.cityId === city.cityId && ' · sua cidade'}
                    </div>
                  </div>
                  <button className="icon-btn" onClick={() => setMapSel(null)} aria-label="Fechar">
                    ✕
                  </button>
                </div>
                {mapSel.city && mapSel.city.cityId !== city.cityId && (
                  <div className="muted small">Marchas, exploração e ataques chegam na Fase B.</div>
                )}
              </div>
            )}
          </>
        )}
        {tab === 'alliance' && (
          <div className="scroll-area">
            <AlliancePanel governor={governor} refreshKey={allianceKey} onError={onError} onToast={(m) => notify(m)} onGoTo={goTo} />
          </div>
        )}
        {tab === 'city' && selected && (
          <BuildingSheet building={selected} city={city} onClose={() => setSelected(null)} onState={setCity} onError={onError} />
        )}
      </main>

      {chatOpen && governor && (
        <ChatPanel
          channels={channels}
          activeId={activeChannel}
          onActive={setActiveChannel}
          messages={activeMsgs?.messages ?? []}
          hasMore={activeMsgs?.hasMore ?? false}
          onLoadOlder={async () => {
            const first = activeMsgs?.messages[0]?.id;
            if (activeChannel && first) await loadHistory(activeChannel, first).catch(() => {});
          }}
          onSend={async (body) => {
            try {
              const r = await api.post<{ message: ChatMessage }>(`/chat/${activeChannel}/messages`, { body });
              setChat((prev) => {
                const cur = prev[r.message.channelId];
                if (!cur || cur.messages.some((x) => x.id === r.message.id)) return prev;
                return { ...prev, [r.message.channelId]: { ...cur, messages: [...cur.messages, r.message] } };
              });
              return true;
            } catch (e) {
              onError(e instanceof ApiError ? e.message : 'Falha ao enviar.');
              return false;
            }
          }}
          governor={governor}
          onGoTo={goTo}
          onClose={() => setChatOpen(false)}
        />
      )}

      <nav className="hud-bottom">
        <button className={tab === 'city' ? 'on' : ''} onClick={() => setTab('city')} data-testid="tab-city">
          <span aria-hidden>🏰</span>Cidade
        </button>
        <button className={tab === 'world' ? 'on' : ''} onClick={() => (setTab('world'), setSelected(null))} data-testid="tab-world">
          <span aria-hidden>🗺</span>Mundo
        </button>
        <button className={tab === 'alliance' ? 'on' : ''} onClick={() => (setTab('alliance'), setSelected(null))} data-testid="tab-alliance">
          <span aria-hidden>🛡</span>Aliança
        </button>
        <button className={chatOpen ? 'on' : ''} onClick={() => setChatOpen((o) => !o)} data-testid="tab-chat">
          <span aria-hidden>💬</span>Chat
          {totalUnread > 0 && !chatOpen && (
            <span className="badge" data-testid="chat-badge">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      </nav>

      {toast && (
        <div className={`toast ${toast.err ? 'err' : ''}`} role="status" data-testid="toast">
          {toast.msg}
        </div>
      )}
    </div>
  );
}
