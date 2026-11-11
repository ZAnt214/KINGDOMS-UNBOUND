import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
import type { Milestone } from '../../../shared/play/rules';
import type { NationView } from '../../../shared/play/types';
import { COUNTRY_BY_CODE } from '../../../shared/world';
import { audio } from './audio';
import { nationFlagSrc } from './identity';
import { IcClose, IcMute, IcSound } from './icons';
import { fmtArea, type NationStats } from './model';

export function Sheet({ title, onClose, children, testId }: { title: string; onClose: () => void; children: ReactNode; testId?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="ku-sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="ku-sheet" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <header>
          <h3>{title}</h3>
          <button type="button" className="ku-icon-btn" onClick={onClose} aria-label="Fechar">
            <IcClose />
          </button>
        </header>
        <div className="ku-sheet-body">{children}</div>
      </section>
    </div>
  );
}

export function NationSheet({ stats, milestones, area, onClose }: { stats: NationStats; milestones: { milestone: Milestone; value: number; done: boolean }[]; area: string; onClose: () => void }) {
  const { nation, level } = stats;
  return (
    <Sheet title={nation.name} onClose={onClose} testId="nation-sheet">
      <div className="ku-nation-head">
        <img src={nationFlagSrc(nation)} alt="Bandeira" />
        <div>
          <b>Nível {level.level}</b>
          <div className="ku-meter">
            <i>
              <u style={{ transform: `scaleX(${level.progress})` }} />
            </i>
            <span>
              {stats.xp} de {level.next} pontos para o nível {level.level + 1}
            </span>
          </div>
        </div>
      </div>
      <dl className="ku-facts">
        <div>
          <dt>Regiões</dt>
          <dd>{stats.regions.length}</dd>
        </div>
        <div>
          <dt>Área</dt>
          <dd>{area}</dd>
        </div>
        <div>
          <dt>Países dominados</dt>
          <dd>{stats.countries.length ? stats.countries.map((c) => COUNTRY_BY_CODE[c]?.name ?? c).join(', ') : 'Nenhum ainda'}</dd>
        </div>
      </dl>
      <p className="ku-note">Cada região vale 100 pontos e cada país dominado, 400. Recursos e recompensas entram com a economia.</p>
      <h4>Metas de expansão</h4>
      <ul className="ku-milestones">
        {milestones.map(({ milestone, value, done }) => (
          <li key={milestone.id} className={done ? 'done' : ''}>
            <span>{milestone.title}</span>
            <b>
              {value}/{milestone.target}
            </b>
            <i>
              <u style={{ transform: `scaleX(${value / milestone.target})` }} />
            </i>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function RankingSheet({ board, me, world, onPick, onClose }: { board: NationStats[]; me: number | null; world: string; onPick: (n: NationView) => void; onClose: () => void }) {
  return (
    <Sheet title="Ranking do mundo" onClose={onClose} testId="ranking-sheet">
      {board.length === 0 ? (
        <p className="ku-note">Nenhuma nação foi fundada em {world} ainda. A primeira pode ser a sua.</p>
      ) : (
        <ol className="ku-ranking">
          {board.map((s, i) => (
            <li key={s.nation.id} className={s.nation.id === me ? 'me' : ''}>
              <button type="button" onClick={() => onPick(s.nation)}>
                <em>{i + 1}</em>
                <img src={nationFlagSrc(s.nation)} alt="" />
                <span>
                  <b>{s.nation.name}</b>
                  <small>
                    {s.regions.length} {s.regions.length === 1 ? 'região' : 'regiões'} · {fmtArea(s.area)}
                    {s.countries.length > 0 && ` · ${s.countries.length} ${s.countries.length === 1 ? 'país' : 'países'}`}
                  </small>
                </span>
                <i style={{ background: s.nation.color }} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}

export function SettingsSheet({ username, reduced, onReduced, onLogout, onClose }: { username: string; reduced: boolean; onReduced: (v: boolean) => void; onLogout: () => void; onClose: () => void }) {
  const settings = useSyncExternalStore(
    (fn) => audio.subscribe(fn),
    () => audio.settings,
  );
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet title="Configurações" onClose={onClose} testId="settings-sheet">
      <div className="ku-setting">
        <label htmlFor="ku-music">Música ambiente</label>
        <input id="ku-music" type="range" min={0} max={1} step={0.05} value={settings.music} onChange={(e) => audio.update({ music: Number(e.target.value) })} data-testid="vol-music" />
      </div>
      <div className="ku-setting">
        <label htmlFor="ku-fx">Efeitos sonoros</label>
        <input
          id="ku-fx"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.effects}
          onChange={(e) => audio.update({ effects: Number(e.target.value) })}
          onPointerUp={() => audio.play('select')}
          data-testid="vol-effects"
        />
      </div>
      <button type="button" className="ku-toggle" aria-pressed={settings.muted} onClick={() => audio.update({ muted: !settings.muted })} data-testid="mute">
        {settings.muted ? <IcMute /> : <IcSound />}
        {settings.muted ? 'Som desligado' : 'Som ligado'}
      </button>
      <button type="button" className="ku-toggle" aria-pressed={reduced} onClick={() => onReduced(!reduced)} data-testid="reduced-motion">
        <span className={`ku-switch ${reduced ? 'on' : ''}`} />
        Reduzir animações
      </button>
      <h4>Conta</h4>
      <p className="ku-note">
        Você entrou como <b>{username}</b>. Contas criadas pelo botão de início ficam guardadas só neste navegador: se os dados do site forem apagados, a nação fica sem dono.
      </p>
      {confirm ? (
        <div className="ku-row">
          <button type="button" className="ku-btn danger" onClick={onLogout} data-testid="logout-confirm">
            Sair agora
          </button>
          <button type="button" className="ku-btn" onClick={() => setConfirm(false)}>
            Ficar
          </button>
        </div>
      ) : (
        <button type="button" className="ku-btn" onClick={() => setConfirm(true)} data-testid="logout">
          Sair da conta
        </button>
      )}
    </Sheet>
  );
}
