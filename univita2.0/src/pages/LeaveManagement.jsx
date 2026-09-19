// src/pages/LeaveManagement.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Check, X, Search, RefreshCw, ClipboardList, ChevronLeft, ChevronRight, CheckCircle, XCircle, Eye } from 'lucide-react';
import { API_BASE } from '../api';
import './LeaveManagement.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const LeaveManagement = () => {
  const [historyGroups, setHistoryGroups] = useState([]);
  const [pendingGroups, setPendingGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const itemsPerPage = 10;

  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [actionType, setActionType] = useState('');
  const [remarks, setRemarks] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);
  useEffect(() => { setPendingPage(1); }, [pendingSearch]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadingPending(true);
    try {
      const res = await axios.get(`${API_BASE}/leave-requests/grouped`, getAuthHeaders());
      const all = res.data || [];
      
      const pending = all.filter(g => g.status === 'Pending').sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
      const history = all.filter(g => g.status !== 'Pending').sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

      setPendingGroups(pending);
      setHistoryGroups(history);
      setPendingCount(pending.length);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to load leave requests');
    } finally {
      setLoading(false);
      setLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openActionModal = (group, action) => {
    setSelectedGroup(group);
    setActionType(action);
    setRemarks('');
    setShowRemarksModal(true);
  };

  const openDetailsModal = (group) => {
    setSelectedGroup(group);
    setShowDetailsModal(true);
  };

  const handleBatchAction = async () => {
    if (!selectedGroup) return;
    setProcessing(true);
    try {
      await axios.put(
        `${API_BASE}/leave-requests/batch-status`,
        {
          ids: selectedGroup.ids,
          status: actionType,
          admin_remarks: remarks.trim() || null
        },
        getAuthHeaders()
      );
      toast.success(`${selectedGroup.request_count} leave request(s) ${actionType.toLowerCase()}.`);
      setShowRemarksModal(false);
      setShowDetailsModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setProcessing(false);
    }
  };

  const formatDateOnly = (dateString) => {
    if (!dateString) return '';
    return String(dateString).trim().substring(0, 10);
  };

  const formatDateRange = (start, end) => {
    const startStr = formatDateOnly(start);
    const endStr = formatDateOnly(end);
    if (!startStr) return '';
    if (startStr === endStr) return startStr;
    return `${startStr} – ${endStr}`;
  };

  const filteredHistory = historyGroups.filter(group =>
    !searchTerm ||
    group.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.employee_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPending = pendingGroups.filter(group =>
    !pendingSearch ||
    group.full_name?.toLowerCase().includes(pendingSearch.toLowerCase()) ||
    group.employee_id?.toLowerCase().includes(pendingSearch.toLowerCase()) ||
    group.type?.toLowerCase().includes(pendingSearch.toLowerCase())
  );

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const currentHistory = filteredHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const pendingTotalPages = Math.ceil(filteredPending.length / itemsPerPage);
  const currentPending = filteredPending.slice((pendingPage - 1) * itemsPerPage, pendingPage * itemsPerPage);

  return (
    <div className="expert-container">
      <div className="expert-header">
        <div className="expert-title-group">
          <div>
            
            <p className="expert-subtitle">Review historical and resolved employee leave and absence records.</p>
          </div>
        </div>
        <button className="expert-btn-secondary" onClick={() => setShowPendingModal(true)}>
          <ClipboardList size={16} /> Pending Requests
          {pendingCount > 0 && <span className="lm-badge-count">{pendingCount}</span>}
        </button>
      </div>

      <div className="expert-search-card" style={{ padding: '12px 20px' }}>
        <div className="expert-search-row">
          <div className="expert-search-input-group" style={{ maxWidth: '400px' }}>
            <Search size={18} className="text-muted" />
            <input
              type="text"
              placeholder="Search Name or Employee ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="expert-clean-input"
            />
            {searchTerm && <X size={16} className="text-muted cursor-pointer" onClick={() => setSearchTerm('')} />}
          </div>
        </div>
      </div>

      <div className="expert-card">
        {loading ? (
          <div className="expert-loading">Loading leave records...</div>
        ) : filteredHistory.length === 0 ? (
          <div className="expert-empty">No historical leave records match your criteria.</div>
        ) : (
          <>
            <div className="expert-table-wrapper">
              <table className="expert-table">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Employee Name</th>
                    <th>Leave Type</th>
                    <th className="text-center">Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentHistory.map(group => (
                    <tr key={group.ids?.[0] || Math.random()}>
                      <td className="whitespace-nowrap font-mono text-xs text-muted">{group.employee_id || '—'}</td>
                      <td className="whitespace-nowrap font-semibold text-dark">{group.full_name || 'Unknown'}</td>
                      <td className="whitespace-nowrap">
                        <span className="expert-chip default">{group.type || 'Leave'}</span>
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <span className={`expert-chip ${group.status?.toLowerCase() === 'approved' ? 'success' : 'danger'}`}>
                          {group.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <button className="lm-btn-icon" onClick={() => openDetailsModal(group)} title="View Details">
                          <Eye size={18} color="#475569" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="expert-pagination">
                <span className="expert-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredHistory.length)} of {filteredHistory.length} entries</span>
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

      {/* DETAILS MODAL (Displays required fields: Employee ID, Name, Leave Type, Date Range, Duration, Reason, Status, Admin Remarks) */}
      {showDetailsModal && selectedGroup && (
        <div className="lm-custom-modal-backdrop" onClick={() => setShowDetailsModal(false)}>
          <div className="lm-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="lm-custom-modal-header">
              <h3>Leave Request Details</h3>
              <button className="lm-custom-close-btn" onClick={() => setShowDetailsModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="lm-custom-modal-body">
              <div className="lm-custom-summary-card">
                <div className="lm-custom-req-top">
                  <div>
                    <span className="lm-custom-name">{selectedGroup.full_name}</span>
                    <span className="lm-custom-id-tag">{selectedGroup.employee_id || '—'}</span>
                  </div>
                  <span className={`expert-chip ${selectedGroup.status?.toLowerCase() === 'approved' ? 'success' : selectedGroup.status?.toLowerCase() === 'rejected' ? 'danger' : 'warning'}`}>
                    {selectedGroup.status?.toUpperCase()}
                  </span>
                </div>

                <div className="lm-custom-details-grid">
                  <div className="lm-custom-prop">
                    <label>Leave Type</label>
                    <span>{selectedGroup.type || 'Leave'}</span>
                  </div>
                  <div className="lm-custom-prop">
                    <label>Total Duration</label>
                    <span className="nowrap">{selectedGroup.request_count || 1} day(s)</span>
                  </div>
                  <div className="lm-custom-prop full-width">
                    <label>Date Range</label>
                    <span className="nowrap">{formatDateRange(selectedGroup.start_date, selectedGroup.end_date)}</span>
                  </div>
                  <div className="lm-custom-prop full-width">
                    <label>Reason</label>
                    <span className="reason-text">{selectedGroup.reason || '—'}</span>
                  </div>
                  <div className="lm-custom-prop full-width">
                    <label>Admin Remarks</label>
                    <span className="reason-text">{selectedGroup.admin_remarks || '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lm-custom-modal-footer">
              {selectedGroup.status === 'Pending' && (
                <>
                  <button className="lm-btn-reject-custom" onClick={() => { setShowDetailsModal(false); openActionModal(selectedGroup, 'Rejected'); }}>
                    <XCircle size={16} /> Reject
                  </button>
                  <button className="lm-btn-approve-custom" onClick={() => { setShowDetailsModal(false); openActionModal(selectedGroup, 'Approved'); }}>
                    <CheckCircle size={16} /> Approve
                  </button>
                </>
              )}
              <button className="expert-btn-secondary" onClick={() => setShowDetailsModal(false)}>Close Window</button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMIZED PENDING LEAVE REQUESTS MODAL (With Independent Pagination) */}
      {showPendingModal && (
        <div className="lm-custom-modal-backdrop" onClick={() => setShowPendingModal(false)}>
          <div className="lm-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="lm-custom-modal-header">
              <h3>Pending Leave Requests</h3>
              <button className="lm-custom-close-btn" onClick={() => setShowPendingModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="lm-custom-modal-body">
              <div className="expert-search-input-group border" style={{ marginBottom: '1.25rem', maxWidth: '100%', background: '#FFFFFF' }}>
                <Search size={18} className="text-muted" />
                <input type="text" placeholder="Search Name or Employee ID..." value={pendingSearch} onChange={e => setPendingSearch(e.target.value)} className="expert-clean-input" />
                {pendingSearch && <X size={16} className="text-muted cursor-pointer" onClick={() => setPendingSearch('')} />}
              </div>

              {loadingPending ? (
                <div className="expert-loading">Loading pending requests...</div>
              ) : filteredPending.length === 0 ? (
                <div className="expert-empty">No pending leave requests match your criteria.</div>
              ) : (
                <div className="lm-custom-requests-list">
                  {currentPending.map(group => (
                    <div key={group.ids?.[0] || Math.random()} className="lm-custom-request-card">
                      <div className="lm-custom-req-top">
                        <div>
                          <span className="lm-custom-name">{group.full_name}</span>
                          <span className="lm-custom-id-tag">{group.employee_id || '—'}</span>
                        </div>
                        <span className="lm-custom-type-pill">{group.type || 'Leave'}</span>
                      </div>

                      <div className="lm-custom-details-grid">
                        <div className="lm-custom-prop">
                          <label>Date Range</label>
                          <span className="nowrap">{formatDateRange(group.start_date, group.end_date)}</span>
                        </div>
                        <div className="lm-custom-prop">
                          <label>Total Duration</label>
                          <span className="nowrap">{group.request_count || 1} day(s)</span>
                        </div>
                        <div className="lm-custom-prop full-width">
                          <label>Reason for Leave</label>
                          <span className="reason-text">{group.reason || '—'}</span>
                        </div>
                      </div>

                      <div className="lm-custom-req-actions">
                        <button className="lm-btn-reject-custom" onClick={() => { setShowPendingModal(false); openActionModal(group, 'Rejected'); }}>
                          <XCircle size={16} /> Reject Request
                        </button>
                        <button className="lm-btn-approve-custom" onClick={() => { setShowPendingModal(false); openActionModal(group, 'Approved'); }}>
                          <CheckCircle size={16} /> Approve Leave
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {pendingTotalPages > 1 && (
              <div className="lm-custom-modal-pagination">
                <span className="expert-page-info">Showing {(pendingPage - 1) * itemsPerPage + 1} to {Math.min(pendingPage * itemsPerPage, filteredPending.length)} of {filteredPending.length}</span>
                <div className="expert-page-controls">
                  <button onClick={() => setPendingPage(p => Math.max(1, p - 1))} disabled={pendingPage === 1} className="expert-page-btn"><ChevronLeft size={16} /></button>
                  <span className="expert-page-current">{pendingPage} / {pendingTotalPages}</span>
                  <button onClick={() => setPendingPage(p => Math.min(pendingTotalPages, p + 1))} disabled={pendingPage === pendingTotalPages} className="expert-page-btn"><ChevronRight size={16} /></button>
                </div>
              </div>
            )}

            <div className="lm-custom-modal-footer">
              <button className="expert-btn-secondary" onClick={() => setShowPendingModal(false)}>Close Window</button>
            </div>
          </div>
        </div>
      )}

      {/* REMARKS & CONFIRMATION MODAL */}
      {showRemarksModal && (
        <div className="lm-custom-modal-backdrop" onClick={() => setShowRemarksModal(false)}>
          <div className="lm-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="lm-custom-modal-header">
              <h3>{actionType} Leave Request</h3>
              <button className="lm-custom-close-btn" onClick={() => setShowRemarksModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="lm-custom-modal-body">
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '1.25rem' }}>
                <p style={{ fontSize: '0.95rem', color: '#334155', margin: 0, lineHeight: '1.6' }}>
                  You are about to <strong>{actionType.toLowerCase()}</strong> the leave request for <strong>{selectedGroup?.full_name}</strong>.
                </p>
                <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '4px 0 0 0' }}>
                  Dates: <strong>{formatDateOnly(selectedGroup?.start_date)}</strong> to <strong>{formatDateOnly(selectedGroup?.end_date)}</strong> ({selectedGroup?.request_count} days)
                </p>
              </div>

              <div className="expert-form-group">
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Administrator Remarks (Optional)</label>
                <textarea
                  rows="3"
                  className="expert-clean-input border"
                  placeholder="Add any comments (visible to the employee)..."
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  disabled={processing}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>

            <div className="lm-custom-modal-footer">
              <button className="expert-btn-secondary" onClick={() => setShowRemarksModal(false)} disabled={processing}>Cancel</button>
              <button className={`expert-btn-primary ${actionType === 'Rejected' ? 'bg-red' : ''}`} onClick={handleBatchAction} disabled={processing}>
                {processing ? 'Processing...' : `Confirm ${actionType}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveManagement;