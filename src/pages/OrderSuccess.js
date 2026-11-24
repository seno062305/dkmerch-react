import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import OversellChoiceCard from '../components/OversellChoiceCard';
import './OrderSuccess.css';

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

  // checking | paid | unpaid — never treat "redirect only" as paid
  const [status, setStatus] = useState('checking');

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
    try {
      sessionStorage.removeItem('dk_post_payment_home');
      sessionStorage.removeItem('dk_post_payment_order');
      sessionStorage.removeItem('dk_post_payment_role');
    } catch { /* ignore */ }
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

      // Still not paid after retries — do NOT fake success
      if (cancelled) return;
      if (isReady && (role === 'admin' || role === 'rider')) {
        goPayerHome();
        return;
      }
      setStatus('unpaid');
    };

    verifyWithRetry();
    return () => { cancelled = true; };
  }, [order, orderId, role, isReady, checkPaymentStatus, goPayerHome]);

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
              <div className={`success-icon ${order?.oversellStatus === 'choice_needed' || order?.oversellStatus === 'reserved' ? 'success-icon--pending' : ''}`}>
                <i className={`fas ${order?.oversellStatus === 'choice_needed' ? 'fa-exclamation' : order?.oversellStatus === 'reserved' ? 'fa-bookmark' : 'fa-check'}`}></i>
              </div>
            </div>

            <h1 className="success-title">
              {order?.oversellStatus === 'choice_needed'
                ? 'Payment received — stock issue'
                : order?.oversellStatus === 'reserved'
                  ? 'Payment received — reserved'
                  : 'Payment Successful! 🎉'}
            </h1>
            <p className="success-subtitle">
              {order?.oversellStatus === 'choice_needed'
                ? 'Your payment went through, but the last stock was taken by another buyer. Choose a refund or reserve the next restock below.'
                : order?.oversellStatus === 'reserved'
                  ? `You’re locked in for the next restock (about ${order.restockEtaLabel || '2–3 weeks'}).`
                  : 'Salamat sa iyong order! Your payment has been received and your order is now being processed.'}
            </p>

            {orderId && (
              <div className="success-order-id">
                <span className="order-id-label">Order ID</span>
                <span className="order-id-value">{orderId}</span>
              </div>
            )}

            {(order?.oversellStatus === 'choice_needed' || order?.oversellStatus === 'reserved') && (
              <OversellChoiceCard order={order} />
            )}

            {!(order?.oversellStatus === 'choice_needed' || order?.oversellStatus === 'reserved') && (
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
            )}

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
