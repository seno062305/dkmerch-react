import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './AdminOrders.css';

const AdminOrders = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const orders = useQuery(api.orders.getAllOrders) || [];
  const updateOrderStatusMutation = useMutation(api.orders.updateOrderStatus);
  const updateOrderFieldsMutation = useMutation(api.orders.updateOrderFields);
  const deleteOrderMutation = useMutation(api.orders.deleteOrder);

  const validOrders = orders.filter(o => o.orderId && o.items?.length > 0);

  const tabCounts = {
    paid: validOrders.filter(o =>
      o.paymentStatus === 'paid' &&
      (!o.orderStatus || o.orderStatus === 'pending')
    ).length,
    pending: validOrders.filter(o => o.orderStatus === 'pending').length,
  };

  const filteredOrders = validOrders.filter(order => {
    let matchesTab = true;
    if (activeTab === 'paid') {
      matchesTab =
        order.paymentStatus === 'paid' &&
        (!order.orderStatus || order.orderStatus === 'pending');
    } else if (activeTab !== 'all') {
      matchesTab = order.orderStatus === activeTab;
    }
    const matchesSearch =
      !searchTerm ||
      [order.orderId, order.customerName, order.email].some(f =>
        f?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    return matchesTab && matchesSearch;
  });

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

  const handleUpdateStatus = async (orderId, newOrderStatus) => {
    try {
      await updateOrderStatusMutation({
        orderId,
        status: mapStatusToTrackingStatus(newOrderStatus),
        orderStatus: newOrderStatus,
      });
      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder(prev => ({
          ...prev,
          orderStatus: newOrderStatus,
          status: mapStatusToTrackingStatus(newOrderStatus),
        }));
      }
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Failed to update order status. Please try again.');
    }
  };

  const handleDelete = async (orderId) => {
    if (window.confirm('Are you sure you want to delete this order?')) {
      await deleteOrderMutation({ orderId });
      setSelectedOrder(null);
    }
  };

  const handleCancelWithReason = async (orderId, reason) => {
    try {
      await updateOrderFieldsMutation({
        orderId,
        cancelReason: reason,
        orderStatus: 'cancelled',
        status: 'Cancelled',
      });
      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder(prev => ({
          ...prev,
          orderStatus: 'cancelled',
          status: 'Cancelled',
          cancelReason: reason,
        }));
      }
    } catch (err) {
      console.error('Failed to cancel order:', err);
      alert('Failed to cancel order. Please try again.');
    }
  };

  return (
    <div className="admin-orders-page">
      <div className="orders-tabs">
        {[
          { key: 'all',              icon: 'fa-list',          label: 'All Orders' },
          { key: 'paid',             icon: 'fa-peso-sign',     label: `Paid & Awaiting${tabCounts.paid > 0 ? ` (${tabCounts.paid})` : ''}` },
          { key: 'pending',          icon: 'fa-clock',         label: `Pending${tabCounts.pending > 0 ? ` (${tabCounts.pending})` : ''}` },
          { key: 'confirmed',        icon: 'fa-check-circle',  label: 'Confirmed' },
          { key: 'out_for_delivery', icon: 'fa-shipping-fast', label: 'Out for Delivery' },
          { key: 'completed',        icon: 'fa-check-double',  label: 'Completed' },
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

      <div className="admin-flow-info">
        <i className="fas fa-info-circle"></i>
        <span>
          <strong>Order Flow:</strong> Customer pays →
          appears in <strong>Paid &amp; Awaiting</strong> tab →
          Admin confirms →
          Rider requests pickup →
          Admin approves rider →
          Rider delivers with OTP + photo
        </span>
      </div>

      <div className="orders-filters">
        <div className="filter-group">
          <input
            type="text"
            className="search-input"
            placeholder="Search by Order ID, Customer Name, or Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

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
                  <th>PAYMENT</th>
                  <th>STATUS</th>
                  <th>RIDER</th>
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
                    <td><strong>P{(order.total || 0).toLocaleString()}</strong></td>
                    <td>
                      <span className={`payment-badge ${order.paymentStatus === 'paid' ? 'paid' : 'pending'}`}>
                        {order.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                      </span>
                    </td>
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
                      ) : <span style={{ color: '#ccc', fontSize: '12px' }}>-</span>}
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

const OrderModal = ({ order, onClose, onUpdateStatus, onCancelWithReason, onDelete, getStatusColor, getStatusLabel }) => {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [proofExpanded, setProofExpanded] = useState(false);

  const subtotal = order.subtotal || 0;
  const shippingFee = order.shippingFee || 0;
  const total = order.total || (subtotal + shippingFee);

  const currentStatus = order.orderStatus || 'pending';
  const paymentStatus = order.paymentStatus || 'pending';
  const isPaid = paymentStatus === 'paid';
  const isDone = currentStatus === 'completed' || currentStatus === 'cancelled';
  const isRiderManaged = currentStatus === 'shipped' || currentStatus === 'out_for_delivery';
  const canConfirm = isPaid && currentStatus === 'pending';
  const canCancel = !isDone && !isRiderManaged;

  const hasDeliveryProof = !!(order.deliveryProofPhoto);
  const otpVerified = !!(order.deliveryOtpVerified);

  return (
    <div className="order-modal-overlay" onClick={onClose}>
      <div className="order-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Order #{order.orderId?.slice(-8) || 'N/A'}</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              <span className="status-badge" style={{ backgroundColor: getStatusColor(order.orderStatus) }}>
                {getStatusLabel(order.orderStatus)}
              </span>
              <span className={`payment-badge ${isPaid ? 'paid' : 'pending'}`}>
                {isPaid ? 'Paid' : 'Payment Pending'}
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>

        <div className="modal-body">

          {!isPaid && (
            <div className="flow-notice warning">
              <i className="fas fa-exclamation-triangle"></i>
              <div>
                <strong>Payment not yet confirmed</strong>
                <p>Do not confirm until payment is verified via PayMongo.</p>
              </div>
            </div>
          )}
          {isPaid && currentStatus === 'pending' && (
            <div className="flow-notice success">
              <i className="fas fa-check-circle"></i>
              <div>
                <strong>Payment received! Action needed.</strong>
                <p>Click Confirm Order below. Once confirmed, riders can request pickup.</p>
              </div>
            </div>
          )}
          {isPaid && currentStatus === 'confirmed' && (
            <div className="flow-notice info">
              <i className="fas fa-motorcycle"></i>
              <div>
                <strong>Awaiting rider pickup request</strong>
                <p>Riders can now see this order and request pickup. Approve their request in Pickup Requests tab.</p>
              </div>
            </div>
          )}
          {isRiderManaged && (
            <div className="flow-notice purple">
              <i className="fas fa-shipping-fast"></i>
              <div>
                <strong>Rider is handling delivery</strong>
                <p>Rider will confirm delivery via OTP + photo proof from customer.</p>
              </div>
            </div>
          )}

          <div className="modal-section">
            <h3><i className="fas fa-user"></i> Customer Information</h3>
            <div className="order-info-grid">
              <div className="info-item"><label>Full Name</label><strong>{order.customerName || 'N/A'}</strong></div>
              <div className="info-item"><label>Email</label><span>{order.email || 'N/A'}</span></div>
              <div className="info-item"><label>Phone</label><span>{order.phone || 'N/A'}</span></div>
              <div className="info-item"><label>Delivery Address</label><span>{order.shippingAddress || 'N/A'}</span></div>
            </div>
          </div>

          {order.riderInfo && (
            <div className="modal-section">
              <h3><i className="fas fa-motorcycle"></i> Assigned Rider</h3>
              <div className="order-info-grid">
                <div className="info-item"><label>Name</label><strong>{order.riderInfo.name || 'N/A'}</strong></div>
                <div className="info-item"><label>Phone</label><span>{order.riderInfo.phone || 'N/A'}</span></div>
                <div className="info-item"><label>Vehicle</label><span>{order.riderInfo.vehicle || 'N/A'}</span></div>
                <div className="info-item"><label>Plate</label><span>{order.riderInfo.plate || 'N/A'}</span></div>
              </div>
            </div>
          )}

          {(hasDeliveryProof || otpVerified) && (
            <div className="modal-section">
              <h3><i className="fas fa-shield-alt"></i> Proof of Delivery</h3>
              <div className="pod-card">
                <div className={`pod-otp-row ${otpVerified ? 'verified' : 'unverified'}`}>
                  <div className="pod-otp-icon">
                    <i className={`fas ${otpVerified ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                  </div>
                  <div className="pod-otp-text">
                    <strong>OTP Verification</strong>
                    <span>{otpVerified ? 'Customer OTP verified by rider' : 'OTP not yet verified'}</span>
                  </div>
                  {otpVerified && <span className="pod-otp-badge">Verified</span>}
                </div>
                {order.deliveryConfirmedAt && (
                  <div className="pod-timestamp">
                    <i className="fas fa-clock"></i>
                    <span>Confirmed: {new Date(order.deliveryConfirmedAt).toLocaleString('en-PH')}</span>
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
                          <i className="fas fa-download"></i> Download
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="modal-section">
            <h3><i className="fas fa-info-circle"></i> Order Information</h3>
            <div className="order-info-grid">
              <div className="info-item"><label>Order ID</label><strong>#{order.orderId}</strong></div>
              <div className="info-item"><label>Date</label><span>{order._creationTime ? new Date(order._creationTime).toLocaleString('en-PH') : 'N/A'}</span></div>
              <div className="info-item"><label>Payment Method</label><span>{order.paymentMethod || 'N/A'}</span></div>
              <div className="info-item"><label>Payment Status</label>
                <span className={`payment-badge ${isPaid ? 'paid' : 'pending'}`}>
                  {isPaid ? 'Paid' : 'Pending'}
                </span>
              </div>
            </div>
          </div>

          <div className="modal-section">
            <h3><i className="fas fa-box"></i> Order Items ({order.items?.length || 0})</h3>
            <div className="order-items-list">
              {order.items?.map((item, index) => (
                <div key={index} className="order-item-card">
                  <div className="item-image">
                    <img src={item.image} alt={item.name || 'Product'}
                      onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/80x80?text=No+Image'; }} />
                  </div>
                  <div className="item-details">
                    <strong>{item.name || 'N/A'}</strong>
                    <p className="item-price">P{(item.price || 0).toLocaleString()} x {item.quantity || 0} pc(s)</p>
                  </div>
                  <div className="item-subtotal">P{((item.quantity || 0) * (item.price || 0)).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="modal-section">
            <h3><i className="fas fa-calculator"></i> Order Summary</h3>
            <div className="order-totals">
              <div className="total-row"><span>Subtotal:</span><strong>P{subtotal.toLocaleString()}</strong></div>
              <div className="total-row"><span>Shipping Fee:</span><strong>P{shippingFee.toLocaleString()}</strong></div>
              <div className="total-row grand-total"><span>Total Amount:</span><strong>P{total.toLocaleString()}</strong></div>
            </div>
          </div>

          <div className="modal-section">
            <h3><i className="fas fa-tasks"></i> Update Order Status</h3>

            {isDone && (
              <div className={`status-done-notice ${currentStatus}`}>
                <i className={`fas ${currentStatus === 'completed' ? 'fa-check-circle' : 'fa-ban'}`}></i>
                <span>{currentStatus === 'completed' ? 'Order completed.' : 'Order cancelled.'}</span>
              </div>
            )}

            {isRiderManaged && (
              <div className="rider-managed-notice">
                <i className="fas fa-motorcycle"></i>
                <div>
                  <strong>Handled by rider</strong>
                  <p>Rider updates status automatically via OTP + photo confirmation.</p>
                </div>
              </div>
            )}

            {!isDone && !isRiderManaged && (
              <div className="status-buttons">
                <div className="status-btn-wrapper">
                  <button
                    className={`status-btn confirmed ${currentStatus === 'confirmed' ? 'is-current' : ''} ${!canConfirm ? 'is-blocked' : ''}`}
                    onClick={() => canConfirm && onUpdateStatus(order.orderId, 'confirmed')}
                    disabled={!canConfirm}
                  >
                    <i className="fas fa-check-circle"></i>
                    <span>Confirm Order</span>
                    {currentStatus === 'confirmed' && <span className="current-indicator">Current</span>}
                  </button>
                  {!isPaid && (
                    <div className="block-reason"><i className="fas fa-lock"></i> Awaiting payment first</div>
                  )}
                  {isPaid && currentStatus === 'confirmed' && (
                    <div className="block-reason" style={{ color: '#17a2b8' }}>
                      <i className="fas fa-check"></i> Already confirmed
                    </div>
                  )}
                </div>

                {canCancel && (
                  <div className="status-btn-wrapper">
                    <button className="status-btn cancelled" onClick={() => setShowCancelModal(true)}>
                      <i className="fas fa-times-circle"></i>
                      <span>Cancel Order</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {currentStatus === 'cancelled' && order.cancelReason && (
            <div className="modal-section">
              <h3><i className="fas fa-ban"></i> Cancellation Reason</h3>
              <div className="cancel-reason-display">
                <i className="fas fa-quote-left"></i>
                <p>{order.cancelReason}</p>
              </div>
            </div>
          )}

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
          onConfirm={(reason) => { onCancelWithReason(order.orderId, reason); setShowCancelModal(false); }}
          onClose={() => setShowCancelModal(false)}
        />
      )}
    </div>
  );
};

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

  return (
    <div className="cancel-reason-overlay" onClick={onClose}>
      <div className="cancel-reason-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cancel-reason-header">
          <div className="cancel-reason-icon"><i className="fas fa-ban"></i></div>
          <div><h3>Cancel Order</h3><p>Order #{order.orderId?.slice(-8)}</p></div>
          <button className="close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="cancel-reason-body">
          <p className="cancel-reason-prompt">Please select or enter a reason for cancelling this order.</p>
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
          <button
            className="cancel-confirm-btn"
            onClick={() => {
              if (!finalReason) { setError('Please select or enter a reason.'); return; }
              onConfirm(finalReason);
            }}
            disabled={!finalReason}
          >
            <i className="fas fa-ban"></i> Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminOrders;