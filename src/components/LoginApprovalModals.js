import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getOverlayRoot } from "../utils/scrollLock";
import "./NewLoginAlertModal.css";

const DEFAULT_WAIT_SECS = 60;

/** Full-screen overlay modal — waiting for Yes on the other device. */
export function WaitingApprovalModal({ onClose, onTimeout, expiresAt, secondsTotal = DEFAULT_WAIT_SECS }) {
  const [closing, setClosing] = useState(false);
  const timedOutRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  // Do NOT clamp to secondsTotal — that froze the UI at "60s" when TTL was longer (e.g. 120s).
  const remainingFromExpiry = (exp) =>
    Math.max(0, Math.ceil((Number(exp) - Date.now()) / 1000));
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (expiresAt) return remainingFromExpiry(expiresAt);
    return secondsTotal;
  });

  useEffect(() => {
    timedOutRef.current = false;
    const fireTimeout = () => {
      if (timedOutRef.current) return;
      timedOutRef.current = true;
      onTimeoutRef.current?.();
    };

    if (expiresAt) {
      setSecondsLeft(remainingFromExpiry(expiresAt));
    } else {
      setSecondsLeft(secondsTotal);
    }

    const id = setInterval(() => {
      if (expiresAt) {
        const left = remainingFromExpiry(expiresAt);
        setSecondsLeft(left);
        if (left <= 0) {
          clearInterval(id);
          fireTimeout();
        }
        return;
      }
      setSecondsLeft((prev) => {
        const next = Math.max(0, prev - 1);
        if (next <= 0) {
          clearInterval(id);
          fireTimeout();
        }
        return next;
      });
    }, 250);

    return () => clearInterval(id);
  }, [expiresAt, secondsTotal]);

  const handleClose = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await onClose?.();
    } finally {
      setClosing(false);
    }
  };

  return createPortal(
    <div className="nla-overlay" role="presentation">
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
        <div className="nla-timer" aria-live="polite">
          <span className="nla-timer-secs">{secondsLeft}s</span>
          <span className="nla-timer-label">Auto-declines if not confirmed</span>
        </div>
        <p className="nla-hint">Keep this screen open — we’ll continue automatically.</p>
        <div className="nla-actions" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="nla-btn nla-btn-no"
            disabled={closing}
            onClick={handleClose}
          >
            {closing ? "Closing…" : "Close"}
          </button>
        </div>
      </div>
    </div>,
    getOverlayRoot() || document.body
  );
}

/**
 * Shown only on the device that tried to log in after the owner tapped No / timed out.
 * Close button only — popup modal, not page content.
 */
export function LoginDeniedModal({ onClose, reason }) {
  const timedOut = reason === "timeout";
  return createPortal(
    <div className="nla-overlay" role="presentation">
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
        <h2 id="deny-title" className="nla-title">Failed to login</h2>
        <p id="deny-desc" className="nla-desc">
          {timedOut
            ? "This login wasn’t confirmed in time. You were not logged in."
            : "The owner of this account blocked this sign-in. You were not logged in."}
        </p>
        <div className="nla-actions">
          <button type="button" className="nla-btn nla-btn-yes" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    getOverlayRoot() || document.body
  );
}
