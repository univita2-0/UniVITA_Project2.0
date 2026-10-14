// src/pages/LeaveBalancesManagement.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { RefreshCw, Edit3, Save, X, AlertCircle, Search, ChevronLeft, ChevronRight, Plus, Calendar } from 'lucide-react';
import { API_BASE } from '../api';
import './LeaveBalancesManagement.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const LeaveBalancesManagement = () => {
  const [employees, setEmployees] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [allLeaveTypes, setAllLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeSubTab, setActiveSubTab] = useState('balances'); // 'balances' or 'types'

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [showAddTypeModal, setShowAddTypeModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [balances, setBalances] = useState([]);
  const [editingBalance, setEditingBalance] = useState(null);
  const [tempValue, setTempValue] = useState('');
  
  // New Leave Type Form State
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeQuota, setNewTypeQuota] = useState('15');
  const [saving, setSaving] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const modalYearRef = useRef(selectedYear);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedYear]);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/employees`, getAuthHeaders());
      const instructors = res.data.filter(emp => emp.role === 'instructor' && emp.status === 'active');
      setEmployees(instructors);
    } catch (err) {
      console.error('Failed to load employees:', err);
      toast.error(err.response?.data?.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLeaveTypes = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/leave-types`, getAuthHeaders());
      setLeaveTypes(res.data);
      
      const adminRes = await axios.get(`${API_BASE}/admin/leave-types`, getAuthHeaders());
      setAllLeaveTypes(adminRes.data);
    } catch (err) {
      console.error('Failed to load leave types:', err);
      toast.error(err.response?.data?.message || 'Failed to load leave types');
    }
  }, []);

  useEffect(() => {
    loadEmployees();
    loadLeaveTypes();
  }, [loadEmployees, loadLeaveTypes]);

  const fetchBalances = async (userId, year) => {
    if (!leaveTypes.length) return [];
    setModalLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/leave-balances/${userId}?year=${year}`, getAuthHeaders());
      const data = res.data;
      const enriched = leaveTypes.map(lt => {
        const existing = data.find(b => b.leave_type === lt.name);
        return {
          leave_type_id: lt.id,
          leave_type: lt.name,
          remaining_days: existing ? existing.remaining_days : lt.annual_quota,
          annual_quota: lt.annual_quota,
        };
      });
      setBalances(enriched);
      modalYearRef.current = year;
    } catch (err) {
      console.error('Failed to fetch balances:', err);
      toast.error(err.response?.data?.message || 'Failed to load leave balances');
      setBalances([]);
    } finally {
      setModalLoading(false);
    }
  };

  const openBalanceModal = async (employee) => {
    setSelectedEmployee(employee);
    setBalances([]);
    setEditingBalance(null);
    setShowBalanceModal(true);
    await fetchBalances(employee.id, selectedYear);
  };

  useEffect(() => {
    if (showBalanceModal && selectedEmployee) {
      fetchBalances(selectedEmployee.id, selectedYear);
    }
  }, [selectedYear, showBalanceModal, selectedEmployee]);

  const handleEditBalance = (balance) => {
    setEditingBalance(balance.leave_type_id);
    setTempValue(balance.remaining_days.toString());
  };

  const handleSaveBalance = async (balance) => {
    const newValue = parseFloat(tempValue);
    if (isNaN(newValue) || newValue < 0) {
      toast.warning('Please enter a valid non‑negative number.');
      return;
    }
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/leave-balances/${selectedEmployee.id}`, {
        leave_type_id: balance.leave_type_id,
        remaining_days: newValue,
        year: modalYearRef.current
      }, getAuthHeaders());
      setBalances(prev =>
        prev.map(b =>
          b.leave_type_id === balance.leave_type_id ? { ...b, remaining_days: newValue } : b
        )
      );
      setEditingBalance(null);
      toast.success('Balance updated successfully');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to update balance');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateLeaveType = async (e) => {
    e.preventDefault();
    if (!newTypeName.trim()) {
      toast.warning('Please provide a leave type name.');
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/admin/leave-types`, {
        name: newTypeName.trim(),
        annual_quota: parseFloat(newTypeQuota) || 15
      }, getAuthHeaders());
      toast.success('New leave type created successfully.');
      setNewTypeName('');
      setNewTypeQuota('15');
      setShowAddTypeModal(false);
      loadLeaveTypes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create leave type.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLeaveType = async (id) => {
    try {
      await axios.put(`${API_BASE}/admin/leave-types/${id}/toggle`, {}, getAuthHeaders());
      toast.success('Leave type status updated.');
      loadLeaveTypes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status.');
    }
  };

  const cancelEdit = () => {
    setEditingBalance(null);
    setTempValue('');
  };

  const filteredEmployees = employees.filter(emp =>
    !searchQuery || 
    emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.employee_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const currentEmployees = filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="lbm-container">
      <div className="lbm-header">
        <div className="lbm-title-group">
          <div>
            <p className="lbm-subtitle">Monitor quotas, manage CTO leave conversions, and configure active leave types.</p>
          </div>
        </div>
      </div>

      <div className="lbm-toolbar">
        <div className="lbm-tabs">
          <button 
            className={`lbm-tab ${activeSubTab === 'balances' ? 'active' : ''}`} 
            onClick={() => setActiveSubTab('balances')}
          >
            Employee Quotas
          </button>
          <button 
            className={`lbm-tab ${activeSubTab === 'types' ? 'active' : ''}`} 
            onClick={() => setActiveSubTab('types')}
          >
            Leave Types Config
          </button>
        </div>

        <div className="lbm-actions-group">
          {activeSubTab === 'balances' && (
            <div className="lbm-year-selector">
              <Calendar size={14} className="text-muted" />
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
                {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                  <option key={y} value={y}>{y} Year</option>
                ))}
              </select>
            </div>
          )}
          <button className="lbm-btn-outline" onClick={loadEmployees} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin-icon" : ""} /> Refresh
          </button>
        </div>
      </div>

      {activeSubTab === 'balances' ? (
        <div className="lbm-content-card">
          <div className="lbm-search-row border-bottom">
            <div className="lbm-search-input-group">
              <Search size={16} className="text-muted" />
              <input 
                type="text" 
                placeholder="Search by employee name or ID..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                className="lbm-clean-input" 
              />
              {searchQuery && <X size={14} className="text-muted cursor-pointer" onClick={() => setSearchQuery('')} />}
            </div>
            <div className="lbm-stats-badge">
              Active Instructors: <strong>{employees.length}</strong>
            </div>
          </div>

          {loading ? (
            <div className="lbm-loading">Loading employees...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="lbm-empty">
              <AlertCircle size={36} className="text-muted" style={{ marginBottom: '1rem' }} />
              <p>No active employees found.</p>
              {searchQuery && <span>Try adjusting your search criteria.</span>}
            </div>
          ) : (
            <>
              <div className="lbm-table-wrapper">
                <table className="lbm-table">
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Full Name</th>
                      <th>Email Address</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentEmployees.map(emp => (
                      <tr key={emp.id}>
                        <td className="font-mono text-muted">{emp.employee_id}</td>
                        <td className="font-medium text-dark">{emp.full_name}</td>
                        <td className="text-muted">{emp.email}</td>
                        <td className="text-right">
                          <button className="lbm-btn-view" onClick={() => openBalanceModal(emp)}>
                            View Balances & CTO
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="lbm-pagination">
                  <span className="lbm-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredEmployees.length)} of {filteredEmployees.length}</span>
                  <div className="lbm-page-controls">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="lbm-page-btn"><ChevronLeft size={16} /></button>
                    <span className="lbm-page-current">{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="lbm-page-btn"><ChevronRight size={16} /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="lbm-content-card">
          <div className="lbm-search-row border-bottom">
            <div>
              <h4 style={{ margin: '0 0 4px 0', color: '#0F172A', fontSize: '1rem' }}>Configuration Rules</h4>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>Disabled types will instantly disappear from the mobile request form.</p>
            </div>
            <button className="lbm-btn-primary" onClick={() => setShowAddTypeModal(true)}>
              <Plus size={16} /> Add Leave Type
            </button>
          </div>

          <div className="lbm-table-wrapper">
            <table className="lbm-table">
              <thead>
                <tr>
                  <th>Leave Type Name</th>
                  <th className="text-center">Default Quota</th>
                  <th className="text-center">Mobile Sync Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {allLeaveTypes.map(lt => (
                  <tr key={lt.id}>
                    <td className="font-medium text-dark">{lt.name}</td>
                    <td className="text-center text-muted">{lt.annual_quota || 15} days</td>
                    <td className="text-center">
                      <span className={`lbm-status-dot ${lt.is_active ? 'active' : 'disabled'}`}>
                        {lt.is_active ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </td>
                    <td className="text-right">
                      <button 
                        className={`lbm-btn-toggle ${lt.is_active ? 'disable' : 'enable'}`}
                        onClick={() => handleToggleLeaveType(lt.id)}
                      >
                        {lt.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EMPLOYEE BALANCES MODAL */}
      {showBalanceModal && (
        <div className="lbm-custom-modal-backdrop" onClick={() => { setShowBalanceModal(false); setSelectedEmployee(null); setEditingBalance(null); }}>
          <div className="lbm-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="lbm-custom-modal-header">
              <div>
                <h3>Leave Balances & CTO Credits</h3>
                <p className="lbm-custom-modal-subtitle">Managing quota for {selectedEmployee?.full_name}</p>
              </div>
              <button className="lbm-custom-close-btn" onClick={() => { setShowBalanceModal(false); setSelectedEmployee(null); setEditingBalance(null); }}>
                <X size={18} />
              </button>
            </div>
            
            <div className="lbm-custom-modal-body">
              {modalLoading ? (
                <div className="lbm-loading">Loading balances...</div>
              ) : (
                <>
                  <div className="lbm-info-box">
                    <p>Displaying balances for fiscal year <strong>{selectedYear}</strong>. Compensatory Time Off (CTO) credits automatically accrue when approved overtime hours are converted.</p>
                  </div>
                  
                  <div className="lbm-minimal-card" style={{ border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                    <table className="lbm-table">
                      <thead>
                        <tr>
                          <th>Leave Type</th>
                          <th className="text-center">Annual Quota</th>
                          <th className="text-center">Remaining Days</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balances.length === 0 ? (
                          <tr>
                            <td colSpan="4" className="lbm-empty" style={{ padding: '2rem' }}>No leave types configured in the system.</td>
                          </tr>
                        ) : (
                          balances.map(balance => (
                            <tr key={balance.leave_type_id}>
                              <td className="font-medium text-dark">{balance.leave_type}</td>
                              <td className="text-center text-muted">{balance.annual_quota} days</td>
                              <td className="text-center">
                                {editingBalance === balance.leave_type_id ? (
                                  <input
                                    type="number"
                                    step="0.5"
                                    value={tempValue}
                                    onChange={(e) => setTempValue(e.target.value)}
                                    className="lbm-inline-input"
                                    autoFocus
                                  />
                                ) : (
                                  <span className="lbm-balance-badge">{balance.remaining_days} days</span>
                                )}
                              </td>
                              <td className="text-right">
                                {editingBalance === balance.leave_type_id ? (
                                  <div className="lbm-action-group right">
                                    <button onClick={cancelEdit} className="lbm-icon-btn cancel" title="Cancel">
                                      <X size={14} />
                                    </button>
                                    <button onClick={() => handleSaveBalance(balance)} disabled={saving} className="lbm-icon-btn save" title="Save">
                                      <Save size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="lbm-action-group right">
                                    <button onClick={() => handleEditBalance(balance)} className="lbm-icon-btn edit" title="Edit">
                                      <Edit3 size={14} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="lbm-alert-box">
                    <AlertCircle size={14} /> 
                    <span>Approved leave requests automatically deduct 1 day from the respective remaining balance.</span>
                  </div>
                </>
              )}
            </div>

            <div className="lbm-custom-modal-footer">
              <button className="lbm-btn-outline" onClick={() => { setShowBalanceModal(false); setSelectedEmployee(null); setEditingBalance(null); }}>Close Window</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD LEAVE TYPE MODAL */}
      {showAddTypeModal && (
        <div className="lbm-custom-modal-backdrop" onClick={() => setShowAddTypeModal(false)}>
          <div className="lbm-custom-modal small" onClick={e => e.stopPropagation()}>
            <div className="lbm-custom-modal-header">
              <h3>Add New Leave Type</h3>
              <button className="lbm-custom-close-btn" onClick={() => setShowAddTypeModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="lbm-custom-modal-body">
              <form id="addLeaveForm" onSubmit={handleCreateLeaveType} className="lbm-form-grid">
                <div className="lbm-form-group">
                  <label>Leave Type Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Bereavement Leave, Maternity Leave" 
                    value={newTypeName} 
                    onChange={e => setNewTypeName(e.target.value)}
                    className="lbm-clean-input border"
                    required
                  />
                </div>
                <div className="lbm-form-group">
                  <label>Default Annual Quota (Days)</label>
                  <input 
                    type="number" 
                    step="0.5" 
                    value={newTypeQuota} 
                    onChange={e => setNewTypeQuota(e.target.value)}
                    className="lbm-clean-input border"
                    required
                  />
                </div>
              </form>
            </div>

            <div className="lbm-custom-modal-footer">
              <button className="lbm-btn-outline" onClick={() => setShowAddTypeModal(false)}>Cancel</button>
              <button type="submit" form="addLeaveForm" className="lbm-btn-primary" disabled={saving}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveBalancesManagement;