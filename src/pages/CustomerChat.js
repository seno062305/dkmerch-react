import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './CustomerChat.css';

const CustomerChat = () => {
  const { user, isAuthenticated, isReady, role } = useAuth();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [presenceTick, setPresenceTick] = useState(0);
  const fileRef = useRef(null);
  const messagesRef = useRef(null);

  const email = user?.email || '';
  const thread = useQuery(api.supportChat.getMyThread, email ? { customerEmail: email } : 'skip');
  const messages = useQuery(
    api.supportChat.listMessages,
    thread?._id ? { threadId: thread._id } : 'skip'
  ) || [];

  const sendCustomerMessage = useMutation(api.supportChat.sendCustomerMessage);
  const generateUploadUrl = useMutation(api.supportChat.generateChatUploadUrl);
  const markRead = useMutation(api.supportChat.markThreadReadByCustomer);
  const heartbeatPresence = useMutation(api.supportChat.heartbeatPresence);

  const ONLINE_MS = 45000;
  const adminOnline = !!(thread?.adminOnlineAt && Date.now() - thread.adminOnlineAt < ONLINE_MS);
  const adminLastReadAt = thread?.adminLastReadAt || 0;
  void presenceTick;

  useEffect(() => {
    const id = setInterval(() => setPresenceTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    // Staff must not use customer chat — send them to their own panels
    if (isAuthenticated && role === 'admin') {
      navigate('/admin/chat', { replace: true });
      return;
    }
    if (isAuthenticated && role === 'rider') {
      navigate('/rider', { replace: true });
      return;
    }
    if (!isAuthenticated) {
      sessionStorage.setItem('redirectAfterLogin', '/chat');
      sessionStorage.setItem('dk_login_customers_only', '1');
      window.dispatchEvent(new CustomEvent('openLoginModal', { detail: { customersOnly: true } }));
      navigate('/');
    }
  }, [isReady, isAuthenticated, role, navigate]);

  // Keep page pinned to top — don't let chat scroll into the footer
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  // Pin chat flush between header and bottom nav; when keyboard opens, sit on keyboard top (no gap)
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const mobile = window.matchMedia('(max-width: 768px)').matches;
      const headerH = mobile ? 56 : 64;
      const nav = document.querySelector('.customer-bottom-nav');
      const bnavH = mobile && nav ? Math.round(nav.getBoundingClientRect().height) : 0;
      const vv = window.visualViewport;
      const layoutH = window.innerHeight;

      if (vv && mobile) {
        const keyboardOpen = vv.height < layoutH - 140;
        if (keyboardOpen) {
          const top = Math.max(0, Math.round(vv.offsetTop + headerH));
          const bottom = Math.max(0, Math.round(layoutH - (vv.offsetTop + vv.height)));
          root.style.setProperty('--chat-top', `${top}px`);
          root.style.setProperty('--chat-bottom', `${bottom}px`);
          return;
        }
      }
      root.style.setProperty('--chat-top', `${headerH}px`);
      root.style.setProperty('--chat-bottom', mobile ? `${bnavH}px` : '0px');
    };

    sync();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.addEventListener('focusin', sync);
    window.addEventListener('focusout', () => setTimeout(sync, 50));
    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.removeEventListener('focusin', sync);
      window.removeEventListener('focusout', sync);
      root.style.removeProperty('--chat-top');
      root.style.removeProperty('--chat-bottom');
    };
  }, []);

  useEffect(() => {
    if (!email || !thread?._id) return;
    if ((thread.unreadByCustomer || 0) > 0) {
      markRead({ customerEmail: email }).catch(() => {});
    }
  }, [email, thread?._id, thread?.unreadByCustomer, markRead]);

  useEffect(() => {
    if (!email || !isAuthenticated || role === 'admin' || role === 'rider') return undefined;
    const ping = () => {
      heartbeatPresence({ role: 'customer', customerEmail: email }).catch(() => {});
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
  }, [email, isAuthenticated, role, heartbeatPresence]);

  useEffect(() => {
    const box = messagesRef.current;
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }, [messages.length]);

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
    if (!email) return;
    const body = text.trim();
    if (!body && !preview) return;
    setSending(true);
    setError('');
    try {
      let imageStorageId;
      if (preview?.file) imageStorageId = await uploadImage(preview.file);
      await sendCustomerMessage({
        customerEmail: email,
        customerName: user?.name || 'Customer',
        customerUserId: user?._id || user?.id,
        body: body || undefined,
        imageStorageId,
      });
      setText('');
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview(null);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  if (!isReady || !isAuthenticated || role === 'admin' || role === 'rider') {
    return (
      <div className="customer-chat-page">
        <div className="customer-chat-gate">
          {!isAuthenticated
            ? 'Please login with a customer account to chat with admin.'
            : 'Redirecting…'}
        </div>
      </div>
    );
  }

  return (
    <div className="customer-chat-page">
      <div className="customer-chat-shell">
        <header className="customer-chat-header">
          <div className="customer-chat-brand">
            <img src="/images/dklogo.jpg" alt="DKMerch" />
            <div>
              <strong>Chat with Admin</strong>
              <span className={`customer-chat-presence ${adminOnline ? 'is-online' : 'is-offline'}`}>
                <i className="fas fa-circle"></i>
                {adminOnline ? 'Admin online' : 'Admin offline'}
              </span>
            </div>
          </div>
        </header>

        <div className="customer-chat-messages" ref={messagesRef}>
          {messages.length === 0 && (
            <div className="customer-chat-empty">
              <i className="fas fa-comments"></i>
              <p>No messages yet. Say hi to DKMerch admin.</p>
            </div>
          )}
          {messages.map((msg) => {
            const isMine = msg.senderRole === 'customer';
            const seen = isMine && adminLastReadAt >= msg.createdAt;
            return (
              <div
                key={msg._id}
                className={`customer-chat-bubble ${isMine ? 'mine' : 'admin'}`}
              >
                <div className="customer-chat-meta">
                  {isMine ? 'You' : 'Admin'} ·{' '}
                  {new Date(msg.createdAt).toLocaleString('en-PH', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </div>
                {msg.body && <div className="customer-chat-text">{msg.body}</div>}
                {msg.imageUrl && (
                  <a href={msg.imageUrl} target="_blank" rel="noreferrer" className="customer-chat-image-wrap">
                    <img src={msg.imageUrl} alt="Attachment" />
                  </a>
                )}
                {isMine && (
                  <div className={`customer-chat-seen ${seen ? 'is-seen' : ''}`}>
                    {seen ? <><i className="fas fa-check-double"></i> Seen</> : <><i className="fas fa-check"></i> Sent</>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {preview && (
          <div className="customer-chat-preview">
            <img src={preview.url} alt="Preview" />
            <button type="button" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>
              Remove
            </button>
          </div>
        )}

        {error && <div className="customer-chat-error">{error}</div>}

        <form className="customer-chat-composer" onSubmit={handleSend}>
          <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" hidden onChange={handlePickImage} />
          <button type="button" className="customer-chat-attach" onClick={() => fileRef.current?.click()} title="Upload image">
            <i className="fas fa-image"></i>
          </button>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your message…"
            maxLength={2000}
          />
          <button type="submit" disabled={sending || (!text.trim() && !preview)}>
            {sending ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CustomerChat;
