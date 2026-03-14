import React, { useState, useRef } from 'react';
import './AdminProducts.css';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAddProduct, useUpdateProduct, useDeleteProduct } from '../utils/productStorage';

// ── Allowed image types ────────────────────────────────────────────────────
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png',
  'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
];
const ALLOWED_IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|bmp)$/i;

const emptyForm = {
  name: '',
  category: 'albums',
  kpopGroup: 'BTS',
  price: '',
  originalPrice: '',
  image: '',
  stock: '',
  description: '',
  isSale: false,
  isPreOrder: false,
  releaseDate: '',
  releaseTime: '',
};

// ── Validation ─────────────────────────────────────────────────────────────
const validateForm = (form) => {
  const err = {};

  if (!form.name.trim())
    err.name = 'Product name is required.';
  else if (form.name.trim().length < 3)
    err.name = 'Name must be at least 3 characters.';

  if (form.price === '' || form.price === null)
    err.price = 'Price is required.';
  else if (isNaN(Number(form.price)) || Number(form.price) <= 0)
    err.price = 'Price must be a positive number.';

  // Original price required when isSale is checked
  if (form.isSale) {
    if (form.originalPrice === '' || form.originalPrice === null)
      err.originalPrice = 'Original price is required when item is on sale.';
    else if (isNaN(Number(form.originalPrice)) || Number(form.originalPrice) <= 0)
      err.originalPrice = 'Original price must be a positive number.';
    else if (Number(form.originalPrice) < Number(form.price))
      err.originalPrice = 'Original price should be >= selling price.';
  }

  if (form.stock === '' || form.stock === null)
    err.stock = 'Stock quantity is required.';
  else if (isNaN(Number(form.stock)) || Number(form.stock) < 0)
    err.stock = 'Stock must be 0 or more.';
  else if (!Number.isInteger(Number(form.stock)))
    err.stock = 'Stock must be a whole number.';
  else if (Number(form.stock) > 999)
    err.stock = 'Stock cannot exceed 999.';

  if (!form.image.trim())
    err.image = 'Product image is required.';
  else if (!ALLOWED_IMAGE_EXT.test(form.image.trim()))
    err.image = 'Only image files are allowed (JPG, PNG, GIF, WEBP, SVG, BMP).';

  if (form.isPreOrder) {
    if (!form.releaseDate) err.releaseDate = 'Release date is required for pre-order items.';
    if (!form.releaseTime) err.releaseTime = 'Release time is required for pre-order items.';
  }

  return err;
};

// ── formatReleaseDateTime ──────────────────────────────────────────────────
const formatReleaseDateTime = (dateStr, timeStr) => {
  if (!dateStr) return null;
  const time = timeStr || '00:00';
  return new Date(`${dateStr}T${time}:00+08:00`).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

// ══════════════════════════════════════════════════════════════════════════
//  PRODUCT MODAL (Add / Edit)
// ══════════════════════════════════════════════════════════════════════════
const ProductModal = ({ editingId, initialForm, onClose, onSubmit, submitting }) => {
  const [form, setForm]     = useState(initialForm);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);
  const today = new Date().toISOString().split('T')[0];

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      // Clear originalPrice when isSale is unchecked
      ...(name === 'isSale' && !checked ? { originalPrice: '' } : {}),
      ...(name === 'isPreOrder' && !checked ? { releaseDate: '', releaseTime: '' } : {}),
    }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setErrors(prev => ({ ...prev, image: 'Only image files are allowed (JPG, PNG, GIF, WEBP, SVG, BMP).' }));
      e.target.value = '';
      return;
    }
    setErrors(prev => ({ ...prev, image: '' }));
    setForm(prev => ({ ...prev, image: `/images/${file.name}` }));
  };

  const handleImagePath = (e) => {
    const val = e.target.value;
    setForm(prev => ({ ...prev, image: val }));
    if (val.trim() && !ALLOWED_IMAGE_EXT.test(val.trim()))
      setErrors(prev => ({ ...prev, image: 'Only image files are allowed (JPG, PNG, GIF, WEBP, SVG, BMP).' }));
    else
      setErrors(prev => ({ ...prev, image: '' }));
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

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="pm-header">
          <div className="pm-title-row">
            <div className="pm-icon">
              <i className={editingId ? 'fas fa-edit' : 'fas fa-plus'}></i>
            </div>
            <div>
              <h2>{editingId ? 'Edit Product' : 'Add New Product'}</h2>
              <p>{editingId ? 'Update product details below' : 'Fill in the details to add a new product'}</p>
            </div>
          </div>
          <button className="pm-close" type="button" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Body */}
        <div className="pm-body">
          <form id="pm-form" onSubmit={handleSubmit} noValidate>
            <div className="form-grid">

              {/* Name */}
              <div className={`form-group full-width${errors.name ? ' has-error' : ''}`}>
                <label><i className="fas fa-tag"></i> Product Name <span className="req">*</span></label>
                <input name="name" placeholder="Enter product name" value={form.name} onChange={handleChange} maxLength={120} />
                {errors.name && <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.name}</span>}
              </div>

              {/* Category */}
              <div className="form-group">
                <label><i className="fas fa-folder"></i> Category <span className="req">*</span></label>
                <select name="category" value={form.category} onChange={handleChange}>
                  <option value="albums">Albums</option>
                  <option value="photocards">Photocards</option>
                  <option value="lightsticks">Lightsticks</option>
                  <option value="accessories">Accessories</option>
                </select>
              </div>

              {/* K-Pop Group */}
              <div className="form-group">
                <label><i className="fas fa-users"></i> K-Pop Group <span className="req">*</span></label>
                <select name="kpopGroup" value={form.kpopGroup} onChange={handleChange}>
                  <option>BTS</option>
                  <option>BLACKPINK</option>
                  <option>TWICE</option>
                  <option>SEVENTEEN</option>
                  <option>STRAY KIDS</option>
                  <option>EXO</option>
                  <option>RED VELVET</option>
                  <option>NEWJEANS</option>
                </select>
              </div>

              {/* Price */}
              <div className={`form-group${errors.price ? ' has-error' : ''}`}>
                <label><i className="fas fa-money-bill-wave"></i> Price <span className="req">*</span></label>
                <input type="number" name="price" placeholder="0.00" value={form.price} onChange={handleChange} min="0.01" step="0.01" />
                {errors.price && <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.price}</span>}
              </div>

              {/* Original Price — required when isSale, disabled otherwise */}
              <div className={`form-group${errors.originalPrice ? ' has-error' : ''}${!form.isSale ? ' field-disabled' : ''}`}>
                <label>
                  <i className="fas fa-strikethrough"></i> Original Price
                  {form.isSale
                    ? <span className="req">*</span>
                    : <span className="opt">— enable "On Sale" first</span>
                  }
                </label>
                <input
                  type="number"
                  name="originalPrice"
                  placeholder="0.00"
                  value={form.originalPrice}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  disabled={!form.isSale}
                />
                {errors.originalPrice && <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.originalPrice}</span>}
              </div>

              {/* Stock */}
              <div className={`form-group${errors.stock ? ' has-error' : ''}`}>
                <label><i className="fas fa-warehouse"></i> Stock Quantity <span className="req">*</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  name="stock"
                  placeholder="0–999"
                  value={form.stock}
                  maxLength={3}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                    setForm(prev => ({ ...prev, stock: v }));
                    if (errors.stock) setErrors(prev => ({ ...prev, stock: '' }));
                  }}
                  onKeyPress={e => {
                    if (!/[0-9]/.test(e.key)) e.preventDefault();
                  }}
                />
                {errors.stock && <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.stock}</span>}
              </div>

              {/* Image */}
              <div className={`form-group full-width${errors.image ? ' has-error' : ''}`}>
                <label><i className="fas fa-image"></i> Product Image <span className="req">*</span></label>
                <div className="image-input-row">
                  <input
                    name="image"
                    placeholder="/images/product.jpg"
                    value={form.image}
                    onChange={handleImagePath}
                  />
                  <button type="button" className="browse-btn" onClick={() => fileInputRef.current.click()}>
                    <i className="fas fa-folder-open"></i> Browse
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/bmp"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                {errors.image
                  ? <span className="field-error"><i className="fas fa-exclamation-circle"></i> {errors.image}</span>
                  : <small className="helper-text"><i className="fas fa-info-circle"></i> Allowed formats: JPG, PNG, GIF, WEBP, SVG, BMP only.</small>
                }
                {form.image && !errors.image && (
                  <div className="image-preview">
                    <img src={form.image} alt="Preview" onError={e => e.target.style.display = 'none'} />
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="form-group full-width">
                <label><i className="fas fa-align-left"></i> Description <span className="opt">(optional)</span></label>
                <textarea
                  name="description"
                  placeholder="Enter product description..."
                  value={form.description}
                  onChange={handleChange}
                  rows="3"
                  maxLength={1000}
                />
                <small className="helper-text" style={{ justifyContent: 'flex-end' }}>{form.description.length}/1000</small>
              </div>

              {/* Checkboxes */}
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

              {/* Pre-order fields */}
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
                      : <small className="helper-text"><i className="fas fa-info-circle"></i> Philippine Time (PHT). Users emailed at this time.</small>
                    }
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
          </form>
        </div>

        {/* Footer */}
        <div className="pm-footer">
          <button type="button" className="pm-cancel-btn" onClick={onClose} disabled={submitting}>
            <i className="fas fa-times"></i> Cancel
          </button>
          <button type="submit" form="pm-form" className="pm-submit-btn" disabled={submitting}>
            {submitting
              ? <><i className="fas fa-spinner fa-spin"></i> {editingId ? 'Updating...' : 'Adding...'}</>
              : <><i className={editingId ? 'fas fa-save' : 'fas fa-plus'}></i> {editingId ? 'Update Product' : 'Add Product'}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  STOCK MANAGEMENT (merged from AdminItemList)
// ══════════════════════════════════════════════════════════════════════════
const StockManagement = ({ products, updateProduct }) => {
  const [activeTab, setActiveTab]           = useState('all');
  const [searchTerm, setSearchTerm]         = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [editingStock, setEditingStock]     = useState(null);
  const [stockValue, setStockValue]         = useState('');
  const [stockError, setStockError]         = useState('');

  const filteredProducts = products.filter(p => {
    const matchSearch =
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.kpopGroup?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = filterCategory === 'all' || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  // Sort by lowest stock first (ascending)
  const sortedFiltered   = [...filteredProducts].sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
  const lowStockProducts = sortedFiltered.filter(p => p.stock <= 10);
  const lowStockCount    = products.filter(p => p.stock <= 10).length;
  const totalStock       = products.reduce((s, p) => s + (p.stock || 0), 0);
  const outOfStockCount  = products.filter(p => p.stock === 0).length;

  const getStockStatus = (stock) => {
    if (stock === 0)  return { label: 'Out of Stock', cls: 'out-of-stock' };
    if (stock <= 5)   return { label: 'Critical',     cls: 'critical' };
    if (stock <= 10)  return { label: 'Low Stock',    cls: 'low-stock' };
    return { label: 'In Stock', cls: 'in-stock' };
  };

  const startEdit = (productId, currentStock) => {
    setEditingStock(productId);
    setStockValue(String(currentStock));
    setStockError('');
  };

  const saveEdit = async (productId) => {
    const val = stockValue.trim();
    if (!val) { setStockError('Stock cannot be empty.'); return; }
    if (!/^\d+$/.test(val)) { setStockError('Numbers only — no letters or symbols.'); return; }
    if (val.length > 3) { setStockError('Max 3 digits (0–999).'); return; }
    const n = parseInt(val, 10);
    if (n > 999) { setStockError('Maximum value is 999.'); return; }
    await updateProduct({ id: productId, stock: n });
    setEditingStock(null);
    setStockValue('');
    setStockError('');
  };

  const cancelEdit = () => { setEditingStock(null); setStockValue(''); setStockError(''); };

  const displayList = activeTab === 'low' ? lowStockProducts : sortedFiltered;

  return (
    <div className="stock-section">

      {/* Stats */}
      <div className="stock-stats">
        <div className="stat-card">
          <div className="stat-icon blue"><i className="fas fa-boxes"></i></div>
          <div className="stat-info"><h3>{products.length}</h3><p>Total Products</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><i className="fas fa-warehouse"></i></div>
          <div className="stat-info"><h3>{totalStock.toLocaleString()}</h3><p>Total Stock Units</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><i className="fas fa-exclamation-triangle"></i></div>
          <div className="stat-info"><h3>{lowStockCount}</h3><p>Low Stock Items</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red"><i className="fas fa-times-circle"></i></div>
          <div className="stat-info"><h3>{outOfStockCount}</h3><p>Out of Stock</p></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="stock-tabs">
        <button className={`tab-btn${activeTab === 'all' ? ' active' : ''}`} onClick={() => setActiveTab('all')}>
          <i className="fas fa-warehouse"></i> All Stock Levels
        </button>
        <button className={`tab-btn${activeTab === 'low' ? ' active' : ''}`} onClick={() => setActiveTab('low')}>
          <i className="fas fa-exclamation-triangle"></i> Low Stock
          {lowStockCount > 0 && <span className="low-pill">{lowStockCount}</span>}
        </button>
      </div>

      {/* Filters */}
      <div className="stock-filters">
        <div className="search-box">
          <i className="fas fa-search"></i>
          <input type="text" placeholder="Search products..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="filter-select">
          <option value="all">All Categories</option>
          <option value="albums">Albums</option>
          <option value="photocards">Photocards</option>
          <option value="lightsticks">Lightsticks</option>
          <option value="accessories">Accessories</option>
        </select>
      </div>

      {/* Table Card */}
      <div className="stock-table-card">
        {activeTab === 'low' && lowStockProducts.length === 0 ? (
          <div className="empty-state success">
            <i className="fas fa-check-circle"></i>
            <h3>All Good!</h3>
            <p>No low stock products at the moment.</p>
          </div>
        ) : displayList.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-box-open"></i>
            <h3>No products found</h3>
            <p>Try adjusting your search or filters.</p>
          </div>
        ) : (
          <>
            {activeTab === 'low' && (
              <div className="low-stock-alert">
                <i className="fas fa-exclamation-triangle"></i>
                <p><strong>{lowStockProducts.length} product(s)</strong> need restocking</p>
              </div>
            )}
            <div className="inventory-table-wrapper">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Group</th>
                    {activeTab === 'all' && <th>Price</th>}
                    <th>Stock ↑</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayList.map(product => {
                    const status = getStockStatus(product.stock);
                    return (
                      <tr key={product._id} className={activeTab === 'low' ? 'low-stock-row' : ''}>
                        <td>
                          <div className="product-cell">
                            <img src={product.image} alt={product.name} />
                            <div className="product-info"><strong>{product.name}</strong></div>
                          </div>
                        </td>
                        <td><span className="category-badge">{product.category}</span></td>
                        <td>{product.kpopGroup}</td>
                        {activeTab === 'all' && <td className="price-cell">₱{product.price.toLocaleString()}</td>}
                        <td>
                          {editingStock === product._id ? (
                            <div className="stock-edit-wrap">
                              <div className="stock-edit">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  maxLength={3}
                                  value={stockValue}
                                  onChange={e => {
                                    const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                                    setStockValue(v);
                                    setStockError('');
                                  }}
                                  onKeyPress={e => {
                                    if (!/[0-9]/.test(e.key) && e.key !== 'Enter') { e.preventDefault(); return; }
                                    if (e.key === 'Enter') saveEdit(product._id);
                                  }}
                                  placeholder="0–999"
                                  autoFocus
                                />
                                <button className="save-btn" onClick={() => saveEdit(product._id)}>
                                  <i className="fas fa-check"></i>
                                </button>
                                <button className="cancel-btn" onClick={cancelEdit}>
                                  <i className="fas fa-times"></i>
                                </button>
                              </div>
                              {stockError && <span className="stock-inline-err">{stockError}</span>}
                            </div>
                          ) : (
                            <strong className={product.stock === 0 ? 'stock-zero' : product.stock <= 10 ? 'stock-low' : ''}>
                              {product.stock}
                            </strong>
                          )}
                        </td>
                        <td><span className={`status-badge ${status.cls}`}>{status.label}</span></td>
                        <td>
                          <div className="action-buttons">
                            <button className="edit-stock-btn" onClick={() => startEdit(product._id, product.stock)}>
                              <i className="fas fa-edit"></i> Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
const AdminProducts = () => {
  const products        = useQuery(api.products.getAllProductsAdmin) || [];
  const addProduct      = useAddProduct();
  const updateProduct   = useUpdateProduct();
  const deleteProduct   = useDeleteProduct();
  const announceNewPreOrder = useAction(api.preOrderRequests.announceNewPreOrderToAllUsers);

  const [showModal,       setShowModal]       = useState(false);
  const [editingId,       setEditingId]       = useState(null);
  const [modalForm,       setModalForm]       = useState(emptyForm);
  const [submitting,      setSubmitting]      = useState(false);
  const [activeView,      setActiveView]      = useState('products'); // 'products' | 'stock'
  const [searchTerm,      setSearchTerm]      = useState('');
  const [filterCategory,  setFilterCategory]  = useState('all');
  const [successMsg,      setSuccessMsg]      = useState('');

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3200);
  };

  const openAdd = () => {
    setEditingId(null);
    setModalForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (product) => {
    setModalForm({
      name:          product.name || '',
      category:      product.category || 'albums',
      kpopGroup:     product.kpopGroup || 'BTS',
      price:         String(product.price || ''),
      originalPrice: String(product.originalPrice || ''),
      stock:         String(product.stock ?? ''),
      image:         product.image || '',
      description:   product.description || '',
      isSale:        product.isSale || false,
      isPreOrder:    product.isPreOrder || false,
      releaseDate:   product.releaseDate || '',
      releaseTime:   product.releaseTime || '',
    });
    setEditingId(product._id);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingId(null); };

  const handleModalSubmit = async (form) => {
    const productData = {
      name:          form.name.trim(),
      category:      form.category,
      kpopGroup:     form.kpopGroup,
      price:         Number(form.price),
      originalPrice: form.isSale && form.originalPrice ? Number(form.originalPrice) : Number(form.price),
      stock:         Number(form.stock || 0),
      image:         form.image.trim(),
      description:   form.description.trim() || '',
      isSale:        Boolean(form.isSale),
      isPreOrder:    Boolean(form.isPreOrder),
      releaseDate:   form.isPreOrder ? form.releaseDate : '',
      releaseTime:   form.isPreOrder ? form.releaseTime : '',
      status:        form.isPreOrder ? 'preorder' : form.isSale ? 'sale' : 'available',
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
              productName:  form.name.trim(),
              productImage: form.image.trim(),
              productPrice: Number(form.price),
              releaseDate:  form.releaseDate,
              releaseTime:  form.releaseTime,
            });
          } catch (emailErr) {
            console.error('Email announcement failed:', emailErr);
          }
        }
        showSuccess('Product added successfully!');
      }
      closeModal();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await deleteProduct({ id });
    showSuccess('Product deleted.');
  };

  const filteredProducts = products.filter(p => {
    const matchSearch =
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.kpopGroup?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = filterCategory === 'all' || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  const isReleased = (product) => {
    if (!product.isPreOrder || !product.releaseDate) return false;
    const rt = product.releaseTime || '00:00';
    return Date.now() >= new Date(`${product.releaseDate}T${rt}:00+08:00`).getTime();
  };

  const lowStockCount = products.filter(p => p.stock <= 10).length;

  return (
    <div className="admin-products-page">

      {/* Toast */}
      {successMsg && (
        <div className="success-toast">
          <i className="fas fa-check-circle"></i> {successMsg}
        </div>
      )}

      {/* Page Header */}
      <div className="products-page-header">
        <div className="products-page-title">
          <h1><i className="fas fa-box"></i> Products &amp; Stock</h1>
        </div>
        <button className="add-product-btn" onClick={openAdd}>
          <i className="fas fa-plus"></i> Add Product
        </button>
      </div>

      {/* View Toggle */}
      <div className="view-toggle">
        <button className={`view-btn${activeView === 'products' ? ' active' : ''}`} onClick={() => setActiveView('products')}>
          <i className="fas fa-th-large"></i> Product Catalog
        </button>
        <button className={`view-btn${activeView === 'stock' ? ' active' : ''}`} onClick={() => setActiveView('stock')}>
          <i className="fas fa-warehouse"></i> Stock Management
          {lowStockCount > 0 && <span className="low-pill">{lowStockCount}</span>}
        </button>
      </div>

      {/* ── Product Catalog ── */}
      {activeView === 'products' && (
        <div className="admin-product-list">
          <div className="list-header">
            <h2><i className="fas fa-list"></i> Product Catalog ({filteredProducts.length})</h2>
            <div className="list-filters">
              <div className="search-box">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="filter-select">
                <option value="all">All Categories</option>
                <option value="albums">Albums</option>
                <option value="photocards">Photocards</option>
                <option value="lightsticks">Lightsticks</option>
                <option value="accessories">Accessories</option>
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
                const released = isReleased(product);
                return (
                  <div key={product._id} className="product-card">
                    <div className="product-image">
                      <img src={product.image} alt={product.name} />
                      <div className="product-badges">
                        {product.isPreOrder && released  && <span className="badge released"><i className="fas fa-check-circle"></i> Released</span>}
                        {product.isPreOrder && !released && <span className="badge pre-order"><i className="fas fa-clock"></i> Pre-Order</span>}
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
                      <div className="product-pricing">
                        <div className="price">₱{product.price.toLocaleString()}</div>
                        {product.originalPrice > product.price && (
                          <div className="original-price">₱{product.originalPrice.toLocaleString()}</div>
                        )}
                      </div>
                      <div className="product-actions">
                        <button className="edit-btn" onClick={() => openEdit(product)}>
                          <i className="fas fa-edit"></i> Edit
                        </button>
                        <button className="delete-btn" onClick={() => handleDelete(product._id, product.name)}>
                          <i className="fas fa-trash"></i> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Stock Management ── */}
      {activeView === 'stock' && (
        <StockManagement products={products} updateProduct={updateProduct} />
      )}

      {/* ── Modal ── */}
      {showModal && (
        <ProductModal
          editingId={editingId}
          initialForm={modalForm}
          onClose={closeModal}
          onSubmit={handleModalSubmit}
          submitting={submitting}
        />
      )}
    </div>
  );
};

export default AdminProducts;