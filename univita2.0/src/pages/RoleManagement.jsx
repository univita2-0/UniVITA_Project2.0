import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Users, Search, ShieldCheck, UserCheck, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import './RoleManagement.css';
import { API_BASE } from '../api';
import { getUserRole, decodeJwtPayload } from '../permissions';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const RoleManagement = () => {
  const currentUserRole = getUserRole();
  const isAdmin = currentUserRole === 'admin';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  
  const currentUserId = useMemo(() => {
    try {
      const signedId = decodeJwtPayload(localStorage.getItem('auth_token'))?.id;
      if (signedId !== undefined && signedId !== null) return signedId;
      const idStr = localStorage.getItem('user_id');
      if (idStr) return parseInt(idStr, 10);
      
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        if (parsed && parsed.id) return parsed.id;
      }
      return 0;
    } catch (e) {
      console.warn("Failed to parse user ID from localStorage", e);
      return 0;
    }
  }, []);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/employees`, getAuthHeaders());
      const activeUsers = (Array.isArray(res.data) ? res.data : []).filter(user => user.status === 'active');
      setUsers(activeUsers);
    } catch (err) {
      console.error('Failed to fetch users', err);
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!isAdmin) {
      toast.error('Only System Administrators can change user roles.');
      return;
    }
    if (String(userId) === String(currentUserId)) {
      toast.error('You cannot change your own role.');
      return;
    }

    const target = users.find(u => String(u.id) === String(userId));
    if (!target || target.role === newRole) return;
    if (!window.confirm(`Reassign ${target.full_name} from ${target.role} to ${newRole}? This changes access to the web and mobile applications.`)) return;
    setUpdating(userId);

    try {
      const res = await axios.put(`${API_BASE}/users/${userId}/role`, { role: newRole }, getAuthHeaders());

      if (res.data.success || res.status === 200) {
        setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
        toast.success(`Role updated for ${users.find(u => u.id === userId)?.full_name}`);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Role update failed.';
      toast.error(errorMsg);
      setUsers([...users]); // Revert on failure
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

  const totalUsers = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / rowsPerPage));
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
    <div className="expert-container uv-admin-roles">
      <div className="expert-header">
        <div className="expert-title-group">
          <div>
            
            <p className="expert-subtitle">Assign and manage access control levels across system modules.</p>
          </div>
        </div>
      </div>

      {!isAdmin && (
        <div className="rm-readonly-banner">
          <ShieldAlert size={16} />
          <span>Read-only view. Role assignments are restricted to System Administrators.</span>
        </div>
      )}

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

      <div className="expert-card">
        <div className="uv-admin-section-heading"><span>Account directory</span><span>{totalUsers} matching accounts</span></div>
        <div className="expert-search-card">
          <div className="rm-filters">
            <div className="rm-search-group">
              <Search size={18} className="text-muted" />
              <input
                type="text"
                placeholder="Search by name, ID, or email..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="expert-clean-input"
              />
            </div>

            <div className="rm-filter-group">
              <select
                className="rm-select-filter"
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
                    <Users size={48} className="text-muted" />
                    <p>No users found matching your criteria.</p>
                    <span>Try broadening your search or filter settings.</span>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map(user => (
                  <tr key={user.id}>
                    <td className="font-mono text-muted">{user.employee_id}</td>
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
                          disabled={updating === user.id || String(user.id) === String(currentUserId) || !isAdmin}
                          className="rm-select"
                          title={String(user.id) === String(currentUserId) ? "You cannot change your own role" : ""}
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