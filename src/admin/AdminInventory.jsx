import React, { useState, useEffect } from 'react';
import './AdminInventory.css';
import { getProducts, saveProducts } from '../utils/productStorage';

const AdminInventory = () => {
  const [activeTab, setActiveTab] = useState('stock');
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [editingStock, setEditingStock] = useState(null);
  const [stockValue, setStockValue] = useState('');

  // Load products on mount and listen for updates
  useEffect(() => {
    loadProducts();

    const handleUpdate = () => {
      loadProducts();
    };

    window.addEventListener('productsUpdated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('productsUpdated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const loadProducts = () => {
    const allProducts = getProducts();
    setProducts(allProducts);
  };

  // Filter products based on search and category
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.kpopGroup.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Get low stock products (stock <= 10)
  const lowStockProducts = filteredProducts.filter(p => p.stock <= 10);

  // Calculate inventory stats
  const totalProducts = products.length;
  const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
  const lowStockCount = products.filter(p => p.stock <= 10).length;
  const outOfStockCount = products.filter(p => p.stock === 0).length;

  // Handle stock update
  const handleStockEdit = (productId, currentStock) => {
    setEditingStock(productId);
    setStockValue(String(currentStock));
  };

  const handleStockSave = (productId) => {
    const newStock = parseInt(stockValue) || 0;
    
    if (newStock < 0) {
      alert('Stock cannot be negative');
      return;
    }

    const updatedProducts = products.map(p =>
      p.id === productId ? { ...p, stock: newStock } : p
    );

    saveProducts(updatedProducts);
    setProducts(updatedProducts);
    setEditingStock(null);
    setStockValue('');

    // Notify other components
    window.dispatchEvent(new Event('productsUpdated'));
  };

  const handleStockCancel = () => {
    setEditingStock(null);
    setStockValue('');
  };

  // Quick stock adjustment
  const adjustStock = (productId, amount) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const newStock = Math.max(0, product.stock + amount);
    const updatedProducts = products.map(p =>
      p.id === productId ? { ...p, stock: newStock } : p
    );

    saveProducts(updatedProducts);
    setProducts(updatedProducts);
    window.dispatchEvent(new Event('productsUpdated'));
  };

  const getStockStatus = (stock) => {
    if (stock === 0) return { label: 'Out of Stock', class: 'out-of-stock' };
    if (stock <= 5) return { label: 'Critical', class: 'critical' };
    if (stock <= 10) return { label: 'Low Stock', class: 'low-stock' };
    return { label: 'In Stock', class: 'in-stock' };
  };

  return (
    <div className="admin-inventory-page">
      <div className="inventory-stats">
        <div className="stat-card">
          <div className="stat-icon blue">
            <i className="fas fa-boxes"></i>
          </div>
          <div className="stat-info">
            <h3>{totalProducts}</h3>
            <p>Total Products</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <i className="fas fa-warehouse"></i>
          </div>
          <div className="stat-info">
            <h3>{totalStock.toLocaleString()}</h3>
            <p>Total Stock Units</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">
            <i className="fas fa-exclamation-triangle"></i>
          </div>
          <div className="stat-info">
            <h3>{lowStockCount}</h3>
            <p>Low Stock Items</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon red">
            <i className="fas fa-times-circle"></i>
          </div>
          <div className="stat-info">
            <h3>{outOfStockCount}</h3>
            <p>Out of Stock</p>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="page-tabs">
        <button
          className={`tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
          onClick={() => setActiveTab('stock')}
        >
          <i className="fas fa-warehouse"></i>
          All Stock Levels
        </button>
        <button
          className={`tab-btn ${activeTab === 'low' ? 'active' : ''}`}
          onClick={() => setActiveTab('low')}
        >
          <i className="fas fa-exclamation-triangle"></i>
          Low Stock ({lowStockCount})
        </button>
      </div>

      {/* FILTERS */}
      <div className="inventory-filters">
        <div className="search-box">
          <i className="fas fa-search"></i>
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="filter-select"
        >
          <option value="all">All Categories</option>
          <option value="albums">Albums</option>
          <option value="photocards">Photocards</option>
          <option value="lightsticks">Lightsticks</option>
          <option value="apparel">Apparel</option>
          <option value="accessories">Accessories</option>
        </select>
      </div>

      {/* TAB CONTENT */}
      <div className="tab-content">
        {activeTab === 'stock' && (
          <div className="content-section">
            {filteredProducts.length === 0 ? (
              <div className="empty-state">
                <i className="fas fa-box-open"></i>
                <h3>No products found</h3>
                <p>Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="inventory-table-wrapper">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Group</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map(product => {
                      const status = getStockStatus(product.stock);
                      return (
                        <tr key={product.id}>
                          <td>
                            <div className="product-cell">
                              <img src={product.image} alt={product.name} />
                              <div className="product-info">
                                <strong>{product.name}</strong>
                                {product.isPreOrder && (
                                  <span className="badge pre-order">Pre-Order</span>
                                )}
                                {product.isSale && (
                                  <span className="badge sale">Sale</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="category-badge">{product.category}</span>
                          </td>
                          <td>{product.kpopGroup}</td>
                          <td className="price-cell">₱{product.price.toLocaleString()}</td>
                          <td>
                            {editingStock === product.id ? (
                              <div className="stock-edit">
                                <input
                                  type="number"
                                  value={stockValue}
                                  onChange={(e) => setStockValue(e.target.value)}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') handleStockSave(product.id);
                                  }}
                                  autoFocus
                                />
                                <button
                                  className="save-btn"
                                  onClick={() => handleStockSave(product.id)}
                                >
                                  <i className="fas fa-check"></i>
                                </button>
                                <button
                                  className="cancel-btn"
                                  onClick={handleStockCancel}
                                >
                                  <i className="fas fa-times"></i>
                                </button>
                              </div>
                            ) : (
                              <div className="stock-display">
                                <strong>{product.stock}</strong>
                                <button
                                  className="edit-stock-btn"
                                  onClick={() => handleStockEdit(product.id, product.stock)}
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`status-badge ${status.class}`}>
                              {status.label}
                            </span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="adjust-btn increase"
                                onClick={() => adjustStock(product.id, 10)}
                                title="Add 10"
                              >
                                <i className="fas fa-plus"></i> 10
                              </button>
                              <button
                                className="adjust-btn decrease"
                                onClick={() => adjustStock(product.id, -10)}
                                title="Remove 10"
                                disabled={product.stock === 0}
                              >
                                <i className="fas fa-minus"></i> 10
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'low' && (
          <div className="content-section">
            {lowStockProducts.length === 0 ? (
              <div className="empty-state success">
                <i className="fas fa-check-circle"></i>
                <h3>All Good!</h3>
                <p>No low stock products at the moment</p>
              </div>
            ) : (
              <div className="inventory-table-wrapper">
                <div className="low-stock-alert">
                  <i className="fas fa-exclamation-triangle"></i>
                  <p>
                    <strong>{lowStockProducts.length} product(s)</strong> need restocking
                  </p>
                </div>
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Current Stock</th>
                      <th>Status</th>
                      <th>Quick Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockProducts.map(product => {
                      const status = getStockStatus(product.stock);
                      return (
                        <tr key={product.id} className="low-stock-row">
                          <td>
                            <div className="product-cell">
                              <img src={product.image} alt={product.name} />
                              <strong>{product.name}</strong>
                            </div>
                          </td>
                          <td>
                            <span className="category-badge">{product.category}</span>
                          </td>
                          <td>
                            <strong className="stock-critical">{product.stock}</strong>
                          </td>
                          <td>
                            <span className={`status-badge ${status.class}`}>
                              {status.label}
                            </span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="restock-btn"
                                onClick={() => adjustStock(product.id, 50)}
                              >
                                <i className="fas fa-box"></i> Restock +50
                              </button>
                              <button
                                className="edit-stock-btn"
                                onClick={() => handleStockEdit(product.id, product.stock)}
                              >
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminInventory;