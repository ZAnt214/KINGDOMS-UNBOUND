import { useEffect, useState } from 'react';
import { ALLIANCE_PERMISSIONS, ALLIANCE_RANK_LABELS } from '../../../shared/rules';
import { api, ApiError, type Governor } from '../api';
import { fmtNum } from '../format';

interface AllianceRow {
  id: number;
  name: string;
  tag: string;
  description: string;
  members: number;
  power: number;
}
interface Member {
  governor_id: number;
  name: string;
  power: number;
  rank: number;
  x: number;
  y: number;
}
interface Detail {
  alliance: { id: number; name: string; tag: string; description: string };
  members: Member[];
  isMember: boolean;
  myRank: number | null;
  applications: { id: number; governor_id: number; name: string; power: number; message: string }[];
  myPendingApplicationId: number | null;
}

interface Props {
  governor: Governor;
  refreshKey: number;
  onError: (m: string) => void;
  onToast: (m: string) => void;
  onGoTo: (x: number, y: number) => void;
}

export function AlliancePanel({ governor, refreshKey, onError, onToast, onGoTo }: Props) {
  const [list, setList] = useState<AllianceRow[]>([]);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [myApps, setMyApps] = useState<{ id: number; alliance_id: number; name: string; tag: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', tag: '', description: '' });
  const [busy, setBusy] = useState(false);

  const shownId = governor.allianceId ?? viewing;

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) onToast(ok);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Falha na operação.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        if (shownId) {
          const d = await api.get<Detail>(`/alliances/${shownId}`);
          if (!cancel) setDetail(d);
        } else {
          setDetail(null);
          const [l, a] = await Promise.all([
            api.get<{ alliances: AllianceRow[] }>(`/alliances?q=${encodeURIComponent(q)}`),
            api.get<{ applications: typeof myApps }>('/alliance/applications'),
          ]);
          if (!cancel) {
            setList(l.alliances);
            setMyApps(a.applications);
          }
        }
      } catch (e) {
        if (!cancel && e instanceof ApiError && e.status === 404) setViewing(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [shownId, refreshKey, q]);

  if (detail) {
    const { alliance, members, isMember, myRank, applications } = detail;
    const rank = myRank ?? 0;
    return (
      <div className="panel" data-testid="alliance-detail">
        {!isMember && (
          <button className="link" onClick={() => setViewing(null)}>
            ← Voltar à lista
          </button>
        )}
        <div className="alliance-head">
          <div className="emblem" aria-hidden>
            {alliance.tag}
          </div>
          <div>
            <h2>
              [{alliance.tag}] {alliance.name}
            </h2>
            <div className="muted small">
              {members.length} membros · poder {fmtNum(members.reduce((s, m) => s + m.power, 0))}
            </div>
          </div>
        </div>
        {alliance.description && <p className="small">{alliance.description}</p>}
        {!isMember &&
          (detail.myPendingApplicationId ? (
            <button
              className="btn"
              disabled={busy}
              onClick={() => act(() => api.post(`/alliance/applications/${detail.myPendingApplicationId}/cancel`), 'Candidatura cancelada.')}
            >
              Cancelar candidatura
            </button>
          ) : (
            <button
              className="btn primary"
              data-testid="apply-btn"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api.post(`/alliances/${alliance.id}/apply`, { message: '' });
                  setDetail({ ...detail, myPendingApplicationId: -1 });
                }, 'Candidatura enviada. Aguarde aprovação de um oficial.')
              }
            >
              Solicitar entrada
            </button>
          ))}

        {isMember && rank >= ALLIANCE_PERMISSIONS.reviewApplications && (
          <section>
            <h3>Candidaturas ({applications.length})</h3>
            {applications.length === 0 && <div className="muted small">Nenhuma candidatura pendente.</div>}
            {applications.map((a) => (
              <div key={a.id} className="row" data-testid="application-row">
                <div>
                  <b>{a.name}</b> <span className="muted small">poder {fmtNum(a.power)}</span>
                </div>
                <div className="row-actions">
                  <button className="btn small primary" disabled={busy} onClick={() => act(() => api.post(`/alliance/applications/${a.id}/approve`), `${a.name} aprovado.`)}>
                    Aprovar
                  </button>
                  <button className="btn small" disabled={busy} onClick={() => act(() => api.post(`/alliance/applications/${a.id}/reject`), 'Candidatura recusada.')}>
                    Recusar
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        <section>
          <h3>Membros</h3>
          {members.map((m) => (
            <div key={m.governor_id} className="row" data-testid="member-row">
              <div>
                <b>{m.name}</b>
                {m.governor_id === governor.id && <span className="pill">você</span>}
                <div className="muted small">
                  {ALLIANCE_RANK_LABELS[m.rank]} · poder {fmtNum(m.power)} ·{' '}
                  <button className="coord" onClick={() => onGoTo(m.x, m.y)}>
                    X:{m.x} Y:{m.y}
                  </button>
                </div>
              </div>
              {isMember && m.governor_id !== governor.id && (
                <div className="row-actions">
                  {rank >= ALLIANCE_PERMISSIONS.setRank && m.rank < 4 && (
                    <button className="btn small" disabled={busy} onClick={() => act(() => api.post(`/alliance/members/${m.governor_id}/rank`, { rank: m.rank + 1 }))}>
                      ▲
                    </button>
                  )}
                  {rank >= ALLIANCE_PERMISSIONS.setRank && m.rank > 1 && m.rank < 5 && (
                    <button className="btn small" disabled={busy} onClick={() => act(() => api.post(`/alliance/members/${m.governor_id}/rank`, { rank: m.rank - 1 }))}>
                      ▼
                    </button>
                  )}
                  {rank >= ALLIANCE_PERMISSIONS.transferLeadership && (
                    <button
                      className="btn small"
                      disabled={busy}
                      onClick={() => confirm(`Transferir a liderança para ${m.name}?`) && act(() => api.post(`/alliance/members/${m.governor_id}/transfer`), 'Liderança transferida.')}
                    >
                      Líder
                    </button>
                  )}
                  {rank >= ALLIANCE_PERMISSIONS.kick && m.rank < rank && (
                    <button
                      className="btn small danger"
                      disabled={busy}
                      onClick={() => confirm(`Expulsar ${m.name}?`) && act(() => api.post(`/alliance/members/${m.governor_id}/kick`), `${m.name} expulso.`)}
                    >
                      Expulsar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
        {isMember && (
          <button
            className="btn danger wide"
            disabled={busy}
            data-testid="leave-btn"
            onClick={() =>
              confirm(members.length === 1 ? 'Você é o único membro: sair dissolve a aliança. Continuar?' : 'Sair da aliança?') &&
              act(() => api.post('/alliance/leave'), 'Você saiu da aliança.')
            }
          >
            {rank === 5 && members.length > 1 ? 'Sair (transfira a liderança antes)' : 'Sair da aliança'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="panel" data-testid="alliance-list">
      <h2>Alianças do reino</h2>
      <p className="muted small">Entre numa aliança para cooperar, conversar no canal privado e disputar o reino.</p>
      {myApps.length > 0 && (
        <div className="notice">
          Candidatura pendente: {myApps.map((a) => `[${a.tag}] ${a.name}`).join(', ')}
        </div>
      )}
      {creating ? (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => api.post('/alliances', form), 'Aliança fundada!').then(() => setCreating(false));
          }}
        >
          <label>
            Nome
            <input value={form.name} maxLength={24} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="alliance-name" />
          </label>
          <label>
            Sigla (2–4)
            <input
              value={form.tag}
              maxLength={4}
              onChange={(e) => setForm({ ...form, tag: e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase() })}
              required
              data-testid="alliance-tag"
            />
          </label>
          <label>
            Descrição
            <textarea value={form.description} maxLength={300} rows={2} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div className="row-actions">
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Cancelar
            </button>
            <button className="btn primary" disabled={busy} data-testid="alliance-create-submit">
              Fundar aliança
            </button>
          </div>
        </form>
      ) : (
        <button className="btn primary wide" onClick={() => setCreating(true)} data-testid="alliance-create">
          Fundar uma aliança
        </button>
      )}
      <input className="search" placeholder="Buscar por nome ou sigla" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 && <div className="muted small">Nenhuma aliança neste reino ainda.</div>}
      {list.map((a) => (
        <button key={a.id} className="row button-row" onClick={() => setViewing(a.id)} data-testid="alliance-row">
          <div className="emblem small" aria-hidden>
            {a.tag}
          </div>
          <div className="grow">
            <b>
              [{a.tag}] {a.name}
            </b>
            <div className="muted small">
              {a.members} membros · poder {fmtNum(a.power)}
            </div>
          </div>
          <span aria-hidden>›</span>
        </button>
      ))}
    </div>
  );
}
