import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Me, type Meta } from './api';
import { Game } from './Game';

const QUICK_KEY = 'ku.quick-entry';
const rand = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => (b % 36).toString(36)).join('');

/**
 * Entrada rápida (fase de testes): em vez da tela de login, cria uma conta de comandante e entra.
 * Usa as mesmas rotas de cadastro do formulário, então o servidor continua validando tudo.
 * As credenciais geradas ficam neste navegador para a conta ser reencontrada se a sessão expirar;
 * é uma conta descartável, não um substituto de login para contas reais.
 */
async function quickEntry(meta: Meta): Promise<void> {
  let saved: { username: string; password: string } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(QUICK_KEY) ?? 'null');
  } catch {
    /* sem armazenamento: cria uma conta nova */
  }
  if (saved) {
    try {
      await api.post('/auth/login', saved);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      saved = null;
    }
  }
  if (!saved) {
    saved = { username: `cmd_${rand(8)}`, password: rand(24) };
    await api.post('/auth/register', saved);
    try {
      localStorage.setItem(QUICK_KEY, JSON.stringify(saved));
    } catch {
      /* a conta vale só enquanto a sessão durar */
    }
  }
  const me = await api.get<Me>('/me');
  if (me.governor) return;
  const kingdom = meta.kingdoms.find((k) => k.status === 'open' && k.population < k.capacity);
  if (!kingdom) throw new ApiError(409, 'kingdom_full', 'Todos os reinos estão lotados.');
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
  // `?login=1` (ou sair da conta) mostra o formulário de login em vez da entrada rápida.
  const [manual, setManual] = useState(() => new URLSearchParams(location.search).has('login'));

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
    return (
      <div className="splash">
        <Logo />
        <p className="muted">Conectando ao reino…</p>
      </div>
    );
  }
  if (!manual && (!me || !me.governor)) {
    return <QuickEntry meta={meta} onDone={loadMe} onManual={() => setManual(true)} />;
  }
  if (!me) return <AuthScreen onDone={loadMe} />;
  if (!me.governor) return <SetupScreen meta={meta} me={me} onDone={loadMe} />;
  return (
    <Game
      meta={meta}
      me={me}
      initialTab={manual ? 'city' : 'command'}
      reloadMe={loadMe}
      onLogout={async () => {
        await api.post('/auth/logout').catch(() => {});
        setManual(true);
        setMe(null);
      }}
    />
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

function QuickEntry({ meta, onDone, onManual }: { meta: Meta; onDone: () => void; onManual: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    quickEntry(meta)
      .then(() => !cancelled && onDone())
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Falha ao entrar.'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return (
    <div className="splash" data-testid="quick-entry">
      <Logo />
      {error ? (
        <>
          <p>{error}</p>
          <button className="btn primary" onClick={() => setAttempt((n) => n + 1)}>
            Tentar novamente
          </button>
          <button className="btn" onClick={onManual}>
            Entrar com usuário e senha
          </button>
        </>
      ) : (
        <p className="muted">Preparando seu centro de comando…</p>
      )}
    </div>
  );
}

function AuthScreen({ onDone }: { onDone: () => void }) {
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
