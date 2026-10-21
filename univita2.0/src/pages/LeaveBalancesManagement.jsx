import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { 
  RefreshCw, Edit3, Save, X, AlertCircle, Search, 
  ChevronLeft, ChevronRight, Plus, Calendar, 
  Clock
} from 'lucide-react';
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
  const [activeSubTab, setActiveSubTab] = useState('balances');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal Visibility States
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [showCtoModal, setShowCtoModal] = useState(false);
  const [showAddTypeModal, setShowAddTypeModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Leave Balances States
  const [balances, setBalances] = useState([]);
  const [editingBalance, setEditingBalance] = useState(null);
  const [tempValue, setTempValue] = useState('');

  // CTO States
  const [ctoSummary, setCtoSummary] = useState({ total_hours: 0, total_days: 0, used_days: 0, available_days: 0 });
  const [ctoLogs, setCtoLogs] = useState([]);
  const [ctoAdjustment, setCtoAdjustment] = useState('');
  const [ctoEntryType, setCtoEntryType] = useState('CREDIT');
  const [ctoUnit, setCtoUnit] = useState('HOURS');
  const [ctoReason, setCtoReason] = useState('');
  const [isAdjustingCto, setIsAdjustingCto] = useState(false);

  // Leave Type Config States
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeQuota, setNewTypeQuota] = useState('15');
  const [saving, setSaving] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  const modalYearRef = useRef(selectedYear);

  useEffect(() => { 
    modalYearRef.current = selectedYear;
    setCurrentPage(1); 
  }, [searchQuery, selectedYear]);

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

  // --- LEAVE BALANCES HANDLERS ---
  const fetchBalances = async (userId, year) => {
    if (!leaveTypes.length) return [];
    setModalLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/leave-balances/${userId}?year=${year}`, getAuthHeaders());
      const data = res.data;
      const enriched = leaveTypes
        .filter(lt => !lt.name.toLowerCase().includes('compensatory') && !lt.name.toLowerCase().includes('cto'))
        .map(lt => {
        const existing = data.find(b => b.leave_type === lt.name);
        return {
          leave_type_id: lt.id,
          leave_type: lt.name,
          remaining_days: existing ? parseFloat(existing.remaining_days) : parseFloat(lt.annual_quota || 15),
          annual_quota: parseFloat(lt.annual_quota || 15),
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
      toast.warning('Please enter a valid non-negative number.');
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
      toast.success('Leave balance updated successfully');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to update balance');
    } finally {
      setSaving(false);
    }
  };

  // --- CTO CREDITS HANDLERS ---
  const fetchCtoData = async (userId, year) => {
    setModalLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/cto-credits/${userId}?year=${year}`, getAuthHeaders());
      setCtoSummary(res.data?.summary || { total_hours: 0, total_days: 0, used_days: 0, available_days: 0 });
      setCtoLogs(res.data?.logs || []);
    } catch (err) {
      console.error('Failed to fetch CTO data:', err);
      setCtoSummary({ total_hours: 0, total_days: 0, used_days: 0, available_days: 0 });
      setCtoLogs([]);
    } finally {
      setModalLoading(false);
    }
  };

  const openCtoModal = async (employee) => {
    setSelectedEmployee(employee);
    setIsAdjustingCto(false);
    setCtoAdjustment('');
    setCtoEntryType('CREDIT');
    setCtoUnit('HOURS');
    setCtoReason('');
    setShowCtoModal(true);
    await fetchCtoData(employee.id, selectedYear);
  };

  const handleSaveCtoAdjustment = async (e) => {
    e.preventDefault();
    const rawVal = parseFloat(ctoAdjustment);
    if (isNaN(rawVal) || rawVal <= 0) {
      toast.warning('Please enter a valid positive adjustment value.');
      return;
    }
    if (!ctoReason.trim() || ctoReason.trim().length < 4) {
      toast.warning('Please enter a detailed reason (minimum 4 characters).');
      return;
    }

    const calculatedDays = ctoUnit === 'HOURS' ? rawVal / 8 : rawVal;
    const calculatedHours = ctoUnit === 'HOURS' ? rawVal : rawVal * 8;

    if (ctoEntryType === 'DEBIT') {
      const currentAvailableDays = parseFloat(ctoSummary.available_days || 0);
      if (calculatedDays > currentAvailableDays) {
        toast.error(`Cannot debit ${calculatedDays.toFixed(2)} day(s): Exceeds available CTO balance (${currentAvailableDays.toFixed(2)} day(s)).`);
        return;
      }
    }

    const finalDays = ctoEntryType === 'DEBIT' ? -Math.abs(calculatedDays) : Math.abs(calculatedDays);
    const finalHours = ctoEntryType === 'DEBIT' ? -Math.abs(calculatedHours) : Math.abs(calculatedHours);

    setSaving(true);
    try {
      const targetId = selectedEmployee.id || selectedEmployee.employee_id;
      
      await axios.post(`${API_BASE}/cto-credits/${targetId}/adjust`, {
        adjustment_days: finalDays,
        credit_hours: finalHours,
        user_id: selectedEmployee.id,
        employee_id: selectedEmployee.employee_id,
        reason: ctoReason.trim(),
        year: selectedYear
      }, getAuthHeaders());

      toast.success(`CTO ${ctoEntryType === 'DEBIT' ? 'debit' : 'credit'} recorded successfully.`);
      setIsAdjustingCto(false);
      setCtoAdjustment('');
      setCtoReason('');
      setCtoEntryType('CREDIT');
      setCtoUnit('HOURS');

      await fetchCtoData(targetId, selectedYear);
    } catch (err) {
      console.error('CTO Adjustment Error:', err);
      toast.error(err.response?.data?.message || 'Failed to adjust CTO credits.');
    } finally {
      setSaving(false);
    }
  };

  // --- LEAVE TYPE CONFIG HANDLERS ---
  const handleCreateLeaveType = async (e) => {
    e.preventDefault();
    if (!newTypeName.trim()) {
      toast.warning('Please provide a leave type name.');
      return;
    }
    const quotaVal = parseFloat(newTypeQuota);
    if (isNaN(quotaVal) || quotaVal < 0) {
      toast.warning('Please enter a valid non-negative annual quota.');
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API_BASE}/admin/leave-types`, {
        name: newTypeName.trim(),
        annual_quota: quotaVal
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
            <p className="lbm-subtitle">Monitor annual leave quotas, manage overtime CTO conversions, and configure leave types.</p>
          </div>
        </div>
      </div>

      <div className="lbm-toolbar">
        <div className="lbm-tabs">
          <button 
            className={`lbm-tab ${activeSubTab === 'balances' ? 'active' : ''}`} 
            onClick={() => setActiveSubTab('balances')}
          >
            Credits
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
            <div className="lbm-loading">
              <RefreshCw size={20} className="spin-icon" />
              <span>Loading employee accounts...</span>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="lbm-empty">
              <AlertCircle size={32} className="text-muted" style={{ marginBottom: '0.5rem' }} />
              <p>No active employees match your query.</p>
              {searchQuery && <span>Try adjusting your search keywords.</span>}
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
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentEmployees.map(emp => (
                      <tr key={emp.id}>
                        <td className="font-mono text-muted">{emp.employee_id}</td>
                        <td className="font-semibold text-dark">{emp.full_name}</td>
                        <td className="text-muted">{emp.email}</td>
                        <td className="text-right">
                          <div className="lbm-action-row-buttons">
                            <button className="lbm-btn-balances" onClick={() => openBalanceModal(emp)}>
                              Leave Balances
                            </button>
                            <button className="lbm-btn-cto" onClick={() => openCtoModal(emp)}>
                              CTO Credits
                            </button>
                          </div>
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
              <p className="lbm-card-subtitle">Disabled leave types are hidden instantly from mobile leave request options.</p>
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
                    <td className="font-semibold text-dark">{lt.name}</td>
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

      {/* MODAL 1: ANNUAL LEAVE BALANCES MODAL */}
      {showBalanceModal && (
        <div className="lbm-custom-modal-backdrop" onClick={() => { setShowBalanceModal(false); setSelectedEmployee(null); setEditingBalance(null); }}>
          <div className="lbm-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="lbm-custom-modal-header">
              <div>
                <h3>Annual Leave Balances</h3>
                <p className="lbm-custom-modal-subtitle">Quota records for {selectedEmployee?.full_name} ({selectedYear} Year)</p>
              </div>
              <button className="lbm-custom-close-btn" onClick={() => { setShowBalanceModal(false); setSelectedEmployee(null); setEditingBalance(null); }}>
                <X size={18} />
              </button>
            </div>
            
            <div className="lbm-custom-modal-body">
              {modalLoading ? (
                <div className="lbm-loading">
                  <RefreshCw size={20} className="spin-icon" />
                  <span>Loading balances...</span>
                </div>
              ) : (
                <>
                  <div className="lbm-info-box">
                    <p>Annual leave allocations reset at the start of each fiscal year according to standard institutional policy.</p>
                  </div>
                  
                  <div className="lbm-modal-table-container">
                    <table className="lbm-table">
                      <thead>
                        <tr>
                          <th>Leave Category</th>
                          <th className="text-center">Annual Quota</th>
                          <th className="text-center">Remaining Balance</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balances.length === 0 ? (
                          <tr>
                            <td colSpan="4" className="lbm-table-empty-cell">
                              <div className="lbm-empty-state-content">
                                <p className="lbm-empty-title">No Leave Types Configured</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          balances.map(balance => (
                            <tr key={balance.leave_type_id}>
                              <td className="font-semibold text-dark">{balance.leave_type}</td>
                              <td className="text-center text-muted">{balance.annual_quota} days</td>
                              <td className="text-center">
                                {editingBalance === balance.leave_type_id ? (
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
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
                                    <button onClick={() => handleEditBalance(balance)} className="lbm-icon-btn edit" title="Edit Balance">
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
                    <AlertCircle size={15} /> 
                    <span>Approved leave submissions automatically deduct from the employee's active balance.</span>
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

      {/* MODAL 2: FORMAL CTO CREDITS LEDGER & MANUAL ADJUSTMENT */}
      {showCtoModal && (
        <div className="lbm-custom-modal-backdrop" onClick={() => { setShowCtoModal(false); setSelectedEmployee(null); }}>
          <div className="lbm-custom-modal large" onClick={e => e.stopPropagation()}>
            <div className="lbm-custom-modal-header">
              <div className="lbm-header-title-group">
                <div>
                  <h3>Compensatory Time Off Ledger</h3>
                  <p className="lbm-custom-modal-subtitle">
                    Overtime credit earnings and conversion ledger for <span className="lbm-employee-highlight">{selectedEmployee?.full_name}</span> ({selectedYear} Year)
                  </p>
                </div>
              </div>
              <button className="lbm-custom-close-btn" onClick={() => { setShowCtoModal(false); setSelectedEmployee(null); }} aria-label="Close window">
                <X size={18} />
              </button>
            </div>
            
            <div className="lbm-custom-modal-body">
              {modalLoading ? (
                <div className="lbm-loading">
                  <RefreshCw size={20} className="spin-icon" />
                  <span>Loading CTO ledger...</span>
                </div>
              ) : (
                <>
                  <div className="lbm-cto-summary-strip">
                    <div className="lbm-cto-card">
                      <span className="lbm-cto-card-label">Overtime Hours</span>
                      <div className="lbm-cto-card-value">
                        {ctoSummary.total_hours || 0} <span className="lbm-unit">hrs</span>
                      </div>
                    </div>

                    <div className="lbm-cto-card">
                      <span className="lbm-cto-card-label">CTO Earned</span>
                      <div className="lbm-cto-card-value">
                        {ctoSummary.total_days || 0} <span className="lbm-unit">days</span>
                      </div>
                    </div>

                    <div className="lbm-cto-card">
                      <span className="lbm-cto-card-label">CTO Used</span>
                      <div className="lbm-cto-card-value">
                        {ctoSummary.used_days || 0} <span className="lbm-unit">days</span>
                      </div>
                    </div>

                    <div className="lbm-cto-card highlight">
                      <span className="lbm-cto-card-label">Available Balance</span>
                      <div className="lbm-cto-card-value text-emerald">
                        {ctoSummary.available_days || 0} <span className="lbm-unit text-emerald">days</span>
                      </div>
                    </div>
                  </div>

                  <div className="lbm-cto-action-bar">
                    <div className="lbm-cto-bar-title">
                      <span>Transaction History</span>
                    </div>
                    <button 
                      className={`lbm-btn-toggle-adjust ${isAdjustingCto ? 'active' : ''}`} 
                      onClick={() => {
                        setIsAdjustingCto(!isAdjustingCto);
                        setCtoAdjustment('');
                        setCtoReason('');
                        setCtoEntryType('CREDIT');
                        setCtoUnit('HOURS');
                      }}
                    >
                      {isAdjustingCto ? 'Cancel Adjustment' : '+ Manual Adjustment'}
                    </button>
                  </div>

                  {isAdjustingCto && (
                    <form onSubmit={handleSaveCtoAdjustment} className="lbm-cto-adjust-box">
                      <div className="lbm-adjust-header">
                        <h4>Add Manual CTO Credit Entry</h4>
                      </div>
                      
                      <div className="lbm-adjust-grid">
                        <div className="lbm-form-group">
                          <label>Entry Type</label>
                          <select 
                            value={ctoEntryType} 
                            onChange={e => setCtoEntryType(e.target.value)}
                            className="lbm-clean-input border select"
                          >
                            <option value="CREDIT">Credit (+)</option>
                            <option value="DEBIT">Debit (-)</option>
                          </select>
                        </div>

                        <div className="lbm-form-group">
                          <label>Unit</label>
                          <select 
                            value={ctoUnit} 
                            onChange={e => setCtoUnit(e.target.value)}
                            className="lbm-clean-input border select"
                          >
                            <option value="HOURS">Hours (8 hrs = 1 day)</option>
                            <option value="DAYS">Days</option>
                          </select>
                        </div>

                        <div className="lbm-form-group">
                          <label>Value ({ctoUnit === 'HOURS' ? 'Hours' : 'Days'})</label>
                          <input 
                            type="number" 
                            step={ctoUnit === 'HOURS' ? '0.5' : '0.125'} 
                            min={ctoUnit === 'HOURS' ? '0.5' : '0.125'} 
                            placeholder={ctoUnit === 'HOURS' ? '8.0' : '1.0'} 
                            value={ctoAdjustment}
                            onChange={e => setCtoAdjustment(e.target.value)}
                            className="lbm-clean-input border"
                            required
                          />
                        </div>

                        <div className="lbm-form-group wide">
                          <label>Reason / Reference Notes</label>
                          <input 
                            type="text" 
                            placeholder="e.g., Approved Sunday Event Overtime / Special Conversion" 
                            value={ctoReason}
                            onChange={e => setCtoReason(e.target.value)}
                            className="lbm-clean-input border"
                            maxLength={250}
                            required
                          />
                        </div>
                      </div>

                      <div className="lbm-adjust-actions">
                        <button 
                          type="button" 
                          className="lbm-btn-outline small" 
                          onClick={() => setIsAdjustingCto(false)}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="lbm-btn-primary small" disabled={saving}>
                          {saving ? 'Saving...' : 'Confirm Ledger Entry'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="lbm-modal-table-container">
                    <table className="lbm-table">
                      <thead>
                        <tr>
                          <th style={{ width: '22%' }}>DATE</th>
                          <th style={{ width: '44%' }}>TRANSACTION DESCRIPTION</th>
                          <th style={{ width: '18%' }} className="text-center">TYPE</th>
                          <th style={{ width: '16%' }} className="text-right">CTO DAYS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ctoLogs.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="lbm-table-empty-cell">
                              <div className="lbm-empty-state-content">
                                <div className="lbm-empty-icon-circle">
                                  <Clock size={24} />
                                </div>
                                <p className="lbm-empty-title">No CTO credit transactions recorded for this year.</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          ctoLogs.map((log, idx) => {
                            const numDays = parseFloat(log.days || 0);
                            const isPositive = numDays > 0;
                            const logDate = log.date || log.created_at?.substring(0, 10) || '—';
                            const logDesc = log.description || log.reason || 'Overtime Conversion';
                            return (
                              <tr key={log.id || idx}>
                                <td className="font-mono text-muted">{logDate}</td>
                                <td className="font-medium text-dark">{logDesc}</td>
                                <td className="text-center">
                                  <span className={`lbm-chip ${isPositive ? 'credit' : 'debit'}`}>
                                    {isPositive ? 'CREDIT' : 'DEBIT'}
                                  </span>
                                </td>
                                <td className={`text-right font-semibold ${isPositive ? 'text-emerald' : 'text-danger'}`}>
                                  {isPositive ? `+${numDays}` : numDays} days
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="lbm-custom-modal-footer">
              <button className="lbm-btn-outline" onClick={() => { setShowCtoModal(false); setSelectedEmployee(null); }}>
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD LEAVE TYPE MODAL */}
      {showAddTypeModal && (
        <div className="lbm-custom-modal-backdrop" onClick={() => setShowAddTypeModal(false)}>
          <div className="lbm-custom-modal small" onClick={e => e.stopPropagation()}>
            <div className="lbm-custom-modal-header">
              <div>
                <h3>Add New Leave Type</h3>
                <p className="lbm-custom-modal-subtitle">Configure system-wide leave policy</p>
              </div>
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
                    min="0"
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
              <button type="submit" form="addLeaveForm" className="lbm-btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Leave Type'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveBalancesManagement;