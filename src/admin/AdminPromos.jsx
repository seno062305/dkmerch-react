import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './AdminPromos.css';

// ── Validation helpers ──
const MAX_DISCOUNT_DIGITS = 4; // max 9999
const validateDiscount = (val) => {
  const num = Number(val);
  if (!val || isNaN(num)) return 'Required.';
  if (num < 1) return 'Must be at least 1%.';
  if (num > 100) return 'Cannot exceed 100%.';
  if (String(Math.floor(num)).length > MAX_DISCOUNT_DIGITS) return 'Max 4 digits.';
  return '';
};
const validateMaxDiscount = (val) => {
  const num = Number(val);
  if (!val || isNaN(num)) return 'Required.';
  if (num < 1) return 'Must be at least ₱1.';
  if (String(Math.floor(num)).length > MAX_DISCOUNT_DIGITS) return 'Max 4 digits (up to ₱9999).';
  return '';
};
const validateDates = (startDate, endDate) => {
  if (!startDate) return { start: 'Required.', end: '' };
  if (!endDate) return { start: '', end: 'Required.' };
  if (endDate < startDate) return { start: '', end: 'End date must be after start date.' };
  return { start: '', end: '' };
};

const EMPTY_FORM = {
  code: '', name: '', discount: '', maxDiscount: '',
  startDate: '', endDate: '', isActive: true
};

const AdminPromos = () => {
  const promos = useQuery(api.promos.getAllPromos) || [];
  const createPromo = useMutation(api.promos.createPromo);
  const updatePromo = useMutation(api.promos.updatePromo);
  const deletePromo = useMutation(api.promos.deletePromo);
  const toggleStatus = useMutation(api.promos.togglePromoStatus);

  const [showModal, setShowModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [serverMsg, setServerMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  // ── Input change ──
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Only allow numeric characters for discount fields
    if (name === 'discount' || name === 'maxDiscount') {
      if (value !== '' && !/^\d+$/.test(value)) return;
    }

    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setErrors(prev => ({ ...prev, [name]: '' }));
    setServerMsg('');
  };

  // ── Validate form ──
  const validate = () => {
    const newErrors = {};
    if (!formData.code.trim()) newErrors.code = 'Promo code is required.';
    if (!formData.name.trim()) newErrors.name = 'Promo name is required.';

    const discountErr = validateDiscount(formData.discount);
    if (discountErr) newErrors.discount = discountErr;

    const maxDiscountErr = validateMaxDiscount(formData.maxDiscount);
    if (maxDiscountErr) newErrors.maxDiscount = maxDiscountErr;

    const dateErrs = validateDates(formData.startDate, formData.endDate);
    if (dateErrs.start) newErrors.startDate = dateErrs.start;
    if (dateErrs.end) newErrors.endDate = dateErrs.end;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerMsg('');

    try {
      const payload = {
        code: formData.code.toUpperCase().trim(),
        name: formData.name.trim(),
        discount: Number(formData.discount),
        maxDiscount: Number(formData.maxDiscount),
        startDate: formData.startDate,
        endDate: formData.endDate,
        isActive: formData.isActive,
      };

      if (editingPromo) {
        await updatePromo({ id: editingPromo._id, ...payload });
        setServerMsg('✅ Promo updated!');
      } else {
        const result = await createPromo(payload);
        if (!result.success) {
          setServerMsg(`❌ ${result.message}`);
          setSubmitting(false);
          return;
        }
        setServerMsg('✅ Promo created!');
      }
      resetForm();
    } catch (err) {
      setServerMsg('❌ Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (promo) => {
    setEditingPromo(promo);
    setFormData({
      code: promo.code,
      name: promo.name,
      discount: String(promo.discount),
      maxDiscount: String(promo.maxDiscount),
      startDate: promo.startDate || '',
      endDate: promo.endDate || '',
      isActive: promo.isActive,
    });
    setErrors({});
    setServerMsg('');
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this promo?')) return;
    await deletePromo({ id });
  };

  const handleToggle = async (id) => {
    await toggleStatus({ id });
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingPromo(null);
    setErrors({});
    setServerMsg('');
    setShowModal(false);
  };

  const formatPeriod = (startDate, endDate) => {
    if (!startDate || !endDate) return '—';
    return `${startDate} – ${endDate}`;
  };

  const isExpired = (promo) => promo.endDate && promo.endDate < today;
  const isNotStarted = (promo) => promo.startDate && promo.startDate > today;

  const getStatusLabel = (promo) => {
    if (!promo.isActive) return { label: 'Inactive', cls: 'badge-inactive' };
    if (isExpired(promo)) return { label: 'Expired', cls: 'badge-expired' };
    if (isNotStarted(promo)) return { label: 'Upcoming', cls: 'badge-upcoming' };
    return { label: 'Active', cls: 'badge-active' };
  };

  // ── Icons ──
  const TagIcon = () => (
    <svg className="tag-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  );
  const EditIcon = () => (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
  const DeleteIcon = () => (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  );

  return (
    <div className="admin-promos">
      <div className="promos-header">
        <div>
          <h1>Promos</h1>
          <p className="subtitle">Manage promotional discounts</p>
        </div>
        <button className="create-btn" onClick={() => { setShowModal(true); setEditingPromo(null); setFormData(EMPTY_FORM); setErrors({}); setServerMsg(''); }}>
          + Create Promo
        </button>
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="promos-table-container">
        <table className="promos-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Discount</th>
              <th>Max Discount</th>
              <th>Period</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {promos.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-state">No promos yet. Create your first promo!</td>
              </tr>
            ) : (
              promos.map(promo => {
                const { label, cls } = getStatusLabel(promo);
                return (
                  <tr key={promo._id}>
                    <td><span className="promo-code"><TagIcon />{promo.code}</span></td>
                    <td>{promo.name}</td>
                    <td>{promo.discount}%</td>
                    <td>₱{promo.maxDiscount.toLocaleString()}</td>
                    <td>{formatPeriod(promo.startDate, promo.endDate)}</td>
                    <td>
                      <div className="status-cell">
                        <label className="toggle-switch">
                          <input type="checkbox" checked={promo.isActive} onChange={() => handleToggle(promo._id)} />
                          <span className="toggle-slider"></span>
                        </label>
                        <span className={`status-badge ${cls}`}>{label}</span>
                      </div>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="edit-btn" onClick={() => handleEdit(promo)} title="Edit"><EditIcon /></button>
                        <button className="delete-btn" onClick={() => handleDelete(promo._id)} title="Delete"><DeleteIcon /></button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── MOBILE CARD LIST ── */}
      <div className="promo-cards-list">
        {promos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999', background: 'white', borderRadius: '12px' }}>
            No promos yet. Create your first promo!
          </div>
        ) : (
          promos.map(promo => {
            const { label, cls } = getStatusLabel(promo);
            return (
              <div className="promo-card" key={promo._id}>
                <div className="promo-card-header">
                  <span className="promo-card-code"><TagIcon />{promo.code}</span>
                  <div className="promo-card-toggle">
                    <span className={`status-badge ${cls}`}>{label}</span>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={promo.isActive} onChange={() => handleToggle(promo._id)} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <div className="promo-card-body">
                  <div className="promo-card-field"><label>Name</label><span>{promo.name}</span></div>
                  <div className="promo-card-field"><label>Discount</label><span>{promo.discount}%</span></div>
                  <div className="promo-card-field"><label>Max Discount</label><span>₱{promo.maxDiscount.toLocaleString()}</span></div>
                  <div className="promo-card-field promo-card-period"><label>Period</label><span>{formatPeriod(promo.startDate, promo.endDate)}</span></div>
                </div>
                <div className="promo-card-actions">
                  <button className="edit-btn" onClick={() => handleEdit(promo)} title="Edit"><EditIcon /></button>
                  <button className="delete-btn" onClick={() => handleDelete(promo._id)} title="Delete"><DeleteIcon /></button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── MODAL ── */}
      {showModal && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPromo ? 'Edit Promo' : 'Create New Promo'}</h2>
              <button className="close-btn" onClick={resetForm}>×</button>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-grid">
                {/* Code */}
                <div className="form-group">
                  <label htmlFor="code">Promo Code <span className="req">*</span></label>
                  <input
                    type="text"
                    id="code"
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    placeholder="e.g., SUMMER25"
                    className={errors.code ? 'input-error' : ''}
                    style={{ textTransform: 'uppercase' }}
                    maxLength={20}
                  />
                  {errors.code && <span className="field-error">{errors.code}</span>}
                </div>

                {/* Name */}
                <div className="form-group">
                  <label htmlFor="name">Promo Name <span className="req">*</span></label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Summer Sale"
                    className={errors.name ? 'input-error' : ''}
                    maxLength={50}
                  />
                  {errors.name && <span className="field-error">{errors.name}</span>}
                </div>

                {/* Discount % */}
                <div className="form-group">
                  <label htmlFor="discount">Discount (%) <span className="req">*</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    id="discount"
                    name="discount"
                    value={formData.discount}
                    onChange={handleInputChange}
                    placeholder="e.g., 25"
                    maxLength={3}
                    className={errors.discount ? 'input-error' : ''}
                  />
                  <span className="field-hint">1–100% only</span>
                  {errors.discount && <span className="field-error">{errors.discount}</span>}
                </div>

                {/* Max Discount ₱ */}
                <div className="form-group">
                  <label htmlFor="maxDiscount">Max Discount (₱) <span className="req">*</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    id="maxDiscount"
                    name="maxDiscount"
                    value={formData.maxDiscount}
                    onChange={handleInputChange}
                    placeholder="e.g., 500"
                    maxLength={4}
                    className={errors.maxDiscount ? 'input-error' : ''}
                  />
                  <span className="field-hint">Max ₱9999</span>
                  {errors.maxDiscount && <span className="field-error">{errors.maxDiscount}</span>}
                </div>

                {/* Start Date */}
                <div className="form-group">
                  <label htmlFor="startDate">Start Date <span className="req">*</span></label>
                  <input
                    type="date"
                    id="startDate"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleInputChange}
                    className={errors.startDate ? 'input-error' : ''}
                  />
                  {errors.startDate && <span className="field-error">{errors.startDate}</span>}
                </div>

                {/* End Date */}
                <div className="form-group">
                  <label htmlFor="endDate">End Date <span className="req">*</span></label>
                  <input
                    type="date"
                    id="endDate"
                    name="endDate"
                    value={formData.endDate}
                    onChange={handleInputChange}
                    min={formData.startDate || today}
                    className={errors.endDate ? 'input-error' : ''}
                  />
                  {errors.endDate && <span className="field-error">{errors.endDate}</span>}
                </div>
              </div>

              {/* Active checkbox */}
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                  />
                  <span>Active (users can use this promo)</span>
                </label>
              </div>

              {serverMsg && (
                <div className={`server-msg ${serverMsg.startsWith('✅') ? 'msg-success' : 'msg-error'}`}>
                  {serverMsg}
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={resetForm}>Cancel</button>
                <button type="submit" className="submit-btn" disabled={submitting}>
                  {submitting ? 'Saving…' : editingPromo ? 'Update Promo' : 'Create Promo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPromos;