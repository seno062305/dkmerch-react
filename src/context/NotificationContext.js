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
  success: 3200,
  info: 3200,
  warning: 4200,
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
    const id = ++idRef.current;
    const duration = options.duration ?? DEFAULT_MS[safeType] ?? 3200;
    const toast = {
      id,
      message: String(message || ''),
      type: safeType,
    };
    setToasts((prev) => [...prev.slice(-4), toast]); // keep max 5
    if (duration > 0) {
      window.setTimeout(() => dismiss(id), duration);
    }
    return id;
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
