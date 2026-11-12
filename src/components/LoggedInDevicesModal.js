import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useCloseOnHistoryBack } from '../hooks/useCloseOnHistoryBack';
import { useConfirm } from '../context/ConfirmContext';
import './LoggedInDevicesModal.css';

function timeAgo(ts) {
  const t = Number(ts) || 0;
  if (!t) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'Active now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function deviceIcon(platform, deviceName) {
  const p = `${platform || ''} ${deviceName || ''}`.toLowerCase();
  if (/iphone|android|mobile|phone|ipad|tablet/.test(p)) return 'fa-mobile-alt';
  if (/mac|windows|linux|desktop|chrome|safari|firefox|edge/.test(p)) return 'fa-desktop';
  return 'fa-laptop';
}

/**
 * Facebook-style "Where you're logged in" modal.
 */
const LoggedInDevicesModal = ({ userId, currentSessionId, onClose, onLogoutCurrent }) => {
  useCloseOnHistoryBack(true, onClose, 'loggedInDevices');
  const { confirm } = useConfirm();
  const [menuFor, setMenuFor] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const menuRef = useRef(null);

  const sessions = useQuery(
    api.users.listUserSessions,
    userId ? { userId: String(userId), currentSessionId: currentSessionId || undefined } : 'skip'
  ) ?? [];

  const logoutSession = useMutation(api.users.logoutSession);
  const logoutAllSessions = useMutation(api.users.logoutAllSessions);

  useEffect(() => {
    const onDoc = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuFor(null);
    };
    if (menuFor) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuFor]);

  const handleLogoutOne = async (session) => {
    if (!userId || !session?.sessionId || busy) return;
    const ok = await confirm({
      title: session.isCurrent ? 'Log out this device?' : 'Log out this device?',
      message: session.isCurrent
        ? 'You will be signed out here right away.'
        : `${session.deviceName || 'That device'} will be signed out immediately with no login notice.`,
      confirmLabel: 'Log out',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(session.sessionId);
    setError('');
    setMenuFor(null);
    try {
      const res = await logoutSession({
        userId: String(userId),
        sessionId: String(session.sessionId),
      });
      if (!res?.success) {
        setError(res?.message || 'Failed to log out device.');
        return;
      }
      if (session.isCurrent) {
        onLogoutCurrent?.();
        onClose?.();
      }
    } catch (err) {
      setError(String(err?.message || err || 'Failed to log out device.'));
    } finally {
      setBusy('');
    }
  };

  const handleLogoutAll = async () => {
    if (!userId || busy) return;
    const ok = await confirm({
      title: 'Log out all devices?',
      message: 'Every device signed in to this account will be logged out immediately — including this one. Other devices won’t get a login notice; they’ll just be signed out.',
      confirmLabel: 'Log out all',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy('all');
    setError('');
    setMenuFor(null);
    try {
      // Clears all sessions silently — other devices are kicked with no push/email notice
      const res = await logoutAllSessions({ userId: String(userId) });
      if (!res?.success) {
        setError(res?.message || 'Failed to log out all devices.');
        return;
      }
      onLogoutCurrent?.();
      onClose?.();
    } catch (err) {
      setError(String(err?.message || err || 'Failed to log out all devices.'));
    } finally {
      setBusy('');
    }
  };

  const handleLogoutOthers = async () => {
    if (!userId || !currentSessionId || busy) return;
    const ok = await confirm({
      title: 'Log out other devices?',
      message: 'All other devices will be signed out right away. You’ll stay logged in here. No login notice is sent to those devices.',
      confirmLabel: 'Log out others',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy('others');
    setError('');
    setMenuFor(null);
    try {
      const res = await logoutAllSessions({
        userId: String(userId),
        keepSessionId: String(currentSessionId),
      });
      if (!res?.success) {
        setError(res?.message || 'Failed to log out other devices.');
      }
    } catch (err) {
      setError(String(err?.message || err || 'Failed to log out other devices.'));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="lid-overlay" onClick={onClose}>
      <div className="lid-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="lid-header">
          <button type="button" className="lid-back" onClick={onClose} aria-label="Back">
            <i className="fas fa-arrow-left" />
          </button>
          <h3>Where you’re logged in</h3>
          <button type="button" className="lid-close" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="lid-body">
          <p className="lid-hint">
            These are devices currently signed in to your DKMerch account. You can log out any device you don’t recognize.
          </p>

          {error && <div className="lid-error"><i className="fas fa-exclamation-circle" /> {error}</div>}

          {sessions === undefined ? (
            <div className="lid-empty">Loading devices…</div>
          ) : sessions.length === 0 ? (
            <div className="lid-empty">
              <i className="fas fa-laptop" />
              <span>No active sessions found.</span>
            </div>
          ) : (
            <ul className="lid-list">
              {sessions.map((s) => (
                <li key={s.sessionId} className={`lid-item ${s.isCurrent ? 'is-current' : ''}`}>
                  <div className="lid-item-icon">
                    <i className={`fas ${deviceIcon(s.platform, s.deviceName)}`} />
                  </div>
                  <div className="lid-item-body">
                    <div className="lid-item-title">
                      {s.deviceName}
                      {s.location ? ` · ${s.location}` : ''}
                    </div>
                    <div className="lid-item-meta">
                      {s.platform ? `${s.platform} · ` : ''}
                      {s.isCurrent ? (
                        <span className="lid-active-now">Active now</span>
                      ) : (
                        timeAgo(s.lastActiveAt)
                      )}
                    </div>
                  </div>
                  <div className="lid-item-menu-wrap" ref={menuFor === s.sessionId ? menuRef : null}>
                    <button
                      type="button"
                      className="lid-dots"
                      aria-label="Device options"
                      disabled={!!busy}
                      onClick={() => setMenuFor((cur) => (cur === s.sessionId ? null : s.sessionId))}
                    >
                      <i className="fas fa-ellipsis-v" />
                    </button>
                    {menuFor === s.sessionId && (
                      <div className="lid-menu">
                        <button
                          type="button"
                          className="lid-menu-btn danger"
                          disabled={busy === s.sessionId}
                          onClick={() => handleLogoutOne(s)}
                        >
                          {busy === s.sessionId ? 'Logging out…' : 'Log out'}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lid-footer">
          {sessions.length > 1 && currentSessionId && (
            <button
              type="button"
              className="lid-footer-btn"
              disabled={!!busy}
              onClick={handleLogoutOthers}
            >
              {busy === 'others' ? 'Logging out…' : 'Log out other devices'}
            </button>
          )}
          <button
            type="button"
            className="lid-footer-btn danger"
            disabled={!!busy || sessions.length === 0}
            onClick={handleLogoutAll}
          >
            {busy === 'all' ? 'Logging out…' : 'Log out all devices'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoggedInDevicesModal;
