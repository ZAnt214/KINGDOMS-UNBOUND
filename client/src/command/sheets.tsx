import { type ReactNode, useEffect, useState } from 'react';
import { BUILDINGS, RESOURCE_LABELS, type ResourceType } from '../../../shared/rules';
import { api, ApiError, type CityState, type MapCity, serverNow, type WorldSnapshot } from '../api';
import { projectResources } from '../components/ResourceBar';
import { fmtDuration, fmtNum } from '../format';
import { useTick } from '../hooks';
import { Flag } from './hud';
import { IcClose } from './icons';
import { fmtClock, fmtPopulation, MODULES, type ModuleKey, RELATION_LABEL, type TerritoryInfo } from './model';

export function Sheet({ title, onClose, children, testid }: { title: string; onClose: () => void; children: ReactNode; testid?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="cc-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cc-sheet" role="dialog" aria-modal="true" aria-label={title} data-testid={testid ?? 'cc-sheet'}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="cc-icon-btn" onClick={onClose} aria-label="Fechar">
            <IcClose size={18} />
          </button>
        </header>
        <div className="cc-sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Aviso padrão para o que ainda não existe no servidor: explica, não finge. */
function Pending({ what, children }: { what: string; children?: ReactNode }) {
  return (
    <div className="cc-pending">
      <strong>{what} ainda não existe no servidor.</strong>
      <p>Nada aqui é simulado: quando o sistema entrar, esta tela passa a mostrar os dados reais do seu reino.</p>
      {children}
    </div>
  );
}

export function TerritoryDetails({ info }: { info: TerritoryInfo }) {
  const c = info.country;
  return (
    <>
      <div className="cc-detail-head">
        <Flag iso2={c.iso2} className="big" />
        <div>
          <div className="cc-detail-name">{c.name}</div>
          <div className="cc-muted">{c.continent}</div>
        </div>
      </div>
      <dl className="cc-grid">
        <div>
          <dt>Aliança controladora</dt>
          <dd style={{ color: info.bloc ? info.color : undefined }}>{info.bloc?.name ?? 'Neutro'}</dd>
        </div>
        <div>
          <dt>Estado diplomático</dt>
          <dd>{RELATION_LABEL[info.relation]}</dd>
        </div>
        <div>
          <dt>Situação militar</dt>
          <dd>{info.wars.length ? `Em disputa (${info.wars.length} frente${info.wars.length > 1 ? 's' : ''})` : 'Sem combates'}</dd>
        </div>
        <div>
          <dt>Capital</dt>
          <dd>{c.capital ?? '—'}</dd>
        </div>
        <div>
          <dt>População</dt>
          <dd>{fmtPopulation(c.population)}</dd>
        </div>
        <div>
          <dt>Jogador proprietário</dt>
          <dd className="cc-muted">Sem dono — a posse por jogador ainda não existe</dd>
        </div>
        <div>
          <dt>Tropas estacionadas</dt>
          <dd className="cc-muted">Indisponível — sem sistema de exércitos</dd>
        </div>
        <div>
          <dt>Recursos por hora</dt>
          <dd className="cc-muted">Indisponível — territórios ainda não produzem</dd>
        </div>
      </dl>
      <h3>Ações</h3>
      <ul className="cc-actions-list">
        {info.actions
          .filter((a) => a.key !== 'details')
          .map((a) => (
            <li key={a.key}>
              <button type="button" className="cc-btn" disabled={!a.allowed} data-testid={`cc-action-${a.key}`}>
                {a.label}
              </button>
              {a.reason && <span>{a.reason}</span>}
            </li>
          ))}
      </ul>
      <p className="cc-muted cc-small">População, capital e continente: Natural Earth. O controle vem do servidor do reino.</p>
    </>
  );
}

export function WarsSheet({ world }: { world: WorldSnapshot }) {
  useTick(1000);
  const name = (id: number) => world.blocs.find((b) => b.id === id)?.name ?? '—';
  if (!world.wars.length) {
    return (
      <>
        <p>Nenhuma guerra em andamento neste reino.</p>
        {!world.systems.wars && <Pending what="A declaração de guerra" />}
      </>
    );
  }
  return (
    <ul className="cc-list">
      {world.wars.map((w) => (
        <li key={w.id}>
          <strong>
            {name(w.attackerBlocId)} × {name(w.defenderBlocId)}
          </strong>
          <span>{w.theater}</span>
          <em>{fmtClock(serverNow() - w.startedAt)}</em>
        </li>
      ))}
    </ul>
  );
}

export function RankingSheet({ world, cities, myCityId }: { world: WorldSnapshot; cities: MapCity[]; myCityId: number }) {
  const blocs = [...world.blocs].sort((a, b) => b.territories - a.territories);
  const governors = [...cities].sort((a, b) => b.power - a.power).slice(0, 20);
  return (
    <>
      <h3>Blocos por territórios</h3>
      <ol className="cc-rank">
        {blocs.map((b) => (
          <li key={b.id}>
            <i className="cc-dot" style={{ background: b.color }} />
            <span>{b.name}</span>
            <em>
              {b.territories} países · {b.members} {b.members === 1 ? 'comandante' : 'comandantes'}
            </em>
          </li>
        ))}
      </ol>
      <h3>Comandantes do reino por poder</h3>
      {governors.length ? (
        <ol className="cc-rank">
          {governors.map((g) => (
            <li key={g.cityId} className={g.cityId === myCityId ? 'mine' : ''}>
              <span>
                {g.allianceTag && `[${g.allianceTag}] `}
                {g.name}
              </span>
              <em>{fmtNum(g.power)}</em>
            </li>
          ))}
        </ol>
      ) : (
        <p className="cc-muted">Nenhum comandante encontrado.</p>
      )}
    </>
  );
}

export function PendingSheet({ what }: { what: string }) {
  return <Pending what={what} />;
}

export function ModuleSheet({ module, city, onOpenCity }: { module: ModuleKey; city: CityState; onOpenCity: () => void }) {
  useTick(1000);
  const def = MODULES[module];
  if (def.system === 'city') {
    const q = city.queue;
    return (
      <>
        <p>As obras acontecem na sua cidade, com custo e tempo controlados pelo servidor.</p>
        <div className="cc-callout">
          {q ? (
            <>
              <strong>
                {BUILDINGS[q.building].name} → nível {q.toLevel}
              </strong>
              <span>Termina em {fmtDuration((q.endsAt - serverNow()) / 1000)}</span>
            </>
          ) : (
            <strong>Nenhuma obra em andamento.</strong>
          )}
        </div>
        <button type="button" className="cc-btn gold" onClick={onOpenCity} data-testid="cc-open-city">
          Abrir cidade
        </button>
        <Pending what="A construção de bases, aeroportos, portos e refinarias nos territórios" />
      </>
    );
  }
  return (
    <>
      <Pending what={def.system === 'research' ? 'A pesquisa' : 'O sistema de exércitos'} />
      <h3>O que este módulo vai reunir</h3>
      <ul className="cc-scope">
        {def.scope.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </>
  );
}

export function ResourceSheet({ resource, city, onOpenCity }: { resource: ResourceType; city: CityState; onOpenCity: () => void }) {
  useTick(1000);
  const value = projectResources(city)[resource];
  return (
    <>
      <dl className="cc-grid">
        <div>
          <dt>Em estoque</dt>
          <dd>{Math.floor(value).toLocaleString('pt-BR')}</dd>
        </div>
        <div>
          <dt>Capacidade do armazém</dt>
          <dd>{city.capacity.toLocaleString('pt-BR')}</dd>
        </div>
        <div>
          <dt>Produção</dt>
          <dd>+{Math.round(city.ratesPerHour[resource]).toLocaleString('pt-BR')}/h</dd>
        </div>
      </dl>
      <p className="cc-muted">
        {RESOURCE_LABELS[resource]} vem dos edifícios da cidade. Para produzir mais, melhore o edifício correspondente ou o armazém.
      </p>
      <button type="button" className="cc-btn gold" onClick={onOpenCity}>
        Abrir cidade
      </button>
    </>
  );
}

export interface MapSettings {
  labels: boolean;
  cities: boolean;
  grid: boolean;
  reducedMotion: boolean;
}

const SETTING_LABEL: Record<keyof MapSettings, string> = {
  labels: 'Nomes dos países',
  cities: 'Cidades ao aproximar',
  grid: 'Grade de coordenadas',
  reducedMotion: 'Reduzir animações',
};

export function SettingsSheet({ settings, onChange, onOpenCity, onLogout }: { settings: MapSettings; onChange: (s: MapSettings) => void; onOpenCity: () => void; onLogout: () => void }) {
  return (
    <>
      <h3>Mapa</h3>
      <ul className="cc-toggles">
        {(Object.keys(SETTING_LABEL) as (keyof MapSettings)[]).map((k) => (
          <li key={k}>
            <label>
              <input type="checkbox" checked={settings[k]} onChange={(e) => onChange({ ...settings, [k]: e.target.checked })} />
              {SETTING_LABEL[k]}
            </label>
          </li>
        ))}
      </ul>
      <div className="cc-row">
        <button type="button" className="cc-btn" onClick={onOpenCity}>
          Voltar à cidade
        </button>
        <button type="button" className="cc-btn" onClick={onLogout}>
          Sair da conta
        </button>
      </div>
    </>
  );
}

export function EnlistSheet({ world, onDone }: { world: WorldSnapshot; onDone: (w: WorldSnapshot) => void }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enlist = async (blocId: number) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.post<WorldSnapshot>('/world/enlist', { blocId }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível concluir o alistamento.');
      setBusy(false);
    }
  };
  return (
    <>
      <p>Escolha o bloco que você vai defender neste reino. A escolha é definitiva nesta versão.</p>
      <ul className="cc-blocs">
        {world.blocs.map((b) => (
          <li key={b.id}>
            <i className="cc-dot" style={{ background: b.color }} />
            <div>
              <strong>{b.name}</strong>
              <span>
                {b.territories} países · {b.members} {b.members === 1 ? 'comandante' : 'comandantes'}
              </span>
            </div>
            {confirm === b.id ? (
              <button type="button" className="cc-btn gold" disabled={busy} onClick={() => enlist(b.id)} data-testid="cc-enlist-confirm">
                Confirmar
              </button>
            ) : (
              <button type="button" className="cc-btn" disabled={busy} onClick={() => setConfirm(b.id)} data-testid={`cc-enlist-${b.key}`}>
                Alistar-se
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="cc-error">{error}</p>}
    </>
  );
}
