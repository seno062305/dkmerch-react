import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './AdminOrders.css';

const AdminOrders = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // ✅ Convex real-time query
  const orders = useQuery(api.orders.getAllOrders) || [];
  const updateOrderStatusMutation = useMutation(api.orders.updateOrderStatus);
  const updateOrderFieldsMutation = useMutation(api.orders.updateOrderFields);
  const deleteOrderMutation = useMutation(api.orders.deleteOrder);

  const validOrders = orders.filter(o => o.orderId && o.items?.length > 0);

  const filteredOrders = validOrders.filter(order => {
    const matchesTab = activeTab === 'all' || order.orderStatus === activeTab;
    const matchesSearch = !searchTerm || [
      order.orderId, order.customerName, order.email
    ].some(f => f?.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  const getPendingCount = () => validOrders.filter(o => o.orderStatus === 'pending').length;

  const getStatusColor = (status) => {
    const colors = {
      pending: '#ffc107', confirmed: '#17a2b8', shipped: '#6366f1',
      out_for_delivery: '#f97316', completed: '#28a745', cancelled: '#dc3545',
    };
    return colors[status] || '#6c757d';
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: 'Pending', confirmed: 'Confirmed', shipped: 'Shipped',
      out_for_delivery: 'Out for Delivery', completed: 'Completed', cancelled: 'Cancelled',
    };
    return labels[status] || status || 'Pending';
  };

  const mapStatusToTrackingStatus = (adminStatus) => {
    const statusMap = {
      pending: 'Processing', confirmed: 'Confirmed', shipped: 'Shipped',
      out_for_delivery: 'Out for Delivery', completed: 'Delivered', cancelled: 'Cancelled',
    };
    return statusMap[adminStatus] || 'Processing';
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    await updateOrderStatusMutation({
      orderId,
      status: mapStatusToTrackingStatus(newStatus),
      orderStatus: newStatus,
    });
    // Update selectedOrder state if it's the one being changed
    if (selectedOrder?.orderId === orderId) {
      setSelectedOrder(prev => ({
        ...prev,
        orderStatus: newStatus,
        status: mapStatusToTrackingStatus(newStatus),
      }));
    }
  };

  const handleDelete = async (orderId) => {
    if (window.confirm('Are you sure you want to delete this order?')) {
      await deleteOrderMutation({ orderId });
      setSelectedOrder(null);
    }
  };

  const handleCancelWithReason = async (orderId, reason) => {
    await updateOrderFieldsMutation({
      orderId,
      fields: {
        cancelReason: reason,
        orderStatus: 'cancelled',
        status: 'Cancelled',
      },
    });
    if (selectedOrder?.orderId === orderId) {
      setSelectedOrder(prev => ({
        ...prev,
        orderStatus: 'cancelled',
        status: 'Cancelled',
        cancelReason: reason,
      }));
    }
  };

  return (
    <div className="admin-orders-page">
      {/* Tabs */}
      <div className="orders-tabs">
        {[
          { key: 'all', icon: 'fa-list', label: 'All Orders' },
          { key: 'pending', icon: 'fa-clock', label: `Pending${getPendingCount() > 0 ? ` (${getPendingCount()})` : ''}` },
          { key: 'confirmed', icon: 'fa-check-circle', label: 'Confirmed' },
          { key: 'shipped', icon: 'fa-box', label: 'Shipped' },
          { key: 'out_for_delivery', icon: 'fa-shipping-fast', label: 'Out for Delivery' },
          { key: 'completed', icon: 'fa-check-double', label: 'Completed' },
        ].map(t => (
          <button
            key={t.key}
            className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <i className={`fas ${t.icon}`}></i> {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="orders-filters">
        <div className="filter-group">
          <input
            type="text"
            className="search-input"
            placeholder="🔍 Search by Order ID, Customer Name, or Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="orders-container">
        {filteredOrders.length === 0 ? (
          <div className="empty-orders">
            <i className="fas fa-inbox"></i>
            <p>No orders found</p>
          </div>
        ) : (
          <div className="orders-table-container">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>ORDER ID</th>
                  <th>CUSTOMER</th>
                  <th>ITEMS</th>
                  <th>TOTAL</th>
                  <th>STATUS</th>
                  <th>RIDER</th>
                  <th>PROOF</th>
                  <th>DATE</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <tr key={order.orderId}>
                    <td><strong>#{order.orderId.slice(-8)}</strong></td>
                    <td>
                      <div className="customer-info">
                        <strong>{order.customerName || 'N/A'}</strong>
                        <small>{order.email || 'N/A'}</small>
                      </div>
                    </td>
                    <td>{order.items.length} item(s)</td>
                    <td><strong>₱{(order.total || 0).toLocaleString()}</strong></td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: getStatusColor(order.orderStatus) }}>
                        {getStatusLabel(order.orderStatus)}
                      </span>
                    </td>
                    <td>
                      {order.riderInfo ? (
                        <div style={{ fontSize: '12px' }}>
                          <strong>{order.riderInfo.name}</strong>
                          <div style={{ color: '#888' }}>{order.riderInfo.plate}</div>
                        </div>
                      ) : <span style={{ color: '#ccc', fontSize: '12px' }}>—</span>}
                    </td>
                    <td>
                      {order.deliveryProofPhoto ? (
                        <span className="proof-badge"><i className="fas fa-check-circle"></i> With Proof</span>
                      ) : <span style={{ color: '#ccc', fontSize: '12px' }}>—</span>}
                    </td>
                    <td>
                      {order._creationTime
                        ? new Date(order._creationTime).toLocaleDateString('en-PH')
                        : 'N/A'}
                    </td>
                    <td>
                      <button className="view-btn" onClick={() => setSelectedOrder(order)}>
                        <i className="fas fa-eye"></i> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedOrder && (
        <OrderModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateStatus={handleUpdateStatus}
          onCancelWithReason={handleCancelWithReason}
          onDelete={handleDelete}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
        />
      )}
    </div>
  );
};

// ─── BUTTON RULES ────────────────────────────────────────────────────────────
const getButtonRules = (currentStatus) => {
  const rules = {
    pending:          { confirm_order: true,  cancel: true,  complete: false, shipped: false, out_for_delivery: false },
    confirmed:        { confirm_order: false, cancel: true,  complete: false, shipped: false, out_for_delivery: false },
    shipped:          { confirm_order: false, cancel: true,  complete: false, shipped: false, out_for_delivery: false },
    out_for_delivery: { confirm_order: false, cancel: true,  complete: false, shipped: false, out_for_delivery: false },
    completed:        { confirm_order: false, cancel: false, complete: false, shipped: false, out_for_delivery: false },
    cancelled:        { confirm_order: false, cancel: false, complete: false, shipped: false, out_for_delivery: false },
  };
  return rules[currentStatus] || rules['pending'];
};

// ─── ORDER MODAL ─────────────────────────────────────────────────────────────
const OrderModal = ({ order, onClose, onUpdateStatus, onCancelWithReason, onDelete, getStatusColor, getStatusLabel }) => {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [proofExpanded, setProofExpanded] = useState(false);

  // Use live reviews from localStorage still (not yet migrated)
  const allReviews = JSON.parse(localStorage.getItem('product_reviews')) || [];
  const productIds = order.items?.map(item => item.id) || [];
  const productReviews = allReviews.filter(r => productIds.includes(r.productId));

  const subtotal = order.subtotal || 0;
  const shippingFee = order.shippingFee || 0;
  const total = order.total || (subtotal + shippingFee);

  const currentStatus = order.orderStatus || 'pending';
  const allowed = getButtonRules(currentStatus);
  const isDone = currentStatus === 'completed' || currentStatus === 'cancelled';

  const hasDeliveryProof = !!(order.deliveryProofPhoto);
  const otpVerified = !!(order.deliveryOtpVerified);

  const handleConfirmCancel = (reason) => {
    onCancelWithReason(order.orderId, reason);
    setShowCancelModal(false);
  };

  const allStatusButtons = [
    { key: 'pending',          targetStatus: 'pending',          icon: 'fa-clock',         label: 'Pending',          className: 'pending',      actionKey: null },
    { key: 'confirm',          targetStatus: 'confirmed',        icon: 'fa-check-circle',  label: 'Confirmed',        className: 'confirmed',    actionKey: 'confirm_order' },
    { key: 'complete',         targetStatus: 'completed',        icon: 'fa-check-double',  label: 'Completed',        className: 'completed',    actionKey: 'complete' },
    { key: 'cancel',           targetStatus: 'cancelled',        icon: 'fa-times-circle',  label: 'Cancelled',        className: 'cancelled',    actionKey: 'cancel' },
    { key: 'shipped',          targetStatus: 'shipped',          icon: 'fa-box',           label: 'Shipped',          className: 'shipped',      actionKey: 'shipped',          riderManaged: true },
    { key: 'out_for_delivery', targetStatus: 'out_for_delivery', icon: 'fa-shipping-fast', label: 'Out for Delivery', className: 'out-delivery', actionKey: 'out_for_delivery', riderManaged: true },
  ];

  const getBlockReason = (btn) => {
    if (btn.riderManaged) return 'Auto via rider';
    if (currentStatus === btn.targetStatus) return 'Current status';
    if (isDone) return currentStatus === 'completed' ? 'Order completed' : 'Order cancelled';
    if (!allowed[btn.actionKey]) return 'Not available';
    return null;
  };

  return (
    <div className="order-modal-overlay" onClick={onClose}>
      <div className="order-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Order #{order.orderId?.slice(-8) || 'N/A'}</h2>
            <span className="status-badge" style={{ backgroundColor: getStatusColor(order.orderStatus) }}>
              {getStatusLabel(order.orderStatus)}
            </span>
          </div>
          <button className="close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>

        <div className="modal-body">

          {/* Customer Info */}
          <div className="modal-section">
            <h3><i className="fas fa-user"></i> Customer Information</h3>
            <div className="order-info-grid">
              <div className="info-item"><label>Full Name</label><strong>{order.customerName || 'N/A'}</strong></div>
              <div className="info-item"><label>Email Address</label><span>{order.email || 'N/A'}</span></div>
              <div className="info-item"><label>Phone Number</label><span>{order.phone || 'N/A'}</span></div>
              <div className="info-item"><label>Delivery Address</label><span>{order.shippingAddress || 'N/A'}</span></div>
            </div>
          </div>

          {/* Rider Info */}
          {order.riderInfo && (
            <div className="modal-section">
              <h3><i className="fas fa-motorcycle"></i> Assigned Rider</h3>
              <div className="order-info-grid rider-info-grid">
                <div className="info-item"><label>Rider Name</label><strong>{order.riderInfo.name || 'N/A'}</strong></div>
                <div className="info-item"><label>Phone</label><span>{order.riderInfo.phone || 'N/A'}</span></div>
                <div className="info-item"><label>Vehicle Type</label><span style={{ textTransform: 'capitalize' }}>{order.riderInfo.vehicle || 'N/A'}</span></div>
                <div className="info-item"><label>Plate Number</label><span>{order.riderInfo.plate || 'N/A'}</span></div>
              </div>
            </div>
          )}

          {/* Proof of Delivery */}
          {(hasDeliveryProof || otpVerified) && (
            <div className="modal-section">
              <h3><i className="fas fa-shield-alt"></i> Proof of Delivery</h3>
              <div className="pod-card">
                <div className={`pod-otp-row ${otpVerified ? 'verified' : 'unverified'}`}>
                  <div className="pod-otp-icon"><i className={`fas ${otpVerified ? 'fa-check-circle' : 'fa-times-circle'}`}></i></div>
                  <div className="pod-otp-text">
                    <strong>OTP Verification</strong>
                    <span>{otpVerified ? 'Customer OTP was verified by rider ✅' : 'OTP not verified'}</span>
                  </div>
                  {otpVerified && <span className="pod-otp-badge">Verified</span>}
                </div>
                {order.deliveryConfirmedAt && (
                  <div className="pod-timestamp">
                    <i className="fas fa-clock"></i>
                    <span>Confirmed on {new Date(order.deliveryConfirmedAt).toLocaleString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
                {hasDeliveryProof && (
                  <div className="pod-photo-section">
                    <div className="pod-photo-header" onClick={() => setProofExpanded(!proofExpanded)}>
                      <div className="pod-photo-label"><i className="fas fa-camera"></i><strong>Delivery Photo</strong></div>
                      <button className="pod-toggle-btn">
                        <i className={`fas ${proofExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                        {proofExpanded ? 'Hide' : 'Show'} Photo
                      </button>
                    </div>
                    {proofExpanded && (
                      <div className="pod-photo-wrap">
                        <img src={order.deliveryProofPhoto} alt="Proof of delivery" className="pod-photo" />
                        <a href={order.deliveryProofPhoto} download={`proof-${order.orderId?.slice(-8)}.jpg`} className="pod-download-btn">
                          <i className="fas fa-download"></i> Download Photo
                        </a>
                      </div>
                    )}
                  </div>
                )}
                {!hasDeliveryProof && otpVerified && (
                  <div className="pod-timestamp">
                    <i className="fas fa-image"></i>
                    <span style={{ color: '#94a3b8' }}>No photo proof uploaded (optional)</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Order Info */}
          <div className="modal-section">
            <h3><i className="fas fa-info-circle"></i> Order Information</h3>
            <div className="order-info-grid">
              <div className="info-item"><label>Order ID</label><strong>#{order.orderId || 'N/A'}</strong></div>
              <div className="info-item"><label>Order Date</label><span>{order._creationTime ? new Date(order._creationTime).toLocaleString('en-PH') : 'N/A'}</span></div>
              <div className="info-item"><label>Payment Method</label><span>{order.paymentMethod || 'N/A'}</span></div>
              <div className="info-item"><label>Order Status</label><span className="status-badge" style={{ backgroundColor: getStatusColor(order.orderStatus) }}>{getStatusLabel(order.orderStatus)}</span></div>
            </div>
          </div>

          {/* Order Items */}
          <div className="modal-section">
            <h3><i className="fas fa-box"></i> Order Items ({order.items?.length || 0})</h3>
            <div className="order-items-list">
              {order.items?.length > 0 ? (
                order.items.map((item, index) => (
                  <div key={index} className="order-item-card">
                    <div className="item-image">
                      <img src={item.image} alt={item.name || 'Product'} onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/80x80?text=No+Image'; }} />
                    </div>
                    <div className="item-details">
                      <strong>{item.name || 'N/A'}</strong>
                      <p className="item-price">₱{(item.price || 0).toLocaleString()} × {item.quantity || 0} pc(s)</p>
                    </div>
                    <div className="item-subtotal">₱{((item.quantity || 0) * (item.price || 0)).toLocaleString()}</div>
                  </div>
                ))
              ) : <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>No items found</p>}
            </div>
          </div>

          {/* Product Reviews */}
          {productReviews.length > 0 && (
            <div className="modal-section">
              <h3><i className="fas fa-star"></i> Product Reviews ({productReviews.length})</h3>
              <div className="reviews-list">
                {productReviews.map((review) => (
                  <div key={review.id} className="review-card">
                    <div className="review-card-header">
                      <div className="review-product-info">
                        <img src={review.productImage} alt={review.productName} className="review-product-image" onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/50x50?text=No+Image'; }} />
                        <div>
                          <strong className="review-product-name">{review.productName}</strong>
                          <div className="review-stars">{[1,2,3,4,5].map(star => <i key={star} className={`fas fa-star ${star <= review.rating ? 'filled' : ''}`}></i>)}</div>
                        </div>
                      </div>
                      <span className="review-date">{new Date(review.createdAt).toLocaleDateString('en-PH')}</span>
                    </div>
                    <div className="review-card-body">
                      <p className="review-text">{review.review}</p>
                      <div className="review-customer"><i className="fas fa-user-circle"></i><span>{review.userName}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="modal-section">
            <h3><i className="fas fa-calculator"></i> Order Summary</h3>
            <div className="order-totals">
              <div className="total-row"><span>Subtotal ({order.items?.length || 0} items):</span><strong>₱{subtotal.toLocaleString()}</strong></div>
              <div className="total-row"><span>Shipping Fee:</span><strong>₱{shippingFee.toLocaleString()}</strong></div>
              <div className="total-row grand-total"><span>Total Amount:</span><strong>₱{total.toLocaleString()}</strong></div>
            </div>
          </div>

          {/* Status Management */}
          <div className="modal-section">
            <h3><i className="fas fa-tasks"></i> Update Order Status</h3>
            {isDone && (
              <div className={`status-done-notice ${currentStatus}`}>
                <i className={`fas ${currentStatus === 'completed' ? 'fa-check-circle' : 'fa-ban'}`}></i>
                <span>{currentStatus === 'completed' ? 'This order has been completed. No further actions available.' : 'This order has been cancelled. No further actions available.'}</span>
              </div>
            )}
            {(currentStatus === 'shipped' || currentStatus === 'out_for_delivery') && (
              <div className="rider-managed-notice">
                <i className="fas fa-motorcycle"></i>
                <div>
                  <strong>Rider-managed status</strong>
                  <p>{currentStatus === 'out_for_delivery' ? 'Rider is on the way! The order will be automatically marked as Completed once the rider confirms delivery via OTP with the customer.' : 'This order is Shipped and is handled by the assigned rider. You may still Cancel if needed.'}</p>
                </div>
              </div>
            )}
            <div className="status-buttons">
              {allStatusButtons.map((btn) => {
                const isCurrent = currentStatus === btn.targetStatus;
                const blockReason = getBlockReason(btn);
                const isClickable = !blockReason && btn.actionKey;
                const handleClick = () => {
                  if (!isClickable) return;
                  if (btn.targetStatus === 'cancelled') setShowCancelModal(true);
                  else onUpdateStatus(order.orderId, btn.targetStatus);
                };
                return (
                  <div key={btn.key} className="status-btn-wrapper">
                    <button
                      className={`status-btn ${btn.className} ${isCurrent ? 'is-current' : ''} ${!isClickable ? 'is-blocked' : ''}`}
                      onClick={handleClick}
                      disabled={!isClickable}
                      title={blockReason || `Set to ${btn.label}`}
                    >
                      <i className={`fas ${btn.icon}`}></i>
                      <span>{btn.label}</span>
                      {btn.riderManaged && <span className="rider-badge-sm">🛵 via rider</span>}
                      {isCurrent && <span className="current-indicator">✓ Current</span>}
                    </button>
                    {blockReason && !isCurrent && (
                      <div className="block-reason"><i className="fas fa-lock"></i> {blockReason}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cancellation Reason */}
          {currentStatus === 'cancelled' && order.cancelReason && (
            <div className="modal-section">
              <h3><i className="fas fa-ban"></i> Cancellation Reason</h3>
              <div className="cancel-reason-display">
                <i className="fas fa-quote-left"></i>
                <p>{order.cancelReason}</p>
              </div>
            </div>
          )}

          {/* Delete */}
          <div className="modal-actions">
            <button className="delete-order-btn" onClick={() => onDelete(order.orderId)}>
              <i className="fas fa-trash"></i> Delete Order
            </button>
          </div>
        </div>
      </div>

      {showCancelModal && (
        <CancelReasonModal
          order={order}
          onConfirm={handleConfirmCancel}
          onClose={() => setShowCancelModal(false)}
        />
      )}
    </div>
  );
};

// ─── CANCEL REASON MODAL ──────────────────────────────────────────────────────
const CANCEL_PRESETS = [
  'Item is out of stock', 'Customer requested cancellation', 'Duplicate order',
  'Payment issue / not verified', 'Rider unavailable in the area',
  'Incorrect order details', 'Fraudulent order detected', 'Other reason',
];

const CancelReasonModal = ({ order, onConfirm, onClose }) => {
  const [selectedPreset, setSelectedPreset] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [error, setError] = useState('');

  const isOther = selectedPreset === 'Other reason';
  const finalReason = isOther ? customReason.trim() : selectedPreset;

  const handleConfirm = () => {
    if (!finalReason) { setError('Please select or enter a cancellation reason.'); return; }
    onConfirm(finalReason);
  };

  return (
    <div className="cancel-reason-overlay" onClick={onClose}>
      <div className="cancel-reason-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cancel-reason-header">
          <div className="cancel-reason-icon"><i className="fas fa-ban"></i></div>
          <div><h3>Cancel Order</h3><p>Order #{order.orderId?.slice(-8)}</p></div>
          <button className="close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="cancel-reason-body">
          <p className="cancel-reason-prompt">Please select or enter a reason for cancelling this order. This will be recorded and visible in the order details.</p>
          <div className="cancel-presets">
            {CANCEL_PRESETS.map((preset) => (
              <button
                key={preset}
                className={`cancel-preset-chip ${selectedPreset === preset ? 'active' : ''}`}
                onClick={() => { setSelectedPreset(preset); setError(''); if (preset !== 'Other reason') setCustomReason(''); }}
              >
                {selectedPreset === preset && <i className="fas fa-check"></i>} {preset}
              </button>
            ))}
          </div>
          {isOther && (
            <div className="cancel-custom-wrap">
              <label>Specify your reason <span className="required">*</span></label>
              <textarea
                className="cancel-custom-input"
                placeholder="Type the cancellation reason here..."
                value={customReason}
                onChange={(e) => { setCustomReason(e.target.value); setError(''); }}
                rows={3} maxLength={300} autoFocus
              />
              <div className="char-count">{customReason.length}/300</div>
            </div>
          )}
          {error && <div className="cancel-error"><i className="fas fa-exclamation-circle"></i> {error}</div>}
        </div>
        <div className="cancel-reason-footer">
          <button className="cancel-go-back-btn" onClick={onClose}><i className="fas fa-arrow-left"></i> Go Back</button>
          <button className="cancel-confirm-btn" onClick={handleConfirm} disabled={!finalReason}>
            <i className="fas fa-ban"></i> Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminOrders;