import { ALLIANCE_MAX_MEMBERS, hasAlliancePermission } from '../../../shared/rules.js';
import type { GovernorCtx } from '../auth.js';
import { type Db, type Tx, tx } from '../db.js';
import { bad, conflict, forbidden, notFound } from '../http.js';
import type { Hub } from '../hub.js';
import { mapCitySummary } from './city.js';

async function audit(client: Tx, actor: number, action: string, targetType: string, targetId: string | number, data = {}) {
  await client.query(
    'INSERT INTO audit_logs (actor_governor_id, action, target_type, target_id, data) VALUES ($1, $2, $3, $4, $5)',
    [actor, action, targetType, String(targetId), data],
  );
}

/** Lê a associação atual do ator com lock, para decisões de permissão consistentes. */
async function lockMembership(client: Tx, governorId: number) {
  const { rows } = await client.query(
    `SELECT m.alliance_id, m.rank FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id
      WHERE m.governor_id = $1 AND a.status = 'active' FOR UPDATE OF m`,
    [governorId],
  );
  return rows[0] ? { allianceId: Number(rows[0].alliance_id), rank: Number(rows[0].rank) } : null;
}

async function lockAlliance(client: Tx, allianceId: number) {
  const { rows } = await client.query(`SELECT id, kingdom_id, status FROM alliances WHERE id = $1 FOR UPDATE`, [allianceId]);
  if (!rows[0] || rows[0].status !== 'active') throw notFound('Aliança não encontrada.');
  return rows[0];
}

export class AllianceService {
  constructor(
    private db: Db,
    private hub: Hub,
  ) {}

  async list(gov: GovernorCtx, q: string) {
    const { rows } = await this.db.query(
      `SELECT a.id, a.name, a.tag, a.description, COUNT(m.governor_id)::int AS members,
              COALESCE(SUM(g.power), 0)::int AS power
         FROM alliances a
         LEFT JOIN alliance_members m ON m.alliance_id = a.id
         LEFT JOIN governors g ON g.id = m.governor_id
        WHERE a.kingdom_id = $1 AND a.status = 'active'
          AND ($2 = '' OR a.name ILIKE '%' || $2 || '%' OR a.tag ILIKE '%' || $2 || '%')
        GROUP BY a.id ORDER BY power DESC, a.id LIMIT 50`,
      [gov.kingdomId, q],
    );
    return rows;
  }

  async detail(gov: GovernorCtx, allianceId: number) {
    const a = await this.db.query(
      `SELECT id, name, tag, description, kingdom_id, created_at FROM alliances WHERE id = $1 AND status = 'active'`,
      [allianceId],
    );
    // Isolamento por reino: alianças de outro reino não são visíveis.
    if (!a.rows[0] || a.rows[0].kingdom_id !== gov.kingdomId) throw notFound('Aliança não encontrada.');
    const members = await this.db.query(
      `SELECT g.id AS governor_id, g.name, g.power, m.rank, m.joined_at, c.x, c.y
         FROM alliance_members m JOIN governors g ON g.id = m.governor_id JOIN cities c ON c.governor_id = g.id
        WHERE m.alliance_id = $1 ORDER BY m.rank DESC, g.power DESC`,
      [allianceId],
    );
    const isMember = gov.allianceId === allianceId;
    let applications: unknown[] = [];
    if (isMember && gov.allianceRank && hasAlliancePermission(gov.allianceRank, 'reviewApplications')) {
      const apps = await this.db.query(
        `SELECT ap.id, ap.governor_id, g.name, g.power, ap.message, ap.created_at
           FROM alliance_applications ap JOIN governors g ON g.id = ap.governor_id
          WHERE ap.alliance_id = $1 AND ap.status = 'pending' ORDER BY ap.id`,
        [allianceId],
      );
      applications = apps.rows;
    }
    const mine = await this.db.query(
      `SELECT id FROM alliance_applications WHERE alliance_id = $1 AND governor_id = $2 AND status = 'pending'`,
      [allianceId, gov.id],
    );
    return {
      alliance: { id: a.rows[0].id, name: a.rows[0].name, tag: a.rows[0].tag, description: a.rows[0].description },
      members: members.rows,
      isMember,
      myRank: isMember ? gov.allianceRank : null,
      applications,
      myPendingApplicationId: mine.rows[0]?.id ?? null,
    };
  }

  async myApplications(gov: GovernorCtx) {
    const { rows } = await this.db.query(
      `SELECT ap.id, ap.alliance_id, a.name, a.tag, ap.status, ap.created_at
         FROM alliance_applications ap JOIN alliances a ON a.id = ap.alliance_id
        WHERE ap.governor_id = $1 AND ap.status = 'pending' ORDER BY ap.id DESC`,
      [gov.id],
    );
    return rows;
  }

  async create(gov: GovernorCtx, input: { name: string; tag: string; description: string }) {
    const allianceId = await tx(this.db, async (client) => {
      await client.query('SELECT id FROM governors WHERE id = $1 FOR UPDATE', [gov.id]);
      if (await lockMembership(client, gov.id)) throw conflict('already_member', 'Você já pertence a uma aliança.');
      const dup = await client.query(
        `SELECT 1 FROM alliances WHERE kingdom_id = $1 AND status = 'active' AND (lower(name) = lower($2) OR lower(tag) = lower($3))`,
        [gov.kingdomId, input.name, input.tag],
      );
      if (dup.rowCount) throw conflict('alliance_name_taken', 'Nome ou sigla já em uso neste reino.');
      const a = await client.query(
        `INSERT INTO alliances (kingdom_id, name, tag, description, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [gov.kingdomId, input.name, input.tag, input.description, gov.id],
      );
      const id = Number(a.rows[0].id);
      await client.query('INSERT INTO alliance_members (governor_id, alliance_id, rank) VALUES ($1, $2, 5)', [gov.id, id]);
      await client.query(`INSERT INTO chat_channels (type, alliance_id) VALUES ('alliance', $1)`, [id]);
      // Candidaturas pendentes em outras alianças perdem efeito.
      await client.query(
        `UPDATE alliance_applications SET status = 'cancelled', decided_at = now() WHERE governor_id = $1 AND status = 'pending'`,
        [gov.id],
      );
      await audit(client, gov.id, 'alliance.created', 'alliance', id, input);
      return id;
    });
    await this.afterMembershipChange(gov.id, allianceId);
    return { allianceId };
  }

  async apply(gov: GovernorCtx, allianceId: number, message: string) {
    const appId = await tx(this.db, async (client) => {
      const a = await lockAlliance(client, allianceId);
      if (a.kingdom_id !== gov.kingdomId) throw notFound('Aliança não encontrada.');
      if (await lockMembership(client, gov.id)) throw conflict('already_member', 'Você já pertence a uma aliança.');
      const r = await client.query(
        `INSERT INTO alliance_applications (alliance_id, governor_id, message) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING RETURNING id`,
        [allianceId, gov.id, message],
      );
      if (!r.rowCount) throw conflict('already_applied', 'Você já tem uma candidatura pendente nesta aliança.');
      await audit(client, gov.id, 'alliance.applied', 'alliance', allianceId);
      return Number(r.rows[0].id);
    });
    this.hub.toAlliance(allianceId, { type: 'alliance.updated', allianceId, reason: 'application' });
    return { applicationId: appId };
  }

  async cancelApplication(gov: GovernorCtx, applicationId: number) {
    const r = await this.db.query(
      `UPDATE alliance_applications SET status = 'cancelled', decided_at = now()
        WHERE id = $1 AND governor_id = $2 AND status = 'pending' RETURNING alliance_id`,
      [applicationId, gov.id],
    );
    if (!r.rowCount) throw notFound('Candidatura não encontrada.');
    this.hub.toAlliance(Number(r.rows[0].alliance_id), { type: 'alliance.updated', reason: 'application' });
    return { ok: true };
  }

  async decide(gov: GovernorCtx, applicationId: number, approve: boolean) {
    const result = await tx(this.db, async (client) => {
      const actor = await lockMembership(client, gov.id);
      const ap = await client.query(`SELECT * FROM alliance_applications WHERE id = $1 FOR UPDATE`, [applicationId]);
      const app = ap.rows[0];
      if (!app || app.status !== 'pending') throw notFound('Candidatura não encontrada.');
      if (!actor || actor.allianceId !== Number(app.alliance_id) || !hasAlliancePermission(actor.rank, 'reviewApplications')) {
        throw forbidden('Apenas oficiais (R4) e o líder (R5) avaliam candidaturas.');
      }
      await lockAlliance(client, actor.allianceId);
      if (approve) {
        await client.query('SELECT id FROM governors WHERE id = $1 FOR UPDATE', [app.governor_id]);
        if (await lockMembership(client, Number(app.governor_id))) {
          await client.query(`UPDATE alliance_applications SET status = 'cancelled', decided_at = now() WHERE id = $1`, [
            applicationId,
          ]);
          throw conflict('applicant_taken', 'O candidato já entrou em outra aliança.');
        }
        const count = await client.query('SELECT COUNT(*)::int AS n FROM alliance_members WHERE alliance_id = $1', [actor.allianceId]);
        if (count.rows[0].n >= ALLIANCE_MAX_MEMBERS) throw conflict('alliance_full', 'A aliança está cheia.');
        await client.query('INSERT INTO alliance_members (governor_id, alliance_id, rank) VALUES ($1, $2, 1)', [
          app.governor_id,
          actor.allianceId,
        ]);
        await client.query(
          `UPDATE alliance_applications SET status = 'cancelled', decided_at = now()
            WHERE governor_id = $1 AND status = 'pending' AND id <> $2`,
          [app.governor_id, applicationId],
        );
      }
      await client.query(
        `UPDATE alliance_applications SET status = $2, decided_at = now(), decided_by = $3 WHERE id = $1`,
        [applicationId, approve ? 'approved' : 'rejected', gov.id],
      );
      await audit(client, gov.id, approve ? 'alliance.approved' : 'alliance.rejected', 'governor', app.governor_id, {
        allianceId: actor.allianceId,
      });
      return { allianceId: actor.allianceId, applicantId: Number(app.governor_id) };
    });
    if (approve) await this.afterMembershipChange(result.applicantId, result.allianceId);
    else this.hub.toGovernor(result.applicantId, { type: 'alliance.updated', reason: 'rejected' });
    this.hub.toAlliance(result.allianceId, { type: 'alliance.updated', allianceId: result.allianceId });
    return { ok: true };
  }

  async leave(gov: GovernorCtx) {
    const result = await tx(this.db, async (client) => {
      const m = await lockMembership(client, gov.id);
      if (!m) throw bad('not_member', 'Você não está em uma aliança.');
      await lockAlliance(client, m.allianceId);
      const others = await client.query('SELECT COUNT(*)::int AS n FROM alliance_members WHERE alliance_id = $1 AND governor_id <> $2', [
        m.allianceId,
        gov.id,
      ]);
      const disband = others.rows[0].n === 0;
      if (m.rank === 5 && !disband) throw conflict('leader_must_transfer', 'Transfira a liderança antes de sair.');
      await client.query('DELETE FROM alliance_members WHERE governor_id = $1', [gov.id]);
      if (disband) {
        await client.query(`UPDATE alliances SET status = 'disbanded' WHERE id = $1`, [m.allianceId]);
        await client.query(`UPDATE chat_channels SET archived = true WHERE alliance_id = $1`, [m.allianceId]);
        await client.query(`UPDATE alliance_applications SET status = 'cancelled', decided_at = now() WHERE alliance_id = $1 AND status = 'pending'`, [
          m.allianceId,
        ]);
      }
      await audit(client, gov.id, disband ? 'alliance.disbanded' : 'alliance.left', 'alliance', m.allianceId);
      return m.allianceId;
    });
    await this.afterMembershipChange(gov.id, result);
    this.hub.toAlliance(result, { type: 'alliance.updated', allianceId: result });
    return { ok: true };
  }

  async kick(gov: GovernorCtx, targetId: number) {
    const allianceId = await tx(this.db, async (client) => {
      const actor = await lockMembership(client, gov.id);
      const target = await lockMembership(client, targetId);
      if (!actor || !target || actor.allianceId !== target.allianceId) throw notFound('Membro não encontrado.');
      if (!hasAlliancePermission(actor.rank, 'kick') || target.rank >= actor.rank) {
        throw forbidden('Você só pode expulsar membros de cargo inferior ao seu (exige R4+).');
      }
      await client.query('DELETE FROM alliance_members WHERE governor_id = $1', [targetId]);
      await audit(client, gov.id, 'alliance.kicked', 'governor', targetId, { allianceId: actor.allianceId });
      return actor.allianceId;
    });
    await this.afterMembershipChange(targetId, allianceId);
    this.hub.toAlliance(allianceId, { type: 'alliance.updated', allianceId });
    return { ok: true };
  }

  async setRank(gov: GovernorCtx, targetId: number, rank: number) {
    if (rank < 1 || rank > 4) throw bad('invalid_rank', 'Cargo deve ser entre R1 e R4. Para R5 use transferir liderança.');
    const allianceId = await tx(this.db, async (client) => {
      const actor = await lockMembership(client, gov.id);
      const target = await lockMembership(client, targetId);
      if (!actor || !target || actor.allianceId !== target.allianceId) throw notFound('Membro não encontrado.');
      if (!hasAlliancePermission(actor.rank, 'setRank') || targetId === gov.id) throw forbidden('Apenas o líder (R5) altera cargos.');
      await client.query('UPDATE alliance_members SET rank = $2 WHERE governor_id = $1', [targetId, rank]);
      await audit(client, gov.id, 'alliance.rank_changed', 'governor', targetId, { from: target.rank, to: rank });
      return actor.allianceId;
    });
    await this.hub.refreshGovernor(targetId);
    this.hub.toAlliance(allianceId, { type: 'alliance.updated', allianceId });
    return { ok: true };
  }

  async transfer(gov: GovernorCtx, targetId: number) {
    const allianceId = await tx(this.db, async (client) => {
      const actor = await lockMembership(client, gov.id);
      const target = await lockMembership(client, targetId);
      if (!actor || !target || actor.allianceId !== target.allianceId || targetId === gov.id) throw notFound('Membro não encontrado.');
      if (!hasAlliancePermission(actor.rank, 'transferLeadership')) throw forbidden('Apenas o líder transfere a liderança.');
      await client.query('UPDATE alliance_members SET rank = 4 WHERE governor_id = $1', [gov.id]);
      await client.query('UPDATE alliance_members SET rank = 5 WHERE governor_id = $1', [targetId]);
      await audit(client, gov.id, 'alliance.leadership_transferred', 'governor', targetId, { allianceId: actor.allianceId });
      return actor.allianceId;
    });
    await this.hub.refreshGovernor(targetId);
    await this.hub.refreshGovernor(gov.id);
    this.hub.toAlliance(allianceId, { type: 'alliance.updated', allianceId });
    return { ok: true };
  }

  /** Atualiza ACL das conexões em tempo real e a etiqueta da cidade no mapa. */
  private async afterMembershipChange(governorId: number, allianceId: number) {
    await this.hub.refreshGovernor(governorId);
    this.hub.toGovernor(governorId, { type: 'membership.changed', allianceId });
    const c = await this.db.query('SELECT id, kingdom_id FROM cities WHERE governor_id = $1', [governorId]);
    if (c.rows[0]) {
      const summary = await mapCitySummary(this.db, c.rows[0].id);
      if (summary) this.hub.toKingdom(c.rows[0].kingdom_id, { type: 'map.city', city: summary });
    }
  }
}
