import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { RefreshCw, Edit3, Save, X, AlertCircle, Search, ChevronLeft, ChevronRight, Plus, Settings } from 'lucide-react';
import FormalModal from '../components/FormalModal';
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
    <div className="expert-container">
      <div className="expert-header">
        <div className="expert-title-group">
          <div>
            <p className="expert-subtitle">Monitor quotas, manage CTO leave conversions, and configure active leave types.</p>
          </div>
        </div>
        <div className="lbm-controls">
          <button 
            className={`expert-btn-secondary ${activeSubTab === 'balances' ? 'active-tab' : ''}`} 
            onClick={() => setActiveSubTab('balances')}
          >
            Employee Quotas
          </button>
          <button 
            className={`expert-btn-secondary ${activeSubTab === 'types' ? 'active-tab' : ''}`} 
            onClick={() => setActiveSubTab('types')}
          >
             Leave Types Config
          </button>
          {activeSubTab === 'balances' && (
            <div className="lbm-year-selector">
              <label>Fiscal Year</label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
                {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
          <button className="expert-btn-secondary" onClick={loadEmployees} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin-icon" : ""} /> Refresh
          </button>
        </div>
      </div>

      {activeSubTab === 'balances' ? (
        <>
          <div className="expert-search-card" style={{ padding: '12px 20px' }}>
            <div className="expert-search-row">
              <div className="expert-search-input-group" style={{ maxWidth: '500px' }}>
                <Search size={18} className="text-muted" />
                <input 
                  type="text" 
                  placeholder="Search by employee name or ID..." 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  className="expert-clean-input" 
                />
                {searchQuery && <X size={16} className="text-muted cursor-pointer" onClick={() => setSearchQuery('')} />}
              </div>
              <div className="expert-stats-badge">
                Active Instructors: <strong>{employees.length}</strong>
              </div>
            </div>
          </div>

          <div className="expert-card">
            {loading ? (
              <div className="expert-loading">Loading employees...</div>
            ) : filteredEmployees.length === 0 ? (
              <div className="expert-empty">
                <AlertCircle size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
                <p>No active employees found.</p>
                {searchQuery && <span>Try adjusting your search criteria.</span>}
              </div>
            ) : (
              <>
                <div className="expert-table-wrapper">
                  <table className="expert-table">
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
                          <td><span className="font-semibold text-dark">{emp.full_name}</span></td>
                          <td className="text-muted">{emp.email}</td>
                          <td>
                            <div className="expert-action-group right">
                              <button className="lbm-btn-view" onClick={() => openBalanceModal(emp)}>
                                View Balances & CTO
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="expert-pagination">
                    <span className="expert-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredEmployees.length)} of {filteredEmployees.length} entries</span>
                    <div className="expert-page-controls">
                      <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="expert-page-btn"><ChevronLeft size={16} /> Prev</button>
                      <span className="expert-page-current">{currentPage} / {totalPages}</span>
                      <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="expert-page-btn">Next <ChevronRight size={16} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="expert-card">
          <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0' }}>
            <div>
              
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748B' }}>Add new types or toggle availability. Disabled types will instantly disappear from the mobile request form.</p>
            </div>
            <button className="expert-btn-primary" onClick={() => setShowAddTypeModal(true)}>
              <Plus size={16} /> Add Leave Type
            </button>
          </div>

          <div className="expert-table-wrapper">
            <table className="expert-table">
              <thead>
                <tr>
                  <th>Leave Type Name</th>
                  <th className="text-center">Default Annual Quota</th>
                  <th className="text-center">Status (Mobile Sync)</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {allLeaveTypes.map(lt => (
                  <tr key={lt.id}>
                    <td className="font-semibold text-dark">{lt.name}</td>
                    <td className="text-center">{lt.annual_quota || 15} days</td>
                    <td className="text-center">
                      <span className={`expert-chip ${lt.is_active ? 'success' : 'danger'}`}>
                        {lt.is_active ? 'ACTIVE & ENABLED' : 'DISABLED'}
                      </span>
                    </td>
                    <td className="text-right">
                      <button 
                        className="expert-btn-secondary" 
                        onClick={() => handleToggleLeaveType(lt.id)}
                        style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
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
      <FormalModal
        show={showBalanceModal}
        onClose={() => {
          setShowBalanceModal(false);
          setSelectedEmployee(null);
          setEditingBalance(null);
        }}
        title={`Leave Balances & CTO Credits: ${selectedEmployee?.full_name}`}
        wide
        footer={
          <button className="expert-btn-secondary" onClick={() => setShowBalanceModal(false)}>
            Close Window
          </button>
        }
      >
        {modalLoading ? (
          <div className="expert-loading">Loading balances...</div>
        ) : (
          <>
            <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
              <p style={{ fontSize: '0.9rem', color: '#334155', margin: 0 }}>
                Displaying balances for fiscal year <strong>{selectedYear}</strong>. Compensatory Time Off (CTO) credits automatically accrue when approved overtime hours are converted.
              </p>
            </div>
            
            <div className="expert-table-wrapper" style={{ marginBottom: '16px', border: '1px solid #E2E8F0' }}>
              <table className="expert-table">
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
                      <td colSpan="4" className="expert-empty" style={{ padding: '2rem' }}>No leave types configured in the system.</td>
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
                              className="expert-clean-input border text-center"
                              style={{ width: '80px', padding: '0.4rem', height: '32px' }}
                              autoFocus
                            />
                          ) : (
                            <span className="expert-chip success">{balance.remaining_days} days</span>
                          )}
                        </td>
                        <td>
                          {editingBalance === balance.leave_type_id ? (
                            <div className="expert-action-group right">
                              <button onClick={cancelEdit} className="expert-btn-icon" title="Cancel">
                                <X size={16} />
                              </button>
                              <button onClick={() => handleSaveBalance(balance)} disabled={saving} className="expert-btn-icon success" title="Save">
                                <Save size={16} />
                              </button>
                            </div>
                          ) : (
                            <div className="expert-action-group right">
                              <button onClick={() => handleEditBalance(balance)} className="expert-btn-icon" title="Edit">
                                <Edit3 size={16} color="#0D9488" />
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FEF2F2', padding: '12px 16px', borderRadius: '8px', border: '1px solid #FECACA', color: '#DC2626' }}>
              <AlertCircle size={16} /> 
              <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>Approved leave requests automatically deduct 1 day from the respective remaining balance.</span>
            </div>
          </>
        )}
      </FormalModal>

      {/* ADD LEAVE TYPE MODAL */}
      <FormalModal
        show={showAddTypeModal}
        onClose={() => setShowAddTypeModal(false)}
        title="Add New Leave Type"
        footer={
          <>
            <button className="expert-btn-secondary" onClick={() => setShowAddTypeModal(false)}>Cancel</button>
            <button className="expert-btn-primary" onClick={handleCreateLeaveType} disabled={saving}>Save Leave Type</button>
          </>
        }
      >
        <form onSubmit={handleCreateLeaveType} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Leave Type Name</label>
            <input 
              type="text" 
              placeholder="e.g. Bereavement Leave, Maternity Leave" 
              value={newTypeName} 
              onChange={e => setNewTypeName(e.target.value)}
              className="expert-clean-input border"
              required
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Default Annual Quota (Days)</label>
            <input 
              type="number" 
              step="0.5" 
              value={newTypeQuota} 
              onChange={e => setNewTypeQuota(e.target.value)}
              className="expert-clean-input border"
              required
            />
          </div>
        </form>
      </FormalModal>
    </div>
  );
};

export default LeaveBalancesManagement;