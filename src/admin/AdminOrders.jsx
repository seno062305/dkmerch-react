import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './AdminOrders.css';

const toDateStr = (ms) => new Date(ms).toISOString().split('T')[0];
const today     = toDateStr(Date.now());

const getPaymentMethodLabel = (order) => {
  const raw = (order.paymentMethod || '').toLowerCase();
  if (raw === 'gcash' || raw.includes('gcash'))   return { label: 'GCash',        icon: 'fa-mobile-alt',    color: '#007fff' };
  if (raw === 'maya'  || raw.includes('maya') || raw.includes('paymaya')) return { label: 'Maya', icon: 'fa-wallet', color: '#00b4aa' };
  if (raw === 'card'  || raw.includes('card'))    return { label: 'Card',         icon: 'fa-credit-card',   color: '#6366f1' };
  if (raw.includes('paymongo') || raw.includes('online')) return { label: 'GCash / Maya', icon: 'fa-money-bill-wave', color: '#6b7280' };
  return { label: order.paymentMethod || '—', icon: 'fa-money-bill', color: '#9ca3af' };
};

const REFUND_METHOD_LABELS = {
  gcash: { label: 'GCash', color: '#007fff', icon: 'fa-mobile-alt' },
  maya:  { label: 'Maya',  color: '#00b4aa', icon: 'fa-wallet'     },
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
  const refundCount = validOrders.filter(o => o.refundStatus === 'requested').length;

  // ── COUNT for every tab ──────────────────────────────────────
  const tabCounts = {
    all:              validOrders.length,
    paid:             validOrders.filter(o => o.paymentStatus === 'paid' && (!o.orderStatus || o.orderStatus === 'pending')).length,
    pending:          validOrders.filter(o => o.orderStatus === 'pending').length,
    confirmed:        validOrders.filter(o => o.orderStatus === 'confirmed').length,
    out_for_delivery: validOrders.filter(o => o.orderStatus === 'out_for_delivery').length,
    completed:        validOrders.filter(o => o.orderStatus === 'completed').length,
    refund:           refundCount,
  };

  const filteredOrders = useMemo(() => {
    return validOrders.filter(order => {
      let matchesTab = true;
      if (activeTab === 'paid') {
        matchesTab = order.paymentStatus === 'paid' && (!order.orderStatus || order.orderStatus === 'pending');
      } else if (activeTab === 'refund') {
        matchesTab = !!order.refundStatus;
      } else if (activeTab !== 'all') {
        matchesTab = order.orderStatus === activeTab;
      }
      const matchesSearch = !searchTerm || [order.orderId, order.customerName, order.email].some(f => f?.toLowerCase().includes(searchTerm.toLowerCase()));
      let matchesDate = true;
      if (startDate || endDate) {
        const orderDate = new Date(order._creationTime || order.createdAt || 0);
        if (startDate) { const start = new Date(startDate); start.setHours(0,0,0,0); if (orderDate < start) matchesDate = false; }
        if (endDate)   { const end   = new Date(endDate);   end.setHours(23,59,59,999); if (orderDate > end) matchesDate = false; }
      }
      return matchesTab && matchesSearch && matchesDate;
    }).sort((a, b) => {
      if (activeTab === 'refund') {
        const aTime = a.refundRequestedAt ? new Date(a.refundRequestedAt).getTime() : 0;
        const bTime = b.refundRequestedAt ? new Date(b.refundRequestedAt).getTime() : 0;
        return bTime - aTime;
      }
      return (b._creationTime || 0) - (a._creationTime || 0);
    });
  }, [validOrders, activeTab, searchTerm, startDate, endDate]);

  const getStatusColor = (status) => {
    const colors = { pending: '#ffc107', confirmed: '#17a2b8', shipped: '#6366f1', out_for_delivery: '#f97316', completed: '#28a745', cancelled: '#dc3545' };
    return colors[status] || '#6c757d';
  };

  const getStatusLabel = (status) => {
    const labels = { pending: 'Pending', confirmed: 'Confirmed', shipped: 'Shipped', out_for_delivery: 'Out for Delivery', completed: 'Completed', cancelled: 'Cancelled' };
    return labels[status] || status || 'Pending';
  };

  const mapStatusToTrackingStatus = (adminStatus) => {
    const statusMap = { pending: 'Processing', confirmed: 'Confirmed', shipped: 'Shipped', out_for_delivery: 'Out for Delivery', completed: 'Delivered', cancelled: 'Cancelled' };
    return statusMap[adminStatus] || 'Processing';
  };

  const handleUpdateStatus = async (orderId, newOrderStatus) => {
    try {
      await updateOrderStatusMutation({ orderId, status: mapStatusToTrackingStatus(newOrderStatus), orderStatus: newOrderStatus });
      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder(prev => ({ ...prev, orderStatus: newOrderStatus, status: mapStatusToTrackingStatus(newOrderStatus) }));
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
      await updateOrderFieldsMutation({ orderId, cancelReason: reason, orderStatus: 'cancelled', status: 'Cancelled' });
      if (selectedOrder?.orderId === orderId) {
        setSelectedOrder(prev => ({ ...prev, orderStatus: 'cancelled', status: 'Cancelled', cancelReason: reason }));
      }
    } catch (err) {
      console.error('Failed to cancel order:', err);
      alert('Failed to cancel order. Please try again.');
    }
  };

  const handleResolveRefund = async (orderId, refundStatus, adminNote) => {
    try {
      await resolveRefundMutation({ orderId, refundStatus, refundAdminNote: adminNote });
      if (selectedOrder?.orderId === orderId) {
        const refundAmount = selectedOrder.finalTotal ?? selectedOrder.total ?? 0;
        setSelectedOrder(prev => ({
          ...prev, refundStatus, refundAdminNote: adminNote,
          refundResolvedAt: new Date().toISOString(), refundAmount,
          ...(refundStatus === 'approved' ? { refundPaidAt: new Date().toISOString() } : {}),
        }));
      }
    } catch (err) {
      console.error('Failed to resolve refund:', err);
      alert('Failed to resolve refund. Please try again.');
    }
  };

  const clearDateFilter = () => { setStartDate(''); setEndDate(''); };

  // ── Tab definitions ──────────────────────────────────────────
  const tabs = [
    { key: 'all',              icon: 'fa-list',          label: 'All Orders' },
    { key: 'paid',             icon: 'fa-peso-sign',     label: 'Paid & Awaiting' },
    { key: 'pending',          icon: 'fa-clock',         label: 'Pending' },
    { key: 'confirmed',        icon: 'fa-check-circle',  label: 'Confirmed' },
    { key: 'out_for_delivery', icon: 'fa-shipping-fast', label: 'Out for Delivery' },
    { key: 'completed',        icon: 'fa-check-double',  label: 'Completed' },
    { key: 'refund',           icon: 'fa-undo-alt',      label: 'Refunds' },
  ];

  return (
    <div className="admin-orders-page">
      <div className="orders-tabs">
        {tabs.map(t => {
          const count = tabCounts[t.key] ?? 0;
          const isRefund = t.key === 'refund';
          return (
            <button
              key={t.key}
              className={`tab-btn ${activeTab === t.key ? 'active' : ''} ${isRefund ? 'tab-btn-refund' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              <i className={`fas ${t.icon}`}></i>
              {t.label}
              {count > 0 && (
                <span className={`tab-count-badge ${isRefund ? 'tab-count-badge--refund' : ''}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="admin-flow-info">
        <i className="fas fa-info-circle"></i>
        <span><strong>Order Flow:</strong> Customer pays → <strong>Paid &amp; Awaiting</strong> → Admin confirms → Notify Customer (Out for Delivery) → Rider delivers with OTP + photo</span>
      </div>

      {activeTab === 'refund' && refundCount > 0 && (
        <div className="admin-refund-info-banner">
          <i className="fas fa-exclamation-circle"></i>
          <span><strong>{refundCount} pending refund request{refundCount > 1 ? 's' : ''}</strong> — review each below.</span>
        </div>
      )}

      <div className="orders-filters">
        <div className="filter-group">
          <input type="text" className="search-input" placeholder="Search by Order ID, Customer Name, or Email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="date-filter-group">
          <div className="date-filter-inputs">
            <div className="date-filter-item"><label htmlFor="orderStart"><i className="fas fa-calendar"></i></label><input type="date" id="orderStart" value={startDate} max={endDate || today} onChange={e => setStartDate(e.target.value)} /></div>
            <span className="date-filter-sep">to</span>
            <div className="date-filter-item"><label htmlFor="orderEnd"><i className="fas fa-calendar"></i></label><input type="date" id="orderEnd" value={endDate} min={startDate} max={today} onChange={e => setEndDate(e.target.value)} /></div>
            {(startDate || endDate) && <button className="date-filter-clear" onClick={clearDateFilter}><i className="fas fa-times"></i> Clear</button>}
          </div>
        </div>
      </div>

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
                  <th>ORDER ID</th><th>CUSTOMER</th><th>ITEMS</th><th>TOTAL</th>
                  <th>PAYMENT</th><th>METHOD</th><th>STATUS</th>
                  {activeTab === 'refund' && <th>REFUND</th>}
                  <th>RIDER</th><th>DATE</th><th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const pm = getPaymentMethodLabel(order);
                  return (
                    <tr key={order.orderId} className={order.refundStatus === 'requested' ? 'row-refund-pending' : ''}>
                      <td><strong>#{order.orderId.slice(-8)}</strong></td>
                      <td><div className="customer-info"><strong>{order.customerName || 'N/A'}</strong><small>{order.email || 'N/A'}</small></div></td>
                      <td>{order.items.length} item(s)</td>
                      <td>
                        <strong>₱{(order.finalTotal ?? order.total ?? 0).toLocaleString('en-PH')}</strong>
                        {order.promoCode && <div style={{ fontSize: '11px', color: '#ec4899', fontWeight: 700, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}><i className="fas fa-tag"></i> {order.promoCode}</div>}
                      </td>
                      <td><span className={`payment-badge ${order.paymentStatus === 'paid' ? 'paid' : 'pending'}`}>{order.paymentStatus === 'paid' ? 'Paid' : 'Pending'}</span></td>
                      <td><span className="method-badge" style={{ color: pm.color }}><i className={`fas ${pm.icon}`}></i> {pm.label}</span></td>
                      <td><span className="status-badge" style={{ backgroundColor: getStatusColor(order.orderStatus) }}>{getStatusLabel(order.orderStatus)}</span></td>
                      {activeTab === 'refund' && (
                        <td>
                          {order.refundStatus === 'requested' && <span className="refund-table-badge refund-table-pending"><i className="fas fa-clock"></i> Pending</span>}
                          {order.refundStatus === 'approved'  && <span className="refund-table-badge refund-table-approved"><i className="fas fa-check-circle"></i> Approved</span>}
                          {order.refundStatus === 'rejected'  && <span className="refund-table-badge refund-table-rejected"><i className="fas fa-times-circle"></i> Rejected</span>}
                        </td>
                      )}
                      <td>
                        {order.riderInfo
                          ? <div style={{ fontSize: '12px' }}><strong>{order.riderInfo.name}</strong><div style={{ color: '#888' }}>{order.riderInfo.plate}</div></div>
                          : <span style={{ color: '#ccc', fontSize: '12px' }}>-</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '13px' }}>
                        {order._creationTime ? new Date(order._creationTime).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                      </td>
                      <td><button className="view-btn" onClick={() => setSelectedOrder(order)}><i className="fas fa-eye"></i> View</button></td>
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
   REJECT CONFIRMATION DIALOG
══════════════════════════════════════ */
const RejectConfirmDialog = ({ order, adminNote, onConfirm, onCancel }) => {
  const refundAmount = order.refundAmount ?? order.finalTotal ?? order.total ?? 0;
  return (
    <div className="reject-confirm-overlay" onClick={onCancel}>
      <div className="reject-confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="reject-confirm-icon"><i className="fas fa-exclamation-triangle"></i></div>
        <h3>Reject Refund Request?</h3>
        <p>Are you sure you want to <strong>reject</strong> the refund for Order <strong>#{order.orderId?.slice(-8)}</strong>?</p>
        <div className="reject-confirm-details">
          <div className="reject-confirm-row"><span>Customer</span><strong>{order.customerName || 'N/A'}</strong></div>
          <div className="reject-confirm-row"><span>Refund Amount</span><strong>₱{refundAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></div>
          {adminNote && <div className="reject-confirm-row"><span>Your Note</span><strong style={{ fontStyle: 'italic' }}>"{adminNote}"</strong></div>}
        </div>
        <p className="reject-confirm-warning"><i className="fas fa-info-circle"></i> The customer will be notified via email.</p>
        <div className="reject-confirm-actions">
          <button className="reject-confirm-cancel-btn" onClick={onCancel}><i className="fas fa-arrow-left"></i> Go Back</button>
          <button className="reject-confirm-proceed-btn" onClick={onConfirm}><i className="fas fa-times-circle"></i> Yes, Reject</button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════
   ORDER MODAL
══════════════════════════════════════ */
const OrderModal = ({ order, onClose, onUpdateStatus, onCancelWithReason, onDelete, onResolveRefund, getStatusColor, getStatusLabel }) => {
  const [showCancelModal,   setShowCancelModal]   = useState(false);
  const [proofExpanded,     setProofExpanded]     = useState(false);
  const [photoExpanded2,    setPhotoExpanded2]    = useState(false);
  const [refundAdminNote,   setRefundAdminNote]   = useState('');
  const [resolvingRefund,   setResolvingRefund]   = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const [notifying, setNotifying] = useState(false);
  const [notified,  setNotified]  = useState(false);
  const notifyMutation = useMutation(api.orders.notifyCustomerOutForDelivery);

  const refundPhotoUrl = useQuery(
    api.orders.getRefundPhotoUrl,
    order.refundPhotoId ? { storageId: order.refundPhotoId } : 'skip'
  );

  const subtotal      = order.subtotal   || 0;
  const shippingFee   = order.shippingFee || 0;
  const originalTotal = order.total || (subtotal + shippingFee);
  const discount      = order.discountAmount || 0;
  const finalTotal    = order.finalTotal ?? (originalTotal - discount);
  const refundAmount  = order.refundAmount ?? finalTotal;

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

  const canNotify       = isPaid && (currentStatus === 'confirmed' || currentStatus === 'shipped') && !!order.riderInfo?.name;
  const alreadyNotified = currentStatus === 'out_for_delivery';

  const handleRefundResolve = async (status) => {
    setResolvingRefund(true);
    try { await onResolveRefund(order.orderId, status, refundAdminNote.trim()); }
    finally { setResolvingRefund(false); setShowRejectConfirm(false); }
  };

  const handleNotifyCustomer = async () => {
    const ri = order.riderInfo || {};
    if (!ri.name || !ri.phone) { alert('Set rider name and phone in AdminRiders first.'); return; }
    if (!order.email) { alert('No customer email found for this order.'); return; }
    setNotifying(true);
    try {
      await notifyMutation({
        orderId:       order.orderId,
        riderName:     ri.name,
        riderPhone:    ri.phone,
        riderPlate:    ri.plate || undefined,
        customerEmail: order.email,
      });
      setNotified(true);
      setTimeout(() => setNotified(false), 4000);
    } catch (e) {
      console.error('Notify error:', e);
      alert('Failed to notify customer. Please try again.');
    } finally {
      setNotifying(false);
    }
  };

  return (
    <div className="order-modal-overlay" onClick={onClose}>
      <div className="order-modal" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <div>
            <h2>Order #{order.orderId?.slice(-8) || 'N/A'}</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              <span className="status-badge" style={{ backgroundColor: getStatusColor(order.orderStatus) }}>{getStatusLabel(order.orderStatus)}</span>
              <span className={`payment-badge ${isPaid ? 'paid' : 'pending'}`}>{isPaid ? 'Paid' : 'Payment Pending'}</span>
              <span className="method-badge-pill" style={{ color: pm.color, borderColor: pm.color + '44' }}><i className={`fas ${pm.icon}`}></i> {pm.label}</span>
              {hasPromo && <span className="promo-admin-pill"><i className="fas fa-tag"></i> {order.promoCode}</span>}
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

          {!isPaid && <div className="flow-notice warning"><i className="fas fa-exclamation-triangle"></i><div><strong>Payment not yet confirmed</strong><p>Do not confirm until payment is verified via PayMongo.</p></div></div>}
          {isPaid && currentStatus === 'pending' && <div className="flow-notice success"><i className="fas fa-check-circle"></i><div><strong>Payment received!</strong><p>Confirm order below. Then set rider info and click Notify Customer.</p></div></div>}
          {isPaid && currentStatus === 'confirmed' && <div className="flow-notice info"><i className="fas fa-motorcycle"></i><div><strong>Order confirmed</strong><p>Set rider info in AdminRiders, then click <strong>Notify Customer</strong> to dispatch.</p></div></div>}
          {isRiderManaged && <div className="flow-notice purple"><i className="fas fa-shipping-fast"></i><div><strong>Rider is handling delivery</strong><p>Rider confirms via OTP + photo proof.</p></div></div>}

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
                <div className="info-item"><label>Plate</label><span>{order.riderInfo.plate || 'N/A'}</span></div>
              </div>
            </div>
          )}

          {(hasDeliveryProof || otpVerified) && (
            <div className="modal-section">
              <h3><i className="fas fa-shield-alt"></i> Proof of Delivery</h3>
              <div className="pod-card">
                <div className={`pod-otp-row ${otpVerified ? 'verified' : 'unverified'}`}>
                  <div className="pod-otp-icon"><i className={`fas ${otpVerified ? 'fa-check-circle' : 'fa-times-circle'}`}></i></div>
                  <div className="pod-otp-text"><strong>OTP Verification</strong><span>{otpVerified ? 'Verified by rider' : 'Not yet verified'}</span></div>
                  {otpVerified && <span className="pod-otp-badge">Verified</span>}
                </div>
                {order.deliveryConfirmedAt && <div className="pod-timestamp"><i className="fas fa-clock"></i><span>Confirmed: {new Date(order.deliveryConfirmedAt).toLocaleString('en-PH')}</span></div>}
                {hasDeliveryProof && (
                  <div className="pod-photo-section">
                    <div className="pod-photo-header" onClick={() => setProofExpanded(!proofExpanded)}>
                      <div className="pod-photo-label"><i className="fas fa-camera"></i><strong>Delivery Photo</strong></div>
                      <button className="pod-toggle-btn"><i className={`fas ${proofExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>{proofExpanded ? 'Hide' : 'Show'}</button>
                    </div>
                    {proofExpanded && <div className="pod-photo-wrap"><img src={order.deliveryProofPhoto} alt="Proof" className="pod-photo" /><a href={order.deliveryProofPhoto} download={`proof-${order.orderId?.slice(-8)}.jpg`} className="pod-download-btn"><i className="fas fa-download"></i> Download</a></div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {hasRefund && (
            <div className="modal-section">
              <h3><i className="fas fa-undo-alt"></i> Refund Request</h3>
              <div className={`admin-refund-card admin-refund-${order.refundStatus}`}>
                <div className="admin-refund-details">
                  <div className="admin-refund-row"><span>Reason</span><strong>📦 Item arrived damaged</strong></div>
                  <div className="admin-refund-row admin-refund-amount-row"><span>Refund Amount</span><strong className="admin-refund-amount-value">₱{refundAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></div>
                  {order.refundMethod && (
                    <div className="admin-refund-row"><span>Refund to</span>
                      <strong className="admin-refund-method-cell">
                        <i className={`fas ${REFUND_METHOD_LABELS[order.refundMethod]?.icon}`} style={{ color: REFUND_METHOD_LABELS[order.refundMethod]?.color }}></i>
                        <span style={{ color: REFUND_METHOD_LABELS[order.refundMethod]?.color }}>{REFUND_METHOD_LABELS[order.refundMethod]?.label}</span>
                        {' · '}{order.refundAccountName}{order.refundAccountNumber ? ` (${order.refundAccountNumber})` : ''}
                      </strong>
                    </div>
                  )}
                  {order.refundComment && <div className="admin-refund-row"><span>Customer note</span><strong style={{ fontStyle: 'italic' }}>"{order.refundComment}"</strong></div>}
                  <div className="admin-refund-row"><span>Requested at</span><strong>{order.refundRequestedAt ? new Date(order.refundRequestedAt).toLocaleString('en-PH') : '—'}</strong></div>
                  {order.refundStatus !== 'requested' && order.refundResolvedAt && <div className="admin-refund-row"><span>Resolved at</span><strong>{new Date(order.refundResolvedAt).toLocaleString('en-PH')}</strong></div>}
                  {order.refundAdminNote && <div className="admin-refund-row"><span>Admin note</span><strong>{order.refundAdminNote}</strong></div>}
                </div>
                {order.refundPhotoId && (
                  <div className="admin-refund-photo-section">
                    <div className="admin-refund-photo-header" onClick={() => setPhotoExpanded2(!photoExpanded2)}>
                      <div className="admin-refund-photo-label"><i className="fas fa-camera"></i><strong>Damage Photo</strong></div>
                      <button className="pod-toggle-btn" type="button"><i className={`fas ${photoExpanded2 ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>{photoExpanded2 ? 'Hide' : 'View'}</button>
                    </div>
                    {photoExpanded2 && (
                      <div className="admin-refund-photo-wrap">
                        {refundPhotoUrl ? <><img src={refundPhotoUrl} alt="Damage" className="admin-refund-photo" /><a href={refundPhotoUrl} download={`damage-${order.orderId?.slice(-8)}.jpg`} className="pod-download-btn"><i className="fas fa-download"></i> Download</a></> : <div className="admin-refund-photo-loading"><i className="fas fa-spinner fa-spin"></i> Loading…</div>}
                      </div>
                    )}
                  </div>
                )}
                {order.refundStatus === 'requested' && (
                  <div className="admin-refund-action">
                    <div className="admin-refund-confirm-notice"><i className="fas fa-info-circle"></i><span>Approving will refund <strong>₱{refundAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong> to customer's {REFUND_METHOD_LABELS[order.refundMethod]?.label || 'account'}{order.refundAccountNumber ? ` (${order.refundAccountNumber})` : ''}. Send money first before approving.</span></div>
                    <label className="admin-refund-note-label"><i className="fas fa-comment-alt"></i> Response note <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
                    <textarea className="admin-refund-note-input" placeholder="e.g. We've processed your refund…" value={refundAdminNote} onChange={e => setRefundAdminNote(e.target.value)} rows={2} maxLength={300} />
                    <div className="admin-refund-action-btns">
                      <button className="admin-refund-reject-btn" onClick={() => setShowRejectConfirm(true)} disabled={resolvingRefund}>{resolvingRefund ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-times-circle"></i>} Reject</button>
                      <button className="admin-refund-approve-btn" onClick={() => handleRefundResolve('approved')} disabled={resolvingRefund}>{resolvingRefund ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-circle"></i>} Approve & Mark Paid</button>
                    </div>
                  </div>
                )}
                {order.refundStatus === 'approved' && <div className="admin-refund-resolved approved"><i className="fas fa-check-circle"></i><span>Refund of <strong>₱{refundAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong> approved and paid.</span></div>}
                {order.refundStatus === 'rejected' && <div className="admin-refund-resolved rejected"><i className="fas fa-times-circle"></i><span>Refund request rejected.</span></div>}
              </div>
            </div>
          )}

          <div className="modal-section">
            <h3><i className="fas fa-info-circle"></i> Order Information</h3>
            <div className="order-info-grid">
              <div className="info-item"><label>Order ID</label><strong>#{order.orderId}</strong></div>
              <div className="info-item"><label>Date</label><span>{order._creationTime ? new Date(order._creationTime).toLocaleString('en-PH') : 'N/A'}</span></div>
              <div className="info-item"><label>Payment Method</label><span className="method-display" style={{ color: pm.color }}><i className={`fas ${pm.icon}`}></i> {pm.label}</span></div>
              <div className="info-item"><label>Payment Status</label><span className={`payment-badge ${isPaid ? 'paid' : 'pending'}`}>{isPaid ? 'Paid' : 'Pending'}</span></div>
            </div>
          </div>

          {hasPromo && (
            <div className="modal-section">
              <h3><i className="fas fa-tag"></i> Promo Applied</h3>
              <div className="promo-admin-card">
                <div className="promo-admin-top"><div className="promo-admin-badge"><i className="fas fa-ticket-alt"></i><span>{order.promoCode}</span></div></div>
                <div className="promo-admin-details">
                  {order.discountPercent > 0 && <div className="promo-admin-row"><span>Discount</span><strong>{order.discountPercent}% off</strong></div>}
                  <div className="promo-admin-row discount"><span>Amount Saved</span><strong>−₱{discount.toLocaleString('en-PH')}</strong></div>
                  <div className="promo-admin-row final"><span>Final Charged</span><strong>₱{finalTotal.toLocaleString('en-PH')}</strong></div>
                </div>
              </div>
            </div>
          )}

          <div className="modal-section">
            <h3><i className="fas fa-box"></i> Order Items ({order.items?.length || 0})</h3>
            <div className="order-items-list">
              {order.items?.map((item, index) => (
                <div key={index} className="order-item-card">
                  <div className="item-image"><img src={item.image} alt={item.name || 'Product'} onError={e => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/80x80?text=No+Image'; }} /></div>
                  <div className="item-details"><strong>{item.name || 'N/A'}</strong><p className="item-price">₱{(item.price || 0).toLocaleString('en-PH')} x {item.quantity || 0}</p></div>
                  <div className="item-subtotal">₱{((item.quantity || 0) * (item.price || 0)).toLocaleString('en-PH')}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="modal-section">
            <h3><i className="fas fa-calculator"></i> Order Summary</h3>
            <div className="order-totals">
              <div className="total-row"><span>Subtotal:</span><strong>₱{subtotal.toLocaleString('en-PH')}</strong></div>
              <div className="total-row"><span>Shipping:</span><strong>₱{shippingFee.toLocaleString('en-PH')}</strong></div>
              {hasPromo && <>
                <div className="total-row promo-discount-admin-row"><span><i className="fas fa-tag" style={{ marginRight: '6px', color: '#ec4899' }}></i>Promo ({order.promoCode}):</span><strong>−₱{discount.toLocaleString('en-PH')}</strong></div>
                <div className="total-row"><span style={{ color: '#6b7280' }}>Original:</span><strong style={{ color: '#6b7280', textDecoration: 'line-through' }}>₱{originalTotal.toLocaleString('en-PH')}</strong></div>
              </>}
              <div className="total-row grand-total"><span>{hasPromo ? 'Final Charged:' : 'Total:'}</span><strong>₱{finalTotal.toLocaleString('en-PH')}</strong></div>
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
              <div className="rider-managed-notice"><i className="fas fa-motorcycle"></i><div><strong>Rider handling delivery</strong><p>Status updates automatically via OTP + photo.</p></div></div>
            )}
            {!isDone && !isRiderManaged && (
              <div className="status-buttons">
                <div className="status-btn-wrapper">
                  <button className={`status-btn confirmed ${currentStatus === 'confirmed' ? 'is-current' : ''} ${!canConfirm ? 'is-blocked' : ''}`} onClick={() => canConfirm && onUpdateStatus(order.orderId, 'confirmed')} disabled={!canConfirm}>
                    <i className="fas fa-check-circle"></i><span>Confirm Order</span>
                    {currentStatus === 'confirmed' && <span className="current-indicator">Current</span>}
                  </button>
                  {!isPaid && <div className="block-reason"><i className="fas fa-lock"></i> Awaiting payment</div>}
                  {isPaid && currentStatus === 'confirmed' && <div className="block-reason" style={{ color: '#17a2b8' }}><i className="fas fa-check"></i> Already confirmed</div>}
                </div>
                {canCancel && (
                  <div className="status-btn-wrapper">
                    <button className="status-btn cancelled" onClick={() => setShowCancelModal(true)}><i className="fas fa-times-circle"></i><span>Cancel Order</span></button>
                  </div>
                )}
              </div>
            )}

            {isPaid && !isDone && (
              <div className="notify-customer-section">
                <div className="notify-section-label"><i className="fas fa-bell"></i> Notify Customer — Out for Delivery</div>
                {alreadyNotified ? (
                  <div className="notify-done-banner">
                    <i className="fas fa-check-circle"></i> Customer already notified — Out for Delivery
                    {order.deliveryOtp && <span className="notify-otp-inline"> · OTP: <strong>{order.deliveryOtp}</strong></span>}
                  </div>
                ) : !order.riderInfo?.name ? (
                  <div className="notify-no-rider">
                    <i className="fas fa-exclamation-triangle"></i> Set rider info in <strong>Delivery Management</strong> first before notifying
                  </div>
                ) : (
                  <>
                    <div className="notify-rider-preview">
                      <i className="fas fa-motorcycle"></i> {order.riderInfo.name}
                      {order.riderInfo.phone && <> · {order.riderInfo.phone}</>}
                      {order.riderInfo.plate && <> · {order.riderInfo.plate}</>}
                    </div>
                    <button
                      className={`notify-customer-btn ${notified ? 'notify-customer-btn--done' : ''}`}
                      onClick={handleNotifyCustomer}
                      disabled={notifying || !canNotify}
                    >
                      {notifying
                        ? <><i className="fas fa-spinner fa-spin"></i> Sending…</>
                        : notified
                        ? <><i className="fas fa-check-circle"></i> Customer Notified!</>
                        : <><i className="fas fa-bell"></i> Notify Customer (Out for Delivery)</>}
                    </button>
                    {notified && order.deliveryOtp && (
                      <div className="notify-otp-display">Generated OTP: <strong>{order.deliveryOtp}</strong></div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {currentStatus === 'cancelled' && order.cancelReason && (
            <div className="modal-section">
              <h3><i className="fas fa-ban"></i> Cancellation Reason</h3>
              <div className="cancel-reason-display"><i className="fas fa-quote-left"></i><p>{order.cancelReason}</p></div>
            </div>
          )}

          <div className="modal-actions">
            <button className="delete-order-btn" onClick={() => onDelete(order.orderId)}><i className="fas fa-trash"></i> Delete Order</button>
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

      {showRejectConfirm && (
        <RejectConfirmDialog
          order={order}
          adminNote={refundAdminNote}
          onConfirm={() => handleRefundResolve('rejected')}
          onCancel={() => setShowRejectConfirm(false)}
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
          <p className="cancel-reason-prompt">Select or enter a cancellation reason.</p>
          <div className="cancel-presets">
            {CANCEL_PRESETS.map(preset => (
              <button key={preset} className={`cancel-preset-chip ${selectedPreset === preset ? 'active' : ''}`} onClick={() => { setSelectedPreset(preset); setError(''); if (preset !== 'Other reason') setCustomReason(''); }}>
                {selectedPreset === preset && <i className="fas fa-check"></i>} {preset}
              </button>
            ))}
          </div>
          {isOther && (
            <div className="cancel-custom-wrap">
              <label>Specify reason <span className="required">*</span></label>
              <textarea className="cancel-custom-input" placeholder="Type cancellation reason…" value={customReason} onChange={e => { setCustomReason(e.target.value); setError(''); }} rows={3} maxLength={300} autoFocus />
              <div className="char-count">{customReason.length}/300</div>
            </div>
          )}
          {error && <div className="cancel-error"><i className="fas fa-exclamation-circle"></i> {error}</div>}
        </div>
        <div className="cancel-reason-footer">
          <button className="cancel-go-back-btn" onClick={onClose}><i className="fas fa-arrow-left"></i> Go Back</button>
          <button className="cancel-confirm-btn" onClick={() => { if (!finalReason) { setError('Please select or enter a reason.'); return; } onConfirm(finalReason); }} disabled={!finalReason}>
            <i className="fas fa-ban"></i> Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminOrders;
/* NOTE: Add this to the bottom of AdminOrders.css */