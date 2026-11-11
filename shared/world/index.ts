// Dados estáticos dos países (Natural Earth), usados pelo cliente e pelo servidor.
// Quem controla o quê vive no banco; aqui só há definições.
import countriesJson from './countries.json';

export interface CountryDef {
  /** Código ADM0_A3 do Natural Earth (quase sempre o ISO 3166-1 alpha-3). */
  code: string;
  iso2: string | null;
  name: string;
  continent: string;
  sovereign: boolean;
  /** Estimativa do Natural Earth; dado geográfico, não saldo de jogo. */
  population: number;
  capital: string | null;
  capitalAt: [number, number] | null;
  labelAt: [number, number];
  labelRank: number;
}

export const COUNTRIES = countriesJson as CountryDef[];
export const COUNTRY_BY_CODE: Record<string, CountryDef> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));
