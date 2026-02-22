import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './RiderDashboard.css';

const RiderDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('available');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState({});
  const [expandedPickups, setExpandedPickups] = useState({});
  const [expandedDeliveries, setExpandedDeliveries] = useState({});
  const [otpInputs, setOtpInputs] = useState({});
  const [photoData, setPhotoData] = useState({});
  const [otpErrors, setOtpErrors] = useState({});
  const [confirmingId, setConfirmingId] = useState(null);
  const [notifyingId, setNotifyingId] = useState(null);
  const fileInputRefs = useRef({});

  // ── CONVEX QUERIES ──
  const riderInfo = useQuery(
    api.riders.getRiderByEmail,
    user?.email ? { email: user.email } : 'skip'
  );

  const allOrders = useQuery(api.orders.getAllOrders) || [];
  const allPickups = useQuery(api.pickupRequests.getAllPickupRequests) || [];

  // ── CONVEX MUTATIONS ──
  const createPickupRequest = useMutation(api.pickupRequests.createPickupRequest);
  const updateOrderStatus = useMutation(api.orders.updateOrderStatus);
  const updateOrderFields = useMutation(api.orders.updateOrderFields);
  const updatePickupStatus = useMutation(api.pickupRequests.updatePickupStatus);
  const deletePickupRequest = useMutation(api.pickupRequests.deletePickupRequest);

  // ── DERIVED DATA ──
  const confirmedOrders = allOrders.filter(o =>
    (o.orderStatus === 'confirmed' || o.status === 'Confirmed') &&
    !allPickups.some(p => p.orderId === o.orderId && p.status === 'approved')
  );

  const myPickups = allPickups.filter(p => p.riderEmail === user?.email);
  const myDeliveries = myPickups.filter(p =>
    p.status === 'approved' || p.status === 'out_for_delivery'
  );

  const pendingPickupsCount = myPickups.filter(p => p.status === 'pending').length;
  const activeDeliveriesCount = myDeliveries.length;

  // ── HELPERS ──
  const toggleExpanded = (id, setFn) => setFn(prev => ({ ...prev, [id]: !prev[id] }));

  const getMyRequestStatus = (orderId) => {
    const req = myPickups.find(p => p.orderId === orderId);
    return req ? req.status : null;
  };

  const getPickupStatusStyle = (status) => {
    const map = {
      pending:          { bg: '#fff3cd', color: '#856404' },
      approved:         { bg: '#d1fae5', color: '#0f5132' },
      rejected:         { bg: '#fee2e2', color: '#991b1b' },
      out_for_delivery: { bg: '#dbeafe', color: '#1e40af' },
      completed:        { bg: '#d1fae5', color: '#065f46' },
    };
    return map[status] || { bg: '#e2e8f0', color: '#475569' };
  };

  const getStatusLabel = (status) => {
    const map = {
      pending: '⏳ Pending',
      approved: '✅ Approved',
      rejected: '❌ Rejected',
      out_for_delivery: '🚚 Out for Delivery',
      completed: '🎉 Delivered',
    };
    return map[status] || status;
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
      navigate('/', { replace: true });
    }
  };

  const handleNavClick = (newTab) => {
    setTab(newTab);
    setSidebarOpen(false);
  };

  // ── ACTIONS ──
  const requestPickup = async (order) => {
    if (!riderInfo) return;

    const alreadyApproved = allPickups.find(
      p => p.orderId === order.orderId && p.status === 'approved'
    );
    if (alreadyApproved) {
      alert('❌ Sorry! Another rider was already approved for this order.');
      return;
    }

    const alreadyRequested = myPickups.find(
      p => p.orderId === order.orderId && p.status === 'pending'
    );
    if (alreadyRequested) {
      alert('You already have a pending request for this order.');
      return;
    }

    try {
      await createPickupRequest({
        orderId: order.orderId,
        riderId: riderInfo._id,
        riderName: riderInfo.fullName,
        riderEmail: user.email,
        riderPhone: riderInfo.phone || '',
        riderVehicle: riderInfo.vehicleType || '',
        riderPlate: riderInfo.plateNumber || '',
        customerName: order.customerName || order.name || '',
        total: order.total || 0,
        requestedAt: new Date().toISOString(),
        status: 'pending',
      });
      alert('✅ Pickup request sent! Waiting for admin approval.');
    } catch (err) {
      console.error(err);
      alert('Failed to send pickup request. Please try again.');
    }
  };

  const notifyCustomer = async (delivery) => {
    if (!window.confirm(`Notify "${delivery.customerName}" that their order is on the way?`)) return;
    setNotifyingId(delivery._id);

    try {
      await updateOrderFields({
        orderId: delivery.orderId,
        orderStatus: 'out_for_delivery',
        status: 'Out for Delivery',
        riderInfo: {
          name: riderInfo.fullName,
          phone: riderInfo.phone,
          vehicle: riderInfo.vehicleType,
          plate: riderInfo.plateNumber,
        },
      });

      await updatePickupStatus({
        requestId: delivery._id,
        status: 'out_for_delivery',
      });

      alert('📦 Customer notified!\n\nAsk the customer for their OTP code when you arrive.');
    } catch (err) {
      console.error(err);
      alert('Failed to notify customer. Please try again.');
    } finally {
      setNotifyingId(null);
    }
  };

  const handlePhotoSelect = (deliveryId, file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setOtpErrors(prev => ({ ...prev, [deliveryId]: 'Photo must be under 5MB.' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setPhotoData(prev => ({ ...prev, [deliveryId]: e.target.result }));
      setOtpErrors(prev => ({ ...prev, [deliveryId]: '' }));
    };
    reader.readAsDataURL(file);
  };

  const confirmDelivery = async (delivery) => {
    const inputOtp = (otpInputs[delivery._id] || '').trim();
    const photo = photoData[delivery._id];

    const order = allOrders.find(o => o.orderId === delivery.orderId);

    if (!order) {
      setOtpErrors(prev => ({ ...prev, [delivery._id]: 'Order not found.' }));
      return;
    }
    if (!inputOtp) {
      setOtpErrors(prev => ({ ...prev, [delivery._id]: 'Please enter the OTP from the customer.' }));
      return;
    }
    if (!order.deliveryOtp) {
      setOtpErrors(prev => ({
        ...prev,
        [delivery._id]: '⏳ The customer has not generated their OTP yet. Ask them to open their tracking page.',
      }));
      return;
    }
    if (inputOtp !== order.deliveryOtp) {
      setOtpErrors(prev => ({
        ...prev,
        [delivery._id]: '❌ Incorrect OTP. Please ask the customer for the correct code.',
      }));
      return;
    }

    if (!window.confirm('Confirm delivery? This will mark the order as Completed.')) return;

    setConfirmingId(delivery._id);
    const timestamp = new Date().toISOString();

    try {
      await updateOrderFields({
        orderId: delivery.orderId,
        orderStatus: 'completed',
        status: 'Delivered',
        deliveryOtpVerified: true,
        deliveryConfirmedAt: timestamp,
        ...(photo ? { deliveryProofPhoto: photo } : {}),
      });

      await updatePickupStatus({
        requestId: delivery._id,
        status: 'completed',
      });

      setOtpInputs(prev => { const n = { ...prev }; delete n[delivery._id]; return n; });
      setPhotoData(prev => { const n = { ...prev }; delete n[delivery._id]; return n; });
      setOtpErrors(prev => { const n = { ...prev }; delete n[delivery._id]; return n; });

      alert('🎉 Delivery confirmed! Order marked as Completed.');
    } catch (err) {
      console.error(err);
      alert('Failed to confirm delivery. Please try again.');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDeletePickup = async (pickupId, status) => {
    if (['approved', 'out_for_delivery'].includes(status)) {
      alert('❌ Cannot delete an active pickup. Complete the delivery first.');
      return;
    }
    if (!window.confirm('Remove this pickup record from your list?')) return;
    try {
      await deletePickupRequest({ requestId: pickupId });
    } catch (err) {
      console.error(err);
      alert('Failed to remove pickup.');
    }
  };

  // ── LOADING / NOT APPROVED ──
  if (riderInfo === undefined) {
    return (
      <div className="rider-dashboard">
        <div className="rider-not-approved">
          <div className="rider-na-icon">🛵</div>
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!riderInfo || riderInfo.status !== 'approved') {
    return (
      <div className="rider-dashboard">
        <div className="rider-not-approved">
          <div className="rider-na-icon">🛵</div>
          <h2>Account Pending Approval</h2>
          <p>Your rider application is still being reviewed by the admin. Please wait for approval before accessing the dashboard.</p>
          <button className="rider-logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rider-dashboard">

      {/* BURGER */}
      <button className="rider-burger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
        <i className="fas fa-bars"></i>
      </button>

      {/* OVERLAY */}
      <div className={`rider-sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* SIDEBAR */}
      <aside className={`rider-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="rider-sidebar-header">
          <div>
            <div className="rider-logo"><i className="fas fa-motorcycle"></i><span>DKMerch</span></div>
            <div className="rider-tagline">Rider Dashboard</div>
          </div>
          <button className="rider-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="rider-profile-card">
          <div className="rider-avatar"><i className="fas fa-user-circle"></i></div>
          <div className="rider-profile-info">
            <strong>{riderInfo.fullName}</strong>
            <span>{riderInfo.vehicleType}</span>
            <span className="rider-plate">{riderInfo.plateNumber}</span>
          </div>
        </div>

        <nav className="rider-nav">
          <button className={`rider-nav-link ${tab === 'available' ? 'active' : ''}`} onClick={() => handleNavClick('available')}>
            <i className="fas fa-box-open"></i>
            <span>Available Orders</span>
            {confirmedOrders.length > 0 && <span className="rider-nav-badge">{confirmedOrders.length}</span>}
          </button>
          <button className={`rider-nav-link ${tab === 'my-pickups' ? 'active' : ''}`} onClick={() => handleNavClick('my-pickups')}>
            <i className="fas fa-truck-pickup"></i>
            <span>My Pickups</span>
            {pendingPickupsCount > 0 && <span className="rider-nav-badge">{pendingPickupsCount}</span>}
          </button>
          <button className={`rider-nav-link ${tab === 'deliver' ? 'active' : ''}`} onClick={() => handleNavClick('deliver')}>
            <i className="fas fa-shipping-fast"></i>
            <span>Deliver</span>
            {activeDeliveriesCount > 0 && <span className="rider-nav-badge rider-nav-badge-green">{activeDeliveriesCount}</span>}
          </button>
        </nav>

        <div className="rider-sync-indicator">
          <span className="sync-dot"></span>
          <span className="sync-text">Live • Real-time</span>
        </div>

        <button className="rider-logout-btn" onClick={handleLogout}>
          <i className="fas fa-sign-out-alt"></i><span>Logout</span>
        </button>
      </aside>

      {/* MAIN */}
      <main className="rider-main">

        {/* ═══ AVAILABLE ORDERS ═══ */}
        {tab === 'available' && (
          <div className="rider-content">
            <div className="rider-page-header">
              <div className="rider-page-header-top">
                <div>
                  <h1>📦 Available Orders</h1>
                  <p>Confirmed orders ready for pickup.</p>
                </div>
                <div className="rider-live-badge">
                  <span className="sync-dot"></span>
                  Live Updates
                </div>
              </div>
            </div>

            {confirmedOrders.length === 0 ? (
              <div className="rider-empty">
                <i className="fas fa-box-open"></i>
                <p>No confirmed orders available right now.</p>
                <span>Updates are real-time via Convex.</span>
              </div>
            ) : (
              <div className="rider-compact-list">
                {confirmedOrders.map(order => {
                  const reqStatus = getMyRequestStatus(order.orderId);
                  const isExpanded = expandedOrders[order.orderId];
                  return (
                    <div key={order.orderId} className="rider-compact-card">
                      <div className="rider-compact-row">
                        <div className="rider-compact-left">
                          <span className="rider-order-id">#{order.orderId?.slice(-8)}</span>
                          <span className="rider-compact-customer"><i className="fas fa-user"></i> {order.customerName || order.name || 'N/A'}</span>
                          <span className="rider-compact-total">₱{(order.total || 0).toLocaleString()}</span>
                        </div>
                        <div className="rider-compact-right">
                          {reqStatus === 'pending'          && <span className="rider-req-badge pending">⏳ Pending</span>}
                          {reqStatus === 'approved'         && <span className="rider-req-badge approved">✅ Assigned</span>}
                          {reqStatus === 'rejected'         && <span className="rider-req-badge rejected">❌ Rejected</span>}
                          {reqStatus === 'out_for_delivery' && <span className="rider-req-badge out-delivery">🚚 On Way</span>}
                          {reqStatus === 'completed'        && <span className="rider-req-badge completed-badge">✅ Done</span>}
                          {!reqStatus && (
                            <button className="rider-pickup-btn-sm" onClick={() => requestPickup(order)}>
                              <i className="fas fa-truck-pickup"></i> Request
                            </button>
                          )}
                          <button className="rider-view-btn" onClick={() => toggleExpanded(order.orderId, setExpandedOrders)}>
                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i> {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="rider-expanded-body">
                          <div className="rider-info-row"><i className="fas fa-map-marker-alt"></i><span><strong>Address:</strong> {order.shippingAddress || order.address || 'N/A'}</span></div>
                          <div className="rider-info-row"><i className="fas fa-phone"></i><span><strong>Phone:</strong> {order.phone || 'N/A'}</span></div>
                          <div className="rider-info-row"><i className="fas fa-box"></i><span><strong>Items:</strong> {order.items?.length || 0} item(s)</span></div>
                          <div className="rider-info-row"><i className="fas fa-calendar"></i><span><strong>Date:</strong> {new Date(order._creationTime).toLocaleDateString('en-PH')}</span></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ MY PICKUPS ═══ */}
        {tab === 'my-pickups' && (
          <div className="rider-content">
            <div className="rider-page-header">
              <h1>🚚 My Pickup Requests</h1>
              <p>Track your pickup request statuses. Approved ones will appear in the <strong>Deliver</strong> tab.</p>
            </div>

            {myPickups.length === 0 ? (
              <div className="rider-empty">
                <i className="fas fa-truck-pickup"></i>
                <p>No pickup requests yet.</p>
                <span>Go to Available Orders to request your first pickup!</span>
              </div>
            ) : (
              <div className="rider-compact-list">
                {myPickups.map(req => {
                  const style = getPickupStatusStyle(req.status);
                  const isExpanded = expandedPickups[req._id];
                  return (
                    <div key={req._id} className="rider-compact-card">
                      <div className="rider-compact-row">
                        <div className="rider-compact-left">
                          <span className="rider-order-id">#{req.orderId?.slice(-8)}</span>
                          <span className="rider-compact-customer"><i className="fas fa-user"></i> {req.customerName}</span>
                          <span className="rider-compact-total">₱{(req.total || 0).toLocaleString()}</span>
                        </div>
                        <div className="rider-compact-right">
                          <span className="rider-status-pill" style={{ background: style.bg, color: style.color }}>
                            {getStatusLabel(req.status)}
                          </span>
                          <button className="rider-view-btn" onClick={() => toggleExpanded(req._id, setExpandedPickups)}>
                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i> {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="rider-expanded-body">
                          <div className="rider-info-row"><i className="fas fa-calendar"></i><span><strong>Requested:</strong> {new Date(req.requestedAt).toLocaleDateString('en-PH')}</span></div>
                          {req.status === 'approved'         && <div className="rider-approved-notice">🎉 Pickup approved! Go to the <strong>Deliver</strong> tab to notify the customer.</div>}
                          {req.status === 'rejected'         && <div className="rider-rejected-notice">This pickup request was not approved. You may request other available orders.</div>}
                          {req.status === 'out_for_delivery' && <div className="rider-ofd-notice">🚚 Customer notified. Go to <strong>Deliver</strong> tab to confirm delivery.</div>}
                          {req.status === 'completed'        && <div className="rider-completed-notice">🎉 Delivery confirmed and completed!</div>}
                          {['completed', 'rejected', 'pending'].includes(req.status) && (
                            <button className="rider-delete-btn" onClick={() => handleDeletePickup(req._id, req.status)}>
                              <i className="fas fa-trash-alt"></i> Remove from List
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ DELIVER ═══ */}
        {tab === 'deliver' && (
          <div className="rider-content">
            <div className="rider-page-header">
              <h1>🚀 Deliver</h1>
              <p>Notify the customer you're on the way, then confirm delivery with their OTP.</p>
            </div>

            {myDeliveries.length === 0 ? (
              <div className="rider-empty">
                <i className="fas fa-shipping-fast"></i>
                <p>No deliveries ready yet.</p>
                <span>Approved pickups will appear here once admin approves your request.</span>
              </div>
            ) : (
              <div className="rider-compact-list">
                {myDeliveries.map(delivery => {
                  const isOutForDelivery = delivery.status === 'out_for_delivery';
                  const isApproved = delivery.status === 'approved';
                  const isExpanded = expandedDeliveries[delivery._id];
                  const errMsg = otpErrors[delivery._id];
                  const hasPhoto = !!photoData[delivery._id];

                  return (
                    <div key={delivery._id} className="rider-compact-card">
                      <div className="rider-compact-row">
                        <div className="rider-compact-left">
                          <span className="rider-order-id">#{delivery.orderId?.slice(-8)}</span>
                          <span className="rider-compact-customer"><i className="fas fa-user"></i> {delivery.customerName || 'N/A'}</span>
                          <span className="rider-compact-total">₱{(delivery.total || 0).toLocaleString()}</span>
                        </div>
                        <div className="rider-compact-right">
                          <span className={`rider-delivery-badge ${isOutForDelivery ? 'badge-ofd' : ''}`}>
                            {isOutForDelivery ? '🚚 On the Way' : '✅ Pickup Approved'}
                          </span>
                          <button className="rider-view-btn" onClick={() => toggleExpanded(delivery._id, setExpandedDeliveries)}>
                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i> {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="rider-expanded-body">
                          <div className="rider-expanded-section">
                            <div className="rider-expanded-section-title"><i className="fas fa-user"></i> Customer Info</div>
                            <div className="rider-info-row"><i className="fas fa-map-marker-alt"></i><span><strong>Address:</strong> {delivery.customerAddress || 'N/A'}</span></div>
                          </div>

                          <div className="rider-expanded-section rider-info-preview">
                            <div className="rider-expanded-section-title"><i className="fas fa-id-badge"></i> Your Info (visible to customer)</div>
                            <div className="rider-info-row"><i className="fas fa-user"></i><span><strong>Name:</strong> {riderInfo.fullName}</span></div>
                            <div className="rider-info-row"><i className="fas fa-phone"></i><span><strong>Phone:</strong> {riderInfo.phone}</span></div>
                            <div className="rider-info-row"><i className="fas fa-motorcycle"></i><span><strong>Vehicle:</strong> {riderInfo.vehicleType}</span></div>
                            <div className="rider-info-row"><i className="fas fa-id-card"></i><span><strong>Plate:</strong> {riderInfo.plateNumber}</span></div>
                          </div>

                          {isApproved && (
                            <button
                              className={`rider-notify-btn ${notifyingId === delivery._id ? 'notifying' : ''}`}
                              onClick={() => notifyCustomer(delivery)}
                              disabled={notifyingId === delivery._id}
                            >
                              {notifyingId === delivery._id
                                ? <><i className="fas fa-spinner fa-spin"></i> Notifying...</>
                                : <><i className="fas fa-bell"></i> Notify Customer — I'm On My Way!</>}
                            </button>
                          )}

                          {isOutForDelivery && (
                            <div className="rider-confirm-delivery-section">
                              <div className="rider-confirm-title"><i className="fas fa-shield-alt"></i> Confirm Delivery</div>
                              <p className="rider-confirm-desc">Enter the <strong>OTP code</strong> from the customer's tracking page.</p>

                              <div className="rider-otp-hint">
                                <i className="fas fa-info-circle"></i>
                                <span>Ask the customer to open their <strong>Track Order</strong> page and tap <strong>"Generate My OTP"</strong>.</span>
                              </div>

                              <div className="rider-otp-group">
                                <label className="rider-otp-label">
                                  <i className="fas fa-key"></i> Customer OTP Code
                                  <span className="otp-required-tag">*Required</span>
                                </label>
                                <input
                                  type="text"
                                  className="rider-otp-input"
                                  placeholder="Enter 4-digit OTP"
                                  maxLength={4}
                                  value={otpInputs[delivery._id] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                    setOtpInputs(prev => ({ ...prev, [delivery._id]: val }));
                                    setOtpErrors(prev => ({ ...prev, [delivery._id]: '' }));
                                  }}
                                />
                              </div>

                              <div className="rider-photo-group">
                                <label className="rider-otp-label">
                                  <i className="fas fa-camera"></i> Photo Proof
                                  <span className="otp-optional-tag">(Optional)</span>
                                </label>
                                <div
                                  className={`rider-photo-dropzone ${hasPhoto ? 'has-photo' : ''}`}
                                  onClick={() => fileInputRefs.current[delivery._id]?.click()}
                                >
                                  {hasPhoto ? (
                                    <div className="rider-photo-preview-wrap">
                                      <img src={photoData[delivery._id]} alt="Proof" className="rider-photo-preview" />
                                      <div className="rider-photo-change-overlay"><i className="fas fa-camera"></i><span>Change Photo</span></div>
                                    </div>
                                  ) : (
                                    <div className="rider-photo-placeholder">
                                      <i className="fas fa-cloud-upload-alt"></i>
                                      <span>Click to upload photo (optional)</span>
                                      <small>JPG, PNG — max 5MB</small>
                                    </div>
                                  )}
                                </div>
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  ref={el => (fileInputRefs.current[delivery._id] = el)}
                                  onChange={(e) => handlePhotoSelect(delivery._id, e.target.files[0])}
                                />
                              </div>

                              {errMsg && (
                                <div className="rider-confirm-error">
                                  <i className="fas fa-exclamation-circle"></i> {errMsg}
                                </div>
                              )}

                              <button
                                className={`rider-confirm-btn ${confirmingId === delivery._id ? 'confirming' : ''}`}
                                onClick={() => confirmDelivery(delivery)}
                                disabled={confirmingId === delivery._id}
                              >
                                {confirmingId === delivery._id
                                  ? <><i className="fas fa-spinner fa-spin"></i> Confirming Delivery...</>
                                  : <><i className="fas fa-check-circle"></i> Confirm Delivery</>}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default RiderDashboard;