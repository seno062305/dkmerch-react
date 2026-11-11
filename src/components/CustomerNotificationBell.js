import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useCloseOnHistoryBack } from '../hooks/useCloseOnHistoryBack';
import './CustomerNotificationBell.css';

function timeAgo(ts) {
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (!t) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function typeIcon(type) {
  switch (String(type || '')) {
    case 'promo': return '🔥';
    case 'order_confirmed': return '✅';
    case 'out_for_delivery': return '🛵';
    case 'rider_assigned': return '🏍️';
    case 'order_deleted': return '🗑️';
    case 'order_cancelled':
    case 'cancel_approved': return '❌';
    case 'cancel_rejected': return '⚠️';
    default: return '🔔';
  }
}

/**
 * Customer notification center — bell beside profile (mobile + desktop).
 * Supports select all, mark read / unread on selected items.
 */
const CustomerNotificationBell = ({ email }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const wrapRef = useRef(null);

  const notifications = useQuery(
    api.customerNotifications.getRecentForEmail,
    email ? { email, limit: 40 } : 'skip'
  ) ?? [];
  const unreadCount = useQuery(
    api.customerNotifications.getUnreadCountForEmail,
    email ? { email } : 'skip'
  ) ?? 0;

  const markMany = useMutation(api.customerNotifications.markMany);
  const markAllRead = useMutation(api.customerNotifications.markAllRead);
  const clearAll = useMutation(api.customerNotifications.clearAll);

  const { release } = useCloseOnHistoryBack(open, () => setOpen(false), 'customerNotifs');

  useEffect(() => {
    if (!open) setSelected(new Set());
  }, [open]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!email) return null;

  const allIds = notifications.map((n) => n._id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const selectedIds = [...selected];

  const toggleOpen = () => {
    setOpen((o) => !o);
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };

  const applyMark = async (read) => {
    const ids = selectedIds.length > 0 ? selectedIds : allIds.filter((id) => {
      const row = notifications.find((n) => n._id === id);
      return read ? row && !row.read : row && row.read;
    });
    if (!ids.length) return;
    await markMany({ email, ids, read }).catch(() => {});
    setSelected(new Set());
  };

  const openItem = async (n) => {
    if (!n.read) {
      await markMany({ email, ids: [n._id], read: true }).catch(() => {});
    }
    release();
    setOpen(false);
    if (n.url) navigate(n.url);
  };

  return (
    <div className="cust-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="header-action-item cust-bell-btn"
        onClick={toggleOpen}
        aria-label="Notifications"
        title="Notifications"
      >
        <span className="icon-wrapper">
          <i className="fas fa-bell" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="notif-count">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </span>
        <span>Alerts</span>
      </button>

      {open && (
        <div className="cust-bell-dropdown" role="dialog" aria-label="Notifications">
          <div className="cust-bell-header">
            <div className="cust-bell-title-row">
              <span className="cust-bell-title">Notifications</span>
              {unreadCount > 0 && <span className="cust-bell-unread-pill">{unreadCount} new</span>}
            </div>
            <button
              type="button"
              className="cust-bell-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <i className="fas fa-times" />
            </button>
          </div>

          {notifications.length > 0 && (
            <div className="cust-bell-toolbar">
              <label className="cust-bell-select-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
                <span>Select all</span>
              </label>
              <div className="cust-bell-toolbar-actions">
                <button type="button" onClick={() => applyMark(true)} disabled={!selectedIds.length && unreadCount === 0}>
                  Mark read
                </button>
                <button type="button" onClick={() => applyMark(false)} disabled={!selectedIds.length}>
                  Mark unread
                </button>
                <button
                  type="button"
                  className="cust-bell-mark-all"
                  onClick={() => markAllRead({ email }).catch(() => {})}
                  disabled={unreadCount === 0}
                >
                  All read
                </button>
              </div>
            </div>
          )}

          <div className="cust-bell-list">
            {notifications.length === 0 ? (
              <div className="cust-bell-empty">
                <span>🔕</span>
                <span>No notifications yet</span>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n._id}
                  className={`cust-bell-item ${!n.read ? 'is-unread' : ''} ${selected.has(n._id) ? 'is-selected' : ''}`}
                >
                  <label className="cust-bell-check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(n._id)}
                      onChange={() => toggleOne(n._id)}
                    />
                  </label>
                  <button type="button" className="cust-bell-item-main" onClick={() => openItem(n)}>
                    <span className="cust-bell-item-icon">{typeIcon(n.type)}</span>
                    <span className="cust-bell-item-body">
                      <span className="cust-bell-item-title">{n.title}</span>
                      <span className="cust-bell-item-msg">{n.body}</span>
                      <span className="cust-bell-item-time">{timeAgo(n.createdAt)}</span>
                    </span>
                    {!n.read && <span className="cust-bell-dot" aria-hidden="true" />}
                  </button>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="cust-bell-footer">
              <button
                type="button"
                className="cust-bell-clear"
                onClick={async () => {
                  await clearAll({ email }).catch(() => {});
                  setSelected(new Set());
                }}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerNotificationBell;
