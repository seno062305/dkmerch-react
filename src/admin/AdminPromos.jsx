import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useConfirm } from '../context/ConfirmContext';
import AdminPager from './AdminPager';
import { runWithFailover } from '../lib/failoverWrite';
import { useCatalogOptions } from '../hooks/useCatalogOptions';
import './AdminPromos.css';

const validateDiscount = (val) => {
  const num = Number(val);
  if (!val || isNaN(num)) return 'Required.';
  if (num < 1) return 'Must be at least 1%.';
  if (num > 100) return 'Cannot exceed 100%.';
  return '';
};

const fmt12 = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const EMPTY_FORM = {
  code: '', name: '', discount: '',
  startDate: '', startTime: '', endDate: '', endTime: '',
};

const PH = 8 * 3600000;
const toMs = (d, t) => {
  if (!d) return null;
  const [y, mo, day] = d.split('-').map(Number);
  const [h, m] = t ? t.split(':').map(Number) : [0, 0];
  return Date.UTC(y, mo - 1, day, h, m, 0) - PH;
};

const AdminPromos = () => {
  const { confirm } = useConfirm();
  const promos      = useQuery(api.promos.getAllPromos) || [];
  const { items: catalogGroups } = useCatalogOptions('kpopGroup');
  const KPOP_GROUPS = catalogGroups.map((g) => g.value);
  const createPromoMut = useMutation(api.promos.createPromo);
  const updatePromoMut = useMutation(api.promos.updatePromo);
  const deletePromoMut = useMutation(api.promos.deletePromo);
  const createPromo = (args) =>
    runWithFailover(createPromoMut, args, {
      table: "promos",
      mutation: "promos:createPromo",
      docKey: args?.code,
      payload: args,
    });
  const updatePromo = (args) =>
    runWithFailover(updatePromoMut, args, {
      table: "promos",
      mutation: "promos:updatePromo",
      docKey: String(args?.id || args?.code || ""),
      payload: args,
    });
  const deletePromo = (args) => {
    const normalized = typeof args === "object" ? args : { id: args };
    return runWithFailover(deletePromoMut, normalized, {
      table: "promos",
      mutation: "promos:deletePromo",
      docKey: String(normalized?.id || ""),
      payload: normalized,
    });
  };

  const [nowMs,        setNowMs]        = useState(() => Date.now());
  const [showModal,    setShowModal]    = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [formData,     setFormData]     = useState(EMPTY_FORM);
  const [errors,       setErrors]       = useState({});
  const [serverMsg,    setServerMsg]    = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [pageSize,     setPageSize]     = useState(5);
  const [page,         setPage]         = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { setPage(0); }, [pageSize, promos.length]);

  const today = new Date(nowMs).toISOString().split('T')[0];

  useEffect(() => {
    if (!showModal) return;
    const y = window.scrollY;
    document.body.style.cssText = `position:fixed;top:-${y}px;width:100%;overflow:hidden`;
    return () => { document.body.style.cssText = ''; window.scrollTo(0, y); };
  }, [showModal]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'discount' && value !== '' && !/^\d+$/.test(value)) return;
    if ((name === 'startDate' || name === 'endDate') && value && value < today) return;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: '' }));
    setServerMsg('');
  };

  const validate = () => {
    const errs = {};
    if (!formData.code.trim()) errs.code = 'Promo code is required.';
    if (!formData.name)        errs.name = 'Please select a K-Pop group.';
    const de = validateDiscount(formData.discount);
    if (de) errs.discount = de;
    if (!formData.startDate) errs.startDate = 'Required.';
    if (!formData.endDate)   errs.endDate   = 'Required.';
    if (formData.startDate && formData.startDate < today)
      errs.startDate = 'Start date cannot be in the past.';
    if (formData.endDate && formData.endDate < today)
      errs.endDate = 'End date cannot be in the past.';
    if (formData.startDate && formData.endDate && formData.endDate < formData.startDate)
      errs.endDate = 'End date must be after start date.';
    if (formData.startDate === formData.endDate && formData.startTime && formData.endTime
        && formData.startTime >= formData.endTime)
      errs.endTime = 'End time must be after start time on the same day.';
    const yearCheck = (dateStr, field) => {
      if (dateStr) {
        const yr = parseInt(dateStr.split('-')[0], 10);
        if (yr > 9999) errs[field] = 'Year must be 4 digits only (max 9999).';
      }
    };
    yearCheck(formData.startDate, 'startDate');
    yearCheck(formData.endDate,   'endDate');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true); setServerMsg('');
    try {
      const payload = {
        code:        formData.code.toUpperCase().trim(),
        name:        formData.name,
        discount:    Number(formData.discount),
        // Cap in pesos for email copy / checkout — form has no field, use a safe default
        maxDiscount: Number(formData.maxDiscount) > 0 ? Number(formData.maxDiscount) : 999999,
        startDate:   formData.startDate || undefined,
        startTime:   formData.startTime || undefined,
        endDate:     formData.endDate   || undefined,
        endTime:     formData.endTime   || undefined,
        isActive:    true,
      };
      if (editingPromo) {
        await updatePromo({ id: editingPromo._id, ...payload });
        setServerMsg('✅ Promo updated!');
      } else {
        const result = await createPromo(payload);
        if (!result.success) { setServerMsg(`❌ ${result.message}`); setSubmitting(false); return; }
        setServerMsg('✅ Promo created! Email notification sent to all users automatically.');
      }
      setTimeout(resetForm, 1500);
    } catch (err) {
      const msg = err?.data?.message || err?.message || '';
      if (msg.includes('maxDiscount') || msg.includes('ArgumentValidationError')) {
        setServerMsg('❌ Promo create failed: missing/invalid fields. Please refresh and try again.');
      } else {
        setServerMsg(`❌ ${msg || 'Something went wrong. Try again.'}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (promo) => {
    setEditingPromo(promo);
    setFormData({
      code:      promo.code,
      name:      promo.name,
      discount:  String(promo.discount),
      startDate: promo.startDate || '',
      startTime: promo.startTime || '',
      endDate:   promo.endDate   || '',
      endTime:   promo.endTime   || '',
    });
    setErrors({}); setServerMsg(''); setShowModal(true);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete promo?',
      message: 'Delete this promo? This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    await deletePromo({ id });
  };

  const openCreate = () => {
    setEditingPromo(null); setFormData(EMPTY_FORM);
    setErrors({}); setServerMsg(''); setShowModal(true);
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM); setEditingPromo(null);
    setErrors({}); setServerMsg(''); setShowModal(false);
  };

  const formatPeriod = (p) => {
    const s = p.startDate ? `${p.startDate}${p.startTime ? ` ${fmt12(p.startTime)}` : ''}` : '';
    const e = p.endDate   ? `${p.endDate}${p.endTime     ? ` ${fmt12(p.endTime)}`   : ''}` : '';
    if (!s && !e) return '—';
    if (s && e) return `${s} → ${e}`;
    return s || e;
  };

  const getStatus = (promo) => {
    const endMs = toMs(promo.endDate, promo.endTime || '23:59');
    if (endMs && nowMs > endMs) return { label: 'Expired', cls: 'badge-expired' };
    return { label: 'Active', cls: 'badge-active' };
  };

  // ✅ Sort promos — pinakabago (latest _creationTime) ay nasa unahan
  const sortedPromos = useMemo(
    () => [...promos].sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0)),
    [promos]
  );

  const pagedPromos = useMemo(() => {
    const start = page * pageSize;
    return sortedPromos.slice(start, start + pageSize);
  }, [sortedPromos, page, pageSize]);

  const TagIcon    = () => <svg className="tag-icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>;
  const EditIcon   = () => <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>;
  const DeleteIcon = () => <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;

  return (
    <div className="admin-promos">
      <div className="promos-toolbar">
        <div className="promos-toolbar-left">
          <h1 className="promos-page-title">Promos</h1>
          <span className="promos-count-pill">{sortedPromos.length} total</span>
        </div>
        <button type="button" className="create-btn" onClick={openCreate}>+ Create Promo</button>
      </div>

      {/* ── Desktop Table ── */}
      <div className="promos-table-container">
        {sortedPromos.length === 0 ? (
          <div className="promos-empty-state">
            <i className="fas fa-tag"></i>
            <div>
              <p>No promos yet.</p>
              <span>Create a promo code for a K-Pop group.</span>
            </div>
            <button type="button" className="create-btn create-btn--ghost" onClick={openCreate}>+ Create Promo</button>
          </div>
        ) : (
          <table className="promos-table">
            <thead>
              <tr>
                <th>Code</th><th>K-Pop Group</th><th>Discount</th>
                <th>Period</th><th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedPromos.map(promo => {
                const { label, cls } = getStatus(promo);
                return (
                  <tr key={promo._id}>
                    <td><span className="promo-code"><TagIcon />{promo.code}</span></td>
                    <td><span className="group-chip">{promo.name}</span></td>
                    <td>{promo.discount}%</td>
                    <td className="period-cell">{formatPeriod(promo)}</td>
                    <td><span className={`status-badge ${cls}`}>{label}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button className="edit-btn" onClick={() => handleEdit(promo)}><EditIcon /></button>
                        <button className="delete-btn" onClick={() => handleDelete(promo._id)}><DeleteIcon /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <AdminPager
          total={sortedPromos.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* ── Mobile Card View ── */}
      <div className="promo-cards-list">
        <div className="mobile-create-row">
          <button className="create-btn" onClick={openCreate}>+ Create Promo</button>
        </div>
        {sortedPromos.length === 0
          ? <div className="empty-cards-msg">No promos yet.</div>
          : pagedPromos.map(promo => {
              const { label, cls } = getStatus(promo);
              return (
                <div className="promo-card" key={promo._id}>
                  <div className="promo-card-header">
                    <span className="promo-card-code"><TagIcon />{promo.code}</span>
                    <span className={`status-badge ${cls}`}>{label}</span>
                  </div>
                  <div className="promo-card-body">
                    <div className="promo-card-field"><label>K-Pop Group</label><span className="group-chip">{promo.name}</span></div>
                    <div className="promo-card-field"><label>Discount</label><span>{promo.discount}%</span></div>
                    <div className="promo-card-field promo-card-period"><label>Period</label><span>{formatPeriod(promo)}</span></div>
                  </div>
                  <div className="promo-card-actions">
                    <button className="edit-btn" onClick={() => handleEdit(promo)}><EditIcon /></button>
                    <button className="delete-btn" onClick={() => handleDelete(promo._id)}><DeleteIcon /></button>
                  </div>
                </div>
              );
            })
        }
        <AdminPager
          total={sortedPromos.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPromo ? 'Edit Promo' : 'Create New Promo'}</h2>
              <button className="close-btn" onClick={resetForm}>×</button>
            </div>
            <form onSubmit={handleSubmit} noValidate>
              <div className="form-grid">
                <div className="form-group">
                  <label>Promo Code <span className="req">*</span></label>
                  <input type="text" name="code" value={formData.code}
                    onChange={handleInputChange} placeholder="e.g., SUMMER25"
                    className={errors.code ? 'input-error' : ''}
                    style={{ textTransform: 'uppercase' }} maxLength={20} />
                  {errors.code && <span className="field-error">{errors.code}</span>}
                </div>
                <div className="form-group">
                  <label>K-Pop Group <span className="req">*</span></label>
                  <select name="name" value={formData.name} onChange={handleInputChange}
                    className={`group-select ${errors.name ? 'input-error' : ''}`}>
                    <option value="">— Select a group —</option>
                    {KPOP_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  {errors.name && <span className="field-error">{errors.name}</span>}
                </div>

                <div className="form-group form-group--full">
                  <label>Discount (%) <span className="req">*</span></label>
                  <input type="text" inputMode="numeric" name="discount" value={formData.discount}
                    onChange={handleInputChange} placeholder="e.g., 25" maxLength={3}
                    className={errors.discount ? 'input-error' : ''} />
                  <span className="field-hint">1–100% only</span>
                  {errors.discount && <span className="field-error">{errors.discount}</span>}
                </div>

                <div className="form-group">
                  <label>Start Date <span className="req">*</span></label>
                  <input type="date" name="startDate" value={formData.startDate}
                    onChange={handleInputChange} min={today} max="9999-12-31"
                    className={errors.startDate ? 'input-error' : ''} />
                  {errors.startDate && <span className="field-error">{errors.startDate}</span>}
                </div>
                <div className="form-group">
                  <label>Start Time <span className="field-optional">(optional)</span></label>
                  <div className="time-input-wrapper">
                    <input type="time" name="startTime" value={formData.startTime}
                      onChange={handleInputChange} className="time-input" />
                    {formData.startTime && <span className="time-preview">▶ <strong>{fmt12(formData.startTime)}</strong></span>}
                  </div>
                  <span className="field-hint">Blank = 12:00 AM</span>
                </div>

                <div className="form-group">
                  <label>End Date <span className="req">*</span></label>
                  <input type="date" name="endDate" value={formData.endDate}
                    onChange={handleInputChange}
                    min={formData.startDate || today} max="9999-12-31"
                    className={errors.endDate ? 'input-error' : ''} />
                  {errors.endDate && <span className="field-error">{errors.endDate}</span>}
                </div>
                <div className="form-group">
                  <label>End Time <span className="field-optional">(optional)</span></label>
                  <div className="time-input-wrapper">
                    <input type="time" name="endTime" value={formData.endTime}
                      onChange={handleInputChange}
                      className={`time-input ${errors.endTime ? 'input-error' : ''}`} />
                    {formData.endTime && <span className="time-preview">⏹ <strong>{fmt12(formData.endTime)}</strong></span>}
                  </div>
                  <span className="field-hint">Blank = 11:59 PM</span>
                  {errors.endTime && <span className="field-error">{errors.endTime}</span>}
                </div>
              </div>

              {(formData.startDate || formData.endDate) && (
                <div className="schedule-summary">
                  📅{' '}
                  {formData.startDate && <span>{formData.startDate} • {formData.startTime ? fmt12(formData.startTime) : '12:00 AM'}</span>}
                  {formData.startDate && formData.endDate && <span className="sched-arrow"> → </span>}
                  {formData.endDate && <span>{formData.endDate} • {formData.endTime ? fmt12(formData.endTime) : '11:59 PM'}</span>}
                </div>
              )}

              {!editingPromo && (
                <p className="email-notice">
                  📧 Email blast will be sent automatically to all registered users when this promo is created.
                </p>
              )}

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