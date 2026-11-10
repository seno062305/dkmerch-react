import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';

const ConfirmContext = createContext(null);

/** Per-account skip key so first-time add-to-cart still confirms until that user opts out. */
export function addToCartConfirmRememberKey(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  return `dk_skip_add_to_cart_confirm:${normalized}`;
}

export const ConfirmProvider = ({ children }) => {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);
  const dontShowRef = useRef(false);
  const rememberKeyRef = useRef(null);

  const close = useCallback((result) => {
    const resolve = resolverRef.current;
    const rememberKey = rememberKeyRef.current;
    const saveDontShow = dontShowRef.current && result === true && rememberKey;
    resolverRef.current = null;
    dontShowRef.current = false;
    rememberKeyRef.current = null;
    setState(null);
    if (saveDontShow) {
      try {
        localStorage.setItem(rememberKey, '1');
      } catch { /* ignore */ }
    }
    if (resolve) resolve(result);
  }, []);

  const confirm = useCallback((options = {}) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    const rememberKey = opts.rememberKey || null;

    // Only skip when this exact account opted out via "Do not show again".
    // Ignore/clear legacy device-wide key that skipped confirm for every item.
    try {
      if (localStorage.getItem('dk_skip_add_to_cart_confirm') === '1') {
        localStorage.removeItem('dk_skip_add_to_cart_confirm');
      }
    } catch { /* ignore */ }

    if (rememberKey && rememberKey.includes(':')) {
      try {
        if (localStorage.getItem(rememberKey) === '1') {
          return Promise.resolve(true);
        }
      } catch { /* ignore */ }
    }

    return new Promise((resolve) => {
      if (resolverRef.current) {
        resolverRef.current(false);
      }
      resolverRef.current = resolve;
      dontShowRef.current = false;
      rememberKeyRef.current = rememberKey;
      setState({
        title: opts.title || 'Please confirm',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        variant: opts.variant || 'primary',
        icon: opts.icon || null,
        rememberKey,
        rememberLabel: opts.rememberLabel || 'Do not show again',
      });
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <ConfirmModal
          title={state.title}
          message={state.message}
          confirmLabel={state.confirmLabel}
          cancelLabel={state.cancelLabel}
          variant={state.variant}
          icon={state.icon}
          rememberKey={state.rememberKey}
          rememberLabel={state.rememberLabel}
          onDontShowChange={(checked) => { dontShowRef.current = !!checked; }}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
};
