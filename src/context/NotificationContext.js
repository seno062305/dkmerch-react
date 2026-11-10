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
  success: 5000,
  info: 5000,
  warning: 5000,
  error: 5000,
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

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showNotification = useCallback((message, type = 'info', options = {}) => {
    const safeType = ICONS[type] ? type : 'info';
    const text = String(message || '');
    const dedupeKey = options.dedupeKey || `${safeType}:${text}`;
    const duration = options.duration ?? DEFAULT_MS[safeType] ?? 3200;

    let createdId = null;
    let skipped = false;
    setToasts((prev) => {
      if (prev.some((t) => t.dedupeKey === dedupeKey)) {
        skipped = true;
        return prev; // same message already visible — no spam stack
      }
      createdId = ++idRef.current;
      return [...prev.slice(-4), { id: createdId, message: text, type: safeType, dedupeKey }];
    });

    if (!skipped && createdId != null && duration > 0) {
      window.setTimeout(() => dismiss(createdId), duration);
    }
    return createdId;
  }, [dismiss]);

  showRef.current = showNotification;

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
