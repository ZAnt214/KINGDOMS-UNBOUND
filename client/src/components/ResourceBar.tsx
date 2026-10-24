import { RESOURCE_LABELS, RESOURCE_TYPES, type ResourceMap } from '../../../shared/rules';
import { type CityState, serverNow } from '../api';
import { fmtNum } from '../format';
import { useTick } from '../hooks';

const ICONS: Record<string, string> = { food: '🌾', wood: '🪵', stone: '🪨', gold: '🪙' };

/** Projeção visual da produção (mesma fórmula do servidor); o valor real vem da API. */
export function projectResources(city: CityState): ResourceMap {
  const hours = Math.max(0, (serverNow() - city.resourcesAt) / 3_600_000);
  const out = { ...city.resources };
  for (const r of RESOURCE_TYPES) {
    if (out[r] < city.capacity) out[r] = Math.min(city.capacity, out[r] + city.ratesPerHour[r] * hours);
  }
  return out;
}

export function ResourceBar({ city }: { city: CityState }) {
  useTick(1000);
  const res = projectResources(city);
  return (
    <div className="resources" role="list">
      {RESOURCE_TYPES.map((r) => (
        <div
          key={r}
          className={`res ${res[r] >= city.capacity ? 'full' : ''}`}
          role="listitem"
          title={`${RESOURCE_LABELS[r]}: ${Math.floor(res[r])} / ${city.capacity} · +${Math.round(city.ratesPerHour[r])}/h`}
          data-testid={`res-${r}`}
        >
          <span className="res-icon" aria-hidden>
            {ICONS[r]}
          </span>
          <span className="res-val">{fmtNum(res[r])}</span>
          <span className="res-rate">+{fmtNum(city.ratesPerHour[r])}/h</span>
        </div>
      ))}
    </div>
  );
}
