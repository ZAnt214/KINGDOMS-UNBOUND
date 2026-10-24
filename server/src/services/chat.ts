import { CHAT_MAX_LENGTH, CHAT_RATE, extractCoordinates } from '../../../shared/rules.js';
import type { GovernorCtx } from '../auth.js';
import type { Db } from '../db.js';
import { bad, forbidden, HttpError, notFound, RateLimiter } from '../http.js';
import type { Hub } from '../hub.js';

interface Channel {
  id: number;
  type: 'global' | 'kingdom' | 'alliance';
  kingdom_id: number | null;
  alliance_id: number | null;
  archived: boolean;
}

export interface ChatMessage {
  id: number;
  channelId: number;
  body: string;
  attachments: { kind: 'coords'; kingdomId: number; x: number; y: number }[];
  createdAt: number;
  author: { governorId: number; name: string; kingdomId: number; allianceTag: string | null; civilization: string };
}

const MESSAGE_SQL = `
  SELECT msg.id, msg.channel_id, msg.body, msg.attachments, msg.created_at,
         g.id AS governor_id, g.name, g.kingdom_id, g.civilization, a.tag
    FROM chat_messages msg
    JOIN governors g ON g.id = msg.governor_id
    LEFT JOIN alliance_members m ON m.governor_id = g.id
    LEFT JOIN alliances a ON a.id = m.alliance_id`;

function toMessage(r: Record<string, any>): ChatMessage {
  return {
    id: r.id,
    channelId: r.channel_id,
    body: r.body,
    attachments: r.attachments,
    createdAt: new Date(r.created_at).getTime(),
    author: { governorId: r.governor_id, name: r.name, kingdomId: r.kingdom_id, allianceTag: r.tag ?? null, civilization: r.civilization },
  };
}

export class ChatService {
  private limiter = new RateLimiter(CHAT_RATE.messages, CHAT_RATE.perSeconds);

  constructor(
    private db: Db,
    private hub: Hub,
  ) {}

  /** ACL: decidida a partir do estado persistido do governador (carregado a cada requisição). */
  private async authorize(gov: GovernorCtx, channelId: number, write: boolean): Promise<Channel> {
    const { rows } = await this.db.query<Channel>('SELECT id, type, kingdom_id, alliance_id, archived FROM chat_channels WHERE id = $1', [
      channelId,
    ]);
    const ch = rows[0];
    if (!ch) throw notFound('Canal não encontrado.');
    const allowed =
      ch.type === 'global' ||
      (ch.type === 'kingdom' && ch.kingdom_id === gov.kingdomId) ||
      (ch.type === 'alliance' && ch.alliance_id !== null && ch.alliance_id === gov.allianceId && !ch.archived);
    if (!allowed) throw forbidden('Você não tem acesso a este canal.');
    if (write && ch.archived) throw forbidden('Canal arquivado.');
    return ch;
  }

  async channels(gov: GovernorCtx) {
    const { rows } = await this.db.query(
      `SELECT ch.id, ch.type, ch.kingdom_id, ch.alliance_id, a.name AS alliance_name, a.tag, k.name AS kingdom_name,
              COALESCE(r.last_read_message_id, 0) AS last_read,
              (SELECT COUNT(*)::int FROM (
                 SELECT 1 FROM chat_messages cm
                  WHERE cm.channel_id = ch.id AND cm.id > COALESCE(r.last_read_message_id, 0) AND cm.governor_id <> $1
                  LIMIT 100) t) AS unread
         FROM chat_channels ch
         LEFT JOIN alliances a ON a.id = ch.alliance_id
         LEFT JOIN kingdoms k ON k.id = ch.kingdom_id
         LEFT JOIN channel_reads r ON r.channel_id = ch.id AND r.governor_id = $1
        WHERE ch.type = 'global'
           OR (ch.type = 'kingdom' AND ch.kingdom_id = $2)
           OR (ch.type = 'alliance' AND ch.alliance_id = $3 AND NOT ch.archived)
        ORDER BY CASE ch.type WHEN 'alliance' THEN 0 WHEN 'kingdom' THEN 1 ELSE 2 END`,
      [gov.id, gov.kingdomId, gov.allianceId ?? -1],
    );
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.type === 'global' ? 'Global' : r.type === 'kingdom' ? r.kingdom_name : `[${r.tag}] ${r.alliance_name}`,
      unread: r.unread,
      lastRead: r.last_read,
    }));
  }

  async history(gov: GovernorCtx, channelId: number, before: number | null, limit: number) {
    await this.authorize(gov, channelId, false);
    const { rows } = await this.db.query(
      `${MESSAGE_SQL} WHERE msg.channel_id = $1 AND ($2::bigint IS NULL OR msg.id < $2) ORDER BY msg.id DESC LIMIT $3`,
      [channelId, before, limit + 1],
    );
    const hasMore = rows.length > limit;
    return { messages: rows.slice(0, limit).map(toMessage).reverse(), hasMore };
  }

  async post(gov: GovernorCtx, channelId: number, rawBody: string) {
    const ch = await this.authorize(gov, channelId, true);
    // eslint-disable-next-line no-control-regex
    const body = rawBody.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
    if (!body) throw bad('empty', 'Mensagem vazia.');
    if (body.length > CHAT_MAX_LENGTH) throw bad('too_long', `Máximo de ${CHAT_MAX_LENGTH} caracteres.`);
    if (!this.limiter.take(`chat:${gov.id}`)) throw new HttpError(429, 'rate_limited', 'Muitas mensagens. Aguarde alguns segundos.');
    const k = await this.db.query('SELECT width, height FROM kingdoms WHERE id = $1', [gov.kingdomId]);
    const attachments = extractCoordinates(body, k.rows[0].width, k.rows[0].height).map((c) => ({
      kind: 'coords' as const,
      kingdomId: gov.kingdomId,
      ...c,
    }));
    const ins = await this.db.query(
      'INSERT INTO chat_messages (channel_id, governor_id, body, attachments) VALUES ($1, $2, $3, $4) RETURNING id',
      [channelId, gov.id, body, JSON.stringify(attachments)],
    );
    const { rows } = await this.db.query(`${MESSAGE_SQL} WHERE msg.id = $1`, [ins.rows[0].id]);
    const message = toMessage(rows[0]);
    const event = { type: 'chat.message', message };
    if (ch.type === 'global') this.hub.toAllGovernors(event);
    else if (ch.type === 'kingdom') this.hub.toKingdom(ch.kingdom_id!, event);
    else this.hub.toAlliance(ch.alliance_id!, event);
    return { message };
  }

  async markRead(gov: GovernorCtx, channelId: number, messageId: number) {
    await this.authorize(gov, channelId, false);
    await this.db.query(
      `INSERT INTO channel_reads (governor_id, channel_id, last_read_message_id) VALUES ($1, $2, $3)
       ON CONFLICT (governor_id, channel_id) DO UPDATE
         SET last_read_message_id = GREATEST(channel_reads.last_read_message_id, EXCLUDED.last_read_message_id)`,
      [gov.id, channelId, messageId],
    );
    return { ok: true };
  }
}
