// src/admin/AdminUsers.jsx
import React, { useState } from 'react';
import './AdminUsers.css';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

const AdminUsers = () => {
  const [activeTab, setActiveTab] = useState('users');

  // ─── CONVEX DATA ───
  const users = useQuery(api.users.getAllUsers) ?? [];
  const riders = useQuery(api.riders.getAllRiders) ?? [];

  const updateUserProfileMutation = useMutation(api.users.updateUserProfile);
  const deleteUserMutation = useMutation(api.users.deleteUser);
  const updateRiderMutation = useMutation(api.riders.updateRider);
  const deleteRiderMutation = useMutation(api.riders.deleteRider);
  const updateRiderStatusMutation = useMutation(api.riders.updateRiderStatus);

  // ─── USERS STATE ───
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ name: '', username: '', email: '', password: '', role: 'user', status: 'active' });
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  const [userToSuspend, setUserToSuspend] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // ─── RIDERS STATE ───
  const [riderSearch, setRiderSearch] = useState('');
  const [riderFilterStatus, setRiderFilterStatus] = useState('all');
  const [editingRider, setEditingRider] = useState(null);
  const [riderFormData, setRiderFormData] = useState({ fullName: '', email: '', phone: '', vehicleType: '', status: 'pending' });
  const [showRiderEditModal, setShowRiderEditModal] = useState(false);
  const [showRiderDeleteConfirm, setShowRiderDeleteConfirm] = useState(false);
  const [riderToDelete, setRiderToDelete] = useState(null);

  const [notification, setNotification] = useState({ show: false, message: '', type: '' });

  const showNotification = (message, type) => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
  };

  // ─── FILTERED DATA ───
  const filteredUsers = users.filter(u => {
    if (filterStatus !== 'all' && (u.status || 'active') !== filterStatus) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q);
  });

  const filteredRiders = riders.filter(r => {
    if (riderFilterStatus !== 'all' && r.status !== riderFilterStatus) return false;
    if (!riderSearch.trim()) return true;
    const q = riderSearch.toLowerCase();
    return r.fullName?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) ||
      r.phone?.includes(riderSearch) || r.vehicleType?.toLowerCase().includes(q);
  });

  // ─── PASSWORD VALIDATION ───
  const validatePassword = (pw) => {
    const errors = [];
    if (pw.length < 8) errors.push('At least 8 characters');
    if (!/[A-Z]/.test(pw)) errors.push('One uppercase letter');
    if (!/[a-z]/.test(pw)) errors.push('One lowercase letter');
    if (!/[0-9]/.test(pw)) errors.push('One number');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pw)) errors.push('One special character');
    return errors;
  };

  const passwordErrors = validatePassword(formData.password);

  // ─── USER ACTIONS ───
  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({ name: user.name, username: user.username, email: user.email, password: user.password, role: user.role, status: user.status || 'active' });
    setShowPassword(false);
    setShowEditModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validatePassword(formData.password).length > 0) { showNotification('Please meet all password requirements', 'error'); return; }
    try {
      await updateUserProfileMutation({ id: editingUser._id, ...formData });
      // Update session if editing self
      const auth = JSON.parse(localStorage.getItem('authUser'));
      if (auth && auth._id === editingUser._id) {
        localStorage.setItem('authUser', JSON.stringify({ ...auth, ...formData }));
      }
      setShowEditModal(false);
      showNotification('User updated successfully', 'success');
    } catch {
      showNotification('Failed to update user', 'error');
    }
  };

  const confirmSuspend = async () => {
    if (!userToSuspend) return;
    const newStatus = (userToSuspend.status || 'active') === 'active' ? 'suspended' : 'active';
    try {
      await updateUserProfileMutation({ id: userToSuspend._id, status: newStatus });
      if (newStatus === 'suspended') {
        const auth = JSON.parse(localStorage.getItem('authUser'));
        if (auth && auth._id === userToSuspend._id) { localStorage.removeItem('authUser'); window.location.href = '/'; }
      }
      showNotification(`User ${newStatus === 'suspended' ? 'suspended' : 'activated'} successfully`, 'success');
    } catch { showNotification('Failed to update user', 'error'); }
    setShowSuspendConfirm(false);
    setUserToSuspend(null);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteUserMutation({ id: userToDelete._id });
      showNotification('User deleted successfully', 'success');
    } catch { showNotification('Failed to delete user', 'error'); }
    setShowDeleteConfirm(false);
    setUserToDelete(null);
  };

  // ─── RIDER ACTIONS ───
  const handleEditRider = (rider) => {
    setEditingRider(rider);
    setRiderFormData({ fullName: rider.fullName, email: rider.email, phone: rider.phone, vehicleType: rider.vehicleType || '', status: rider.status });
    setShowRiderEditModal(true);
  };

  const handleRiderSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateRiderMutation({ id: editingRider._id, ...riderFormData });
      setShowRiderEditModal(false);
      showNotification('Rider updated successfully', 'success');
    } catch { showNotification('Failed to update rider', 'error'); }
  };

  const confirmDeleteRider = async () => {
    if (!riderToDelete) return;
    try {
      await deleteRiderMutation({ id: riderToDelete._id });
      showNotification('Rider deleted successfully', 'success');
    } catch { showNotification('Failed to delete rider', 'error'); }
    setShowRiderDeleteConfirm(false);
    setRiderToDelete(null);
  };

  // ─── HELPERS ───
  const getRoleBadgeClass = (role) => role === 'admin' ? 'role-badge admin' : 'role-badge user';
  const getStatusBadgeClass = (status) => `status-badge ${status || 'active'}`;
  const getRiderStatusBadgeClass = (status) => {
    const map = { pending: 'rider-status-badge pending', approved: 'rider-status-badge approved', rejected: 'rider-status-badge rejected', suspended: 'rider-status-badge suspended' };
    return map[status] || 'rider-status-badge pending';
  };
  const formatDate = (ts) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Stats
  const totalUsers = users.length;
  const activeUsers = users.filter(u => (u.status || 'active') === 'active').length;
  const suspendedUsers = users.filter(u => u.status === 'suspended').length;
  const totalRiders = riders.length;
  const approvedRiders = riders.filter(r => r.status === 'approved').length;
  const pendingRiders = riders.filter(r => r.status === 'pending').length;

  return (
    <div className="admin-users">
      {notification.show && (
        <div className={`notification ${notification.type}`}>
          <i className={`fas ${notification.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="users-header">
        <div className="header-left">
          <h1><i className="fas fa-users"></i> User Management</h1>
          <p className="subtitle">Manage user accounts and rider registrations</p>
        </div>
        <div className="users-stats">
          {activeTab === 'users' ? (
            <>
              <div className="stat-card"><i className="fas fa-users"></i><div><div className="stat-number">{totalUsers}</div><div className="stat-label">Total Users</div></div></div>
              <div className="stat-card"><i className="fas fa-check-circle"></i><div><div className="stat-number">{activeUsers}</div><div className="stat-label">Active</div></div></div>
              <div className="stat-card"><i className="fas fa-ban"></i><div><div className="stat-number">{suspendedUsers}</div><div className="stat-label">Suspended</div></div></div>
            </>
          ) : (
            <>
              <div className="stat-card rider-stat"><i className="fas fa-motorcycle"></i><div><div className="stat-number">{totalRiders}</div><div className="stat-label">Total Riders</div></div></div>
              <div className="stat-card rider-stat"><i className="fas fa-check-circle"></i><div><div className="stat-number">{approvedRiders}</div><div className="stat-label">Approved</div></div></div>
              <div className="stat-card rider-stat"><i className="fas fa-clock"></i><div><div className="stat-number">{pendingRiders}</div><div className="stat-label">Pending</div></div></div>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-switcher">
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          <i className="fas fa-user"></i> Users <span className="tab-count">{totalUsers}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'riders' ? 'active' : ''}`} onClick={() => setActiveTab('riders')}>
          <i className="fas fa-motorcycle"></i> Riders <span className="tab-count">{totalRiders}</span>
          {pendingRiders > 0 && <span className="tab-badge">{pendingRiders}</span>}
        </button>
      </div>

      {/* ═══════ USERS TAB ═══════ */}
      {activeTab === 'users' && (
        <>
          <div className="users-controls">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="Search by name, username, email, or role..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              {searchTerm && <button className="clear-search" onClick={() => setSearchTerm('')}><i className="fas fa-times"></i></button>}
            </div>
            <div className="status-filter">
              {['all', 'active', 'suspended'].map(s => (
                <button key={s} className={`filter-btn ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="users-table-container">
            {filteredUsers.length === 0 ? (
              <div className="no-users"><i className="fas fa-user-slash"></i><p>No users found</p></div>
            ) : (
              <table className="users-table">
                <thead>
                  <tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user._id}>
                      <td className="user-name"><i className="fas fa-user-circle"></i>{user.name}</td>
                      <td>@{user.username}</td>
                      <td>{user.email}</td>
                      <td><span className={getRoleBadgeClass(user.role)}><i className={`fas ${user.role === 'admin' ? 'fa-shield-alt' : 'fa-user'}`}></i>{user.role}</span></td>
                      <td>
                        <span className={getStatusBadgeClass(user.status)}>
                          <i className={`fas ${(user.status || 'active') === 'active' ? 'fa-check-circle' : 'fa-ban'}`}></i>
                          {(user.status || 'active') === 'active' ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <button className="btn-edit" onClick={() => handleEdit(user)} title="Edit"><i className="fas fa-edit"></i></button>
                        {user.email !== 'admin' && (
                          <>
                            <button className={`btn-suspend ${(user.status || 'active') === 'suspended' ? 'btn-activate' : ''}`}
                              onClick={() => { setUserToSuspend(user); setShowSuspendConfirm(true); }}
                              title={(user.status || 'active') === 'active' ? 'Suspend' : 'Activate'}>
                              <i className={`fas ${(user.status || 'active') === 'active' ? 'fa-ban' : 'fa-check-circle'}`}></i>
                            </button>
                            <button className="btn-delete" onClick={() => { setUserToDelete(user); setShowDeleteConfirm(true); }} title="Delete">
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
              <input type="text" placeholder="Search by name, email, phone, vehicle..."
                value={riderSearch} onChange={(e) => setRiderSearch(e.target.value)} />
              {riderSearch && <button className="clear-search" onClick={() => setRiderSearch('')}><i className="fas fa-times"></i></button>}
            </div>
            <div className="status-filter">
              {['all', 'pending', 'approved', 'rejected', 'suspended'].map(s => (
                <button key={s} className={`filter-btn ${riderFilterStatus === s ? 'active' : ''}`} onClick={() => setRiderFilterStatus(s)}>
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
                  <tr><th>Full Name</th><th>Email</th><th>Phone</th><th>Vehicle</th><th>Status</th><th>Applied</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {filteredRiders.map(rider => (
                    <tr key={rider._id}>
                      <td className="user-name"><i className="fas fa-motorcycle" style={{ color: '#7c3aed' }}></i>{rider.fullName}</td>
                      <td>{rider.email}</td>
                      <td>{rider.phone}</td>
                      <td style={{ textTransform: 'capitalize' }}>{rider.vehicleType}</td>
                      <td>
                        <span className={getRiderStatusBadgeClass(rider.status)}>
                          {rider.status === 'approved' && <i className="fas fa-check-circle"></i>}
                          {rider.status === 'pending' && <i className="fas fa-clock"></i>}
                          {rider.status === 'rejected' && <i className="fas fa-times-circle"></i>}
                          {rider.status === 'suspended' && <i className="fas fa-ban"></i>}
                          {rider.status}
                        </span>
                      </td>
                      <td className="date-cell">{formatDate(rider.appliedAt)}</td>
                      <td className="actions-cell">
                        <button className="btn-edit" onClick={() => handleEditRider(rider)} title="Edit"><i className="fas fa-edit"></i></button>
                        <button className="btn-delete" onClick={() => { setRiderToDelete(rider); setShowRiderDeleteConfirm(true); }} title="Delete"><i className="fas fa-trash"></i></button>
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
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-user-edit"></i> Edit User</h2>
              <button className="close-btn" onClick={() => setShowEditModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleSubmit}>
              {['name', 'username', 'email'].map(field => (
                <div className="form-group" key={field}>
                  <label><i className={`fas fa-${field === 'name' ? 'user' : field === 'username' ? 'at' : 'envelope'}`}></i> {field.charAt(0).toUpperCase() + field.slice(1)}</label>
                  <input type={field === 'email' ? 'email' : 'text'} name={field} value={formData[field]}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))} required />
                </div>
              ))}
              <div className="form-group">
                <label><i className="fas fa-lock"></i> Password</label>
                <div className="password-input-wrapper">
                  <input type={showPassword ? "text" : "password"} value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))} required />
                  <button type="button" className="toggle-password" onClick={() => setShowPassword(!showPassword)}>
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                <div className="password-requirements">
                  <p className="requirements-title">Password must contain:</p>
                  <ul>
                    {[
                      [formData.password.length >= 8, 'At least 8 characters'],
                      [/[A-Z]/.test(formData.password), 'One uppercase letter'],
                      [/[a-z]/.test(formData.password), 'One lowercase letter'],
                      [/[0-9]/.test(formData.password), 'One number'],
                      [/[!@#$%^&*(),.?":{}|<>]/.test(formData.password), 'One special character'],
                    ].map(([valid, label]) => (
                      <li key={label} className={valid ? 'valid' : ''}>
                        <i className={`fas ${valid ? 'fa-check-circle' : 'fa-circle'}`}></i> {label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="form-group">
                <label><i className="fas fa-shield-alt"></i> Role</label>
                <select value={formData.role} onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label><i className="fas fa-info-circle"></i> Account Status</label>
                <select value={formData.status} onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn-save"><i className="fas fa-save"></i> Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════ EDIT RIDER MODAL ═══════ */}
      {showRiderEditModal && (
        <div className="modal-overlay" onClick={() => setShowRiderEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header rider-modal-header">
              <h2><i className="fas fa-motorcycle"></i> Edit Rider</h2>
              <button className="close-btn" onClick={() => setShowRiderEditModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleRiderSubmit}>
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" value={riderFormData.fullName} onChange={(e) => setRiderFormData(p => ({ ...p, fullName: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={riderFormData.email} onChange={(e) => setRiderFormData(p => ({ ...p, email: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input type="tel" value={riderFormData.phone} onChange={(e) => setRiderFormData(p => ({ ...p, phone: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Vehicle Type</label>
                <select value={riderFormData.vehicleType} onChange={(e) => setRiderFormData(p => ({ ...p, vehicleType: e.target.value }))}>
                  <option value="">Select vehicle</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="bicycle">Bicycle</option>
                  <option value="scooter">Scooter</option>
                </select>
              </div>
              <div className="form-group">
                <label>Application Status</label>
                <select value={riderFormData.status} onChange={(e) => setRiderFormData(p => ({ ...p, status: e.target.value }))}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="suspended">Suspended</option>
                </select>
                <span className="form-hint">Approved riders can access the Rider Dashboard</span>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowRiderEditModal(false)}>Cancel</button>
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
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowSuspendConfirm(false)}>Cancel</button>
              <button className={`${(userToSuspend?.status || 'active') === 'active' ? 'btn-suspend-confirm' : 'btn-activate-confirm'}`} onClick={confirmSuspend}>
                {(userToSuspend?.status || 'active') === 'active' ? 'Suspend' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ DELETE USER CONFIRM ═══════ */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon suspend"><i className="fas fa-trash"></i></div>
            <h2>Delete User?</h2>
            <p>Permanently delete <strong>{userToDelete?.name}</strong>?</p>
            <p className="warning-text">This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn-suspend-confirm" onClick={confirmDeleteUser}><i className="fas fa-trash"></i> Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ DELETE RIDER CONFIRM ═══════ */}
      {showRiderDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowRiderDeleteConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon suspend"><i className="fas fa-trash"></i></div>
            <h2>Delete Rider?</h2>
            <p>Permanently delete rider <strong>{riderToDelete?.fullName}</strong>?</p>
            <p className="warning-text">This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowRiderDeleteConfirm(false)}>Cancel</button>
              <button className="btn-suspend-confirm" onClick={confirmDeleteRider}><i className="fas fa-trash"></i> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;