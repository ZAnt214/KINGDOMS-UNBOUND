import { useMemo } from 'react';
import {
  computeEconomy,
  type Cost,
  DEPOSIT_LABEL,
  ECONOMY,
  ENERGY_INFO,
  type EconomyInput,
  missing,
  project,
  type Resource,
  RESOURCE_INFO,
  RESOURCES,
  type ResourceMap,
  regionDeposit,
  STRUCTURE_TYPES,
  STRUCTURES,
  structureCost,
  structureSeconds,
  type StructureType,
} from '../../../shared/play/economy';
import { LOGISTICS } from '../../../shared/play/logistics';
import type { GameMode } from '../../../shared/play/rules';
import type { EconomyView, StructureView } from '../../../shared/play/types';
import { REGION_BY_ID, REGIONS } from '../../../shared/world/regions';
import { serverNow } from '../api';
import { useTick } from '../hooks';
import { RESOURCE_GLYPH, STRUCTURE_GLYPH } from './glyphs';
import { IcClock, IcClose } from './icons';
import { fmtAmount, fmtClock, fmtRate, fmtSeconds } from './model';

/** Região sem jazida: a prévia da barra mostra a produção base, sem bônus de jazida. */
const PLAIN_REGION = REGIONS.find((r) => regionDeposit(r.id) === null)!.id;
import { Sheet } from './sheets';

export function Glyph({ d, size = 18, color = 'currentColor', width = 1.9 }: { d: string; size?: number; color?: string; width?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export const amountsNow = (economy: EconomyView | null): ResourceMap | null =>
  economy ? project(economy.amounts, economy.settledAt, economy.rates, economy.capacity, serverNow()) : null;

/**
 * Saldo projetado agora (o servidor manda o valor num instante e a produção; o cliente só
 * interpola). Re-renderiza só o componente que usa, uma vez por segundo.
 */
export function useAmounts(economy: EconomyView | null): ResourceMap | null {
  useTick(1000);
  return amountsNow(economy);
}

const STRIP: Resource[] = ['money', 'materials', 'metal', 'oil'];

/** Recursos principais no topo da tela. Tocar abre o painel de economia. */
export function ResourceStrip({ economy, onOpen }: { economy: EconomyView; onOpen: () => void }) {
  const have = useAmounts(economy)!;
  const short = economy.energy.demand > economy.energy.supply;
  return (
    <button type="button" className="ku-resources" onClick={onOpen} data-testid="resources" aria-label="Recursos e produção">
      {STRIP.map((r) => {
        const full = have[r] >= economy.capacity - 0.5;
        return (
          <span key={r} className={full ? 'full' : ''} title={RESOURCE_INFO[r].name}>
            <Glyph d={RESOURCE_GLYPH[r]} size={15} color={RESOURCE_INFO[r].color} />
            <b>{fmtAmount(have[r])}</b>
          </span>
        );
      })}
      <span className={short ? 'short' : ''} title={ENERGY_INFO.name}>
        <Glyph d={RESOURCE_GLYPH.energy} size={15} color={short ? '#ff6b6b' : '#ffe066'} />
        <b>
          {economy.energy.demand}/{economy.energy.supply}
        </b>
      </span>
    </button>
  );
}

/** Lista de custo: cada recurso em vermelho quando falta. */
export function CostLine({ cost, have }: { cost: Cost; have: ResourceMap | null }) {
  const lack = have ? missing(have, cost) : {};
  return (
    <span className="ku-cost">
      {(Object.entries(cost) as [Resource, number][]).map(([r, v]) => (
        <span key={r} className={lack[r] ? 'lack' : ''} title={`${RESOURCE_INFO[r].name}${lack[r] ? `: faltam ${fmtAmount(lack[r]!)}` : ''}`}>
          <Glyph d={RESOURCE_GLYPH[r]} size={13} color={RESOURCE_INFO[r].color} />
          {fmtAmount(v)}
        </span>
      ))}
    </span>
  );
}

/** Quanto a produção muda se a construção passar do nível `from` ao `from + 1`. */
function productionDelta(input: EconomyInput, mode: GameMode, structure: StructureView | null, type: StructureType, region: string, from: number) {
  const before = computeEconomy(input, mode);
  const others = structure ? input.structures.filter((s) => s.id !== structure.id) : input.structures;
  const next = structure ? { id: structure.id, at: structure.at, type, level: from + 1, region } : { type, level: from + 1, region };
  const after = computeEconomy({ ...input, structures: [...others, next] }, mode);
  const delta: Partial<ResourceMap> = {};
  for (const r of RESOURCES) {
    const d = after.rates[r] - before.rates[r];
    if (Math.abs(d) >= 0.5) delta[r] = d;
  }
  return { delta, capacity: after.capacity - before.capacity, energy: { supply: after.energy.supply - before.energy.supply, demand: after.energy.demand - before.energy.demand }, efficiency: after.efficiency - before.efficiency, after };
}

interface PanelProps {
  type: StructureType;
  region: string;
  /** Construção existente (melhoria) ou null (nova). */
  structure: StructureView | null;
  own: boolean;
  ownerName?: string;
  input: EconomyInput | null;
  mode: GameMode;
  economy: EconomyView | null;
  /** Quantas do tipo a nação já tem (encarece a nova). */
  sameType: number;
  /** Motivo de bloqueio vindo das regras (null = pode). */
  problem: string | null;
  /** Rede logística desta construção: trechos próprios, conexões com aliados e bônus atual. */
  rail?: { links: number; ally: number; bonus: number } | null;
  busy: boolean;
  error: string | null;
  onAct: () => void;
  onClose: () => void;
}

/** Painel de uma construção: nome, ícone, nível, custo, tempo, produção, benefícios e CONSTRUIR/MELHORAR. */
export function StructurePanel(p: PanelProps) {
  useTick(p.structure?.building ? 250 : 1000);
  const have = amountsNow(p.economy);
  const def = STRUCTURES[p.type];
  const level = p.structure?.level ?? 0;
  const building = p.structure?.building ?? null;
  const maxed = level >= ECONOMY.maxLevel;
  const cost = maxed ? {} : structureCost(p.type, level, p.structure ? 0 : p.sameType);
  const seconds = structureSeconds(p.type, level, p.mode);
  const preview = useMemo(
    () => (p.input && !maxed ? productionDelta(p.input, p.mode, p.structure, p.type, p.region, level) : null),
    [p.input, p.mode, p.structure, p.type, p.region, level, maxed],
  );
  const lack = have ? missing(have, cost) : {};
  const short = Object.keys(lack).length > 0;
  const now = serverNow();
  const progress = building ? Math.max(0, Math.min(1, (now - building.startedAt) / Math.max(1, building.endsAt - building.startedAt))) : 0;
  const deposit = def.deposit && regionDeposit(p.region) === def.deposit;
  return (
    <section className="ku-card ku-structure" data-testid="structure-panel" aria-label={def.name}>
      <button type="button" className="ku-card-close" onClick={p.onClose} aria-label="Fechar">
        <IcClose width={18} height={18} />
      </button>
      <header className="ku-structure-head">
        <span className="ku-structure-icon">
          <Glyph d={STRUCTURE_GLYPH[p.type]} size={30} />
        </span>
        <div>
          <h3>{def.name}</h3>
          <p>
            {REGION_BY_ID[p.region]?.name} · {p.structure ? `Nível ${level}` : 'Nova'} · {def.tier}
          </p>
        </div>
      </header>
      <p className="ku-note">{def.role}</p>
      {p.rail && level > 0 && (
        <p className={`ku-rail ${p.rail.links + p.rail.ally ? 'on' : ''}`} data-testid="structure-rail">
          <Glyph d={RAIL_GLYPH} size={16} />
          {p.rail.links + p.rail.ally === 0 ? (
            <span>Sem ferrovia. Construa a até {LOGISTICS.rangeKm} km, na mesma região ou numa vizinha, para ligar.</span>
          ) : (
            <span>
              {p.rail.links > 0 && `${p.rail.links} ${p.rail.links === 1 ? 'trecho' : 'trechos'} de ferrovia`}
              {p.rail.links > 0 && p.rail.ally > 0 && ' e '}
              {p.rail.ally > 0 && `${p.rail.ally} ${p.rail.ally === 1 ? 'conexão' : 'conexões'} com aliado`}: <b>+{Math.round(p.rail.bonus * 100)}% de produção</b>
            </span>
          )}
        </p>
      )}
      {!p.own && p.ownerName && <p className="ku-status other">Pertence a {p.ownerName}</p>}
      {building && (
        <div className="ku-meter">
          <span>
            Obra para o nível {building.to}: <b>{Math.floor(progress * 100)}%</b> · faltam {fmtClock(building.endsAt - now)}
          </span>
          <i>
            <u style={{ transform: `scaleX(${progress})` }} />
          </i>
        </div>
      )}
      {p.own && !building && !maxed && (
        <>
          <dl className="ku-facts">
            <div>
              <dt>{p.structure ? `Nível ${level} → ${level + 1}` : 'Custo'}</dt>
              <dd>
                <CostLine cost={cost} have={have} />
              </dd>
            </div>
            <div>
              <dt>Tempo de obra</dt>
              <dd>{fmtSeconds(seconds)}</dd>
            </div>
          </dl>
          {preview && (
            <ul className="ku-gains" aria-label="Efeito">
              {(Object.entries(preview.delta) as [Resource, number][]).map(([r, v]) => (
                <li key={r}>
                  <Glyph d={RESOURCE_GLYPH[r]} size={14} color={RESOURCE_INFO[r].color} />
                  {fmtRate(v)} {RESOURCE_INFO[r].short.toLowerCase()}
                </li>
              ))}
              {preview.capacity > 0 && <li>+{fmtAmount(preview.capacity)} de estoque máximo</li>}
              {preview.energy.supply > 0 && <li>+{preview.energy.supply} de energia</li>}
              {preview.energy.demand > 0 && <li className="cost">consome {preview.energy.demand} de energia</li>}
              {def.efficiency && <li>+{Math.round(def.efficiency * 100)}% de eficiência em todas as construções (até {ECONOMY.maxEfficiencyBonus * 100}%)</li>}
              {deposit && <li className="bonus">{DEPOSIT_LABEL[def.deposit!]}: +{ECONOMY.depositBonus * 100}%</li>}
            </ul>
          )}
        </>
      )}
      {maxed && <p className="ku-note">Nível máximo alcançado.</p>}
      {p.own && !building && !maxed && (p.problem || short) && <p className="ku-note">{p.problem ?? 'Recursos insuficientes: os valores em vermelho ainda faltam.'}</p>}
      {p.error && (
        <p className="ku-alert" role="alert">
          {p.error}
        </p>
      )}
      {p.own && !building && !maxed && (
        <button type="button" className="ku-cta" onClick={p.onAct} disabled={p.busy || !!p.problem || short} data-testid="structure-act">
          {p.busy ? 'Enviando…' : p.structure ? 'MELHORAR' : 'CONSTRUIR'}
          <small>
            <IcClock width={14} height={14} /> {fmtSeconds(seconds)}
          </small>
        </button>
      )}
    </section>
  );
}

/**
 * Barra de construção: escolhe o tipo e o mapa entra em modo de posicionamento. Cada toque no
 * próprio território ergue uma construção ali; a barra continua aberta para a próxima.
 */
export function BuildBar(p: {
  economy: EconomyView | null;
  selected: StructureType | null;
  sameType: (t: StructureType) => number;
  input: EconomyInput | null;
  mode: GameMode;
  queue: number;
  onSelect: (t: StructureType | null) => void;
  onClose: () => void;
}) {
  const have = useAmounts(p.economy);
  const sel = p.selected;
  const cost = sel ? structureCost(sel, 0, p.sameType(sel)) : null;
  const preview = useMemo(() => {
    if (!sel || !p.input) return null;
    const before = computeEconomy(p.input, p.mode);
    const after = computeEconomy({ ...p.input, structures: [...p.input.structures, { type: sel, level: 1, region: PLAIN_REGION }] }, p.mode);
    const out: [Resource, number][] = [];
    for (const r of RESOURCES) if (after.rates[r] - before.rates[r] >= 0.5) out.push([r, after.rates[r] - before.rates[r]]);
    return { gains: out, capacity: after.capacity - before.capacity, supply: after.energy.supply - before.energy.supply };
  }, [sel, p.input, p.mode]);
  return (
    <div className="ku-buildbar" data-testid="build-bar">
      <div className="ku-buildbar-info" role="status">
        {sel && cost ? (
          <>
            <b>{STRUCTURES[sel].name}</b>
            <CostLine cost={cost} have={have} />
            <span>
              <IcClock width={13} height={13} /> {fmtSeconds(structureSeconds(sel, 0, p.mode))}
            </span>
            {preview?.gains.map(([r, v]) => (
              <span key={r} className="gain">
                <Glyph d={RESOURCE_GLYPH[r]} size={13} color={RESOURCE_INFO[r].color} />
                {fmtRate(v)}
              </span>
            ))}
            {preview && preview.capacity > 0 && <span className="gain">+{fmtAmount(preview.capacity)} de estoque</span>}
            {preview && preview.supply > 0 && <span className="gain">+{preview.supply} de energia</span>}
            {STRUCTURES[sel].coastal && <span>só no litoral</span>}
            <em>{p.queue >= ECONOMY.buildQueue ? `Aguarde: ${ECONOMY.buildQueue} obras em andamento.` : 'Toque no seu território para construir.'}</em>
          </>
        ) : (
          <em>Escolha o que construir.</em>
        )}
      </div>
      <div className="ku-buildbar-row">
        {STRUCTURE_TYPES.map((t) => {
          const c = structureCost(t, 0, p.sameType(t));
          const short = have ? Object.keys(missing(have, c)).length > 0 : true;
          return (
            <button
              type="button"
              key={t}
              className={`${sel === t ? 'on' : ''} ${short ? 'short' : ''}`}
              aria-pressed={sel === t}
              onClick={() => p.onSelect(sel === t ? null : t)}
              data-testid={`build-${t}`}
              title={STRUCTURES[t].role}
            >
              <Glyph d={STRUCTURE_GLYPH[t]} size={22} />
              <b>{STRUCTURES[t].short}</b>
              <small>$ {fmtAmount(c.money ?? 0)}</small>
            </button>
          );
        })}
        <button type="button" className="close" onClick={p.onClose} aria-label="Fechar construção" data-testid="build-close">
          <IcClose width={20} height={20} />
        </button>
      </div>
    </div>
  );
}

/** Trilho com dormentes (grade 24×24), desenhado para o jogo. */
export const RAIL_GLYPH = 'M8 2 L6 22 M16 2 L18 22 M5 6 H19 M4.6 11 H19.4 M4.2 16 H19.8 M3.8 21 H20.2';

/** Painel de economia: saldo, produção, estoque, energia e eficiência. */
export function EconomySheet({ economy, onClose }: { economy: EconomyView; onClose: () => void }) {
  const have = useAmounts(economy)!;
  const short = economy.energy.demand > economy.energy.supply;
  return (
    <Sheet title="Economia" onClose={onClose} testId="economy-sheet">
      <ul className="ku-econ">
        {RESOURCES.map((r) => (
          <li key={r}>
            <Glyph d={RESOURCE_GLYPH[r]} size={22} color={RESOURCE_INFO[r].color} />
            <span>
              <b>{RESOURCE_INFO[r].name}</b>
              <small>{RESOURCE_INFO[r].use}</small>
            </span>
            <em>
              <b>{fmtAmount(have[r])}</b>
              <small>{economy.rates[r] > 0 ? fmtRate(economy.rates[r]) : 'sem produção'}</small>
            </em>
            <i>
              <u style={{ transform: `scaleX(${Math.min(1, have[r] / economy.capacity)})`, background: RESOURCE_INFO[r].color }} />
            </i>
          </li>
        ))}
        <li className={short ? 'short' : ''}>
          <Glyph d={RESOURCE_GLYPH.energy} size={22} color={short ? '#ff6b6b' : '#ffe066'} />
          <span>
            <b>{ENERGY_INFO.name}</b>
            <small>{ENERGY_INFO.use}</small>
          </span>
          <em>
            <b>
              {economy.energy.demand}/{economy.energy.supply}
            </b>
            <small>consumo/oferta</small>
          </em>
        </li>
      </ul>
      <p className="ku-note">
        Estoque máximo de cada recurso: <b>{fmtAmount(economy.capacity)}</b>. Eficiência das construções: <b>{Math.round(economy.efficiency * 100)}%</b>.
        {short ? ' Construa uma usina de energia para voltar a 100%.' : ''}
      </p>
      <p className="ku-rail on" data-testid="economy-rail">
        <Glyph d={RAIL_GLYPH} size={18} />
        {economy.logistics.connected === 0 ? (
          <span>Rede logística: nenhuma construção ligada. Construções a até {LOGISTICS.rangeKm} km, em regiões iguais ou vizinhas, se ligam sozinhas por ferrovia.</span>
        ) : (
          <span>
            Rede logística: <b>{economy.logistics.links}</b> {economy.logistics.links === 1 ? 'trecho' : 'trechos'} de ferrovia
            {economy.logistics.allyLinks > 0 && <>, <b>{economy.logistics.allyLinks}</b> com aliados</>}, {economy.logistics.connected} construções ligadas, bônus médio de{' '}
            <b>+{Math.round(economy.logistics.averageBonus * 100)}%</b>.
          </span>
        )}
      </p>
    </Sheet>
  );
}
