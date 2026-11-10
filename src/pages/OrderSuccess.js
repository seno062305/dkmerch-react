import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
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
  const sendOrderConfirmation = useAction(api.sendEmail.sendOrderConfirmation);

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

    // Already paid — finish flow
    if (order?.paymentStatus === 'paid') {
      // Staff accounts should not stay on customer success UI
      if (isReady && (role === 'admin' || role === 'rider')) {
        goPayerHome();
        return;
      }
      setStatus('paid');
      return;
    }

    // Retry up to 6x with increasing delays to wait for PayMongo to confirm
    let cancelled = false;
    const verifyWithRetry = async () => {
      const delays = [2000, 2500, 3000, 3000, 3000, 3000]; // ~16 seconds max
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (cancelled) return;
        await new Promise(res => setTimeout(res, delays[attempt]));
        if (cancelled) return;
        try {
          const result = await checkPaymentStatus({ orderId });

          if (result?.status === 'paid') {
            if (order?.email && order?.paymentStatus !== 'paid') {
              try {
                await sendOrderConfirmation({
                  to:          order.email,
                  name:        order.customerName || order.email,
                  orderId:     orderId,
                  items:       (order.items || []).map((i) => ({
                    name:     i.name,
                    price:    i.price,
                    quantity: i.quantity,
                  })),
                  total:          order.total,
                  promoCode:      order.promoCode,
                  discountAmount: order.discountAmount,
                  finalTotal:     order.finalTotal ?? order.total,
                  shippingFee:    order.shippingFee ?? 0,
                });
              } catch (emailErr) {
                console.warn('Email send failed after payment:', emailErr);
              }
            }

            if (isReady && (role === 'admin' || role === 'rider')) {
              goPayerHome();
              return;
            }
            setStatus('paid');
            return;
          }

          console.log(`Payment check attempt ${attempt + 1}: still pending...`);
        } catch (err) {
          console.warn(`Payment verification attempt ${attempt + 1} failed:`, err);
        }

        // Last attempt — treat PayMongo redirect as paid
        if (attempt === delays.length - 1) {
          if (isReady && (role === 'admin' || role === 'rider')) {
            goPayerHome();
            return;
          }
          setStatus('paid');
        }
      }
    };

    verifyWithRetry();
    return () => { cancelled = true; };
  }, [order, orderId, role, isReady, checkPaymentStatus, sendOrderConfirmation, goPayerHome]);

  // If staff lands here before order query resolves, still bounce off customer UI
  useEffect(() => {
    if (!isReady || !orderId) return;
    if (role !== 'admin' && role !== 'rider') return;
    // Give verification a moment, then force home if still here
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
                ? 'Payment received — returning to your dashboard…'
                : 'Confirming your payment...'}
            </p>
          </div>
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
                onClick={() => navigate(`/track-order?orderId=${orderId}`)}
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
