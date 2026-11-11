// Contrato entre servidor e cliente para o estado do mundo (GET /api/play/state e eventos `play.*`).
import type { FlagSpec } from './flags';
import type { GameMode } from './rules';

export interface NationView {
  /** Id do governador dono da nação. */
  id: number;
  name: string;
  /** Cor do território (hex da paleta). */
  color: string;
  flag: FlagSpec;
  /** Versão da imagem enviada pelo jogador (GET /api/play/flag/:id?v=…), ou null se usa o desenho. */
  flagImage: number | null;
  /** Ponto de partida escolhido. */
  capital: string;
  foundedAt: number;
}

export interface OccupationView {
  id: number;
  nationId: number;
  region: string;
  /** Região do dono de onde a ocupação parte. */
  from: string;
  startedAt: number;
  endsAt: number;
}

export interface PlaySnapshot {
  serverTime: number;
  world: { id: number; name: string; mode: GameMode };
  /** Id da nação de quem pergunta, ou null se ainda não fundou. */
  me: number | null;
  nations: NationView[];
  /** Controle territorial: pares [região, nação]. Região ausente = neutra. */
  control: [string, number][];
  /** Ocupações em andamento. */
  occupations: OccupationView[];
}

/** Eventos em tempo real enviados a todos do mesmo mundo. */
export type PlayEvent =
  | { type: 'play.nation'; nation: NationView; region: string }
  | { type: 'play.occupation'; occupation: OccupationView }
  | { type: 'play.region'; region: string; nationId: number; occupationId: number | null; at: number }
  | { type: 'play.occupation.failed'; occupationId: number; region: string; nationId: number };

export interface FoundInput {
  pointId: string;
  name: string;
  color: string;
  flag: FlagSpec;
  /** Imagem da galeria já reduzida, em base64 (PNG ou JPEG). */
  flagImage?: string | null;
}
