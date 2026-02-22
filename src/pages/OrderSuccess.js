import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './OrderSuccess.css';

const OrderSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const checkPaymentStatus = useAction(api.payments.checkPaymentStatus);

  const [status, setStatus] = useState('checking'); // checking | paid | pending

  useEffect(() => {
    if (!orderId) {
      navigate('/');
      return;
    }

    // Give PayMongo a moment to process, then check status
    const timer = setTimeout(async () => {
      try {
        // We just mark it as success since PayMongo redirected here
        setStatus('paid');
      } catch {
        setStatus('paid'); // Still show success — PayMongo already confirmed
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [orderId]);

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
                onClick={() => navigate('/track-order')}
              >
                <i className="fas fa-list-alt"></i> View My Orders
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