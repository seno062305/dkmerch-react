import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCloseOnHistoryBack } from '../hooks/useCloseOnHistoryBack';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { getOverlayRoot } from '../utils/scrollLock';
import './ConfirmModal.css';

const VARIANT_META = {
  primary: { tone: 'primary' },
  danger:  { tone: 'danger' },
  warning: { tone: 'warning' },
  info:    { tone: 'info' },
};

const ConfirmModal = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  rememberKey = null,
  rememberLabel = "Don't show again",
  onDontShowChange,
  onConfirm,
  onCancel,
}) => {
  const meta = VARIANT_META[variant] || VARIANT_META.primary;
  const [dontShow, setDontShow] = useState(false);
  const busyRef = useRef(false);

  useBodyScrollLock(true);
  const { release } = useCloseOnHistoryBack(true, onCancel, 'confirmModal');

  const finishCancel = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await release();
      onCancel?.();
    } finally {
      busyRef.current = false;
    }
  }, [onCancel, release]);

  const finishConfirm = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await release();
      onConfirm?.();
    } finally {
      busyRef.current = false;
    }
  }, [onConfirm, release]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') finishCancel();
      if (e.key === 'Enter') finishConfirm();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finishCancel, finishConfirm]);

  const toggleDontShow = () => {
    const next = !dontShow;
    setDontShow(next);
    onDontShowChange?.(next);
  };

  return createPortal(
    <div className="dk-confirm-overlay" onClick={finishCancel} role="presentation">
      <div
        className={`dk-confirm-modal dk-confirm-${meta.tone}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dk-confirm-title"
      >
        <h3 id="dk-confirm-title" className="dk-confirm-title">{title}</h3>
        {message && (
          <p className="dk-confirm-message">{message}</p>
        )}
        {rememberKey && (
          <label className="dk-confirm-remember">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={toggleDontShow}
            />
            <span>{rememberLabel}</span>
          </label>
        )}
        <div className="dk-confirm-actions">
          <button type="button" className="dk-confirm-cancel" onClick={finishCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="dk-confirm-proceed" onClick={finishConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    getOverlayRoot() || document.body
  );
};

export default ConfirmModal;
