import React, { useEffect, useState } from 'react';
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
  rememberLabel = 'Do not show again',
  onDontShowChange,
  onConfirm,
  onCancel,
}) => {
  const meta = VARIANT_META[variant] || VARIANT_META.primary;
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.();
      if (e.key === 'Enter') onConfirm?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm]);

  const toggleDontShow = () => {
    const next = !dontShow;
    setDontShow(next);
    onDontShowChange?.(next);
  };

  return (
    <div className="dk-confirm-overlay" onClick={onCancel} role="presentation">
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
          <button type="button" className="dk-confirm-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="dk-confirm-proceed" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
