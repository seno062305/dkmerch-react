import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useCloseOnHistoryBack } from '../hooks/useCloseOnHistoryBack';
import { useConfirm } from '../context/ConfirmContext';
import { clearUpdatePromptDismiss } from '../utils/appUpdate';
import './CustomerNotificationBell.css';

const INITIAL_VISIBLE = 12;
const EXPANDED_VISIBLE = 40;

function timeAgo(ts) {
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (!t) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function typeBadge(type) {
  switch (String(type || '')) {
    case 'promo': return { icon: 'fa-fire', tone: 'promo' };
    case 'app_update': return { icon: 'fa-mobile-alt', tone: 'update' };
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

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupNotifications(list) {
  const todayStart = startOfTodayMs();
  const newItems = [];
  const todayItems = [];
  const earlierItems = [];

  for (const n of list) {
    const t = typeof n.createdAt === 'number' ? n.createdAt : new Date(n.createdAt).getTime();
    if (!n.read) {
      newItems.push(n);
    } else if (t >= todayStart) {
      todayItems.push(n);
    } else {
      earlierItems.push(n);
    }
  }

  return [
    { key: 'new', label: 'New', items: newItems, showSeeAll: true },
    { key: 'today', label: 'Today', items: todayItems, showSeeAll: false },
    { key: 'earlier', label: 'Earlier', items: earlierItems, showSeeAll: false },
  ].filter((g) => g.items.length > 0);
}

/** Resolve deep-link target from notification type / payload. */
function resolveNotificationTarget(n) {
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

/**
 * Customer notification center — Facebook-style dropdown (no settings).
 */
const CustomerNotificationBell = ({ email }) => {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState('all'); // all | unread
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const listRef = useRef(null);

  const notifications = useQuery(
    api.customerNotifications.getRecentForEmail,
    email ? { email, limit: 80 } : 'skip'
  ) ?? [];
  const unreadCount = useQuery(
    api.customerNotifications.getUnreadCountForEmail,
    email ? { email } : 'skip'
  ) ?? 0;

  const markMany = useMutation(api.customerNotifications.markMany);
  const markAllRead = useMutation(api.customerNotifications.markAllRead);
  const clearAll = useMutation(api.customerNotifications.clearAll);

  const { release } = useCloseOnHistoryBack(open, () => {
    setMenuOpen(false);
    setOpen(false);
  }, 'customerNotifs');

  useEffect(() => {
    if (!open) {
      setMenuOpen(false);
      setFilter('all');
      setVisibleCount(INITIAL_VISIBLE);
    }
  }, [open]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) {
        setMenuOpen(false);
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    if (filter === 'unread') return notifications.filter((n) => !n.read);
    return notifications;
  }, [notifications, filter]);

  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const groups = useMemo(() => groupNotifications(visible), [visible]);
  const hasMore = filtered.length > visibleCount;

  if (!email) return null;

  const toggleOpen = () => {
    setOpen((o) => !o);
  };

  const openItem = async (n) => {
    if (!n.read) {
      await markMany({ email, ids: [n._id], read: true }).catch(() => {});
    }
    release();
    setMenuOpen(false);
    setOpen(false);
    const target = resolveNotificationTarget(n);
    if (target) navigate(target);
  };

  const handleMarkAllRead = async () => {
    setMenuOpen(false);
    await markAllRead({ email }).catch(() => {});
  };

  const handleOpenNotifications = () => {
    setMenuOpen(false);
    setFilter('all');
    setVisibleCount(EXPANDED_VISIBLE);
    requestAnimationFrame(() => {
      listRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
    });
  };

  const handleSeePrevious = () => {
    setVisibleCount((c) => Math.min(filtered.length, c + INITIAL_VISIBLE));
  };

  const handleSeeAllNew = () => {
    setFilter('unread');
    setVisibleCount(EXPANDED_VISIBLE);
  };

  const handleClearAll = async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: 'Clear all notifications?',
      message: 'This permanently removes every notification from your list.',
      confirmLabel: 'Clear all',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    await clearAll({ email }).catch(() => {});
  };

  return (
    <div className="cust-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="header-action-item cust-bell-btn"
        onClick={toggleOpen}
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
        <span>Alerts</span>
      </button>

      {open && (
        <div className="cust-bell-dropdown" role="dialog" aria-label="Notifications">
          <div className="cust-bell-header">
            <h2 className="cust-bell-title">Notifications</h2>
            <div className="cust-bell-header-actions" ref={menuRef}>
              <button
                type="button"
                className={`cust-bell-more ${menuOpen ? 'is-open' : ''}`}
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More options"
                aria-expanded={menuOpen}
              >
                <i className="fas fa-ellipsis-h" aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="cust-bell-menu" role="menu">
                  <button
                    type="button"
                    className="cust-bell-menu-item"
                    role="menuitem"
                    onClick={handleMarkAllRead}
                    disabled={unreadCount === 0}
                  >
                    <span className="cust-bell-menu-icon" aria-hidden="true">
                      <i className="fas fa-check" />
                    </span>
                    <span>Mark all as read</span>
                  </button>
                  <button
                    type="button"
                    className="cust-bell-menu-item"
                    role="menuitem"
                    onClick={handleOpenNotifications}
                  >
                    <span className="cust-bell-menu-icon" aria-hidden="true">
                      <i className="fas fa-desktop" />
                    </span>
                    <span>Open Notifications</span>
                  </button>
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      className="cust-bell-menu-item is-danger"
                      role="menuitem"
                      onClick={handleClearAll}
                    >
                      <span className="cust-bell-menu-icon" aria-hidden="true">
                        <i className="fas fa-trash-alt" />
                      </span>
                      <span>Clear all</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="cust-bell-tabs" role="tablist" aria-label="Notification filter">
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'all'}
              className={`cust-bell-tab ${filter === 'all' ? 'is-active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'unread'}
              className={`cust-bell-tab ${filter === 'unread' ? 'is-active' : ''}`}
              onClick={() => setFilter('unread')}
            >
              Unread
            </button>
          </div>

          <div className="cust-bell-list" ref={listRef}>
            {filtered.length === 0 ? (
              <div className="cust-bell-empty">
                <span className="cust-bell-empty-icon" aria-hidden="true">
                  <i className="far fa-bell-slash" />
                </span>
                <span>
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </span>
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.key} className="cust-bell-group">
                  <div className="cust-bell-group-head">
                    <h3 className="cust-bell-group-label">{group.label}</h3>
                    {group.showSeeAll && group.key === 'new' && unreadCount > 0 && (
                      <button
                        type="button"
                        className="cust-bell-see-all"
                        onClick={handleSeeAllNew}
                      >
                        See all
                      </button>
                    )}
                  </div>
                  {group.items.map((n) => {
                    const badge = typeBadge(n.type);
                    return (
                      <button
                        key={n._id}
                        type="button"
                        className={`cust-bell-item ${!n.read ? 'is-unread' : ''}`}
                        onClick={() => openItem(n)}
                      >
                        <span className="cust-bell-avatar-wrap" aria-hidden="true">
                          <img
                            src="/images/dklogo.jpg"
                            alt=""
                            className="cust-bell-avatar"
                          />
                          <span className={`cust-bell-type-badge tone-${badge.tone}`}>
                            <i className={`fas ${badge.icon}`} />
                          </span>
                        </span>
                        <span className="cust-bell-item-body">
                          <span className="cust-bell-item-text">
                            <strong>{n.title}</strong>
                            {n.body ? ` ${n.body}` : ''}
                          </span>
                          <span className="cust-bell-item-time">{timeAgo(n.createdAt)}</span>
                        </span>
                        {!n.read && <span className="cust-bell-dot" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </section>
              ))
            )}
          </div>

          {filtered.length > 0 && (
            <div className="cust-bell-footer">
              <button
                type="button"
                className="cust-bell-see-prev"
                onClick={hasMore ? handleSeePrevious : handleOpenNotifications}
              >
                {hasMore ? 'See previous notifications' : 'You’re all caught up'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerNotificationBell;
