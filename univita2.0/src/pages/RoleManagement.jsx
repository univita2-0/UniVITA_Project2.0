// src/pages/RoleManagement.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Users, Shield, Search } from 'lucide-react';
import './RoleManagement.css';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const RoleManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const currentUserId = parseInt(localStorage.getItem('user_id') || '0');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/employees`, getAuthHeaders());
      setUsers(res.data);
    } catch (err) {
      console.error('Failed to fetch users', err);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (userId === currentUserId) {
      toast.error('You cannot change your own role.');
      return;
    }
    setUpdating(userId);
    try {
      await axios.put(`${API_BASE}/users/${userId}/role`, { role: newRole }, getAuthHeaders());
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast.success(`Role updated for ${users.find(u => u.id === userId)?.full_name}`);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Update failed.';
      toast.error(errorMsg);
    } finally {
      setUpdating(null);
    }
  };

  const getRoleBadgeClass = (role) => {
    const classes = {
      admin: 'rm-badge-admin',
      hr_admin: 'rm-badge-hr',
      security: 'rm-badge-security',
      instructor: 'rm-badge-instructor'
    };
    return classes[role] || 'rm-badge-default';
  };

  // Filter users based on search term
  const filteredUsers = users.filter(user => 
    (user.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.employee_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="rm-loading-state">Loading users...</div>;

  return (
    <div className="rm-container">
      <div className="rm-header">
        <div>
          <h2 className="rm-title">Role Management</h2>
          <p className="rm-subtitle">Assign and manage system roles and permissions for all users.</p>
        </div>
        <div className="rm-header-icon">
          <Shield size={24} color="#6B7280" />
        </div>
      </div>

      <div className="rm-card">
        {/* Search Bar Toolbar */}
        <div className="rm-card-toolbar">
          <div className="rm-search-wrapper">
            <Search size={16} className="rm-search-icon" />
            <input 
              type="text" 
              placeholder="Search by name, ID, or email..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="rm-input-search"
            />
          </div>
        </div>

        <div className="rm-table-wrapper">
          <table className="rm-table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>User Details</th>
                <th>Current Role</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr className="rm-empty-row">
                  <td colSpan="4">No users found matching "{searchTerm}".</td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td className="rm-emp-id">{user.employee_id}</td>
                    <td>
                      <div className="rm-emp-name">{user.full_name}</div>
                      <div className="rm-emp-email">{user.email}</div>
                    </td>
                    <td>
                      <span className={`rm-badge ${getRoleBadgeClass(user.role)}`}>
                        {user.role === 'hr_admin' ? 'HR' : user.role}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="rm-select-wrapper">
                        <select
                          value={user.role}
                          onChange={e => handleRoleChange(user.id, e.target.value)}
                          disabled={updating === user.id || user.id === currentUserId}
                          className="rm-select"
                        >
                          <option value="admin">Admin</option>
                          <option value="hr_admin">HR</option>
                          <option value="security">Security</option>
                          <option value="instructor">Instructor</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RoleManagement;