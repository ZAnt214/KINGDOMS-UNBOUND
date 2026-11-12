import { ALLIANCE_MAX_MEMBERS } from '../../../shared/social.js';
import { botAnswer, breakPenalty, deliverable, DIPLOMACY } from '../../../shared/play/diplomacy.js';
import { type ResourceMap, RESOURCES } from '../../../shared/play/economy.js';
import { type Army, UNIT_TYPES } from '../../../shared/play/military.js';
import type { GameMode } from '../../../shared/play/rules.js';
import type { DiplomacyView, PactNews } from '../../../shared/play/types.js';
import { troops } from '../../../shared/play/war.js';
import type { GovernorCtx } from '../auth.js';
import { type Db, type Tx, tx } from '../db.js';
import { bad, conflict, HttpError, notFound } from '../http.js';
import type { Hub } from '../hub.js';
import type { EconomyService } from './economy.js';
import type { MilitaryService } from './military.js';

type Queryable = Pick<Db, 'query'> | Pick<Tx, 'query'>;

async function audit(client: Tx, actor: number, action: string, targetType: string, targetId: string | number, data = {}) {
  await client.query('INSERT INTO audit_logs (actor_governor_id, action, target_type, target_id, data) VALUES ($1, $2, $3, $4, $5)', [
    actor,
    action,
    targetType,
    String(targetId),
    data,
  ]);
}

/** Associação atual (aliança ativa) com lock. */
async function membership(client: Tx, governorId: number) {
  const { rows } = await client.query(
    `SELECT m.alliance_id, m.rank FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id
      WHERE m.governor_id = $1 AND a.status = 'active' FOR UPDATE OF m`,
    [governorId],
  );
  return rows[0] ? { allianceId: Number(rows[0].alliance_id), rank: Number(rows[0].rank) } : null;
}

async function membersOf(q: Queryable, allianceId: number): Promise<number[]> {
  const { rows } = await q.query('SELECT governor_id FROM alliance_members WHERE alliance_id = $1 ORDER BY governor_id', [allianceId]);
  return rows.map((r) => Number(r.governor_id));
}

/** Penalidade aplicada a quem rompe (para o aviso). */
export interface Penalty {
  troops: Army;
  resources: ResourceMap;
}

/**
 * Diplomacia (Fase F), autoritativa no servidor:
 *   - pedido de aliança a outra nação, válido até ser aceito, recusado, cancelado ou vencer;
 *   - ao aceitar, as duas nações passam a ser da mesma aliança (cria uma, ou entra na de quem já tem);
 *   - envio de recursos entre aliados (só o que cabe no armazém de quem recebe);
 *   - quebra com penalidade automática: −10% das tropas em casa, −20% dos recursos e 30 minutos sem
 *     poder atacar os antigos aliados; tudo registrado (alliance_breaks e audit_logs).
 * Bots respondem pedidos na hora pela regra pública `botAnswer`.
 */
export class DiplomacyService {
  constructor(
    private db: Db,
    private hub: Hub,
    private economy: EconomyService,
    private military: MilitaryService,
  ) {}

  async view(q: Queryable, governorId: number): Promise<DiplomacyView> {
    const [requests, blocks, alliance] = await Promise.all([
      q.query(
        `SELECT id, from_id, to_id, created_at, expires_at FROM alliance_requests
          WHERE status = 'pending' AND expires_at > now() AND (from_id = $1 OR to_id = $1) ORDER BY id`,
        [governorId],
      ),
      q.query(`SELECT former_id, max(until) AS until FROM alliance_breaks WHERE breaker_id = $1 AND until > now() GROUP BY former_id`, [governorId]),
      q.query(
        `SELECT a.name FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id AND a.status = 'active' WHERE m.governor_id = $1`,
        [governorId],
      ),
    ]);
    return {
      requests: requests.rows.map((r) => ({
        id: Number(r.id),
        fromId: Number(r.from_id),
        toId: Number(r.to_id),
        createdAt: new Date(r.created_at).getTime(),
        expiresAt: new Date(r.expires_at).getTime(),
      })),
      blocks: blocks.rows.map((r) => ({ nationId: Number(r.former_id), until: new Date(r.until).getTime() })),
      allianceName: alliance.rows[0]?.name ?? null,
    };
  }

  private async announce(...ids: number[]) {
    for (const id of new Set(ids)) this.hub.toGovernor(id, { type: 'play.diplomacy', diplomacy: await this.view(this.db, id), serverTime: Date.now() });
  }

  private news(kingdomId: number, news: PactNews, only: number[] | null = null) {
    const e = { type: 'play.pact', news, serverTime: Date.now() };
    if (only) for (const id of new Set(only)) this.hub.toGovernor(id, e);
    else this.hub.toKingdom(kingdomId, e);
  }

  private async open(q: Queryable, kingdomId: number) {
    const { rows } = await q.query('SELECT finished_at, mode FROM kingdoms WHERE id = $1', [kingdomId]);
    if (rows[0]?.finished_at) throw conflict('match_over', 'Esta partida já terminou.');
    return { mode: (rows[0]?.mode ?? 'campaign') as GameMode };
  }

  private async nation(q: Queryable, governorId: number, kingdomId: number) {
    const { rows } = await q.query(
      'SELECT n.governor_id, n.name, g.is_bot FROM nations n JOIN governors g ON g.id = n.governor_id WHERE n.governor_id = $1 AND n.kingdom_id = $2',
      [governorId, kingdomId],
    );
    return rows[0] ? { id: Number(rows[0].governor_id), name: rows[0].name as string, bot: rows[0].is_bot === true } : null;
  }

  private async allied(q: Queryable, a: number, b: number) {
    const { rowCount } = await q.query(
      `SELECT 1 FROM alliance_members x JOIN alliance_members y ON y.alliance_id = x.alliance_id
         JOIN alliances al ON al.id = x.alliance_id AND al.status = 'active'
        WHERE x.governor_id = $1 AND y.governor_id = $2`,
      [a, b],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Pede aliança a outra nação. Se ela já tinha pedido a você, a aliança é formada na hora. */
  async request(g: GovernorCtx, targetId: number) {
    if (targetId === g.id) throw bad('self', 'Escolha outra nação.');
    const { mode } = await this.open(this.db, g.kingdomId);
    const me = await this.nation(this.db, g.id, g.kingdomId);
    if (!me) throw new HttpError(409, 'no_nation', 'Funde sua nação antes de fazer alianças.');
    const target = await this.nation(this.db, targetId, g.kingdomId);
    if (!target) throw notFound('Nação não encontrada.');
    if (await this.allied(this.db, g.id, targetId)) throw conflict('already_allied', `Vocês já são aliados.`);
    const reverse = await this.db.query(
      `SELECT id FROM alliance_requests WHERE from_id = $1 AND to_id = $2 AND status = 'pending' AND expires_at > now()`,
      [targetId, g.id],
    );
    if (reverse.rowCount) return { accepted: true, ...(await this.answer(g, Number(reverse.rows[0].id), true)) };
    const requestId = await tx(this.db, async (client) => {
      await client.query('SELECT id FROM governors WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE', [[g.id, targetId]]);
      const [a, b] = [await membership(client, g.id), await membership(client, targetId)];
      if (a && b && a.allianceId !== b.allianceId) throw conflict('other_alliance', `${target.name} já está em outra aliança. Um dos dois precisa sair antes.`);
      const join = a ?? b;
      if (join && (await membersOf(client, join.allianceId)).length >= ALLIANCE_MAX_MEMBERS) throw conflict('alliance_full', 'A aliança está cheia.');
      // Pedidos vencidos saem do caminho do índice de pendentes.
      await client.query(`UPDATE alliance_requests SET status = 'cancelled', decided_at = now() WHERE status = 'pending' AND expires_at <= now() AND from_id = $1 AND to_id = $2`, [
        g.id,
        targetId,
      ]);
      const ins = await client.query(
        `INSERT INTO alliance_requests (kingdom_id, from_id, to_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))
         ON CONFLICT DO NOTHING RETURNING id, expires_at`,
        [g.kingdomId, g.id, targetId, DIPLOMACY.requestMinutes[mode]],
      );
      if (!ins.rowCount) throw conflict('already_requested', `Você já pediu aliança a ${target.name}. Aguarde a resposta.`);
      await audit(client, g.id, 'pact.requested', 'governor', targetId);
      return { id: Number(ins.rows[0].id), expiresAt: new Date(ins.rows[0].expires_at).getTime() };
    });
    this.news(g.kingdomId, { kind: 'request', requestId: requestId.id, from: g.id, to: targetId, expiresAt: requestId.expiresAt }, [g.id, targetId]);
    await this.announce(g.id, targetId);
    // Bot responde na hora, pela regra pública.
    if (target.bot) {
      const answer = botAnswer(await this.botInputs(g.kingdomId, g.id, targetId));
      const botCtx: GovernorCtx = { id: targetId, name: target.name, kingdomId: g.kingdomId, mode, allianceId: null, allianceRank: null };
      const r = await this.answer(botCtx, requestId.id, answer.accept, answer.reason);
      return { accepted: answer.accept, reason: answer.reason, requestId: requestId.id, ...r };
    }
    return { accepted: false, requestId: requestId.id };
  }

  /** Entradas da regra do bot (todas públicas no jogo, exceto o histórico de quebras, que é do servidor). */
  private async botInputs(kingdomId: number, requester: number, bot: number) {
    const [war, broke, powers] = await Promise.all([
      this.db.query(
        `SELECT 1 FROM operations WHERE kingdom_id = $1 AND status = 'active' AND ((attacker_id = $2 AND defender_id = $3) OR (attacker_id = $3 AND defender_id = $2))
         UNION ALL
         SELECT 1 FROM strikes WHERE kingdom_id = $1 AND status = 'flying' AND ((attacker_id = $2 AND defender_id = $3) OR (attacker_id = $3 AND defender_id = $2))`,
        [kingdomId, requester, bot],
      ),
      this.db.query('SELECT 1 FROM alliance_breaks WHERE breaker_id = $1 AND former_id = $2', [requester, bot]),
      this.db.query('SELECT n.governor_id, COALESCE(m.power, 0) AS power FROM nations n LEFT JOIN military m ON m.governor_id = n.governor_id WHERE n.kingdom_id = $1', [kingdomId]),
    ]);
    const power = (id: number) => Number(powers.rows.find((r) => Number(r.governor_id) === id)?.power ?? 0);
    const strongestOther = Math.max(0, ...powers.rows.filter((r) => Number(r.governor_id) !== requester).map((r) => Number(r.power)));
    return { atWar: (war.rowCount ?? 0) > 0, brokeBefore: (broke.rowCount ?? 0) > 0, requesterPower: power(requester), strongestOther };
  }

  /** Quem recebeu o pedido aceita ou recusa. Aceito, as duas nações ficam na mesma aliança. */
  async answer(g: GovernorCtx, requestId: number, accept: boolean, reason?: string) {
    let affected: number[] = [];
    let joined: number[] = [];
    const done = await tx(this.db, async (client) => {
      const { rows } = await client.query('SELECT * FROM alliance_requests WHERE id = $1 FOR UPDATE', [requestId]);
      const req = rows[0];
      if (!req || Number(req.to_id) !== g.id || req.kingdom_id !== g.kingdomId) throw notFound('Pedido não encontrado.');
      if (req.status !== 'pending') throw conflict('request_over', 'Este pedido já foi respondido.');
      if (new Date(req.expires_at).getTime() <= Date.now()) throw conflict('request_expired', 'Este pedido venceu.');
      const fromId = Number(req.from_id);
      if (!accept) {
        await client.query(`UPDATE alliance_requests SET status = 'declined', decided_at = now() WHERE id = $1`, [requestId]);
        await audit(client, g.id, 'pact.declined', 'governor', fromId, reason ? { reason } : {});
        return { fromId, allianceId: null as number | null };
      }
      await this.open(client, g.kingdomId);
      const names = await client.query('SELECT governor_id, name FROM nations WHERE governor_id = ANY($1::bigint[])', [[fromId, g.id]]);
      if (names.rowCount !== 2) throw conflict('no_nation', 'Uma das nações não existe mais.');
      const nameOf = (id: number) => names.rows.find((r) => Number(r.governor_id) === id)?.name as string;
      await client.query('SELECT id FROM governors WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE', [[fromId, g.id]]);
      const [a, b] = [await membership(client, fromId), await membership(client, g.id)];
      if (a && b && a.allianceId === b.allianceId) throw conflict('already_allied', 'Vocês já são aliados.');
      if (a && b) throw conflict('other_alliance', 'Vocês estão em alianças diferentes. Um dos dois precisa sair antes.');
      let allianceId: number;
      if (a || b) {
        allianceId = (a ?? b)!.allianceId;
        const members = await membersOf(client, allianceId);
        if (members.length >= ALLIANCE_MAX_MEMBERS) throw conflict('alliance_full', 'A aliança está cheia.');
        joined = [a ? g.id : fromId];
        affected = [...members, ...joined];
      } else {
        // Nenhum dos dois tem aliança: nasce uma, com o nome das duas nações; quem pediu lidera.
        let name = `${nameOf(fromId)} e ${nameOf(g.id)}`.slice(0, 60);
        const dup = await client.query(`SELECT 1 FROM alliances WHERE kingdom_id = $1 AND status = 'active' AND lower(name) = lower($2)`, [g.kingdomId, name]);
        if (dup.rowCount) name = `${name.slice(0, 50)} (${requestId})`;
        const ins = await client.query(`INSERT INTO alliances (kingdom_id, name, tag, description, created_by) VALUES ($1, $2, $3, '', $4) RETURNING id`, [
          g.kingdomId,
          name,
          `P${requestId}`,
          fromId,
        ]);
        allianceId = Number(ins.rows[0].id);
        await client.query(`INSERT INTO chat_channels (type, alliance_id) VALUES ('alliance', $1)`, [allianceId]);
        joined = [fromId, g.id];
        affected = joined;
      }
      // A rede logística passa a ligar os aliados: acerta a produção de todos antes da mudança.
      await this.economy.settleMany(client, affected, new Date());
      for (const id of joined) {
        const rank = !a && !b && id === fromId ? 5 : 1;
        await client.query('INSERT INTO alliance_members (governor_id, alliance_id, rank) VALUES ($1, $2, $3)', [id, allianceId, rank]);
      }
      await client.query(`UPDATE alliance_applications SET status = 'cancelled', decided_at = now() WHERE governor_id = ANY($1::bigint[]) AND status = 'pending'`, [joined]);
      await client.query(`UPDATE alliance_requests SET status = 'accepted', decided_at = now() WHERE id = $1`, [requestId]);
      // Outros pedidos entre os dois deixam de valer.
      await client.query(
        `UPDATE alliance_requests SET status = 'cancelled', decided_at = now()
          WHERE status = 'pending' AND id <> $1 AND ((from_id = $2 AND to_id = $3) OR (from_id = $3 AND to_id = $2))`,
        [requestId, fromId, g.id],
      );
      await audit(client, g.id, 'pact.accepted', 'alliance', allianceId, { from: fromId });
      return { fromId, allianceId };
    });
    if (done.allianceId === null) {
      this.news(g.kingdomId, { kind: 'declined', requestId, from: done.fromId, to: g.id, reason }, [done.fromId, g.id]);
      await this.announce(done.fromId, g.id);
      return { allianceId: null };
    }
    for (const id of joined) {
      await this.hub.refreshGovernor(id);
      this.hub.toKingdom(g.kingdomId, { type: 'play.alliance', nationId: id, alliance: done.allianceId, serverTime: Date.now() });
    }
    this.news(g.kingdomId, { kind: 'accepted', requestId, from: done.fromId, to: g.id, allianceId: done.allianceId });
    for (const id of affected) await this.economy.announceEconomy(id);
    await this.announce(...affected);
    return { allianceId: done.allianceId };
  }

  async cancel(g: GovernorCtx, requestId: number) {
    const r = await this.db.query(
      `UPDATE alliance_requests SET status = 'cancelled', decided_at = now() WHERE id = $1 AND from_id = $2 AND status = 'pending' RETURNING to_id`,
      [requestId, g.id],
    );
    if (!r.rowCount) throw notFound('Pedido não encontrado.');
    await this.announce(g.id, Number(r.rows[0].to_id));
    return { ok: true };
  }

  /**
   * Penalidade de quem sai de uma aliança com outros membros (dentro da transação da saída): tira
   * 10% das tropas em casa e 20% dos recursos e registra o bloqueio de 30 minutos contra cada
   * antigo aliado. Também usada pela saída pela rota antiga (/alliance/leave).
   */
  async penalize(client: Tx, breakerId: number, formers: number[], allianceId: number): Promise<{ penalty: Penalty; until: number } | null> {
    if (!formers.length) return null;
    const kingdom = await client.query('SELECT kingdom_id FROM governors WHERE id = $1', [breakerId]);
    const kingdomId = kingdom.rows[0]?.kingdom_id;
    const hasNation = await client.query('SELECT 1 FROM nations WHERE governor_id = $1', [breakerId]);
    if (!hasNation.rowCount) return null;
    const amounts = await this.economy.settle(client, breakerId, new Date());
    const army = await client.query('SELECT unit, amount FROM army WHERE governor_id = $1 FOR UPDATE', [breakerId]);
    const home: Army = Object.fromEntries(army.rows.map((r) => [r.unit, r.amount]));
    const penalty = breakPenalty(home, amounts);
    for (const u of UNIT_TYPES) {
      const n = penalty.troops[u] ?? 0;
      if (n > 0) await client.query('UPDATE army SET amount = amount - $3 WHERE governor_id = $1 AND unit = $2', [breakerId, u, n]);
    }
    for (const r of RESOURCES) {
      const n = penalty.resources[r];
      if (n > 0) await client.query('UPDATE nation_resources SET amount = GREATEST(0, amount - $3) WHERE governor_id = $1 AND resource = $2', [breakerId, r, n]);
    }
    const { rows } = await client.query(`SELECT now() + make_interval(mins => $1) AS until`, [DIPLOMACY.breakBlockMinutes]);
    const until = new Date(rows[0].until);
    for (const f of formers) {
      await client.query('INSERT INTO alliance_breaks (kingdom_id, breaker_id, former_id, alliance_id, until, penalty) VALUES ($1, $2, $3, $4, $5, $6)', [
        kingdomId,
        breakerId,
        f,
        allianceId,
        until,
        JSON.stringify(penalty),
      ]);
    }
    await audit(client, breakerId, 'pact.broken', 'alliance', allianceId, { formers, penalty });
    return { penalty, until: until.getTime() };
  }

  /** Avisos depois da quebra (poder, economia, exército, notícia aos antigos aliados). */
  async afterBreak(kingdomId: number, breakerId: number, formers: number[], result: { penalty: Penalty; until: number }) {
    await this.military.refreshPower(breakerId);
    await this.military.announce(breakerId);
    await this.economy.announceEconomy(breakerId);
    const lost: Partial<ResourceMap> = {};
    for (const r of RESOURCES) if (result.penalty.resources[r] > 0) lost[r] = result.penalty.resources[r];
    this.news(kingdomId, { kind: 'broken', by: breakerId, formers, penalty: { troops: troops(result.penalty.troops), resources: lost }, until: result.until });
    await this.announce(breakerId, ...formers);
  }

  /**
   * Rompe a aliança atual. O líder que sai passa a liderança ao membro de maior cargo; com um só
   * membro restante, a aliança é dissolvida.
   */
  async breakAlliance(g: GovernorCtx) {
    let affected: number[] = [];
    let formers: number[] = [];
    let dissolved = false;
    const done = await tx(this.db, async (client) => {
      const m = await membership(client, g.id);
      if (!m) throw bad('not_member', 'Sua nação não está em uma aliança.');
      await client.query(`SELECT id FROM alliances WHERE id = $1 FOR UPDATE`, [m.allianceId]);
      const members = await membersOf(client, m.allianceId);
      formers = members.filter((id) => id !== g.id);
      affected = members;
      await this.economy.settleMany(client, affected, new Date());
      const result = await this.penalize(client, g.id, formers, m.allianceId);
      await client.query('DELETE FROM alliance_members WHERE governor_id = $1', [g.id]);
      if (formers.length <= 1) {
        dissolved = true;
        await client.query('DELETE FROM alliance_members WHERE alliance_id = $1', [m.allianceId]);
        await client.query(`UPDATE alliances SET status = 'disbanded' WHERE id = $1`, [m.allianceId]);
        await client.query(`UPDATE chat_channels SET archived = true WHERE alliance_id = $1`, [m.allianceId]);
        await client.query(`UPDATE alliance_applications SET status = 'cancelled', decided_at = now() WHERE alliance_id = $1 AND status = 'pending'`, [m.allianceId]);
      } else if (m.rank === 5) {
        await client.query(
          `UPDATE alliance_members SET rank = 5 WHERE governor_id = (SELECT governor_id FROM alliance_members WHERE alliance_id = $1 ORDER BY rank DESC, joined_at, governor_id LIMIT 1)`,
          [m.allianceId],
        );
      }
      return { allianceId: m.allianceId, result };
    });
    const left = dissolved ? affected : [g.id];
    for (const id of left) {
      await this.hub.refreshGovernor(id);
      this.hub.toKingdom(g.kingdomId, { type: 'play.alliance', nationId: id, alliance: null, serverTime: Date.now() });
    }
    for (const id of affected) await this.economy.announceEconomy(id);
    if (done.result) await this.afterBreak(g.kingdomId, g.id, formers, done.result);
    else await this.announce(...affected);
    return { ok: true, penalty: done.result?.penalty ?? null, until: done.result?.until ?? null };
  }

  /** Envia recursos a um aliado. Só chega (e só é cobrado) o que cabe no armazém dele. */
  async gift(g: GovernorCtx, toId: number, asked: Partial<ResourceMap>) {
    if (toId === g.id) throw bad('self', 'Escolha um aliado.');
    if (!RESOURCES.some((r) => (asked[r] ?? 0) >= 1)) throw bad('empty', 'Escolha quanto enviar.');
    await this.open(this.db, g.kingdomId);
    const target = await this.nation(this.db, toId, g.kingdomId);
    if (!target) throw notFound('Nação não encontrada.');
    const sent = await tx(this.db, async (client) => {
      if (!(await this.allied(client, g.id, toId))) throw conflict('not_allied', 'Só é possível enviar recursos a aliados.');
      await this.economy.settleMany(client, [g.id, toId], new Date());
      const view = await this.economy.view(client, toId);
      if (!view) throw notFound('Nação não encontrada.');
      const out = deliverable(asked, view.amounts, view.capacity);
      if (!Object.keys(out).length) throw conflict('storage_full', `O armazém de ${target.name} está cheio para esses recursos.`);
      await this.economy.spend(client, g.id, out, 'o envio');
      for (const [r, v] of Object.entries(out)) {
        await client.query('UPDATE nation_resources SET amount = amount + $3 WHERE governor_id = $1 AND resource = $2', [toId, r, v]);
      }
      await client.query('INSERT INTO gifts (kingdom_id, from_id, to_id, resources) VALUES ($1, $2, $3, $4)', [g.kingdomId, g.id, toId, JSON.stringify(out)]);
      await audit(client, g.id, 'pact.gift', 'governor', toId, out);
      return out;
    });
    await this.economy.announceEconomy(g.id);
    await this.economy.announceEconomy(toId);
    this.news(g.kingdomId, { kind: 'gift', from: g.id, to: toId, resources: sent }, [g.id, toId]);
    return { sent };
  }
}
