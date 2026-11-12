import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import './AdminChat.css';

const LONG_PRESS_MS = 520;
const MOBILE_CHAT_MQ = '(max-width: 900px)';

const formatThreadTime = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const weekAgo = now.getTime() - 6 * 24 * 60 * 60 * 1000;
  if (ms >= weekAgo) return d.toLocaleDateString('en-PH', { weekday: 'short' });
  return d.toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit' });
};

const AdminChat = () => {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const threads = useQuery(api.supportChat.listThreadsForAdmin) || [];
  const archivedThreads = useQuery(api.supportChat.listArchivedThreadsForAdmin) || [];
  const [activeId, setActiveId] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [holdMenu, setHoldMenu] = useState(null); // { thread, x, y }
  const [presenceTick, setPresenceTick] = useState(0);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(MOBILE_CHAT_MQ).matches;
  });
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const holdTimerRef = useRef(null);
  const holdMovedRef = useRef(false);
  const didLongPressRef = useRef(false);

  const activeThread = useMemo(
    () => threads.find((t) => t._id === activeId) || null,
    [threads, activeId]
  );

  const unreadTotal = useMemo(
    () => threads.reduce((sum, t) => sum + (t.unreadByAdmin || 0), 0),
    [threads]
  );

  const showMobileList = isMobile && !activeId;
  const showMobileChat = isMobile && !!activeId;

  const messages = useQuery(
    api.supportChat.listMessages,
    activeId ? { threadId: activeId } : 'skip'
  ) || [];

  const sendAdminMessage = useMutation(api.supportChat.sendAdminMessage);
  const generateUploadUrl = useMutation(api.supportChat.generateChatUploadUrl);
  const markRead = useMutation(api.supportChat.markThreadReadByAdmin);
  const heartbeatPresence = useMutation(api.supportChat.heartbeatPresence);
  const archiveThread = useMutation(api.supportChat.archiveThread);
  const unarchiveThread = useMutation(api.supportChat.unarchiveThread);

  const ONLINE_MS = 45000;
  const customerOnline = !!(activeThread?.customerOnlineAt && Date.now() - activeThread.customerOnlineAt < ONLINE_MS);
  const customerLastReadAt = activeThread?.customerLastReadAt || 0;
  void presenceTick;

  useEffect(() => {
    const id = setInterval(() => setPresenceTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(MOBILE_CHAT_MQ);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    // Desktop: keep a conversation selected. Mobile: list-first (no auto-open).
    if (!isMobile) {
      if (!activeId && threads.length) setActiveId(threads[0]._id);
      if (activeId && threads.length && !threads.some((t) => t._id === activeId)) {
        setActiveId(threads[0]?._id || null);
      }
      return;
    }
    if (activeId && threads.length && !threads.some((t) => t._id === activeId)) {
      setActiveId(null);
    }
  }, [threads, activeId, isMobile]);

  useEffect(() => {
    if (!activeId) return;
    markRead({ threadId: activeId }).catch(() => {});
  }, [activeId, markRead, messages.length]);

  useEffect(() => {
    if (!activeId) return undefined;
    const ping = () => {
      heartbeatPresence({ role: 'admin', threadId: activeId }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, 20000);
    const onVis = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [activeId, heartbeatPresence]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeId]);

  useEffect(() => {
    const close = () => setHoldMenu(null);
    if (holdMenu) {
      window.addEventListener('scroll', close, true);
      window.addEventListener('resize', close);
      return () => {
        window.removeEventListener('scroll', close, true);
        window.removeEventListener('resize', close);
      };
    }
  }, [holdMenu]);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const openHoldMenu = (thread, clientX, clientY) => {
    const pad = 12;
    const menuW = 200;
    const menuH = 56;
    const x = Math.min(Math.max(pad, clientX - menuW / 2), window.innerWidth - menuW - pad);
    const y = Math.min(Math.max(pad, clientY - 8), window.innerHeight - menuH - pad);
    didLongPressRef.current = true;
    setHoldMenu({ thread, x, y });
    if (navigator.vibrate) navigator.vibrate(18);
  };

  const onThreadPointerDown = (thread, e) => {
    holdMovedRef.current = false;
    didLongPressRef.current = false;
    const point = e.touches?.[0] || e;
    const startX = point.clientX;
    const startY = point.clientY;
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      if (!holdMovedRef.current) openHoldMenu(thread, startX, startY);
    }, LONG_PRESS_MS);
  };

  const onThreadPointerMove = (e) => {
    const point = e.touches?.[0] || e;
    if (!point || !holdTimerRef.current) return;
    // cancel if finger drifts
  };

  const onThreadPointerUp = () => clearHoldTimer();

  const selectThread = (id) => {
    setActiveId(id);
    setArchiveOpen(false);
    setHoldMenu(null);
  };

  const backToMobileList = () => {
    setActiveId(null);
    setHoldMenu(null);
    setText('');
    setError('');
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const handleArchive = async (thread) => {
    if (!thread?._id) return;
    setHoldMenu(null);
    const name = thread.customerName || 'this customer';
    const ok = await confirm({
      title: 'Archive this chat?',
      message: `Move the conversation with ${name} to Archived?\n\nYou can restore it later from the Archive list.`,
      confirmLabel: 'Archive',
      cancelLabel: 'Cancel',
      variant: 'warning',
      icon: 'fa-archive',
    });
    if (!ok) return;
    try {
      await archiveThread({ threadId: thread._id });
      if (activeId === thread._id) setActiveId(null);
    } catch (err) {
      setError(err?.message || 'Failed to archive.');
    }
  };

  const handleRestore = async (thread) => {
    if (!thread?._id) return;
    const name = thread.customerName || 'this customer';
    const ok = await confirm({
      title: 'Restore this chat?',
      message: `Bring back the conversation with ${name} to your active chat list?`,
      confirmLabel: 'Restore',
      cancelLabel: 'Cancel',
      variant: 'primary',
      icon: 'fa-undo',
    });
    if (!ok) return;
    try {
      await unarchiveThread({ threadId: thread._id });
      setActiveId(thread._id);
      setArchiveOpen(false);
    } catch (err) {
      setError(err?.message || 'Failed to restore.');
    }
  };

  const uploadImage = async (file) => {
    const uploadUrl = await generateUploadUrl({});
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    const json = await res.json();
    if (!json?.storageId) throw new Error('Upload failed');
    return json.storageId;
  };

  const handlePickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.type === 'image/gif' || /\.gif$/i.test(file.name || '')) {
      setError(file.type === 'image/gif' || /\.gif$/i.test(file.name || '')
        ? 'GIF images are not allowed. Please upload JPG or PNG.'
        : 'Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.');
      return;
    }
    setError('');
    setPreview({ file, url: URL.createObjectURL(file) });
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!activeId) return;
    const body = text.trim();
    if (!body && !preview) return;
    setSending(true);
    setError('');
    try {
      let imageStorageId;
      if (preview?.file) imageStorageId = await uploadImage(preview.file);
      await sendAdminMessage({
        threadId: activeId,
        adminName: user?.name || 'Admin',
        adminEmail: user?.email,
        body: body || undefined,
        imageStorageId,
      });
      setText('');
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview(null);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  const renderThreadButton = (t, { compact } = {}) => {
    const unread = t.unreadByAdmin || 0;
    return (
      <button
        key={t._id}
        type="button"
        className={`admin-chat-thread ${activeId === t._id ? 'active' : ''} ${compact ? 'compact' : ''} ${unread > 0 ? 'has-unread' : ''}`}
        onClick={() => {
          if (holdMenu || didLongPressRef.current) {
            didLongPressRef.current = false;
            return;
          }
          selectThread(t._id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openHoldMenu(t, e.clientX, e.clientY);
        }}
        onTouchStart={(e) => onThreadPointerDown(t, e)}
        onTouchMove={() => { holdMovedRef.current = true; clearHoldTimer(); }}
        onTouchEnd={onThreadPointerUp}
        onTouchCancel={onThreadPointerUp}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          onThreadPointerDown(t, e);
        }}
        onMouseUp={onThreadPointerUp}
        onMouseLeave={onThreadPointerUp}
        onMouseMove={onThreadPointerMove}
      >
        <div className="admin-chat-avatar-wrap">
          <div className="admin-chat-avatar">{(t.customerName || 'C').charAt(0).toUpperCase()}</div>
          {t.customerOnlineAt && Date.now() - t.customerOnlineAt < ONLINE_MS && (
            <span className="admin-chat-online-dot" title="Online" />
          )}
        </div>
        <div className="admin-chat-thread-main">
          <div className="admin-chat-thread-top">
            <strong>{t.customerName || 'Customer'}</strong>
            {!compact ? (
              <span className="admin-chat-thread-time">{formatThreadTime(t.lastMessageAt)}</span>
            ) : (
              unread > 0 && <span className="admin-chat-unread">{unread > 9 ? '9+' : unread}</span>
            )}
          </div>
          {!compact ? (
            <div className="admin-chat-thread-bottom">
              <div className="admin-chat-thread-preview">
                {t.lastMessagePreview || t.customerEmail || 'No messages yet'}
              </div>
              {unread > 0 && (
                <span className="admin-chat-unread">{unread > 9 ? '9+' : unread}</span>
              )}
            </div>
          ) : (
            <div className="admin-chat-thread-email">{t.customerEmail}</div>
          )}
          {!compact && (
            <div className="admin-chat-thread-email desktop-email">{t.customerEmail}</div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="admin-chat-page">
      <div className="admin-chat-header">
        <div className="admin-chat-title">
          <img src="/images/dklogo.jpg" alt="DKMerch" className="admin-chat-logo" />
          <div>
            <h1>Customer Chat</h1>
          </div>
        </div>

        <div className="admin-chat-header-actions">
          {/* Conversations icon only when already inside a mobile chat */}
          {showMobileChat && (
            <button
              type="button"
              className={`admin-chat-icon-btn ${unreadTotal > 0 ? 'has-new' : ''}`}
              onClick={backToMobileList}
              aria-label="Back to conversations"
              title="Conversations"
            >
              <i className="fas fa-comments"></i>
              {unreadTotal > 0 && <em className="admin-chat-icon-badge">{unreadTotal > 9 ? '9+' : unreadTotal}</em>}
            </button>
          )}
          <button
            type="button"
            className={`admin-chat-icon-btn ${archiveOpen ? 'active' : ''}`}
            onClick={() => { setArchiveOpen((v) => !v); setHoldMenu(null); }}
            aria-label="Archived chats"
            title="Archived chats"
          >
            <i className="fas fa-archive"></i>
            {archivedThreads.length > 0 && (
              <em className="admin-chat-icon-badge muted">{archivedThreads.length}</em>
            )}
          </button>
        </div>
      </div>

      {archiveOpen && (
        <button
          type="button"
          className="admin-chat-dropdown-backdrop"
          aria-label="Close"
          onClick={() => setArchiveOpen(false)}
        />
      )}

      {archiveOpen && (
        <div className="admin-chat-dropdown archive" role="dialog" aria-label="Archived chats">
          <div className="admin-chat-dropdown-head">
            <strong>Archived</strong>
            <span>{archivedThreads.length}</span>
          </div>
          <div className="admin-chat-dropdown-hint">Restore to bring a chat back</div>
          <div className="admin-chat-dropdown-list">
            {archivedThreads.length === 0 ? (
              <div className="admin-chat-list-empty">No archived chats.</div>
            ) : (
              archivedThreads.map((t) => (
                <div key={t._id} className="admin-chat-archived-row">
                  <div className="admin-chat-avatar">{(t.customerName || 'C').charAt(0).toUpperCase()}</div>
                  <div className="admin-chat-thread-main">
                    <strong>{t.customerName || 'Customer'}</strong>
                    <div className="admin-chat-thread-email">{t.customerEmail}</div>
                  </div>
                  <button type="button" className="admin-chat-restore-btn" onClick={() => handleRestore(t)}>
                    <i className="fas fa-undo"></i> Restore
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div
        className={`admin-chat-layout ${showMobileList ? 'is-mobile-list' : ''} ${showMobileChat ? 'is-mobile-chat' : ''}`}
      >
        <aside className={`admin-chat-list ${isMobile ? 'mobile-pane' : 'desktop-only'} ${showMobileList || !isMobile ? 'is-visible' : ''}`}>
          <div className="admin-chat-list-head">
            <span>Chats{unreadTotal > 0 ? ` · ${unreadTotal} new` : ''}</span>
            <button
              type="button"
              className="admin-chat-list-archive-link"
              onClick={() => setArchiveOpen(true)}
            >
              <i className="fas fa-archive"></i> Archive
            </button>
          </div>
          {threads.length === 0 ? (
            <div className="admin-chat-list-empty">No customer chats yet.</div>
          ) : (
            threads.map((t) => renderThreadButton(t))
          )}
        </aside>

        <section className={`admin-chat-convo ${showMobileList ? 'is-hidden-mobile' : ''}`}>
          {!activeThread ? (
            <div className="admin-chat-convo-empty">
              <i className="fas fa-comments"></i>
              <p>Select a customer conversation</p>
            </div>
          ) : (
            <>
              <div className="admin-chat-convo-head">
                <button
                  type="button"
                  className="admin-chat-mobile-back"
                  onClick={backToMobileList}
                  aria-label="Back to chats"
                >
                  <i className="fas fa-chevron-left"></i>
                </button>
                <div className="admin-chat-avatar-wrap">
                  <div className="admin-chat-avatar large">
                    {(activeThread.customerName || 'C').charAt(0).toUpperCase()}
                  </div>
                  {customerOnline && <span className="admin-chat-online-dot" title="Online" />}
                </div>
                <div className="admin-chat-convo-head-text">
                  <strong>{activeThread.customerName || 'Customer'}</strong>
                  <span className={`admin-chat-presence ${customerOnline ? 'is-online' : 'is-offline'}`}>
                    <i className="fas fa-circle"></i>
                    {customerOnline ? 'Online' : 'Offline'} · {activeThread.customerEmail}
                  </span>
                </div>
                <button
                  type="button"
                  className="admin-chat-archive-head-btn"
                  title="Archive chat"
                  onClick={() => handleArchive(activeThread)}
                >
                  <i className="fas fa-archive"></i>
                </button>
              </div>

              <div className="admin-chat-messages">
                {messages.map((msg) => {
                  const isMine = msg.senderRole === 'admin';
                  const seen = isMine && customerLastReadAt >= msg.createdAt;
                  return (
                    <div
                      key={msg._id}
                      className={`admin-chat-bubble ${isMine ? 'mine' : 'customer'}`}
                    >
                      <div className="admin-chat-meta">
                        {isMine ? 'You' : msg.senderName} ·{' '}
                        {new Date(msg.createdAt).toLocaleString('en-PH', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                      {msg.body && <div className="admin-chat-text">{msg.body}</div>}
                      {msg.imageUrl && (
                        <a href={msg.imageUrl} target="_blank" rel="noreferrer">
                          <img src={msg.imageUrl} alt="Attachment" />
                        </a>
                      )}
                      {isMine && (
                        <div className={`admin-chat-seen ${seen ? 'is-seen' : ''}`}>
                          {seen ? <><i className="fas fa-check-double"></i> Seen</> : <><i className="fas fa-check"></i> Sent</>}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {preview && (
                <div className="admin-chat-preview">
                  <img src={preview.url} alt="Preview" />
                  <button type="button" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>
                    Remove
                  </button>
                </div>
              )}
              {error && <div className="admin-chat-error">{error}</div>}

              <form className="admin-chat-composer" onSubmit={handleSend}>
                <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" hidden onChange={handlePickImage} />
                <button type="button" className="admin-chat-attach" onClick={() => fileRef.current?.click()}>
                  <i className="fas fa-image"></i>
                </button>
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`Reply to ${activeThread.customerName || 'customer'}…`}
                  maxLength={2000}
                />
                <button type="submit" disabled={sending || (!text.trim() && !preview)}>
                  {sending ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {holdMenu && (
        <>
          <button type="button" className="admin-chat-hold-backdrop" aria-label="Close" onClick={() => setHoldMenu(null)} />
          <div
            className="admin-chat-hold-menu"
            style={{ left: holdMenu.x, top: holdMenu.y }}
            role="menu"
          >
            <button type="button" role="menuitem" onClick={() => handleArchive(holdMenu.thread)}>
              <i className="fas fa-archive"></i>
              Archive {holdMenu.thread.customerName || 'chat'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminChat;
