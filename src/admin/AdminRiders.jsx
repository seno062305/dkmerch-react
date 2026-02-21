import React, { useEffect, useState } from 'react';
import './AdminRiders.css';

const AdminRiders = () => {
  const [applications, setApplications] = useState([]);
  const [approvedRiders, setApprovedRiders] = useState([]);
  const [pickupRequests, setPickupRequests] = useState([]);
  const [tab, setTab] = useState('applications');

  const fetchData = () => {
    const all = JSON.parse(localStorage.getItem('dkmerch_rider_applications')) || [];
    setApplications(all.filter((a) => a.status === 'pending'));
    setApprovedRiders(all.filter((a) => a.status === 'approved'));

    const pickups = JSON.parse(localStorage.getItem('dkmerch_pickup_requests')) || [];
    setPickupRequests(pickups);
  };

  useEffect(() => {
    fetchData();
    window.addEventListener('riderUpdated', fetchData);
    window.addEventListener('storage', fetchData);
    window.addEventListener('pickupUpdated', fetchData);
    return () => {
      window.removeEventListener('riderUpdated', fetchData);
      window.removeEventListener('storage', fetchData);
      window.removeEventListener('pickupUpdated', fetchData);
    };
  }, []);

  const updateRiderStatus = (id, status) => {
    const all = JSON.parse(localStorage.getItem('dkmerch_rider_applications')) || [];
    const updated = all.map((a) => a.id === id ? { ...a, status } : a);
    localStorage.setItem('dkmerch_rider_applications', JSON.stringify(updated));
    window.dispatchEvent(new Event('riderUpdated'));
    fetchData();
  };

  const deleteRider = (id) => {
    if (!window.confirm('Reject and remove this application?')) return;
    const all = JSON.parse(localStorage.getItem('dkmerch_rider_applications')) || [];
    const updated = all.filter((a) => a.id !== id);
    localStorage.setItem('dkmerch_rider_applications', JSON.stringify(updated));
    window.dispatchEvent(new Event('riderUpdated'));
    fetchData();
  };

  // ✅ APPROVE PICKUP → order becomes "shipped" + rider info saved to order
  const approvePickup = (requestId) => {
    const pickups = JSON.parse(localStorage.getItem('dkmerch_pickup_requests')) || [];
    const request = pickups.find(p => p.id === requestId);
    if (!request) return;

    // Update pickup request to approved
    const updatedPickups = pickups.map(p =>
      p.id === requestId
        ? { ...p, status: 'approved', approvedAt: new Date().toISOString() }
        : p
    );
    localStorage.setItem('dkmerch_pickup_requests', JSON.stringify(updatedPickups));

    // ✅ Update order: set to SHIPPED + save rider info so customer can see it
    const orders = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
    const updatedOrders = orders.map(o =>
      o.orderId === request.orderId
        ? {
            ...o,
            orderStatus: 'shipped',
            status: 'Shipped',
            shippedAt: new Date().toISOString(),
            pickupApproved: true,
            assignedRider: request.riderName,
            assignedRiderId: request.riderId,
            // ✅ Full rider info for customer tracking page
            riderInfo: {
              name: request.riderName,
              phone: request.riderPhone,
              vehicle: request.riderVehicle,
              plate: request.riderPlate,
            },
          }
        : o
    );
    localStorage.setItem('dkmerch_orders', JSON.stringify(updatedOrders));

    window.dispatchEvent(new Event('pickupUpdated'));
    window.dispatchEvent(new Event('orderUpdated'));
    fetchData();
    alert(`✅ Pickup approved for ${request.riderName}!\nOrder is now marked as Shipped.`);
  };

  const rejectPickup = (requestId) => {
    if (!window.confirm('Reject this pickup request?')) return;
    const pickups = JSON.parse(localStorage.getItem('dkmerch_pickup_requests')) || [];
    const updatedPickups = pickups.map(p =>
      p.id === requestId
        ? { ...p, status: 'rejected', rejectedAt: new Date().toISOString() }
        : p
    );
    localStorage.setItem('dkmerch_pickup_requests', JSON.stringify(updatedPickups));
    window.dispatchEvent(new Event('pickupUpdated'));
    fetchData();
  };

  const pendingPickups = pickupRequests.filter(p => p.status === 'pending');

  const getPickupStatusColor = (status) => {
    const map = {
      pending: '#ffc107',
      approved: '#28a745',
      rejected: '#dc3545',
      out_for_delivery: '#6366f1',
    };
    return map[status] || '#6c757d';
  };

  const getPickupStatusLabel = (status) => {
    const map = {
      pending: '⏳ Pending',
      approved: '✅ Approved',
      rejected: '❌ Rejected',
      out_for_delivery: '🚚 Out for Delivery',
    };
    return map[status] || status;
  };

  return (
    <div className="admin-riders">
      <h1 className="admin-riders-title">🛵 Riders Management</h1>

      <div className="riders-tabs">
        <button
          className={`riders-tab-btn ${tab === 'applications' ? 'active' : ''}`}
          onClick={() => setTab('applications')}
        >
          Pending Applications
          {applications.length > 0 && (
            <span className="riders-tab-badge">{applications.length}</span>
          )}
        </button>
        <button
          className={`riders-tab-btn ${tab === 'approved' ? 'active' : ''}`}
          onClick={() => setTab('approved')}
        >
          Approved Riders ({approvedRiders.length})
        </button>
        <button
          className={`riders-tab-btn ${tab === 'pickups' ? 'active' : ''}`}
          onClick={() => setTab('pickups')}
        >
          Pickup Requests
          {pendingPickups.length > 0 && (
            <span className="riders-tab-badge">{pendingPickups.length}</span>
          )}
        </button>
        <button
          className={`riders-tab-btn ${tab === 'all-pickups' ? 'active' : ''}`}
          onClick={() => setTab('all-pickups')}
        >
          All Pickups ({pickupRequests.length})
        </button>
      </div>

      {/* ─── PENDING APPLICATIONS ─── */}
      {tab === 'applications' && (
        applications.length === 0 ? (
          <p className="riders-empty">No pending applications.</p>
        ) : (
          <div className="riders-table-wrapper">
            <table className="riders-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Vehicle</th>
                  <th>Plate</th>
                  <th>License</th>
                  <th>Date Applied</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id}>
                    <td>{app.fullName}</td>
                    <td>{app.email}</td>
                    <td>{app.phone}</td>
                    <td style={{ textTransform: 'capitalize' }}>{app.vehicleType}</td>
                    <td>{app.plateNumber}</td>
                    <td>{app.licenseNumber}</td>
                    <td>{new Date(app.createdAt).toLocaleDateString('en-PH')}</td>
                    <td className="riders-actions">
                      <button
                        className="riders-btn approve"
                        onClick={() => updateRiderStatus(app.id, 'approved')}
                      >
                        ✅ Approve
                      </button>
                      <button
                        className="riders-btn reject"
                        onClick={() => deleteRider(app.id)}
                      >
                        ❌ Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ─── APPROVED RIDERS ─── */}
      {tab === 'approved' && (
        approvedRiders.length === 0 ? (
          <p className="riders-empty">No approved riders yet.</p>
        ) : (
          <div className="riders-table-wrapper">
            <table className="riders-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Vehicle</th>
                  <th>Plate</th>
                  <th>Address</th>
                  <th>Date Approved</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {approvedRiders.map((rider) => (
                  <tr key={rider.id}>
                    <td>{rider.fullName}</td>
                    <td>{rider.email}</td>
                    <td>{rider.phone}</td>
                    <td style={{ textTransform: 'capitalize' }}>{rider.vehicleType}</td>
                    <td>{rider.plateNumber}</td>
                    <td>{rider.address}</td>
                    <td>{new Date(rider.createdAt).toLocaleDateString('en-PH')}</td>
                    <td>
                      <button
                        className="riders-btn reject"
                        onClick={() => updateRiderStatus(rider.id, 'pending')}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ─── PENDING PICKUP REQUESTS ─── */}
      {tab === 'pickups' && (
        pendingPickups.length === 0 ? (
          <p className="riders-empty">No pending pickup requests.</p>
        ) : (
          <div className="riders-table-wrapper">
            <table className="riders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Rider</th>
                  <th>Phone</th>
                  <th>Vehicle / Plate</th>
                  <th>Customer</th>
                  <th>Deliver To</th>
                  <th>Total</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingPickups.map((req) => (
                  <tr key={req.id}>
                    <td><strong>#{req.orderId?.slice(-8)}</strong></td>
                    <td>
                      <div>
                        <strong>{req.riderName}</strong>
                        <div style={{ fontSize: '12px', color: '#888' }}>{req.riderEmail}</div>
                      </div>
                    </td>
                    <td>{req.riderPhone || '—'}</td>
                    <td>
                      <span style={{ textTransform: 'capitalize' }}>{req.riderVehicle || '—'}</span>
                      {req.riderPlate && (
                        <span style={{ display: 'block', fontSize: '12px', color: '#666' }}>
                          {req.riderPlate}
                        </span>
                      )}
                    </td>
                    <td>{req.customerName}</td>
                    <td style={{ maxWidth: '160px', fontSize: '12px' }}>
                      {req.customerAddress || '—'}
                    </td>
                    <td>₱{(req.total || 0).toLocaleString()}</td>
                    <td>{new Date(req.requestedAt).toLocaleDateString('en-PH')}</td>
                    <td className="riders-actions">
                      <button
                        className="riders-btn approve"
                        onClick={() => approvePickup(req.id)}
                      >
                        ✅ Approve
                      </button>
                      <button
                        className="riders-btn reject"
                        onClick={() => rejectPickup(req.id)}
                      >
                        ❌ Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ─── ALL PICKUPS HISTORY ─── */}
      {tab === 'all-pickups' && (
        pickupRequests.length === 0 ? (
          <p className="riders-empty">No pickup requests yet.</p>
        ) : (
          <div className="riders-table-wrapper">
            <table className="riders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Rider</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {pickupRequests.map((req) => (
                  <tr key={req.id}>
                    <td><strong>#{req.orderId?.slice(-8)}</strong></td>
                    <td>
                      <div>
                        <strong>{req.riderName}</strong>
                        <div style={{ fontSize: '12px', color: '#888' }}>{req.riderEmail}</div>
                      </div>
                    </td>
                    <td>{req.customerName}</td>
                    <td>₱{(req.total || 0).toLocaleString()}</td>
                    <td>
                      <span
                        className="rider-badge"
                        style={{
                          backgroundColor: getPickupStatusColor(req.status),
                          color: 'white',
                        }}
                      >
                        {getPickupStatusLabel(req.status)}
                      </span>
                    </td>
                    <td>{new Date(req.requestedAt).toLocaleDateString('en-PH')}</td>
                    <td>
                      {req.approvedAt
                        ? new Date(req.approvedAt).toLocaleDateString('en-PH')
                        : req.rejectedAt
                          ? new Date(req.rejectedAt).toLocaleDateString('en-PH')
                          : req.notifiedAt
                            ? new Date(req.notifiedAt).toLocaleDateString('en-PH')
                            : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
};

export default AdminRiders;