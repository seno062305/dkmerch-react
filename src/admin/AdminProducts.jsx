import React, { useState, useRef } from 'react';
import './AdminProducts.css';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAddProduct, useUpdateProduct, useDeleteProduct } from '../utils/productStorage';

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

const AdminProducts = () => {
  const products = useQuery(api.products.getAllProductsAdmin) || [];

  const addProduct    = useAddProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  // ✅ NEW: Action to email all users when a new pre-order is added
  const announceNewPreOrder = useAction(api.preOrderRequests.announceNewPreOrderToAllUsers);

  const [form, setForm]           = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm]         = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [submitting, setSubmitting]         = useState(false);
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'isPreOrder' && !checked ? { releaseDate: '', releaseTime: '' } : {}),
    }));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setForm(prev => ({ ...prev, image: `/images/${file.name}` }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price || !form.image) {
      alert('Name, Price, and Image are required');
      return;
    }
    if (form.isPreOrder && !form.releaseDate) {
      alert('Please set a Release Date for Pre-Order items');
      return;
    }
    if (form.isPreOrder && !form.releaseTime) {
      alert('Please set a Release Time for Pre-Order items');
      return;
    }

    const productData = {
      name:          form.name,
      category:      form.category,
      kpopGroup:     form.kpopGroup,
      price:         Number(form.price),
      originalPrice: form.originalPrice ? Number(form.originalPrice) : Number(form.price),
      stock:         Number(form.stock || 0),
      image:         form.image,
      description:   form.description || '',
      isSale:        Boolean(form.isSale),
      isPreOrder:    Boolean(form.isPreOrder),
      releaseDate:   form.isPreOrder ? form.releaseDate : '',
      releaseTime:   form.isPreOrder ? form.releaseTime : '',
      status:        form.isPreOrder ? 'preorder' : form.isSale ? 'sale' : 'available',
    };

    setSubmitting(true);
    try {
      if (editingId) {
        // ── Editing existing product ──
        await updateProduct({ id: editingId, ...productData });
        setEditingId(null);
      } else {
        // ── Adding new product ──
        await addProduct(productData);

        // ✅ If new pre-order, email ALL users to announce it
        if (form.isPreOrder && form.releaseDate && form.releaseTime) {
          try {
            await announceNewPreOrder({
              productName:  form.name,
              productImage: form.image,
              productPrice: Number(form.price),
              releaseDate:  form.releaseDate,
              releaseTime:  form.releaseTime,
            });
          } catch (emailErr) {
            // Don't block the product add if email fails
            console.error('Email announcement failed:', emailErr);
          }
        }
      }
    } finally {
      setSubmitting(false);
    }

    setForm(emptyForm);
  };

  const handleEdit = (product) => {
    setForm({
      name:          product.name || '',
      category:      product.category || 'albums',
      kpopGroup:     product.kpopGroup || 'BTS',
      price:         String(product.price || ''),
      originalPrice: String(product.originalPrice || ''),
      stock:         String(product.stock || ''),
      image:         product.image || '',
      description:   product.description || '',
      isSale:        product.isSale || false,
      isPreOrder:    product.isPreOrder || false,
      releaseDate:   product.releaseDate || '',
      releaseTime:   product.releaseTime || '',
    });
    setEditingId(product._id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    await deleteProduct({ id });
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch =
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.kpopGroup?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // ✅ Proper PHT timestamp check
  const isReleased = (product) => {
    if (!product.isPreOrder) return false;
    if (!product.releaseDate) return false;
    const rt = product.releaseTime || '00:00';
    const releaseMs = new Date(`${product.releaseDate}T${rt}:00+08:00`).getTime();
    return Date.now() >= releaseMs;
  };

  const totalProducts  = products.length;
  const totalValue     = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
  const onSaleCount    = products.filter(p => p.isSale).length;
  const preOrderCount  = products.filter(p => p.isPreOrder && !isReleased(p)).length;

  const formatReleaseDateTime = (dateStr, timeStr) => {
    if (!dateStr) return null;
    const time = timeStr || '00:00';
    return new Date(`${dateStr}T${time}:00+08:00`).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="admin-products-page">
      <div className="products-stats">
        <div className="stat-card">
          <div className="stat-icon purple"><i className="fas fa-box"></i></div>
          <div className="stat-info"><h3>{totalProducts}</h3><p>Total Products</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><i className="fas fa-peso-sign"></i></div>
          <div className="stat-info"><h3>₱{totalValue.toLocaleString()}</h3><p>Total Inventory Value</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><i className="fas fa-tag"></i></div>
          <div className="stat-info"><h3>{onSaleCount}</h3><p>On Sale</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><i className="fas fa-clock"></i></div>
          <div className="stat-info"><h3>{preOrderCount}</h3><p>Pre-Orders</p></div>
        </div>
      </div>

      <div className="admin-product-form-wrapper">
        <form className="admin-product-form" onSubmit={handleSubmit}>
          <div className="form-header">
            <h2>
              <i className={editingId ? "fas fa-edit" : "fas fa-plus-circle"}></i>
              {editingId ? 'Edit Product' : 'Add New Product'}
            </h2>
            {editingId && (
              <button type="button" className="cancel-edit-btn" onClick={handleCancelEdit}>
                <i className="fas fa-times"></i> Cancel
              </button>
            )}
          </div>

          <div className="form-grid">
            <div className="form-group full-width">
              <label><i className="fas fa-tag"></i> Product Name *</label>
              <input name="name" placeholder="Enter product name" value={form.name} onChange={handleChange} required />
            </div>

            <div className="form-group">
              <label><i className="fas fa-folder"></i> Category *</label>
              <select name="category" value={form.category} onChange={handleChange}>
                <option value="albums">Albums</option>
                <option value="photocards">Photocards</option>
                <option value="lightsticks">Lightsticks</option>
                <option value="apparel">Apparel</option>
                <option value="accessories">Accessories</option>
              </select>
            </div>

            <div className="form-group">
              <label><i className="fas fa-users"></i> K-Pop Group *</label>
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

            <div className="form-group">
              <label><i className="fas fa-money-bill-wave"></i> Price *</label>
              <input type="number" name="price" placeholder="0.00" value={form.price} onChange={handleChange} required />
            </div>

            <div className="form-group">
              <label><i className="fas fa-strikethrough"></i> Original Price</label>
              <input type="number" name="originalPrice" placeholder="0.00" value={form.originalPrice} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label><i className="fas fa-warehouse"></i> Stock Quantity *</label>
              <input type="number" name="stock" placeholder="0" value={form.stock} onChange={handleChange} required />
            </div>

            <div className="form-group full-width">
              <label><i className="fas fa-image"></i> Product Image *</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  name="image"
                  placeholder="/images/product.jpg"
                  value={form.image}
                  onChange={handleChange}
                  required
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current.click()}
                  style={{ padding: '10px 16px', background: '#6c63ff', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '14px' }}
                >
                  <i className="fas fa-folder-open"></i> Browse
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
              <small className="helper-text">Click Browse to pick from your images folder, or type the path manually.</small>
            </div>

            {form.image && (
              <div className="form-group full-width">
                <div className="image-preview">
                  <img src={form.image} alt="Preview" onError={(e) => e.target.style.display = 'none'} />
                </div>
              </div>
            )}

            <div className="form-group full-width">
              <label><i className="fas fa-align-left"></i> Product Description</label>
              <textarea
                name="description"
                placeholder="Enter product description..."
                value={form.description}
                onChange={handleChange}
                rows="4"
                style={{ padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '15px', fontFamily: 'inherit', resize: 'vertical', transition: 'all 0.3s ease' }}
              />
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

            {form.isPreOrder && (
              <>
                <div className="form-group release-date-field">
                  <label><i className="fas fa-calendar-alt"></i> Release Date *</label>
                  <input
                    type="date"
                    name="releaseDate"
                    value={form.releaseDate}
                    onChange={handleChange}
                    min={today}
                    max="9999-12-31"
                    required={form.isPreOrder}
                  />
                </div>

                <div className="form-group release-time-field">
                  <label><i className="fas fa-clock"></i> Release Time *</label>
                  <input
                    type="time"
                    name="releaseTime"
                    value={form.releaseTime}
                    onChange={handleChange}
                    required={form.isPreOrder}
                  />
                  <small className="helper-text">
                    <i className="fas fa-info-circle"></i> e.g. 01:00 AM — Users will be emailed at exactly this time.
                  </small>
                </div>

                {form.releaseDate && form.releaseTime && (
                  <div className="form-group full-width">
                    <div className="release-preview">
                      <i className="fas fa-bell"></i>
                      <span>
                        Users will be notified on{' '}
                        <strong>{formatReleaseDateTime(form.releaseDate, form.releaseTime)}</strong>
                      </span>
                    </div>
                  </div>
                )}

                {/* ✅ Notice to admin that email will be sent on add */}
                {!editingId && (
                  <div className="form-group full-width">
                    <div style={{
                      background: '#eff6ff',
                      border: '1.5px solid #bfdbfe',
                      borderRadius: '10px',
                      padding: '12px 16px',
                      fontSize: '14px',
                      color: '#1e40af',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}>
                      <i className="fas fa-envelope" style={{ color: '#3b82f6', fontSize: '16px' }}></i>
                      <span>📧 All registered users will receive an email announcement when this pre-order is added.</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="submit-btn" disabled={submitting}>
              <i className={editingId ? "fas fa-save" : "fas fa-plus"}></i>
              {submitting
                ? (editingId ? 'Updating...' : 'Adding & Sending Emails...')
                : (editingId ? 'Update Product' : 'Add Product')
              }
            </button>
          </div>
        </form>
      </div>

      {/* Product List */}
      <div className="admin-product-list">
        <div className="list-header">
          <h2><i className="fas fa-list"></i> Product Catalog ({filteredProducts.length})</h2>
          <div className="list-filters">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="Search products..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="filter-select">
              <option value="all">All Categories</option>
              <option value="albums">Albums</option>
              <option value="photocards">Photocards</option>
              <option value="lightsticks">Lightsticks</option>
              <option value="apparel">Apparel</option>
              <option value="accessories">Accessories</option>
            </select>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-box-open"></i>
            <h3>No products found</h3>
            <p>{products.length === 0 ? 'Start by adding your first product above' : 'Try adjusting your search or filters'}</p>
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
                      {product.isPreOrder && released && (
                        <span className="badge released">
                          <i className="fas fa-check-circle"></i> Released
                        </span>
                      )}
                      {product.isPreOrder && !released && (
                        <span className="badge pre-order">
                          <i className="fas fa-clock"></i> Pre-Order
                        </span>
                      )}
                      {product.isSale && !product.isPreOrder && (
                        <span className="badge sale">
                          <i className="fas fa-tag"></i> Sale
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="product-details">
                    <div className="product-header">
                      <h3>{product.name}</h3>
                      <span className="category-tag">{product.category}</span>
                    </div>
                    <div className="product-meta">
                      <span className="group"><i className="fas fa-users"></i> {product.kpopGroup}</span>
                      <span className="stock"><i className="fas fa-box"></i> Stock: {product.stock}</span>
                    </div>
                    {product.isPreOrder && product.releaseDate && (
                      <div className={`release-date-info ${released ? 'release-date-info--released' : ''}`}>
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
                      <button className="edit-btn" onClick={() => handleEdit(product)}>
                        <i className="fas fa-edit"></i> Edit
                      </button>
                      <button className="delete-btn" onClick={() => handleDelete(product._id)}>
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
    </div>
  );
};

export default AdminProducts;