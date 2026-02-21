import React, { useState, useEffect } from 'react';
import './AdminUsers.css';

const AdminUsers = () => {
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'riders'

  // ─── USERS STATE ───
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '', username: '', email: '', password: '', role: 'user', status: 'active'
  });
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  const [userToSuspend, setUserToSuspend] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  // ─── RIDERS STATE ───
  const [riders, setRiders] = useState([]);
  const [filteredRiders, setFilteredRiders] = useState([]);
  const [riderSearch, setRiderSearch] = useState('');
  const [riderFilterStatus, setRiderFilterStatus] = useState('all');
  const [editingRider, setEditingRider] = useState(null);
  const [riderFormData, setRiderFormData] = useState({
    fullName: '', email: '', phone: '', address: '',
    vehicleType: '', plateNumber: '', licenseNumber: '',
    password: '', status: 'pending'
  });
  const [showRiderEditModal, setShowRiderEditModal] = useState(false);
  const [showRiderDeleteConfirm, setShowRiderDeleteConfirm] = useState(false);
  const [riderToDelete, setRiderToDelete] = useState(null);
  const [riderPasswordErrors, setRiderPasswordErrors] = useState([]);
  const [showRiderPassword, setShowRiderPassword] = useState(false);

  const [notification, setNotification] = useState({ show: false, message: '', type: '' });

  // ─── LOAD DATA ───
  useEffect(() => { loadUsers(); loadRiders(); }, []);

  useEffect(() => {
    window.addEventListener('riderUpdated', loadRiders);
    return () => window.removeEventListener('riderUpdated', loadRiders);
  }, []);

  // ─── FILTER USERS ───
  useEffect(() => {
    let filtered = users;
    if (filterStatus !== 'all') filtered = filtered.filter(u => u.status === filterStatus);
    if (searchTerm.trim()) {
      filtered = filtered.filter(u =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.role?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    setFilteredUsers(filtered);
  }, [searchTerm, users, filterStatus]);

  // ─── FILTER RIDERS ───
  useEffect(() => {
    let filtered = riders;
    if (riderFilterStatus !== 'all') filtered = filtered.filter(r => r.status === riderFilterStatus);
    if (riderSearch.trim()) {
      filtered = filtered.filter(r =>
        r.fullName?.toLowerCase().includes(riderSearch.toLowerCase()) ||
        r.email?.toLowerCase().includes(riderSearch.toLowerCase()) ||
        r.phone?.includes(riderSearch) ||
        r.vehicleType?.toLowerCase().includes(riderSearch.toLowerCase()) ||
        r.plateNumber?.toLowerCase().includes(riderSearch.toLowerCase())
      );
    }
    setFilteredRiders(filtered);
  }, [riderSearch, riders, riderFilterStatus]);

  const loadUsers = () => {
    const stored = JSON.parse(localStorage.getItem('users')) || [];
    const withStatus = stored.map(u => ({ ...u, status: u.status || 'active' }));
    setUsers(withStatus);
    setFilteredUsers(withStatus);
  };

  const loadRiders = () => {
    const stored = JSON.parse(localStorage.getItem('dkmerch_rider_applications')) || [];
    setRiders(stored);
    setFilteredRiders(stored);
  };

  // ─── PASSWORD VALIDATION (Users) ───
  const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) errors.push('At least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('One uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('One lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('One number');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('One special character');
    return errors;
  };

  // ─── RIDER PASSWORD VALIDATION ───
  const validateRiderPassword = (password) => {
    const errors = [];
    if (!password) { errors.push('Password is required'); return errors; }
    if (!password.startsWith('@rider')) errors.push('Must start with @rider');
    if (password.length > 10) errors.push('Maximum 10 characters');
    if (password.length < 7) errors.push('Minimum 7 characters');
    return errors;
  };

  // ─── USER ACTIONS ───
  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({ name: user.name, username: user.username, email: user.email, password: user.password, role: user.role, status: user.status || 'active' });
    setPasswordErrors(validatePassword(user.password));
    setShowPassword(false);
    setShowEditModal(true);
  };

  const handleCloseModal = () => {
    setShowEditModal(false);
    setEditingUser(null);
    setPasswordErrors([]);
    setShowPassword(false);
  };

  const handleSuspend = (user) => { setUserToSuspend(user); setShowSuspendConfirm(true); };

  const confirmSuspend = () => {
    if (userToSuspend) {
      const newStatus = userToSuspend.status === 'active' ? 'suspended' : 'active';
      const updated = users.map(u => u.id === userToSuspend.id ? { ...u, status: newStatus } : u);
      localStorage.setItem('users', JSON.stringify(updated));
      if (newStatus === 'suspended') {
        const auth = JSON.parse(localStorage.getItem('authUser'));
        if (auth && auth.id === userToSuspend.id) { localStorage.removeItem('authUser'); window.location.href = '/'; }
      }
      loadUsers();
      showNotification(`User ${newStatus === 'suspended' ? 'suspended' : 'activated'} successfully`, 'success');
    }
    setShowSuspendConfirm(false);
    setUserToSuspend(null);
  };

  const handleDeleteUser = (user) => { setUserToDelete(user); setShowDeleteConfirm(true); };

  const confirmDeleteUser = () => {
    if (userToDelete) {
      const updated = users.filter(u => u.id !== userToDelete.id);
      localStorage.setItem('users', JSON.stringify(updated));
      loadUsers();
      showNotification('User deleted successfully', 'success');
    }
    setShowDeleteConfirm(false);
    setUserToDelete(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) { showNotification('Name is required', 'error'); return; }
    if (!formData.username.trim()) { showNotification('Username is required', 'error'); return; }
    if (!formData.email.trim() || !formData.email.includes('@')) { showNotification('Valid email is required', 'error'); return; }
    if (!formData.password.trim()) { showNotification('Password is required', 'error'); return; }
    const pwErrors = validatePassword(formData.password);
    if (pwErrors.length > 0) { showNotification('Please meet all password requirements', 'error'); return; }
    const dupUsername = users.find(u => u.username === formData.username && u.id !== editingUser.id);
    if (dupUsername) { showNotification('Username already taken', 'error'); return; }
    const dupEmail = users.find(u => u.email === formData.email && u.id !== editingUser.id);
    if (dupEmail) { showNotification('Email already exists', 'error'); return; }
    const updated = users.map(u => u.id === editingUser.id ? { ...u, ...formData } : u);
    localStorage.setItem('users', JSON.stringify(updated));
    const auth = JSON.parse(localStorage.getItem('authUser'));
    if (auth && auth.id === editingUser.id) localStorage.setItem('authUser', JSON.stringify({ ...auth, ...formData }));
    loadUsers();
    setShowEditModal(false);
    setEditingUser(null);
    setPasswordErrors([]);
    showNotification('User updated successfully', 'success');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'password') setPasswordErrors(validatePassword(value));
  };

  // ─── RIDER ACTIONS ───
  const handleEditRider = (rider) => {
    setEditingRider(rider);
    setRiderFormData({
      fullName: rider.fullName, email: rider.email, phone: rider.phone,
      address: rider.address, vehicleType: rider.vehicleType,
      plateNumber: rider.plateNumber, licenseNumber: rider.licenseNumber,
      password: rider.password || '', status: rider.status
    });
    setRiderPasswordErrors(validateRiderPassword(rider.password || ''));
    setShowRiderPassword(false);
    setShowRiderEditModal(true);
  };

  const handleCloseRiderModal = () => {
    setShowRiderEditModal(false);
    setEditingRider(null);
    setRiderPasswordErrors([]);
    setShowRiderPassword(false);
  };

  const handleRiderInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'password') {
      const truncated = value.slice(0, 10);
      setRiderFormData(prev => ({ ...prev, password: truncated }));
      setRiderPasswordErrors(validateRiderPassword(truncated));
      return;
    }
    if (name === 'plateNumber') {
      setRiderFormData(prev => ({ ...prev, plateNumber: value.toUpperCase().slice(0, 8) }));
      return;
    }
    if (name === 'phone') {
      const nums = value.replace(/\D/g, '').slice(0, 11);
      setRiderFormData(prev => ({ ...prev, phone: nums }));
      return;
    }
    setRiderFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRiderSubmit = (e) => {
    e.preventDefault();
    if (!riderFormData.fullName.trim()) { showNotification('Full name is required', 'error'); return; }
    if (!riderFormData.email.trim() || !riderFormData.email.includes('@')) { showNotification('Valid email is required', 'error'); return; }
    if (!riderFormData.phone || riderFormData.phone.length !== 11) { showNotification('Phone must be exactly 11 digits', 'error'); return; }
    if (!riderFormData.address.trim()) { showNotification('Address is required', 'error'); return; }
    if (!riderFormData.vehicleType) { showNotification('Vehicle type is required', 'error'); return; }
    if (!riderFormData.plateNumber.trim()) { showNotification('Plate number is required', 'error'); return; }
    if (!riderFormData.licenseNumber.trim()) { showNotification("Driver's license is required", 'error'); return; }
    const pwErrors = validateRiderPassword(riderFormData.password);
    if (pwErrors.length > 0) { showNotification('Password: ' + pwErrors[0], 'error'); return; }

    const updatedRiders = riders.map(r =>
      r.id === editingRider.id ? { ...r, ...riderFormData } : r
    );
    localStorage.setItem('dkmerch_rider_applications', JSON.stringify(updatedRiders));
    loadRiders();
    setShowRiderEditModal(false);
    setEditingRider(null);
    showNotification('Rider updated successfully', 'success');
  };

  const handleDeleteRider = (rider) => { setRiderToDelete(rider); setShowRiderDeleteConfirm(true); };

  const confirmDeleteRider = () => {
    if (riderToDelete) {
      const updated = riders.filter(r => r.id !== riderToDelete.id);
      localStorage.setItem('dkmerch_rider_applications', JSON.stringify(updated));
      loadRiders();
      showNotification('Rider deleted successfully', 'success');
    }
    setShowRiderDeleteConfirm(false);
    setRiderToDelete(null);
  };

  // ─── HELPERS ───
  const showNotification = (message, type) => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
  };

  const getRoleBadgeClass = (role) => role === 'admin' ? 'role-badge admin' : 'role-badge user';
  const getStatusBadgeClass = (status) => `status-badge ${status}`;

  const getRiderStatusBadgeClass = (status) => {
    const map = { pending: 'rider-status-badge pending', approved: 'rider-status-badge approved', rejected: 'rider-status-badge rejected', suspended: 'rider-status-badge suspended' };
    return map[status] || 'rider-status-badge pending';
  };

  const formatDate = (id) => {
    if (id === 0) return 'Built-in Admin';
    const date = new Date(id);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatRiderDate = (iso) => {
    if (!iso) return 'N/A';
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Stats
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === 'active').length;
  const suspendedUsers = users.filter(u => u.status === 'suspended').length;
  const totalRiders = riders.length;
  const approvedRiders = riders.filter(r => r.status === 'approved').length;
  const pendingRiders = riders.filter(r => r.status === 'pending').length;

  return (
    <div className="admin-users">
      {/* Notification */}
      {notification.show && (
        <div className={`notification ${notification.type}`}>
          <i className={`fas ${notification.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="users-header">
        <div className="header-left">
          <h1>
            <i className="fas fa-users"></i>
            User Management
          </h1>
          <p className="subtitle">Manage user accounts and rider registrations</p>
        </div>

        {/* Stats Cards */}
        <div className="users-stats">
          {activeTab === 'users' ? (
            <>
              <div className="stat-card">
                <i className="fas fa-users"></i>
                <div><div className="stat-number">{totalUsers}</div><div className="stat-label">Total Users</div></div>
              </div>
              <div className="stat-card">
                <i className="fas fa-check-circle"></i>
                <div><div className="stat-number">{activeUsers}</div><div className="stat-label">Active Users</div></div>
              </div>
              <div className="stat-card">
                <i className="fas fa-ban"></i>
                <div><div className="stat-number">{suspendedUsers}</div><div className="stat-label">Suspended</div></div>
              </div>
            </>
          ) : (
            <>
              <div className="stat-card rider-stat">
                <i className="fas fa-motorcycle"></i>
                <div><div className="stat-number">{totalRiders}</div><div className="stat-label">Total Riders</div></div>
              </div>
              <div className="stat-card rider-stat">
                <i className="fas fa-check-circle"></i>
                <div><div className="stat-number">{approvedRiders}</div><div className="stat-label">Approved</div></div>
              </div>
              <div className="stat-card rider-stat">
                <i className="fas fa-clock"></i>
                <div><div className="stat-number">{pendingRiders}</div><div className="stat-label">Pending</div></div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="tab-switcher">
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <i className="fas fa-user"></i> Users
          <span className="tab-count">{totalUsers}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'riders' ? 'active' : ''}`}
          onClick={() => setActiveTab('riders')}
        >
          <i className="fas fa-motorcycle"></i> Riders
          <span className="tab-count">{totalRiders}</span>
          {pendingRiders > 0 && <span className="tab-badge">{pendingRiders}</span>}
        </button>
      </div>

      {/* ═══════ USERS TAB ═══════ */}
      {activeTab === 'users' && (
        <>
          <div className="users-controls">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input
                type="text"
                placeholder="Search by name, username, email, or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="clear-search" onClick={() => setSearchTerm('')}>
                  <i className="fas fa-times"></i>
                </button>
              )}
            </div>
            <div className="status-filter">
              <button className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`} onClick={() => setFilterStatus('all')}>
                <i className="fas fa-list"></i> All
              </button>
              <button className={`filter-btn ${filterStatus === 'active' ? 'active' : ''}`} onClick={() => setFilterStatus('active')}>
                <i className="fas fa-check-circle"></i> Active
              </button>
              <button className={`filter-btn ${filterStatus === 'suspended' ? 'active' : ''}`} onClick={() => setFilterStatus('suspended')}>
                <i className="fas fa-ban"></i> Suspended
              </button>
            </div>
          </div>

          <div className="users-table-container">
            {filteredUsers.length === 0 ? (
              <div className="no-users"><i className="fas fa-user-slash"></i><p>No users found</p></div>
            ) : (
              <table className="users-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Name</th><th>Username</th><th>Email</th>
                    <th>Role</th><th>Status</th><th>Registered</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user.id}>
                      <td>#{user.id === 0 ? 'ADMIN' : user.id}</td>
                      <td className="user-name">
                        <i className="fas fa-user-circle"></i>{user.name}
                      </td>
                      <td>@{user.username}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={getRoleBadgeClass(user.role)}>
                          <i className={`fas ${user.role === 'admin' ? 'fa-shield-alt' : 'fa-user'}`}></i>
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <span className={getStatusBadgeClass(user.status || 'active')}>
                          <i className={`fas ${(user.status || 'active') === 'active' ? 'fa-check-circle' : 'fa-ban'}`}></i>
                          {(user.status || 'active') === 'active' ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="date-cell">{formatDate(user.id)}</td>
                      <td className="actions-cell">
                        <button className="btn-edit" onClick={() => handleEdit(user)} title="Edit User">
                          <i className="fas fa-edit"></i>
                        </button>
                        {user.id !== 0 && (
                          <>
                            <button
                              className={`btn-suspend ${(user.status || 'active') === 'suspended' ? 'btn-activate' : ''}`}
                              onClick={() => handleSuspend(user)}
                              title={(user.status || 'active') === 'active' ? 'Suspend User' : 'Activate User'}
                            >
                              <i className={`fas ${(user.status || 'active') === 'active' ? 'fa-ban' : 'fa-check-circle'}`}></i>
                            </button>
                            <button className="btn-delete" onClick={() => handleDeleteUser(user)} title="Delete User">
                              <i className="fas fa-trash"></i>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ═══════ RIDERS TAB ═══════ */}
      {activeTab === 'riders' && (
        <>
          <div className="users-controls">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input
                type="text"
                placeholder="Search by name, email, phone, vehicle..."
                value={riderSearch}
                onChange={(e) => setRiderSearch(e.target.value)}
              />
              {riderSearch && (
                <button className="clear-search" onClick={() => setRiderSearch('')}>
                  <i className="fas fa-times"></i>
                </button>
              )}
            </div>
            <div className="status-filter">
              {['all', 'pending', 'approved', 'rejected', 'suspended'].map(s => (
                <button
                  key={s}
                  className={`filter-btn ${riderFilterStatus === s ? 'active' : ''}`}
                  onClick={() => setRiderFilterStatus(s)}
                >
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
                    <th>ID</th><th>Full Name</th><th>Email</th><th>Phone</th>
                    <th>Vehicle</th><th>Plate</th><th>Status</th><th>Applied</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRiders.map(rider => (
                    <tr key={rider.id}>
                      <td>#{rider.id?.slice(-6)}</td>
                      <td className="user-name">
                        <i className="fas fa-motorcycle" style={{ color: '#7c3aed' }}></i>
                        {rider.fullName}
                      </td>
                      <td>{rider.email}</td>
                      <td>{rider.phone}</td>
                      <td style={{ textTransform: 'capitalize' }}>{rider.vehicleType}</td>
                      <td><strong>{rider.plateNumber}</strong></td>
                      <td>
                        <span className={getRiderStatusBadgeClass(rider.status)}>
                          {rider.status === 'approved' && <i className="fas fa-check-circle"></i>}
                          {rider.status === 'pending' && <i className="fas fa-clock"></i>}
                          {rider.status === 'rejected' && <i className="fas fa-times-circle"></i>}
                          {rider.status === 'suspended' && <i className="fas fa-ban"></i>}
                          {rider.status}
                        </span>
                      </td>
                      <td className="date-cell">{formatRiderDate(rider.createdAt)}</td>
                      <td className="actions-cell">
                        <button className="btn-edit" onClick={() => handleEditRider(rider)} title="Edit Rider">
                          <i className="fas fa-edit"></i>
                        </button>
                        <button className="btn-delete" onClick={() => handleDeleteRider(rider)} title="Delete Rider">
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

      {/* ═══════ EDIT USER MODAL ═══════ */}
      {showEditModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-user-edit"></i> Edit User</h2>
              <button className="close-btn" onClick={handleCloseModal}><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label><i className="fas fa-user"></i> Full Name</label>
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="Enter full name" required />
              </div>
              <div className="form-group">
                <label><i className="fas fa-at"></i> Username</label>
                <input type="text" name="username" value={formData.username} onChange={handleInputChange} placeholder="Enter username" required />
              </div>
              <div className="form-group">
                <label><i className="fas fa-envelope"></i> Email</label>
                <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="Enter email address" required />
              </div>
              <div className="form-group">
                <label><i className="fas fa-lock"></i> Password</label>
                <div className="password-input-wrapper">
                  <input type={showPassword ? "text" : "password"} name="password" value={formData.password} onChange={handleInputChange} placeholder="Enter password" required />
                  <button type="button" className="toggle-password" onClick={() => setShowPassword(!showPassword)}>
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                <div className="password-requirements">
                  <p className="requirements-title">Password must contain:</p>
                  <ul>
                    <li className={formData.password.length >= 8 ? 'valid' : ''}>
                      <i className={`fas ${formData.password.length >= 8 ? 'fa-check-circle' : 'fa-circle'}`}></i> At least 8 characters
                    </li>
                    <li className={/[A-Z]/.test(formData.password) ? 'valid' : ''}>
                      <i className={`fas ${/[A-Z]/.test(formData.password) ? 'fa-check-circle' : 'fa-circle'}`}></i> One uppercase letter
                    </li>
                    <li className={/[a-z]/.test(formData.password) ? 'valid' : ''}>
                      <i className={`fas ${/[a-z]/.test(formData.password) ? 'fa-check-circle' : 'fa-circle'}`}></i> One lowercase letter
                    </li>
                    <li className={/[0-9]/.test(formData.password) ? 'valid' : ''}>
                      <i className={`fas ${/[0-9]/.test(formData.password) ? 'fa-check-circle' : 'fa-circle'}`}></i> One number
                    </li>
                    <li className={/[!@#$%^&*(),.?":{}|<>]/.test(formData.password) ? 'valid' : ''}>
                      <i className={`fas ${/[!@#$%^&*(),.?":{}|<>]/.test(formData.password) ? 'fa-check-circle' : 'fa-circle'}`}></i> One special character
                    </li>
                  </ul>
                </div>
              </div>
              <div className="form-group">
                <label><i className="fas fa-shield-alt"></i> Role</label>
                <select name="role" value={formData.role} onChange={handleInputChange} required>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label><i className="fas fa-info-circle"></i> Account Status</label>
                <select name="status" value={formData.status} onChange={handleInputChange} required>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
                <span className="form-hint">Suspended users cannot log in</span>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="btn-save"><i className="fas fa-save"></i> Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════ EDIT RIDER MODAL ═══════ */}
      {showRiderEditModal && (
        <div className="modal-overlay" onClick={handleCloseRiderModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header rider-modal-header">
              <h2><i className="fas fa-motorcycle"></i> Edit Rider</h2>
              <button className="close-btn" onClick={handleCloseRiderModal}><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleRiderSubmit}>
              <div className="form-group">
                <label><i className="fas fa-user"></i> Full Name</label>
                <input type="text" name="fullName" value={riderFormData.fullName} onChange={handleRiderInputChange} placeholder="Full name" required />
              </div>
              <div className="form-group">
                <label><i className="fas fa-envelope"></i> Email</label>
                <input type="email" name="email" value={riderFormData.email} onChange={handleRiderInputChange} placeholder="Email address" required />
              </div>
              <div className="form-group">
                <label><i className="fas fa-phone"></i> Phone Number</label>
                <input type="tel" name="phone" value={riderFormData.phone} onChange={handleRiderInputChange} placeholder="09XXXXXXXXX" maxLength={11} required />
              </div>
              <div className="form-group">
                <label><i className="fas fa-map-marker-alt"></i> Address</label>
                <input type="text" name="address" value={riderFormData.address} onChange={handleRiderInputChange} placeholder="Full address" required />
              </div>
              <div className="form-group">
                <label><i className="fas fa-motorcycle"></i> Vehicle Type</label>
                <select name="vehicleType" value={riderFormData.vehicleType} onChange={handleRiderInputChange} required>
                  <option value="">Select vehicle</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="bicycle">Bicycle</option>
                  <option value="scooter">Scooter</option>
                </select>
              </div>
              <div className="form-group">
                <label><i className="fas fa-id-card"></i> Plate Number</label>
                <input type="text" name="plateNumber" value={riderFormData.plateNumber} onChange={handleRiderInputChange} placeholder="ABC 1234" maxLength={8} required />
              </div>
              <div className="form-group">
                <label><i className="fas fa-address-card"></i> Driver's License</label>
                <input type="text" name="licenseNumber" value={riderFormData.licenseNumber} onChange={handleRiderInputChange} placeholder="N01-23-456789" maxLength={20} required />
              </div>

              {/* Rider Password Field */}
              <div className="form-group">
                <label><i className="fas fa-lock"></i> Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showRiderPassword ? "text" : "password"}
                    name="password"
                    value={riderFormData.password}
                    onChange={handleRiderInputChange}
                    placeholder="@rider + up to 4 chars"
                    maxLength={10}
                    required
                  />
                  <button type="button" className="toggle-password" onClick={() => setShowRiderPassword(!showRiderPassword)}>
                    <i className={`fas ${showRiderPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                <div className="password-requirements rider-pw-req">
                  <p className="requirements-title">Rider password rules:</p>
                  <ul>
                    <li className={riderFormData.password.startsWith('@rider') ? 'valid' : ''}>
                      <i className={`fas ${riderFormData.password.startsWith('@rider') ? 'fa-check-circle' : 'fa-circle'}`}></i>
                      Must start with @rider
                    </li>
                    <li className={riderFormData.password.length >= 7 && riderFormData.password.length <= 10 ? 'valid' : ''}>
                      <i className={`fas ${riderFormData.password.length >= 7 && riderFormData.password.length <= 10 ? 'fa-check-circle' : 'fa-circle'}`}></i>
                      7–10 characters total ({riderFormData.password.length}/10)
                    </li>
                  </ul>
                </div>
              </div>

              {/* Rider Status */}
              <div className="form-group">
                <label><i className="fas fa-info-circle"></i> Application Status</label>
                <select name="status" value={riderFormData.status} onChange={handleRiderInputChange} required>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="suspended">Suspended</option>
                </select>
                <span className="form-hint">Approved riders can access the Rider Dashboard</span>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={handleCloseRiderModal}>Cancel</button>
                <button type="submit" className="btn-save rider-save-btn"><i className="fas fa-save"></i> Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════ SUSPEND CONFIRM ═══════ */}
      {showSuspendConfirm && (
        <div className="modal-overlay" onClick={() => setShowSuspendConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className={`confirm-icon ${(userToSuspend?.status || 'active') === 'active' ? 'suspend' : 'activate'}`}>
              <i className={`fas ${(userToSuspend?.status || 'active') === 'active' ? 'fa-ban' : 'fa-check-circle'}`}></i>
            </div>
            <h2>{(userToSuspend?.status || 'active') === 'active' ? 'Suspend User?' : 'Activate User?'}</h2>
            <p>Are you sure you want to {(userToSuspend?.status || 'active') === 'active' ? 'suspend' : 'activate'} <strong>{userToSuspend?.name}</strong>?</p>
            {(userToSuspend?.status || 'active') === 'active'
              ? <p className="warning-text">Suspended users will not be able to log in.</p>
              : <p className="success-text">This user will be able to log in again.</p>}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowSuspendConfirm(false)}>Cancel</button>
              <button
                className={`${(userToSuspend?.status || 'active') === 'active' ? 'btn-suspend-confirm' : 'btn-activate-confirm'}`}
                onClick={confirmSuspend}
              >
                <i className={`fas ${(userToSuspend?.status || 'active') === 'active' ? 'fa-ban' : 'fa-check-circle'}`}></i>
                {(userToSuspend?.status || 'active') === 'active' ? 'Suspend User' : 'Activate User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ DELETE USER CONFIRM ═══════ */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon suspend">
              <i className="fas fa-trash"></i>
            </div>
            <h2>Delete User?</h2>
            <p>Are you sure you want to permanently delete <strong>{userToDelete?.name}</strong>?</p>
            <p className="warning-text">This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn-suspend-confirm" onClick={confirmDeleteUser}>
                <i className="fas fa-trash"></i> Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ DELETE RIDER CONFIRM ═══════ */}
      {showRiderDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowRiderDeleteConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon suspend">
              <i className="fas fa-trash"></i>
            </div>
            <h2>Delete Rider?</h2>
            <p>Are you sure you want to permanently delete rider <strong>{riderToDelete?.fullName}</strong>?</p>
            <p className="warning-text">This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowRiderDeleteConfirm(false)}>Cancel</button>
              <button className="btn-suspend-confirm" onClick={confirmDeleteRider}>
                <i className="fas fa-trash"></i> Delete Rider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;