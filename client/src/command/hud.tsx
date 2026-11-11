import { useEffect, useRef } from 'react';
import { RESOURCE_LABELS, RESOURCE_TYPES, type ResourceType } from '../../../shared/rules';
import { commanderLevel } from '../../../shared/world';
import type { CityState, WorldBloc, WorldSnapshot } from '../api';
import { serverNow } from '../api';
import { projectResources } from '../components/ResourceBar';
import { fmtNum } from '../format';
import { useTick } from '../hooks';
import { RESOURCE_ICON } from '../icons';
import type { RealtimeStatus } from '../realtime';
import type { WorldMapEngine } from '../worldmap/engine';
import {
  IcChevron,
  IcClipboard,
  IcCrate,
  IcFlask,
  IcGear,
  IcGlobe,
  IcHandshake,
  IcHelmet,
  IcInsignia,
  IcJet,
  IcMail,
  IcPlus,
  IcPower,
  IcShip,
  IcSwords,
  IcTank,
  IcTrophy,
} from './icons';
import { fmtClock, fmtPopulation, type ModuleKey, type TerritoryInfo } from './model';

export function Flag({ iso2, className = '' }: { iso2: string | null; className?: string }) {
  return iso2 ? (
    <img className={`cc-flag ${className}`} src={`/flags/${iso2}.svg`} alt="" loading="lazy" />
  ) : (
    <span className={`cc-flag cc-flag-none ${className}`} aria-hidden />
  );
}

export function TopBar(props: {
  name: string;
  city: CityState;
  bloc: WorldBloc | null;
  status: RealtimeStatus;
  unread: number;
  onResource: (r: ResourceType) => void;
  onMessages: () => void;
  onRanking: () => void;
  onSettings: () => void;
  onLogout: () => void;
}) {
  useTick(1000);
  const { city } = props;
  const res = projectResources(city);
  const lvl = commanderLevel(city.power);
  const pct = (lvl.progress * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return (
    <header className="cc-top">
      <div className="cc-commander" title={`Nível calculado a partir do poder: ${fmtNum(city.power)} de ${fmtNum(lvl.next)} para o próximo`}>
        <div className="cc-avatar" style={{ borderColor: props.bloc?.color }}>
          <IcInsignia size={26} />
        </div>
        <div className="cc-commander-info">
          <div className="cc-name" data-testid="cc-name">
            {props.name}
          </div>
          <div className="cc-level">
            <span>Nível {lvl.level}</span>
            <span className="cc-xp-pct">XP {pct}%</span>
          </div>
          <div className="cc-xp" role="progressbar" aria-valuenow={Math.round(lvl.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${lvl.progress * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="cc-resources" role="list">
        {RESOURCE_TYPES.map((r) => {
          const Icon = RESOURCE_ICON[r];
          return (
            <div className="cc-res" role="listitem" key={r} data-testid={`cc-res-${r}`}>
              <Icon size={24} />
              <span className="cc-res-val" title={RESOURCE_LABELS[r]}>
                {Math.floor(res[r]).toLocaleString('pt-BR')}
              </span>
              <button type="button" className="cc-res-add" onClick={() => props.onResource(r)} aria-label={`Detalhes de ${RESOURCE_LABELS[r]}`}>
                <IcPlus size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="cc-actions">
        <span className={`cc-net ${props.status}`} title={props.status === 'online' ? 'Conectado ao servidor' : 'Reconectando…'} />
        <button type="button" className="cc-icon-btn" onClick={props.onMessages} aria-label="Mensagens" title="Mensagens">
          <IcMail />
          {props.unread > 0 && <b className="cc-badge">{props.unread > 99 ? '99+' : props.unread}</b>}
        </button>
        <button type="button" className="cc-icon-btn" onClick={props.onRanking} aria-label="Ranking" title="Ranking">
          <IcTrophy />
        </button>
        <button type="button" className="cc-icon-btn" onClick={props.onSettings} aria-label="Configurações" title="Configurações">
          <IcGear />
        </button>
        <button type="button" className="cc-icon-btn" onClick={props.onLogout} aria-label="Sair" title="Sair">
          <IcPower />
        </button>
      </div>
    </header>
  );
}

export type NavKey = 'map' | 'wars' | 'alliances' | 'ranking' | 'missions' | 'shop';

const NAV: { key: NavKey; label: string; Icon: typeof IcGlobe }[] = [
  { key: 'map', label: 'Mapa mundial', Icon: IcGlobe },
  { key: 'wars', label: 'Guerras ativas', Icon: IcSwords },
  { key: 'alliances', label: 'Alianças', Icon: IcHandshake },
  { key: 'ranking', label: 'Ranking', Icon: IcTrophy },
  { key: 'missions', label: 'Missões', Icon: IcClipboard },
  { key: 'shop', label: 'Loja', Icon: IcCrate },
];

export function SideNav({ active, wars, onNav }: { active: NavKey; wars: number; onNav: (k: NavKey) => void }) {
  return (
    <nav className="cc-side" aria-label="Navegação">
      {NAV.map(({ key, label, Icon }) => (
        <button
          type="button"
          key={key}
          className={active === key ? 'on' : ''}
          aria-current={active === key ? 'page' : undefined}
          onClick={() => onNav(key)}
          data-testid={`cc-nav-${key}`}
          title={label}
        >
          <Icon size={key === 'map' ? 30 : 24} />
          <span>{label}</span>
          {key === 'wars' && wars > 0 && <b className="cc-badge">{wars}</b>}
        </button>
      ))}
    </nav>
  );
}

export function Legend({ world, onEnlist }: { world: WorldSnapshot; onEnlist: () => void }) {
  const neutral = world.territories.filter((t) => t.blocId === null).length;
  return (
    <aside className="cc-legend" data-testid="cc-legend">
      <h3>Alianças</h3>
      <ul>
        {world.blocs.map((b) => (
          <li key={b.id} className={b.id === world.myBlocId ? 'mine' : ''}>
            <i style={{ background: b.color }} />
            <span>{b.name}</span>
            <em>{b.territories}</em>
          </li>
        ))}
        <li>
          <i className="cc-neutral" />
          <span>Neutros</span>
          <em>{neutral}</em>
        </li>
      </ul>
      {world.myBlocId === null && (
        <button type="button" className="cc-link" onClick={onEnlist} data-testid="cc-enlist-open">
          Alistar-se em um bloco <IcChevron size={12} />
        </button>
      )}
    </aside>
  );
}

export function TerritoryPanel({ info, engine, onDetails, onFocus }: { info: TerritoryInfo | null; engine: WorldMapEngine | null; onDetails: () => void; onFocus: () => void }) {
  const thumb = useRef<HTMLCanvasElement>(null);
  const code = info?.country.code;
  const color = info?.color;
  useEffect(() => {
    if (engine && thumb.current && code && color) engine.renderThumbnail(code, thumb.current, color);
  }, [engine, code, color]);

  return (
    <section className="cc-territory" data-testid="cc-territory" aria-live="polite">
      <h3>Informações do território</h3>
      {!info ? (
        <p className="cc-empty">Toque em um país para ver quem o controla.</p>
      ) : (
        <>
          <div className="cc-territory-body">
            <button type="button" className="cc-thumb" onClick={onFocus} aria-label={`Centralizar ${info.country.name} no mapa`}>
              <canvas ref={thumb} />
            </button>
            <dl>
              <div className="cc-territory-name">
                <Flag iso2={info.country.iso2} />
                <strong data-testid="cc-territory-name">{info.country.name}</strong>
              </div>
              <div>
                <dt>Controle</dt>
                <dd style={{ color: info.bloc ? info.color : undefined }}>
                  <i className="cc-dot" style={{ background: info.color }} />
                  {info.bloc?.name ?? 'Neutro'}
                </dd>
              </div>
              <div>
                <dt>População</dt>
                <dd>{fmtPopulation(info.country.population)}</dd>
              </div>
              <div>
                <dt>Capital</dt>
                <dd>{info.country.capital ?? '—'}</dd>
              </div>
              <div>
                <dt>Situação</dt>
                <dd>{info.wars.length ? 'Em disputa' : info.relation === 'own' ? 'Do seu bloco, sem combates' : 'Sem combates'}</dd>
              </div>
            </dl>
          </div>
          <button type="button" className="cc-btn" onClick={onDetails} data-testid="cc-details">
            Ver detalhes <IcChevron size={14} />
          </button>
        </>
      )}
    </section>
  );
}

const DOCK: { key: ModuleKey; label: string; Icon: typeof IcTank }[] = [
  { key: 'army', label: 'Exército', Icon: IcTank },
  { key: 'air', label: 'Aviação', Icon: IcJet },
  { key: 'navy', label: 'Marinha', Icon: IcShip },
  { key: 'research', label: 'Pesquisa', Icon: IcFlask },
  { key: 'build', label: 'Construção', Icon: IcHelmet },
];

export function MilitaryDock({ onOpen }: { onOpen: (m: ModuleKey) => void }) {
  return (
    <div className="cc-dock" role="toolbar" aria-label="Módulos militares">
      {DOCK.map(({ key, label, Icon }) => (
        <button type="button" key={key} className={key === 'build' ? 'gold' : ''} onClick={() => onOpen(key)} data-testid={`cc-module-${key}`}>
          <Icon size={34} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export function WarPanel({ world, onOpen }: { world: WorldSnapshot; onOpen: () => void }) {
  useTick(1000);
  const mine = world.wars.find((w) => w.attackerBlocId === world.myBlocId || w.defenderBlocId === world.myBlocId);
  const war = mine ?? world.wars[0];
  const bloc = (id: number) => world.blocs.find((b) => b.id === id);
  return (
    <section className={`cc-war ${war ? 'active' : ''}`} data-testid="cc-war">
      <h3>
        <IcSwords size={18} /> {war ? 'Guerra em andamento' : 'Guerras'}
      </h3>
      {war ? (
        <>
          <div className="cc-war-sides">
            <span style={{ background: bloc(war.attackerBlocId)?.color }}>{bloc(war.attackerBlocId)?.name}</span>
            <em>vs</em>
            <span style={{ background: bloc(war.defenderBlocId)?.color }}>{bloc(war.defenderBlocId)?.name}</span>
          </div>
          <div className="cc-war-theater">{war.theater}</div>
          <div className="cc-war-clock">{fmtClock(serverNow() - war.startedAt)}</div>
          <button type="button" className="cc-btn gold" onClick={onOpen}>
            {mine ? 'Entrar na guerra' : 'Ver guerra'} <IcChevron size={14} />
          </button>
        </>
      ) : (
        <p className="cc-empty">Nenhuma guerra em andamento neste reino.</p>
      )}
    </section>
  );
}
