// Identidade sonora do jogo, toda sintetizada com Web Audio: nenhum arquivo de áudio é baixado.
// Efeitos curtos e discretos para cada ação e uma trilha ambiente lenta. Volumes ficam salvos
// no navegador; o áudio só começa depois do primeiro toque (exigência dos navegadores).

export type SoundName = 'tap' | 'select' | 'confirm' | 'deny' | 'found' | 'expand' | 'conquest' | 'country' | 'level' | 'notify' | 'build' | 'built' | 'rail' | 'drill' | 'victory' | 'defeat' | 'war' | 'alarm' | 'silo' | 'launch' | 'whoosh' | 'boom' | 'intercept' | 'repelled' | 'pact' | 'pactBreak' | 'gift';

export interface AudioSettings {
  music: number;
  effects: number;
  muted: boolean;
}

const KEY = 'ku.audio';
const DEFAULTS: AudioSettings = { music: 0.5, effects: 0.7, muted: false };

function load(): AudioSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      music: typeof raw.music === 'number' ? Math.max(0, Math.min(1, raw.music)) : DEFAULTS.music,
      effects: typeof raw.effects === 'number' ? Math.max(0, Math.min(1, raw.effects)) : DEFAULTS.effects,
      muted: raw.muted === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

class GameAudio {
  settings: AudioSettings = load();
  private ctx: AudioContext | null = null;
  private fxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicTimer: number | undefined;
  private musicOn = false;
  private step = 0;
  private listeners = new Set<() => void>();

  /** Chamar dentro de um gesto do usuário. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      const master = this.ctx.createDynamicsCompressor();
      master.threshold.value = -14;
      master.ratio.value = 5;
      master.connect(this.ctx.destination);
      this.fxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      // Eco curto e filtrado: dá espaço à trilha sem precisar de reverberação por convolução.
      const delay = this.ctx.createDelay(1.5);
      delay.delayTime.value = 0.46;
      const feedback = this.ctx.createGain();
      feedback.gain.value = 0.38;
      const damp = this.ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 1500;
      this.musicBus.connect(master);
      this.musicBus.connect(delay);
      delay.connect(damp);
      damp.connect(feedback);
      feedback.connect(delay);
      damp.connect(master);
      this.fxBus.connect(master);
      this.apply();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  update(patch: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
    this.apply();
    for (const fn of this.listeners) fn();
  }

  private apply() {
    if (!this.ctx || !this.fxBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    const s = this.settings;
    this.fxBus.gain.setTargetAtTime(s.muted ? 0 : s.effects * 0.9, t, 0.03);
    this.musicBus.gain.setTargetAtTime(s.muted ? 0 : s.music * 0.5, t, 0.2);
  }

  private tone(o: { f: number; to?: number; at?: number; dur: number; type?: OscillatorType; gain?: number; attack?: number; bus?: GainNode | null; lp?: number }) {
    const ctx = this.ctx;
    const bus = o.bus ?? this.fxBus;
    if (!ctx || !bus) return;
    const t0 = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      osc.connect(f);
      f.connect(g);
    } else osc.connect(g);
    g.connect(bus);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  private noise(o: { at?: number; dur: number; from: number; to: number; gain?: number; q?: number }) {
    const ctx = this.ctx;
    if (!ctx || !this.fxBus) return;
    const t0 = ctx.currentTime + (o.at ?? 0);
    const len = Math.ceil(ctx.sampleRate * o.dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = o.q ?? 1.2;
    f.frequency.setValueAtTime(o.from, t0);
    f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
    const g = ctx.createGain();
    const peak = o.gain ?? 0.15;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + o.dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.fxBus);
    src.start(t0);
  }

  play(name: SoundName) {
    if (!this.ctx || this.settings.muted || this.settings.effects <= 0) return;
    switch (name) {
      case 'tap':
        this.tone({ f: 880, to: 660, dur: 0.07, type: 'triangle', gain: 0.1 });
        break;
      case 'select':
        this.tone({ f: midi(76), dur: 0.16, type: 'triangle', gain: 0.14 });
        this.tone({ f: midi(83), at: 0.07, dur: 0.24, type: 'sine', gain: 0.12 });
        break;
      case 'confirm':
        [72, 76, 79].forEach((n, i) => this.tone({ f: midi(n), at: i * 0.06, dur: 0.3, type: 'triangle', gain: 0.13 }));
        break;
      case 'deny':
        this.tone({ f: 196, to: 150, dur: 0.2, type: 'sawtooth', gain: 0.08, lp: 700 });
        break;
      case 'notify':
        this.tone({ f: midi(81), dur: 0.14, gain: 0.1 });
        this.tone({ f: midi(88), at: 0.1, dur: 0.3, gain: 0.08 });
        break;
      case 'expand':
        // Avanço: sopro que sobe e um grave curto.
        this.noise({ dur: 0.7, from: 300, to: 2400, gain: 0.12 });
        this.tone({ f: 110, to: 165, dur: 0.5, type: 'sine', gain: 0.16 });
        this.tone({ f: midi(67), at: 0.12, dur: 0.4, type: 'triangle', gain: 0.07 });
        break;
      case 'conquest':
        // Bandeira fincada: batida grave e três notas ascendentes.
        this.tone({ f: 150, to: 55, dur: 0.35, type: 'sine', gain: 0.3 });
        this.noise({ dur: 0.18, from: 3000, to: 800, gain: 0.07 });
        [67, 72, 76, 79].forEach((n, i) => this.tone({ f: midi(n), at: 0.05 + i * 0.085, dur: 0.5, type: 'triangle', gain: 0.13 }));
        this.tone({ f: midi(91), at: 0.4, dur: 0.9, type: 'sine', gain: 0.05 });
        break;
      case 'found':
        // Fundação: impacto, acorde que cresce e chamada de quatro notas.
        this.tone({ f: 120, to: 40, dur: 0.9, type: 'sine', gain: 0.34 });
        this.noise({ dur: 1.4, from: 200, to: 3200, gain: 0.1, q: 0.7 });
        [50, 57, 62, 66, 69].forEach((n) => this.tone({ f: midi(n), at: 0.1, dur: 2.4, type: 'sawtooth', gain: 0.05, attack: 0.7, lp: 1400 }));
        [74, 78, 81, 86].forEach((n, i) => this.tone({ f: midi(n), at: 0.7 + i * 0.14, dur: 0.8, type: 'triangle', gain: 0.13 }));
        break;
      case 'country':
        this.tone({ f: 100, to: 45, dur: 0.8, type: 'sine', gain: 0.32 });
        [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.tone({ f: midi(n), at: i * 0.09, dur: 1.1, type: 'triangle', gain: 0.12 }));
        [48, 55, 64].forEach((n) => this.tone({ f: midi(n), at: 0.05, dur: 2.2, type: 'sawtooth', gain: 0.05, attack: 0.4, lp: 1200 }));
        break;
      case 'build':
        // Canteiro: três batidas secas, como martelo em estrutura metálica.
        [0, 0.12, 0.24].forEach((at, i) => {
          this.noise({ at, dur: 0.07, from: 2600 - i * 300, to: 1200, gain: 0.12, q: 4 });
          this.tone({ f: 330 + i * 40, to: 220, at, dur: 0.09, type: 'square', gain: 0.04, lp: 1800 });
        });
        break;
      case 'built':
        // Obra pronta: base grave e acorde maior subindo.
        this.tone({ f: 130, to: 65, dur: 0.4, type: 'sine', gain: 0.22 });
        [64, 68, 71, 76].forEach((n, i) => this.tone({ f: midi(n), at: 0.04 + i * 0.07, dur: 0.45, type: 'triangle', gain: 0.11 }));
        break;
      case 'war':
        // Operação lançada: tambores de guerra (graves em ritmo) e uma trompa em quinta.
        [0, 0.18, 0.36, 0.62].forEach((at, i) => {
          this.tone({ f: 70, to: 45, at, dur: 0.3, type: 'sine', gain: i === 3 ? 0.35 : 0.25 });
          this.noise({ at, dur: 0.08, from: 600, to: 200, gain: 0.12, q: 0.8 });
        });
        this.tone({ f: midi(55), at: 0.62, dur: 0.9, type: 'sawtooth', gain: 0.05, attack: 0.08 });
        this.tone({ f: midi(62), at: 0.62, dur: 0.9, type: 'sawtooth', gain: 0.04, attack: 0.08 });
        this.tone({ f: midi(67), at: 0.8, dur: 0.8, type: 'triangle', gain: 0.07, attack: 0.05 });
        break;
      case 'alarm':
        // Sob ataque: duas notas alternadas, como sirene curta.
        [0, 0.32, 0.64].forEach((at) => {
          this.tone({ f: midi(76), at, dur: 0.16, type: 'square', gain: 0.05 });
          this.tone({ f: midi(71), at: at + 0.16, dur: 0.16, type: 'square', gain: 0.05 });
        });
        break;
      case 'silo':
        // Preparação: zumbido que sobe e o estalo das tampas.
        this.tone({ f: 60, to: 140, dur: 1.2, type: 'sawtooth', gain: 0.05, attack: 0.3, lp: 600 });
        this.noise({ at: 1.25, dur: 0.12, from: 1800, to: 500, gain: 0.12, q: 2 });
        this.noise({ at: 1.4, dur: 0.6, from: 400, to: 1200, gain: 0.05, q: 0.7 });
        break;
      case 'launch':
        // Ignição: estrondo grave e rugido que se afasta.
        this.tone({ f: 55, to: 30, dur: 0.6, type: 'sine', gain: 0.4 });
        this.noise({ dur: 1.6, from: 300, to: 2400, gain: 0.22, q: 0.5 });
        this.noise({ at: 0.2, dur: 1.4, from: 2200, to: 600, gain: 0.08, q: 0.6 });
        break;
      case 'whoosh':
        this.noise({ dur: 1.2, from: 500, to: 3000, gain: 0.05, q: 0.6 });
        break;
      case 'boom':
        // Impacto: golpe grave, estalo e cauda de estilhaços.
        this.tone({ f: 80, to: 28, dur: 0.9, type: 'sine', gain: 0.5 });
        this.noise({ dur: 0.25, from: 2500, to: 400, gain: 0.3, q: 0.6 });
        this.noise({ at: 0.15, dur: 1.4, from: 900, to: 150, gain: 0.12, q: 0.5 });
        break;
      case 'intercept':
        // Interceptação: estalo agudo e um brilho metálico.
        this.noise({ dur: 0.18, from: 4000, to: 1500, gain: 0.2, q: 1.5 });
        this.tone({ f: midi(88), at: 0.05, dur: 0.5, type: 'triangle', gain: 0.08 });
        this.tone({ f: midi(95), at: 0.1, dur: 0.6, type: 'sine', gain: 0.05 });
        break;
      case 'repelled':
        this.tone({ f: midi(60), dur: 0.35, type: 'triangle', gain: 0.1 });
        this.tone({ f: midi(67), at: 0.12, dur: 0.5, type: 'triangle', gain: 0.1 });
        this.tone({ f: midi(72), at: 0.24, dur: 0.7, type: 'triangle', gain: 0.1 });
        break;
      case 'pact':
        // Aliança formada: dois sinos que se respondem e um acorde maior que se abre.
        this.tone({ f: midi(79), dur: 0.9, type: 'sine', gain: 0.12 });
        this.tone({ f: midi(84), at: 0.18, dur: 1.1, type: 'sine', gain: 0.12 });
        [60, 64, 67, 72].forEach((n, i) => this.tone({ f: midi(n), at: 0.42 + i * 0.05, dur: 1.6, type: 'triangle', gain: 0.08, attack: 0.08 }));
        this.tone({ f: midi(91), at: 0.7, dur: 1.4, type: 'sine', gain: 0.05 });
        break;
      case 'pactBreak':
        // Quebra: estalo seco e um acorde menor que desce.
        this.noise({ dur: 0.16, from: 3200, to: 700, gain: 0.22, q: 1.2 });
        this.tone({ f: 120, to: 50, dur: 0.5, type: 'sine', gain: 0.25 });
        [67, 63, 60].forEach((n, i) => this.tone({ f: midi(n), at: 0.12 + i * 0.12, dur: 0.6, type: 'triangle', gain: 0.09, lp: 1400 }));
        break;
      case 'gift':
        // Recursos chegando: moedas (notas curtas e brilhantes).
        [88, 91, 95].forEach((n, i) => this.tone({ f: midi(n), at: i * 0.07, dur: 0.18, type: 'triangle', gain: 0.07 }));
        break;
      case 'drill':
        // Tropas prontas: caixa clara em marcha (três batidas) e um acorde de metais curto.
        [0, 0.16, 0.32].forEach((at) => this.noise({ at, dur: 0.05, from: 2400, to: 1400, gain: 0.1, q: 4 }));
        this.tone({ f: midi(67), at: 0.48, dur: 0.4, type: 'sawtooth', gain: 0.05 });
        this.tone({ f: midi(71), at: 0.48, dur: 0.4, type: 'sawtooth', gain: 0.04 });
        this.tone({ f: midi(74), at: 0.48, dur: 0.5, type: 'triangle', gain: 0.07 });
        break;
      case 'rail':
        // Ferrovia ligada: rodas sobre os trilhos (quatro batidas em ritmo de vagão) e um apito curto.
        [0, 0.11, 0.36, 0.47].forEach((at) => this.noise({ at, dur: 0.06, from: 1800, to: 900, gain: 0.09, q: 3 }));
        this.tone({ f: midi(79), at: 0.55, dur: 0.35, type: 'triangle', gain: 0.09 });
        this.tone({ f: midi(84), at: 0.6, dur: 0.45, type: 'sine', gain: 0.07 });
        break;
      case 'victory':
        this.tone({ f: 98, to: 49, dur: 1.2, type: 'sine', gain: 0.3 });
        [55, 62, 67].forEach((n) => this.tone({ f: midi(n), at: 0.05, dur: 2.8, type: 'sawtooth', gain: 0.05, attack: 0.5, lp: 1500 }));
        [67, 71, 74, 79, 83, 86].forEach((n, i) => this.tone({ f: midi(n), at: 0.2 + i * 0.12, dur: 0.9, type: 'triangle', gain: 0.12 }));
        break;
      case 'defeat':
        [62, 58, 55, 50].forEach((n, i) => this.tone({ f: midi(n), at: i * 0.22, dur: 0.8, type: 'triangle', gain: 0.1, lp: 1200 }));
        this.tone({ f: 73, to: 55, at: 0.6, dur: 1.4, type: 'sine', gain: 0.18 });
        break;
      case 'level':
        [72, 79, 84, 91].forEach((n, i) => this.tone({ f: midi(n), at: i * 0.07, dur: 0.5, type: 'sine', gain: 0.11 }));
        break;
    }
  }

  // ---------- trilha ambiente ----------

  /** Acordes abertos em ré menor, um a cada ~11 s, com ataque e cauda longos. */
  private static CHORDS = [
    [38, 50, 57, 64, 65],
    [34, 46, 53, 60, 65],
    [41, 48, 57, 60, 67],
    [36, 48, 55, 62, 64],
  ];

  private chord() {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const notes = GameAudio.CHORDS[this.step % GameAudio.CHORDS.length];
    this.step++;
    const t0 = ctx.currentTime;
    const hold = 11;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(320, t0);
    filter.frequency.linearRampToValueAtTime(1150, t0 + hold * 0.5);
    filter.frequency.linearRampToValueAtTime(380, t0 + hold + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.11, t0 + 4);
    g.gain.setValueAtTime(0.11, t0 + hold - 2);
    g.gain.linearRampToValueAtTime(0.0001, t0 + hold + 4);
    filter.connect(g);
    g.connect(this.musicBus);
    for (const n of notes) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = n < 45 ? 'sine' : 'sawtooth';
        osc.frequency.value = midi(n);
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(t0);
        osc.stop(t0 + hold + 4.2);
      }
    }
    // Nota alta esparsa, como um sinal distante.
    const top = notes[notes.length - 1] + 12 + (this.step % 2 ? 7 : 0);
    this.tone({ f: midi(top), at: 3 + (this.step % 3), dur: 3.5, gain: 0.035, attack: 0.9, bus: this.musicBus });
  }

  music(on: boolean) {
    if (on === this.musicOn) return;
    this.musicOn = on;
    window.clearInterval(this.musicTimer);
    if (!on || !this.ctx) return;
    this.chord();
    this.musicTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !this.settings.muted && this.settings.music > 0) this.chord();
    }, 11000);
  }
}

export const audio = new GameAudio();
