import { NATION_COLORS } from '../../../shared/play/rules';
import type { ReactNode } from 'react';
import { type Cost, missing } from '../../../shared/play/economy';
import type { EconomyView, NationView, OccupationView } from '../../../shared/play/types';
import { COUNTRY_BY_CODE } from '../../../shared/world';
import { landmassSize, REGION_BY_ID, type RegionDef, type StartPoint } from '../../../shared/world/regions';
import { serverNow } from '../api';
import { nationFlagSrc } from './identity';
import { IcClock, IcClose } from './icons';
import { useTick } from '../hooks';
import { amountsNow, CostLine, Glyph } from './economyUi';
import { POWER_GLYPH } from './glyphs';
import { fmtArea, fmtClock, fmtPeople, fmtSeconds } from './model';

function CountryLine({ code }: { code: string }) {
  const c = COUNTRY_BY_CODE[code];
  if (!c) return null;
  return (
    <span className="ku-country">
      {c.iso2 && <img src={`/flags/${c.iso2}.svg`} alt="" />}
      {c.name}
    </span>
  );
}

interface PointProps {
  point: StartPoint;
  color: string;
  blocked: string[];
  busy: boolean;
  error: string | null;
  onColor: (hex: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

/** Ponto de partida selecionado: o que o jogador recebe ao confirmar. */
export function PointCard({ point, color, blocked, busy, error, onColor, onConfirm, onClose }: PointProps) {
  const region = REGION_BY_ID[point.region];
  const reach = landmassSize(point.region);
  const colorBlocked = blocked.includes(color);
  return (
    <section className="ku-card" data-testid="point-card" aria-label={`Ponto de partida: ${point.name}`}>
      <button type="button" className="ku-card-close" onClick={onClose} aria-label="Fechar">
        <IcClose width={18} height={18} />
      </button>
      <header>
        <h3>{point.name}</h3>
        <p>
          {point.kind === 'capital' ? 'Capital' : 'Cidade estratégica'} · <CountryLine code={point.country} />
        </p>
      </header>
      <dl className="ku-facts">
        <div>
          <dt>Área inicial</dt>
          <dd>{region.name}</dd>
        </div>
        <div>
          <dt>Tamanho</dt>
          <dd>{fmtArea(region.area)}</dd>
        </div>
        <div>
          <dt>Fronteiras por terra</dt>
          <dd>{region.neighbors.length}</dd>
        </div>
        <div>
          <dt>População da cidade</dt>
          <dd>{fmtPeople(point.population)}</dd>
        </div>
      </dl>
      {reach < 6 && (
        <p className="ku-note">
          {reach === 1 ? 'Ilha sem vizinhos por terra' : `Só ${reach} regiões alcançáveis por terra`}: atravessar o mar exigirá operações navais, que ainda não estão disponíveis.
        </p>
      )}
      <div className="ku-swatches small" role="radiogroup" aria-label="Cor do território">
        {NATION_COLORS.map((c) => {
          const off = blocked.includes(c.hex);
          return (
            <button
              type="button"
              key={c.id}
              role="radio"
              aria-checked={color === c.hex}
              aria-label={off ? `${c.name} (em uso por nação vizinha)` : c.name}
              title={off ? `${c.name}: em uso por nação vizinha` : c.name}
              disabled={off}
              className={color === c.hex ? 'on' : ''}
              style={{ background: c.hex }}
              onClick={() => onColor(c.hex)}
            />
          );
        })}
      </div>
      {colorBlocked && !error && <p className="ku-alert">Uma nação vizinha já usa esta cor. Escolha outra para as fronteiras ficarem legíveis.</p>}
      {error && (
        <p className="ku-alert" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="ku-cta" onClick={onConfirm} disabled={busy || colorBlocked} data-testid="confirm-location">
        {busy ? 'Fundando…' : 'CONFIRMAR LOCALIZAÇÃO'}
      </button>
    </section>
  );
}

interface RegionProps {
  region: RegionDef;
  me: NationView;
  owner: NationView | null;
  occupation: OccupationView | null;
  occupier: (id: number) => NationView | null;
  canTarget: boolean;
  slotBusy: boolean;
  adjacent: boolean;
  seconds: number;
  /** Fração do país desta região já ocupada pelo jogador (por área). */
  countryShare: number;
  /** Custo da ocupação e economia de quem joga. */
  cost: Cost;
  economy: EconomyView | null;
  /** Fora da arena da partida rápida. */
  outside: boolean;
  busy: boolean;
  error: string | null;
  onOccupy: () => void;
  onClose: () => void;
  /** Conteúdo extra para região própria (construções). */
  children?: ReactNode;
}

/** Região selecionada: de quem é, quanto do país já é seu e o que dá para fazer agora. */
export function RegionCard(p: RegionProps) {
  useTick(p.occupation ? 250 : 1000);
  const have = amountsNow(p.economy);
  const short = have ? Object.keys(missing(have, p.cost)).length > 0 : true;
  const { region, me, owner, occupation } = p;
  const country = COUNTRY_BY_CODE[region.country];
  const mine = owner?.id === me.id;
  const by = occupation ? p.occupier(occupation.nationId) : null;
  const now = serverNow();
  const progress = occupation ? Math.max(0, Math.min(1, (now - occupation.startedAt) / Math.max(1, occupation.endsAt - occupation.startedAt))) : 0;

  let status: string;
  if (mine) status = 'Território da sua nação';
  else if (owner) status = `Território de ${owner.name}`;
  else if (occupation && by) status = by.id === me.id ? 'Sua ocupação está em andamento' : `Sendo ocupada por ${by.name}`;
  else status = 'Região neutra';

  let reason: string | null = null;
  if (p.outside) reason = 'Fora da área desta partida.';
  else if (!mine && owner) reason = 'Ataques a outras nações chegam na próxima fase. Por enquanto, compare o poder militar.';
  else if (!owner && !occupation && !p.adjacent) reason = 'Sem fronteira terrestre com o seu território.';
  else if (!owner && !occupation && p.slotBusy) reason = 'Aguarde a ocupação em andamento terminar.';

  return (
    <section className="ku-card" data-testid="region-card" aria-label={region.name}>
      <button type="button" className="ku-card-close" onClick={p.onClose} aria-label="Fechar">
        <IcClose width={18} height={18} />
      </button>
      <header>
        <h3>{region.name}</h3>
        <p>
          <CountryLine code={region.country} /> · {fmtArea(region.area)}
        </p>
      </header>
      <p className={`ku-status ${mine ? 'mine' : owner ? 'other' : ''}`}>
        {(owner || by) && <img src={nationFlagSrc((owner ?? by)!)} alt="" />}
        {status}
      </p>
      {owner && (
        <p className="ku-rail on" data-testid="owner-power">
          <Glyph d={POWER_GLYPH} size={16} />
          <span>
            Poder militar {mine ? 'da sua nação' : `de ${owner.name}`}: <b>{owner.power.toLocaleString('pt-BR')}</b>
            {!mine && me.power > 0 && <> · o seu: {me.power.toLocaleString('pt-BR')}</>}
          </span>
        </p>
      )}
      {country && !mine && (
        <div className="ku-meter" data-testid="country-share">
          <span>
            Sua ocupação de {country.name}: <b>{Math.floor(p.countryShare * 100)}%</b>
          </span>
          <i>
            <u style={{ transform: `scaleX(${p.countryShare})` }} />
          </i>
        </div>
      )}
      {occupation && (
        <div className="ku-meter">
          <span>
            Ocupação: <b>{Math.floor(progress * 100)}%</b> · faltam {fmtClock(occupation.endsAt - now)}
          </span>
          <i>
            <u style={{ transform: `scaleX(${progress})` }} />
          </i>
        </div>
      )}
      {reason && <p className="ku-note">{reason}</p>}
      {p.children}
      {p.canTarget && !occupation && (
        <div className="ku-row-cost">
          <span>Custo da ocupação</span>
          <CostLine cost={p.cost} have={have} />
        </div>
      )}
      {p.error && (
        <p className="ku-alert" role="alert">
          {p.error}
        </p>
      )}
      {p.canTarget && !occupation && (
        <button type="button" className="ku-cta" onClick={p.onOccupy} disabled={p.busy || short} data-testid="occupy">
          {p.busy ? 'Enviando…' : 'OCUPAR REGIÃO'}
          <small>
            <IcClock width={14} height={14} /> {fmtSeconds(p.seconds)}
          </small>
        </button>
      )}
    </section>
  );
}
