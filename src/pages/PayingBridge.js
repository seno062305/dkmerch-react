import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { getOverlayRoot } from '../utils/scrollLock';
import {
  clearPaySessionAll,
  goToPayMongo,
  readPaySession,
  roleHome,
  PAY_RETURN_KEY,
} from '../utils/paymentLeaveGuard';
import '../components/ConfirmModal.css';
import './PayingBridge.css';

/**
 * History trap between our app and PayMongo.
 * Browser Back from PayMongo lands here immediately with the leave confirm —
 * Order Details / Checkout stay off-screen until the user chooses Leave.
 * Extra Back on this screen stays here (does not leave payment).
 */
const PayingBridge = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role } = useAuth();
  const { showNotification } = useNotification();
  const releasePaymentHold = useMutation(api.payments.releasePaymentHold);
  const leavingRef = useRef(false);
  const [busy, setBusy] = useState(false);

  useBodyScrollLock(true);

  const sess = readPaySession();
  const orderId =
    String(searchParams.get('orderId') || sess.orderId || '').trim();
  const checkoutUrl = String(sess.checkoutUrl || '').trim();

  const resolveReturnPath = useCallback(() => {
    try {
      const stored = sessionStorage.getItem(PAY_RETURN_KEY);
      if (stored && stored.startsWith('/')) return stored;
    } catch { /* ignore */ }
    if (orderId) return `/track-order?order=${encodeURIComponent(orderId)}`;
    return roleHome(role, sess.home);
  }, [orderId, role, sess.home]);

  // Trap Back — stay on this confirm until Leave or Continue
  useEffect(() => {
    const lock = () => {
      try {
        window.history.pushState({ dkPayingBridge: true }, '', window.location.href);
      } catch { /* ignore */ }
    };
    lock();
    const onPop = () => {
      if (leavingRef.current) return;
      lock();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (checkoutUrl || orderId) return;
    navigate(roleHome(role, sess.home), { replace: true });
  }, [checkoutUrl, orderId, navigate, role, sess.home]);

  const continuePayment = useCallback(() => {
    if (busy || leavingRef.current) return;
    if (!checkoutUrl) {
      showNotification('Payment session expired. Open Pay again from your order.', 'warning', {
        fullText: true,
      });
      leavingRef.current = true;
      clearPaySessionAll();
      navigate(resolveReturnPath(), { replace: true });
      return;
    }
    setBusy(true);
    goToPayMongo(checkoutUrl, resolveReturnPath());
  }, [busy, checkoutUrl, navigate, resolveReturnPath, showNotification]);

  const leavePayment = useCallback(async () => {
    if (busy || leavingRef.current) return;
    leavingRef.current = true;
    setBusy(true);
    const id = orderId;
    if (id) {
      try { await releasePaymentHold({ orderId: id }); } catch { /* ignore */ }
    }
    clearPaySessionAll();
    try { sessionStorage.removeItem(PAY_RETURN_KEY); } catch { /* ignore */ }
    showNotification(
      'Payment cancelled. You can pay again anytime — no waiting period.',
      'info',
      { fullText: true, duration: 4500 }
    );
    const dest = role === 'admin' || role === 'rider'
      ? roleHome(role, sess.home)
      : resolveReturnPath();
    navigate(dest, { replace: true });
  }, [
    busy,
    orderId,
    releasePaymentHold,
    showNotification,
    role,
    sess.home,
    resolveReturnPath,
    navigate,
  ]);

  if (!checkoutUrl && !orderId) {
    return (
      <div className="paying-bridge">
        <div className="paying-bridge-loading">
          <i className="fas fa-spinner fa-spin" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const dialog = (
    <div className="dk-confirm-overlay paying-bridge-overlay" role="presentation">
      <div
        className="dk-confirm-modal dk-confirm-warning"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paying-bridge-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="paying-bridge-title" className="dk-confirm-title">
          Payment still in progress
        </h3>
        <p className="dk-confirm-message">
          You still have an open PayMongo payment. Leave and cancel it, or continue to finish paying?
          {'\n\n'}
          If you leave, the item unlocks for other customers right away.
        </p>
        <div className="dk-confirm-actions">
          <button
            type="button"
            className="dk-confirm-cancel"
            onClick={leavePayment}
            disabled={busy}
          >
            Leave payment
          </button>
          <button
            type="button"
            className="dk-confirm-proceed"
            onClick={continuePayment}
            disabled={busy}
            autoFocus
          >
            {busy ? 'Opening…' : 'Continue payment'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="paying-bridge">
      <div className="paying-bridge-backdrop" aria-hidden="true" />
      {createPortal(dialog, getOverlayRoot() || document.body)}
    </div>
  );
};

export default PayingBridge;
