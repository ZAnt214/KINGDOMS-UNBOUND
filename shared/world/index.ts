// Mundo geopolítico: dados estáticos dos países, blocos e regras de ação por território.
// Usado pelo cliente (exibição) e pelo servidor (validação). O estado — quem controla o quê —
// vive no banco; aqui só há definições e funções puras.
import countriesJson from './countries.json';
import scenario from './scenario.json';

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

export interface BlocDef {
  key: string;
  name: string;
  color: string;
}

/**
 * Cenário inicial de cada reino: blocos, cores e distribuição dos países (decisão de cenário,
 * não dado do mundo real). Fica em `scenario.json`; depois de semeado, o estado vive no banco
 * (`world_blocs`, `world_territories`) e pode ser alterado lá. Países fora das listas começam neutros.
 */
export const WORLD_BLOCS: BlocDef[] = scenario.blocs.map(({ key, name, color }) => ({ key, name, color }));
export const NEUTRAL_COLOR: string = scenario.neutralColor;
export const INITIAL_CONTROL: Record<string, string[]> = Object.fromEntries(scenario.blocs.map((b) => [b.key, b.countries]));

/** Sistemas de jogo que as ações do mapa exigem. `false` = ainda não existe no servidor. */
export const WORLD_SYSTEMS = {
  armies: false,
  wars: false,
  diplomacy: false,
  espionage: false,
} as const;

export type TerritoryActionKey = 'details' | 'send_troops' | 'attack' | 'request_alliance' | 'declare_war' | 'negotiate' | 'spy';

export interface TerritoryAction {
  key: TerritoryActionKey;
  label: string;
  allowed: boolean;
  /** Motivo do bloqueio, mostrado ao jogador. */
  reason: string | null;
}

export interface TerritoryContext {
  myBlocId: number | null;
  territoryBlocId: number | null;
  atWar: boolean;
}

/**
 * Ações possíveis sobre um território. Mesma função no cliente (para explicar) e no servidor
 * (para autorizar): a interface nunca habilita algo que o servidor recusaria.
 */
export function territoryActions(ctx: TerritoryContext, systems: Record<keyof typeof WORLD_SYSTEMS, boolean> = WORLD_SYSTEMS): TerritoryAction[] {
  const mine = ctx.myBlocId !== null && ctx.myBlocId === ctx.territoryBlocId;
  const neutral = ctx.territoryBlocId === null;
  const noBloc = ctx.myBlocId === null ? 'Aliste-se em um bloco primeiro.' : null;
  const gate = (system: keyof typeof WORLD_SYSTEMS, name: string, rule: string | null): Pick<TerritoryAction, 'allowed' | 'reason'> => {
    if (noBloc) return { allowed: false, reason: noBloc };
    if (rule) return { allowed: false, reason: rule };
    if (!systems[system]) return { allowed: false, reason: `O sistema de ${name} ainda não existe no servidor.` };
    return { allowed: true, reason: null };
  };
  return [
    { key: 'details', label: 'Ver detalhes', allowed: true, reason: null },
    { key: 'send_troops', label: 'Enviar tropas', ...gate('armies', 'exércitos', mine ? null : 'Só é possível reforçar territórios do seu bloco.') },
    {
      key: 'attack',
      label: 'Iniciar ataque',
      ...gate('armies', 'exércitos', mine ? 'Este território já é do seu bloco.' : !neutral && !ctx.atWar ? 'Declare guerra antes de atacar.' : null),
    },
    {
      key: 'declare_war',
      label: 'Declarar guerra',
      ...gate('wars', 'guerras', mine ? 'Este território já é do seu bloco.' : neutral ? 'Territórios neutros não entram em guerra.' : ctx.atWar ? 'Vocês já estão em guerra.' : null),
    },
    {
      key: 'request_alliance',
      label: 'Solicitar aliança',
      ...gate('diplomacy', 'diplomacia', mine ? 'Este território já é do seu bloco.' : ctx.atWar ? 'Negocie a paz antes de propor aliança.' : null),
    },
    { key: 'negotiate', label: 'Negociar', ...gate('diplomacy', 'diplomacia', mine ? 'Este território já é do seu bloco.' : null) },
    { key: 'spy', label: 'Espionar', ...gate('espionage', 'inteligência', mine ? 'Este território já é do seu bloco.' : null) },
  ];
}

/**
 * Nível do comandante derivado do poder persistido do governador.
 * Curva inicial (decisão de balanceamento): o nível n exige 120·(n−1)² de poder.
 */
export function commanderLevel(power: number): { level: number; progress: number; next: number } {
  const p = Math.max(0, power);
  const level = Math.floor(Math.sqrt(p / 120)) + 1;
  const floor = 120 * (level - 1) ** 2;
  const next = 120 * level ** 2;
  return { level, progress: (p - floor) / (next - floor), next };
}
