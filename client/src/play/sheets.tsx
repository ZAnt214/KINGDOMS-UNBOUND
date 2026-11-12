import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
import type { Milestone } from '../../../shared/play/rules';
import { ECONOMY, slotsFor, STRUCTURES } from '../../../shared/play/economy';
import type { NationView, StructureView } from '../../../shared/play/types';
import { REGION_BY_ID } from '../../../shared/world/regions';
import { serverNow } from '../api';
import { Glyph } from './economyUi';
import { STRUCTURE_GLYPH } from './glyphs';
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
          <dt>Construções</dt>
          <dd>{stats.structures}</dd>
        </div>
        <div>
          <dt>Países dominados</dt>
          <dd>{stats.countries.length ? stats.countries.map((c) => COUNTRY_BY_CODE[c]?.name ?? c).join(', ') : 'Nenhum ainda'}</dd>
        </div>
      </dl>
      <p className="ku-note">Cada região vale 100 pontos, cada país dominado 400 e cada nível de construção 40.</p>
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
                    {` · poder ${s.nation.power.toLocaleString('pt-BR')}`}
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

export function SettingsSheet(p: {
  username: string;
  reduced: boolean;
  onReduced: (v: boolean) => void;
  /** Partida rápida em andamento: oferece abandonar. */
  quick: boolean;
  onSwitchMode: () => void;
  onLeave: () => Promise<void>;
  onLogout: () => void;
  onClose: () => void;
}) {
  const settings = useSyncExternalStore(
    (fn) => audio.subscribe(fn),
    () => audio.settings,
  );
  const [confirm, setConfirm] = useState<'logout' | 'leave' | null>(null);
  return (
    <Sheet title="Configurações" onClose={p.onClose} testId="settings-sheet">
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
      <button type="button" className="ku-toggle" aria-pressed={p.reduced} onClick={() => p.onReduced(!p.reduced)} data-testid="reduced-motion">
        <span className={`ku-switch ${p.reduced ? 'on' : ''}`} />
        Reduzir animações
      </button>
      <h4>Partida</h4>
      <button type="button" className="ku-btn" onClick={p.onSwitchMode} data-testid="switch-mode">
        Trocar de modo
      </button>
      {p.quick &&
        (confirm === 'leave' ? (
          <div className="ku-row">
            <button type="button" className="ku-btn danger" onClick={() => void p.onLeave()} data-testid="leave-confirm">
              Abandonar e perder
            </button>
            <button type="button" className="ku-btn" onClick={() => setConfirm(null)}>
              Continuar jogando
            </button>
          </div>
        ) : (
          <button type="button" className="ku-btn" onClick={() => setConfirm('leave')} data-testid="leave">
            Abandonar partida
          </button>
        ))}
      {p.quick && <p className="ku-note">Abandonar encerra a partida na hora e coloca sua nação em último lugar.</p>}
      <h4>Conta</h4>
      <p className="ku-note">
        Você entrou como <b>{p.username}</b>. Contas criadas pelo botão de início ficam guardadas só neste navegador: se os dados do site forem apagados, a nação fica sem dono.
      </p>
      {confirm === 'logout' ? (
        <div className="ku-row">
          <button type="button" className="ku-btn danger" onClick={p.onLogout} data-testid="logout-confirm">
            Sair agora
          </button>
          <button type="button" className="ku-btn" onClick={() => setConfirm(null)}>
            Ficar
          </button>
        </div>
      ) : (
        <button type="button" className="ku-btn" onClick={() => setConfirm('logout')} data-testid="logout">
          Sair da conta
        </button>
      )}
    </Sheet>
  );
}

/** Construções da nação por região: onde há espaço e o que já existe. */
export function BuildSheet(p: {
  regions: string[];
  capitalRegion: string | null;
  structures: StructureView[];
  onRegion: (id: string) => void;
  onStructure: (s: StructureView) => void;
  onClose: () => void;
}) {
  const ordered = [...p.regions].sort((a, b) => Number(b === p.capitalRegion) - Number(a === p.capitalRegion) || (REGION_BY_ID[a]?.name ?? '').localeCompare(REGION_BY_ID[b]?.name ?? ''));
  const now = serverNow();
  return (
    <Sheet title="Construções" onClose={p.onClose} testId="build-sheet">
      <p className="ku-note">Toque numa região para construir ali, ou numa construção para melhorar. Até {ECONOMY.buildQueue} obras ao mesmo tempo.</p>
      <ul className="ku-build-list">
        {ordered.map((rid) => {
          const items = p.structures.filter((s) => s.region === rid);
          const slots = slotsFor(rid, p.capitalRegion);
          return (
            <li key={rid}>
              <button type="button" className="ku-build-region" onClick={() => p.onRegion(rid)} data-testid={`build-region-${rid}`}>
                <b>
                  {REGION_BY_ID[rid]?.name}
                  {rid === p.capitalRegion ? ' · capital' : ''}
                </b>
                <small>
                  {items.length}/{slots} espaços
                </small>
              </button>
              <div>
                {items.map((s) => (
                  <button type="button" key={s.id} className="ku-mini" onClick={() => p.onStructure(s)} title={STRUCTURES[s.type].name}>
                    <Glyph d={STRUCTURE_GLYPH[s.type]} size={18} />
                    <small>{s.building ? `${Math.floor(Math.max(0, Math.min(1, (now - s.building.startedAt) / Math.max(1, s.building.endsAt - s.building.startedAt))) * 100)}%` : `N${s.level}`}</small>
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
