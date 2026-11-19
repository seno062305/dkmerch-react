import React from "react";
import { createPortal } from "react-dom";
import { getOverlayRoot } from "../utils/scrollLock";
import "./SessionIdleModal.css";

/** Shown after auto-logout from 10 minutes of customer inactivity. */
const SessionIdleModal = ({ open, onClose, minutes = 10 }) => {
  if (!open) return null;

  const portalTarget = getOverlayRoot() || document.body;

  return createPortal(
    <div className="sim-overlay" role="presentation" onClick={onClose}>
      <div
        className="sim-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sim-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sim-icon" aria-hidden="true">
          <i className="fas fa-clock" />
        </div>
        <h2 id="sim-title" className="sim-title">Session ended</h2>
        <p className="sim-desc">
          You were signed out after <strong>{minutes} minutes</strong> with no activity.
          Sign in again to continue shopping.
        </p>
        <div className="sim-actions">
          <button type="button" className="sim-btn" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
};

export default SessionIdleModal;
