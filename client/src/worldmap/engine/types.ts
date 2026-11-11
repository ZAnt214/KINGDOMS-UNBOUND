// Contratos públicos do motor de mapa. Nada aqui conhece React, HUD ou regras do jogo.

export interface MapLabel {
  code: string;
  text: string;
  at: [number, number];
  rank: number;
}

export type MarkerKind = 'base' | 'airbase' | 'port' | 'army' | 'fleet' | 'squadron' | 'point';

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  lon: number;
  lat: number;
  color?: string;
  label?: string;
  /** Zoom relativo mínimo para aparecer (1 = mundo inteiro). */
  minZoom?: number;
}

/** Deslocamento entre dois pontos; a posição é interpolada pelo relógio informado ao motor. */
export interface MapRoute {
  id: string;
  from: [number, number];
  to: [number, number];
  departAt: number;
  arriveAt: number;
  color?: string;
}

export type MapPick =
  | { kind: 'region'; id: string; code: string; at: [number, number] }
  | { kind: 'marker'; id: string }
  | { kind: 'point'; id: string }
  | { kind: 'flag'; id: string }
  | { kind: 'structure'; id: string };

export interface MapEvents {
  select: MapPick | null;
  hover: { pick: MapPick; x: number; y: number } | null;
  view: { zoom: number; lon: number; lat: number };
}

export interface MapOptions {
  /** Relógio usado em rotas, ocupações e obras (no jogo: o relógio sincronizado com o servidor). */
  now?: () => number;
  neutralFill?: string;
  maxZoom?: number;
  reducedMotion?: boolean;
}

export interface RegionInfo {
  id: string;
  country: string;
  name: string;
  at: [number, number];
}

export type BuiltinLayer = 'graticule' | 'labels' | 'markers' | 'routes' | 'points' | 'flags' | 'structures';

/** Topologia de regiões gerada por tools/build-regions.mjs (arcos compartilhados, deltas quantizados). */
export interface RegionTopology {
  v: number;
  q: number;
  arcs: number[][];
  regions: { id: string; c: string; n: string; at: [number, number]; r: number[][] }[];
}

/** Território de um dono: conjunto de regiões pintado com uma cor e cercado por uma fronteira. */
export interface MapTerritory {
  id: string;
  color: string;
  regions: string[];
  /** Território de quem está jogando: fronteira mais forte. */
  own?: boolean;
}

/** Preenchimento progressivo de uma região, do ponto de origem para fora, guiado pelo relógio do motor. */
export interface MapFill {
  id: string;
  region: string;
  color: string;
  /** Origem em [longitude, latitude]; sem origem, parte do centro da região. */
  origin?: [number, number];
  /** Ou: a divisa com esta região é a origem. */
  fromRegion?: string;
  startAt: number;
  endAt: number;
}

/** Ponto de partida (capital ou local estratégico). */
export interface MapPoint {
  id: string;
  lon: number;
  lat: number;
  kind: 'capital' | 'strategic';
  state: 'free' | 'taken' | 'selected';
  label?: string;
}

export interface MapFlag {
  id: string;
  lon: number;
  lat: number;
  /** Imagem 3:2 já carregada; sem imagem desenha um retângulo na cor. */
  image: CanvasImageSource | null;
  color: string;
  /** 1 = bandeira de capital; maiores para países dominados. */
  scale?: number;
  label?: string;
  /** Zoom mínimo para aparecer; bandeiras assim cedem lugar quando não há espaço. */
  minZoom?: number;
  /** Instante (performance.now) em que foi fincada: anima a subida. */
  plantedAt?: number;
}

/** Construção no mapa: um selo com ícone no ponto exato onde foi erguida. */
export interface MapStructure {
  id: string;
  lon: number;
  lat: number;
  color: string;
  /** Caminho SVG do ícone (grade 24×24). */
  glyph: string;
  level: number;
  /** Obra em andamento (tempo do relógio do motor). */
  building?: { startAt: number; endAt: number } | null;
  /** Instante (performance.now) em que a obra terminou: anima a conclusão. */
  completedAt?: number;
  minZoom?: number;
  /** Construção do jogador: borda mais forte. */
  own?: boolean;
}

/** Modo de posicionamento: o próximo toque escolhe um ponto do mapa em vez de selecionar. */
export interface MapPlacement {
  glyph: string;
  color: string;
  /** Diz se a região sob o ponteiro aceita a construção (cor do fantasma). */
  accepts?: (regionId: string, at: [number, number]) => boolean;
  /** Pontas das ferrovias que surgiriam se a construção ficasse aqui (prévia). */
  links?: (regionId: string, at: [number, number]) => [number, number][];
}

/** Trecho de ferrovia (ou conexão entre aliados) entre duas construções. */
export interface MapRail {
  id: string;
  from: [number, number];
  to: [number, number];
  color: string;
  /** Conexão compartilhada entre aliados: tracejado dourado. */
  ally?: boolean;
  own?: boolean;
  /** Instante (performance.now) em que o trecho surgiu: a linha se desenha aos poucos. */
  appearAt?: number;
  minZoom?: number;
}

/** Efeitos de uma só vez. */
export type MapEffect =
  | { kind: 'beacon'; at: [number, number]; color: string; ms?: number }
  | { kind: 'conquest'; region: string; color: string; ms?: number }
  | { kind: 'ring'; at: [number, number]; color: string; ms?: number };
