import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import {
  clearPaySessionAll,
  readPaySession,
  roleHome,
  PAY_RETURN_KEY,
} from '../utils/paymentLeaveGuard';
import { forceUnlockBodyScroll } from '../utils/scrollLock';
import './PayingBridge.css';

/**
 * History trap: Back from PayMongo lands here, then we immediately return
 * the user to PayMongo (cannot overlay UI on checkout.paymongo.com).
 *
 * Leave payment = PayMongo "Cancel" / Back to merchant (cancelUrl), not browser Back.
 */
const PayingBridge = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role } = useAuth();
  const releasePaymentHold = useMutation(api.payments.releasePaymentHold);
  const bouncedRef = useRef(false);

  const sess = readPaySession();
  const orderId =
    String(searchParams.get('orderId') || sess.orderId || '').trim();
  const checkoutUrl = String(sess.checkoutUrl || '').trim();

  const returnPath = (() => {
    try {
      const stored = sessionStorage.getItem(PAY_RETURN_KEY);
      if (stored && stored.startsWith('/')) return stored;
    } catch { /* ignore */ }
    if (orderId) return `/track-order?order=${encodeURIComponent(orderId)}`;
    return roleHome(role, sess.home);
  })();

  // Bounce back to PayMongo before paint when possible (no black confirm page)
  useLayoutEffect(() => {
    if (bouncedRef.current) return;
    if (!checkoutUrl) return;

    bouncedRef.current = true;

    // Browser Back left a forward entry to PayMongo — use it so we stay on payment
    try {
      const nav = performance.getEntriesByType?.('navigation')?.[0];
      const viaBack = nav?.type === 'back_forward' || (window.performance?.navigation?.type === 2);
      if (viaBack) {
        window.history.forward();
        // If forward did nothing (no entry), fall through to assign shortly
        window.setTimeout(() => {
          if (document.visibilityState === 'visible' && !document.hidden) {
            const stillHere = window.location.pathname.startsWith('/paying');
            if (stillHere) window.location.assign(checkoutUrl);
          }
        }, 120);
        return;
      }
    } catch { /* ignore */ }

    window.location.assign(checkoutUrl);
  }, [checkoutUrl]);

  // No PayMongo URL — release hold and leave the bridge
  useEffect(() => {
    if (checkoutUrl) return undefined;

    let cancelled = false;
    (async () => {
      if (orderId) {
        try { await releasePaymentHold({ orderId }); } catch { /* ignore */ }
      }
      if (cancelled) return;
      clearPaySessionAll();
      forceUnlockBodyScroll();
      navigate(returnPath, { replace: true });
    })();

    return () => { cancelled = true; };
  }, [checkoutUrl, orderId, releasePaymentHold, navigate, returnPath]);

  return (
    <div className="paying-bridge paying-bridge--bounce">
      <div className="paying-bridge-card">
        <i className="fas fa-spinner fa-spin" aria-hidden="true" />
        <p>Returning to PayMongo…</p>
        <p className="paying-bridge-hint">Finish payment there, or use Cancel on PayMongo to leave.</p>
      </div>
    </div>
  );
};

export default PayingBridge;
