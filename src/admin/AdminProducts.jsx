import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './AdminProducts.css';
import { useQuery, useAction, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAddProduct, useUpdateProduct, useDeleteProduct } from '../utils/productStorage';
import { useConfirm } from '../context/ConfirmContext';
import DkIcon, { DK_ICONS } from '../components/DkIcon';
import { formatSaleRange, toPhtMs } from '../utils/saleUtils';
import {
  useCatalogOptions,
  FALLBACK_CATEGORIES,
  FALLBACK_GROUPS,
} from '../hooks/useCatalogOptions';
import AdminPager from './AdminPager';

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png',
  'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
];
const ALLOWED_IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|bmp)$/i;

const emptyForm = {
  name: '', category: 'albums', kpopGroup: 'BTS',
  price: '', originalPrice: '', image: '', stock: '',
  description: '', isSale: false, isPreOrder: false,
  releaseDate: '', releaseTime: '',
  saleStartDate: '', saleStartTime: '',
  saleEndDate: '', saleEndTime: '',
};

const validateForm = (form) => {
  const err = {};
  if (!form.name.trim()) err.name = 'Product name is required.';
  else if (form.name.trim().length < 3) err.name = 'Name must be at least 3 characters.';
  if (form.price === '' || form.price === null) err.price = 'Price is required.';
  else if (isNaN(Number(form.price)) || Number(form.price) <= 0) err.price = 'Price must be a positive number.';
  if (form.isSale) {
    if (form.originalPrice === '' || form.originalPrice === null) err.originalPrice = 'Original price is required when item is on sale.';
    else if (isNaN(Number(form.originalPrice)) || Number(form.originalPrice) <= 0) err.originalPrice = 'Original price must be a positive number.';
    else if (Number(form.originalPrice) < Number(form.price)) err.originalPrice = 'Original price should be >= selling price.';
    if (!form.saleStartDate) err.saleStartDate = 'Sale start date is required.';
    if (!form.saleStartTime) err.saleStartTime = 'Sale start time is required.';
    if (!form.saleEndDate) err.saleEndDate = 'Sale end date is required.';
    if (!form.saleEndTime) err.saleEndTime = 'Sale end time is required.';
    const startMs = toPhtMs(form.saleStartDate, form.saleStartTime);
    const endMs = toPhtMs(form.saleEndDate, form.saleEndTime);
    if (startMs != null && endMs != null && endMs <= startMs) {
      err.saleEndDate = 'Sale end must be after the start date/time.';
    }
  }
  if (form.stock === '' || form.stock === null) err.stock = 'Stock quantity is required.';
  else if (isNaN(Number(form.stock)) || Number(form.stock) < 0) err.stock = 'Stock must be 0 or more.';
  else if (!Number.isInteger(Number(form.stock))) err.stock = 'Stock must be a whole number.';
  else if (Number(form.stock) > 999) err.stock = 'Stock cannot exceed 999.';
  if (!form.image.trim()) err.image = 'Product image is required.';
  else if (!ALLOWED_IMAGE_EXT.test(form.image.trim())) err.image = 'Only image files are allowed (JPG, PNG, GIF, WEBP, SVG, BMP).';
  if (form.isPreOrder) {
    if (!form.releaseDate) err.releaseDate = 'Release date is required for pre-order items.';
    if (!form.releaseTime) err.releaseTime = 'Release time is required for pre-order items.';
  }
  return err;
};

const formatReleaseDateTime = (dateStr, timeStr) => {
  if (!dateStr) return null;
  const time = timeStr || '00:00';
  return new Date(`${dateStr}T${time}:00+08:00`).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

const msAfterRelease = (product) => {
  if (!product.isPreOrder || !product.releaseDate) return -1;
  const rt = product.releaseTime || '00:00';
  return Date.now() - new Date(`${product.releaseDate}T${rt}:00+08:00`).getTime();
};

const isReleased = (product) => msAfterRelease(product) >= 0;

const showReleasedBadge = (product) => {
  const ms = msAfterRelease(product);
  return ms >= 0 && ms < 60 * 60 * 1000;
};

// ══════════════════════════════════════════════════════════════════════════
//  PRODUCT MODAL
// ══════════════════════════════════════════════════════════════════════════
const GROUP_LOGO_MAX_BYTES = 800 * 1024; // ~800KB — keep marquee logos lean

const ProductModal = ({
  editingId, initialForm, onClose, onSubmit, submitting,
  categories = FALLBACK_CATEGORIES, groups = FALLBACK_GROUPS,
}) => {
  const [form, setForm]     = useState(initialForm);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);
  const today = new Date().toISOString().split('T')[0];

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'isSale' && !checked
        ? { originalPrice: '', saleStartDate: '', saleStartTime: '', saleEndDate: '', saleEndTime: '' }
        : {}),
      ...(name === 'isPreOrder' && !checked ? { releaseDate: '', releaseTime: '' } : {}),
    }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setErrors(prev => ({ ...prev, image: 'Only image files are allowed.' }));
      e.target.value = ''; return;
    }
    setErrors(prev => ({ ...prev, image: '' }));
    setForm(prev => ({ ...prev, image: `/images/${file.name}` }));
  };

  const handleImagePath = (e) => {
    const val = e.target.value;
    setForm(prev => ({ ...prev, image: val }));
    if (val.trim() && !ALLOWED_IMAGE_EXT.test(val.trim()))
      setErrors(prev => ({ ...prev, image: 'Only image files are allowed (JPG, PNG, GIF, WEBP, SVG, BMP).' }));
    else setErrors(prev => ({ ...prev, image: '' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      const firstKey = Object.keys(validationErrors)[0];
      const el = document.querySelector(`[name="${firstKey}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onSubmit(form);
  };

  return createPortal(
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-header">
          <div className="pm-title-row">
            <div>
              <h2>{editingId ? 'Edit Product' : 'Add New Product'}</h2>
              <p>{editingId ? 'Update product details below' : 'Fill in the details to add a new product'}</p>
            </div>
          </div>
          <button className="pm-close" type="button" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>

        <div className="pm-body">
          <form id="pm-form" onSubmit={handleSubmit} noValidate>
            <div className="pm-split">
              <div className="pm-pane pm-pane--main">
                <div className="pm-pane-title"><i className="fas fa-box-open"></i> Basic Info</div>
                <div className="form-grid">
                  <div className={`form-group full-width${errors.name ? ' has-error' : ''}`}>
                    <label><i className="fas fa-tag"></i> Product Name <span className="req">*</span></label>
                    <input name="name" placeholder="Enter product name" value={form.name} onChange={handleChange} maxLength={120} />
                    {errors.name && <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.name}</span>}
                  </div>
                  <div className="form-group">
                    <label><i className="fas fa-folder"></i> Category <span className="req">*</span></label>
                    <select name="category" value={form.category} onChange={handleChange}>
                      {!categories.some((c) => c.value === form.category) && form.category && (
                        <option value={form.category}>{form.category}</option>
                      )}
                      {categories.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <small className="helper-text">Manage categories in the Categories &amp; Groups tab.</small>
                  </div>
                  <div className="form-group">
                    <label><i className="fas fa-users"></i> K-Pop Group <span className="req">*</span></label>
                    <select name="kpopGroup" value={form.kpopGroup} onChange={handleChange}>
                      {!groups.some((g) => g.value === form.kpopGroup) && form.kpopGroup && (
                        <option value={form.kpopGroup}>{form.kpopGroup}</option>
                      )}
                      {groups.map((g) => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </select>
                    <small className="helper-text">Manage groups &amp; marquee logos in the Categories &amp; Groups tab.</small>
                  </div>
                  <div className={`form-group full-width${errors.image ? ' has-error' : ''}`}>
                    <label><i className="fas fa-image"></i> Product Image <span className="req">*</span></label>
                    <div className="image-input-row">
                      <input name="image" placeholder="/images/product.jpg" value={form.image} onChange={handleImagePath} />
                      <button type="button" className="browse-btn" onClick={() => fileInputRef.current.click()}>
                        <i className="fas fa-folder-open"></i> Browse
                      </button>
                    </div>
                    <input ref={fileInputRef} type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/bmp"
                      style={{ display: 'none' }} onChange={handleFileSelect} />
                    {errors.image
                      ? <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.image}</span>
                      : <small className="helper-text"><i className="fas fa-info-circle"></i> Allowed: JPG, PNG, GIF, WEBP, SVG, BMP.</small>}
                    {form.image && !errors.image && (
                      <div className="image-preview">
                        <img src={form.image} alt="Preview" onError={e => e.target.style.display = 'none'} />
                      </div>
                    )}
                  </div>
                  <div className="form-group full-width">
                    <label><i className="fas fa-align-left"></i> Description <span className="opt">(optional)</span></label>
                    <textarea name="description" placeholder="Enter product description..."
                      value={form.description} onChange={handleChange} rows="3" maxLength={1000} />
                    <small className="helper-text" style={{ justifyContent: 'flex-end' }}>{form.description.length}/1000</small>
                  </div>
                </div>
              </div>

              <div className="pm-pane pm-pane--side">
                <div className="pm-pane-title"><i className="fas fa-sliders-h"></i> Pricing & Options</div>
                <div className="form-grid">
                  <div className={`form-group${errors.price ? ' has-error' : ''}`}>
                    <label><i className="fas fa-money-bill-wave"></i> Price <span className="req">*</span></label>
                    <input type="number" name="price" placeholder="0.00" value={form.price} onChange={handleChange} min="0.01" step="0.01" />
                    {errors.price && <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.price}</span>}
                  </div>
                  <div className={`form-group${errors.stock ? ' has-error' : ''}`}>
                    <label><i className="fas fa-warehouse"></i> Stock Quantity <span className="req">*</span></label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" name="stock"
                      placeholder="0–999" value={form.stock} maxLength={3}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                        setForm(prev => ({ ...prev, stock: v }));
                        if (errors.stock) setErrors(prev => ({ ...prev, stock: '' }));
                      }}
                      onKeyPress={e => { if (!/[0-9]/.test(e.key)) e.preventDefault(); }}
                    />
                    {errors.stock && <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.stock}</span>}
                  </div>
                  <div className={`form-group full-width${errors.originalPrice ? ' has-error' : ''}${!form.isSale ? ' field-disabled' : ''}`}>
                    <label>
                      <i className="fas fa-strikethrough"></i> Original Price
                      {form.isSale ? <span className="req">*</span> : <span className="opt">— enable "On Sale" first</span>}
                    </label>
                    <input type="number" name="originalPrice" placeholder="0.00" value={form.originalPrice}
                      onChange={handleChange} min="0" step="0.01" disabled={!form.isSale} />
                    {errors.originalPrice && <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.originalPrice}</span>}
                  </div>
                  <div className="form-group full-width">
                    <div className="checkbox-group">
                      <label className="checkbox-label">
                        <input type="checkbox" name="isSale" checked={form.isSale} onChange={handleChange} />
                        <span className="checkbox-custom"></span>
                        <span className="checkbox-text"><i className="fas fa-percent"></i> On Sale</span>
                      </label>
                      <label className="checkbox-label">
                        <input type="checkbox" name="isPreOrder" checked={form.isPreOrder} onChange={handleChange} />
                        <span className="checkbox-custom"></span>
                        <span className="checkbox-text"><i className="fas fa-clock"></i> Pre-Order</span>
                      </label>
                    </div>
                  </div>
                  {form.isSale && (
                    <>
                      <div className={`form-group${errors.saleStartDate ? ' has-error' : ''}`}>
                        <label><i className="fas fa-calendar-alt"></i> Sale Start Date <span className="req">*</span></label>
                        <input type="date" name="saleStartDate" value={form.saleStartDate} onChange={handleChange} max="9999-12-31" />
                        {errors.saleStartDate && <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.saleStartDate}</span>}
                      </div>
                      <div className={`form-group${errors.saleStartTime ? ' has-error' : ''}`}>
                        <label><i className="fas fa-clock"></i> Sale Start Time <span className="req">*</span></label>
                        <input type="time" name="saleStartTime" value={form.saleStartTime} onChange={handleChange} />
                        {errors.saleStartTime
                          ? <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.saleStartTime}</span>
                          : <small className="helper-text"><i className="fas fa-info-circle"></i> Philippine Time (PHT).</small>}
                      </div>
                      <div className={`form-group${errors.saleEndDate ? ' has-error' : ''}`}>
                        <label><i className="fas fa-calendar-check"></i> Sale End Date <span className="req">*</span></label>
                        <input type="date" name="saleEndDate" value={form.saleEndDate} onChange={handleChange} min={form.saleStartDate || undefined} max="9999-12-31" />
                        {errors.saleEndDate && <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.saleEndDate}</span>}
                      </div>
                      <div className={`form-group${errors.saleEndTime ? ' has-error' : ''}`}>
                        <label><i className="fas fa-clock"></i> Sale End Time <span className="req">*</span></label>
                        <input type="time" name="saleEndTime" value={form.saleEndTime} onChange={handleChange} />
                        {errors.saleEndTime && <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.saleEndTime}</span>}
                      </div>
                      {form.saleStartDate && form.saleStartTime && form.saleEndDate && form.saleEndTime && (
                        <div className="form-group full-width">
                          <div className="release-preview">
                            <i className="fas fa-tag"></i>
                            <span>
                              Sale period:{' '}
                              <strong>
                                {formatReleaseDateTime(form.saleStartDate, form.saleStartTime)}
                                {' – '}
                                {formatReleaseDateTime(form.saleEndDate, form.saleEndTime)}
                              </strong>
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {form.isPreOrder && (
                    <>
                      <div className={`form-group${errors.releaseDate ? ' has-error' : ''}`}>
                        <label><i className="fas fa-calendar-alt"></i> Release Date <span className="req">*</span></label>
                        <input type="date" name="releaseDate" value={form.releaseDate} onChange={handleChange} min={today} max="9999-12-31" />
                        {errors.releaseDate && <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.releaseDate}</span>}
                      </div>
                      <div className={`form-group${errors.releaseTime ? ' has-error' : ''}`}>
                        <label><i className="fas fa-clock"></i> Release Time <span className="req">*</span></label>
                        <input type="time" name="releaseTime" value={form.releaseTime} onChange={handleChange} />
                        {errors.releaseTime
                          ? <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.releaseTime}</span>
                          : <small className="helper-text"><i className="fas fa-info-circle"></i> Philippine Time (PHT).</small>}
                      </div>
                      {form.releaseDate && form.releaseTime && (
                        <div className="form-group full-width">
                          <div className="release-preview">
                            <i className="fas fa-bell"></i>
                            <span>Users will be notified on <strong>{formatReleaseDateTime(form.releaseDate, form.releaseTime)}</strong></span>
                          </div>
                        </div>
                      )}
                      {!editingId && (
                        <div className="form-group full-width">
                          <div className="email-notice">
                            <i className="fas fa-envelope"></i>
                            <span>📧 All registered users will receive an email announcement when this pre-order is added.</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="pm-footer">
          <button type="button" className="pm-cancel-btn" onClick={onClose} disabled={submitting}>
            <i className="fas fa-times"></i> Cancel
          </button>
          <button type="submit" form="pm-form" className="pm-submit-btn" disabled={submitting}>
            {submitting
              ? <><i className="fas fa-spinner fa-spin"></i> {editingId ? 'Updating...' : 'Adding...'}</>
              : <><i className={editingId ? 'fas fa-save' : 'fas fa-plus'}></i> {editingId ? 'Update Product' : 'Add Product'}</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  STOCK MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
//  CATEGORIES & K-POP GROUPS MANAGER
// ══════════════════════════════════════════════════════════════════════════
const CATALOG_PAGE_SIZES = [7, 14, 21, 28];

const CatalogManager = ({
  products = [],
  categories = FALLBACK_CATEGORIES,
  groups = FALLBACK_GROUPS,
  onAddCategory,
  onAddGroup,
  onRemoveCategory,
  onRemoveGroup,
  onSetGroupImage,
}) => {
  const [newCategory, setNewCategory] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newGroupFile, setNewGroupFile] = useState(null);
  const [newGroupPreview, setNewGroupPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [catPage, setCatPage] = useState(0);
  const [groupPage, setGroupPage] = useState(0);
  const [catPageSize, setCatPageSize] = useState(7);
  const [groupPageSize, setGroupPageSize] = useState(7);
  const groupLogoInputRef = useRef(null);
  const replaceLogoInputRef = useRef(null);
  const logoTargetRef = useRef('');

  useEffect(() => { setCatPage(0); }, [categories.length, catPageSize]);
  useEffect(() => { setGroupPage(0); }, [groups.length, groupPageSize]);

  const pagedCategories = categories.slice(
    catPage * catPageSize,
    catPage * catPageSize + catPageSize
  );
  const pagedGroups = groups.slice(
    groupPage * groupPageSize,
    groupPage * groupPageSize + groupPageSize
  );

  const usageCount = (type, value) =>
    products.filter((p) => {
      const v = type === 'category' ? p.category : p.kpopGroup;
      return String(v || '').trim().toLowerCase() === String(value || '').trim().toLowerCase();
    }).length;

  const resetGroupForm = () => {
    setNewGroup('');
    setNewGroupFile(null);
    if (newGroupPreview) URL.revokeObjectURL(newGroupPreview);
    setNewGroupPreview('');
  };

  const pickGroupLogo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) && !ALLOWED_IMAGE_EXT.test(file.name)) {
      setMsg('Group logo must be an image (JPG, PNG, GIF, WEBP, SVG, BMP).');
      return;
    }
    if (file.size > GROUP_LOGO_MAX_BYTES) {
      setMsg('Group logo is too large (max 800KB).');
      return;
    }
    if (newGroupPreview) URL.revokeObjectURL(newGroupPreview);
    setNewGroupFile(file);
    setNewGroupPreview(URL.createObjectURL(file));
    setMsg('');
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await onAddCategory(newCategory.trim());
      if (res?.success) {
        setNewCategory('');
        setMsg(res.alreadyExists ? 'Category already exists.' : 'Category added.');
      } else setMsg(res?.message || 'Could not add category.');
    } catch {
      setMsg('Could not add category.');
    } finally {
      setBusy(false);
    }
  };

  const addGroup = async () => {
    if (!newGroup.trim()) return;
    if (!newGroupFile) {
      setMsg('Upload a marquee logo for the new K-Pop group.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await onAddGroup(newGroup.trim(), newGroupFile);
      if (res?.success) {
        resetGroupForm();
        setMsg(
          res.alreadyExists
            ? 'Group already exists — logo updated.'
            : 'K-Pop group added — it will show on the homepage marquee.'
        );
      } else setMsg(res?.message || 'Could not add group.');
    } catch {
      setMsg('Could not add group.');
    } finally {
      setBusy(false);
    }
  };

  const removeCategory = async (value) => {
    const used = usageCount('category', value);
    if (used > 0) {
      setMsg(`Cannot delete "${value}" — ${used} product(s) still use it.`);
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await onRemoveCategory(value);
      setMsg(res?.success ? `Category "${value}" deleted.` : (res?.message || 'Could not delete category.'));
    } catch {
      setMsg('Could not delete category.');
    } finally {
      setBusy(false);
    }
  };

  const removeGroup = async (value) => {
    const used = usageCount('group', value);
    if (used > 0) {
      setMsg(`Cannot delete "${value}" — ${used} product(s) still use it.`);
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await onRemoveGroup(value);
      setMsg(res?.success ? `K-Pop group "${value}" deleted.` : (res?.message || 'Could not delete group.'));
    } catch {
      setMsg('Could not delete group.');
    } finally {
      setBusy(false);
    }
  };

  const replaceLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = logoTargetRef.current;
    if (!file || !target) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) && !ALLOWED_IMAGE_EXT.test(file.name)) {
      setMsg('Group logo must be an image (JPG, PNG, GIF, WEBP, SVG, BMP).');
      return;
    }
    if (file.size > GROUP_LOGO_MAX_BYTES) {
      setMsg('Group logo is too large (max 800KB).');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await onSetGroupImage(target, file);
      setMsg(res?.success ? `Marquee logo updated for ${target}.` : (res?.message || 'Could not update logo.'));
    } catch {
      setMsg('Could not update logo.');
    } finally {
      setBusy(false);
      logoTargetRef.current = '';
    }
  };

  return (
    <div className="catalog-manager">
      <div className="list-header catalog-manager-header">
        <div>
          <h2><i className="fas fa-tags"></i> Categories &amp; K-Pop Groups</h2>
          <p className="catalog-manager-sub">Add or delete options used in products. Group logos appear on the homepage marquee.</p>
        </div>
      </div>

      {msg && (
        <div className="catalog-manager-msg">
          <i className="fas fa-info-circle"></i> {msg}
        </div>
      )}

      <div className="catalog-manager-grid">
        <section className="catalog-panel">
          <div className="catalog-panel-head">
            <h3><i className="fas fa-folder"></i> Categories</h3>
            <span className="catalog-count">{categories.length}</span>
          </div>
          <div className="catalog-add-row">
            <input
              type="text"
              placeholder="New category (e.g. Keyrings)"
              value={newCategory}
              maxLength={40}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
              disabled={busy}
            />
            <button type="button" className="catalog-save-btn" onClick={addCategory} disabled={busy || !newCategory.trim()}>
              Add
            </button>
          </div>
          <ul className="catalog-item-list">
            {pagedCategories.map((c) => {
              const used = usageCount('category', c.value);
              return (
                <li key={c.value} className="catalog-item">
                  <div className="catalog-item-main">
                    <strong>{c.label}</strong>
                    <span className={`catalog-usage${used ? ' is-used' : ''}`}>
                      {used > 0 ? `${used} product${used === 1 ? '' : 's'}` : 'Not used'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`catalog-del-btn${used > 0 ? ' is-locked' : ''}`}
                    title={used > 0 ? `Cannot delete — in use by ${used} product(s)` : 'Delete category'}
                    onClick={() => removeCategory(c.value)}
                    disabled={busy || used > 0}
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </li>
              );
            })}
          </ul>
          <AdminPager
            total={categories.length}
            page={catPage}
            pageSize={catPageSize}
            pageSizeOptions={CATALOG_PAGE_SIZES}
            onPageChange={setCatPage}
            onPageSizeChange={setCatPageSize}
          />
        </section>

        <section className="catalog-panel">
          <div className="catalog-panel-head">
            <h3><i className="fas fa-users"></i> K-Pop Groups</h3>
            <span className="catalog-count">{groups.length}</span>
          </div>
          <div className="catalog-add-group-block">
            <div className="catalog-add-row">
              <input
                type="text"
                placeholder="New group (e.g. aespa)"
                value={newGroup}
                maxLength={40}
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGroup(); } }}
                disabled={busy}
              />
              <button
                type="button"
                className="catalog-logo-btn"
                onClick={() => groupLogoInputRef.current?.click()}
                disabled={busy}
              >
                <i className="fas fa-image"></i> {newGroupFile ? 'Change' : 'Logo'}
              </button>
              <button
                type="button"
                className="catalog-save-btn"
                onClick={addGroup}
                disabled={busy || !newGroup.trim() || !newGroupFile}
              >
                Add
              </button>
            </div>
            <input
              ref={groupLogoInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/bmp"
              style={{ display: 'none' }}
              onChange={pickGroupLogo}
            />
            <small className="helper-text">
              <i className="fas fa-info-circle"></i> Logo required — shows on homepage marquee.
            </small>
            {newGroupPreview && (
              <div className="group-logo-thumb group-logo-thumb--preview">
                <img src={newGroupPreview} alt="New group logo preview" />
              </div>
            )}
          </div>
          <ul className="catalog-item-list">
            {pagedGroups.map((g) => {
              const used = usageCount('group', g.value);
              return (
                <li key={g.value} className="catalog-item">
                  <div className="catalog-item-main catalog-item-main--group">
                    <div className="group-logo-thumb">
                      {g.image ? (
                        <img src={g.image} alt={g.label} />
                      ) : (
                        <span className="group-logo-empty"><i className="fas fa-image"></i></span>
                      )}
                    </div>
                    <div>
                      <strong>{g.label}</strong>
                      <span className={`catalog-usage${used ? ' is-used' : ''}`}>
                        {used > 0 ? `${used} product${used === 1 ? '' : 's'}` : 'Not used'}
                        {!g.image ? ' · no marquee logo' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="catalog-item-actions">
                    <button
                      type="button"
                      className="catalog-logo-btn"
                      title="Upload / change marquee logo"
                      onClick={() => {
                        logoTargetRef.current = g.value;
                        replaceLogoInputRef.current?.click();
                      }}
                      disabled={busy}
                    >
                      <i className="fas fa-image"></i>
                    </button>
                    <button
                      type="button"
                      className={`catalog-del-btn${used > 0 ? ' is-locked' : ''}`}
                      title={used > 0 ? `Cannot delete — in use by ${used} product(s)` : 'Delete group'}
                      onClick={() => removeGroup(g.value)}
                      disabled={busy || used > 0}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <AdminPager
            total={groups.length}
            page={groupPage}
            pageSize={groupPageSize}
            pageSizeOptions={CATALOG_PAGE_SIZES}
            onPageChange={setGroupPage}
            onPageSizeChange={setGroupPageSize}
          />
          <input
            ref={replaceLogoInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/bmp"
            style={{ display: 'none' }}
            onChange={replaceLogo}
          />
        </section>
      </div>
    </div>
  );
};

const STOCK_PAGE_SIZES = [5, 10, 15, 20, 25];

const getStockStatus = (stock) => {
  if (stock === 0)  return { label: 'Out of Stock', cls: 'out-of-stock' };
  if (stock <= 5)   return { label: 'Critical',     cls: 'critical' };
  if (stock <= 10)  return { label: 'Low Stock',    cls: 'low-stock' };
  return { label: 'In Stock', cls: 'in-stock' };
};

const StockPanelList = ({
  products,
  showPrice,
  rowClass,
  editingStock,
  stockValue,
  stockError,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onStockValueChange,
}) => (
  <div className="stock-list">
    {products.map((product) => {
      const status = getStockStatus(product.stock);
      const isEditing = editingStock === product._id;
      return (
        <div key={product._id} className={`stock-list-row${rowClass ? ` ${rowClass}` : ''}${isEditing ? ' is-editing' : ''}`}>
          <img className="stock-list-thumb" src={product.image} alt="" />
          <div className="stock-list-main">
            <strong className="stock-list-name" title={product.name}>{product.name}</strong>
            <div className="stock-list-meta">
              <span>{product.category}</span>
              <span>·</span>
              <span>{product.kpopGroup}</span>
              {showPrice && (
                <>
                  <span>·</span>
                  <span className="stock-list-price">₱{Number(product.price || 0).toLocaleString()}</span>
                </>
              )}
            </div>
          </div>
          <div className="stock-list-stock">
            {isEditing ? (
              <div className="stock-edit-wrap">
                <div className="stock-edit">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    value={stockValue}
                    onChange={onStockValueChange}
                    onKeyPress={(e) => {
                      if (!/[0-9]/.test(e.key) && e.key !== 'Enter') { e.preventDefault(); return; }
                      if (e.key === 'Enter') onSaveEdit(product._id);
                    }}
                    placeholder="0–999"
                    autoFocus
                  />
                  <button className="save-btn" onClick={() => onSaveEdit(product._id)}><i className="fas fa-check"></i></button>
                  <button className="cancel-btn" onClick={onCancelEdit}><i className="fas fa-times"></i></button>
                </div>
                {stockError && <span className="stock-inline-err">{stockError}</span>}
              </div>
            ) : (
              <strong className={product.stock === 0 ? 'stock-zero' : product.stock <= 10 ? 'stock-low' : ''}>
                {product.stock}
              </strong>
            )}
          </div>
          <span className={`status-badge ${status.cls}`}>{status.label}</span>
          {!isEditing && (
            <button
              type="button"
              className="edit-stock-btn stock-list-edit"
              onClick={() => onStartEdit(product._id, product.stock)}
              title="Edit stock"
            >
              <i className="fas fa-edit"></i>
            </button>
          )}
        </div>
      );
    })}
  </div>
);

const StockManagement = ({ products, updateProduct, onAddProduct, categories = FALLBACK_CATEGORIES }) => {
  const [searchTerm, setSearchTerm]         = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [editingStock, setEditingStock]     = useState(null);
  const [stockValue, setStockValue]         = useState('');
  const [stockError, setStockError]         = useState('');
  const [allPage, setAllPage]               = useState(0);
  const [allPageSize, setAllPageSize]       = useState(10);
  const [lowPage, setLowPage]               = useState(0);
  const [lowPageSize, setLowPageSize]       = useState(10);

  const filteredProducts = products.filter(p => {
    const matchSearch =
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.kpopGroup?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = filterCategory === 'all' || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  const sortedFiltered   = [...filteredProducts].sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
  const lowStockProducts = sortedFiltered.filter(p => p.stock <= 10);
  const lowStockCount    = products.filter(p => p.stock <= 10).length;
  const totalStock       = products.reduce((s, p) => s + (p.stock || 0), 0);
  const outOfStockCount  = products.filter(p => p.stock === 0).length;

  useEffect(() => { setAllPage(0); }, [searchTerm, filterCategory, allPageSize, products.length]);
  useEffect(() => { setLowPage(0); }, [searchTerm, filterCategory, lowPageSize, products.length]);

  const startEdit  = (productId, currentStock) => { setEditingStock(productId); setStockValue(String(currentStock)); setStockError(''); };
  const cancelEdit = () => { setEditingStock(null); setStockValue(''); setStockError(''); };

  const saveEdit = async (productId) => {
    const val = stockValue.trim();
    if (!val) { setStockError('Stock cannot be empty.'); return; }
    if (!/^\d+$/.test(val)) { setStockError('Numbers only.'); return; }
    if (val.length > 3) { setStockError('Max 3 digits (0–999).'); return; }
    const n = parseInt(val, 10);
    if (n > 999) { setStockError('Maximum value is 999.'); return; }
    await updateProduct({ id: productId, stock: n });
    setEditingStock(null); setStockValue(''); setStockError('');
  };

  const onStockValueChange = (e) => {
    const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
    setStockValue(v);
    setStockError('');
  };

  const tableProps = {
    editingStock,
    stockValue,
    stockError,
    onStartEdit: startEdit,
    onCancelEdit: cancelEdit,
    onSaveEdit: saveEdit,
    onStockValueChange,
  };

  const pagedAll = sortedFiltered.slice(allPage * allPageSize, allPage * allPageSize + allPageSize);
  const pagedLow = lowStockProducts.slice(lowPage * lowPageSize, lowPage * lowPageSize + lowPageSize);

  return (
    <div className="stock-section">
      <div className="stock-stats">
        <div className="stock-stat-card">
          <div className="stock-stat-icon blue"><DkIcon name={DK_ICONS.totalProducts} size={22} /></div>
          <div className="stock-stat-info"><h3>{products.length}</h3><p>Total Products</p></div>
        </div>
        <div className="stock-stat-card">
          <div className="stock-stat-icon green"><i className="fas fa-warehouse"></i></div>
          <div className="stock-stat-info"><h3>{totalStock.toLocaleString()}</h3><p>Total Stock Units</p></div>
        </div>
        <div className="stock-stat-card">
          <div className="stock-stat-icon orange"><i className="fas fa-exclamation-triangle"></i></div>
          <div className="stock-stat-info"><h3>{lowStockCount}</h3><p>Low Stock Items</p></div>
        </div>
        <div className="stock-stat-card">
          <div className="stock-stat-icon red"><i className="fas fa-times-circle"></i></div>
          <div className="stock-stat-info"><h3>{outOfStockCount}</h3><p>Out of Stock</p></div>
        </div>
      </div>

      <div className="stock-filters">
        <div className="search-box">
          <i className="fas fa-search"></i>
          <input type="text" placeholder="Search products..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="filter-select">
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="stock-split">
        <div className="stock-panel">
          <div className="stock-panel-head">
            <div>
              <h3><i className="fas fa-warehouse"></i> All Stock Levels</h3>
              <p>{sortedFiltered.length} product{sortedFiltered.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {sortedFiltered.length === 0 ? (
            <div className="empty-state stock-panel-empty">
              <i className="fas fa-box-open"></i>
              <h3>No products found</h3>
              <p>Try adjusting your search or filters.</p>
            </div>
          ) : (
            <>
              <StockPanelList products={pagedAll} showPrice {...tableProps} />
              <AdminPager
                total={sortedFiltered.length}
                page={allPage}
                pageSize={allPageSize}
                pageSizeOptions={STOCK_PAGE_SIZES}
                onPageChange={setAllPage}
                onPageSizeChange={setAllPageSize}
              />
            </>
          )}
        </div>

        <div className="stock-panel stock-panel--low">
          <div className="stock-panel-head">
            <div>
              <h3><i className="fas fa-exclamation-triangle"></i> Low Stock</h3>
              <p>{lowStockProducts.length} need restocking</p>
            </div>
            {lowStockProducts.length > 0 && <span className="low-pill">{lowStockProducts.length}</span>}
          </div>
          {lowStockProducts.length === 0 ? (
            <div className="empty-state success stock-panel-empty">
              <i className="fas fa-check-circle"></i>
              <h3>All Good!</h3>
              <p>No low stock products at the moment.</p>
            </div>
          ) : (
            <>
              <StockPanelList products={pagedLow} rowClass="low-stock-row" {...tableProps} />
              <AdminPager
                total={lowStockProducts.length}
                page={lowPage}
                pageSize={lowPageSize}
                pageSizeOptions={STOCK_PAGE_SIZES}
                onPageChange={setLowPage}
                onPageSizeChange={setLowPageSize}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
const AdminProducts = () => {
  const { confirm } = useConfirm();
  const products        = useQuery(api.products.getAllProductsAdmin) || [];
  const { items: categories, refresh: refreshCategories } = useCatalogOptions('category');
  const { items: groups, refresh: refreshGroups } = useCatalogOptions('kpopGroup');
  const addCatalogOption = useMutation(api.catalogOptions.add);
  const addProduct      = useAddProduct();
  const updateProduct   = useUpdateProduct();
  const deleteProduct   = useDeleteProduct();
  const announceNewPreOrder = useAction(api.preOrderRequests.announceNewPreOrderToAllUsers);

  const removeCatalogOption = useMutation(api.catalogOptions.remove);
  const generateGroupLogoUploadUrl = useMutation(api.catalogOptions.generateUploadUrl);
  const setGroupImage = useMutation(api.catalogOptions.setGroupImage);

  const uploadGroupLogoFile = async (file) => {
    const postUrl = await generateGroupLogoUploadUrl();
    const result = await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!result.ok) throw new Error('Upload failed');
    const { storageId } = await result.json();
    if (!storageId) throw new Error('No storageId returned');
    return storageId;
  };

  const handleAddCategory = async (name) => {
    try {
      const res = await addCatalogOption({ type: 'category', name });
      await refreshCategories();
      return res;
    } catch (err) {
      return { success: false, message: err?.message || 'Could not add category.' };
    }
  };
  const handleAddGroup = async (name, file) => {
    try {
      let imageStorageId;
      if (file) imageStorageId = await uploadGroupLogoFile(file);
      const res = await addCatalogOption({
        type: 'kpopGroup',
        name,
        ...(imageStorageId ? { imageStorageId } : {}),
      });
      await refreshGroups();
      return res;
    } catch (err) {
      return { success: false, message: err?.message || 'Could not add group.' };
    }
  };
  const handleSetGroupImage = async (value, file) => {
    try {
      const imageStorageId = await uploadGroupLogoFile(file);
      const res = await setGroupImage({ value, imageStorageId });
      await refreshGroups();
      return res;
    } catch (err) {
      return { success: false, message: err?.message || 'Could not update group logo.' };
    }
  };
  const handleRemoveCategory = async (value) => {
    const ok = await confirm({
      title: 'Delete category?',
      message: `Remove "${value}" from the category list? Products using it must be changed first.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return { success: false, message: 'Cancelled.' };
    try {
      const res = await removeCatalogOption({ type: 'category', value });
      await refreshCategories();
      return res;
    } catch (err) {
      return { success: false, message: err?.message || 'Could not delete category.' };
    }
  };
  const handleRemoveGroup = async (value) => {
    const ok = await confirm({
      title: 'Delete K-Pop group?',
      message: `Remove "${value}" from the group list? Products using it must be changed first.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return { success: false, message: 'Cancelled.' };
    try {
      const res = await removeCatalogOption({ type: 'kpopGroup', value });
      await refreshGroups();
      return res;
    } catch (err) {
      return { success: false, message: err?.message || 'Could not delete group.' };
    }
  };

  const [showModal,      setShowModal]      = useState(false);
  const [editingId,      setEditingId]      = useState(null);
  const [modalForm,      setModalForm]      = useState(emptyForm);
  const [submitting,     setSubmitting]     = useState(false);
  const [activeView,     setActiveView]     = useState('products');
  const [searchTerm,     setSearchTerm]     = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [successMsg,     setSuccessMsg]     = useState('');

  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3200); };

  const openAdd  = () => { setEditingId(null); setModalForm(emptyForm); setShowModal(true); };
  const openEdit = (product) => {
    setModalForm({
      name: product.name || '', category: product.category || 'albums',
      kpopGroup: product.kpopGroup || 'BTS', price: String(product.price || ''),
      originalPrice: String(product.originalPrice || ''), stock: String(product.stock ?? ''),
      image: product.image || '', description: product.description || '',
      isSale: product.isSale || false, isPreOrder: product.isPreOrder || false,
      releaseDate: product.releaseDate || '', releaseTime: product.releaseTime || '',
      saleStartDate: product.saleStartDate || '', saleStartTime: product.saleStartTime || '',
      saleEndDate: product.saleEndDate || '', saleEndTime: product.saleEndTime || '',
    });
    setEditingId(product._id);
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditingId(null); };

  const handleModalSubmit = async (form) => {
    const productData = {
      name: form.name.trim(), category: form.category, kpopGroup: form.kpopGroup,
      price: Number(form.price),
      originalPrice: form.isSale && form.originalPrice ? Number(form.originalPrice) : Number(form.price),
      stock: Number(form.stock || 0), image: form.image.trim(),
      description: form.description.trim() || '',
      isSale: Boolean(form.isSale), isPreOrder: Boolean(form.isPreOrder),
      releaseDate: form.isPreOrder ? form.releaseDate : '',
      releaseTime: form.isPreOrder ? form.releaseTime : '',
      saleStartDate: form.isSale ? form.saleStartDate : '',
      saleStartTime: form.isSale ? form.saleStartTime : '',
      saleEndDate: form.isSale ? form.saleEndDate : '',
      saleEndTime: form.isSale ? form.saleEndTime : '',
      status: form.isPreOrder ? 'preorder' : form.isSale ? 'sale' : 'available',
    };
    setSubmitting(true);
    try {
      if (editingId) {
        await updateProduct({ id: editingId, ...productData });
        showSuccess('Product updated successfully!');
      } else {
        await addProduct(productData);
        if (form.isPreOrder && form.releaseDate && form.releaseTime) {
          try {
            await announceNewPreOrder({
              productName: form.name.trim(), productImage: form.image.trim(),
              productPrice: Number(form.price), releaseDate: form.releaseDate, releaseTime: form.releaseTime,
            });
          } catch (emailErr) { console.error('Email announcement failed:', emailErr); }
        }
        showSuccess('Product added successfully!');
      }
      closeModal();
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id, name) => {
    const ok = await confirm({
      title: 'Delete product?',
      message: `Delete "${name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    await deleteProduct({ id });
    showSuccess('Product deleted.');
  };

  // ✅ Sort by newest first (latest _creationTime sa unahan)
  const filteredProducts = products
    .filter(p => {
      const matchSearch =
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.kpopGroup?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = filterCategory === 'all' || p.category === filterCategory;
      return matchSearch && matchCat;
    })
    .sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0));

  const lowStockCount = products.filter(p => p.stock <= 10).length;

  return (
    <div className="admin-products-page">
      {successMsg && (
        <div className="success-toast">
          <i className="fas fa-check-circle"></i> {successMsg}
        </div>
      )}

      <div className="view-toggle-row">
        <div className="view-toggle">
          <button className={`view-btn${activeView === 'products' ? ' active' : ''}`} onClick={() => setActiveView('products')}>
            Product Catalog
          </button>
          <button className={`view-btn${activeView === 'catalog' ? ' active' : ''}`} onClick={() => setActiveView('catalog')}>
            Categories &amp; Groups
          </button>
          <button className={`view-btn${activeView === 'stock' ? ' active' : ''}`} onClick={() => setActiveView('stock')}>
            Stock Management
            {lowStockCount > 0 && <span className="low-pill">{lowStockCount}</span>}
          </button>
        </div>
        {activeView !== 'catalog' && (
          <button className="add-product-btn" onClick={openAdd}>
            <i className="fas fa-plus"></i> Add Product
          </button>
        )}
      </div>

      {activeView === 'products' && (
        <div className="admin-product-list">
          <div className="list-header">
            <h2><i className="fas fa-list"></i> Product Catalog ({filteredProducts.length})</h2>
            <div className="list-filters">
              <div className="search-box">
                <i className="fas fa-search"></i>
                <input type="text" placeholder="Search products..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="filter-select">
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-box-open"></i>
              <h3>No products found</h3>
              <p>{products.length === 0 ? 'Click "Add Product" to get started' : 'Try adjusting your search or filters'}</p>
            </div>
          ) : (
            <div className="product-grid">
              {filteredProducts.map(product => {
                const released  = isReleased(product);
                const showBadge = showReleasedBadge(product);
                return (
                  <div key={product._id} className="product-card">
                    <div className="product-image">
                      <img src={product.image} alt={product.name} />
                      <div className="product-badges">
                        {product.isPreOrder && showBadge  && <span className="badge released"><i className="fas fa-check-circle"></i> Released</span>}
                        {product.isPreOrder && !released  && <span className="badge pre-order"><i className="fas fa-clock"></i> Pre-Order</span>}
                        {product.isSale && !product.isPreOrder && <span className="badge sale"><i className="fas fa-tag"></i> Sale</span>}
                      </div>
                    </div>
                    <div className="product-details">
                      <div className="product-header">
                        <h3>{product.name}</h3>
                        <span className="category-tag">{product.category}</span>
                      </div>
                      <div className="product-meta">
                        <span><i className="fas fa-users"></i> {product.kpopGroup}</span>
                        <span><i className="fas fa-box"></i> Stock: {product.stock}</span>
                      </div>
                      {product.isPreOrder && product.releaseDate && (
                        <div className={`release-date-info${released ? ' released' : ''}`}>
                          <i className={`fas ${released ? 'fa-check-circle' : 'fa-calendar-alt'}`}></i>
                          {released ? 'Released: ' : 'Release: '}
                          {formatReleaseDateTime(product.releaseDate, product.releaseTime)}
                        </div>
                      )}
                      {product.isSale && formatSaleRange(product) && (
                        <div className="release-date-info sale-date-info">
                          <i className="fas fa-tag"></i>
                          Sale: {formatSaleRange(product)}
                        </div>
                      )}
                      <div className="product-pricing">
                        <div className="price">₱{product.price.toLocaleString()}</div>
                        {product.originalPrice > product.price && (
                          <div className="original-price">₱{product.originalPrice.toLocaleString()}</div>
                        )}
                      </div>
                      <div className="product-actions">
                        <button className="edit-btn" onClick={() => openEdit(product)}><i className="fas fa-edit"></i> Edit</button>
                        <button className="delete-btn" onClick={() => handleDelete(product._id, product.name)}><i className="fas fa-trash"></i> Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeView === 'catalog' && (
        <CatalogManager
          products={products}
          categories={categories}
          groups={groups}
          onAddCategory={handleAddCategory}
          onAddGroup={handleAddGroup}
          onRemoveCategory={handleRemoveCategory}
          onRemoveGroup={handleRemoveGroup}
          onSetGroupImage={handleSetGroupImage}
        />
      )}

      {activeView === 'stock' && (
        <StockManagement
          products={products}
          updateProduct={updateProduct}
          onAddProduct={openAdd}
          categories={categories}
        />
      )}

      {showModal && (
        <ProductModal
          editingId={editingId} initialForm={modalForm}
          onClose={closeModal} onSubmit={handleModalSubmit} submitting={submitting}
          categories={categories}
          groups={groups}
        />
      )}
    </div>
  );
};

export default AdminProducts;