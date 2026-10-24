// Original balance v1. Not extracted from another game. Seconds kept short for the technical alpha.
export const RULES_VERSION = 1;
export const CAPACITY = 10000;
export const CIVILIZATIONS = {
  aurianos: { name: 'Aurianos', description: '+20% de alimento', bonus: 'food' },
  silvanos: { name: 'Silvanos', description: '+20% de madeira', bonus: 'wood' },
};
export const BUILDINGS = {
  hall: { name: 'Prefeitura', resource: null, wood: 120, stone: 80, seconds: 30 },
  farm: { name: 'Fazenda', resource: 'food', wood: 80, stone: 30, seconds: 15 },
  lumber: { name: 'Serraria', resource: 'wood', wood: 50, stone: 50, seconds: 15 },
  quarry: { name: 'Pedreira', resource: 'stone', wood: 80, stone: 20, seconds: 20 },
  mine: { name: 'Mina', resource: 'gold', wood: 100, stone: 80, seconds: 25 },
};
export const PERMISSIONS = { approve: [4, 5], reject: [4, 5], promote: [5] };
export function upgrade(kind, level) {
  const d = BUILDINGS[kind];
  return { wood: d.wood * (level + 1), stone: d.stone * (level + 1), seconds: d.seconds * (level + 1) };
}
