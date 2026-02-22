// src/admin/AdminRiders.jsx
import React, { useState } from 'react';
import './AdminRiders.css';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

const AdminRiders = () => {
  const [tab, setTab] = useState('applications');

  const allRiders         = useQuery(api.riders.getAllRiders)                ?? [];
  const allPickupRequests = useQuery(api.pickupRequests.getAllPickupRequests) ?? [];
  const pendingPickups    = allPickupRequests.filter(p => p.status === 'pending');

  const approveRiderMutation      = useMutation(api.riders.approveRider);
  const updateRiderStatusMutation = useMutation(api.riders.updateRiderStatus);
  const deleteRiderMutation       = useMutation(api.riders.deleteRider);
  const approvePickupMutation     = useMutation(api.pickupRequests.approvePickupRequest);
  const rejectPickupMutation      = useMutation(api.pickupRequests.rejectPickupRequest);

  const applications   = allRiders.filter(r => r.status === 'pending');
  const approvedRiders = allRiders.filter(r => r.status === 'approved');

  // ── APPROVE RIDER — simple yes/no confirmation ──
  const handleApproveRider = async (app) => {
    const confirmed = window.confirm(
      `Approve "${app.fullName}" as a rider?\n\nEmail: ${app.email}\nVehicle: ${app.vehicleType || 'N/A'}`
    );
    if (!confirmed) return;

    try {
      await approveRiderMutation({ id: app._id });
      alert(`✅ ${app.fullName} has been approved as a rider!`);
    } catch (err) {
      console.error('Failed to approve rider:', err);
      alert('Failed to approve rider. Please try again.');
    }
  };

  const handleRejectRider = async (id, name) => {
    const confirmed = window.confirm(`Reject and remove the application of "${name}"?\n\nThis cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteRiderMutation({ id });
    } catch (err) {
      console.error('Failed to delete rider:', err);
    }
  };

  const handleRevokeRider = async (id, name) => {
    const confirmed = window.confirm(`Revoke approval for "${name}"?\n\nThey will no longer be able to log in as a rider.`);
    if (!confirmed) return;
    try {
      await updateRiderStatusMutation({ id, status: 'pending' });
    } catch (err) {
      console.error('Failed to revoke rider:', err);
    }
  };

  const approvePickup = async (requestId, riderName) => {
    if (!window.confirm(`Approve pickup request for rider "${riderName}"?`)) return;
    try {
      await approvePickupMutation({ requestId });
      alert(`✅ Pickup approved for ${riderName}!`);
    } catch (err) {
      console.error('Failed to approve pickup:', err);
      alert('Failed to approve pickup. Please try again.');
    }
  };

  const rejectPickup = async (requestId) => {
    if (!window.confirm('Reject this pickup request?')) return;
    try {
      await rejectPickupMutation({ requestId });
    } catch (err) {
      console.error('Failed to reject pickup:', err);
    }
  };

  const getPickupStatusColor = (status) => {
    const map = { pending: '#ffc107', approved: '#28a745', rejected: '#dc3545', out_for_delivery: '#6366f1', completed: '#059669' };
    return map[status] || '#6c757d';
  };

  const getPickupStatusLabel = (status) => {
    const map = { pending: '⏳ Pending', approved: '✅ Approved', rejected: '❌ Rejected', out_for_delivery: '🚚 Out for Delivery', completed: '🎉 Delivered' };
    return map[status] || status;
  };

  return (
    <div className="admin-riders">
      <h1 className="admin-riders-title">🛵 Riders Management</h1>

      <div className="riders-tabs">
        <button className={`riders-tab-btn ${tab === 'applications' ? 'active' : ''}`} onClick={() => setTab('applications')}>
          Pending Applications
          {applications.length > 0 && <span className="riders-tab-badge">{applications.length}</span>}
        </button>
        <button className={`riders-tab-btn ${tab === 'approved' ? 'active' : ''}`} onClick={() => setTab('approved')}>
          Approved Riders ({approvedRiders.length})
        </button>
        <button className={`riders-tab-btn ${tab === 'pickups' ? 'active' : ''}`} onClick={() => setTab('pickups')}>
          Pickup Requests
          {pendingPickups.length > 0 && <span className="riders-tab-badge">{pendingPickups.length}</span>}
        </button>
        <button className={`riders-tab-btn ${tab === 'all-pickups' ? 'active' : ''}`} onClick={() => setTab('all-pickups')}>
          All Pickups ({allPickupRequests.length})
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
                <tr><th>Name</th><th>Email</th><th>Phone</th><th>Vehicle</th><th>Date Applied</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {applications.map(app => (
                  <tr key={app._id}>
                    <td>{app.fullName}</td>
                    <td>{app.email}</td>
                    <td>{app.phone}</td>
                    <td style={{ textTransform: 'capitalize' }}>{app.vehicleType || '—'}</td>
                    <td>{app.appliedAt ? new Date(app.appliedAt).toLocaleDateString('en-PH') : 'N/A'}</td>
                    <td className="riders-actions">
                      <button className="riders-btn approve" onClick={() => handleApproveRider(app)}>✅ Approve</button>
                      <button className="riders-btn reject" onClick={() => handleRejectRider(app._id, app.fullName)}>❌ Reject</button>
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
                <tr><th>Name</th><th>Email</th><th>Phone</th><th>Vehicle</th><th>Date Applied</th><th>Action</th></tr>
              </thead>
              <tbody>
                {approvedRiders.map(rider => (
                  <tr key={rider._id}>
                    <td>{rider.fullName}</td>
                    <td>{rider.email}</td>
                    <td>{rider.phone}</td>
                    <td style={{ textTransform: 'capitalize' }}>{rider.vehicleType || '—'}</td>
                    <td>{rider.appliedAt ? new Date(rider.appliedAt).toLocaleDateString('en-PH') : 'N/A'}</td>
                    <td>
                      <button className="riders-btn reject" onClick={() => handleRevokeRider(rider._id, rider.fullName)}>Revoke</button>
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
                <tr><th>Order ID</th><th>Rider</th><th>Phone</th><th>Vehicle / Plate</th><th>Customer</th><th>Total</th><th>Requested</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {pendingPickups.map(req => (
                  <tr key={req._id}>
                    <td><strong>#{req.orderId?.slice(-8)}</strong></td>
                    <td>
                      <strong>{req.riderName}</strong>
                      <div style={{ fontSize: '12px', color: '#888' }}>{req.riderEmail}</div>
                    </td>
                    <td>{req.riderPhone || '—'}</td>
                    <td>
                      <span style={{ textTransform: 'capitalize' }}>{req.riderVehicle || '—'}</span>
                      {req.riderPlate && <span style={{ display: 'block', fontSize: '12px', color: '#666' }}>{req.riderPlate}</span>}
                    </td>
                    <td>{req.customerName || '—'}</td>
                    <td>₱{(req.total || 0).toLocaleString()}</td>
                    <td>{new Date(req.requestedAt).toLocaleDateString('en-PH')}</td>
                    <td className="riders-actions">
                      <button className="riders-btn approve" onClick={() => approvePickup(req._id, req.riderName)}>✅ Approve</button>
                      <button className="riders-btn reject" onClick={() => rejectPickup(req._id)}>❌ Reject</button>
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
        allPickupRequests.length === 0 ? (
          <p className="riders-empty">No pickup requests yet.</p>
        ) : (
          <div className="riders-table-wrapper">
            <table className="riders-table">
              <thead>
                <tr><th>Order ID</th><th>Rider</th><th>Customer</th><th>Total</th><th>Status</th><th>Requested</th><th>Resolved</th></tr>
              </thead>
              <tbody>
                {allPickupRequests.map(req => (
                  <tr key={req._id}>
                    <td><strong>#{req.orderId?.slice(-8)}</strong></td>
                    <td>
                      <strong>{req.riderName}</strong>
                      <div style={{ fontSize: '12px', color: '#888' }}>{req.riderEmail}</div>
                    </td>
                    <td>{req.customerName || '—'}</td>
                    <td>₱{(req.total || 0).toLocaleString()}</td>
                    <td>
                      <span className="rider-badge" style={{ backgroundColor: getPickupStatusColor(req.status), color: 'white' }}>
                        {getPickupStatusLabel(req.status)}
                      </span>
                    </td>
                    <td>{new Date(req.requestedAt).toLocaleDateString('en-PH')}</td>
                    <td>
                      {req.approvedAt ? new Date(req.approvedAt).toLocaleDateString('en-PH')
                        : req.rejectedAt ? new Date(req.rejectedAt).toLocaleDateString('en-PH')
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