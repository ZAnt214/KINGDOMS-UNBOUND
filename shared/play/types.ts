// Contrato entre servidor e cliente (GET /api/play/state, rotas /api/play/* e eventos `play.*`).
import type { Cost, ResourceMap, StructureType } from './economy';
import type { FlagSpec } from './flags';
import type { OutcomeReason } from './match';
import type { Army, MilitaryPower, Research, TechType, UnitType } from './military';
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
  /** Nação controlada pelo servidor (partida rápida). */
  bot: boolean;
  /** Aliança ativa da nação (id), ou null. Define as conexões logísticas entre aliados. */
  alliance: number | null;
  /** Poder militar total (Fase D), público para comparar nações. */
  power: number;
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

export interface StructureView {
  id: number;
  nationId: number;
  region: string;
  type: StructureType;
  /** Posição [longitude, latitude] escolhida pelo jogador. */
  at: [number, number];
  /** Nível concluído (0 enquanto a primeira obra não termina). */
  level: number;
  /** Obra em andamento: nível que será alcançado, início e fim. */
  building: { to: number; startedAt: number; endsAt: number } | null;
}

/** Economia de quem pergunta. Saldo vale em `settledAt`; o cliente projeta com `rates`. */
export interface EconomyView {
  amounts: ResourceMap;
  settledAt: number;
  /** Produção por hora, já no ritmo do modo. */
  rates: ResourceMap;
  capacity: number;
  energy: { supply: number; demand: number };
  efficiency: number;
  /** Rede logística (Fase C): trechos de ferrovia, conexões com aliados e bônus médio. */
  logistics: { links: number; allyLinks: number; connected: number; averageBonus: number };
  /** Manutenção do exército por hora (Fase D), já descontada de `rates`. */
  upkeep: ResourceMap;
}

/** Exército da própria nação (Fase D). Outras nações só veem o poder total (`NationView.power`). */
export interface MilitaryView {
  recruits: { amount: number; settledAt: number; rate: number; cap: number };
  army: Army;
  /** Lotes na fila, em ordem; o primeiro está em treinamento. */
  training: { id: number; unit: UnitType; amount: number; startedAt: number; endsAt: number }[];
  research: Research;
  researching: { tech: TechType; to: number; startedAt: number; endsAt: number } | null;
  power: MilitaryPower;
}

export interface ResultView {
  nationId: number;
  rank: number;
  regions: number;
  area: number;
}

export interface WorldView {
  id: number;
  name: string;
  mode: GameMode;
  /** Regiões disponíveis (partida rápida); null = mundo inteiro. */
  arena: string[] | null;
  /** Fim previsto da partida (partida rápida, depois da fundação). */
  endsAt: number | null;
  finishedAt: number | null;
  outcome: OutcomeReason | null;
  winner: number | null;
  results: ResultView[];
}

export interface PlaySnapshot {
  serverTime: number;
  world: WorldView;
  /** Id da nação de quem pergunta, ou null se ainda não fundou. */
  me: number | null;
  nations: NationView[];
  /** Controle territorial: pares [região, nação]. Região ausente = neutra. */
  control: [string, number][];
  occupations: OccupationView[];
  structures: StructureView[];
  economy: EconomyView | null;
  /** Exército da própria nação (Fase D), ou null se ainda não fundou. */
  military: MilitaryView | null;
}

/** O que acabou de terminar (para o aviso e o som). */
export type MilitaryDone = { kind: 'training'; unit: UnitType; amount: number } | { kind: 'research'; tech: TechType; level: number };

/** Eventos em tempo real enviados a todos do mesmo mundo (e `play.economy` só ao dono). */
export type PlayEvent =
  | { type: 'play.nation'; nation: NationView; region: string }
  | { type: 'play.occupation'; occupation: OccupationView }
  | { type: 'play.region'; region: string; nationId: number; occupationId: number | null; at: number }
  | { type: 'play.occupation.failed'; occupationId: number; region: string; nationId: number }
  | { type: 'play.structure'; structure: StructureView; completed: boolean }
  | { type: 'play.economy'; economy: EconomyView }
  | { type: 'play.alliance'; nationId: number; alliance: number | null }
  | { type: 'play.military'; military: MilitaryView; done?: MilitaryDone }
  | { type: 'play.power'; nationId: number; power: number }
  | { type: 'play.match'; world: WorldView };

export interface FoundInput {
  pointId: string;
  name: string;
  color: string;
  flag: FlagSpec;
  /** Imagem da galeria já reduzida, em base64 (PNG ou JPEG). */
  flagImage?: string | null;
}

/** Mundos em que o usuário tem lugar (GET /api/me). */
export interface WorldSeat {
  id: number;
  name: string;
  mode: GameMode;
  governorId: number;
  finished: boolean;
  /** Fim previsto (partida rápida). */
  endsAt: number | null;
}

export type { Cost };
