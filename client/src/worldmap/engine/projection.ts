export interface Projection {
  width: number;
  height: number;
  project(lon: number, lat: number): [number, number];
  unproject(x: number, y: number): [number, number];
}

const RAD = Math.PI / 180;

/**
 * Projeção cilíndrica de Miller: retangular (pan e zoom simples, pronta para ladrilhos regionais)
 * e com menos exagero polar que Mercator, o que mantém a Antártida visível sem dominar o mapa.
 */
export function millerProjection(width = 1000): Projection {
  const s = width / (2 * Math.PI);
  const yOf = (lat: number) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * RAD));
  const top = yOf(90);
  return {
    width,
    height: 2 * top * s,
    project: (lon, lat) => [(lon * RAD + Math.PI) * s, (top - yOf(Math.max(-90, Math.min(90, lat)))) * s],
    unproject: (x, y) => [(x / s - Math.PI) / RAD, (2.5 * (Math.atan(Math.exp((top - y / s) / 1.25)) - Math.PI / 4)) / RAD],
  };
}
