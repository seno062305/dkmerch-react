import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './RiderDashboard.css';

const POLL_INTERVAL = 3000;

const RiderDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('available');
  const [confirmedOrders, setConfirmedOrders] = useState([]);
  const [myPickups, setMyPickups] = useState([]);
  const [myDeliveries, setMyDeliveries] = useState([]);
  const [riderInfo, setRiderInfo] = useState(null);
  const [notifyingId, setNotifyingId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [hasNewData, setHasNewData] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const prevDataRef = useRef('');
  const pollingRef = useRef(null);

  // expanded card tracking
  const [expandedOrders, setExpandedOrders] = useState({});
  const [expandedPickups, setExpandedPickups] = useState({});
  const [expandedDeliveries, setExpandedDeliveries] = useState({});

  // OTP + Photo state per delivery
  const [otpInputs, setOtpInputs] = useState({});
  const [photoData, setPhotoData] = useState({});
  const [otpErrors, setOtpErrors] = useState({});
  const [confirmingId, setConfirmingId] = useState(null);
  const fileInputRefs = useRef({});

  const fetchData = () => {
    const apps = JSON.parse(localStorage.getItem('dkmerch_rider_applications')) || [];
    const me = apps.find(a => a.email === user?.email && a.status === 'approved');
    setRiderInfo(me || null);

    const orders = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
    const pickups = JSON.parse(localStorage.getItem('dkmerch_pickup_requests')) || [];

    const confirmed = orders.filter(o =>
      o.orderStatus === 'confirmed' && !o.pickupApproved
    );

    const mine = pickups.filter(p => p.riderEmail === user?.email);

    const newSnapshot = JSON.stringify({ confirmed, mine });
    if (prevDataRef.current && prevDataRef.current !== newSnapshot) {
      setHasNewData(true);
      setTimeout(() => setHasNewData(false), 2000);
    }
    prevDataRef.current = newSnapshot;

    setConfirmedOrders(confirmed);
    setMyPickups(mine);
    setMyDeliveries(mine.filter(p => p.status === 'approved' || p.status === 'out_for_delivery'));
    setLastUpdated(new Date());
  };

  useEffect(() => {
    fetchData();
    window.addEventListener('orderUpdated', fetchData);
    window.addEventListener('pickupUpdated', fetchData);
    window.addEventListener('storage', fetchData);
    pollingRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => {
      clearInterval(pollingRef.current);
      window.removeEventListener('orderUpdated', fetchData);
      window.removeEventListener('pickupUpdated', fetchData);
      window.removeEventListener('storage', fetchData);
    };
  }, [user]);

  // Close sidebar on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
      navigate('/', { replace: true });
    }
  };

  const handleNavClick = (newTab) => {
    setTab(newTab);
    setSidebarOpen(false); // close sidebar on nav click (mobile)
  };

  const toggleExpanded = (id, setFn) => {
    setFn(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const requestPickup = (order) => {
    if (!riderInfo) return;
    const pickups = JSON.parse(localStorage.getItem('dkmerch_pickup_requests')) || [];

    const alreadyApproved = pickups.find(
      p => p.orderId === order.orderId && p.status === 'approved'
    );
    if (alreadyApproved) {
      alert('❌ Sorry! Another rider was already approved for this order.');
      fetchData();
      return;
    }

    const alreadyRequested = pickups.find(
      p => p.orderId === order.orderId && p.riderEmail === user?.email && p.status === 'pending'
    );
    if (alreadyRequested) {
      alert('You already have a pending request for this order.');
      return;
    }

    const newRequest = {
      id: 'pickup_' + Date.now(),
      orderId: order.orderId,
      riderId: riderInfo.id,
      riderName: riderInfo.fullName,
      riderEmail: user.email,
      riderPhone: riderInfo.phone,
      riderVehicle: riderInfo.vehicleType,
      riderPlate: riderInfo.plateNumber,
      customerName: order.customerName,
      customerAddress: order.address,
      customerPhone: order.phone,
      customerEmail: order.email,
      total: order.total,
      items: order.items,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };

    localStorage.setItem('dkmerch_pickup_requests', JSON.stringify([newRequest, ...pickups]));
    window.dispatchEvent(new Event('pickupUpdated'));
    fetchData();
    alert('✅ Pickup request sent! Waiting for admin approval.');
  };

  const notifyCustomer = (delivery) => {
    if (!window.confirm(`Notify "${delivery.customerName}" that their order is on the way?`)) return;
    setNotifyingId(delivery.id);

    const orders = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
    const updatedOrders = orders.map(o =>
      o.orderId === delivery.orderId
        ? {
            ...o,
            orderStatus: 'out_for_delivery',
            status: 'Out for Delivery',
            outForDeliveryAt: new Date().toISOString(),
            riderInfo: {
              name: riderInfo.fullName,
              phone: riderInfo.phone,
              vehicle: riderInfo.vehicleType,
              plate: riderInfo.plateNumber,
            },
          }
        : o
    );
    localStorage.setItem('dkmerch_orders', JSON.stringify(updatedOrders));

    const pickups = JSON.parse(localStorage.getItem('dkmerch_pickup_requests')) || [];
    const updatedPickups = pickups.map(p =>
      p.id === delivery.id
        ? { ...p, status: 'out_for_delivery', notifiedAt: new Date().toISOString() }
        : p
    );
    localStorage.setItem('dkmerch_pickup_requests', JSON.stringify(updatedPickups));

    window.dispatchEvent(new Event('orderUpdated'));
    window.dispatchEvent(new Event('pickupUpdated'));

    setTimeout(() => {
      setNotifyingId(null);
      fetchData();
      alert(`📦 Customer notified!\n\nAsk the customer for their OTP code when you arrive.`);
    }, 800);
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

  const confirmDelivery = (delivery) => {
    const inputOtp = (otpInputs[delivery.id] || '').trim();
    const photo = photoData[delivery.id];

    const orders = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
    const order = orders.find(o => o.orderId === delivery.orderId);

    if (!order) {
      setOtpErrors(prev => ({ ...prev, [delivery.id]: 'Order not found.' }));
      return;
    }
    if (!inputOtp) {
      setOtpErrors(prev => ({ ...prev, [delivery.id]: 'Please enter the OTP from the customer.' }));
      return;
    }
    if (!order.deliveryOtp) {
      setOtpErrors(prev => ({
        ...prev,
        [delivery.id]: '⏳ The customer has not generated their OTP yet. Ask them to open their tracking page and generate the code.',
      }));
      return;
    }
    if (inputOtp !== order.deliveryOtp) {
      setOtpErrors(prev => ({
        ...prev,
        [delivery.id]: '❌ Incorrect OTP. Please ask the customer for the correct code shown on their tracking page.',
      }));
      return;
    }

    if (!window.confirm('Confirm delivery? This will mark the order as Completed.')) return;

    setConfirmingId(delivery.id);
    const timestamp = new Date().toISOString();

    const updatedOrders = orders.map(o =>
      o.orderId === delivery.orderId
        ? {
            ...o,
            orderStatus: 'completed',
            status: 'Delivered',
            deliveredAt: timestamp,
            deliveryOtpVerified: true,
            ...(photo ? { deliveryProofPhoto: photo } : {}),
            deliveryConfirmedAt: timestamp,
          }
        : o
    );
    localStorage.setItem('dkmerch_orders', JSON.stringify(updatedOrders));

    const pickups = JSON.parse(localStorage.getItem('dkmerch_pickup_requests')) || [];
    const updatedPickups = pickups.map(p =>
      p.id === delivery.id
        ? { ...p, status: 'completed', deliveredAt: timestamp }
        : p
    );
    localStorage.setItem('dkmerch_pickup_requests', JSON.stringify(updatedPickups));

    window.dispatchEvent(new Event('orderUpdated'));
    window.dispatchEvent(new Event('pickupUpdated'));

    setTimeout(() => {
      setConfirmingId(null);
      setOtpInputs(prev => { const n = { ...prev }; delete n[delivery.id]; return n; });
      setPhotoData(prev => { const n = { ...prev }; delete n[delivery.id]; return n; });
      setOtpErrors(prev => { const n = { ...prev }; delete n[delivery.id]; return n; });
      fetchData();
      alert('🎉 Delivery confirmed! Order marked as Completed.');
    }, 800);
  };

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

  const deletePickup = (pickupId, status) => {
    const activeStatuses = ['approved', 'out_for_delivery'];
    if (activeStatuses.includes(status)) {
      alert('❌ Cannot delete an active pickup. Complete the delivery first.');
      return;
    }
    if (!window.confirm('Remove this pickup record from your list?')) return;
    const pickups = JSON.parse(localStorage.getItem('dkmerch_pickup_requests')) || [];
    const updated = pickups.filter(p => p.id !== pickupId);
    localStorage.setItem('dkmerch_pickup_requests', JSON.stringify(updated));
    window.dispatchEvent(new Event('pickupUpdated'));
    fetchData();
  };

  const pendingPickupsCount = myPickups.filter(p => p.status === 'pending').length;
  const activeDeliveriesCount = myDeliveries.length;

  const formatLastUpdated = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

  if (!riderInfo) {
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

      {/* ─── BURGER BUTTON (mobile) ─── */}
      <button
        className="rider-burger-btn"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
      >
        <i className="fas fa-bars"></i>
      </button>

      {/* ─── OVERLAY ─── */}
      <div
        className={`rider-sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* ─── SIDEBAR ─── */}
      <aside className={`rider-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="rider-sidebar-header">
          <div>
            <div className="rider-logo">
              <i className="fas fa-motorcycle"></i>
              <span>DKMerch</span>
            </div>
            <div className="rider-tagline">Rider Dashboard</div>
          </div>
          {/* Close button — visible on mobile */}
          <button
            className="rider-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="rider-profile-card">
          <div className="rider-avatar">
            <i className="fas fa-user-circle"></i>
          </div>
          <div className="rider-profile-info">
            <strong>{riderInfo.fullName}</strong>
            <span>{riderInfo.vehicleType}</span>
            <span className="rider-plate">{riderInfo.plateNumber}</span>
          </div>
        </div>

        <nav className="rider-nav">
          <button
            className={`rider-nav-link ${tab === 'available' ? 'active' : ''}`}
            onClick={() => handleNavClick('available')}
          >
            <i className="fas fa-box-open"></i>
            <span>Available Orders</span>
            {confirmedOrders.length > 0 && (
              <span className="rider-nav-badge">{confirmedOrders.length}</span>
            )}
          </button>

          <button
            className={`rider-nav-link ${tab === 'my-pickups' ? 'active' : ''}`}
            onClick={() => handleNavClick('my-pickups')}
          >
            <i className="fas fa-truck-pickup"></i>
            <span>My Pickups</span>
            {pendingPickupsCount > 0 && (
              <span className="rider-nav-badge">{pendingPickupsCount}</span>
            )}
          </button>

          <button
            className={`rider-nav-link ${tab === 'deliver' ? 'active' : ''}`}
            onClick={() => handleNavClick('deliver')}
          >
            <i className="fas fa-shipping-fast"></i>
            <span>Deliver</span>
            {activeDeliveriesCount > 0 && (
              <span className="rider-nav-badge rider-nav-badge-green">{activeDeliveriesCount}</span>
            )}
          </button>
        </nav>

        <div className="rider-sync-indicator">
          <span className={`sync-dot ${hasNewData ? 'pulse' : ''}`}></span>
          <span className="sync-text">Live • {formatLastUpdated(lastUpdated)}</span>
        </div>

        <button className="rider-logout-btn" onClick={handleLogout}>
          <i className="fas fa-sign-out-alt"></i>
          <span>Logout</span>
        </button>
      </aside>

      {/* ─── MAIN ─── */}
      <main className="rider-main">

        {hasNewData && (
          <div className="rider-update-banner">
            <i className="fas fa-sync-alt fa-spin"></i>
            Orders updated in real-time!
          </div>
        )}

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
                <span>Check back later — updates every few seconds.</span>
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
                          <span className="rider-compact-customer">
                            <i className="fas fa-user"></i> {order.customerName || 'N/A'}
                          </span>
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
                          <button
                            className="rider-view-btn"
                            onClick={() => toggleExpanded(order.orderId, setExpandedOrders)}
                          >
                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="rider-expanded-body">
                          <div className="rider-info-row">
                            <i className="fas fa-map-marker-alt"></i>
                            <span><strong>Address:</strong> {order.address || 'N/A'}</span>
                          </div>
                          <div className="rider-info-row">
                            <i className="fas fa-phone"></i>
                            <span><strong>Phone:</strong> {order.phone || 'N/A'}</span>
                          </div>
                          <div className="rider-info-row">
                            <i className="fas fa-box"></i>
                            <span><strong>Items:</strong> {order.items?.length || 0} item(s)</span>
                          </div>
                          <div className="rider-info-row">
                            <i className="fas fa-calendar"></i>
                            <span><strong>Date:</strong> {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-PH') : 'N/A'}</span>
                          </div>
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
                  const isExpanded = expandedPickups[req.id];
                  return (
                    <div key={req.id} className="rider-compact-card">
                      <div className="rider-compact-row">
                        <div className="rider-compact-left">
                          <span className="rider-order-id">#{req.orderId?.slice(-8)}</span>
                          <span className="rider-compact-customer">
                            <i className="fas fa-user"></i> {req.customerName}
                          </span>
                          <span className="rider-compact-total">₱{(req.total || 0).toLocaleString()}</span>
                        </div>
                        <div className="rider-compact-right">
                          <span
                            className="rider-status-pill"
                            style={{ background: style.bg, color: style.color }}
                          >
                            {getStatusLabel(req.status)}
                          </span>
                          <button
                            className="rider-view-btn"
                            onClick={() => toggleExpanded(req.id, setExpandedPickups)}
                          >
                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="rider-expanded-body">
                          <div className="rider-info-row">
                            <i className="fas fa-map-marker-alt"></i>
                            <span><strong>Deliver to:</strong> {req.customerAddress || 'N/A'}</span>
                          </div>
                          <div className="rider-info-row">
                            <i className="fas fa-calendar"></i>
                            <span><strong>Requested:</strong> {new Date(req.requestedAt).toLocaleDateString('en-PH')}</span>
                          </div>

                          {req.status === 'approved' && (
                            <div className="rider-approved-notice">
                              🎉 Pickup approved! Go to the <strong>Deliver</strong> tab to notify the customer.
                            </div>
                          )}
                          {req.status === 'rejected' && (
                            <div className="rider-rejected-notice">
                              This pickup request was not approved. You may request other available orders.
                            </div>
                          )}
                          {req.status === 'out_for_delivery' && (
                            <div className="rider-ofd-notice">
                              🚚 Customer notified. Go to <strong>Deliver</strong> tab to confirm delivery.
                            </div>
                          )}
                          {req.status === 'completed' && (
                            <div className="rider-completed-notice">
                              🎉 Delivery confirmed and completed!
                            </div>
                          )}

                          {['completed', 'rejected', 'pending'].includes(req.status) && (
                            <button
                              className="rider-delete-btn"
                              onClick={() => deletePickup(req.id, req.status)}
                            >
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

        {/* ═══ DELIVER TAB ═══ */}
        {tab === 'deliver' && (
          <div className="rider-content">
            <div className="rider-page-header">
              <h1>🚀 Deliver</h1>
              <p>
                Notify the customer you're on the way, then confirm delivery by entering the{' '}
                <strong>OTP the customer generates</strong> on their tracking page.
              </p>
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
                  const isExpanded = expandedDeliveries[delivery.id];
                  const errMsg = otpErrors[delivery.id];
                  const hasPhoto = !!photoData[delivery.id];

                  return (
                    <div key={delivery.id} className="rider-compact-card">
                      <div className="rider-compact-row">
                        <div className="rider-compact-left">
                          <span className="rider-order-id">#{delivery.orderId?.slice(-8)}</span>
                          <span className="rider-compact-customer">
                            <i className="fas fa-user"></i> {delivery.customerName || 'N/A'}
                          </span>
                          <span className="rider-compact-total">₱{(delivery.total || 0).toLocaleString()}</span>
                        </div>
                        <div className="rider-compact-right">
                          <span className={`rider-delivery-badge ${isOutForDelivery ? 'badge-ofd' : ''}`}>
                            {isOutForDelivery ? '🚚 On the Way' : '✅ Pickup Approved'}
                          </span>
                          {isApproved && (
                            <button
                              className="rider-delete-icon-btn"
                              title="Remove from list"
                              onClick={() => deletePickup(delivery.id, delivery.status)}
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          )}
                          <button
                            className="rider-view-btn"
                            onClick={() => toggleExpanded(delivery.id, setExpandedDeliveries)}
                          >
                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="rider-expanded-body">
                          <div className="rider-expanded-section">
                            <div className="rider-expanded-section-title">
                              <i className="fas fa-user"></i> Customer Info
                            </div>
                            <div className="rider-info-row">
                              <i className="fas fa-phone"></i>
                              <span><strong>Phone:</strong> {delivery.customerPhone || 'N/A'}</span>
                            </div>
                            <div className="rider-info-row">
                              <i className="fas fa-envelope"></i>
                              <span><strong>Email:</strong> {delivery.customerEmail || 'N/A'}</span>
                            </div>
                            <div className="rider-info-row">
                              <i className="fas fa-map-marker-alt"></i>
                              <span><strong>Address:</strong> {delivery.customerAddress || 'N/A'}</span>
                            </div>
                          </div>

                          <div className="rider-expanded-section rider-info-preview">
                            <div className="rider-expanded-section-title">
                              <i className="fas fa-id-badge"></i> Your Info (visible to customer)
                            </div>
                            <div className="rider-info-row">
                              <i className="fas fa-user"></i>
                              <span><strong>Name:</strong> {riderInfo.fullName}</span>
                            </div>
                            <div className="rider-info-row">
                              <i className="fas fa-phone"></i>
                              <span><strong>Phone:</strong> {riderInfo.phone}</span>
                            </div>
                            <div className="rider-info-row">
                              <i className="fas fa-motorcycle"></i>
                              <span><strong>Vehicle:</strong> {riderInfo.vehicleType}</span>
                            </div>
                            <div className="rider-info-row">
                              <i className="fas fa-id-card"></i>
                              <span><strong>Plate:</strong> {riderInfo.plateNumber}</span>
                            </div>
                          </div>

                          {isApproved && (
                            <button
                              className={`rider-notify-btn ${notifyingId === delivery.id ? 'notifying' : ''}`}
                              onClick={() => notifyCustomer(delivery)}
                              disabled={notifyingId === delivery.id}
                            >
                              {notifyingId === delivery.id ? (
                                <><i className="fas fa-spinner fa-spin"></i> Notifying...</>
                              ) : (
                                <><i className="fas fa-bell"></i> Notify Customer — I'm On My Way!</>
                              )}
                            </button>
                          )}

                          {isOutForDelivery && (
                            <div className="rider-confirm-delivery-section">
                              <div className="rider-confirm-title">
                                <i className="fas fa-shield-alt"></i>
                                Confirm Delivery
                              </div>
                              <p className="rider-confirm-desc">
                                Enter the <strong>OTP code</strong> the customer sees on their tracking page.
                                Photo proof is optional.
                              </p>

                              <div className="rider-otp-hint">
                                <i className="fas fa-info-circle"></i>
                                <span>
                                  Ask the customer to open their <strong>Track Order</strong> page and tap{' '}
                                  <strong>"Generate My OTP"</strong>. They will show you the 4-digit code.
                                </span>
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
                                  value={otpInputs[delivery.id] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                    setOtpInputs(prev => ({ ...prev, [delivery.id]: val }));
                                    setOtpErrors(prev => ({ ...prev, [delivery.id]: '' }));
                                  }}
                                />
                              </div>

                              <div className="rider-photo-group">
                                <label className="rider-otp-label">
                                  <i className="fas fa-camera"></i> Photo Proof of Delivery
                                  <span className="otp-optional-tag">(Optional)</span>
                                </label>
                                <div
                                  className={`rider-photo-dropzone ${hasPhoto ? 'has-photo' : ''}`}
                                  onClick={() => fileInputRefs.current[delivery.id]?.click()}
                                >
                                  {hasPhoto ? (
                                    <div className="rider-photo-preview-wrap">
                                      <img src={photoData[delivery.id]} alt="Proof" className="rider-photo-preview" />
                                      <div className="rider-photo-change-overlay">
                                        <i className="fas fa-camera"></i>
                                        <span>Change Photo</span>
                                      </div>
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
                                  ref={el => (fileInputRefs.current[delivery.id] = el)}
                                  onChange={(e) => handlePhotoSelect(delivery.id, e.target.files[0])}
                                />
                              </div>

                              {errMsg && (
                                <div className="rider-confirm-error">
                                  <i className="fas fa-exclamation-circle"></i> {errMsg}
                                </div>
                              )}

                              <button
                                className={`rider-confirm-btn ${confirmingId === delivery.id ? 'confirming' : ''}`}
                                onClick={() => confirmDelivery(delivery)}
                                disabled={confirmingId === delivery.id}
                              >
                                {confirmingId === delivery.id ? (
                                  <><i className="fas fa-spinner fa-spin"></i> Confirming Delivery...</>
                                ) : (
                                  <><i className="fas fa-check-circle"></i> Confirm Delivery</>
                                )}
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