// src/pages/RoleManagement.jsx
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Users, Shield, Search, Filter, ShieldCheck, UserCheck, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [roleFilter, setRoleFilter] = useState('');
  const currentUserId = parseInt(localStorage.getItem('user_id') || '0');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

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

  // Filter users based on search term and role filter
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = 
        (user.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.employee_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.email || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesRole = roleFilter ? user.role === roleFilter : true;

      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, roleFilter]);

  // Pagination Calculations
  const totalUsers = filteredUsers.length;
  const totalPages = Math.ceil(totalUsers / rowsPerPage);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredUsers.slice(start, start + rowsPerPage);
  }, [filteredUsers, currentPage, rowsPerPage]);

  const roleCounts = useMemo(() => {
    return {
      total: users.length,
      admin: users.filter(u => u.role === 'admin').length,
      hr: users.filter(u => u.role === 'hr_admin').length,
      security: users.filter(u => u.role === 'security').length,
      instructor: users.filter(u => u.role === 'instructor').length,
    };
  }, [users]);

  if (loading) return <div className="expert-loading">Loading users and access privileges...</div>;

  return (
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
          
          <div>
            
            <p className="expert-subtitle">Assign and manage access control levels across system modules.</p>
          </div>
        </div>
      </div>

      {/* Stats Summary Row */}
      <div className="rep-stats-row">
        <div className="rep-stat-box">
          <div className="rep-stat-icon"><Users size={20} /></div>
          <div className="rep-stat-info">
            <div className="rep-stat-label">Total Accounts</div>
            <div className="rep-stat-value">{roleCounts.total}</div>
          </div>
        </div>
        <div className="rep-stat-box">
          <div className="rep-stat-icon"><ShieldCheck size={20} /></div>
          <div className="rep-stat-info">
            <div className="rep-stat-label">Admins & HR</div>
            <div className="rep-stat-value">{roleCounts.admin + roleCounts.hr}</div>
          </div>
        </div>
        <div className="rep-stat-box">
          <div className="rep-stat-icon"><UserCheck size={20} /></div>
          <div className="rep-stat-info">
            <div className="rep-stat-label">Instructors</div>
            <div className="rep-stat-value">{roleCounts.instructor}</div>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="expert-card">
        {/* Toolbar & Search */}
        <div className="expert-search-card" style={{ margin: 0, border: 'none', borderBottom: '1px solid #E2E8F0', borderRadius: 0 }}>
          <div className="al-filters-wrapper">
            <div className="al-filter-group search">
              <label>Search Users</label>
              <div className="expert-search-input-group" style={{ height: '42px', margin: 0 }}>
                <Search size={16} className="text-muted" />
                <input 
                  type="text" 
                  placeholder="Search by name, ID, or email..." 
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="expert-clean-input"
                />
              </div>
            </div>

            <div className="al-filter-group action">
              <label>Filter by Role</label>
              <select 
                className="expert-clean-input border" 
                style={{ padding: '0.5rem 2.5rem 0.5rem 0.75rem', height: '42px' }} 
                value={roleFilter} 
                onChange={e => { setRoleFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="">All Roles</option>
                <option value="admin">Admin</option>
                <option value="hr_admin">HR</option>
                <option value="security">Security</option>
                <option value="instructor">Instructor</option>
              </select>
            </div>
          </div>
        </div>

        <div className="expert-table-wrapper">
          <table className="expert-table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>User Details</th>
                <th>Current Role</th>
                <th className="text-right">Access Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan="4" className="expert-empty">
                    <Users size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
                    <p>No users found matching your criteria.</p>
                    <span>Try broadening your search or filter settings.</span>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map(user => (
                  <tr key={user.id}>
                    <td className="font-mono text-muted">{user.employee_id}</td>
                    <td>
                      <div className="rm-emp-name text-dark font-semibold">{user.full_name}</div>
                      <div className="rm-emp-email text-muted">{user.email}</div>
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

        {/* Pagination Bar */}
        {totalUsers > 0 && (
          <div className="expert-pagination">
            <div className="al-rows-selector">
              <span className="expert-page-info">Rows per page:</span>
              <select 
                className="al-select-small" 
                value={rowsPerPage} 
                onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="expert-page-controls">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                disabled={currentPage === 1} 
                className="expert-page-btn"
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="expert-page-current">{currentPage} / {totalPages || 1}</span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                disabled={currentPage === totalPages} 
                className="expert-page-btn"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoleManagement;