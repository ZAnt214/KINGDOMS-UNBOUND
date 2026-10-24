import { syncClock } from './api';

export type RealtimeStatus = 'connecting' | 'online' | 'offline';
type Listener = (event: { type: string; [k: string]: any }) => void;

/**
 * Conexão WebSocket com reconexão exponencial. Ao (re)conectar, o app recarrega
 * snapshots autoritativos (cidade, mapa, chat) — eventos perdidos não corrompem estado.
 */
export class Realtime {
  private ws: WebSocket | null = null;
  private retry = 0;
  private timer: number | undefined;
  private pinger: number | undefined;
  private stopped = false;
  status: RealtimeStatus = 'connecting';

  constructor(
    private onEvent: Listener,
    private onStatus: (s: RealtimeStatus) => void,
    private onReconnect: () => void,
  ) {
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onVisible);
  }

  private onVisible = () => {
    if (document.visibilityState !== 'visible' || this.stopped) return;
    if (!this.ws || this.ws.readyState > WebSocket.OPEN) {
      window.clearTimeout(this.timer);
      this.retry = 0;
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send('{"type":"ping"}');
    }
  };

  connect() {
    if (this.stopped) return;
    this.setStatus('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('online');
      this.onReconnect();
      window.clearInterval(this.pinger);
      this.pinger = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"ping"}'), 20000);
    };
    ws.onmessage = (m) => {
      try {
        const event = JSON.parse(m.data);
        if (event.serverTime) syncClock(event.serverTime);
        this.onEvent(event);
      } catch {
        /* ignora payload inválido */
      }
    };
    ws.onclose = () => {
      window.clearInterval(this.pinger);
      if (this.ws !== ws) return;
      this.setStatus('offline');
      if (this.stopped) return;
      const delay = Math.min(15000, 800 * 2 ** this.retry++) + Math.random() * 400;
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
  }

  private setStatus(s: RealtimeStatus) {
    this.status = s;
    this.onStatus(s);
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.timer);
    window.clearInterval(this.pinger);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onVisible);
    this.ws?.close();
  }
}
