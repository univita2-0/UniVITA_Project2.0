import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { RefreshCw, Edit3, Save, X, AlertCircle, Search, ChevronLeft, ChevronRight, UserCog } from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';
import './LeaveBalancesManagement.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const LeaveBalancesManagement = () => {
  const [employees, setEmployees] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal state
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [balances, setBalances] = useState([]);
  const [editingBalance, setEditingBalance] = useState(null);
  const [tempValue, setTempValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const modalYearRef = useRef(selectedYear);

  // Reset page on search or year change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedYear]);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/employees`, getAuthHeaders());
      const instructors = res.data.filter(emp => emp.role === 'instructor' && emp.status === 'active');
      setEmployees(instructors);
    } catch (err) {
      console.error('Failed to load employees:', err);
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLeaveTypes = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/leave-types`, getAuthHeaders());
      setLeaveTypes(res.data);
    } catch (err) {
      console.error('Failed to load leave types:', err);
      toast.error('Failed to load leave types');
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
      toast.error('Failed to load leave balances');
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
      toast.error('Failed to update balance');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingBalance(null);
    setTempValue('');
  };

  // Client-side filtering
  const filteredEmployees = employees.filter(emp =>
    !searchQuery || 
    emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.employee_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination Logic
  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const currentEmployees = filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
          
          <div>
            
            <p className="expert-subtitle">Monitor and manually adjust employee leave quotas.</p>
          </div>
        </div>
        <div className="lbm-controls">
          <div className="lbm-year-selector">
            <label>Fiscal Year</label>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
              {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button className="expert-btn-secondary" onClick={loadEmployees} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin-icon" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Search Bar */}
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

      {/* Main Table Card */}
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
                            View Balances
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
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

      {/* Leave Balances Modal */}
      <FormalModal
        show={showBalanceModal}
        onClose={() => {
          setShowBalanceModal(false);
          setSelectedEmployee(null);
          setEditingBalance(null);
        }}
        title={`Leave Balances: ${selectedEmployee?.full_name}`}
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
                Displaying balances for the year <strong>{selectedYear}</strong>. You may manually adjust remaining days if necessary.
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
              <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>Approved leave requests will automatically deduct 1 day from the corresponding remaining balance.</span>
            </div>
          </>
        )}
      </FormalModal>
    </div>
  );
};

export default LeaveBalancesManagement;