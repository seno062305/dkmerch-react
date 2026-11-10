import React from "react";
import { createPortal } from "react-dom";
import "./NewLoginAlertModal.css";

/** Full-screen overlay modal — waiting for Yes on the other device. */
export function WaitingApprovalModal() {
  return createPortal(
    <div className="nla-overlay" role="presentation" style={{ zIndex: 100090 }}>
      <div
        className="nla-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="wait-title"
        aria-describedby="wait-desc"
      >
        <div className="nla-icon" aria-hidden="true">
          <i className="fas fa-mobile-alt" />
        </div>
        <h2 id="wait-title" className="nla-title">Waiting for approval</h2>
        <p id="wait-desc" className="nla-desc">
          Confirm this login on your other device. You won’t get into DKMerch until they tap
          Yes, it’s me.
        </p>
        <div className="nla-wait-spinner" aria-hidden="true" />
        <p className="nla-hint">Keep this screen open — we’ll continue automatically.</p>
      </div>
    </div>,
    document.body
  );
}

/**
 * Shown only on the device that tried to log in after the owner tapped No.
 * Close button only — popup modal, not page content.
 */
export function LoginDeniedModal({ onClose }) {
  return createPortal(
    <div className="nla-overlay" role="presentation" style={{ zIndex: 100090 }}>
      <div
        className="nla-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="deny-title"
        aria-describedby="deny-desc"
      >
        <div className="nla-icon" aria-hidden="true">
          <i className="fas fa-user-slash" />
        </div>
        <h2 id="deny-title" className="nla-title">It’s not your account</h2>
        <p id="deny-desc" className="nla-desc">
          The owner of this account blocked this login. You were not signed in.
        </p>
        <div className="nla-actions">
          <button type="button" className="nla-btn nla-btn-yes" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
