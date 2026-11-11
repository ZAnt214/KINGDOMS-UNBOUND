// Fase E: ataque, acompanhamento da operação e confirmação de míssil. Tudo que muda o mundo passa
// pelo servidor; aqui só se mostram as estimativas públicas e as regras de shared/play/war.ts.
import { useMemo, useState } from 'react';
import type { StructureType } from '../../../shared/play/economy';
import { type Army, type Research, UNIT_TYPES, UNITS } from '../../../shared/play/military';
import type { GameMode } from '../../../shared/play/rules';
import type { NationView, OperationView } from '../../../shared/play/types';
import {
  attackPower,
  battleSeconds,
  estimatedDefense,
  interceptChance,
  missileSeconds,
  predictEnd,
  risk,
  share,
  troops,
  WAR,
} from '../../../shared/play/war';
import { distanceKm, REGION_BY_ID } from '../../../shared/world/regions';
import { serverNow } from '../api';
import { useTick } from '../hooks';
import { Glyph } from './economyUi';
import { BATTLE_GLYPH, POWER_GLYPH, UNIT_GLYPH } from './glyphs';
import { nationFlagSrc } from './identity';
import { fmtClock, fmtSeconds } from './model';
import { Sheet } from './sheets';

const num = (v: number) => Math.round(v).toLocaleString('pt-BR');
const RISK_CLASS = { baixo: 'good', médio: 'warn', alto: 'bad' } as const;

/** Linha "12 Infantaria · 3 Blindados" das tropas de um grupo. */
function ArmyLine({ army }: { army: Army }) {
  const parts = UNIT_TYPES.filter((u) => (army[u] ?? 0) > 0);
  if (!parts.length) return <span className="ku-dim">nenhuma</span>;
  return (
    <span className="ku-army-line">
      {parts.map((u) => (
        <span key={u}>
          <Glyph d={UNIT_GLYPH[u]} size={14} />
          {num(army[u] ?? 0)} {UNITS[u].short.toLowerCase()}
        </span>
      ))}
    </span>
  );
}

export function AttackSheet(p: {
  region: string;
  owner: NationView;
  ownerRegions: number;
  me: NationView;
  home: Army;
  research: Research;
  origin: { from: string; naval: boolean };
  mode: GameMode;
  busy: boolean;
  error: string | null;
  onConfirm: (percent: number) => void;
  onClose: () => void;
}) {
  const [percent, setPercent] = useState<number>(50);
  const sent = share(p.home, percent, p.origin.naval);
  const power = attackPower(sent, p.research, p.origin.naval);
  const estDef = estimatedDefense(p.owner.power, p.ownerRegions);
  const r = risk(power, estDef);
  // Duração estimada: simulação com o defensor estimado como posições de defesa.
  const seconds = useMemo(() => {
    if (power <= 0) return 0;
    const base = battleSeconds(p.region, p.mode);
    const end = predictEnd({
      startedAt: 0,
      base,
      naval: p.origin.naval,
      attacker: sent,
      attackerResearch: p.research,
      defender: { defense: estDef / UNITS.defense.defense },
      defenderResearch: {},
      defenderMultiplier: 1,
      events: [],
    });
    return Math.round(end / 1000);
  }, [power, p.region, p.mode, p.origin.naval, p.research, estDef, sent]);
  const region = REGION_BY_ID[p.region];
  return (
    <Sheet title={`Atacar ${region?.name ?? ''}`} onClose={p.onClose} testId="attack-sheet">
      <div className="ku-versus">
        <span>
          <img src={nationFlagSrc(p.me)} alt="" />
          <b>{p.me.name}</b>
          <small>poder {num(p.me.power)}</small>
        </span>
        <Glyph d={BATTLE_GLYPH} size={26} color="#ffc53d" />
        <span>
          <img src={nationFlagSrc(p.owner)} alt="" />
          <b>{p.owner.name}</b>
          <small>poder {num(p.owner.power)}</small>
        </span>
      </div>
      <dl className="ku-intel">
        <div>
          <dt>Tropas estimadas de {p.owner.name}</dt>
          <dd>~{num(p.owner.troops)}</dd>
        </div>
        <div>
          <dt>Defesa estimada da região</dt>
          <dd>~{num(estDef)}</dd>
        </div>
        <div>
          <dt>Aliança</dt>
          <dd>{p.owner.alliance === null ? 'Nenhuma' : 'Em aliança'}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{p.origin.naval ? `Naval, a partir de ${REGION_BY_ID[p.origin.from]?.name}` : `Terrestre, a partir de ${REGION_BY_ID[p.origin.from]?.name}`}</dd>
        </div>
      </dl>
      <p className="ku-label">Parte do exército enviada</p>
      <div className="ku-amounts" role="group" aria-label="Porcentagem das tropas">
        {WAR.percents.map((v) => (
          <button type="button" key={v} className={percent === v ? 'on' : ''} onClick={() => setPercent(v)} data-testid={`attack-${v}`}>
            {v}%
          </button>
        ))}
      </div>
      <div className="ku-attack-sum" data-testid="attack-summary">
        <div>
          <small>Tropas enviadas</small>
          <b>{num(troops(sent))}</b>
          <ArmyLine army={sent} />
        </div>
        <div>
          <small>Poder de combate enviado</small>
          <b>{num(power)}</b>
        </div>
        <div>
          <small>Risco estimado</small>
          <b className={RISK_CLASS[r]}>{r}</b>
        </div>
        <div>
          <small>Duração estimada</small>
          <b>{power > 0 ? `~${fmtSeconds(seconds)}` : '—'}</b>
        </div>
      </div>
      <p className="ku-note">
        Território disputado: <b>{region?.name}</b>. O combate é automático: os dois lados sofrem baixas e a ocupação avança conforme a força de cada um. Sobreviventes
        voltam ao fim.
      </p>
      {p.error && <p className="ku-error">{p.error}</p>}
      <button type="button" className="ku-cta" disabled={p.busy || power <= 0} onClick={() => p.onConfirm(percent)} data-testid="attack-go">
        {power > 0 ? 'Iniciar operação' : 'Sem tropas para enviar'}
      </button>
    </Sheet>
  );
}

/** Progresso da operação agora, extrapolado do último valor do servidor. */
export function opProgress(o: OperationView, now = serverNow()): number {
  if (o.status === 'won') return 1;
  return Math.max(0, Math.min(1, o.progress.value + (o.progress.rate * Math.max(0, Math.min(now, o.endsAt) - o.progress.at)) / 1000));
}

export function OperationSheet(p: {
  op: OperationView;
  attacker: NationView | undefined;
  defender: NationView | undefined;
  me: number | null;
  home: Army;
  canCounter: boolean;
  canMissile: boolean;
  busy: boolean;
  error: string | null;
  onReinforce: (percent: number) => void;
  onCounter: () => void;
  onMissile: () => void;
  onFocus: () => void;
  onClose: () => void;
}) {
  useTick(500);
  const [percent, setPercent] = useState<number>(50);
  const o = p.op;
  const now = serverNow();
  const v = opProgress(o, now);
  const region = REGION_BY_ID[o.region];
  const defending = p.me === o.defenderId;
  const reinforcement = share(p.home, percent, false);
  return (
    <Sheet title={o.naval ? 'Operação naval' : 'Operação terrestre'} onClose={p.onClose} testId="operation-sheet">
      <div className="ku-versus">
        <span>
          {p.attacker && <img src={nationFlagSrc(p.attacker)} alt="" />}
          <b>{p.attacker?.name}</b>
          <small>~{num(o.attackerTroops)} tropas</small>
        </span>
        <Glyph d={BATTLE_GLYPH} size={26} color={defending ? '#ff6b6b' : '#ffc53d'} />
        <span>
          {p.defender && <img src={nationFlagSrc(p.defender)} alt="" />}
          <b>{p.defender?.name}</b>
          <small>~{num(o.defenderTroops)} tropas</small>
        </span>
      </div>
      <div className="ku-meter" data-testid="operation-progress">
        <span>
          Ocupação de <b>{region?.name}</b>: <b>{Math.floor(v * 100)}%</b>
          {o.status === 'active' ? ` · fim previsto em ${fmtClock(o.endsAt - now)}` : o.status === 'won' ? ' · conquistada' : ' · repelida'}
        </span>
        <i>
          <u style={{ transform: `scaleX(${v})`, background: p.attacker?.color }} />
        </i>
      </div>
      {o.mine && (
        <dl className="ku-intel">
          <div>
            <dt>Suas tropas enviadas</dt>
            <dd>
              <ArmyLine army={o.mine.sent} />
            </dd>
          </div>
          <div>
            <dt>Restantes agora</dt>
            <dd>
              <ArmyLine army={o.mine.remaining} />
            </dd>
          </div>
        </dl>
      )}
      {o.result && (
        <p className="ku-note">
          Baixas: {num(o.result.attackerLosses)} do atacante, {num(o.result.defenderLosses)} do defensor.
        </p>
      )}
      {defending && o.status === 'active' && (
        <div className="ku-defend" data-testid="defend-actions">
          <p className="ku-label">Enviar tropas para defender</p>
          <div className="ku-amounts" role="group" aria-label="Porcentagem das tropas em casa">
            {WAR.percents.map((x) => (
              <button type="button" key={x} className={percent === x ? 'on' : ''} onClick={() => setPercent(x)} data-testid={`reinforce-${x}`}>
                {x}%
              </button>
            ))}
          </div>
          <p className="ku-note">
            <ArmyLine army={reinforcement} />
          </p>
          <button type="button" className="ku-cta" disabled={p.busy || troops(reinforcement) === 0} onClick={() => p.onReinforce(percent)} data-testid="reinforce-go">
            {troops(reinforcement) ? `Reforçar ${region?.name}` : 'Sem tropas em casa'}
          </button>
          <div className="ku-row-actions">
            {p.canCounter && (
              <button type="button" className="ku-btn" onClick={p.onCounter} data-testid="counter-attack">
                <Glyph d={BATTLE_GLYPH} size={16} />
                Contra-atacar {REGION_BY_ID[o.from]?.name}
              </button>
            )}
            {p.canMissile && (
              <button type="button" className="ku-btn" onClick={p.onMissile} data-testid="defend-missile">
                <Glyph d={UNIT_GLYPH.missile} size={16} />
                Lançar míssil
              </button>
            )}
          </div>
        </div>
      )}
      {p.error && <p className="ku-error">{p.error}</p>}
      <button type="button" className="ku-btn block" onClick={p.onFocus}>
        Ver no mapa
      </button>
    </Sheet>
  );
}

/** Confirmação do lançamento: alvo, distância, tempo de voo e chance de interceptação visível. */
export function MissileConfirm(p: {
  from: [number, number];
  region: string;
  owner: NationView;
  ownerStructures: { type: StructureType; level: number }[];
  stock: number;
  mode: GameMode;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const r = REGION_BY_ID[p.region];
  const km = distanceKm(p.from, r.at);
  const low = interceptChance(p.ownerStructures, {});
  const high = interceptChance(p.ownerStructures, { interception: 3 });
  return (
    <section className="ku-card ku-missile-card" data-testid="missile-confirm">
      <header>
        <h3>
          <Glyph d={UNIT_GLYPH.missile} size={20} color="#ff7a59" /> Lançar míssil em {r.name}
        </h3>
        <p>
          <img src={nationFlagSrc(p.owner)} alt="" /> {p.owner.name}
        </p>
      </header>
      <dl className="ku-intel">
        <div>
          <dt>Distância</dt>
          <dd>{num(km)} km</dd>
        </div>
        <div>
          <dt>Tempo de voo</dt>
          <dd>{fmtSeconds(missileSeconds(km, p.mode))}</dd>
        </div>
        <div>
          <dt>Interceptação</dt>
          <dd>{low === 0 ? 'sem sistema antimísseis visível: não será interceptado' : `chance entre ${Math.round(low * 100)}% e ${Math.round(high * 100)}%`}</dd>
        </div>
        <div>
          <dt>Efeito no impacto</dt>
          <dd>maior construção da região perde 1 nível; {Math.round(WAR.missile.homeLoss * 100)}% das tropas em casa; tropas engajadas ali perdem {Math.round(WAR.missile.engagedLoss * 100)}%</dd>
        </div>
      </dl>
      {p.error && <p className="ku-error">{p.error}</p>}
      <div className="ku-row-actions">
        <button type="button" className="ku-btn" onClick={p.onCancel}>
          Cancelar
        </button>
        <button type="button" className="ku-cta" disabled={p.busy || p.stock < 1} onClick={p.onConfirm} data-testid="missile-go">
          {p.stock < 1 ? 'Sem mísseis' : `Lançar (${p.stock} em estoque)`}
        </button>
      </div>
    </section>
  );
}

/** Cápsulas das operações da própria nação: atacando (cor da nação) e sob ataque (vermelho). */
export function OperationCapsules({ ops, me, onOpen }: { ops: OperationView[]; me: number; onOpen: (id: number) => void }) {
  useTick(500);
  const now = serverNow();
  return (
    <div className="ku-op-caps">
      {ops.map((o) => {
        const against = o.defenderId === me;
        return (
          <button type="button" key={o.id} className={`ku-op-cap ${against ? 'against' : ''}`} onClick={() => onOpen(o.id)} data-testid={against ? 'op-under-attack' : 'op-attacking'}>
            <Glyph d={against ? BATTLE_GLYPH : POWER_GLYPH} size={16} />
            <span>
              {against ? 'Sob ataque' : 'Atacando'}: {REGION_BY_ID[o.region]?.name}
            </span>
            <b>{Math.floor(opProgress(o, now) * 100)}%</b>
          </button>
        );
      })}
    </div>
  );
}

/** Ações sobre uma região inimiga no cartão: inteligência e ATACAR / VER TERRITÓRIO. */
export function EnemyActions(p: {
  owner: NationView;
  ownerRegions: number;
  capital: boolean;
  /** Motivo de não poder atacar (null = pode). */
  problem: string | null;
  naval: boolean;
  onAttack: () => void;
  onView: () => void;
}) {
  return (
    <div className="ku-enemy" data-testid="enemy-actions">
      <dl className="ku-intel">
        <div>
          <dt>Tropas estimadas</dt>
          <dd>~{num(p.owner.troops)}</dd>
        </div>
        <div>
          <dt>Defesa estimada aqui</dt>
          <dd>~{num(estimatedDefense(p.owner.power, p.ownerRegions))}</dd>
        </div>
        <div>
          <dt>Aliança</dt>
          <dd>{p.owner.alliance === null ? 'Nenhuma' : 'Em aliança'}</dd>
        </div>
      </dl>
      {p.problem && <p className="ku-note">{p.problem}</p>}
      <div className="ku-row-actions">
        <button type="button" className="ku-btn" onClick={p.onView} data-testid="view-territory">
          Ver território
        </button>
        <button type="button" className="ku-cta" disabled={!!p.problem} onClick={p.onAttack} data-testid="attack">
          {p.naval ? 'ATACAR POR MAR' : 'ATACAR'}
        </button>
      </div>
    </div>
  );
}
