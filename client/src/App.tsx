import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Me, type Meta } from './api';
import { PlayApp } from './play/PlayApp';

// O jogo clássico (cidade medieval da primeira Fase A) só é baixado em /?login=1.
const Game = lazy(() => import('./Game').then((m) => ({ default: m.Game })));

const QUICK_KEY = 'ku.quick-entry';
const rand = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => (b % 36).toString(36)).join('');

/**
 * Conta de teste: cria (ou reencontra) uma conta descartável pelas rotas normais de cadastro.
 * As credenciais geradas ficam neste navegador para a conta ser reencontrada se a sessão expirar;
 * não substitui o login de contas reais.
 */
async function quickAccount(): Promise<void> {
  let saved: { username: string; password: string } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(QUICK_KEY) ?? 'null');
  } catch {
    /* sem armazenamento: cria uma conta nova */
  }
  if (saved) {
    try {
      await api.post('/auth/login', saved);
      return;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
    }
  }
  saved = { username: `cmd_${rand(8)}`, password: rand(24) };
  await api.post('/auth/register', saved);
  try {
    localStorage.setItem(QUICK_KEY, JSON.stringify(saved));
  } catch {
    /* a conta vale só enquanto a sessão durar */
  }
}

/** Todo jogador precisa de um governador num mundo aberto; quem ainda não tem ganha um agora. */
async function ensureGovernor(meta: Meta): Promise<void> {
  const me = await api.get<Me>('/me');
  if (me.governor) return;
  const kingdom = meta.kingdoms.find((k) => k.status === 'open' && k.population < k.capacity);
  if (!kingdom) throw new ApiError(409, 'kingdom_full', 'Todos os mundos estão lotados.');
  for (let attempt = 0; ; attempt++) {
    try {
      await api.post('/governor', { name: `Comandante ${rand(4).toUpperCase()}`, civilization: meta.civilizations[0].id, kingdomId: kingdom.id });
      return;
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'name_taken' || attempt >= 4) throw e;
    }
  }
}

export function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // `?login=1` abre o jogo clássico (formulário de login + cidade), usado pelos testes da primeira Fase A.
  const [manual] = useState(() => new URLSearchParams(location.search).has('login'));
  const [loginForm, setLoginForm] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/me'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null);
      else setError(e instanceof Error ? e.message : 'Falha ao conectar.');
    }
  }, []);

  useEffect(() => {
    api
      .get<Meta>('/meta')
      .then(setMeta)
      .catch(() => setError('Servidor indisponível. Tente novamente em instantes.'));
    loadMe();
  }, [loadMe]);

  if (error && (!meta || me === undefined)) {
    return (
      <div className="splash">
        <Logo />
        <p>{error}</p>
        <button className="btn primary" onClick={() => location.reload()}>
          Tentar novamente
        </button>
      </div>
    );
  }
  if (!meta || me === undefined) {
    return manual ? (
      <div className="splash">
        <Logo />
        <p className="muted">Conectando ao reino…</p>
      </div>
    ) : (
      <div className="ku-splash" role="status">
        Conectando…
      </div>
    );
  }
  if (!manual) {
    if (loginForm && !me) return <AuthScreen onDone={loadMe} onBack={() => setLoginForm(false)} />;
    return (
      <PlayApp
        meta={meta}
        me={me}
        enter={async () => {
          if (!me) await quickAccount();
          await ensureGovernor(meta);
          await loadMe();
        }}
        onLoginForm={() => setLoginForm(true)}
        onLogout={async () => {
          await api.post('/auth/logout').catch(() => {});
          setLoginForm(false);
          setMe(null);
        }}
      />
    );
  }
  if (!me) return <AuthScreen onDone={loadMe} />;
  if (!me.governor) return <SetupScreen meta={meta} me={me} onDone={loadMe} />;
  return (
    <Suspense
      fallback={
        <div className="splash">
          <Logo />
          <p className="muted">Carregando…</p>
        </div>
      }
    >
      <Game
        meta={meta}
        me={me}
        initialTab="city"
        reloadMe={loadMe}
        onLogout={async () => {
          await api.post('/auth/logout').catch(() => {});
          setMe(null);
        }}
      />
    </Suspense>
  );
}

function Logo() {
  return (
    <div className="logo">
      <span className="logo-crown" aria-hidden>
        ♜
      </span>
      <div>
        <div className="logo-title">KINGDOMS</div>
        <div className="logo-sub">UNBOUND</div>
      </div>
    </div>
  );
}

function AuthScreen({ onDone, onBack }: { onDone: () => void; onBack?: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/auth/${mode}`, { username, password });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="splash">
      <Logo />
      <p className="tagline">Construa sua cidade. Forje alianças. Dispute o reino.</p>
      <form className="card form" onSubmit={submit}>
        <div className="seg">
          <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')} data-testid="mode-register">
            Criar conta
          </button>
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')} data-testid="mode-login">
            Entrar
          </button>
        </div>
        <label>
          Usuário
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
            data-testid="username"
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={mode === 'register' ? 8 : 1}
            data-testid="password"
          />
        </label>
        {error && <div className="blocker">{error}</div>}
        <button className="btn primary wide" disabled={busy} data-testid="auth-submit">
          {mode === 'register' ? 'Criar conta e jogar' : 'Entrar'}
        </button>
        {onBack && (
          <button type="button" className="btn wide" onClick={onBack}>
            Voltar
          </button>
        )}
      </form>
    </div>
  );
}

function SetupScreen({ meta, me, onDone }: { meta: Meta; me: Me; onDone: () => void }) {
  const open = meta.kingdoms.filter((k) => k.status === 'open' && k.population < k.capacity);
  const [name, setName] = useState(me.username.slice(0, 16));
  const [civ, setCiv] = useState(meta.civilizations[0].id);
  const [kingdomId, setKingdomId] = useState(open[0]?.id ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/governor', { name, civilization: civ, kingdomId });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="splash scroll">
      <Logo />
      <form className="card form wide-card" onSubmit={submit}>
        <h2>Novo governador</h2>
        <label>
          Nome do governador
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} required data-testid="governor-name" />
        </label>
        <div className="label">Civilização</div>
        <div className="civ-grid">
          {meta.civilizations.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`civ ${civ === c.id ? 'on' : ''}`}
              onClick={() => setCiv(c.id)}
              style={{ borderColor: civ === c.id ? c.accent : undefined }}
              data-testid={`civ-${c.id}`}
            >
              <span className="civ-banner" style={{ background: c.color, color: c.accent }}>
                ⚑
              </span>
              <b>{c.name}</b>
              <span className="muted small">{c.description}</span>
              <i className="small">“{c.motto}”</i>
            </button>
          ))}
        </div>
        <div className="muted small">Mais civilizações serão liberadas em fases futuras.</div>
        <div className="label">Reino</div>
        <div className="kingdoms">
          {meta.kingdoms.map((k) => (
            <button
              type="button"
              key={k.id}
              disabled={k.status !== 'open' || k.population >= k.capacity}
              className={`kingdom ${kingdomId === k.id ? 'on' : ''}`}
              onClick={() => setKingdomId(k.id)}
              data-testid={`kingdom-${k.id}`}
            >
              <b>{k.name}</b>
              <span className="muted small">
                {k.population} governadores · {k.width}×{k.height}
              </span>
            </button>
          ))}
        </div>
        {error && <div className="blocker">{error}</div>}
        <button className="btn primary wide" disabled={busy} data-testid="governor-submit">
          Fundar minha cidade
        </button>
      </form>
    </div>
  );
}
