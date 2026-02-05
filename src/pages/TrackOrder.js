import React, { useState } from 'react';
import './TrackOrder.css';

const TrackOrder = () => {
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [trackingResult, setTrackingResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTrackOrder = (e) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      setTrackingResult({
        orderNumber: orderNumber,
        status: 'In Transit',
        estimatedDelivery: 'February 10, 2026',
        timeline: [
          { status: 'Order Placed', date: 'Feb 1, 2026', completed: true },
          { status: 'Payment Confirmed', date: 'Feb 1, 2026', completed: true },
          { status: 'Processing', date: 'Feb 2, 2026', completed: true },
          { status: 'Shipped', date: 'Feb 3, 2026', completed: true },
          { status: 'In Transit', date: 'Feb 4, 2026', completed: true },
          { status: 'Out for Delivery', date: 'Feb 10, 2026', completed: false },
          { status: 'Delivered', date: 'Feb 10, 2026', completed: false }
        ],
        items: [
          { name: "BTS 'Proof' Album Set", quantity: 1, price: 3599 },
          { name: "BTS Jimin Photocard Set", quantity: 2, price: 1798 }
        ]
      });
      setIsLoading(false);
    }, 1500);
  };

  return (
    <main>
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">Track Your Order</h1>
          <p className="page-description">Enter your order details to track your shipment</p>
        </div>
      </div>

      <div className="container">
        <section className="track-order-page">
          <div className="tracking-form-section">
            <form className="tracking-form" onSubmit={handleTrackOrder}>
              <div className="form-group">
                <label htmlFor="orderNumber">Order Number</label>
                <input
                  type="text"
                  id="orderNumber"
                  className="form-control"
                  placeholder="e.g., DK-2026-001234"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  required
                />
                <small>You can find this in your order confirmation email</small>
              </div>

              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  className="form-control"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> Tracking...
                  </>
                ) : (
                  <>
                    <i className="fas fa-search"></i> Track Order
                  </>
                )}
              </button>
            </form>

            <div className="tracking-info">
              <h3>Having trouble tracking?</h3>
              <ul>
                <li><i className="fas fa-check-circle"></i> Make sure your order number is correct</li>
                <li><i className="fas fa-check-circle"></i> Use the email address from your order</li>
                <li><i className="fas fa-check-circle"></i> Wait 24 hours after ordering for tracking to activate</li>
              </ul>
            </div>
          </div>

          {trackingResult && (
            <div className="tracking-result">
              <div className="result-header">
                <h2>Order #{trackingResult.orderNumber}</h2>
                <div className={`status-badge ${trackingResult.status.toLowerCase().replace(' ', '-')}`}>
                  {trackingResult.status}
                </div>
              </div>

              <div className="delivery-estimate">
                <i className="fas fa-truck"></i>
                <div>
                  <strong>Estimated Delivery:</strong>
                  <p>{trackingResult.estimatedDelivery}</p>
                </div>
              </div>

              <div className="tracking-timeline">
                <h3>Tracking Timeline</h3>
                <div className="timeline">
                  {trackingResult.timeline.map((step, index) => (
                    <div key={index} className={`timeline-item ${step.completed ? 'completed' : 'pending'}`}>
                      <div className="timeline-marker">
                        {step.completed ? (
                          <i className="fas fa-check"></i>
                        ) : (
                          <i className="fas fa-circle"></i>
                        )}
                      </div>
                      <div className="timeline-content">
                        <h4>{step.status}</h4>
                        <p>{step.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="order-items">
                <h3>Items in this order</h3>
                {trackingResult.items.map((item, index) => (
                  <div key={index} className="order-item">
                    <div className="item-details">
                      <strong>{item.name}</strong>
                      <span>Qty: {item.quantity}</span>
                    </div>
                    <div className="item-price">₱{item.price.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default TrackOrder;