import type { nationLevel } from '../../../shared/play/rules';
import type { NationView } from '../../../shared/play/types';
import { serverNow } from '../api';
import { useTick } from '../hooks';
import type { RealtimeStatus } from '../realtime';
import { nationFlagSrc } from './identity';
import { IcBuild, IcCapital, IcClock, IcExpand, IcGear, IcGlobe, IcMinus, IcPlus, IcRanking } from './icons';
import { fmtClock, type NationStats } from './model';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
  flag?: string;
}

export interface BannerData {
  id: number;
  title: string;
  text: string;
  flag: string;
}

export function IdentityPill({ nation, level, onOpen }: { nation: NationView; level: ReturnType<typeof nationLevel>; onOpen: () => void }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <button type="button" className="ku-pill" onClick={onOpen} data-testid="identity-pill">
      <img src={nationFlagSrc(nation)} alt="" />
      <span>
        <b>{nation.name}</b>
        <small>Nível {level.level}</small>
      </span>
      <svg className="ku-level-ring" viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r={r} className="track" />
        <circle cx="18" cy="18" r={r} className="value" strokeDasharray={c} strokeDashoffset={c * (1 - level.progress)} />
        <text x="18" y="18">{level.level}</text>
      </svg>
    </button>
  );
}

export function StatChips({ stats, nations, status, onRanking, onSettings }: { stats: NationStats | null; nations: number; status: RealtimeStatus; onRanking: () => void; onSettings: () => void }) {
  return (
    <div className="ku-chips">
      {stats ? (
        <button type="button" className="ku-chip" onClick={onRanking} data-testid="stat-regions" aria-label={`${stats.regions.length} regiões, ${stats.countries.length} países dominados`}>
          <span>
            <b key={stats.regions.length} className="ku-count">
              {stats.regions.length}
            </b>
            <small>{stats.regions.length === 1 ? 'região' : 'regiões'}</small>
          </span>
          <span>
            <b key={stats.countries.length} className="ku-count">
              {stats.countries.length}
            </b>
            <small>{stats.countries.length === 1 ? 'país' : 'países'}</small>
          </span>
        </button>
      ) : (
        <button type="button" className="ku-chip" onClick={onRanking} data-testid="stat-nations">
          <IcGlobe width={16} height={16} />
          <span>
            <b>{nations}</b>
            <small>{nations === 1 ? 'nação' : 'nações'}</small>
          </span>
        </button>
      )}
      <button type="button" className="ku-icon-btn" onClick={onSettings} aria-label="Configurações" data-testid="open-settings">
        <IcGear />
        {status !== 'online' && <i className={`ku-net ${status}`} title={status === 'connecting' ? 'Conectando' : 'Sem conexão'} />}
      </button>
    </div>
  );
}

export function ObjectiveChip({ title, value, target }: { title: string; value: number; target: number }) {
  return (
    <div className="ku-objective" data-testid="objective">
      <span>{title}</span>
      <b>
        {value}/{target}
      </b>
      <i style={{ transform: `scaleX(${Math.min(1, value / target)})` }} />
    </div>
  );
}

export function OccupationCapsule({ name, startedAt, endsAt, onFocus }: { name: string; startedAt: number; endsAt: number; onFocus: () => void }) {
  useTick(250);
  const now = serverNow();
  const p = Math.max(0, Math.min(1, (now - startedAt) / Math.max(1, endsAt - startedAt)));
  return (
    <button type="button" className="ku-capsule" onClick={onFocus} data-testid="occupation">
      <span>
        Ocupando <b>{name}</b>
      </span>
      <span className="ku-capsule-num">
        {Math.floor(p * 100)}% · {fmtClock(endsAt - now)}
      </span>
      <i style={{ transform: `scaleX(${p})` }} />
    </button>
  );
}

export function Dock(p: { targets: number; occupying: boolean; building: number; onExpand: () => void; onCapital: () => void; onBuild: () => void; onRanking: () => void }) {
  return (
    <nav className="ku-dock" aria-label="Ações">
      <button type="button" onClick={p.onCapital} data-testid="dock-capital">
        <IcCapital />
        <span>Território</span>
      </button>
      <button type="button" className={`primary ${!p.occupying && p.targets > 0 ? 'ready' : ''}`} onClick={p.onExpand} data-testid="dock-expand">
        <IcExpand width={26} height={26} />
        <span>Expandir</span>
        {!p.occupying && p.targets > 0 && <em>{p.targets}</em>}
      </button>
      <button type="button" onClick={p.onBuild} data-testid="dock-build">
        <IcBuild />
        <span>Construções</span>
        {p.building > 0 && <em className="soft">{p.building}</em>}
      </button>
      <button type="button" onClick={p.onRanking} data-testid="dock-ranking">
        <IcRanking />
        <span>Ranking</span>
      </button>
    </nav>
  );
}

/** Tempo restante da partida rápida; fica vermelho no último minuto. */
export function MatchClock({ endsAt }: { endsAt: number }) {
  useTick(1000);
  const left = endsAt - serverNow();
  return (
    <span className={`ku-clock ${left < 60_000 ? 'urgent' : ''}`} data-testid="match-clock" aria-label="Tempo restante da partida">
      <IcClock width={15} height={15} />
      {fmtClock(left)}
    </span>
  );
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="ku-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`ku-toast ${t.tone}`}>
          {t.flag && <img src={t.flag} alt="" />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Banner({ data }: { data: BannerData }) {
  return (
    <div className="ku-banner" role="status" data-testid="banner">
      <img src={data.flag} alt="" />
      <b>{data.title}</b>
      <span>{data.text}</span>
    </div>
  );
}

export function ZoomButtons({ onIn, onOut, onHome }: { onIn: () => void; onOut: () => void; onHome: () => void }) {
  return (
    <div className="ku-zoom">
      <button type="button" onClick={onIn} aria-label="Aproximar">
        <IcPlus />
      </button>
      <button type="button" onClick={onOut} aria-label="Afastar">
        <IcMinus />
      </button>
      <button type="button" onClick={onHome} aria-label="Ver o mundo inteiro">
        <IcGlobe />
      </button>
    </div>
  );
}
