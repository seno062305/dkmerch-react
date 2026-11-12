// src/admin/AdminUsers.jsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import './AdminUsers.css';
import { useQuery, useMutation, useAction, useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useConfirm } from '../context/ConfirmContext';
import AdminPager, { fixedPageStyle } from './AdminPager';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { formatPlateNumber, formatLicenseNumber, PLATE_REGEX, LICENSE_REGEX } from '../utils/riderIdFormat';
import { IMAGE_ACCEPT_NO_GIF, validateImageFile } from '../utils/imageUpload';

/** Safe archives fetch — avoids hard crash if Convex hasn't deployed listUserArchives yet. */
function useUserArchivesSafe(enabled) {
  const convex = useConvex();
  const [rows, setRows] = useState([]);
  const [deployNeeded, setDeployNeeded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await convex.query(api.users.listUserArchives, {});
      setRows(Array.isArray(data) ? data : []);
      setDeployNeeded(false);
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg.includes('listUserArchives') || msg.includes('Could not find public function')) {
        setDeployNeeded(true);
        setRows([]);
        return;
      }
      setRows([]);
    }
  }, [convex]);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [enabled, refresh]);

  return { userArchives: rows, archivesDeployNeeded: deployNeeded, refreshArchives: refresh };
}

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const RiderViewModal = ({ rider, onClose, onPhotoUpdated }) => {
  useBodyScrollLock(true);
  const cardRef = useRef();
  const photoInputRef = useRef();
  const updateRiderPhoto = useMutation(api.riders.updateRiderPhoto);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [localPhoto, setLocalPhoto] = useState(rider.riderPhoto || null);
  const [photoMsg, setPhotoMsg] = useState('');
  const [showRiderPassword, setShowRiderPassword] = useState(false);

  useEffect(() => {
    setLocalPhoto(rider.riderPhoto || null);
    setShowRiderPassword(false);
  }, [rider._id, rider.riderPhoto]);

  const handlePrint = () => {
    if (!cardRef.current) return;
    const win = window.open('', '_blank', 'width=500,height=320');
    if (!win) return;
    win.document.write(`<html><head><title>DKMerch Rider ID</title><style>body{margin:0;padding:20px;font-family:'Segoe UI',sans-serif;background:#f0f0f0;}</style></head><body>${cardRef.current.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const handlePhotoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoMsg('Please choose an image file (JPG/PNG).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoMsg('Photo must be under 5MB.');
      return;
    }
    setPhotoBusy(true);
    setPhotoMsg('');
    try {
      const dataUrl = await fileToDataUrl(file);
      await updateRiderPhoto({ id: rider._id, riderPhoto: dataUrl });
      setLocalPhoto(dataUrl);
      onPhotoUpdated?.({ ...rider, riderPhoto: dataUrl });
      setPhotoMsg('Face photo saved. Customers will see this on Track Order.');
    } catch (err) {
      console.error(err);
      setPhotoMsg('Failed to save photo. Try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="au-rider-view-overlay" onClick={onClose}>
      <div className="au-rider-view-modal" onClick={e => e.stopPropagation()}>
        <button className="au-rider-view-close" onClick={onClose}>&times;</button>
        <h3 className="au-rider-view-title"><i className="fas fa-id-card"></i> Rider Details</h3>
        <p className="au-rider-view-sub">{rider.dkRiderId ? 'Official rider ID card' : 'Rider profile information'}</p>

        <div ref={cardRef}>
          <div className="au-dk-id-card">
            <div className="au-dk-id-header">
              <span className="au-dk-id-logo"><i className="fas fa-motorcycle"></i></span>
              <div>
                <div className="au-dk-id-brand">DKMerch</div>
                <div className="au-dk-id-brand-sub">Official Delivery Rider</div>
              </div>
            </div>
            <div className="au-dk-id-body">
              {localPhoto
                ? <img src={localPhoto} alt={rider.fullName} className="au-dk-id-photo" />
                : <div className="au-dk-id-photo-placeholder"><i className="fas fa-user"></i></div>}
              <div className="au-dk-id-info">
                <div className="au-dk-id-name">{rider.fullName}</div>
                <div className="au-dk-id-role">Delivery Rider · Motorcycle</div>
                <div className="au-dk-id-details">
                  <div><i className="fas fa-phone"></i> {rider.phone || '—'}</div>
                  <div><i className="fas fa-envelope"></i> {rider.email || '—'}</div>
                  {rider.plateNumber && <div><i className="fas fa-car"></i> Plate: {rider.plateNumber}</div>}
                  {rider.licenseNumber && <div><i className="fas fa-id-card"></i> License: {rider.licenseNumber}</div>}
                  {rider.address && <div><i className="fas fa-map-marker-alt"></i> {rider.address}</div>}
                </div>
              </div>
            </div>
            <div className="au-dk-id-footer">
              <div>
                <div className="au-dk-id-number">{rider.dkRiderId || 'Pending ID'}</div>
                <div className="au-dk-id-number-label">Rider ID</div>
              </div>
              <div className="au-dk-id-valid">
                {rider.dkRiderIdGeneratedAt || rider.appliedAt
                  ? new Date(rider.dkRiderIdGeneratedAt || rider.appliedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="au-rider-photo-upload">
          <div className="au-rider-photo-upload-title">
            <i className="fas fa-camera"></i> Rider face photo
          </div>
          <p className="au-rider-photo-upload-hint">
            Customers see this photo on Track Order so they can recognize the rider.
          </p>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={handlePhotoPick}
          />
          <button
            type="button"
            className="au-btn-secondary"
            disabled={photoBusy}
            onClick={() => photoInputRef.current?.click()}
          >
            {photoBusy
              ? <><i className="fas fa-spinner fa-spin"></i> Saving…</>
              : <><i className="fas fa-upload"></i> {localPhoto ? 'Change Photo' : 'Upload Photo'}</>}
          </button>
          {photoMsg && <div className="au-rider-photo-msg">{photoMsg}</div>}
        </div>

        <div className="au-rider-view-meta">
          <span className={`au-rider-view-status status-${rider.status}`}>{rider.status}</span>
          {rider.vehicleType && <span>Vehicle: Motorcycle</span>}
        </div>

        {rider.password && (
          <div className="au-rider-view-password">
            <span className="au-pending-label">Login Password</span>
            <div className="au-pw-row">
              <input
                type={showRiderPassword ? 'text' : 'password'}
                value={rider.password}
                readOnly
                autoComplete="off"
              />
              <button
                type="button"
                className="au-pw-toggle"
                onClick={() => setShowRiderPassword((v) => !v)}
                aria-label={showRiderPassword ? 'Hide password' : 'Show password'}
                title={showRiderPassword ? 'Hide password' : 'Show password'}
              >
                <i className={`fas ${showRiderPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          </div>
        )}

        <div className="au-rider-view-actions">
          {rider.dkRiderId && (
            <button type="button" className="au-btn-secondary" onClick={handlePrint}>
              <i className="fas fa-print"></i> Print ID Card
            </button>
          )}
          <button type="button" className="au-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

const PendingAppDetailModal = ({ app, onClose, onApprove, onReject }) => {
  useBodyScrollLock(true);
  const [viewImg, setViewImg] = useState(null);
  return (
    <div className="au-rider-view-overlay" onClick={onClose}>
      <div className="au-rider-view-modal au-pending-app-modal" onClick={e => e.stopPropagation()}>
        <button className="au-rider-view-close" onClick={onClose}>&times;</button>
        <h3 className="au-rider-view-title"><i className="fas fa-clipboard-list"></i> Application Details</h3>
        <p className="au-rider-view-sub">Review rider info and submitted face / ID photos</p>

        <div className="au-pending-app-grid">
          <div><span className="au-pending-label">Full Name</span><strong>{app.fullName}</strong></div>
          <div><span className="au-pending-label">Email</span><strong>{app.email}</strong></div>
          <div><span className="au-pending-label">Phone</span><strong>{app.phone || '—'}</strong></div>
          <div><span className="au-pending-label">Plate Number</span><strong>{app.plateNumber || '—'}</strong></div>
          <div><span className="au-pending-label">License No.</span><strong>{app.licenseNumber || '—'}</strong></div>
          <div><span className="au-pending-label">Address</span><strong>{app.address || '—'}</strong></div>
        </div>

        <div className="au-pending-photos">
          {[
            { key: 'riderPhoto', label: 'Face / Selfie' },
            { key: 'validId1', label: 'Valid ID #1' },
            { key: 'validId2', label: 'Valid ID #2' },
          ].map(({ key, label }) => (
            <div key={key} className="au-pending-photo-box">
              <div className="au-pending-photo-label">{label}</div>
              {app[key]
                ? <img src={app[key]} alt={label} onClick={() => setViewImg(app[key])} />
                : <div className="au-pending-photo-missing">No photo</div>}
            </div>
          ))}
        </div>

        <div className="au-rider-view-actions">
          <button type="button" className="au-btn-primary" onClick={() => { onClose(); onApprove(app); }}>
            <i className="fas fa-check-circle"></i> Approve
          </button>
          <button type="button" className="au-btn-secondary" style={{ color: '#b91c1c' }} onClick={() => { onClose(); onReject(app); }}>
            <i className="fas fa-times-circle"></i> Reject
          </button>
        </div>
        {viewImg && (
          <div className="au-img-viewer" onClick={() => setViewImg(null)}>
            <img src={viewImg} alt="Preview" />
            <span>Tap to close</span>
          </div>
        )}
      </div>
    </div>
  );
};

const SUSPEND_REASONS = [
  { value: 'abusive_behavior', label: 'Abusive / Harassing Behavior', defaultDays: 3 },
  { value: 'spam',             label: 'Spam / Fake Orders',           defaultDays: 3 },
  { value: 'payment_fraud',    label: 'Payment Fraud',                defaultDays: 3 },
  { value: 'other',            label: 'Other',                        defaultDays: 1 },
];

const DURATION_OPTIONS = [
  { label: '3 Days',    days: 3    },
  { label: '7 Days',    days: 7    },
  { label: '14 Days',   days: 14   },
  { label: '30 Days',   days: 30   },
  { label: 'Permanent', days: null },
];

const DURATION_OPTIONS_OTHER = [
  { label: '1 Day',     days: 1    },
  { label: '3 Days',    days: 3    },
  { label: '7 Days',    days: 7    },
  { label: '14 Days',   days: 14   },
  { label: '30 Days',   days: 30   },
  { label: 'Permanent', days: null },
];

const STEP_CONFIGURE = 'configure';
const STEP_CONFIRM   = 'confirm';

const RIDER_DELETE_REASONS = [
  { value: 'inactive',          label: 'Account Inactive',     hint: 'Rider has been inactive for a long time' },
  { value: 'policy_violation',  label: 'Policy Violation',     hint: 'Violated DKMerch rider policies' },
  { value: 'request_by_rider',  label: 'Requested by Rider',   hint: 'Rider requested account removal' },
  { value: 'other',             label: 'Other Reason',         hint: 'Specify reason in the note field' },
];

const EMPTY_RIDER_FORM = {
  fullName: '',
  email: '',
  phone: '',
  address: '',
  vehicleType: 'motorcycle',
  plateNumber: '',
  licenseNumber: '',
  password: '',
  confirmPassword: '',
  riderPhoto: null,
};

const AdminUsers = () => {
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState('users');

  const users  = useQuery(api.users.getAllUsers)   ?? [];
  const riders = useQuery(api.riders.getAllRiders) ?? [];
  const { userArchives, archivesDeployNeeded, refreshArchives } = useUserArchivesSafe(
    activeTab === 'archives' || activeTab === 'users' || activeTab === 'pending'
  );

  const suspendUserMutation   = useMutation(api.users.suspendUser);
  const unsuspendUserMutation = useMutation(api.users.unsuspendUser);
  const deleteUserMutation    = useMutation(api.users.deleteUser);
  const permanentDeleteArchiveMutation = useMutation(api.users.permanentDeleteUserArchive);
  const activateUserMutation  = useMutation(api.users.activateUser);
  const deleteRiderMutation   = useMutation(api.riders.deleteRider);
  const adminCreateRider      = useMutation(api.riders.adminCreateRider);
  const approveRiderMutation  = useMutation(api.riders.approveRider);
  const rejectRiderMutation   = useMutation(api.riders.rejectRiderApplication);
  const repairDuplicateRiderIds = useMutation(api.riders.repairDuplicateRiderIds);
  const sendRiderApprovedEmail = useAction(api.sendEmail.sendRiderApprovedEmail);
  const riderIdsRepairedRef = useRef(false);

  const [searchTerm, setSearchTerm]     = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [pageSize, setPageSize]         = useState(5);
  const [page, setPage]                 = useState(0);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete]           = useState(null);
  const [deleteConfirmTyped, setDeleteConfirmTyped] = useState('');
  const [deleteBusy, setDeleteBusy]               = useState(false);
  const [archiveToWipe, setArchiveToWipe]         = useState(null);
  const [wipeConfirmTyped, setWipeConfirmTyped]   = useState('');
  const [wipeBusy, setWipeBusy]                   = useState(false);
  const [hiddenUserIds, setHiddenUserIds]         = useState(() => new Set());
  const DELETE_CONFIRM_WORD = 'DELETE';

  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendStep, setSuspendStep]           = useState(STEP_CONFIGURE);
  const [userToSuspend, setUserToSuspend]       = useState(null);
  const [suspendReason, setSuspendReason]       = useState('');
  const [suspendDays, setSuspendDays]           = useState(null);
  const [suspendNote, setSuspendNote]           = useState('');
  const [suspendLoading, setSuspendLoading]     = useState(false);

  const [showUnsuspendConfirm, setShowUnsuspendConfirm] = useState(false);
  const [userToUnsuspend, setUserToUnsuspend]           = useState(null);

  const [showActivateConfirm, setShowActivateConfirm] = useState(false);
  const [userToActivate, setUserToActivate]           = useState(null);

  const [riderSearch, setRiderSearch]             = useState('');
  const [riderFilterStatus, setRiderFilterStatus] = useState('all'); // all | rejected | suspended

  const [showRiderDeleteModal, setShowRiderDeleteModal] = useState(false);
  const [riderDeleteStep, setRiderDeleteStep]           = useState(STEP_CONFIGURE);
  const [riderToDelete, setRiderToDelete]               = useState(null);
  const [riderDeleteReason, setRiderDeleteReason]       = useState('');
  const [riderDeleteNote, setRiderDeleteNote]           = useState('');
  const [riderDeleteLoading, setRiderDeleteLoading]     = useState(false);

  const [riderForm, setRiderForm]         = useState(EMPTY_RIDER_FORM);
  const [riderFormError, setRiderFormError] = useState('');
  const [riderFormLoading, setRiderFormLoading] = useState(false);
  const [pendingAppDetail, setPendingAppDetail] = useState(null);
  const [showRiderPw, setShowRiderPw]     = useState(false);
  const [viewingRider, setViewingRider]   = useState(null);
  const [riderOtp, setRiderOtp]           = useState('');
  const [riderOtpSent, setRiderOtpSent]   = useState(false);
  const [riderOtpVerified, setRiderOtpVerified] = useState(false);
  const [riderOtpBusy, setRiderOtpBusy]   = useState(false);
  const [riderOtpMsg, setRiderOtpMsg]     = useState('');
  const [riderOtpCooldown, setRiderOtpCooldown] = useState(0);
  const requestRiderEmailOtp = useMutation(api.riders.requestRiderEmailOtp);
  const verifyRiderEmailOtp  = useMutation(api.riders.verifyRiderEmailOtp);
  const sendRegistrationOTP  = useAction(api.sendEmail.sendRegistrationOTP);

  useEffect(() => {
    if (activeTab !== 'riders' && activeTab !== 'applications') return;
    if (riderIdsRepairedRef.current) return;
    riderIdsRepairedRef.current = true;
    repairDuplicateRiderIds({}).catch(() => {
      riderIdsRepairedRef.current = false;
    });
  }, [activeTab, repairDuplicateRiderIds]);

  useBodyScrollLock(
    !!(
      showSuspendModal
      || showUnsuspendConfirm
      || showActivateConfirm
      || showDeleteConfirm
      || showRiderDeleteModal
      || archiveToWipe
      || viewingRider
      || pendingAppDetail
    )
  );

  const [notification, setNotification] = useState({ show: false, message: '', type: '' });

  const showNotification = (message, type) => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 6000);
  };

  const pendingUsers = users.filter(
    (u) => u.status === 'pending_activation' && !hiddenUserIds.has(u._id)
  );
  // regularUsers includes self_deactivated — they're real accounts, not pending
  const regularUsers = users.filter(
    (u) => u.status !== 'pending_activation' && !hiddenUserIds.has(u._id)
  );

  const byNewest = (a, b) =>
    (b._creationTime || new Date(b.appliedAt || b.registeredAt || 0).getTime() || 0) -
    (a._creationTime || new Date(a.appliedAt || a.registeredAt || 0).getTime() || 0);

  const filteredUsers = regularUsers.filter(u => {
    if (filterStatus !== 'all' && (u.status || 'active') !== filterStatus) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  }).sort(byNewest);

  useEffect(() => { setPage(0); }, [searchTerm, filterStatus, pageSize, activeTab]);

  const pagedUsers = useMemo(() => {
    const start = page * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  const filteredPending = pendingUsers.filter(u => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  }).sort(byNewest);

  const filteredRiders = riders.filter(r => {
    if (riderFilterStatus !== 'all' && r.status !== riderFilterStatus) return false;
    if (!riderSearch.trim()) return true;
    const q = riderSearch.toLowerCase();
    return (
      r.fullName?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.phone?.includes(riderSearch) ||
      r.vehicleType?.toLowerCase().includes(q)
    );
  }).sort(byNewest);

  const pendingApplications = riders.filter(r => r.status === 'pending').sort(byNewest);

  const handleRiderFormChange = (e) => {
    const { name, value } = e.target;
    let next = value;
    if (name === 'phone') next = value.replace(/\D/g, '').slice(0, 11);
    if (name === 'plateNumber') next = formatPlateNumber(value);
    if (name === 'licenseNumber') next = formatLicenseNumber(value);
    if (name === 'password' || name === 'confirmPassword') next = value.slice(0, 10);
    setRiderForm(prev => ({ ...prev, [name]: next }));
    setRiderFormError('');
    if (name === 'email') {
      setRiderOtp('');
      setRiderOtpSent(false);
      setRiderOtpVerified(false);
      setRiderOtpMsg('');
    }
  };

  useEffect(() => {
    if (riderOtpCooldown <= 0) return undefined;
    const t = setTimeout(() => setRiderOtpCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [riderOtpCooldown]);

  const handleSendRiderOtp = async () => {
    const email = riderForm.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setRiderOtpMsg('Enter a valid email first.');
      return;
    }
    if (riderOtpCooldown > 0) return;
    setRiderOtpBusy(true);
    setRiderOtpMsg('');
    try {
      const gen = await requestRiderEmailOtp({
        email,
        name: riderForm.fullName.trim() || 'Rider',
      });
      if (!gen?.success || !gen.otp) {
        setRiderOtpMsg(gen?.message || 'Failed to create OTP.');
        return;
      }
      const mailed = await sendRegistrationOTP({
        to: email,
        name: riderForm.fullName.trim() || 'Rider',
        otp: gen.otp,
      });
      if (mailed?.rateLimited) {
        setRiderOtpCooldown(mailed.waitSec || mailed.cooldownSec || 30);
        setRiderOtpMsg(mailed.message || 'Please wait before requesting another code.');
        return;
      }
      if (!mailed?.success) {
        setRiderOtpMsg(mailed?.message || 'Failed to send OTP email.');
        return;
      }
      setRiderOtpSent(true);
      setRiderOtpVerified(false);
      setRiderOtp('');
      setRiderOtpCooldown(mailed.cooldownSec || mailed.waitSec || 30);
      setRiderOtpMsg(`OTP sent to ${email}. Check inbox (and spam).`);
    } catch (err) {
      console.error(err);
      setRiderOtpMsg('Failed to send OTP. Try again.');
    } finally {
      setRiderOtpBusy(false);
    }
  };

  const handleVerifyRiderOtp = async () => {
    const email = riderForm.email.trim();
    const code = riderOtp.trim();
    if (!code || code.length < 6) {
      setRiderOtpMsg('Enter the 6-digit OTP from email.');
      return;
    }
    setRiderOtpBusy(true);
    setRiderOtpMsg('');
    try {
      const result = await verifyRiderEmailOtp({ email, otp: code });
      if (!result?.success) {
        setRiderOtpMsg(result?.message || 'Incorrect OTP.');
        setRiderOtpVerified(false);
        return;
      }
      setRiderOtpVerified(true);
      setRiderOtpMsg('Email verified. You can create the rider.');
    } catch (err) {
      console.error(err);
      setRiderOtpMsg('Verification failed. Try again.');
      setRiderOtpVerified(false);
    } finally {
      setRiderOtpBusy(false);
    }
  };

  const handleAdminCreateRider = async (e) => {
    e.preventDefault();
    setRiderFormError('');
    const { fullName, email, phone, address, plateNumber, licenseNumber, password, confirmPassword, riderPhoto } = riderForm;
    if (!fullName.trim() || !email.trim() || !phone.trim() || !password) {
      setRiderFormError('Full name, email, phone, and password are required.');
      return;
    }
    if (!riderOtpVerified) {
      setRiderFormError('Send and verify the email OTP first so we know the inbox works.');
      return;
    }
    if (!riderPhoto) {
      setRiderFormError('Please upload a rider face photo so customers can recognize them.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setRiderFormError('Please enter a valid email address.');
      return;
    }
    if (!password.startsWith('@rider') || password.length < 7 || password.length > 10) {
      setRiderFormError('Password must start with @rider and be 7–10 characters (e.g. @rider1).');
      return;
    }
    if (password !== confirmPassword) {
      setRiderFormError('Passwords do not match.');
      return;
    }
    if (plateNumber.trim() && !PLATE_REGEX.test(plateNumber.trim())) {
      setRiderFormError('Plate number must look like ABC 1234.');
      return;
    }
    if (licenseNumber.trim() && !LICENSE_REGEX.test(licenseNumber.trim())) {
      setRiderFormError('License number must look like N01-23-456789.');
      return;
    }

    setRiderFormLoading(true);
    try {
      const result = await adminCreateRider({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim() || undefined,
        vehicleType: 'motorcycle',
        plateNumber: plateNumber.trim() || undefined,
        licenseNumber: licenseNumber.trim() || undefined,
        password,
        riderPhoto,
      });
      if (!result.success) {
        setRiderFormError(result.message || 'Failed to create rider.');
        return;
      }
      try {
        await sendRiderApprovedEmail({
          to: result.email,
          riderName: result.fullName,
          dkRiderId: result.dkRiderId,
          email: result.email,
          vehicleType: 'motorcycle',
          plateNumber: plateNumber.trim() || undefined,
        });
      } catch (mailErr) {
        console.warn('Rider welcome email failed:', mailErr);
      }
      setRiderForm(EMPTY_RIDER_FORM);
      setRiderOtp('');
      setRiderOtpSent(false);
      setRiderOtpVerified(false);
      setRiderOtpMsg('');
      showNotification(`Rider created: ${result.dkRiderId}`, 'success');
      setActiveTab('riders');
      setRiderFilterStatus('all');
    } catch (err) {
      console.error(err);
      setRiderFormError('Failed to create rider. Please try again.');
    } finally {
      setRiderFormLoading(false);
    }
  };

  const handleApprovePendingRider = async (app) => {
    const ok = await confirm({
      title: 'Approve rider?',
      message: `Approve "${app.fullName}" as a rider?\n\nEmail: ${app.email}`,
      confirmLabel: 'Approve',
      variant: 'primary',
      icon: 'fa-user-check',
    });
    if (!ok) return;
    try {
      const result = await approveRiderMutation({ id: app._id });
      try {
        await sendRiderApprovedEmail({
          to: app.email,
          riderName: app.fullName,
          dkRiderId: result.dkRiderId,
          email: app.email,
          vehicleType: 'motorcycle',
          plateNumber: app.plateNumber,
        });
      } catch (e) { console.warn(e); }
      showNotification(`Approved ${app.fullName} (${result.dkRiderId})`, 'success');
    } catch (err) {
      console.error(err);
      showNotification('Failed to approve rider.', 'error');
    }
  };

  const handleRejectPendingRider = async (app) => {
    const ok = await confirm({
      title: 'Reject application?',
      message: `Reject and delete application for "${app.fullName}"?`,
      confirmLabel: 'Reject',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await rejectRiderMutation({ id: app._id, reason: 'other', note: 'Rejected by admin' });
      showNotification(`Rejected ${app.fullName}`, 'success');
    } catch (err) {
      console.error(err);
      showNotification('Failed to reject application.', 'error');
    }
  };

  const openSuspendModal = (user) => {
    setUserToSuspend(user);
    setSuspendReason('');
    setSuspendDays(null);
    setSuspendNote('');
    setSuspendStep(STEP_CONFIGURE);
    setShowSuspendModal(true);
  };

  const closeSuspendModal = () => {
    if (suspendLoading) return;
    setShowSuspendModal(false);
    setSuspendStep(STEP_CONFIGURE);
    setUserToSuspend(null);
    setSuspendReason('');
    setSuspendNote('');
    setSuspendDays(null);
  };

  const handleReasonChange = (value) => {
    setSuspendReason(value);
    const cfg = SUSPEND_REASONS.find(r => r.value === value);
    if (cfg) setSuspendDays(cfg.defaultDays);
  };

  const getDurationOptions = () =>
    suspendReason === 'other' ? DURATION_OPTIONS_OTHER : DURATION_OPTIONS;

  const handleProceedToConfirm = () => {
    if (!suspendReason) return;
    setSuspendStep(STEP_CONFIRM);
  };

  const handleConfirmSuspend = async () => {
    if (!userToSuspend || !suspendReason) return;
    setSuspendLoading(true);
    try {
      await suspendUserMutation({
        id: userToSuspend._id,
        reason: suspendReason,
        note: suspendNote || undefined,
        durationDays: suspendDays ?? undefined,
      });
      const auth = JSON.parse(localStorage.getItem('authUser') || 'null');
      if (auth && auth._id === userToSuspend._id) {
        localStorage.removeItem('authUser');
        try { sessionStorage.removeItem('dkmerch_session_alive'); } catch { /* ignore */ }
        try { localStorage.removeItem('dkmerch_device_unlock'); } catch { /* ignore */ }
        window.location.href = '/';
      }
      const durationLabel = suspendDays
        ? `for ${suspendDays} day${suspendDays !== 1 ? 's' : ''}`
        : 'permanently';
      showNotification(
        `${userToSuspend.name} has been suspended ${durationLabel}. An email notification has been sent.`,
        'success'
      );
      closeSuspendModal();
    } catch (err) {
      console.error('Suspend error:', err);
      showNotification('Failed to suspend user. Please try again.', 'error');
    }
    setSuspendLoading(false);
  };

  const confirmUnsuspend = async () => {
    if (!userToUnsuspend) return;
    try {
      await unsuspendUserMutation({ id: userToUnsuspend._id });
      showNotification(`${userToUnsuspend.name} has been unsuspended successfully.`, 'success');
    } catch {
      showNotification('Failed to unsuspend user.', 'error');
    }
    setShowUnsuspendConfirm(false);
    setUserToUnsuspend(null);
  };

  const openDeleteConfirm = (user) => {
    setUserToDelete(user);
    setDeleteConfirmTyped('');
    setShowDeleteConfirm(true);
  };

  const closeDeleteConfirm = (force = false) => {
    if (deleteBusy && !force) return;
    setShowDeleteConfirm(false);
    setUserToDelete(null);
    setDeleteConfirmTyped('');
    setDeleteBusy(false);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete || deleteConfirmTyped.trim() !== DELETE_CONFIRM_WORD) return;
    const targetId = userToDelete._id;
    const targetName = userToDelete.name;
    setDeleteBusy(true);
    try {
      // Only `id` — matches current cloud deleteUser AND newer archive-capable deploy.
      const result = await deleteUserMutation({ id: targetId });
      if (result?.success === false) {
        showNotification(result.message || 'Failed to remove user.', 'error');
        return;
      }
      // Instantly hide from list (query refresh follows)
      setHiddenUserIds((prev) => new Set(prev).add(targetId));
      showNotification(
        result?.message ||
          `${targetName} removed from live users (unregistered).`,
        'success'
      );
      closeDeleteConfirm(true);
      refreshArchives();
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg.includes('userArchives') || msg.includes('Could not find') || msg.includes('ArgumentValidation')) {
        showNotification(
          'Delete failed on Convex. Run npx convex dev in your project folder, then try again.',
          'error'
        );
      } else {
        showNotification(msg.slice(0, 160) || 'Failed to remove user.', 'error');
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmWipeArchive = async () => {
    if (!archiveToWipe || wipeConfirmTyped.trim() !== DELETE_CONFIRM_WORD) return;
    setWipeBusy(true);
    try {
      const result = await permanentDeleteArchiveMutation({ archiveId: archiveToWipe._id });
      if (result?.success === false) {
        showNotification(result.message || 'Failed to wipe archive.', 'error');
      } else {
        showNotification('Archive permanently deleted.', 'success');
        setArchiveToWipe(null);
        setWipeConfirmTyped('');
      }
    } catch {
      showNotification('Failed to wipe archive.', 'error');
    } finally {
      setWipeBusy(false);
    }
  };

  const confirmActivate = async () => {
    if (!userToActivate) return;
    try {
      await activateUserMutation({ id: userToActivate._id });
      showNotification(`${userToActivate.name} has been activated successfully.`, 'success');
    } catch {
      showNotification('Failed to activate user.', 'error');
    }
    setShowActivateConfirm(false);
    setUserToActivate(null);
  };

  const openRiderDeleteModal = (rider) => {
    setRiderToDelete(rider);
    setRiderDeleteReason('');
    setRiderDeleteNote('');
    setRiderDeleteStep(STEP_CONFIGURE);
    setShowRiderDeleteModal(true);
  };

  const closeRiderDeleteModal = () => {
    if (riderDeleteLoading) return;
    setShowRiderDeleteModal(false);
    setRiderDeleteStep(STEP_CONFIGURE);
    setRiderToDelete(null);
    setRiderDeleteReason('');
    setRiderDeleteNote('');
  };

  const willSendEmail = (rider) =>
    rider && ['approved', 'suspended'].includes(rider.status);

  const confirmDeleteRider = async () => {
    if (!riderToDelete || !riderDeleteReason) return;
    setRiderDeleteLoading(true);
    try {
      await deleteRiderMutation({
        id:        riderToDelete._id,
        reason:    riderDeleteReason,
        note:      riderDeleteNote || undefined,
        sendEmail: willSendEmail(riderToDelete),
      });
      const emailMsg = willSendEmail(riderToDelete) ? ' Email notification sent to rider.' : '';
      showNotification(`${riderToDelete.fullName}'s account has been deleted.${emailMsg}`, 'success');
      closeRiderDeleteModal();
    } catch {
      showNotification('Failed to delete rider.', 'error');
    }
    setRiderDeleteLoading(false);
  };

  const getSelectedDeleteReasonLabel = () =>
    RIDER_DELETE_REASONS.find(r => r.value === riderDeleteReason)?.label || riderDeleteReason || '—';

  const getRoleBadgeClass        = (role)   => role === 'admin' ? 'role-badge admin' : 'role-badge user';
  const getRiderStatusBadgeClass = (status) => {
    const map = {
      pending:   'rider-status-badge pending',
      approved:  'rider-status-badge approved',
      rejected:  'rider-status-badge rejected',
      suspended: 'rider-status-badge suspended',
    };
    return map[status] || 'rider-status-badge pending';
  };

  // ── Status badge class — handles self_deactivated ─────────────────────────
  const getStatusBadgeClass = (status) => {
    const s = status || 'active';
    if (s === 'self_deactivated') return 'status-badge self-deactivated';
    if (s === 'deleted')          return 'status-badge deleted';
    return `status-badge ${s}`;
  };

  // ── Status display label + icon ───────────────────────────────────────────
  const getStatusDisplay = (status) => {
    const s = status || 'active';
    switch (s) {
      case 'active':           return { label: 'Active',      faIcon: 'fa-check-circle' };
      case 'suspended':        return { label: 'Suspended',   faIcon: 'fa-ban' };
      case 'self_deactivated': return { label: 'Deactivated', faIcon: 'fa-user-slash' };
      case 'deleted':          return { label: 'Deleted',     faIcon: 'fa-trash-alt' };
      default:                 return { label: s,             faIcon: 'fa-circle' };
    }
  };

  const formatDate = (ts) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getSuspendUntilLabel = (user) => {
    if (!user.suspendedUntil) return 'Permanent';
    const diffDays = Math.ceil((user.suspendedUntil - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Expires soon';
    return `${diffDays}d left`;
  };

  const getReasonLabel   = (val) => SUSPEND_REASONS.find(r => r.value === val)?.label || val || '—';
  const getDurationLabel = () => {
    if (suspendDays === null) return 'Permanent';
    if (suspendDays === 1) return '1 Day';
    return `${suspendDays} Days`;
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalUsers        = regularUsers.length;
  const activeUsers       = regularUsers.filter(u => (u.status || 'active') === 'active').length;
  const suspendedUsers    = regularUsers.filter(u => u.status === 'suspended').length;
  const deactivatedUsers  = regularUsers.filter(u => u.status === 'self_deactivated').length;
  const deletedUsers      = regularUsers.filter(u => u.status === 'deleted').length;
  const totalRiders       = riders.length;
  const approvedRiders    = riders.filter(r => r.status === 'approved').length;
  const pendingRiders     = riders.filter(r => r.status === 'pending').length;

  return (
    <div className="admin-users">

      {notification.show && (
        <div className={`notification ${notification.type}`}>
          <i className={`fas ${notification.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          <span>{notification.message}</span>
          <button className="notification-close" onClick={() => setNotification({ show: false, message: '', type: '' })}>
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      {/* ── STATS CARDS ── */}
      <div className="users-stats-row">
        {activeTab === 'riders' || activeTab === 'applications' ? (
          <>
            <div className="au-stat-card">
              <div className="au-stat-icon au-stat-icon--purple"><i className="fas fa-motorcycle"></i></div>
              <div className="au-stat-info">
                <div className="au-stat-label">TOTAL RIDERS</div>
                <div className="au-stat-number">{totalRiders}</div>
                <div className="au-stat-sub">registered riders</div>
              </div>
            </div>
            <div className="au-stat-card">
              <div className="au-stat-icon au-stat-icon--green"><i className="fas fa-check-circle"></i></div>
              <div className="au-stat-info">
                <div className="au-stat-label">APPROVED</div>
                <div className="au-stat-number">{approvedRiders}</div>
                <div className="au-stat-sub">active riders</div>
              </div>
            </div>
            <div className="au-stat-card">
              <div className="au-stat-icon au-stat-icon--yellow"><i className="fas fa-clock"></i></div>
              <div className="au-stat-info">
                <div className="au-stat-label">PENDING</div>
                <div className="au-stat-number">{pendingRiders}</div>
                <div className="au-stat-sub">{pendingRiders === 0 ? 'no pending' : 'awaiting review'}</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="au-stat-card">
              <div className="au-stat-icon au-stat-icon--green"><i className="fas fa-user-check"></i></div>
              <div className="au-stat-info">
                <div className="au-stat-label">ACTIVE</div>
                <div className="au-stat-number">{activeUsers}</div>
                <div className="au-stat-sub">active accounts</div>
              </div>
            </div>
            <div className="au-stat-card">
              <div className="au-stat-icon au-stat-icon--red"><i className="fas fa-user-slash"></i></div>
              <div className="au-stat-info">
                <div className="au-stat-label">SUSPENDED / DELETED</div>
                <div className="au-stat-number">{suspendedUsers + deletedUsers}</div>
                <div className="au-stat-sub">
                  {suspendedUsers > 0 && `${suspendedUsers} suspended`}
                  {suspendedUsers > 0 && deletedUsers > 0 && ' · '}
                  {deletedUsers > 0 && `${deletedUsers} deleted`}
                  {suspendedUsers === 0 && deletedUsers === 0 && 'none'}
                </div>
              </div>
            </div>
            <div className="au-stat-card">
              <div className="au-stat-icon au-stat-icon--yellow"><i className="fas fa-user-clock"></i></div>
              <div className="au-stat-info">
                <div className="au-stat-label">DEACTIVATED</div>
                <div className="au-stat-number">{deactivatedUsers}</div>
                <div className="au-stat-sub">{deactivatedUsers === 0 ? 'none' : 'self-deactivated'}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── TABS ── */}
      <div className="tab-switcher">
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          <i className="fas fa-user"></i>
          <span className="tab-label">Users</span>
          <span className="au-tab-badge">{totalUsers}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
          <i className="fas fa-user-clock"></i>
          <span className="tab-label tab-label--long">Pending Activation</span>
          <span className="tab-label tab-label--short">Pending</span>
          <span className="au-tab-badge">{pendingUsers.length}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'archives' ? 'active' : ''}`} onClick={() => setActiveTab('archives')}>
          <i className="fas fa-archive"></i>
          <span className="tab-label">Archives</span>
          <span className="au-tab-badge">{userArchives.length}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'riders' ? 'active' : ''}`} onClick={() => setActiveTab('riders')}>
          <i className="fas fa-motorcycle"></i>
          <span className="tab-label">Riders</span>
          <span className="au-tab-badge">{totalRiders}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'applications' ? 'active' : ''}`} onClick={() => setActiveTab('applications')}>
          <i className="fas fa-id-card"></i>
          <span className="tab-label tab-label--long">Rider Applications</span>
          <span className="tab-label tab-label--short">Applications</span>
          <span className="au-tab-badge">{pendingRiders}</span>
        </button>
      </div>

      {/* ══ USERS TAB ══════════════════════════════════════════════════════════ */}
      {activeTab === 'users' && (
        <>
          <div className="users-controls">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="Search by name, username, email, or role..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              {searchTerm && <button className="clear-search" onClick={() => setSearchTerm('')}><i className="fas fa-times"></i></button>}
            </div>
            <div className="status-filter">
              {['all', 'active', 'suspended', 'self_deactivated', 'deleted'].map(s => (
                <button key={s} className={`filter-btn ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>
                  {s === 'self_deactivated' ? 'Deactivated' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="users-table-container">
            {filteredUsers.length === 0 ? (
              <div className="no-users"><i className="fas fa-user-slash"></i><p>No users found</p></div>
            ) : (
              <div className="dk-fixed-page dk-fixed-page--table" style={fixedPageStyle(pageSize, { '--dk-row-h': '64px' })}>
              <table className="users-table">
                <thead>
                  <tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {pagedUsers.map(user => {
                    const { label: statusLabel, faIcon: statusFaIcon } = getStatusDisplay(user.status);
                    const isActive      = (user.status || 'active') === 'active';
                    const isSuspended   = user.status === 'suspended';
                    const isDeactivated = user.status === 'self_deactivated';
                    const isDeleted     = user.status === 'deleted';
                    const isAdmin       = user.email === 'admin' || user.role === 'admin';

                    return (
                      <tr key={user._id}>
                        <td className="user-name" data-label="Name"><i className="fas fa-user-circle"></i>{user.name}</td>
                        <td data-label="Username">@{user.username}</td>
                        <td data-label="Email">{user.email}</td>
                        <td data-label="Role">
                          <span className={getRoleBadgeClass(user.role)}>
                            <i className={`fas ${user.role === 'admin' ? 'fa-shield-alt' : 'fa-user'}`}></i>
                            {user.role}
                          </span>
                        </td>
                        <td data-label="Status">
                          <div className="status-cell">
                            <span className={getStatusBadgeClass(user.status)}>
                              <i className={`fas ${statusFaIcon || 'fa-circle'}`}></i>
                              {statusLabel}
                            </span>

                            {/* Suspended meta chips */}
                            {isSuspended && (
                              <span className="suspend-meta">
                                <span className="suspend-duration-chip">
                                  <i className="fas fa-clock"></i>{getSuspendUntilLabel(user)}
                                </span>
                                {user.suspendReason && (
                                  <span className="suspend-reason-chip">{getReasonLabel(user.suspendReason)}</span>
                                )}
                              </span>
                            )}

                            {/* Deactivated info chip */}
                            {isDeactivated && (
                              <span className="deactivated-chip">
                                <i className="fas fa-info-circle"></i>Self-deactivated · Can reactivate via login
                              </span>
                            )}

                            {/* Deleted info chip */}
                            {isDeleted && (
                              <span className="deleted-chip">
                                <i className="fas fa-trash-alt"></i>Self-deleted · Use trash to unregister permanently
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="actions-cell" data-label="Actions">
                          {!isAdmin && (
                            <>
                              {/* Active — can suspend */}
                              {isActive && (
                                <button className="btn-suspend" onClick={() => openSuspendModal(user)} title="Suspend user">
                                  <i className="fas fa-ban"></i>
                                </button>
                              )}

                              {/* Suspended — can unsuspend */}
                              {isSuspended && (
                                <button className="btn-suspend btn-activate"
                                  onClick={() => { setUserToUnsuspend(user); setShowUnsuspendConfirm(true); }}
                                  title="Unsuspend user">
                                  <i className="fas fa-check-circle"></i>
                                </button>
                              )}

                              {/* Deactivated — customer can still reactivate; admin may delete */}
                              {isDeactivated && (
                                <span className="au-no-action-tip" title="Customer can reactivate via login OTP">
                                  <i className="fas fa-info-circle"></i>
                                </span>
                              )}

                              {/* Delete / unregister — frees email & username for new signup */}
                              <button
                                className="btn-delete"
                                onClick={() => openDeleteConfirm(user)}
                                title="Archive & unregister account"
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
            <AdminPager
              total={filteredUsers.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </>
      )}

      {/* ══ PENDING ACTIVATION TAB ═════════════════════════════════════════════ */}
      {activeTab === 'pending' && (
        <>
          <div className="users-controls">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="Search pending users..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              {searchTerm && <button className="clear-search" onClick={() => setSearchTerm('')}><i className="fas fa-times"></i></button>}
            </div>
            <div style={{ color: '#e53e3e', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-shield-alt"></i>
              These accounts were flagged as suspicious and require manual activation.
            </div>
          </div>
          <div className="users-table-container">
            {filteredPending.length === 0 ? (
              <div className="no-users">
                <i className="fas fa-check-circle" style={{ color: '#28a745' }}></i>
                <p>No pending activations — no suspicious registrations detected!</p>
              </div>
            ) : (
              <table className="users-table">
                <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Registered</th><th>Reason</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredPending.map(user => (
                    <tr key={user._id}>
                      <td className="user-name" data-label="Name"><i className="fas fa-user-clock" style={{ color: '#ed8936' }}></i>{user.name}</td>
                      <td data-label="Username">@{user.username}</td>
                      <td data-label="Email">{user.email}</td>
                      <td className="date-cell" data-label="Registered">{formatDate(user.registeredAt)}</td>
                      <td data-label="Reason">
                        <span style={{ background: '#fff3cd', color: '#856404', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                          <i className="fas fa-robot" style={{ marginRight: 4 }}></i>
                          {user.suspendReason === 'spam_registration' ? 'Spam/Bot Detection' : user.suspendReason || 'Flagged'}
                        </span>
                      </td>
                      <td className="actions-cell" data-label="Actions">
                        <button className="btn-suspend btn-activate" title="Activate"
                          onClick={() => { setUserToActivate(user); setShowActivateConfirm(true); }}>
                          <i className="fas fa-check-circle"></i>
                        </button>
                        <button className="btn-delete" title="Archive & unregister"
                          onClick={() => openDeleteConfirm(user)}>
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══ USER ARCHIVES TAB ═════════════════════════════════════════════════ */}
      {activeTab === 'archives' && (
        <>
          <div className="users-controls">
            <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.45 }}>
              <i className="fas fa-archive" style={{ marginRight: 6, color: '#fc1268' }}></i>
              Deleted accounts are archived here (audit). Live email/username are free to register again. Permanent wipe removes the archive only.
            </div>
          </div>
          {archivesDeployNeeded && (
            <div className="au-deploy-banner">
              <i className="fas fa-cloud-upload-alt"></i>
              <div>
                <strong>Convex deploy needed.</strong> New archive APIs are in the code but not on your cloud yet.
                In a terminal run: <code>npx convex dev</code> (or <code>npx convex deploy</code>), then refresh.
              </div>
            </div>
          )}
          <div className="users-table-container">
            {userArchives.length === 0 ? (
              <div className="no-users">
                <i className="fas fa-archive" style={{ color: '#94a3b8' }}></i>
                <p>{archivesDeployNeeded ? 'Archives unavailable until Convex is deployed.' : 'No archived accounts yet.'}</p>
              </div>
            ) : (
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Archived</th>
                    <th>By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {userArchives.map((row) => (
                    <tr key={row._id}>
                      <td className="user-name" data-label="Name"><i className="fas fa-archive"></i>{row.name}</td>
                      <td data-label="Username">@{row.username}</td>
                      <td data-label="Email">{row.email}</td>
                      <td className="date-cell" data-label="Archived">{formatDate(row.archivedAt)}</td>
                      <td data-label="By">{row.archivedBy || 'admin'}</td>
                      <td className="actions-cell" data-label="Actions">
                        <button
                          className="btn-delete"
                          title="Permanently wipe archive"
                          onClick={() => { setArchiveToWipe(row); setWipeConfirmTyped(''); }}
                        >
                          <i className="fas fa-skull-crossbones"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══ RIDERS TAB ═════════════════════════════════════════════════════════ */}
      {activeTab === 'riders' && (
        <>
          <div className="users-controls">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="Search by name, email, phone, vehicle..."
                value={riderSearch} onChange={e => setRiderSearch(e.target.value)} />
              {riderSearch && <button className="clear-search" onClick={() => setRiderSearch('')}><i className="fas fa-times"></i></button>}
            </div>
            <div className="status-filter">
              {['all', 'rejected', 'suspended'].map(s => (
                <button key={s} className={`filter-btn ${riderFilterStatus === s ? 'active' : ''}`} onClick={() => setRiderFilterStatus(s)}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="users-table-container">
            {filteredRiders.length === 0 ? (
              <div className="no-users"><i className="fas fa-motorcycle"></i><p>No riders found</p></div>
            ) : (
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Vehicle</th>
                    <th>Rider ID</th>
                    <th>Status</th>
                    <th>Applied</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRiders.map(rider => (
                    <tr key={rider._id}>
                      <td className="user-name" data-label="Name">
                        <span className="au-pending-name-cell">
                          {rider.riderPhoto
                            ? <img src={rider.riderPhoto} alt="" className="au-pending-thumb" />
                            : <span className="au-pending-thumb-fallback"><i className="fas fa-motorcycle"></i></span>}
                          {rider.fullName}
                        </span>
                      </td>
                      <td data-label="Email">{rider.email}</td>
                      <td data-label="Phone">{rider.phone}</td>
                      <td data-label="Vehicle">Motorcycle</td>
                      <td data-label="Rider ID">
                        {rider.dkRiderId
                          ? <span className="au-rider-id-chip">{rider.dkRiderId}</span>
                          : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                      </td>
                      <td data-label="Status">
                        <span className={getRiderStatusBadgeClass(rider.status)}>
                          {rider.status === 'approved'  && <i className="fas fa-check-circle"></i>}
                          {rider.status === 'pending'   && <i className="fas fa-clock"></i>}
                          {rider.status === 'rejected'  && <i className="fas fa-times-circle"></i>}
                          {rider.status === 'suspended' && <i className="fas fa-ban"></i>}
                          {rider.status}
                        </span>
                      </td>
                      <td className="date-cell" data-label="Applied">{formatDate(rider.appliedAt)}</td>
                      <td className="actions-cell" data-label="Actions">
                        <button
                          className="btn-suspend btn-activate"
                          onClick={() => setViewingRider(rider)}
                          title="View rider"
                        >
                          <i className="fas fa-eye"></i>
                        </button>
                        <button className="btn-delete" onClick={() => openRiderDeleteModal(rider)} title="Delete">
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══ RIDER APPLICATIONS TAB ═════════════════════════════════════════════ */}
      {activeTab === 'applications' && (
        <>
          <div className="au-rider-app-card">
            <div className="au-rider-app-header">
              <div>
                <h3><i className="fas fa-user-plus"></i> Add Rider</h3>
                <p>Admin fills rider details. Account is created as approved and can log in at /rider.</p>
              </div>
            </div>
            <form className="au-rider-app-form" onSubmit={handleAdminCreateRider}>
              <div className="au-rider-form-grid">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input name="fullName" value={riderForm.fullName} onChange={handleRiderFormChange} placeholder="Juan Dela Cruz" required />
                </div>
                <div className="form-group">
                  <label>Email (login) *</label>
                  <input name="email" type="email" value={riderForm.email} onChange={handleRiderFormChange} placeholder="rider@email.com" required />
                  <div className="au-rider-otp-row">
                    <button
                      type="button"
                      className="au-btn-secondary au-otp-send-btn"
                      disabled={riderOtpBusy || riderOtpCooldown > 0}
                      onClick={handleSendRiderOtp}
                    >
                      {riderOtpBusy ? <><i className="fas fa-spinner fa-spin"></i> Sending…</>
                        : riderOtpCooldown > 0 ? `Resend in ${riderOtpCooldown}s`
                          : <><i className="fas fa-paper-plane"></i> Send OTP</>}
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit OTP"
                      value={riderOtp}
                      onChange={(e) => setRiderOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      disabled={!riderOtpSent || riderOtpVerified}
                    />
                    <button
                      type="button"
                      className="au-btn-secondary"
                      disabled={riderOtpBusy || !riderOtpSent || riderOtpVerified}
                      onClick={handleVerifyRiderOtp}
                    >
                      {riderOtpVerified ? <><i className="fas fa-check"></i> Verified</> : 'Verify'}
                    </button>
                  </div>
                  {riderOtpMsg && (
                    <small className={`au-field-hint ${riderOtpVerified ? 'au-otp-ok' : ''}`}>{riderOtpMsg}</small>
                  )}
                </div>
                <div className="form-group">
                  <label>Phone *</label>
                  <input name="phone" value={riderForm.phone} onChange={handleRiderFormChange} placeholder="09XXXXXXXXX" required />
                </div>
                <div className="form-group">
                  <label>Vehicle Type</label>
                  <input value="Motorcycle" disabled readOnly className="au-vehicle-fixed" />
                  <input type="hidden" name="vehicleType" value="motorcycle" />
                </div>
                <div className="form-group">
                  <label>Plate Number</label>
                  <input
                    name="plateNumber"
                    value={riderForm.plateNumber}
                    onChange={handleRiderFormChange}
                    placeholder="PRO 1234"
                    autoCapitalize="characters"
                    style={{ textTransform: 'uppercase' }}
                  />
                  <small className="au-field-hint">Auto: ABC 1234 · caps + space</small>
                </div>
                <div className="form-group">
                  <label>License Number</label>
                  <input
                    name="licenseNumber"
                    value={riderForm.licenseNumber}
                    onChange={handleRiderFormChange}
                    placeholder="N01-23-456789"
                    autoCapitalize="characters"
                    style={{ textTransform: 'uppercase' }}
                  />
                  <small className="au-field-hint">Auto: N01-23-456789 · caps + dashes</small>
                </div>
                <div className="form-group au-rider-form-span2">
                  <label>Address</label>
                  <input name="address" value={riderForm.address} onChange={handleRiderFormChange} placeholder="Delivery area / home address" />
                </div>
                <div className="form-group au-rider-form-span2">
                  <label>Rider Face Photo * <span className="au-field-hint">shown to customers on Track Order</span></label>
                  <div className="au-rider-form-photo">
                    {riderForm.riderPhoto ? (
                      <img src={riderForm.riderPhoto} alt="Rider preview" className="au-rider-form-photo-preview" />
                    ) : (
                      <div className="au-rider-form-photo-placeholder"><i className="fas fa-user-circle"></i></div>
                    )}
                    <div className="au-rider-form-photo-actions">
                      <label className="au-btn-secondary au-file-label">
                        <i className="fas fa-camera"></i> {riderForm.riderPhoto ? 'Change Photo' : 'Upload Photo'}
                        <input
                          type="file"
                          accept={IMAGE_ACCEPT_NO_GIF}
                          hidden
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            const check = validateImageFile(file);
                            if (!check.ok) {
                              setRiderFormError(check.error || 'Please choose a JPG or PNG image.');
                              return;
                            }
                            try {
                              const dataUrl = await fileToDataUrl(file);
                              setRiderForm(prev => ({ ...prev, riderPhoto: dataUrl }));
                              setRiderFormError('');
                            } catch {
                              setRiderFormError('Failed to read photo.');
                            }
                          }}
                        />
                      </label>
                      {riderForm.riderPhoto && (
                        <button
                          type="button"
                          className="au-btn-secondary"
                          onClick={() => setRiderForm(prev => ({ ...prev, riderPhoto: null }))}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label>Password * <span className="au-field-hint">must start with @rider</span></label>
                  <div className="au-pw-row">
                    <input
                      name="password"
                      type={showRiderPw ? 'text' : 'password'}
                      value={riderForm.password}
                      onChange={handleRiderFormChange}
                      placeholder="@rider1"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="au-pw-toggle"
                      onClick={() => setShowRiderPw((p) => !p)}
                      aria-label={showRiderPw ? 'Hide password' : 'Show password'}
                      title={showRiderPw ? 'Hide password' : 'Show password'}
                    >
                      <i className={`fas ${showRiderPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Confirm Password *</label>
                  <div className="au-pw-row">
                    <input
                      name="confirmPassword"
                      type={showRiderPw ? 'text' : 'password'}
                      value={riderForm.confirmPassword}
                      onChange={handleRiderFormChange}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="au-pw-toggle"
                      onClick={() => setShowRiderPw((p) => !p)}
                      aria-label={showRiderPw ? 'Hide password' : 'Show password'}
                      title={showRiderPw ? 'Hide password' : 'Show password'}
                    >
                      <i className={`fas ${showRiderPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                </div>
              </div>
              {riderFormError && (
                <div className="au-rider-form-error"><i className="fas fa-exclamation-circle"></i> {riderFormError}</div>
              )}
              <div className="au-rider-form-actions">
                <button
                  type="button"
                  className="au-btn-secondary"
                  onClick={() => {
                    setRiderForm(EMPTY_RIDER_FORM);
                    setRiderFormError('');
                    setRiderOtp('');
                    setRiderOtpSent(false);
                    setRiderOtpVerified(false);
                    setRiderOtpMsg('');
                  }}
                  disabled={riderFormLoading}
                >
                  Clear
                </button>
                <button type="submit" className="au-btn-primary" disabled={riderFormLoading}>
                  {riderFormLoading ? <><i className="fas fa-spinner fa-spin"></i> Creating...</> : <><i className="fas fa-user-check"></i> Create & Approve Rider</>}
                </button>
              </div>
            </form>
          </div>

          <div className="au-rider-pending-block">
            <h4><i className="fas fa-inbox"></i> Pending Applications ({pendingApplications.length})</h4>
            {pendingApplications.length === 0 ? (
              <div className="no-users" style={{ padding: '28px 16px' }}>
                <i className="fas fa-check-circle" style={{ color: '#16a34a' }}></i>
                <p>No pending applications</p>
              </div>
            ) : (
              <div className="users-table-container" style={{ marginTop: 12 }}>
                <table className="users-table">
                  <thead>
                    <tr><th>Full Name</th><th>Email</th><th>Phone</th><th>Vehicle</th><th>Applied</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {pendingApplications.map(app => (
                      <tr key={app._id}>
                        <td className="user-name">
                          <span className="au-pending-name-cell">
                            {app.riderPhoto
                              ? <img src={app.riderPhoto} alt="" className="au-pending-thumb" />
                              : <span className="au-pending-thumb-fallback"><i className="fas fa-user"></i></span>}
                            {app.fullName}
                          </span>
                        </td>
                        <td>{app.email}</td>
                        <td>{app.phone}</td>
                        <td>Motorcycle</td>
                        <td className="date-cell">{formatDate(app.appliedAt)}</td>
                        <td className="actions-cell">
                          <button className="btn-suspend btn-activate" title="View photos & details" onClick={() => setPendingAppDetail(app)}>
                            <i className="fas fa-eye"></i>
                          </button>
                          <button className="btn-suspend btn-activate" title="Approve" onClick={() => handleApprovePendingRider(app)}>
                            <i className="fas fa-check-circle"></i>
                          </button>
                          <button className="btn-delete" title="Reject" onClick={() => handleRejectPendingRider(app)}>
                            <i className="fas fa-times-circle"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ SUSPEND MODAL ══════════════════════════════════════════════════════ */}
      {showSuspendModal && (
        <div className="modal-overlay" onClick={closeSuspendModal}>
          <div className="modal-content suspend-modal" onClick={e => e.stopPropagation()}>
            {suspendStep === STEP_CONFIGURE && (
              <>
                <div className="modal-header suspend-modal-header">
                  <h2><i className="fas fa-ban"></i> Suspend Account</h2>
                  <button className="close-btn" onClick={closeSuspendModal}><i className="fas fa-times"></i></button>
                </div>
                <div className="suspend-modal-body">
                  <div className="suspend-user-pill">
                    <i className="fas fa-user-circle"></i>
                    <div>
                      <div className="suspend-user-name">{userToSuspend?.name}</div>
                      <div className="suspend-user-email">{userToSuspend?.email}</div>
                    </div>
                  </div>
                  <div className="form-group">
                    <label><i className="fas fa-exclamation-triangle"></i> Reason <span className="required-star">*</span></label>
                    <div className="reason-grid">
                      {SUSPEND_REASONS.map(r => (
                        <button key={r.value} type="button"
                          className={`reason-chip ${suspendReason === r.value ? 'active' : ''}`}
                          onClick={() => handleReasonChange(r.value)}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {suspendReason && (
                    <div className="form-group">
                      <label><i className="fas fa-calendar-alt"></i> Duration</label>
                      <div className="duration-grid">
                        {getDurationOptions().map(d => (
                          <button key={d.label} type="button"
                            className={`duration-chip ${suspendDays === d.days ? 'active' : ''} ${d.days === null ? 'permanent-chip' : ''}`}
                            onClick={() => setSuspendDays(d.days)}>
                            {d.days === null && <i className="fas fa-infinity"></i>}
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {suspendReason && (
                    <div className="form-group">
                      <label><i className="fas fa-sticky-note"></i> Note <span className="optional-label">(optional)</span></label>
                      <textarea className="suspend-note" placeholder="Add a note..."
                        value={suspendNote} onChange={e => setSuspendNote(e.target.value)} rows={3} />
                    </div>
                  )}
                  {suspendReason && (
                    <div className={`suspend-warning-box ${suspendDays === null ? 'permanent' : 'temporary'}`}>
                      <i className={`fas ${suspendDays === null ? 'fa-exclamation-circle' : 'fa-info-circle'}`}></i>
                      <div>
                        {suspendDays === null
                          ? <><strong>Permanent suspension</strong> — the user will lose access indefinitely and receive an email notification.</>
                          : <><strong>{suspendDays}-day suspension</strong> — auto-restores after {suspendDays} day{suspendDays !== 1 ? 's' : ''}. Email notification will be sent.</>
                        }
                      </div>
                    </div>
                  )}
                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={closeSuspendModal}>Cancel</button>
                    <button className="btn-suspend-confirm" onClick={handleProceedToConfirm} disabled={!suspendReason || suspendDays === undefined}>
                      <i className="fas fa-arrow-right"></i> Review & Confirm
                    </button>
                  </div>
                </div>
              </>
            )}
            {suspendStep === STEP_CONFIRM && (
              <>
                <div className="modal-header suspend-modal-header">
                  <h2><i className="fas fa-exclamation-triangle"></i> Confirm Suspension</h2>
                  <button className="close-btn" onClick={closeSuspendModal} disabled={suspendLoading}><i className="fas fa-times"></i></button>
                </div>
                <div className="suspend-modal-body">
                  <div className="suspend-confirm-summary">
                    <div className="suspend-confirm-icon"><i className="fas fa-ban"></i></div>
                    <p className="suspend-confirm-headline">You are about to suspend <strong>{userToSuspend?.name}</strong></p>
                    <p className="suspend-confirm-sub">{userToSuspend?.email}</p>
                    <div className="suspend-confirm-details">
                      <div className="suspend-confirm-row">
                        <span className="suspend-confirm-label"><i className="fas fa-exclamation-triangle"></i> Reason</span>
                        <span className="suspend-confirm-value">{getReasonLabel(suspendReason)}</span>
                      </div>
                      <div className="suspend-confirm-row">
                        <span className="suspend-confirm-label"><i className="fas fa-calendar-alt"></i> Duration</span>
                        <span className={`suspend-confirm-value ${suspendDays === null ? 'permanent-label' : ''}`}>{getDurationLabel()}</span>
                      </div>
                      {suspendNote && (
                        <div className="suspend-confirm-row">
                          <span className="suspend-confirm-label"><i className="fas fa-sticky-note"></i> Note</span>
                          <span className="suspend-confirm-value">{suspendNote}</span>
                        </div>
                      )}
                      <div className="suspend-confirm-row">
                        <span className="suspend-confirm-label"><i className="fas fa-envelope"></i> Email</span>
                        <span className="suspend-confirm-value">Notification will be sent</span>
                      </div>
                    </div>
                  </div>
                  <div className={`suspend-final-warning ${suspendDays === null ? 'permanent' : 'temporary'}`}>
                    <i className="fas fa-exclamation-circle"></i>
                    <span>
                      {suspendDays === null
                        ? 'Permanent suspension — cannot log in until manually unsuspended.'
                        : `Account will be locked for ${suspendDays} day${suspendDays !== 1 ? 's' : ''} and automatically restored afterward.`
                      }
                    </span>
                  </div>
                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={() => setSuspendStep(STEP_CONFIGURE)} disabled={suspendLoading}>
                      <i className="fas fa-arrow-left"></i> Go Back
                    </button>
                    <button className="btn-suspend-confirm" onClick={handleConfirmSuspend} disabled={suspendLoading}>
                      {suspendLoading ? <><i className="fas fa-spinner fa-spin"></i> Suspending...</> : <><i className="fas fa-ban"></i> Yes, Suspend Account</>}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ UNSUSPEND / REACTIVATE CONFIRM ════════════════════════════════════ */}
      {showUnsuspendConfirm && (
        <div className="modal-overlay" onClick={() => setShowUnsuspendConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon activate"><i className="fas fa-check-circle"></i></div>
            <h2>Unsuspend Account?</h2>
            <p>Restore access for <strong>{userToUnsuspend?.name}</strong>?</p>
            <p className="success-text">They will be able to log in immediately.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowUnsuspendConfirm(false)}>Cancel</button>
              <button className="btn-activate-confirm" onClick={confirmUnsuspend}>
                <i className="fas fa-check-circle"></i> Unsuspend
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ACTIVATE CONFIRM ═══════════════════════════════════════════════════ */}
      {showActivateConfirm && (
        <div className="modal-overlay" onClick={() => setShowActivateConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon activate"><i className="fas fa-user-check"></i></div>
            <h2>Activate Account?</h2>
            <p>Activate <strong>{userToActivate?.name}</strong>'s account?</p>
            <p className="success-text">They will be able to log in immediately after activation.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowActivateConfirm(false)}>Cancel</button>
              <button className="btn-activate-confirm" onClick={confirmActivate}><i className="fas fa-check-circle"></i> Activate</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ DELETE / ARCHIVE USER — type-to-confirm ═══════════════════════════ */}
      {showDeleteConfirm && userToDelete && (
        <div className="modal-overlay" onClick={closeDeleteConfirm}>
          <div className="modal-content confirm-modal au-type-confirm" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon suspend"><i className="fas fa-archive"></i></div>
            <h2>Archive &amp; Unregister?</h2>
            <p>
              Move <strong>{userToDelete.name}</strong>
              {userToDelete.email ? <> (<strong>{userToDelete.email}</strong>)</> : null} out of live users into <strong>Archives</strong>.
            </p>
            <p className="warning-text">
              Email/username become free to register again. Cart/wishlist cleared. Snapshot stays in Archives until you permanently wipe it.
            </p>
            <div className="au-type-banner">
              Type <strong>{DELETE_CONFIRM_WORD}</strong> exactly below to continue.
            </div>
            <label className="au-type-label" htmlFor="au-delete-confirm">Confirmation phrase</label>
            <input
              id="au-delete-confirm"
              className={`au-type-input ${deleteConfirmTyped.trim() === DELETE_CONFIRM_WORD ? 'au-type-input--ok' : ''}`}
              type="text"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={deleteBusy}
              value={deleteConfirmTyped}
              placeholder={`Type ${DELETE_CONFIRM_WORD}`}
              onChange={(e) => setDeleteConfirmTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && deleteConfirmTyped.trim() === DELETE_CONFIRM_WORD && !deleteBusy) {
                  e.preventDefault();
                  confirmDeleteUser();
                }
              }}
            />
            <div className="modal-actions">
              <button className="btn-cancel" onClick={closeDeleteConfirm} disabled={deleteBusy}>Cancel</button>
              <button
                className="btn-suspend-confirm"
                onClick={confirmDeleteUser}
                disabled={deleteBusy || deleteConfirmTyped.trim() !== DELETE_CONFIRM_WORD}
              >
                <i className="fas fa-archive"></i> {deleteBusy ? 'Archiving…' : 'Archive Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ WIPE USER ARCHIVE — type-to-confirm ════════════════════════════════ */}
      {archiveToWipe && (
        <div className="modal-overlay" onClick={() => !wipeBusy && setArchiveToWipe(null)}>
          <div className="modal-content confirm-modal au-type-confirm" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon suspend"><i className="fas fa-skull-crossbones"></i></div>
            <h2>Permanently Wipe Archive?</h2>
            <p>
              Delete archived snapshot of <strong>{archiveToWipe.name}</strong> ({archiveToWipe.email}). No restore after this.
            </p>
            <div className="au-type-banner">
              Type <strong>{DELETE_CONFIRM_WORD}</strong> exactly below to continue.
            </div>
            <label className="au-type-label" htmlFor="au-wipe-confirm">Confirmation phrase</label>
            <input
              id="au-wipe-confirm"
              className={`au-type-input ${wipeConfirmTyped.trim() === DELETE_CONFIRM_WORD ? 'au-type-input--ok' : ''}`}
              type="text"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={wipeBusy}
              value={wipeConfirmTyped}
              placeholder={`Type ${DELETE_CONFIRM_WORD}`}
              onChange={(e) => setWipeConfirmTyped(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => { setArchiveToWipe(null); setWipeConfirmTyped(''); }} disabled={wipeBusy}>Cancel</button>
              <button
                className="btn-suspend-confirm"
                onClick={confirmWipeArchive}
                disabled={wipeBusy || wipeConfirmTyped.trim() !== DELETE_CONFIRM_WORD}
              >
                <i className="fas fa-trash"></i> {wipeBusy ? 'Wiping…' : 'Wipe Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingRider && (
        <RiderViewModal
          rider={viewingRider}
          onClose={() => setViewingRider(null)}
          onPhotoUpdated={(updated) => setViewingRider(updated)}
        />
      )}
      {pendingAppDetail && (
        <PendingAppDetailModal
          app={pendingAppDetail}
          onClose={() => setPendingAppDetail(null)}
          onApprove={handleApprovePendingRider}
          onReject={handleRejectPendingRider}
        />
      )}

      {/* ══ RIDER DELETE MODAL ════════════════════════════════════════════════ */}
      {showRiderDeleteModal && riderToDelete && (
        <div className="modal-overlay" onClick={closeRiderDeleteModal}>
          <div className="modal-content suspend-modal" onClick={e => e.stopPropagation()}>
            {riderDeleteStep === STEP_CONFIGURE && (
              <>
                <div className="modal-header" style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                  <h2><i className="fas fa-trash"></i> Delete Rider Account</h2>
                  <button className="close-btn" onClick={closeRiderDeleteModal}><i className="fas fa-times"></i></button>
                </div>
                <div className="suspend-modal-body">
                  <div className="suspend-user-pill">
                    <i className="fas fa-motorcycle" style={{ color: '#7c3aed', fontSize: 28 }}></i>
                    <div>
                      <div className="suspend-user-name">{riderToDelete.fullName}</div>
                      <div className="suspend-user-email">{riderToDelete.email}</div>
                      <span className={getRiderStatusBadgeClass(riderToDelete.status)} style={{ fontSize: 10, padding: '2px 8px', marginTop: 4, display: 'inline-flex' }}>
                        {riderToDelete.status}
                      </span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label><i className="fas fa-exclamation-triangle"></i> Reason for Deletion <span className="required-star">*</span></label>
                    <div className="reason-grid">
                      {RIDER_DELETE_REASONS.map(r => (
                        <button key={r.value} type="button"
                          className={`reason-chip ${riderDeleteReason === r.value ? 'active' : ''}`}
                          onClick={() => setRiderDeleteReason(r.value)}
                          style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                          <span style={{ fontWeight: 700 }}>{r.label}</span>
                          <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 400 }}>{r.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {riderDeleteReason && (
                    <div className="form-group">
                      <label><i className="fas fa-sticky-note"></i> Note <span className="optional-label">(optional)</span></label>
                      <textarea className="suspend-note" placeholder="Add a note for records..."
                        value={riderDeleteNote} onChange={e => setRiderDeleteNote(e.target.value)} rows={2} />
                    </div>
                  )}
                  {riderDeleteReason && willSendEmail(riderToDelete) && (
                    <div className="suspend-warning-box temporary">
                      <i className="fas fa-envelope"></i>
                      <div>
                        <strong>Email notification will be sent</strong> to <strong>{riderToDelete.email}</strong> informing them of the account deletion.
                      </div>
                    </div>
                  )}
                  {riderDeleteReason && (
                    <div className="suspend-warning-box permanent" style={{ marginTop: 8 }}>
                      <i className="fas fa-exclamation-circle"></i>
                      <div><strong>This action is permanent.</strong> All rider data will be removed and cannot be undone.</div>
                    </div>
                  )}
                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={closeRiderDeleteModal}>Cancel</button>
                    <button className="btn-suspend-confirm"
                      style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}
                      onClick={() => riderDeleteReason && setRiderDeleteStep(STEP_CONFIRM)}
                      disabled={!riderDeleteReason}>
                      <i className="fas fa-arrow-right"></i> Review & Confirm
                    </button>
                  </div>
                </div>
              </>
            )}
            {riderDeleteStep === STEP_CONFIRM && (
              <>
                <div className="modal-header" style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                  <h2><i className="fas fa-exclamation-triangle"></i> Confirm Deletion</h2>
                  <button className="close-btn" onClick={closeRiderDeleteModal} disabled={riderDeleteLoading}><i className="fas fa-times"></i></button>
                </div>
                <div className="suspend-modal-body">
                  <div className="suspend-confirm-summary">
                    <div className="suspend-confirm-icon" style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                      <i className="fas fa-trash"></i>
                    </div>
                    <p className="suspend-confirm-headline">Permanently delete <strong>{riderToDelete.fullName}</strong>?</p>
                    <p className="suspend-confirm-sub">{riderToDelete.email}</p>
                    <div className="suspend-confirm-details">
                      <div className="suspend-confirm-row">
                        <span className="suspend-confirm-label"><i className="fas fa-exclamation-triangle"></i> Reason</span>
                        <span className="suspend-confirm-value">{getSelectedDeleteReasonLabel()}</span>
                      </div>
                      {riderDeleteNote && (
                        <div className="suspend-confirm-row">
                          <span className="suspend-confirm-label"><i className="fas fa-sticky-note"></i> Note</span>
                          <span className="suspend-confirm-value">{riderDeleteNote}</span>
                        </div>
                      )}
                      <div className="suspend-confirm-row">
                        <span className="suspend-confirm-label"><i className="fas fa-envelope"></i> Email</span>
                        <span className="suspend-confirm-value">
                          {willSendEmail(riderToDelete) ? 'Notification will be sent' : 'No email (pending/rejected)'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="suspend-final-warning permanent">
                    <i className="fas fa-exclamation-circle"></i>
                    <span>This is permanent and cannot be undone. All rider data will be deleted.</span>
                  </div>
                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={() => setRiderDeleteStep(STEP_CONFIGURE)} disabled={riderDeleteLoading}>
                      <i className="fas fa-arrow-left"></i> Go Back
                    </button>
                    <button className="btn-suspend-confirm"
                      style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}
                      onClick={confirmDeleteRider}
                      disabled={riderDeleteLoading}>
                      {riderDeleteLoading
                        ? <><i className="fas fa-spinner fa-spin"></i> Deleting...</>
                        : <><i className="fas fa-trash"></i> Yes, Delete Account</>
                      }
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminUsers;