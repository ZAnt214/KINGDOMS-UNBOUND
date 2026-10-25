import type { BuildingType } from '../../../shared/rules';
import buildingsUrl from './art/atlas/buildings.webp';
export { buildingsUrl };
export const BUILDING_FRAME: Record<BuildingType, { cell: number; groundY: number }> = {
  town_hall: { cell: 0, groundY: 360 },
  warehouse: { cell: 1, groundY: 354 },
  farm: { cell: 2, groundY: 350 },
  sawmill: { cell: 3, groundY: 326 },
  quarry: { cell: 4, groundY: 326 },
  gold_mine: { cell: 5, groundY: 328 },
};
