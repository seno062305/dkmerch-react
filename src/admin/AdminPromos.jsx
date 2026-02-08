import React, { useState, useEffect } from 'react';
import './AdminPromos.css';

const AdminPromos = () => {
  const [promos, setPromos] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    discount: '',
    maxDiscount: '',
    startDate: '',
    endDate: '',
    isActive: true
  });

  // Load promos from localStorage on mount
  useEffect(() => {
    const savedPromos = localStorage.getItem('promos');
    if (savedPromos) {
      setPromos(JSON.parse(savedPromos));
    }
  }, []);

  // Save promos to localStorage whenever they change
  useEffect(() => {
    if (promos.length > 0 || localStorage.getItem('promos')) {
      localStorage.setItem('promos', JSON.stringify(promos));
    }
  }, [promos]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (editingPromo) {
      // Update existing promo
      setPromos(promos.map(promo => 
        promo.id === editingPromo.id 
          ? { ...formData, id: editingPromo.id }
          : promo
      ));
    } else {
      // Create new promo
      const newPromo = {
        ...formData,
        id: Date.now().toString()
      };
      setPromos([...promos, newPromo]);
    }

    resetForm();
  };

  const handleEdit = (promo) => {
    setEditingPromo(promo);
    setFormData({
      code: promo.code,
      name: promo.name,
      discount: promo.discount,
      maxDiscount: promo.maxDiscount,
      startDate: promo.startDate,
      endDate: promo.endDate,
      isActive: promo.isActive
    });
    setShowModal(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this promo?')) {
      setPromos(promos.filter(promo => promo.id !== id));
    }
  };

  const toggleStatus = (id) => {
    setPromos(promos.map(promo =>
      promo.id === id
        ? { ...promo, isActive: !promo.isActive }
        : promo
    ));
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      discount: '',
      maxDiscount: '',
      startDate: '',
      endDate: '',
      isActive: true
    });
    setEditingPromo(null);
    setShowModal(false);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  const formatPeriod = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return `${start.toISOString().split('T')[0]} - ${end.toISOString().split('T')[0]}`;
  };

  return (
    <div className="admin-promos">
      <div className="promos-header">
        <div>
          <h1>Promos</h1>
          <p className="subtitle">Manage promotional discounts</p>
        </div>
        <button className="create-btn" onClick={() => setShowModal(true)}>
          + Create Promo
        </button>
      </div>

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
                <td colSpan="7" className="empty-state">
                  No promos available. Create your first promo!
                </td>
              </tr>
            ) : (
              promos.map(promo => (
                <tr key={promo.id}>
                  <td>
                    <span className="promo-code">
                      <svg className="tag-icon" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      {promo.code}
                    </span>
                  </td>
                  <td>{promo.name}</td>
                  <td>{promo.discount}%</td>
                  <td>₱{promo.maxDiscount}</td>
                  <td>{formatPeriod(promo.startDate, promo.endDate)}</td>
                  <td>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={promo.isActive}
                        onChange={() => toggleStatus(promo.id)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="edit-btn"
                        onClick={() => handleEdit(promo)}
                        title="Edit"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => handleDelete(promo.id)}
                        title="Delete"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPromo ? 'Edit Promo' : 'Create New Promo'}</h2>
              <button className="close-btn" onClick={resetForm}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="code">Promo Code *</label>
                  <input
                    type="text"
                    id="code"
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    placeholder="e.g., SUMMER25"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="name">Promo Name *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Summer Sale"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="discount">Discount (%) *</label>
                  <input
                    type="number"
                    id="discount"
                    name="discount"
                    value={formData.discount}
                    onChange={handleInputChange}
                    min="1"
                    max="100"
                    placeholder="e.g., 25"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="maxDiscount">Max Discount (₱) *</label>
                  <input
                    type="number"
                    id="maxDiscount"
                    name="maxDiscount"
                    value={formData.maxDiscount}
                    onChange={handleInputChange}
                    min="1"
                    placeholder="e.g., 500"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="startDate">Start Date *</label>
                  <input
                    type="date"
                    id="startDate"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="endDate">End Date *</label>
                  <input
                    type="date"
                    id="endDate"
                    name="endDate"
                    value={formData.endDate}
                    onChange={handleInputChange}
                    min={formData.startDate}
                    required
                  />
                </div>
              </div>

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

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={resetForm}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  {editingPromo ? 'Update Promo' : 'Create Promo'}
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