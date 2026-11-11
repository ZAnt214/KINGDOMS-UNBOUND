import { useMemo } from 'react';
import {
  buildProblem,
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
  slotsFor,
  STRUCTURE_TYPES,
  STRUCTURES,
  structureCost,
  structureSeconds,
  type StructureType,
} from '../../../shared/play/economy';
import type { GameMode } from '../../../shared/play/rules';
import type { EconomyView, StructureView } from '../../../shared/play/types';
import { REGION_BY_ID } from '../../../shared/world/regions';
import { serverNow } from '../api';
import { RESOURCE_GLYPH, STRUCTURE_GLYPH } from './glyphs';
import { IcClock, IcClose } from './icons';
import { fmtAmount, fmtClock, fmtRate, fmtSeconds } from './model';
import { Sheet } from './sheets';

export function Glyph({ d, size = 18, color = 'currentColor', width = 1.9 }: { d: string; size?: number; color?: string; width?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Saldo projetado agora (o servidor manda o valor num instante e a produção; o cliente só interpola). */
export function useAmounts(economy: EconomyView | null): ResourceMap | null {
  return economy ? project(economy.amounts, economy.settledAt, economy.rates, economy.capacity, serverNow()) : null;
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
function productionDelta(input: EconomyInput, mode: GameMode, type: StructureType, region: string, from: number) {
  const before = computeEconomy(input, mode);
  const others = input.structures.filter((s) => !(s.type === type && s.region === region));
  const after = computeEconomy({ ...input, structures: [...others, { type, level: from + 1, region }] }, mode);
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
  have: ResourceMap | null;
  /** Quantas do tipo a nação já tem (encarece a nova). */
  sameType: number;
  /** Motivo de bloqueio vindo das regras (null = pode). */
  problem: string | null;
  busy: boolean;
  error: string | null;
  onAct: () => void;
  onClose: () => void;
}

/** Painel de uma construção: nome, ícone, nível, custo, tempo, produção, benefícios e CONSTRUIR/MELHORAR. */
export function StructurePanel(p: PanelProps) {
  const def = STRUCTURES[p.type];
  const level = p.structure?.level ?? 0;
  const building = p.structure?.building ?? null;
  const maxed = level >= ECONOMY.maxLevel;
  const cost = maxed ? {} : structureCost(p.type, level, p.structure ? 0 : p.sameType);
  const seconds = structureSeconds(p.type, level, p.mode);
  const preview = useMemo(() => (p.input && !maxed ? productionDelta(p.input, p.mode, p.type, p.region, level) : null), [p.input, p.mode, p.type, p.region, level, maxed]);
  const lack = p.have ? missing(p.have, cost) : {};
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
                <CostLine cost={cost} have={p.have} />
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

/** Grade de construções possíveis numa região do jogador. */
export function BuildGrid({
  region,
  capitalRegion,
  structures,
  queue,
  have,
  sameType,
  onPick,
}: {
  region: string;
  capitalRegion: string | null;
  structures: StructureView[];
  queue: number;
  have: ResourceMap | null;
  sameType: (t: StructureType) => number;
  onPick: (t: StructureType) => void;
}) {
  const inRegion = structures.map((s) => s.type);
  const def = REGION_BY_ID[region];
  return (
    <div className="ku-build-grid" data-testid="build-grid">
      {STRUCTURE_TYPES.filter((t) => !inRegion.includes(t)).map((t) => {
        const problem = buildProblem(t, { region, coast: def.coast, capitalRegion, inRegion, queue });
        const cost = structureCost(t, 0, sameType(t));
        const short = have ? Object.keys(missing(have, cost)).length > 0 : true;
        const blocked = !!problem && !/obras em andamento/.test(problem);
        return (
          <button
            type="button"
            key={t}
            className={`${blocked ? 'blocked' : ''} ${short ? 'short' : ''}`}
            onClick={() => onPick(t)}
            data-testid={`build-${t}`}
            title={problem ?? STRUCTURES[t].role}
            aria-label={`${STRUCTURES[t].name}${blocked ? `: ${problem}` : ''}`}
          >
            <Glyph d={STRUCTURE_GLYPH[t]} size={24} />
            <b>{STRUCTURES[t].short}</b>
            <small>{blocked ? 'indisponível' : `$ ${fmtAmount(cost.money ?? 0)}`}</small>
          </button>
        );
      })}
      <p className="ku-note">
        {inRegion.length}/{slotsFor(region, capitalRegion)} espaços usados{def.coast ? ' · litoral' : ''}
        {regionDeposit(region) ? ` · ${DEPOSIT_LABEL[regionDeposit(region)!]}` : ''}
      </p>
    </div>
  );
}

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
    </Sheet>
  );
}
