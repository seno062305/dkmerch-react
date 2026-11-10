import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import './AdminChat.css';

const AdminChat = () => {
  const { user } = useAuth();
  const threads = useQuery(api.supportChat.listThreadsForAdmin) || [];
  const [activeId, setActiveId] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const bottomRef = useRef(null);

  const activeThread = useMemo(
    () => threads.find((t) => t._id === activeId) || null,
    [threads, activeId]
  );

  const messages = useQuery(
    api.supportChat.listMessages,
    activeId ? { threadId: activeId } : 'skip'
  ) || [];

  const sendAdminMessage = useMutation(api.supportChat.sendAdminMessage);
  const generateUploadUrl = useMutation(api.supportChat.generateChatUploadUrl);
  const markRead = useMutation(api.supportChat.markThreadReadByAdmin);

  useEffect(() => {
    if (!activeId && threads.length) setActiveId(threads[0]._id);
  }, [threads, activeId]);

  useEffect(() => {
    if (!activeId) return;
    markRead({ threadId: activeId }).catch(() => {});
  }, [activeId, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeId]);

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
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
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

  return (
    <div className="admin-chat-page">
      <div className="admin-chat-header">
        <div className="admin-chat-title">
          <img src="/images/dkmerch-logo-clear.jpg" alt="DKMerch" className="admin-chat-logo" />
          <div>
            <h1>Customer Chat</h1>
            <p>Reply to customers about orders and support</p>
          </div>
        </div>
      </div>

      <div className="admin-chat-layout">
        <aside className="admin-chat-list">
          <div className="admin-chat-list-head">Conversations</div>
          {threads.length === 0 ? (
            <div className="admin-chat-list-empty">No customer chats yet.</div>
          ) : (
            threads.map((t) => (
              <button
                key={t._id}
                type="button"
                className={`admin-chat-thread ${activeId === t._id ? 'active' : ''}`}
                onClick={() => setActiveId(t._id)}
              >
                <div className="admin-chat-avatar">{(t.customerName || 'C').charAt(0).toUpperCase()}</div>
                <div className="admin-chat-thread-main">
                  <div className="admin-chat-thread-top">
                    <strong>{t.customerName || 'Customer'}</strong>
                    {(t.unreadByAdmin || 0) > 0 && (
                      <span className="admin-chat-unread">{t.unreadByAdmin}</span>
                    )}
                  </div>
                  <div className="admin-chat-thread-email">{t.customerEmail}</div>
                  <div className="admin-chat-thread-preview">
                    {t.lastMessagePreview || 'No messages yet'}
                  </div>
                </div>
              </button>
            ))
          )}
        </aside>

        <section className="admin-chat-convo">
          {!activeThread ? (
            <div className="admin-chat-convo-empty">
              <i className="fas fa-comments"></i>
              <p>Select a customer conversation</p>
            </div>
          ) : (
            <>
              <div className="admin-chat-convo-head">
                <div className="admin-chat-avatar large">
                  {(activeThread.customerName || 'C').charAt(0).toUpperCase()}
                </div>
                <div>
                  <strong>{activeThread.customerName || 'Customer'}</strong>
                  <span>{activeThread.customerEmail}</span>
                </div>
              </div>

              <div className="admin-chat-messages">
                {messages.map((msg) => (
                  <div
                    key={msg._id}
                    className={`admin-chat-bubble ${msg.senderRole === 'admin' ? 'mine' : 'customer'}`}
                  >
                    <div className="admin-chat-meta">
                      {msg.senderRole === 'admin' ? 'You' : msg.senderName} ·{' '}
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
                  </div>
                ))}
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
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePickImage} />
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
    </div>
  );
};

export default AdminChat;
