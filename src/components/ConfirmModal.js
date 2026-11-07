import React, { useEffect } from 'react';
import './ConfirmModal.css';

const VARIANT_META = {
  primary: { icon: 'fa-shopping-bag', tone: 'primary' },
  danger:  { icon: 'fa-trash-alt',    tone: 'danger' },
  warning: { icon: 'fa-exclamation-triangle', tone: 'warning' },
  info:    { icon: 'fa-info-circle',  tone: 'info' },
};

const ConfirmModal = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  icon,
  onConfirm,
  onCancel,
}) => {
  const meta = VARIANT_META[variant] || VARIANT_META.primary;
  const iconClass = icon || meta.icon;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.();
      if (e.key === 'Enter') onConfirm?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm]);

  return (
    <div className="dk-confirm-overlay" onClick={onCancel} role="presentation">
      <div
        className={`dk-confirm-modal dk-confirm-${meta.tone}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dk-confirm-title"
      >
        <div className="dk-confirm-icon" aria-hidden="true">
          <i className={`fas ${iconClass}`}></i>
        </div>
        <h3 id="dk-confirm-title" className="dk-confirm-title">{title}</h3>
        {message && (
          <p className="dk-confirm-message">{message}</p>
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
