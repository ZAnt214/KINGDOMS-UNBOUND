// Fase F: diplomacia. A tela só pede; aceitar, enviar e romper são decididos pelo servidor, com as
// regras de shared/play/diplomacy.ts (a mesma penalidade aparece aqui antes de confirmar).
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { breakPenalty, DIPLOMACY } from '../../../shared/play/diplomacy';
import { type Resource, RESOURCE_INFO, type ResourceMap } from '../../../shared/play/economy';
import type { Army } from '../../../shared/play/military';
import type { DiplomacyView, EconomyView, NationView } from '../../../shared/play/types';
import { troops } from '../../../shared/play/war';
import { serverNow } from '../api';
import { useTick } from '../hooks';
import { amountsNow, Glyph } from './economyUi';
import { RESOURCE_GLYPH } from './glyphs';
import { nationFlagSrc } from './identity';
import { fmtAmount, fmtClock } from './model';
import { Sheet } from './sheets';

const num = (v: number) => Math.round(v).toLocaleString('pt-BR');
const GIFT: Resource[] = ['money', 'materials', 'metal', 'oil'];

/** Selo da aliança: dois anéis entrelaçados (o mesmo desenho do mapa). */
export function PactMark({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <circle cx="9" cy="12" r="5.2" />
      <circle cx="15" cy="12" r="5.2" />
    </svg>
  );
}

function left(ms: number) {
  if (ms >= 3_600_000) return `${Math.floor(ms / 3_600_000)} h ${Math.floor((ms % 3_600_000) / 60_000)} min`;
  return fmtClock(ms);
}

function NationLine({ n, sub, children }: { n: NationView; sub?: string; children?: ReactNode }) {
  return (
    <li className="ku-pact-row">
      <img src={nationFlagSrc(n)} alt="" />
      <span>
        <b>{n.name}</b>
        {sub && <small>{sub}</small>}
      </span>
      <div className="ku-row-actions">{children}</div>
    </li>
  );
}

export interface DiplomacyProps {
  me: NationView;
  nations: Map<number, NationView>;
  regionsOf: (id: number) => number;
  diplomacy: DiplomacyView | null;
  economy: EconomyView | null;
  home: Army;
  busy: boolean;
  error: string | null;
  onRequest: (id: number) => void;
  onAnswer: (requestId: number, accept: boolean) => void;
  onCancel: (requestId: number) => void;
  onGift: (n: NationView) => void;
  onView: (n: NationView) => void;
  onBreak: () => void;
  onClose: () => void;
}

/** Painel Diplomacia: aliados, pedidos, bloqueios, quebra e as outras nações do mundo. */
export function DiplomacySheet(p: DiplomacyProps) {
  useTick(1000);
  const [confirmBreak, setConfirmBreak] = useState(false);
  const now = serverNow();
  const d = p.diplomacy;
  const allies = [...p.nations.values()].filter((n) => p.me.alliance !== null && n.id !== p.me.id && n.alliance === p.me.alliance);
  const received = (d?.requests ?? []).filter((r) => r.toId === p.me.id && r.expiresAt > now);
  const sent = (d?.requests ?? []).filter((r) => r.fromId === p.me.id && r.expiresAt > now);
  const blocks = (d?.blocks ?? []).filter((b) => b.until > now);
  const pending = new Set([...sent.map((r) => r.toId), ...received.map((r) => r.fromId)]);
  const others = [...p.nations.values()].filter((n) => n.id !== p.me.id && !allies.includes(n)).sort((a, b) => b.power - a.power);
  const amounts = amountsNow(p.economy);
  const penalty = useMemo(() => breakPenalty(p.home, amounts && Number.isFinite(amounts.money) ? amounts : ({ money: 0, materials: 0, metal: 0, oil: 0, tech: 0, special: 0 } as ResourceMap)), [p.home, amounts]);
  const name = (id: number) => p.nations.get(id)?.name ?? 'Nação';

  return (
    <Sheet title="Diplomacia" onClose={p.onClose} testId="diplomacy-sheet">
      {received.length > 0 && (
        <section className="ku-pact-sec" data-testid="pact-received">
          <p className="ku-label">Pedidos recebidos</p>
          <ul>
            {received.map((r) => {
              const n = p.nations.get(r.fromId);
              if (!n) return null;
              return (
                <NationLine key={r.id} n={n} sub={`Poder ${num(n.power)} · ${p.regionsOf(n.id)} regiões · vence em ${left(r.expiresAt - now)}`}>
                  <button type="button" className="ku-btn" disabled={p.busy} onClick={() => p.onAnswer(r.id, false)} data-testid="pact-decline">
                    Recusar
                  </button>
                  <button type="button" className="ku-cta small" disabled={p.busy} onClick={() => p.onAnswer(r.id, true)} data-testid="pact-accept">
                    Aceitar
                  </button>
                </NationLine>
              );
            })}
          </ul>
        </section>
      )}

      <section className="ku-pact-sec" data-testid="pact-allies">
        <p className="ku-label">{d?.allianceName ? `Aliança ${d.allianceName}` : 'Aliados'}</p>
        {allies.length === 0 ? (
          <p className="ku-note">Sua nação ainda não tem aliados. Aliados não se atacam, trocam recursos, ligam as ferrovias e ajudam nas batalhas.</p>
        ) : (
          <ul>
            {allies.map((n) => (
              <NationLine key={n.id} n={n} sub={`Poder ${num(n.power)} · ${p.regionsOf(n.id)} regiões`}>
                <button type="button" className="ku-btn" onClick={() => p.onView(n)}>
                  Ver
                </button>
                <button type="button" className="ku-btn" onClick={() => p.onGift(n)} data-testid="pact-gift">
                  Enviar recursos
                </button>
              </NationLine>
            ))}
          </ul>
        )}
      </section>

      {sent.length > 0 && (
        <section className="ku-pact-sec" data-testid="pact-sent">
          <p className="ku-label">Pedidos enviados</p>
          <ul>
            {sent.map((r) => {
              const n = p.nations.get(r.toId);
              if (!n) return null;
              return (
                <NationLine key={r.id} n={n} sub={`Aguardando resposta · vence em ${left(r.expiresAt - now)}`}>
                  <button type="button" className="ku-btn" disabled={p.busy} onClick={() => p.onCancel(r.id)} data-testid="pact-cancel">
                    Cancelar
                  </button>
                </NationLine>
              );
            })}
          </ul>
        </section>
      )}

      {blocks.length > 0 && (
        <section className="ku-pact-sec" data-testid="pact-blocks">
          <p className="ku-label">Sem ataques (você rompeu)</p>
          <ul>
            {blocks.map((b) => (
              <li key={b.nationId} className="ku-pact-block">
                {name(b.nationId)}: liberado em <b>{fmtClock(b.until - now)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {allies.length > 0 &&
        (confirmBreak ? (
          <div className="ku-pact-break" data-testid="pact-break-confirm">
            <p>
              <b>Romper a aliança tem custo.</b> Sua nação perde:
            </p>
            <ul>
              <li>
                {num(troops(penalty.troops))} tropas ({Math.round(DIPLOMACY.breakTroopLoss * 100)}% das que estão em casa)
              </li>
              <li>
                {Math.round(DIPLOMACY.breakResourceLoss * 100)}% dos recursos:{' '}
                {GIFT.filter((r) => penalty.resources[r] > 0)
                  .map((r) => `${fmtAmount(penalty.resources[r])} de ${RESOURCE_INFO[r].short.toLowerCase()}`)
                  .join(', ') || 'nada no momento'}
              </li>
              <li>{DIPLOMACY.breakBlockMinutes} minutos sem poder atacar {allies.length > 1 ? 'os antigos aliados' : allies[0].name}</li>
            </ul>
            <p className="ku-note">{allies.map((a) => a.name).join(', ')} será avisado(a).</p>
            {p.error && <p className="ku-error">{p.error}</p>}
            <div className="ku-row-actions">
              <button type="button" className="ku-btn" onClick={() => setConfirmBreak(false)}>
                Manter aliança
              </button>
              <button type="button" className="ku-cta danger" disabled={p.busy} onClick={p.onBreak} data-testid="pact-break-go">
                Romper e pagar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="ku-btn block danger-line" onClick={() => setConfirmBreak(true)} data-testid="pact-break">
            Romper aliança
          </button>
        ))}

      {others.length > 0 && (
        <section className="ku-pact-sec" data-testid="pact-world">
          <p className="ku-label">Outras nações</p>
          <ul>
            {others.map((n) => {
              const otherAlliance = p.me.alliance !== null && n.alliance !== null && n.alliance !== p.me.alliance;
              const blocked = blocks.some((b) => b.nationId === n.id);
              const waiting = pending.has(n.id);
              return (
                <NationLine key={n.id} n={n} sub={`Poder ${num(n.power)} · ${p.regionsOf(n.id)} regiões${n.bot ? ' · bot' : ''}${n.alliance !== null ? ' · em aliança' : ''}`}>
                  <button
                    type="button"
                    className="ku-btn"
                    disabled={p.busy || waiting || otherAlliance || blocked}
                    onClick={() => p.onRequest(n.id)}
                    data-testid={`pact-ask-${n.id}`}
                  >
                    <PactMark size={14} />
                    {waiting ? 'Pendente' : otherAlliance ? 'Outra aliança' : 'Pedir aliança'}
                  </button>
                </NationLine>
              );
            })}
          </ul>
          {others.some((n) => n.bot) && <p className="ku-note">Bots respondem na hora: recusam quem está em guerra com eles, quem já rompeu com eles e a nação mais forte da partida.</p>}
        </section>
      )}
      {p.error && !confirmBreak && <p className="ku-error">{p.error}</p>}
    </Sheet>
  );
}

/** Envio de recursos a um aliado. Só chega o que cabe no armazém dele; o resto não é cobrado. */
export function GiftSheet(p: { ally: NationView; economy: EconomyView | null; busy: boolean; error: string | null; onSend: (r: Partial<ResourceMap>) => void; onClose: () => void }) {
  useTick(1000);
  const have = amountsNow(p.economy);
  const cap = p.economy?.capacity ?? 0;
  const [give, setGive] = useState<Partial<Record<Resource, number>>>({});
  const max = (r: Resource) => Math.floor(Math.min(have ? have[r] : 0, cap));
  const total = GIFT.reduce((n, r) => n + (give[r] ?? 0), 0);
  return (
    <Sheet title={`Enviar a ${p.ally.name}`} onClose={p.onClose} testId="gift-sheet">
      <div className="ku-gift">
        {GIFT.map((r) => {
          const m = max(r);
          const v = Math.min(give[r] ?? 0, m);
          return (
            <label key={r} className="ku-gift-row">
              <span>
                <Glyph d={RESOURCE_GLYPH[r]} size={16} color={RESOURCE_INFO[r].color} />
                {RESOURCE_INFO[r].name}
                <small>você tem {fmtAmount(have ? have[r] : 0)}</small>
              </span>
              <input type="range" min={0} max={m} step={Math.max(1, Math.round(m / 100))} value={v} onChange={(e) => setGive({ ...give, [r]: Number(e.target.value) })} data-testid={`gift-${r}`} />
              <b>{fmtAmount(v)}</b>
            </label>
          );
        })}
      </div>
      <p className="ku-note">Chega na hora. O que não couber no armazém do aliado não é enviado nem cobrado.</p>
      {p.error && <p className="ku-error">{p.error}</p>}
      <button
        type="button"
        className="ku-cta block"
        disabled={p.busy || total <= 0}
        onClick={() => p.onSend(Object.fromEntries(GIFT.filter((r) => (give[r] ?? 0) > 0).map((r) => [r, Math.min(give[r] ?? 0, max(r))])))}
        data-testid="gift-send"
      >
        {total > 0 ? 'Enviar' : 'Escolha quanto enviar'}
      </button>
    </Sheet>
  );
}

/** Pedido recebido em destaque sobre o mapa, até ser respondido ou adiado. */
export function PactPrompt(p: { from: NationView; expiresAt: number; busy: boolean; onAccept: () => void; onDecline: () => void; onLater: () => void }) {
  useTick(1000);
  return (
    <div className="ku-pact-prompt" role="alertdialog" aria-label={`${p.from.name} pede aliança`} data-testid="pact-prompt">
      <img src={nationFlagSrc(p.from)} alt="" />
      <div>
        <b>{p.from.name} pede aliança</b>
        <small>
          Poder {num(p.from.power)} · vence em {left(p.expiresAt - serverNow())}
        </small>
      </div>
      <div className="ku-row-actions">
        <button type="button" className="ku-btn" onClick={p.onLater} aria-label="Responder depois">
          Depois
        </button>
        <button type="button" className="ku-btn" disabled={p.busy} onClick={p.onDecline} data-testid="prompt-decline">
          Recusar
        </button>
        <button type="button" className="ku-cta small" disabled={p.busy} onClick={p.onAccept} data-testid="prompt-accept">
          Aceitar
        </button>
      </div>
    </div>
  );
}

/**
 * Cerimônia da aliança: as duas bandeiras vêm dos lados, se encontram no centro e o selo dourado
 * desce sobre elas. Some sozinha em 3,2 s (ou ao tocar).
 */
export function PactCeremony(p: { a: NationView; b: NationView; broken?: boolean; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(p.onDone, 3200);
    return () => window.clearTimeout(id);
  }, [p.onDone]);
  return (
    <div className={`ku-ceremony ${p.broken ? 'broken' : ''}`} onClick={p.onDone} data-testid={p.broken ? 'pact-broken' : 'pact-ceremony'}>
      <div className="ku-ceremony-stage">
        <img className="left" src={nationFlagSrc(p.a)} alt="" />
        <span className="seal">
          <PactMark size={34} />
        </span>
        <img className="right" src={nationFlagSrc(p.b)} alt="" />
      </div>
      <p>
        <b>{p.broken ? 'Aliança rompida' : 'Aliança formada'}</b>
        <span>
          {p.a.name} e {p.b.name}
        </span>
      </p>
    </div>
  );
}
