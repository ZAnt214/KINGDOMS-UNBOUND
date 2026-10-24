import { buildingStage } from '../../../shared/cityLayout';
import type { BuildingType, CivilizationDef } from '../../../shared/rules';
import { farmSvg, goldMineSvg, quarrySvg, sawmillSvg, warehouseSvg } from './art/buildings';
import { plotSvg } from './art/props';
import { townHallSvg } from './art/townHall';

const cache = new Map<string, string>();

/** Retrato do edifício (mesma arte da cena) como data URL para painéis HTML. */
export function buildingPortrait(b: BuildingType, level: number, civ: CivilizationDef): string {
  const stage = buildingStage(level);
  const key = `${b}:${b === 'town_hall' ? level : stage}:${civ.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pal = { roof: civ.color, accent: civ.accent, stone: '#b9ae99' };
  const st = Math.max(1, stage) as 1 | 2 | 3;
  const svg =
    stage === 0
      ? plotSvg(3)
      : b === 'town_hall'
        ? townHallSvg(st, level, pal)
        : b === 'warehouse'
          ? warehouseSvg(st, pal)
          : b === 'farm'
            ? farmSvg(st, pal)
            : b === 'sawmill'
              ? sawmillSvg(st, pal)
              : b === 'quarry'
                ? quarrySvg(st, pal)
                : goldMineSvg(st);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.toString().svg)}`;
  cache.set(key, url);
  return url;
}
