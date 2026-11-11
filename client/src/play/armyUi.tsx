// Fase D: exército, treinamento, pesquisa e poder militar. Tudo vem do servidor (MilitaryView);
// as funções de shared/play/military.ts só mostram custos, tempos e o que libera cada coisa.
import { useMemo, useState } from 'react';
import { missing, type StructureType, STRUCTURES } from '../../../shared/play/economy';
import {
  MILITARY,
  type PowerGroup,
  projectRecruits,
  researchProblem,
  TECH_TYPES,
  type TechType,
  techCost,
  techSeconds,
  TECHS,
  trainCost,
  UNIT_TYPES,
  unitProblem,
  type UnitType,
  UNITS,
  upkeep,
} from '../../../shared/play/military';
import type { GameMode } from '../../../shared/play/rules';
import type { EconomyView, MilitaryView } from '../../../shared/play/types';
import { serverNow } from '../api';
import { useTick } from '../hooks';
import { amountsNow, CostLine, Glyph } from './economyUi';
import { POWER_GLYPH, RESEARCH_GLYPH, STRUCTURE_GLYPH, UNIT_GLYPH } from './glyphs';
import { fmtAmount, fmtClock, fmtRate, fmtSeconds } from './model';
import { Sheet } from './sheets';

type Built = { type: StructureType; level: number }[];

const GROUP_LABEL: Record<PowerGroup | 'infrastructure', string> = {
  troops: 'Tropas',
  equipment: 'Blindados e artilharia',
  aviation: 'Aviação',
  navy: 'Marinha',
  defense: 'Defesa',
  missiles: 'Mísseis',
  infrastructure: 'Infraestrutura militar',
};
const GROUP_COLOR: Record<PowerGroup | 'infrastructure', string> = {
  troops: '#8fd17a',
  equipment: '#e8a36b',
  aviation: '#7cc4ff',
  navy: '#5b8cff',
  defense: '#c9b3ff',
  missiles: '#ff7a59',
  infrastructure: '#ffc53d',
};

/** Recrutas agora, crescendo no relógio do servidor. */
export function recruitsNow(m: MilitaryView): number {
  return projectRecruits(m.recruits.amount, m.recruits.settledAt, m.recruits.rate, m.recruits.cap, serverNow());
}

function effectText(tech: TechType): string {
  const e = TECHS[tech].effect;
  const pct = `${Math.round(e.perLevel * 100)}%`;
  if (e.kind === 'units') return `+${pct} de ataque e defesa por nível: ${e.units.map((u) => UNITS[u].short.toLowerCase()).join(', ')}`;
  if (e.kind === 'defense') return `+${pct} de defesa de todo o exército por nível`;
  if (e.kind === 'upkeep') return `−${pct} de manutenção por nível`;
  if (e.kind === 'interception') return `+${pct} de chance de interceptar mísseis por nível (exige sistema antimísseis)`;
  return `−${pct} no tempo de treinamento por nível`;
}

const AMOUNTS = [10, 50, 100];
const num = (v: number) => v.toLocaleString('pt-BR');

export function ArmySheet(p: {
  military: MilitaryView;
  economy: EconomyView;
  structures: Built;
  mode: GameMode;
  busy: boolean;
  error: string | null;
  onTrain: (unit: UnitType, amount: number) => void;
  onResearch: (tech: TechType) => void;
  onBuild: (type: StructureType) => void;
  onClose: () => void;
}) {
  useTick(1000);
  const [tab, setTab] = useState<'units' | 'research'>('units');
  const [unit, setUnit] = useState<UnitType>('infantry');
  const [amount, setAmount] = useState(10);
  const m = p.military;
  const have = amountsNow(p.economy);
  const pw = m.power;
  const groups = (Object.keys(pw.groups) as (PowerGroup | 'infrastructure')[]).filter((g) => pw.groups[g] > 0);
  const total = groups.reduce((s, g) => s + pw.groups[g], 0) || 1;

  const def = UNITS[unit];
  const lock = unitProblem(unit, p.structures, m.research);
  // Máximo que os recursos pagam agora (todas as matérias do custo, não só o dinheiro).
  const max = have
    ? Math.max(0, Math.min(MILITARY.maxBatch, ...(Object.entries(def.cost) as [keyof typeof have, number][]).map(([r, v]) => Math.floor(have[r] / v))))
    : 0;
  const n = Math.max(1, Math.min(amount, Math.max(1, max)));
  const { cost } = trainCost(unit, n);
  const lotUpkeep = upkeep({ [unit]: n }, m.research, p.mode);
  const short = have ? Object.keys(missing(have, cost)).length > 0 : true;
  const trainProblem = lock ?? (short ? 'Recursos insuficientes' : null);
  const negative = useMemo(() => (['money', 'oil'] as const).filter((r) => p.economy.rates[r] < 0), [p.economy.rates]);

  return (
    <Sheet title="Exército" onClose={p.onClose} testId="army-sheet">
      <div className="ku-power" data-testid="army-power">
        <Glyph d={POWER_GLYPH} size={34} color="#ffc53d" />
        <div>
          <small>Poder militar</small>
          <b>{pw.power.toLocaleString('pt-BR')}</b>
        </div>
        <dl>
          <div>
            <dt>Ataque</dt>
            <dd>{fmtAmount(pw.attack)}</dd>
          </div>
          <div>
            <dt>Defesa</dt>
            <dd>{fmtAmount(pw.defense)}</dd>
          </div>
          <div>
            <dt>Tropas</dt>
            <dd>{fmtAmount(pw.troops)}</dd>
          </div>
        </dl>
      </div>
      {groups.length > 0 && (
        <div className="ku-power-bar" aria-label="Composição do poder militar">
          <div>
            {groups.map((g) => (
              <i key={g} style={{ flexGrow: pw.groups[g] / total, background: GROUP_COLOR[g] }} />
            ))}
          </div>
          <ul>
            {groups.map((g) => (
              <li key={g}>
                <i style={{ background: GROUP_COLOR[g] }} />
                {GROUP_LABEL[g]} <b>{fmtAmount(pw.groups[g])}</b>
              </li>
            ))}
            {pw.techShare > 0.005 && (
              <li>
                <i style={{ background: '#5ee0c8' }} />
                Tecnologia e fortificação <b>+{Math.round(pw.techShare * 100)}%</b>
              </li>
            )}
          </ul>
        </div>
      )}

      {negative.length > 0 && (
        <p className="ku-warn" data-testid="army-upkeep-warn">
          A manutenção do exército passa da produção de {negative.map((r) => (r === 'money' ? 'dinheiro' : 'petróleo')).join(' e ')}: o estoque está caindo.
        </p>
      )}

      <div className="ku-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'units'} className={tab === 'units' ? 'on' : ''} onClick={() => setTab('units')} data-testid="army-tab-units">
          Unidades
        </button>
        <button type="button" role="tab" aria-selected={tab === 'research'} className={tab === 'research' ? 'on' : ''} onClick={() => setTab('research')} data-testid="army-tab-research">
          Pesquisa
          {m.researching && <em />}
        </button>
      </div>

      {tab === 'units' ? (
        <>
          <ul className="ku-units">
            {UNIT_TYPES.map((u) => {
              const d = UNITS[u];
              const why = unitProblem(u, p.structures, m.research);
              return (
                <li key={u}>
                  <button type="button" className={`${unit === u ? 'on' : ''} ${why ? 'locked' : ''}`} onClick={() => setUnit(u)} data-testid={`unit-${u}`}>
                    <Glyph d={UNIT_GLYPH[u]} size={22} />
                    <span>
                      <b>{d.short}</b>
                      <small>{why ?? `Ataque ${num(d.attack)} · Defesa ${num(d.defense)}`}</small>
                    </span>
                    <em>{(m.army[u] ?? 0).toLocaleString('pt-BR')}</em>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="ku-train" data-testid="army-train">
            <header>
              <Glyph d={UNIT_GLYPH[unit]} size={26} />
              <div>
                <b>{def.name}</b>
                <small>{def.role}</small>
              </div>
            </header>
            <p className="ku-stats">
              <span>
                Ataque <b>{num(def.attack)}</b>
              </span>
              <span>
                Defesa <b>{num(def.defense)}</b>
              </span>
              <span>
                Manutenção de {n}: <b>{fmtRate(-lotUpkeep.money).replace('−', '')}</b> de dinheiro
                {lotUpkeep.oil > 0 && (
                  <>
                    {' '}
                    e <b>{fmtRate(-lotUpkeep.oil).replace('−', '')}</b> de petróleo
                  </>
                )}
              </span>
            </p>
            {lock ? (
              <div className="ku-locked">
                <span>{lock}</span>
                {def.structure && !p.structures.some((s) => s.type === def.structure && s.level > 0) && (
                  <button type="button" className="ku-btn" onClick={() => p.onBuild(def.structure!)} data-testid="army-build-required">
                    <Glyph d={STRUCTURE_GLYPH[def.structure]} size={16} />
                    Construir {STRUCTURES[def.structure].name.toLowerCase()}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="ku-amounts" role="group" aria-label="Quantidade">
                  {AMOUNTS.map((a) => (
                    <button type="button" key={a} className={n === a ? 'on' : ''} disabled={a > Math.max(1, max)} onClick={() => setAmount(a)} data-testid={`amount-${a}`}>
                      {a}
                    </button>
                  ))}
                  <button type="button" className={n === max && !AMOUNTS.includes(n) ? 'on' : ''} disabled={max < 1} onClick={() => setAmount(max)} data-testid="amount-max">
                    Máx. {max > 0 ? max : ''}
                  </button>
                </div>
                <div className="ku-train-cost">
                  <CostLine cost={cost} have={have} />
                  <span>pronto na hora</span>
                </div>
                <button type="button" className="ku-cta" disabled={p.busy || !!trainProblem} onClick={() => p.onTrain(unit, n)} data-testid="army-train-go">
                  {trainProblem ?? `Criar ${n} ${n === 1 ? 'unidade' : 'unidades'}`}
                </button>
              </>
            )}
            {p.error && <p className="ku-error">{p.error}</p>}
          </div>
        </>
      ) : (
        <ResearchList military={m} structures={p.structures} mode={p.mode} economy={p.economy} busy={p.busy} error={p.error} onResearch={p.onResearch} onBuild={p.onBuild} />
      )}
    </Sheet>
  );
}

function ResearchList(p: {
  military: MilitaryView;
  structures: Built;
  mode: GameMode;
  economy: EconomyView;
  busy: boolean;
  error: string | null;
  onResearch: (tech: TechType) => void;
  onBuild: (type: StructureType) => void;
}) {
  const m = p.military;
  const have = amountsNow(p.economy);
  const now = serverNow();
  const noTech = !p.structures.some((s) => s.type === 'tech' && s.level > 0);
  return (
    <div className="ku-research" data-testid="army-research">
      {noTech && (
        <div className="ku-locked">
          <span>A pesquisa militar é feita no centro tecnológico.</span>
          <button type="button" className="ku-btn" onClick={() => p.onBuild('tech')}>
            <Glyph d={STRUCTURE_GLYPH.tech} size={16} />
            Construir centro tecnológico
          </button>
        </div>
      )}
      {p.error && <p className="ku-error">{p.error}</p>}
      <ul>
        {TECH_TYPES.map((t) => {
          const def = TECHS[t];
          const level = m.research[t] ?? 0;
          const active = m.researching?.tech === t ? m.researching : null;
          const why = researchProblem(t, p.structures, m.research, m.researching !== null);
          const maxed = level >= MILITARY.researchMaxLevel;
          return (
            <li key={t} className={active ? 'run' : ''} data-testid={`tech-${t}`}>
              <header>
                <Glyph d={RESEARCH_GLYPH} size={20} color={level > 0 ? '#5ee0c8' : undefined} />
                <div>
                  <b>{def.name}</b>
                  <small>
                    {def.unlocks ? `Libera ${UNITS[def.unlocks].short.toLowerCase()}. ` : ''}
                    {effectText(t)}
                  </small>
                </div>
                <span className="ku-dots" aria-label={`Nível ${level} de ${MILITARY.researchMaxLevel}`}>
                  {Array.from({ length: MILITARY.researchMaxLevel }, (_, i) => (
                    <i key={i} className={i < level ? 'on' : ''} />
                  ))}
                </span>
              </header>
              {active ? (
                <div className="ku-progress">
                  <i>
                    <u style={{ transform: `scaleX(${Math.min(1, (now - active.startedAt) / (active.endsAt - active.startedAt))})` }} />
                  </i>
                  <em>Pesquisando nível {active.to} · {fmtClock(active.endsAt - now)}</em>
                </div>
              ) : !maxed && !noTech ? (
                <footer>
                  <CostLine cost={techCost(t, level)} have={have} />
                  <span>⏱ {fmtSeconds(techSeconds(t, level, p.mode))}</span>
                  <button type="button" className="ku-btn go" disabled={p.busy || !!why} onClick={() => p.onResearch(t)} data-testid={`research-${t}`}>
                    {why && m.researching ? 'Aguarde' : `Pesquisar nível ${level + 1}`}
                  </button>
                </footer>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
