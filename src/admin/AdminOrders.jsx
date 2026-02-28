import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './AdminOrders.css';

// ── Date helpers ──────────────────────────────────────────────────
const toDateStr = (ms) => new Date(ms).toISOString().split('T')[0];
const today     = toDateStr(Date.now());

const getPaymentMethodLabel = (order) => {
  const raw = (order.paymentMethod || '').toLowerCase();
  if (raw === 'gcash' || raw.includes('gcash'))   return { label: 'GCash', icon: 'fa-mobile-alt',  color: '#007fff' };
  if (raw === 'maya'  || raw.includes('maya') || raw.includes('paymaya')) return { label: 'Maya', icon: 'fa-wallet', color: '#00b4aa' };
  if (raw === 'card'  || raw.includes('card'))    return { label: 'Card',  icon: 'fa-credit-card', color: '#6366f1' };
  if (raw.includes('paymongo') || raw.includes('online')) return { label: 'GCash / Maya', icon: 'fa-money-bill-wave', color: '#6b7280' };
  return { label: order.paymentMethod || '—', icon: 'fa-money-bill', color: '#9ca3af' };
};

// ── Refund reason labels (must match TrackOrder.js) ───────────────
const REFUND_REASON_LABELS = {
  damaged:     '📦 Item arrived damaged',
  wrong_item:  '❌ Wrong item received',
  missing:     '🔍 Missing items',
  not_as_desc: '📋 Not as described',
  defective:   '⚠️ Defective / Not working',
  others:      '💬 Others',
};

const AdminOrders = () => {
  const [activeTab,     setActiveTab]     = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm,    setSearchTerm]    = useState('');
  const [startDate,     setStartDate]     = useState('');
  const [endDate,       setEndDate]       = useState('');

  const orders = useQuery(api.orders.getAllOrders) || [];
  const updateOrderStatusMutation = useMutation(api.orders.updateOrderStatus);
  const updateOrderFieldsMutation = useMutation(api.orders.updateOrderFields);
  const deleteOrderMutation       = useMutation(api.orders.deleteOrder);
  const resolveRefundMutation     = useMutation(api.orders.resolveRefund);

  const validOrders = orders.filter(o => o.orderId && o.items?.length > 0);

  // ✅ Count pending refund requests
  const refundCount = validOrders.filter(o => o.refundStatus === 'requested').length;

  const tabCounts = {
    paid:    validOrders.filter(o => o.paymentStatus === 'paid' && (!o.orderStatus || o.orderStatus === 'pending')).length,
    pending: validOrders.filter(o => o.orderStatus === 'pending').length,
    refund:  refundCount,
  };

  const filteredOrders = useMemo(() => {
    return validOrders.filter(order => {
      let matchesTab = true;
      if (activeTab === 'paid') {
        matchesTab = order.paymentStatus === 'paid' && (!order.orderStatus || order.orderStatus === 'pending');
      } else if (activeTab === 'refund') {
        // ✅ Refund tab — show all orders with any refundStatus
        matchesTab = !!order.refundStatus;
      } else if (activeTab !== 'all') {
        matchesTab = order.orderStatus === activeTab;
      }

      const matchesSearch =
        !searchTerm ||
        [order.orderId, order.customerName, order.email].some(f =>
          f?.toLowerCase().includes(searchTerm.toLowerCase())
        );

      let matchesDate = true;
      if (startDate || endDate) {
        const orderDate = new Date(order._creationTime || order.createdAt || 0);
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (orderDate < start) matchesDate = false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (orderDate > end) matchesDate = false;
        }
      }

      return matchesTab && matchesSearch && matchesDate;
    }).sort((a, b) => {
      // ✅ On refund tab, sort by refundRequestedAt (newest first)
      if (activeTab === 'refund') {
        const aTime = a.refundRequestedAt ? new Date(a.refundRequestedAt).getTime() : 0;
        const bTime = b.refundRequestedAt ? new Date(b.refundRequestedAt).getTime() : 0;
        return bTime - aTime;
      }
      return (b._creationTime || 0) - (a._creationTime || 0);
    });
  }, [validOrders, activeTab, searchTerm, startDate, endDate]);

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
        status:      mapStatusToTrackingStatus(newOrderStatus),
        orderStatus: newOrderStatus,
      });
      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder(prev => ({
          ...prev,
          orderStatus: newOrderStatus,
          status:      mapStatusToTrackingStatus(newOrderStatus),
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
        orderStatus:  'cancelled',
        status:       'Cancelled',
      });
      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder(prev => ({
          ...prev,
          orderStatus:  'cancelled',
          status:       'Cancelled',
          cancelReason: reason,
        }));
      }
    } catch (err) {
      console.error('Failed to cancel order:', err);
      alert('Failed to cancel order. Please try again.');
    }
  };

  // ✅ Handle refund resolve (approve / reject)
  const handleResolveRefund = async (orderId, refundStatus, adminNote) => {
    try {
      await resolveRefundMutation({ orderId, refundStatus, refundAdminNote: adminNote });
      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder(prev => ({
          ...prev,
          refundStatus,
          refundAdminNote:  adminNote,
          refundResolvedAt: new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.error('Failed to resolve refund:', err);
      alert('Failed to resolve refund. Please try again.');
    }
  };

  const clearDateFilter = () => { setStartDate(''); setEndDate(''); };

  return (
    <div className="admin-orders-page">

      {/* ── Tabs ── */}
      <div className="orders-tabs">
        {[
          { key: 'all',              icon: 'fa-list',          label: 'All Orders' },
          { key: 'paid',             icon: 'fa-peso-sign',     label: `Paid & Awaiting${tabCounts.paid    > 0 ? ` (${tabCounts.paid})`    : ''}` },
          { key: 'pending',          icon: 'fa-clock',         label: `Pending${tabCounts.pending > 0 ? ` (${tabCounts.pending})` : ''}` },
          { key: 'confirmed',        icon: 'fa-check-circle',  label: 'Confirmed' },
          { key: 'out_for_delivery', icon: 'fa-shipping-fast', label: 'Out for Delivery' },
          { key: 'completed',        icon: 'fa-check-double',  label: 'Completed' },
          // ✅ Refund tab — shows badge if there are pending refunds
          { key: 'refund',           icon: 'fa-undo-alt',      label: 'Refunds', count: tabCounts.refund },
        ].map(t => (
          <button
            key={t.key}
            className={`tab-btn ${activeTab === t.key ? 'active' : ''} ${t.key === 'refund' ? 'tab-btn-refund' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <i className={`fas ${t.icon}`}></i>
            {t.key === 'refund'
              ? <>Refunds {t.count > 0 && <span className="tab-refund-badge">{t.count}</span>}</>
              : t.label
            }
          </button>
        ))}
      </div>

      {/* ── Flow info ── */}
      <div className="admin-flow-info">
        <i className="fas fa-info-circle"></i>
        <span>
          <strong>Order Flow:</strong> Customer pays →
          appears in <strong>Paid &amp; Awaiting</strong> tab →
          Admin confirms → Rider requests pickup →
          Admin approves rider → Rider delivers with OTP + photo
        </span>
      </div>

      {/* ✅ Refund info banner when on refund tab */}
      {activeTab === 'refund' && refundCount > 0 && (
        <div className="admin-refund-info-banner">
          <i className="fas fa-exclamation-circle"></i>
          <span>
            <strong>{refundCount} pending refund request{refundCount > 1 ? 's' : ''}</strong> — review and approve or reject each request below.
          </span>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="orders-filters">
        <div className="filter-group">
          <input
            type="text"
            className="search-input"
            placeholder="Search by Order ID, Customer Name, or Email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="date-filter-group">
          <div className="date-filter-inputs">
            <div className="date-filter-item">
              <label htmlFor="orderStart"><i className="fas fa-calendar"></i></label>
              <input type="date" id="orderStart" value={startDate} max={endDate || today}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <span className="date-filter-sep">to</span>
            <div className="date-filter-item">
              <label htmlFor="orderEnd"><i className="fas fa-calendar"></i></label>
              <input type="date" id="orderEnd" value={endDate} min={startDate} max={today}
                onChange={e => setEndDate(e.target.value)} />
            </div>
            {(startDate || endDate) && (
              <button className="date-filter-clear" onClick={clearDateFilter}>
                <i className="fas fa-times"></i> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="orders-container">
        {filteredOrders.length === 0 ? (
          <div className="empty-orders">
            <i className={`fas ${activeTab === 'refund' ? 'fa-undo-alt' : 'fa-inbox'}`}></i>
            <p>{activeTab === 'refund' ? 'No refund requests found' : 'No orders found'}</p>
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
                  <th>METHOD</th>
                  <th>STATUS</th>
                  {/* ✅ Extra column on refund tab */}
                  {activeTab === 'refund' && <th>REFUND</th>}
                  <th>RIDER</th>
                  <th>DATE</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const pm = getPaymentMethodLabel(order);
                  return (
                    <tr key={order.orderId} className={order.refundStatus === 'requested' ? 'row-refund-pending' : ''}>
                      <td><strong>#{order.orderId.slice(-8)}</strong></td>
                      <td>
                        <div className="customer-info">
                          <strong>{order.customerName || 'N/A'}</strong>
                          <small>{order.email || 'N/A'}</small>
                        </div>
                      </td>
                      <td>{order.items.length} item(s)</td>
                      <td>
                        <strong>₱{(order.finalTotal ?? order.total ?? 0).toLocaleString('en-PH')}</strong>
                        {order.promoCode && (
                          <div style={{ fontSize: '11px', color: '#ec4899', fontWeight: 700, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <i className="fas fa-tag"></i> {order.promoCode}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`payment-badge ${order.paymentStatus === 'paid' ? 'paid' : 'pending'}`}>
                          {order.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                      <td>
                        <span className="method-badge" style={{ color: pm.color }}>
                          <i className={`fas ${pm.icon}`}></i> {pm.label}
                        </span>
                      </td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: getStatusColor(order.orderStatus) }}>
                          {getStatusLabel(order.orderStatus)}
                        </span>
                      </td>
                      {/* ✅ Refund status column */}
                      {activeTab === 'refund' && (
                        <td>
                          {order.refundStatus === 'requested' && (
                            <span className="refund-table-badge refund-table-pending">
                              <i className="fas fa-clock"></i> Pending
                            </span>
                          )}
                          {order.refundStatus === 'approved' && (
                            <span className="refund-table-badge refund-table-approved">
                              <i className="fas fa-check-circle"></i> Approved
                            </span>
                          )}
                          {order.refundStatus === 'rejected' && (
                            <span className="refund-table-badge refund-table-rejected">
                              <i className="fas fa-times-circle"></i> Rejected
                            </span>
                          )}
                        </td>
                      )}
                      <td>
                        {order.riderInfo ? (
                          <div style={{ fontSize: '12px' }}>
                            <strong>{order.riderInfo.name}</strong>
                            <div style={{ color: '#888' }}>{order.riderInfo.plate}</div>
                          </div>
                        ) : <span style={{ color: '#ccc', fontSize: '12px' }}>-</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '13px' }}>
                        {order._creationTime
                          ? new Date(order._creationTime).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                          : 'N/A'}
                      </td>
                      <td>
                        <button className="view-btn" onClick={() => setSelectedOrder(order)}>
                          <i className="fas fa-eye"></i> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
          onResolveRefund={handleResolveRefund}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
        />
      )}
    </div>
  );
};

/* ══════════════════════════════════════
   ORDER MODAL
══════════════════════════════════════ */
const OrderModal = ({ order, onClose, onUpdateStatus, onCancelWithReason, onDelete, onResolveRefund, getStatusColor, getStatusLabel }) => {
  const [showCancelModal,  setShowCancelModal]  = useState(false);
  const [proofExpanded,    setProofExpanded]    = useState(false);
  const [refundAdminNote,  setRefundAdminNote]  = useState('');
  const [resolvingRefund,  setResolvingRefund]  = useState(false);

  const subtotal      = order.subtotal  || 0;
  const shippingFee   = order.shippingFee || 0;
  const originalTotal = order.total || (subtotal + shippingFee);
  const discount      = order.discountAmount || 0;
  const finalTotal    = order.finalTotal ?? (originalTotal - discount);

  const currentStatus  = order.orderStatus || 'pending';
  const paymentStatus  = order.paymentStatus || 'pending';
  const isPaid         = paymentStatus === 'paid';
  const isDone         = currentStatus === 'completed' || currentStatus === 'cancelled';
  const isRiderManaged = currentStatus === 'shipped' || currentStatus === 'out_for_delivery';
  const canConfirm     = isPaid && currentStatus === 'pending';
  const canCancel      = !isDone && !isRiderManaged;
  const hasPromo       = !!(order.promoCode && discount > 0);
  const hasDeliveryProof = !!(order.deliveryProofPhoto);
  const otpVerified      = !!(order.deliveryOtpVerified);
  const hasRefund        = !!(order.refundStatus);
  const pm = getPaymentMethodLabel(order);

  const handleRefundResolve = async (status) => {
    setResolvingRefund(true);
    try {
      await onResolveRefund(order.orderId, status, refundAdminNote.trim());
    } finally {
      setResolvingRefund(false);
    }
  };

  return (
    <div className="order-modal-overlay" onClick={onClose}>
      <div className="order-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
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
              <span className="method-badge-pill" style={{ color: pm.color, borderColor: pm.color + '44' }}>
                <i className={`fas ${pm.icon}`}></i> {pm.label}
              </span>
              {hasPromo && (
                <span className="promo-admin-pill">
                  <i className="fas fa-tag"></i> {order.promoCode}
                </span>
              )}
              {/* ✅ Refund status pill in header */}
              {hasRefund && (
                <span className={`refund-header-pill refund-header-${order.refundStatus}`}>
                  <i className={`fas ${order.refundStatus === 'requested' ? 'fa-clock' : order.refundStatus === 'approved' ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                  {order.refundStatus === 'requested' ? 'Refund Pending' : order.refundStatus === 'approved' ? 'Refund Approved' : 'Refund Rejected'}
                </span>
              )}
            </div>
          </div>
          <button className="close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>

        <div className="modal-body">

          {/* Flow notices */}
          {!isPaid && (
            <div className="flow-notice warning">
              <i className="fas fa-exclamation-triangle"></i>
              <div><strong>Payment not yet confirmed</strong><p>Do not confirm until payment is verified via PayMongo.</p></div>
            </div>
          )}
          {isPaid && currentStatus === 'pending' && (
            <div className="flow-notice success">
              <i className="fas fa-check-circle"></i>
              <div><strong>Payment received! Action needed.</strong><p>Click Confirm Order below. Once confirmed, riders can request pickup.</p></div>
            </div>
          )}
          {isPaid && currentStatus === 'confirmed' && (
            <div className="flow-notice info">
              <i className="fas fa-motorcycle"></i>
              <div><strong>Awaiting rider pickup request</strong><p>Riders can now see this order and request pickup.</p></div>
            </div>
          )}
          {isRiderManaged && (
            <div className="flow-notice purple">
              <i className="fas fa-shipping-fast"></i>
              <div><strong>Rider is handling delivery</strong><p>Rider will confirm delivery via OTP + photo proof.</p></div>
            </div>
          )}

          {/* Customer Info */}
          <div className="modal-section">
            <h3><i className="fas fa-user"></i> Customer Information</h3>
            <div className="order-info-grid">
              <div className="info-item"><label>Full Name</label><strong>{order.customerName || 'N/A'}</strong></div>
              <div className="info-item"><label>Email</label><span>{order.email || 'N/A'}</span></div>
              <div className="info-item"><label>Phone</label><span>{order.phone || 'N/A'}</span></div>
              <div className="info-item"><label>Delivery Address</label><span>{order.shippingAddress || 'N/A'}</span></div>
            </div>
          </div>

          {/* Rider Info */}
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

          {/* Proof of Delivery */}
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

          {/* ✅ REFUND REQUEST SECTION */}
          {hasRefund && (
            <div className="modal-section">
              <h3><i className="fas fa-undo-alt"></i> Refund Request</h3>
              <div className={`admin-refund-card admin-refund-${order.refundStatus}`}>

                {/* Refund details */}
                <div className="admin-refund-details">
                  <div className="admin-refund-row">
                    <span>Reason</span>
                    <strong>{REFUND_REASON_LABELS[order.refundReason] || order.refundReason || '—'}</strong>
                  </div>
                  {order.refundComment && (
                    <div className="admin-refund-row">
                      <span>Customer note</span>
                      <strong style={{ fontStyle: 'italic' }}>"{order.refundComment}"</strong>
                    </div>
                  )}
                  <div className="admin-refund-row">
                    <span>Requested at</span>
                    <strong>
                      {order.refundRequestedAt
                        ? new Date(order.refundRequestedAt).toLocaleString('en-PH')
                        : '—'}
                    </strong>
                  </div>
                  {order.refundStatus !== 'requested' && order.refundResolvedAt && (
                    <div className="admin-refund-row">
                      <span>Resolved at</span>
                      <strong>{new Date(order.refundResolvedAt).toLocaleString('en-PH')}</strong>
                    </div>
                  )}
                  {order.refundAdminNote && (
                    <div className="admin-refund-row">
                      <span>Admin note</span>
                      <strong>{order.refundAdminNote}</strong>
                    </div>
                  )}
                </div>

                {/* ✅ Action area — only shown when status is 'requested' */}
                {order.refundStatus === 'requested' && (
                  <div className="admin-refund-action">
                    <label className="admin-refund-note-label">
                      <i className="fas fa-comment-alt"></i> Response note to customer <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
                    </label>
                    <textarea
                      className="admin-refund-note-input"
                      placeholder="e.g. We've verified the issue and will process your refund within 3-5 business days..."
                      value={refundAdminNote}
                      onChange={e => setRefundAdminNote(e.target.value)}
                      rows={2}
                      maxLength={300}
                    />
                    <div className="admin-refund-action-btns">
                      <button
                        className="admin-refund-reject-btn"
                        onClick={() => handleRefundResolve('rejected')}
                        disabled={resolvingRefund}
                      >
                        {resolvingRefund ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-times-circle"></i>}
                        Reject Refund
                      </button>
                      <button
                        className="admin-refund-approve-btn"
                        onClick={() => handleRefundResolve('approved')}
                        disabled={resolvingRefund}
                      >
                        {resolvingRefund ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-circle"></i>}
                        Approve Refund
                      </button>
                    </div>
                  </div>
                )}

                {/* Status resolved banner */}
                {order.refundStatus === 'approved' && (
                  <div className="admin-refund-resolved approved">
                    <i className="fas fa-check-circle"></i>
                    <span>Refund has been <strong>approved</strong>.</span>
                  </div>
                )}
                {order.refundStatus === 'rejected' && (
                  <div className="admin-refund-resolved rejected">
                    <i className="fas fa-times-circle"></i>
                    <span>Refund request was <strong>rejected</strong>.</span>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* Order Info */}
          <div className="modal-section">
            <h3><i className="fas fa-info-circle"></i> Order Information</h3>
            <div className="order-info-grid">
              <div className="info-item"><label>Order ID</label><strong>#{order.orderId}</strong></div>
              <div className="info-item"><label>Date</label><span>{order._creationTime ? new Date(order._creationTime).toLocaleString('en-PH') : 'N/A'}</span></div>
              <div className="info-item">
                <label>Payment Method</label>
                <span className="method-display" style={{ color: pm.color }}>
                  <i className={`fas ${pm.icon}`}></i> {pm.label}
                </span>
              </div>
              <div className="info-item">
                <label>Payment Status</label>
                <span className={`payment-badge ${isPaid ? 'paid' : 'pending'}`}>
                  {isPaid ? 'Paid' : 'Pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Promo Section */}
          {hasPromo && (
            <div className="modal-section">
              <h3><i className="fas fa-tag"></i> Promo / Discount Applied</h3>
              <div className="promo-admin-card">
                <div className="promo-admin-top">
                  <div className="promo-admin-badge">
                    <i className="fas fa-ticket-alt"></i>
                    <span>{order.promoCode}</span>
                  </div>
                  {order.promoName && <span className="promo-admin-group">{order.promoName}</span>}
                </div>
                <div className="promo-admin-details">
                  {order.discountPercent > 0 && (
                    <div className="promo-admin-row">
                      <span>Discount Rate</span>
                      <strong>{order.discountPercent}% off</strong>
                    </div>
                  )}
                  <div className="promo-admin-row discount">
                    <span>Amount Saved by Customer</span>
                    <strong>−₱{discount.toLocaleString('en-PH')}</strong>
                  </div>
                  <div className="promo-admin-row">
                    <span>Original Total (before discount)</span>
                    <strong>₱{originalTotal.toLocaleString('en-PH')}</strong>
                  </div>
                  <div className="promo-admin-row final">
                    <span>Final Amount Charged (PayMongo)</span>
                    <strong>₱{finalTotal.toLocaleString('en-PH')}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Order Items */}
          <div className="modal-section">
            <h3><i className="fas fa-box"></i> Order Items ({order.items?.length || 0})</h3>
            <div className="order-items-list">
              {order.items?.map((item, index) => (
                <div key={index} className="order-item-card">
                  <div className="item-image">
                    <img src={item.image} alt={item.name || 'Product'}
                      onError={e => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/80x80?text=No+Image'; }} />
                  </div>
                  <div className="item-details">
                    <strong>{item.name || 'N/A'}</strong>
                    <p className="item-price">₱{(item.price || 0).toLocaleString('en-PH')} x {item.quantity || 0} pc(s)</p>
                  </div>
                  <div className="item-subtotal">₱{((item.quantity || 0) * (item.price || 0)).toLocaleString('en-PH')}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Summary */}
          <div className="modal-section">
            <h3><i className="fas fa-calculator"></i> Order Summary</h3>
            <div className="order-totals">
              <div className="total-row"><span>Subtotal:</span><strong>₱{subtotal.toLocaleString('en-PH')}</strong></div>
              <div className="total-row"><span>Shipping Fee:</span><strong>₱{shippingFee.toLocaleString('en-PH')}</strong></div>
              {hasPromo && (
                <>
                  <div className="total-row promo-discount-admin-row">
                    <span><i className="fas fa-tag" style={{ marginRight: '6px', color: '#ec4899' }}></i>Promo ({order.promoCode}) −{order.discountPercent}%:</span>
                    <strong>−₱{discount.toLocaleString('en-PH')}</strong>
                  </div>
                  <div className="total-row">
                    <span style={{ color: '#6b7280' }}>Original Total:</span>
                    <strong style={{ color: '#6b7280', textDecoration: 'line-through' }}>₱{originalTotal.toLocaleString('en-PH')}</strong>
                  </div>
                </>
              )}
              <div className="total-row grand-total">
                <span>{hasPromo ? 'Final Charged (PayMongo):' : 'Total Amount:'}</span>
                <strong>₱{finalTotal.toLocaleString('en-PH')}</strong>
              </div>
              {hasPromo && (
                <div className="promo-admin-savings-note">
                  <i className="fas fa-info-circle"></i>
                  Customer used promo <strong>{order.promoCode}</strong> and saved <strong>₱{discount.toLocaleString('en-PH')}</strong>.
                  PayMongo charged <strong>₱{finalTotal.toLocaleString('en-PH')}</strong>.
                </div>
              )}
            </div>
          </div>

          {/* Update Status */}
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
                  {!isPaid && <div className="block-reason"><i className="fas fa-lock"></i> Awaiting payment first</div>}
                  {isPaid && currentStatus === 'confirmed' && (
                    <div className="block-reason" style={{ color: '#17a2b8' }}><i className="fas fa-check"></i> Already confirmed</div>
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
          onConfirm={reason => { onCancelWithReason(order.orderId, reason); setShowCancelModal(false); }}
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
  const [customReason,   setCustomReason]   = useState('');
  const [error,          setError]          = useState('');

  const isOther     = selectedPreset === 'Other reason';
  const finalReason = isOther ? customReason.trim() : selectedPreset;

  return (
    <div className="cancel-reason-overlay" onClick={onClose}>
      <div className="cancel-reason-modal" onClick={e => e.stopPropagation()}>
        <div className="cancel-reason-header">
          <div className="cancel-reason-icon"><i className="fas fa-ban"></i></div>
          <div><h3>Cancel Order</h3><p>Order #{order.orderId?.slice(-8)}</p></div>
          <button className="close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="cancel-reason-body">
          <p className="cancel-reason-prompt">Please select or enter a reason for cancelling this order.</p>
          <div className="cancel-presets">
            {CANCEL_PRESETS.map(preset => (
              <button key={preset}
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
              <textarea className="cancel-custom-input"
                placeholder="Type the cancellation reason here..."
                value={customReason}
                onChange={e => { setCustomReason(e.target.value); setError(''); }}
                rows={3} maxLength={300} autoFocus
              />
              <div className="char-count">{customReason.length}/300</div>
            </div>
          )}
          {error && <div className="cancel-error"><i className="fas fa-exclamation-circle"></i> {error}</div>}
        </div>
        <div className="cancel-reason-footer">
          <button className="cancel-go-back-btn" onClick={onClose}><i className="fas fa-arrow-left"></i> Go Back</button>
          <button className="cancel-confirm-btn"
            onClick={() => { if (!finalReason) { setError('Please select or enter a reason.'); return; } onConfirm(finalReason); }}
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