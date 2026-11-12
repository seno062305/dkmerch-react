import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import './NotificationToast.css'; // toast styles

const NotificationContext = createContext(null);

const ICONS = {
  success: 'fa-check-circle',
  error: 'fa-exclamation-circle',
  warning: 'fa-exclamation-triangle',
  info: 'fa-info-circle',
};

const DEFAULT_MS = {
  success: 4500,
  info: 4500,
  warning: 5500,
  error: 6000,
};

const guessType = (message) => {
  const m = String(message || '').toLowerCase();
  if (/(fail|error|unable|invalid|blocked|denied|wrong)/.test(m)) return 'error';
  if (/(please|must|need|cannot|can't|only|missing|first)/.test(m)) return 'warning';
  if (/(success|saved|updated|confirmed|notified|done|complete)/.test(m)) return 'success';
  return 'info';
};

export const NotificationProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const showRef = useRef(null);
  const timersRef = useRef(new Map());

  const clearTimer = useCallback((id) => {
    const t = timersRef.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback((id) => {
    clearTimer(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, [clearTimer]);

  const showNotification = useCallback((message, type = 'info', options = {}) => {
    const safeType = ICONS[type] ? type : 'info';
    const text = String(message || '');
    const dedupeKey = options.dedupeKey || `${safeType}:${text}`;
    // Always auto-dismiss unless explicitly set to 0 / Infinity
    const rawDuration = options.duration;
    const duration = rawDuration === 0 || rawDuration === Infinity
      ? 0
      : Math.max(1200, Number(rawDuration ?? DEFAULT_MS[safeType] ?? 4500) || 4500);

    // Generate id outside setState so the dismiss timer always gets a real id
    let createdId = null;
    let skipped = false;
    setToasts((prev) => {
      const existing = prev.find((t) => t.dedupeKey === dedupeKey);
      if (existing) {
        skipped = true;
        createdId = existing.id;
        return prev;
      }
      createdId = ++idRef.current;
      return [...prev.slice(-4), { id: createdId, message: text, type: safeType, dedupeKey }];
    });

    if (createdId != null && duration > 0) {
      clearTimer(createdId);
      const timer = window.setTimeout(() => dismiss(createdId), duration);
      timersRef.current.set(createdId, timer);
    }
    return createdId;
  }, [clearTimer, dismiss]);

  showRef.current = showNotification;

  useEffect(() => () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current.clear();
  }, []);

  // Route native alert() to toast so leftover browser alerts become notifications
  useEffect(() => {
    const originalAlert = window.alert.bind(window);
    window.alert = (message) => {
      const text = String(message ?? '');
      if (showRef.current) showRef.current(text, guessType(text));
      else originalAlert(text);
    };
    return () => {
      window.alert = originalAlert;
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification, dismiss }}>
      {children}
      <div className="dk-toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`dk-toast dk-toast--${t.type}`} role="status">
            <i className={`fas ${ICONS[t.type]}`} aria-hidden="true" />
            <span className="dk-toast-msg">{t.message}</span>
            <button
              type="button"
              className="dk-toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    return {
      showNotification: (message) => {
        if (typeof window !== 'undefined') window.alert(message);
      },
      dismiss: () => {},
    };
  }
  return ctx;
};
