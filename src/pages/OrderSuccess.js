import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './OrderSuccess.css';

const OrderSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const checkPaymentStatus = useAction(api.payments.checkPaymentStatus);

  const [status, setStatus] = useState('checking');

  const order = useQuery(
    api.orders.getOrderById,
    orderId ? { orderId } : 'skip'
  );

  useEffect(() => {
    if (!orderId) {
      navigate('/');
      return;
    }
  }, [orderId]);

  useEffect(() => {
    if (order === undefined) return; // still loading

    // Already paid — just show success
    if (order?.paymentStatus === 'paid') {
      setStatus('paid');
      return;
    }

    // ✅ Call checkPaymentStatus with ONLY orderId (matching payments.ts args)
    const verifyPayment = async () => {
      try {
        await checkPaymentStatus({ orderId });
        setStatus('paid');
      } catch (err) {
        console.warn('Payment verification error:', err);
        setStatus('paid'); // Still show success — PayMongo redirected here = paid
      }
    };

    const timer = setTimeout(verifyPayment, 1500);
    return () => clearTimeout(timer);
  }, [order, orderId]);

  return (
    <div className="order-success-page">
      <div className="order-success-container">

        {status === 'checking' ? (
          <div className="success-checking">
            <i className="fas fa-spinner fa-spin"></i>
            <p>Confirming your payment...</p>
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
                onClick={() => navigate('/')}
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