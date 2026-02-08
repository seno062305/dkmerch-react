import React, { useState, useEffect } from 'react';
import './AdminUsers.css';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'user',
    status: 'active' // Added status field
  });
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  const [userToSuspend, setUserToSuspend] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all'); // all, active, suspended

  // Load users from localStorage
  useEffect(() => {
    loadUsers();
  }, []);

  // Filter users based on search term and status
  useEffect(() => {
    let filtered = users;

    // Filter by status
    if (filterStatus === 'active') {
      filtered = filtered.filter(user => user.status === 'active');
    } else if (filterStatus === 'suspended') {
      filtered = filtered.filter(user => user.status === 'suspended');
    }

    // Filter by search term
    if (searchTerm.trim() !== '') {
      filtered = filtered.filter(user => 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.role.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredUsers(filtered);
  }, [searchTerm, users, filterStatus]);

  const loadUsers = () => {
    const storedUsers = JSON.parse(localStorage.getItem('users')) || [];
    // Add status field to existing users if not present
    const usersWithStatus = storedUsers.map(user => ({
      ...user,
      status: user.status || 'active'
    }));
    setUsers(usersWithStatus);
    setFilteredUsers(usersWithStatus);
  };

  const validatePassword = (password) => {
    const errors = [];
    
    if (password.length < 8) {
      errors.push('At least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('One uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('One lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('One number');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('One special character');
    }
    
    return errors;
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      username: user.username,
      email: user.email,
      password: user.password,
      role: user.role,
      status: user.status || 'active'
    });
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

  const handleSuspend = (user) => {
    setUserToSuspend(user);
    setShowSuspendConfirm(true);
  };

  const confirmSuspend = () => {
    if (userToSuspend) {
      const newStatus = userToSuspend.status === 'active' ? 'suspended' : 'active';
      const updatedUsers = users.map(u => 
        u.id === userToSuspend.id 
          ? { ...u, status: newStatus }
          : u
      );
      localStorage.setItem('users', JSON.stringify(updatedUsers));
      
      // If suspending currently logged in user, log them out
      if (newStatus === 'suspended') {
        const authUser = JSON.parse(localStorage.getItem('authUser'));
        if (authUser && authUser.id === userToSuspend.id) {
          localStorage.removeItem('authUser');
          window.location.href = '/';
        }
      }
      
      loadUsers();
      showNotification(
        `User ${newStatus === 'suspended' ? 'suspended' : 'activated'} successfully`, 
        'success'
      );
    }
    setShowSuspendConfirm(false);
    setUserToSuspend(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      showNotification('Name is required', 'error');
      return;
    }
    if (!formData.username.trim()) {
      showNotification('Username is required', 'error');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      showNotification('Valid email is required', 'error');
      return;
    }
    if (!formData.password.trim()) {
      showNotification('Password is required', 'error');
      return;
    }

    // Password validation
    const passwordValidationErrors = validatePassword(formData.password);
    if (passwordValidationErrors.length > 0) {
      showNotification('Please meet all password requirements', 'error');
      return;
    }

    // Check for duplicate username (excluding current user)
    const duplicateUsername = users.find(u => 
      u.username === formData.username && u.id !== editingUser.id
    );
    if (duplicateUsername) {
      showNotification('Username already taken', 'error');
      return;
    }

    // Check for duplicate email (excluding current user)
    const duplicateEmail = users.find(u => 
      u.email === formData.email && u.id !== editingUser.id
    );
    if (duplicateEmail) {
      showNotification('Email already exists', 'error');
      return;
    }

    // Update user
    const updatedUsers = users.map(u => 
      u.id === editingUser.id 
        ? { ...u, ...formData }
        : u
    );

    localStorage.setItem('users', JSON.stringify(updatedUsers));
    
    // Update authUser if editing current user
    const authUser = JSON.parse(localStorage.getItem('authUser'));
    if (authUser && authUser.id === editingUser.id) {
      const updatedAuthUser = { ...authUser, ...formData };
      localStorage.setItem('authUser', JSON.stringify(updatedAuthUser));
    }

    loadUsers();
    setShowEditModal(false);
    setEditingUser(null);
    setPasswordErrors([]);
    showNotification('User updated successfully', 'success');
  };

  const showNotification = (message, type) => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: '' });
    }, 3000);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Validate password in real-time
    if (name === 'password') {
      const errors = validatePassword(value);
      setPasswordErrors(errors);
    }
  };

  const getRoleBadgeClass = (role) => {
    return role === 'admin' ? 'role-badge admin' : 'role-badge user';
  };

  const getStatusBadgeClass = (status) => {
    return `status-badge ${status}`;
  };

  const formatDate = (id) => {
    if (id === 0) return 'Built-in Admin';
    const date = new Date(id);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Calculate stats
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === 'active').length;
  const suspendedUsers = users.filter(u => u.status === 'suspended').length;

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
          <p className="subtitle">Manage user accounts and permissions</p>
        </div>

        {/* Stats Cards */}
        <div className="users-stats">
          <div className="stat-card">
            <i className="fas fa-users"></i>
            <div>
              <div className="stat-number">{totalUsers}</div>
              <div className="stat-label">Total Users</div>
            </div>
          </div>
          <div className="stat-card">
            <i className="fas fa-check-circle"></i>
            <div>
              <div className="stat-number">{activeUsers}</div>
              <div className="stat-label">Active Users</div>
            </div>
          </div>
          <div className="stat-card">
            <i className="fas fa-ban"></i>
            <div>
              <div className="stat-number">{suspendedUsers}</div>
              <div className="stat-label">Suspended Users</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
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

        {/* Status Filter */}
        <div className="status-filter">
          <button 
            className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            <i className="fas fa-list"></i> All
          </button>
          <button 
            className={`filter-btn ${filterStatus === 'active' ? 'active' : ''}`}
            onClick={() => setFilterStatus('active')}
          >
            <i className="fas fa-check-circle"></i> Active
          </button>
          <button 
            className={`filter-btn ${filterStatus === 'suspended' ? 'active' : ''}`}
            onClick={() => setFilterStatus('suspended')}
          >
            <i className="fas fa-ban"></i> Suspended
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="users-table-container">
        {filteredUsers.length === 0 ? (
          <div className="no-users">
            <i className="fas fa-user-slash"></i>
            <p>No users found</p>
          </div>
        ) : (
          <table className="users-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>#{user.id === 0 ? 'ADMIN' : user.id}</td>
                  <td className="user-name">
                    <i className="fas fa-user-circle"></i>
                    {user.name}
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
                    <button 
                      className="btn-edit"
                      onClick={() => handleEdit(user)}
                      title="Edit User"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    {user.id !== 0 && (
                      <button 
                        className={`btn-suspend ${(user.status || 'active') === 'suspended' ? 'btn-activate' : ''}`}
                        onClick={() => handleSuspend(user)}
                        title={(user.status || 'active') === 'active' ? 'Suspend User' : 'Activate User'}
                      >
                        <i className={`fas ${(user.status || 'active') === 'active' ? 'fa-ban' : 'fa-check-circle'}`}></i>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-user-edit"></i> Edit User</h2>
              <button className="close-btn" onClick={handleCloseModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label><i className="fas fa-user"></i> Full Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Enter full name"
                  required
                />
              </div>
              <div className="form-group">
                <label><i className="fas fa-at"></i> Username</label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="Enter username"
                  required
                />
              </div>
              <div className="form-group">
                <label><i className="fas fa-envelope"></i> Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Enter email address"
                  required
                />
              </div>
              <div className="form-group">
                <label><i className="fas fa-lock"></i> Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Enter password"
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                
                {/* Password Requirements */}
                <div className="password-requirements">
                  <p className="requirements-title">Password must contain:</p>
                  <ul>
                    <li className={formData.password.length >= 8 ? 'valid' : ''}>
                      <i className={`fas ${formData.password.length >= 8 ? 'fa-check-circle' : 'fa-circle'}`}></i>
                      At least 8 characters
                    </li>
                    <li className={/[A-Z]/.test(formData.password) ? 'valid' : ''}>
                      <i className={`fas ${/[A-Z]/.test(formData.password) ? 'fa-check-circle' : 'fa-circle'}`}></i>
                      One uppercase letter
                    </li>
                    <li className={/[a-z]/.test(formData.password) ? 'valid' : ''}>
                      <i className={`fas ${/[a-z]/.test(formData.password) ? 'fa-check-circle' : 'fa-circle'}`}></i>
                      One lowercase letter
                    </li>
                    <li className={/[0-9]/.test(formData.password) ? 'valid' : ''}>
                      <i className={`fas ${/[0-9]/.test(formData.password) ? 'fa-check-circle' : 'fa-circle'}`}></i>
                      One number
                    </li>
                    <li className={/[!@#$%^&*(),.?":{}|<>]/.test(formData.password) ? 'valid' : ''}>
                      <i className={`fas ${/[!@#$%^&*(),.?":{}|<>]/.test(formData.password) ? 'fa-check-circle' : 'fa-circle'}`}></i>
                      One special character (!@#$%^&*)
                    </li>
                  </ul>
                </div>
              </div>
              <div className="form-group">
                <label><i className="fas fa-shield-alt"></i> Role</label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  required
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label><i className="fas fa-info-circle"></i> Account Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  required
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
                <span className="form-hint">Suspended users cannot log in</span>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-save">
                  <i className="fas fa-save"></i> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Suspend/Activate Confirmation Modal */}
      {showSuspendConfirm && (
        <div className="modal-overlay" onClick={() => setShowSuspendConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className={`confirm-icon ${(userToSuspend?.status || 'active') === 'active' ? 'suspend' : 'activate'}`}>
              <i className={`fas ${(userToSuspend?.status || 'active') === 'active' ? 'fa-ban' : 'fa-check-circle'}`}></i>
            </div>
            <h2>{(userToSuspend?.status || 'active') === 'active' ? 'Suspend User?' : 'Activate User?'}</h2>
            <p>
              Are you sure you want to {(userToSuspend?.status || 'active') === 'active' ? 'suspend' : 'activate'} <strong>{userToSuspend?.name}</strong>?
            </p>
            {(userToSuspend?.status || 'active') === 'active' ? (
              <p className="warning-text">Suspended users will not be able to log in.</p>
            ) : (
              <p className="success-text">This user will be able to log in again.</p>
            )}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowSuspendConfirm(false)}>
                Cancel
              </button>
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
    </div>
  );
};

export default AdminUsers;