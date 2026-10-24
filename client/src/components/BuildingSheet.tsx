import { useState } from 'react';
import {
  BUILDINGS,
  type BuildingType,
  type CivilizationDef,
  productionPerHour,
  RESOURCE_LABELS,
  RESOURCE_TYPES,
  storageCapacity,
  upgradeBlocker,
  upgradeCost,
  upgradeDurationSec,
} from '../../../shared/rules';
import { api, ApiError, type CityState, newIdempotencyKey, serverNow } from '../api';
import { fmtDuration, fmtNum } from '../format';
import { useTick } from '../hooks';
import { buildingPortrait } from '../city/portrait';
import { IconClock, IconClose, RESOURCE_ICON } from '../icons';
import { projectResources } from './ResourceBar';

interface Props {
  building: BuildingType;
  city: CityState;
  civ: CivilizationDef;
  onClose: () => void;
  onState: (s: CityState) => void;
  onError: (msg: string) => void;
}

export function BuildingSheet({ building, city, civ, onClose, onState, onError }: Props) {
  useTick(500);
  const [busy, setBusy] = useState(false);
  const def = BUILDINGS[building];
  const level = city.levels[building];
  const cost = upgradeCost(building, level);
  const duration = upgradeDurationSec(building, level, city.civilization);
  const blocker = upgradeBlocker(building, city.levels);
  const res = projectResources(city);
  const missing = RESOURCE_TYPES.filter((r) => (cost[r] ?? 0) > res[r]);
  const queue = city.queue;
  const inProgress = queue?.building === building;
  const busyElsewhere = queue && !inProgress;

  let effect = '';
  if (def.produces) {
    const now = productionPerHour(city.levels, city.civilization)[def.produces];
    const next = productionPerHour({ ...city.levels, [building]: level + 1 }, city.civilization)[def.produces];
    effect = `${RESOURCE_LABELS[def.produces]}: ${fmtNum(now)}/h → ${fmtNum(next)}/h`;
  } else if (building === 'warehouse') {
    effect = `Capacidade: ${fmtNum(storageCapacity(city.levels))} → ${fmtNum(storageCapacity({ ...city.levels, warehouse: level + 1 }))}`;
  } else if (building === 'town_hall') {
    effect = `Libera edifícios até o nível ${level + 1}.`;
  }

  const upgrade = async () => {
    setBusy(true);
    // Uma chave por intenção: repetir o toque/reenvio não cobra duas vezes.
    const key = newIdempotencyKey();
    try {
      const r = await api.post<{ state: CityState }>('/city/upgrade', { building, idempotencyKey: key });
      onState(r.state);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Falha ao iniciar obra.');
    } finally {
      setBusy(false);
    }
  };

  let reason: string | null = blocker;
  if (!reason && busyElsewhere) reason = `Construtor ocupado: ${BUILDINGS[queue!.building].name}.`;
  if (!reason && missing.length) reason = `Faltam: ${missing.map((r) => RESOURCE_LABELS[r]).join(', ')}.`;

  return (
    <div className="sheet building-sheet" role="dialog" aria-label={def.name} data-testid="building-sheet">
      <div className="sheet-head">
        <img className="portrait" src={buildingPortrait(building, level, civ)} alt="" />
        <div className="sheet-title">
          <h2>{def.name}</h2>
          <div className="level-pill">{level === 0 ? 'Não construído' : `Nível ${level} / ${def.maxLevel}`}</div>
          <p className="muted small">{def.description}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar">
          <IconClose size={16} />
        </button>
      </div>
      {inProgress && queue ? (
        <div className="progress-block">
          <div className="progress-head">
            <span>Obra para o nível {queue.toLevel}</span>
            <b data-testid="queue-remaining">
              <IconClock size={14} /> {fmtDuration((queue.endsAt - serverNow()) / 1000)}
            </b>
          </div>
          <div className="bar">
            <div
              className="bar-fill"
              style={{ width: `${Math.min(100, ((serverNow() - queue.startedAt) / (queue.endsAt - queue.startedAt)) * 100)}%` }}
            />
          </div>
          <div className="muted small">O servidor conclui a obra mesmo com o jogo fechado.</div>
        </div>
      ) : level >= def.maxLevel ? (
        <div className="muted">Nível máximo atingido.</div>
      ) : (
        <>
          {effect && <div className="effect">{effect}</div>}
          <div className="costs">
            {RESOURCE_TYPES.filter((r) => cost[r]).map((r) => {
              const Icon = RESOURCE_ICON[r];
              return (
                <span key={r} className={(cost[r] ?? 0) > res[r] ? 'cost lack' : 'cost'} title={RESOURCE_LABELS[r]}>
                  <Icon size={16} /> {fmtNum(cost[r]!)}
                </span>
              );
            })}
            <span className="cost">
              <IconClock size={15} /> {fmtDuration(duration)}
            </span>
          </div>
          {reason && <div className="blocker">{reason}</div>}
          <button className="btn primary wide" disabled={busy || Boolean(reason)} onClick={upgrade} data-testid="upgrade-btn">
            {level === 0 ? 'Construir' : `Melhorar para nível ${level + 1}`}
          </button>
        </>
      )}
    </div>
  );
}
