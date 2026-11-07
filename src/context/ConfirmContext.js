import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';

const ConfirmContext = createContext(null);

export const ConfirmProvider = ({ children }) => {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const close = useCallback((result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    if (resolve) resolve(result);
  }, []);

  const confirm = useCallback((options = {}) => {
    const opts = typeof options === 'string' ? { message: options } : options;

    return new Promise((resolve) => {
      if (resolverRef.current) {
        resolverRef.current(false);
      }
      resolverRef.current = resolve;
      setState({
        title: opts.title || 'Please confirm',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        variant: opts.variant || 'primary',
        icon: opts.icon || null,
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
