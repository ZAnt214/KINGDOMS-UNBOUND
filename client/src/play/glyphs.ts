// Ícones das construções e dos recursos: traços em grade de 24, usados tanto no HUD (SVG) quanto
// no mapa (Path2D). Desenhos próprios.
import type { Resource, StructureType } from '../../../shared/play/economy';
import type { UnitType } from '../../../shared/play/military';

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
  // Escudo com divisa (insígnia de base).
  military_base: 'M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6zM8 11l4 3 4-3M8 15l4 3 4-3',
  // Alvo de tiro com marcas.
  training_center: 'M12 4a8 8 0 1 0 .01 0M12 8a4 4 0 1 0 .01 0M12 11.5a.5.5 0 1 0 .01 0M12 2v3M12 19v3M2 12h3M19 12h3',
  // Engrenagem com projétil.
  arms_factory: 'M3 20V10l5 3v-3l5 3V7h8v13zM3 20h18M15.5 10v6M17.5 10v6M15.5 10q1-2 2 0',
  // Avião visto de cima.
  air_base: 'M12 2.5c.9 0 1.4 1 1.4 2.4V9l7.6 4.6v2l-7.6-2.2v4.4l2.4 1.8v1.6L12 20.4l-3.8.8v-1.6l2.4-1.8v-4.4L3 15.6v-2L10.6 9V4.9c0-1.4.5-2.4 1.4-2.4z',
  // Navio de guerra sobre a água.
  naval_base: 'M3 15h18l-2.5 4h-13zM6 15v-3h7v3M8 12V9h3v3M13 12h4l1 3M2 21c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1',
  // Torre de radar com ameias.
  defense_center: 'M5 21V9h14v12M3 9h18M5 9V5h2v2h2V5h2v2h2V5h2v2h2V5h2v4M10 21v-5h4v5',
  // Silo: tampa aberta sobre o poço, com o míssil apontado para cima.
  missile_silo: 'M3 21h18M6 21v-6h12v6M4 15l4-3M20 15l-4-3M12 3l2 3v7h-4V6zM10 13l-1.5 2M14 13l1.5 2',
  // Radar parabólico com onda.
  antimissile: 'M4 20h16M12 20v-6M6 9a6 6 0 0 0 10 4.5zM11 11.5 16.5 6M17 3.5a5 5 0 0 1 3.5 3.5M15.5 5a2.5 2.5 0 0 1 2 2',
};

/** Ícones das unidades (mesma grade de 24). Desenhos próprios. */
export const UNIT_GLYPH: Record<UnitType, string> = {
  // Capacete.
  infantry: 'M4 15a8 8 0 0 1 16 0zM2.5 15h19M9 15v3h6v-3M12 7v-2',
  // Veículo de transporte com rodas.
  mechanized: 'M3 16V11l3-3h10l4 4v4zM3 16h18M6 19a1.6 1.6 0 1 0 .01 0M12 19a1.6 1.6 0 1 0 .01 0M18 19a1.6 1.6 0 1 0 .01 0M9 11h3',
  // Carro de combate.
  armor: 'M4 13h16l-1.5 4h-13zM8 13V10h7v3M15 11h7M5 19.5h14a2.5 2.5 0 0 0 0-2.5H5a2.5 2.5 0 0 0 0 2.5',
  // Canhão.
  artillery: 'M4 18a3 3 0 1 0 .01 0M4 18l16-10M7 16l3 2M14 18h7M4 21h17',
  // Punhal sobre asa.
  special: 'M12 2l2 6v8l-2 2-2-2V8zM8 16h8M12 18v4M3 11c3 0 5 1 7 3M21 11c-3 0-5 1-7 3',
  // Muralha com escudo.
  defense: 'M3 21V10h3v3h3v-3h3v3h3v-3h3v3h3V10h0v11zM3 21h18M12 15l-2 1v2c0 1 1 2 2 2.5 1-.5 2-1.5 2-2.5v-2z',
  // Caça a jato.
  aviation: 'M12 2l1.5 5 7.5 6v2l-7.5-2.5L13 18l3 2v1.5L12 20l-4 1.5V20l3-2-.5-5.5L3 15v-2l7.5-6z',
  // Destróier.
  navy: 'M2 15h20l-3 5H5zM6 15v-3h10v3M9 12V8h3v4M12 8h5M14 10h3M10.5 8V5',
  // Míssil com aletas.
  missile: 'M12 2c1.5 1.5 2.5 4 2.5 7v8h-5V9c0-3 1-5.5 2.5-7zM9.5 13 7 17v2h2.5M14.5 13l2.5 4v2h-2.5M11 19.5h2l-1 2.5z',
};

/** Espadas cruzadas: operação militar. */
export const BATTLE_GLYPH = 'M4 4l9 9M4 4h3.5M4 4v3.5M20 4l-9 9M20 4h-3.5M20 4v3.5M9.5 14.5 6 18M14.5 14.5 18 18M4.5 16.5l3 3M19.5 16.5l-3 3';

/** Ícone genérico de pesquisa militar: frasco com engrenagem. */
export const RESEARCH_GLYPH = 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 15h9';

/** Escudo com estrela: poder militar. */
export const POWER_GLYPH = 'M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6zM12 8l1.2 2.5 2.8.4-2 1.9.5 2.7L12 14.2l-2.5 1.3.5-2.7-2-1.9 2.8-.4z';

export const RESOURCE_GLYPH: Record<Resource | 'energy', string> = {
  money: 'M12 3v18M16.5 7.5C16 5.5 14 5 12 5c-2.5 0-4.5 1-4.5 3.2 0 4.6 9 2.4 9 7 0 2.3-2 3.3-4.5 3.3-2.2 0-4.2-.8-4.8-2.8',
  materials: 'M3 18h18M5 18v-4h6v4M13 18v-4h6v4M8 14v-4h8v4',
  metal: 'M4 16l3-8h10l3 8zM4 16h16M9 8l-1 8M15 8l1 8',
  oil: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  tech: 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
  special: 'M12 3l7 6-7 12-7-12zM5 9h14M9 9l3 12 3-12',
  energy: 'M13 2 5 13h6l-1 9 8-11h-6l1-9z',
};
