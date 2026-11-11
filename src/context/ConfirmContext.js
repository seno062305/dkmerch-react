import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';

const ConfirmContext = createContext(null);

/**
 * One global skip for shop action confirms:
 * favorites, add to cart, and buy now (all products).
 */
export const SHOP_CONFIRM_SKIP_KEY = 'dk_skip_shop_action_confirm';
/** @deprecated use SHOP_CONFIRM_SKIP_KEY — kept for older localStorage / imports */
export const ADD_TO_CART_CONFIRM_SKIP_KEY = SHOP_CONFIRM_SKIP_KEY;

/** Shared remember key for favorites / cart / buy now */
export function shopActionConfirmRememberKey() {
  return SHOP_CONFIRM_SKIP_KEY;
}

/** @deprecated email arg ignored — skip is global for all shop confirms */
export function addToCartConfirmRememberKey(_email) {
  return SHOP_CONFIRM_SKIP_KEY;
}

function isShopSkipKey(key) {
  if (typeof key !== 'string') return false;
  return (
    key === SHOP_CONFIRM_SKIP_KEY
    || key.startsWith('dk_skip_shop_action_confirm')
    || key.startsWith('dk_skip_add_to_cart_confirm')
  );
}

function hasShopConfirmSkip() {
  try {
    if (localStorage.getItem(SHOP_CONFIRM_SKIP_KEY) === '1') return true;
    // Migrate older ATC / per-account keys → global shop skip
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (
        k
        && (k.startsWith('dk_skip_add_to_cart_confirm') || k.startsWith('dk_skip_shop_action_confirm'))
        && localStorage.getItem(k) === '1'
      ) {
        localStorage.setItem(SHOP_CONFIRM_SKIP_KEY, '1');
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
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
        if (isShopSkipKey(rememberKey)) {
          localStorage.setItem(SHOP_CONFIRM_SKIP_KEY, '1');
        } else {
          localStorage.setItem(rememberKey, '1');
        }
      } catch { /* ignore */ }
    }
    if (resolve) resolve(result);
  }, []);

  const confirm = useCallback((options = {}) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    const rememberKey = opts.rememberKey || null;

    if (rememberKey) {
      try {
        if (isShopSkipKey(rememberKey) && hasShopConfirmSkip()) {
          return Promise.resolve(true);
        }
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
        rememberLabel: opts.rememberLabel || "Don't show again",
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
