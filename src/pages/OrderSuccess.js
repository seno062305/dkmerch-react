import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useClearCart, useRemoveFromCartById } from '../context/cartUtils';
import { clearPaySessionAll } from '../utils/paymentLeaveGuard';
import './OrderSuccess.css';

const CHECKOUT_CLEAR_KEY = 'dk_checkout_clear_cart';
const CHECKOUT_SEL_KEY = 'dk_checkout_selected';
const CHECKOUT_BUYNOW_KEY = 'dk_checkout_buynow';

const homeForRole = (role) => {
  if (role === 'admin') return '/admin';
  if (role === 'rider') return '/rider';
  return '/';
};

const OrderSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const { role, isReady } = useAuth();
  const checkPaymentStatus = useAction(api.payments.checkPaymentStatus);
  const releasePaymentHold = useMutation(api.payments.releasePaymentHold);
  const clearCart = useClearCart();
  const removeFromCartById = useRemoveFromCartById();
  const cartClearedRef = useRef(false);

  // checking | paid | unpaid — never treat "redirect only" as paid
  const [status, setStatus] = useState('checking');

  const clearCheckoutCartIfNeeded = useCallback(async () => {
    if (cartClearedRef.current) return;
    cartClearedRef.current = true;
    let payload = null;
    try {
      payload = JSON.parse(sessionStorage.getItem(CHECKOUT_CLEAR_KEY) || 'null');
    } catch { /* ignore */ }
    try {
      sessionStorage.removeItem(CHECKOUT_CLEAR_KEY);
      sessionStorage.removeItem(CHECKOUT_SEL_KEY);
      sessionStorage.removeItem(CHECKOUT_BUYNOW_KEY);
      sessionStorage.removeItem('dk_checkout_pending_order');
      if (payload?.selKey) sessionStorage.removeItem(payload.selKey);
      if (payload?.buyNowKey) sessionStorage.removeItem(payload.buyNowKey);
    } catch { /* ignore */ }

    if (!payload) return;
    // Only clear if this success page matches the checkout that stored the intent
    if (payload.orderId && orderId && String(payload.orderId) !== String(orderId)) return;

    try {
      if (Array.isArray(payload.ids) && payload.ids.length) {
        for (const id of payload.ids) {
          try { await removeFromCartById(id); } catch { /* non-critical */ }
        }
      } else if (payload.clearAll) {
        await clearCart();
      }
    } catch { /* non-critical */ }
  }, [clearCart, orderId, removeFromCartById]);

  const order = useQuery(
    api.orders.getOrderById,
    orderId ? { orderId } : 'skip'
  );

  const resolveHome = useCallback(() => {
    try {
      const stored = sessionStorage.getItem('dk_post_payment_home');
      if (stored === '/admin' || stored === '/rider' || stored === '/') return stored;
    } catch { /* ignore */ }
    return homeForRole(role);
  }, [role]);

  const goPayerHome = useCallback(() => {
    const home = resolveHome();
    clearPaySessionAll();
    navigate(home, { replace: true });
  }, [navigate, resolveHome]);

  useEffect(() => {
    if (!orderId) {
      navigate(resolveHome(), { replace: true });
    }
  }, [orderId, navigate, resolveHome]);

  useEffect(() => {
    if (order === undefined) return; // still loading
    if (!orderId) return;

    // Already paid in DB (PayMongo confirmed earlier)
    if (order?.paymentStatus === 'paid') {
      clearCheckoutCartIfNeeded();
      if (isReady && (role === 'admin' || role === 'rider')) {
        goPayerHome();
        return;
      }
      setStatus('paid');
      return;
    }

    // Poll PayMongo — only mark paid when API confirms a successful payment
    let cancelled = false;
    const verifyWithRetry = async () => {
      const delays = [1500, 2000, 2500, 3000, 3000, 3000]; // ~15s
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (cancelled) return;
        await new Promise((res) => setTimeout(res, delays[attempt]));
        if (cancelled) return;
        try {
          const result = await checkPaymentStatus({ orderId });

          if (result?.status === 'paid') {
            await clearCheckoutCartIfNeeded();
            if (isReady && (role === 'admin' || role === 'rider')) {
              goPayerHome();
              return;
            }
            setStatus('paid');
            return;
          }
        } catch (err) {
          console.warn(`Payment verification attempt ${attempt + 1} failed:`, err);
        }
      }

      // Still not paid after retries — release hold so others can pay (user backed out)
      if (cancelled) return;
      try { await releasePaymentHold({ orderId }); } catch { /* ignore */ }
      clearPaySessionAll();
      if (isReady && (role === 'admin' || role === 'rider')) {
        goPayerHome();
        return;
      }
      setStatus('unpaid');
    };

    verifyWithRetry();
    return () => { cancelled = true; };
  }, [order, orderId, role, isReady, checkPaymentStatus, goPayerHome, releasePaymentHold, clearCheckoutCartIfNeeded]);

  useEffect(() => {
    if (!isReady || !orderId) return;
    if (role !== 'admin' && role !== 'rider') return;
    const t = setTimeout(() => {
      if (role === 'admin' || role === 'rider') goPayerHome();
    }, 4500);
    return () => clearTimeout(t);
  }, [isReady, role, orderId, goPayerHome]);

  const isStaff = role === 'admin' || role === 'rider';

  return (
    <div className="order-success-page">
      <div className="order-success-container">

        {status === 'checking' || isStaff ? (
          <div className="success-checking">
            <i className="fas fa-spinner fa-spin"></i>
            <p>
              {isStaff
                ? 'Checking payment — returning to your dashboard…'
                : 'Confirming your payment with PayMongo...'}
            </p>
          </div>
        ) : status === 'unpaid' ? (
          <>
            <div className="success-icon-wrap">
              <div className="success-icon success-icon--pending">
                <i className="fas fa-clock"></i>
              </div>
            </div>

            <h1 className="success-title">Payment not completed</h1>
            <p className="success-subtitle">
              We didn’t receive a confirmed payment from PayMongo yet.
              If you closed or went back before finishing GCash/Maya, your order is still unpaid.
            </p>

            {orderId && (
              <div className="success-order-id">
                <span className="order-id-label">Order ID</span>
                <span className="order-id-value">{orderId}</span>
              </div>
            )}

            <div className="success-actions">
              <button
                className="btn-track-order"
                onClick={() => navigate(`/track-order?orderId=${encodeURIComponent(orderId)}`)}
              >
                <i className="fas fa-credit-card"></i> Continue / Pay Now
              </button>
              <button
                className="btn-back-home"
                onClick={goPayerHome}
              >
                <i className="fas fa-home"></i> Back to Home
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="success-icon-wrap">
              <div className="success-icon">
                <i className="fas fa-check"></i>
              </div>
            </div>

            <h1 className="success-title">Payment Successful! 🎉</h1>
            <p className="success-subtitle">
              Salamat sa iyong order! Your payment has been received and your order is now being processed.
            </p>

            {orderId && (
              <div className="success-order-id">
                <span className="order-id-label">Order ID</span>
                <span className="order-id-value">{orderId}</span>
              </div>
            )}

            <div className="success-steps">
              <div className="success-step">
                <div className="step-icon"><i className="fas fa-envelope"></i></div>
                <div className="step-text">
                  <strong>Check your email</strong>
                  <p>Order confirmation has been sent to your email.</p>
                </div>
              </div>
              <div className="success-step">
                <div className="step-icon"><i className="fas fa-box"></i></div>
                <div className="step-text">
                  <strong>Processing your order</strong>
                  <p>We're preparing your K-Pop merch for shipment.</p>
                </div>
              </div>
              <div className="success-step">
                <div className="step-icon"><i className="fas fa-truck"></i></div>
                <div className="step-text">
                  <strong>Track your order</strong>
                  <p>You can track your order status anytime.</p>
                </div>
              </div>
            </div>

            <div className="success-actions">
              <button
                className="btn-track-order"
                onClick={() => navigate(`/track-order?orderId=${encodeURIComponent(orderId)}`)}
              >
                <i className="fas fa-list-alt"></i> Track My Order
              </button>
              <button
                className="btn-back-home"
                onClick={goPayerHome}
              >
                <i className="fas fa-home"></i> Back to Home
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderSuccess;
