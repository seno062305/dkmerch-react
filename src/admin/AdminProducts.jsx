import React, { useState, useRef } from 'react';
import './AdminProducts.css';
import { useProducts, useAddProduct, useUpdateProduct, useDeleteProduct } from '../utils/productStorage';

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
  isPreOrder: false
};

const AdminProducts = () => {
  const products = useProducts() || [];
  const addProduct = useAddProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // When user picks a file, convert it to /images/filename.jpg path
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Store as /images/<filename> so it matches public/images folder
    const imagePath = `/images/${file.name}`;
    setForm(prev => ({ ...prev, image: imagePath }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name || !form.price || !form.image) {
      alert('Name, Price, and Image are required');
      return;
    }

    const productData = {
      name: form.name,
      category: form.category,
      kpopGroup: form.kpopGroup,
      price: Number(form.price),
      originalPrice: form.originalPrice ? Number(form.originalPrice) : Number(form.price),
      stock: Number(form.stock || 0),
      image: form.image,
      description: form.description || '',
      isSale: Boolean(form.isSale),
      isPreOrder: Boolean(form.isPreOrder),
      status: form.isPreOrder ? 'preorder' : form.isSale ? 'sale' : 'available',
    };

    if (editingId) {
      await updateProduct({ id: editingId, ...productData });
      setEditingId(null);
    } else {
      await addProduct(productData);
    }

    setForm(emptyForm);
  };

  const handleEdit = (product) => {
    setForm({
      name: product.name || '',
      category: product.category || 'albums',
      kpopGroup: product.kpopGroup || 'BTS',
      price: String(product.price || ''),
      originalPrice: String(product.originalPrice || ''),
      stock: String(product.stock || ''),
      image: product.image || '',
      description: product.description || '',
      isSale: product.isSale || false,
      isPreOrder: product.isPreOrder || false,
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

  const totalProducts = products.length;
  const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
  const onSaleCount = products.filter(p => p.isSale).length;
  const preOrderCount = products.filter(p => p.isPreOrder).length;

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

            {/* IMAGE FIELD - file browser + manual path */}
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
                  style={{
                    padding: '10px 16px',
                    background: '#6c63ff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontSize: '14px',
                  }}
                >
                  <i className="fas fa-folder-open"></i> Browse
                </button>
              </div>
              {/* Hidden file input - accepts images only */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              <small className="helper-text">
                Click Browse to pick from your images folder, or type the path manually (e.g. /images/product.jpg)
              </small>
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
              <small className="helper-text">Describe the product features and details</small>
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
          </div>

          <div className="form-actions">
            <button type="submit" className="submit-btn">
              <i className={editingId ? "fas fa-save" : "fas fa-plus"}></i>
              {editingId ? 'Update Product' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>

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
            {filteredProducts.map(product => (
              <div key={product._id} className="product-card">
                <div className="product-image">
                  <img src={product.image} alt={product.name} />
                  <div className="product-badges">
                    {product.isSale && <span className="badge sale"><i className="fas fa-tag"></i> Sale</span>}
                    {product.isPreOrder && <span className="badge pre-order"><i className="fas fa-clock"></i> Pre-Order</span>}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminProducts;