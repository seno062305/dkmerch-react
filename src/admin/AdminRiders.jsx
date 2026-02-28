// src/admin/AdminRiders.jsx
import React, { useState, useRef } from 'react';
import './AdminRiders.css';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

// ── DKMerch Rider ID Card Modal ──
const RiderIdCardModal = ({ rider, onClose }) => {
  const cardRef = useRef();

  const handlePrint = () => {
    const printContent = cardRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=500,height=320');
    win.document.write(`
      <html><head><title>DKMerch Rider ID</title>
      <style>
        body { margin: 0; padding: 20px; font-family: 'Segoe UI', sans-serif; background: #f0f0f0; }
        .id-card { width: 380px; min-height: 220px; background: linear-gradient(135deg, #6a0dad, #9b30ff);
          border-radius: 16px; padding: 20px; color: white; box-shadow: 0 8px 32px rgba(106,13,173,0.4); position: relative; overflow: hidden; }
        .id-card::before { content: ''; position: absolute; top: -40px; right: -40px; width: 160px; height: 160px;
          background: rgba(255,255,255,0.08); border-radius: 50%; }
        .id-card::after { content: ''; position: absolute; bottom: -30px; left: -30px; width: 120px; height: 120px;
          background: rgba(255,255,255,0.06); border-radius: 50%; }
        .id-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .id-logo { font-size: 22px; }
        .id-brand { font-size: 18px; font-weight: 800; letter-spacing: 1px; }
        .id-brand span { font-size: 11px; font-weight: 400; opacity: 0.8; display: block; }
        .id-body { display: flex; gap: 16px; align-items: flex-start; }
        .id-photo { width: 70px; height: 70px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.6);
          object-fit: cover; background: rgba(255,255,255,0.2); flex-shrink: 0; }
        .id-photo-placeholder { width: 70px; height: 70px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.6);
          background: rgba(255,255,255,0.2); display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0; }
        .id-info { flex: 1; }
        .id-name { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
        .id-role { font-size: 11px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
        .id-details { display: flex; flex-direction: column; gap: 3px; }
        .id-detail { font-size: 11px; opacity: 0.9; }
        .id-detail strong { opacity: 1; }
        .id-number { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2);
          display: flex; justify-content: space-between; align-items: center; }
        .id-number-text { font-size: 15px; font-weight: 800; letter-spacing: 2px; }
        .id-number-label { font-size: 10px; opacity: 0.7; text-transform: uppercase; }
        .id-valid { font-size: 10px; opacity: 0.7; text-align: right; }
      </style></head><body>${printContent}</body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  return (
    <div className="id-card-overlay" onClick={onClose}>
      <div className="id-card-modal" onClick={(e) => e.stopPropagation()}>
        <button className="id-card-close" onClick={onClose}>✕</button>
        <h3 className="id-card-modal-title">🎉 Rider Approved!</h3>
        <p className="id-card-modal-sub">DKMerch Rider ID has been generated.</p>

        <div ref={cardRef}>
          <div className="dk-id-card">
            <div className="dk-id-bg-circle1" />
            <div className="dk-id-bg-circle2" />

            <div className="dk-id-header">
              <span className="dk-id-logo">🛵</span>
              <div>
                <div className="dk-id-brand">DKMerch</div>
                <div className="dk-id-brand-sub">Official Delivery Rider</div>
              </div>
            </div>

            <div className="dk-id-body">
              {rider.riderPhoto ? (
                <img src={rider.riderPhoto} alt="Rider" className="dk-id-photo" />
              ) : (
                <div className="dk-id-photo-placeholder">👤</div>
              )}
              <div className="dk-id-info">
                <div className="dk-id-name">{rider.fullName}</div>
                <div className="dk-id-role">Delivery Rider</div>
                <div className="dk-id-details">
                  <div className="dk-id-detail">📞 {rider.phone}</div>
                  <div className="dk-id-detail">✉️ {rider.email}</div>
                  <div className="dk-id-detail" style={{ textTransform: 'capitalize' }}>
                    🛵 {rider.vehicleType || '—'} {rider.plateNumber ? `• ${rider.plateNumber}` : ''}
                  </div>
                </div>
              </div>
            </div>

            <div className="dk-id-footer">
              <div>
                <div className="dk-id-number">{rider.dkRiderId}</div>
                <div className="dk-id-number-label">Rider ID</div>
              </div>
              <div className="dk-id-valid">
                Issued: {rider.dkRiderIdGeneratedAt
                  ? new Date(rider.dkRiderIdGeneratedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                  : new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>
        </div>

        <div className="id-card-actions">
          <button className="id-card-print-btn" onClick={handlePrint}>🖨️ Print ID Card</button>
          <button className="id-card-done-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

// ── Application Details Modal (view photos / IDs) ──
const ApplicationDetailModal = ({ app, onClose, onApprove, onReject }) => {
  const [viewImg, setViewImg] = useState(null);

  return (
    <div className="id-card-overlay" onClick={onClose}>
      <div className="app-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="id-card-close" onClick={onClose}>✕</button>
        <h3 className="app-detail-title">📋 Application Details</h3>

        {/* Basic Info */}
        <div className="app-detail-section">
          <div className="app-detail-grid">
            <div><span className="app-detail-label">Full Name</span><span className="app-detail-value">{app.fullName}</span></div>
            <div><span className="app-detail-label">Email</span><span className="app-detail-value">{app.email}</span></div>
            <div><span className="app-detail-label">Phone</span><span className="app-detail-value">{app.phone}</span></div>
            <div><span className="app-detail-label">Address</span><span className="app-detail-value">{app.address || '—'}</span></div>
            <div><span className="app-detail-label">Vehicle</span><span className="app-detail-value" style={{ textTransform: 'capitalize' }}>{app.vehicleType || '—'}</span></div>
            <div><span className="app-detail-label">Plate No.</span><span className="app-detail-value">{app.plateNumber || '—'}</span></div>
            <div><span className="app-detail-label">License No.</span><span className="app-detail-value">{app.licenseNumber || '—'}</span></div>
            <div><span className="app-detail-label">Applied</span><span className="app-detail-value">{app.appliedAt ? new Date(app.appliedAt).toLocaleDateString('en-PH') : 'N/A'}</span></div>
          </div>
        </div>

        {/* Photos */}
        <div className="app-detail-photos-header">📸 Submitted Photos</div>
        <div className="app-detail-photos">
          {[
            { key: 'riderPhoto', label: '🤳 Selfie / Face Photo' },
            { key: 'validId1',   label: '🪪 Valid ID #1' },
            { key: 'validId2',   label: '🪪 Valid ID #2' },
          ].map(({ key, label }) => (
            <div key={key} className="app-photo-box">
              <div className="app-photo-label">{label}</div>
              {app[key] ? (
                <img
                  src={app[key]}
                  alt={label}
                  className="app-photo-img"
                  onClick={() => setViewImg(app[key])}
                  title="Click to enlarge"
                />
              ) : (
                <div className="app-photo-missing">No photo submitted</div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="app-detail-actions">
          <button className="riders-btn approve" onClick={() => { onClose(); onApprove(app); }}>✅ Approve</button>
          <button className="riders-btn reject" onClick={() => { onClose(); onReject(app._id, app.fullName); }}>❌ Reject</button>
        </div>
      </div>

      {/* Fullscreen image viewer */}
      {viewImg && (
        <div className="img-viewer-overlay" onClick={() => setViewImg(null)}>
          <img src={viewImg} alt="ID" className="img-viewer-img" />
          <div className="img-viewer-hint">Tap anywhere to close</div>
        </div>
      )}
    </div>
  );
};

// ── Main Component ──
const AdminRiders = () => {
  const [tab, setTab] = useState('applications');
  const [selectedApp, setSelectedApp] = useState(null);    // for details modal
  const [approvedRider, setApprovedRider] = useState(null); // for ID card modal

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

  const handleApproveRider = async (app) => {
    const confirmed = window.confirm(
      `Approve "${app.fullName}" as a rider?\n\nEmail: ${app.email}\nVehicle: ${app.vehicleType || 'N/A'}`
    );
    if (!confirmed) return;

    try {
      const result = await approveRiderMutation({ id: app._id });
      // Show ID card modal with the generated ID
      setApprovedRider({ ...app, dkRiderId: result.dkRiderId, dkRiderIdGeneratedAt: new Date().toISOString() });
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
                <tr><th>Name</th><th>Email</th><th>Phone</th><th>Vehicle</th><th>Date Applied</th><th>Photos</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {applications.map(app => (
                  <tr key={app._id}>
                    <td>{app.fullName}</td>
                    <td>{app.email}</td>
                    <td>{app.phone}</td>
                    <td style={{ textTransform: 'capitalize' }}>{app.vehicleType || '—'}</td>
                    <td>{app.appliedAt ? new Date(app.appliedAt).toLocaleDateString('en-PH') : 'N/A'}</td>
                    <td>
                      <div className="riders-photo-indicators">
                        <span className={`photo-dot ${app.riderPhoto ? 'has-photo' : 'no-photo'}`} title="Selfie">🤳</span>
                        <span className={`photo-dot ${app.validId1 ? 'has-photo' : 'no-photo'}`} title="ID 1">🪪</span>
                        <span className={`photo-dot ${app.validId2 ? 'has-photo' : 'no-photo'}`} title="ID 2">🪪</span>
                      </div>
                    </td>
                    <td className="riders-actions">
                      <button className="riders-btn view" onClick={() => setSelectedApp(app)}>👁 View</button>
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
                <tr><th>Name</th><th>Email</th><th>Phone</th><th>Vehicle</th><th>DK Rider ID</th><th>Date Applied</th><th>Action</th></tr>
              </thead>
              <tbody>
                {approvedRiders.map(rider => (
                  <tr key={rider._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {rider.riderPhoto ? (
                          <img src={rider.riderPhoto} alt={rider.fullName}
                            style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid #c4b5fd', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>👤</div>
                        )}
                        {rider.fullName}
                      </div>
                    </td>
                    <td>{rider.email}</td>
                    <td>{rider.phone}</td>
                    <td style={{ textTransform: 'capitalize' }}>{rider.vehicleType || '—'}</td>
                    <td>
                      {rider.dkRiderId ? (
                        <span className="dk-rider-id-badge">{rider.dkRiderId}</span>
                      ) : '—'}
                    </td>
                    <td>{rider.appliedAt ? new Date(rider.appliedAt).toLocaleDateString('en-PH') : 'N/A'}</td>
                    <td className="riders-actions">
                      {rider.dkRiderId && (
                        <button className="riders-btn view" onClick={() => setApprovedRider(rider)}>🪪 View ID</button>
                      )}
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

      {/* ─── MODALS ─── */}
      {selectedApp && (
        <ApplicationDetailModal
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onApprove={handleApproveRider}
          onReject={handleRejectRider}
        />
      )}

      {approvedRider && (
        <RiderIdCardModal
          rider={approvedRider}
          onClose={() => setApprovedRider(null)}
        />
      )}
    </div>
  );
};

export default AdminRiders;