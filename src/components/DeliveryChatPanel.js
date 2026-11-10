import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './DeliveryChatPanel.css';

/**
 * Compact customer ↔ rider chat for a single order.
 * role: 'customer' | 'rider'
 */
const DeliveryChatPanel = ({
  orderId,
  role,
  userName,
  userEmail,
  peerName,
  riderEmail,
  riderName,
  customerName,
  customerEmail,
}) => {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const thread = useQuery(api.deliveryChat.getThreadByOrder, orderId ? { orderId } : 'skip');
  const messages = useQuery(
    api.deliveryChat.listMessages,
    thread?._id ? { threadId: thread._id } : 'skip'
  ) || [];
  const sendMessage = useMutation(api.deliveryChat.sendMessage);
  const markRead = useMutation(api.deliveryChat.markRead);

  useEffect(() => {
    if (!orderId || !role) return;
    markRead({ orderId, readerRole: role }).catch(() => {});
  }, [orderId, role, messages.length, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const unread =
    role === 'customer' ? (thread?.unreadByCustomer || 0) : (thread?.unreadByRider || 0);

  const handleSend = async (e) => {
    e?.preventDefault?.();
    const body = draft.trim();
    if (!body || !orderId || sending) return;
    setSending(true);
    try {
      await sendMessage({
        orderId,
        senderRole: role,
        senderName: userName || (role === 'rider' ? 'Rider' : 'Customer'),
        senderEmail: userEmail || '',
        body,
        customerName: customerName || (role === 'customer' ? userName : peerName),
        customerEmail: customerEmail || (role === 'customer' ? userEmail : undefined),
        riderName: riderName || (role === 'rider' ? userName : peerName),
        riderEmail: riderEmail || (role === 'rider' ? userEmail : undefined),
      });
      setDraft('');
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const onDraftChange = (e) => {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className="dcp-panel">
      <div className="dcp-header">
        <div className="dcp-header-title">
          <i className="fas fa-comments"></i>
          <span>
            {role === 'customer'
              ? `Chat with Rider${peerName ? `: ${peerName}` : ''}`
              : `Chat with Customer${peerName ? `: ${peerName}` : ''}`}
          </span>
        </div>
        {unread > 0 && <span className="dcp-unread">{unread}</span>}
      </div>

      <div className="dcp-messages">
        {messages.length === 0 && (
          <div className="dcp-empty">
            No messages yet. Say hi — you can chat even before the other person replies.
          </div>
        )}
        {messages.map((m) => {
          const mine = m.senderRole === role;
          return (
            <div key={m._id} className={`dcp-bubble ${mine ? 'mine' : 'theirs'}`}>
              <div className="dcp-bubble-meta">
                {mine ? 'You' : (m.senderName || m.senderRole)}
                <span>{new Date(m.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>
              </div>
              <div className="dcp-bubble-body">{m.body}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form className="dcp-composer" onSubmit={handleSend}>
        <textarea
          className="dcp-input"
          rows={1}
          value={draft}
          onChange={onDraftChange}
          placeholder="Type a message…"
          maxLength={800}
        />
        <button type="submit" disabled={sending || !draft.trim()} aria-label="Send">
          <i className="fas fa-paper-plane"></i>
        </button>
      </form>
    </div>
  );
};

export default DeliveryChatPanel;
