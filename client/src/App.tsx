import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Me, type Meta } from './api';
import { Emblem } from './play/icons';
import { PlayApp } from './play/PlayApp';
import './play/play.css';

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

/** Todo jogador precisa de um lugar no mundo da campanha; quem ainda não tem ganha agora. */
async function ensureCampaign(meta: Meta): Promise<void> {
  const me = await api.get<Me>('/me');
  if (me.worlds.some((w) => w.mode === 'campaign')) return;
  const world = meta.worlds.find((w) => w.mode === 'campaign' && w.status === 'open' && w.population < w.capacity);
  if (!world) throw new ApiError(409, 'world_full', 'Todos os mundos da campanha estão lotados.');
  for (let attempt = 0; ; attempt++) {
    try {
      await api.post('/governor', { name: `Comandante ${rand(4).toUpperCase()}`, kingdomId: world.id });
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
    void loadMe();
  }, [loadMe]);

  if (error && (!meta || me === undefined)) {
    return (
      <div className="ku-splash" role="alert">
        <p>{error}</p>
        <button type="button" className="ku-btn" onClick={() => location.reload()}>
          Tentar novamente
        </button>
      </div>
    );
  }
  if (!meta || me === undefined) {
    return (
      <div className="ku-splash" role="status">
        Conectando…
      </div>
    );
  }
  if (loginForm && !me) return <AuthScreen onDone={() => void loadMe().then(() => setLoginForm(false))} onBack={() => setLoginForm(false)} />;
  return (
    <PlayApp
      meta={meta}
      me={me}
      enter={async () => {
        if (!me) await quickAccount();
        await ensureCampaign(meta);
        await loadMe();
      }}
      reloadMe={loadMe}
      onLoginForm={() => setLoginForm(true)}
      onLogout={async () => {
        await api.post('/auth/logout').catch(() => {});
        setLoginForm(false);
        setMe(null);
      }}
    />
  );
}

function AuthScreen({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
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
    <div className="ku-root">
      <form className="ku-auth" onSubmit={submit}>
        <Emblem size={52} />
        <div className="ku-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')} data-testid="mode-login">
            Entrar
          </button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')} data-testid="mode-register">
            Criar conta
          </button>
        </div>
        <label className="ku-field">
          <span>Usuário</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required data-testid="username" />
        </label>
        <label className="ku-field">
          <span>Senha</span>
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
        {error && (
          <p className="ku-alert" role="alert">
            {error}
          </p>
        )}
        <button className="ku-cta" disabled={busy} data-testid="auth-submit">
          {mode === 'register' ? 'CRIAR CONTA' : 'ENTRAR'}
        </button>
        <button type="button" className="ku-link" onClick={onBack}>
          Voltar
        </button>
      </form>
    </div>
  );
}
