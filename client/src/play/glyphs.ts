// Ícones das construções e dos recursos: traços em grade de 24, usados tanto no HUD (SVG) quanto
// no mapa (Path2D). Desenhos próprios.
import type { Resource, StructureType } from '../../../shared/play/economy';

export const STRUCTURE_GLYPH: Record<StructureType, string> = {
  // Três prédios de alturas diferentes.
  city: 'M3 20V11h5v9M8 20V5h6v15M14 20v-8h7v8M3 20h18M10.5 8h1M10.5 11h1M10.5 14h1M17 15h1',
  // Galpão com chaminés e telhado em serra.
  factory: 'M3 20V11l5 3V11l5 3V11l5 3V5h3v15zM3 20h18M7 17h2M12 17h2',
  // Âncora.
  port: 'M12 4a2 2 0 1 0 0 .01M12 6v14M8 9h8M4 13c0 4 4 7 8 7s8-3 8-7M4 13l-1.5 2M20 13l1.5 2',
  // Torres de destilação.
  refinery: 'M5 20V8a2 2 0 0 1 4 0v12M15 20V5a2 2 0 0 1 4 0v15M9 12h6M9 16h6M3 20h18',
  // Raio dentro de um hexágono.
  power: 'M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1zM13 6.5 8.5 13h3.5l-1 4.5 4.5-6.5H12z',
  // Chip.
  tech: 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
  // Caixas empilhadas.
  depot: 'M4 12h7v8H4zM13 12h7v8h-7zM8.5 4h7v8h-7zM7.5 12v3M16.5 12v3M12 4v3',
};

export const RESOURCE_GLYPH: Record<Resource | 'energy', string> = {
  money: 'M12 3v18M16.5 7.5C16 5.5 14 5 12 5c-2.5 0-4.5 1-4.5 3.2 0 4.6 9 2.4 9 7 0 2.3-2 3.3-4.5 3.3-2.2 0-4.2-.8-4.8-2.8',
  materials: 'M3 18h18M5 18v-4h6v4M13 18v-4h6v4M8 14v-4h8v4',
  metal: 'M4 16l3-8h10l3 8zM4 16h16M9 8l-1 8M15 8l1 8',
  oil: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  tech: 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
  special: 'M12 3l7 6-7 12-7-12zM5 9h14M9 9l3 12 3-12',
  energy: 'M13 2 5 13h6l-1 9 8-11h-6l1-9z',
};
