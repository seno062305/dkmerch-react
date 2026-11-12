import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useCloseOnHistoryBack } from '../hooks/useCloseOnHistoryBack';
import { useConfirm } from '../context/ConfirmContext';
import { clearUpdatePromptDismiss } from '../utils/appUpdate';
import { goToCustomerTab } from '../utils/navScroll';
import './CustomerNotificationBell.css';

function isStoreNotif(type) {
  const t = String(type || '');
  return t === 'app_update' || t === 'shipping_fee' || t === 'promo' || t === 'update';
}

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

function typeBadge(type) {
  switch (String(type || '')) {
    case 'promo': return { icon: 'fa-fire', tone: 'promo' };
    case 'app_update': return { icon: 'fa-mobile-alt', tone: 'update' };
    case 'shipping_fee': return { icon: 'fa-truck', tone: 'delivery' };
    case 'order_confirmed': return { icon: 'fa-check', tone: 'ok' };
    case 'out_for_delivery': return { icon: 'fa-motorcycle', tone: 'delivery' };
    case 'rider_assigned': return { icon: 'fa-user-check', tone: 'delivery' };
    case 'order_deleted': return { icon: 'fa-trash', tone: 'warn' };
    case 'order_cancelled':
    case 'cancel_approved': return { icon: 'fa-times', tone: 'warn' };
    case 'cancel_rejected': return { icon: 'fa-exclamation', tone: 'warn' };
    default: return { icon: 'fa-bell', tone: 'default' };
  }
}

export function resolveNotificationTarget(n) {
  const type = String(n?.type || '');
  const url = String(n?.url || '');
  const orderId = String(n?.orderId || '').trim();

  if (type === 'app_update') {
    let version = '';
    try {
      const u = new URL(url, window.location.origin);
      version = u.searchParams.get('appUpdate') || '';
    } catch { /* ignore */ }
    if (!version) {
      const m = String(n?.title || '').match(/v([0-9][0-9.\-]*)/i);
      version = m?.[1] || '';
    }
    if (version) {
      try { clearUpdatePromptDismiss(version); } catch { /* ignore */ }
      return `/?appUpdate=${encodeURIComponent(version)}`;
    }
    return '/?appUpdate=1';
  }

  if (type === 'shipping_fee') return '/collections';

  if (
    orderId
    && (
      type.startsWith('order_')
      || type === 'out_for_delivery'
      || type === 'rider_assigned'
      || type === 'cancel_approved'
      || type === 'cancel_rejected'
    )
  ) {
    return `/track-order?order=${encodeURIComponent(orderId)}&highlight=1`;
  }

  if (url.includes('/track-order') && !url.includes('highlight=')) {
    return `${url}${url.includes('?') ? '&' : '?'}highlight=1`;
  }

  return url || null;
}

function useIsMobileNotif() {
  const [mobile, setMobile] = useState(() => {
    try { return window.matchMedia('(max-width: 768px)').matches; } catch { return false; }
  });
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return mobile;
}

/** Shared notification list — checklist toolbar (desktop dropdown + mobile page). */
export function CustomerNotificationPanel({ email, variant = 'dropdown', onNavigate }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm } = useConfirm();
  const [selected, setSelected] = useState(() => new Set());
  const listRef = useRef(null);

  const emailKey = String(email || '').trim().toLowerCase();
  const notifications = useQuery(
    api.customerNotifications.getRecentForEmail,
    emailKey ? { email: emailKey, limit: 80 } : 'skip'
  ) ?? [];
  const unreadCount = useQuery(
    api.customerNotifications.getUnreadCountForEmail,
    emailKey ? { email: emailKey } : 'skip'
  ) ?? 0;

  const markMany = useMutation(api.customerNotifications.markMany);
  const markAllRead = useMutation(api.customerNotifications.markAllRead);
  const clearAll = useMutation(api.customerNotifications.clearAll);

  const allIds = notifications.map((n) => n._id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const selectedIds = [...selected];

  const openItem = async (n) => {
    if (!n.read) {
      await markMany({ email: emailKey, ids: [n._id], read: true }).catch(() => {});
    }
    onNavigate?.();
    const target = resolveNotificationTarget(n);
    if (!target) return;
    if (String(n?.type || '') === 'shipping_fee' || target === '/collections') {
      goToCustomerTab(navigate, location.pathname, '/collections');
      return;
    }
    navigate(target);
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
    const ids = selectedIds.length > 0
      ? selectedIds
      : allIds.filter((id) => {
        const row = notifications.find((n) => n._id === id);
        return read ? row && !row.read : row && row.read;
      });
    if (!ids.length) return;
    await markMany({ email: emailKey, ids, read }).catch(() => {});
    setSelected(new Set());
  };

  const handleClearAll = async () => {
    const ok = await confirm({
      title: 'Clear all notifications?',
      message: 'This permanently removes every notification from your list.',
      confirmLabel: 'Clear all',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    await clearAll({ email: emailKey }).catch(() => {});
    setSelected(new Set());
  };

  if (!emailKey) {
    return (
      <div className={`cust-bell-panel cust-bell-panel--${variant}`}>
        <div className="cust-bell-empty">
          <span>Please log in to see notifications</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`cust-bell-panel cust-bell-panel--${variant}`}>
      <div className="cust-bell-header">
        <div className="cust-bell-title-row">
          <span className="cust-bell-title">Notifications</span>
          {unreadCount > 0 && <span className="cust-bell-unread-pill">{unreadCount} new</span>}
        </div>
      </div>

      {notifications.length > 0 && (
        <div className="cust-bell-toolbar">
          <label className="cust-bell-select-all">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            <span>Select all</span>
          </label>
          <div className="cust-bell-toolbar-actions">
            <button
              type="button"
              onClick={() => applyMark(true)}
              disabled={!selectedIds.length && unreadCount === 0}
            >
              Mark read
            </button>
            <button
              type="button"
              onClick={() => applyMark(false)}
              disabled={!selectedIds.length}
            >
              Mark unread
            </button>
            <button
              type="button"
              className="cust-bell-mark-all"
              onClick={() => markAllRead({ email: emailKey }).catch(() => {})}
              disabled={unreadCount === 0}
            >
              All read
            </button>
          </div>
        </div>
      )}

      <div className="cust-bell-list" ref={listRef}>
        {notifications.length === 0 ? (
          <div className="cust-bell-empty">
            <img src="/images/dklogo.jpg" alt="" className="cust-bell-empty-logo" />
            <span>No notifications yet</span>
          </div>
        ) : (
          notifications.map((n) => {
            const badge = typeBadge(n.type);
            const store = isStoreNotif(n.type);
            return (
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
                  <span className="cust-bell-avatar-wrap" aria-hidden="true">
                    <img
                      src="/images/dklogo.jpg"
                      alt="DKMerch"
                      className="cust-bell-avatar"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/images/dklogo2-removebg-preview.png';
                      }}
                    />
                    {!store && (
                      <span className={`cust-bell-type-badge tone-${badge.tone}`}>
                        <i className={`fas ${badge.icon}`} />
                      </span>
                    )}
                  </span>
                  <span className="cust-bell-item-body">
                    <span className="cust-bell-item-title">{n.title}</span>
                    <span className="cust-bell-item-msg">{n.body}</span>
                    <span className="cust-bell-item-time">{timeAgo(n.createdAt)}</span>
                    {String(n.type || '') === 'shipping_fee' && (
                      <span className="cust-bell-cta">Shop now</span>
                    )}
                  </span>
                  {!n.read && <span className="cust-bell-dot" aria-hidden="true" />}
                </button>
              </div>
            );
          })
        )}
      </div>

      {notifications.length > 0 && (
        <div className="cust-bell-footer">
          <button type="button" className="cust-bell-clear" onClick={handleClearAll}>
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Header bell — desktop dropdown with checklist; mobile goes to /notifications tab.
 */
const CustomerNotificationBell = ({ email }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const isMobile = useIsMobileNotif();

  const emailKey = String(email || '').trim().toLowerCase();
  const unreadCount = useQuery(
    api.customerNotifications.getUnreadCountForEmail,
    emailKey ? { email: emailKey } : 'skip'
  ) ?? 0;

  const { release } = useCloseOnHistoryBack(open, () => setOpen(false), 'customerNotifs');

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!emailKey) return null;

  const onBellClick = () => {
    if (isMobile) {
      goToCustomerTab(navigate, location.pathname, '/notifications');
      return;
    }
    setOpen((o) => !o);
  };

  return (
    <div className="cust-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="header-action-item cust-bell-btn"
        onClick={onBellClick}
        aria-label="Notifications"
        title="Notifications"
        aria-expanded={open}
      >
        <span className="icon-wrapper">
          <i className="fas fa-bell" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="notif-count">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </span>
        <span>Notifications</span>
      </button>

      {open && !isMobile && (
        <div className="cust-bell-dropdown" role="dialog" aria-label="Notifications">
          <button
            type="button"
            className="cust-bell-close"
            onClick={() => { release(); setOpen(false); }}
            aria-label="Close"
          >
            <i className="fas fa-times" />
          </button>
          <CustomerNotificationPanel
            email={emailKey}
            variant="dropdown"
            onNavigate={() => { release(); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
};

export default CustomerNotificationBell;
