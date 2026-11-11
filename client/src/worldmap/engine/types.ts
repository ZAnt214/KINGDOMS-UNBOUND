// Contratos públicos do motor de mapa. Nada aqui conhece React, HUD ou regras do jogo.

/** Geometria gerada por tools/build-world-data.mjs (anéis em deltas quantizados). */
export interface GeoData {
  v: number;
  q: number;
  countries: { id: string; p: number[][][] }[];
}

export interface CountryStyle {
  fill: string;
  /** Território em disputa: recebe hachura e contorno pulsante. */
  contested?: boolean;
}

export interface MapLabel {
  code: string;
  text: string;
  at: [number, number];
  rank: number;
}

export interface MapCity {
  /** nome */ n: string;
  /** país */ c: string;
  /** longitude */ x: number;
  /** latitude */ y: number;
  /** população */ p: number;
  /** capital nacional */ k: 0 | 1;
  /** relevância (0 = maior) */ r: number;
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

export interface MapView {
  /** Zoom relativo: 1 = mundo inteiro cabendo na tela. */
  zoom: number;
  lon: number;
  lat: number;
  width: number;
  height: number;
  /** Converte longitude/latitude em pixels da tela. */
  project(lon: number, lat: number): [number, number];
}

/** Camada extra desenhada sobre o mapa (regiões, frentes de invasão, névoa…). */
export interface MapLayer {
  id: string;
  minZoom?: number;
  maxZoom?: number;
  draw(ctx: CanvasRenderingContext2D, view: MapView): void;
}

export type MapPick = { kind: 'country'; code: string } | { kind: 'city'; code: string; city: MapCity } | { kind: 'marker'; id: string };

export interface MapEvents {
  select: MapPick | null;
  hover: { pick: MapPick; x: number; y: number } | null;
  view: { zoom: number; lon: number; lat: number };
}

export interface MapOptions {
  /** Relógio usado nas rotas (no jogo: o relógio sincronizado com o servidor). */
  now?: () => number;
  neutralFill?: string;
  maxZoom?: number;
  reducedMotion?: boolean;
}

export type BuiltinLayer = 'graticule' | 'labels' | 'cities' | 'markers' | 'routes';
