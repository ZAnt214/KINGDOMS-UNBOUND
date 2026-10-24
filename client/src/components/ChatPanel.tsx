import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHAT_MAX_LENGTH, CIVILIZATION_BY_ID } from '../../../shared/rules';
import type { ChatChannel, ChatMessage, Governor } from '../api';
import { fmtTime } from '../format';

interface Props {
  channels: ChatChannel[];
  activeId: number | null;
  onActive: (id: number) => void;
  messages: ChatMessage[];
  hasMore: boolean;
  onLoadOlder: () => Promise<void>;
  onSend: (body: string) => Promise<boolean>;
  governor: Governor;
  onGoTo: (x: number, y: number) => void;
  onClose: () => void;
}

const COORD_RE = /\bX\s*[:=]?\s*\d{1,4}\s*[,;]?\s*Y\s*[:=]?\s*\d{1,4}\b/gi;

function Body({ m, governor, onGoTo }: { m: ChatMessage; governor: Governor; onGoTo: (x: number, y: number) => void }) {
  // Coordenadas vêm como referências estruturadas validadas pelo servidor.
  const parts = m.body.split(COORD_RE);
  const matches = m.body.match(COORD_RE) ?? [];
  return (
    <span className="msg-body">
      {parts.map((p, i) => {
        const nums = matches[i]?.match(/\d+/g)?.map(Number);
        const att = nums && m.attachments.find((a) => a.x === nums[0] && a.y === nums[1]);
        return (
          <Fragment key={i}>
            {p}
            {matches[i] &&
              (att && att.kingdomId === governor.kingdomId ? (
                <button className="coord" onClick={() => onGoTo(att.x, att.y)} data-testid="coord-link">
                  📍{matches[i]}
                </button>
              ) : (
                matches[i]
              ))}
          </Fragment>
        );
      })}
    </span>
  );
}

export function ChatPanel(props: Props) {
  const { channels, activeId, onActive, messages, hasMore, governor } = props;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    stick.current = true;
  }, [activeId]);

  const onScroll = async () => {
    const el = listRef.current!;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (el.scrollTop < 30 && hasMore && prevHeight.current === null) {
      prevHeight.current = el.scrollHeight;
      await props.onLoadOlder();
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    stick.current = true;
    if (await props.onSend(body)) setText('');
    setSending(false);
  };

  const active = channels.find((c) => c.id === activeId);

  return (
    <div className="chat" role="dialog" aria-label="Chat" data-testid="chat-panel">
      <div className="chat-head">
        <div className="tabs" role="tablist">
          {channels.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === activeId}
              className={`tab ${c.id === activeId ? 'on' : ''}`}
              onClick={() => onActive(c.id)}
              data-testid={`chan-${c.type}`}
            >
              {c.type === 'alliance' ? 'Aliança' : c.type === 'kingdom' ? 'Reino' : 'Global'}
              {c.unread > 0 && c.id !== activeId && <span className="badge">{c.unread > 99 ? '99+' : c.unread}</span>}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={props.onClose} aria-label="Fechar chat">
          ✕
        </button>
      </div>
      <div className="chat-sub muted small">{active?.name}</div>
      <div className="chat-list" ref={listRef} onScroll={onScroll} data-testid="chat-list">
        {hasMore && <div className="muted small center">↑ role para carregar mais</div>}
        {!hasMore && messages.length === 0 && <div className="muted small center">Nenhuma mensagem ainda. Diga olá!</div>}
        {messages.map((m) => {
          const mine = m.author.governorId === governor.id;
          const civ = CIVILIZATION_BY_ID[m.author.civilization];
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''}`} data-testid="chat-msg">
              <div className="msg-meta">
                <span className="avatar" style={{ background: civ?.color }} aria-hidden>
                  {m.author.name.slice(0, 1).toUpperCase()}
                </span>
                {m.author.allianceTag && <span className="tag">[{m.author.allianceTag}]</span>}
                <b>{m.author.name}</b>
                {active?.type === 'global' && <span className="muted small">R{m.author.kingdomId}</span>}
                <span className="muted small">{fmtTime(m.createdAt)}</span>
              </div>
              <Body m={m} governor={governor} onGoTo={props.onGoTo} />
            </div>
          );
        })}
      </div>
      <form className="chat-input" onSubmit={send}>
        <input
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mensagem (use X:10 Y:20 para coordenadas)"
          enterKeyHint="send"
          autoComplete="off"
          data-testid="chat-input"
        />
        <button className="btn primary" disabled={sending || !text.trim()} data-testid="chat-send">
          Enviar
        </button>
      </form>
    </div>
  );
}
