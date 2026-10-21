import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Check, X, Search, RefreshCw, ClipboardList, ChevronLeft, ChevronRight, CheckCircle, XCircle, Eye, ExternalLink, Calendar, User, FileText, MessageSquare, Clock } from 'lucide-react';
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

  const formatDateTime12Hour = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString.replace(' ', 'T'));
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
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
           
            <p className="expert-subtitle">Review historical and resolved employee leave logs across the organization.</p>
          </div>
        </div>
        <div className="expert-header-actions">
          <button className="expert-btn-secondary" onClick={fetchData} title="Refresh Data">
            <RefreshCw size={15} className={loading ? "spin-icon" : ""} /> Refresh
          </button>
          <button className="expert-btn-primary" onClick={() => setShowPendingModal(true)}>
            <ClipboardList size={16} /> Pending Requests
            {pendingCount > 0 && <span className="lm-badge-count">{pendingCount}</span>}
          </button>
        </div>
      </div>

      <div className="expert-search-card">
        <div className="expert-search-row">
          <div className="expert-search-input-group">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search by Employee Name, ID, or Leave Type..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="expert-clean-input"
            />
            {searchTerm && <X size={16} className="clear-icon" onClick={() => setSearchTerm('')} />}
          </div>
          <div className="expert-meta-stats">
            Total Records: <strong>{filteredHistory.length}</strong>
          </div>
        </div>
      </div>

      <div className="expert-card">
        {loading ? (
          <div className="expert-loading">
            <RefreshCw size={24} className="spin-icon" />
            <span>Loading leave records...</span>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="expert-empty">No historical leave records match your search criteria.</div>
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
                      <td className="whitespace-nowrap font-mono text-muted">{group.employee_id || '—'}</td>
                      <td className="whitespace-nowrap font-semibold text-dark">{group.full_name || 'Unknown'}</td>
                      <td className="whitespace-nowrap">
                        <span className="expert-chip default">{group.type || 'Leave'}</span>
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <span className={`expert-chip ${group.status?.toLowerCase() === 'approved' ? 'success' : group.status?.toLowerCase() === 'cancelled' ? 'default' : 'danger'}`}>
                          {group.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <button className="lm-btn-icon" onClick={() => openDetailsModal(group)} title="View Details">
                          <Eye size={15} />
                          <span>View Details</span>
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
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="expert-page-btn">
                    <ChevronLeft size={16} /> Previous
                  </button>
                  <span className="expert-page-current">{currentPage} / {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="expert-page-btn">
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* FORMAL & REDESIGNED DETAILS MODAL (Eye Icon Click) */}
      {showDetailsModal && selectedGroup && (
        <div className="lm-custom-modal-backdrop" onClick={() => setShowDetailsModal(false)}>
          <div className="lm-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="lm-custom-modal-header">
              <div>
                <h3>Leave Request Details</h3>
                <p className="lm-modal-subtitle">Official record overview and approval status</p>
              </div>
              <button className="lm-custom-close-btn" onClick={() => setShowDetailsModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="lm-custom-modal-body">
              {/* Employee Banner */}
              <div className="lm-detail-banner">
                <div className="lm-detail-user">
                  <div className="lm-detail-avatar">
                    {selectedGroup.full_name ? selectedGroup.full_name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <h4 className="lm-detail-name">{selectedGroup.full_name}</h4>
                    <span className="lm-detail-id">ID: {selectedGroup.employee_id || '—'}</span>
                  </div>
                </div>
                <span className={`expert-chip ${selectedGroup.status?.toLowerCase() === 'approved' ? 'success' : selectedGroup.status?.toLowerCase() === 'cancelled' ? 'default' : 'danger'}`}>
                  {selectedGroup.status?.toUpperCase()}
                </span>
              </div>

              {/* Structured Key Details Table / Grid */}
              <div className="lm-detail-section">
                <div className="lm-detail-grid-2col">
                  <div className="lm-detail-card-item">
                    <div className="lm-detail-label">
                      <FileText size={14} /> Leave Type
                    </div>
                    <div className="lm-detail-value font-semibold">{selectedGroup.type || 'Leave'}</div>
                  </div>

                  <div className="lm-detail-card-item">
                    <div className="lm-detail-label">
                      <Clock size={14} /> Total Duration
                    </div>
                    <div className="lm-detail-value font-semibold">{selectedGroup.request_count || 1} Day(s)</div>
                  </div>

                  <div className="lm-detail-card-item">
                    <div className="lm-detail-label">
                      <Calendar size={14} /> Date Range
                    </div>
                    <div className="lm-detail-value font-medium">{formatDateRange(selectedGroup.start_date, selectedGroup.end_date)}</div>
                  </div>

                  <div className="lm-detail-card-item">
                    <div className="lm-detail-label">
                      <Clock size={14} /> Submitted On
                    </div>
                    <div className="lm-detail-value font-medium">{formatDateTime12Hour(selectedGroup.submitted_at || selectedGroup.created_at)}</div>
                  </div>
                </div>

                {/* Reason Box */}
                <div className="lm-detail-block">
                  <div className="lm-detail-label">
                    <MessageSquare size={14} /> Reason for Leave
                  </div>
                  <div className="lm-detail-text-box">
                    {selectedGroup.reason || 'No specific reason provided.'}
                  </div>
                </div>

                {/* Admin Remarks Box */}
                <div className="lm-detail-block">
                  <div className="lm-detail-label">
                    <User size={14} /> Administrator Remarks
                  </div>
                  <div className="lm-detail-text-box admin-remarks">
                    {selectedGroup.admin_remarks || 'No remarks recorded.'}
                  </div>
                </div>

                {/* Attachment Proof */}
                {selectedGroup.image_url && (
                  <div className="lm-detail-block">
                    <div className="lm-detail-label">
                      <ExternalLink size={14} /> Attached Proof / Document
                    </div>
                    <a 
                      href={`${API_BASE.replace(/\/api$/, '')}${selectedGroup.image_url}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="lm-attachment-link"
                    >
                      <ExternalLink size={14} /> View Supporting Document
                    </a>
                  </div>
                )}
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

      {/* PENDING LEAVE REQUESTS MODAL */}
      {showPendingModal && (
        <div className="lm-custom-modal-backdrop" onClick={() => setShowPendingModal(false)}>
          <div className="lm-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="lm-custom-modal-header">
              <div>
                <h3>Pending Leave Requests</h3>
                <p className="lm-modal-subtitle">Review and process active leave submissions</p>
              </div>
              <button className="lm-custom-close-btn" onClick={() => setShowPendingModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="lm-custom-modal-body">
              <div className="expert-search-input-group modal-search">
                <Search size={18} className="search-icon" />
                <input type="text" placeholder="Search Name or Employee ID..." value={pendingSearch} onChange={e => setPendingSearch(e.target.value)} className="expert-clean-input" />
                {pendingSearch && <X size={16} className="clear-icon" onClick={() => setPendingSearch('')} />}
              </div>

              {loadingPending ? (
                <div className="expert-loading">
                  <RefreshCw size={20} className="spin-icon" />
                  <span>Loading pending requests...</span>
                </div>
              ) : filteredPending.length === 0 ? (
                <div className="expert-empty">No pending leave requests match your criteria.</div>
              ) : (
                <div className="lm-minimal-list">
                  {currentPending.map(group => (
                    <div key={group.ids?.[0] || Math.random()} className="lm-minimal-card">
                      <div className="lm-minimal-header">
                        <div className="lm-minimal-user">
                          <div className="lm-minimal-avatar">
                            {group.full_name ? group.full_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div className="lm-minimal-user-info">
                            <span className="lm-minimal-name">{group.full_name}</span>
                            <span className="lm-minimal-id">{group.employee_id || '—'}</span>
                          </div>
                        </div>
                        <span className="lm-minimal-type-badge">{group.type || 'Leave'}</span>
                      </div>

                      <div className="lm-minimal-body">
                        <div className="lm-minimal-grid">
                          <div className="lm-minimal-field">
                            <label>Date Range</label>
                            <span>{formatDateRange(group.start_date, group.end_date)}</span>
                          </div>
                          <div className="lm-minimal-field">
                            <label>Total Duration</label>
                            <span>{group.request_count || 1} day(s)</span>
                          </div>
                        </div>
                        
                        <div className="lm-minimal-field full-width">
                          <label>Reason for Leave</label>
                          <p>{group.reason || '—'}</p>
                        </div>

                        {group.image_url && (
                          <div className="lm-minimal-field full-width">
                            <a href={`${API_BASE.replace(/\/api$/, '')}${group.image_url}`} target="_blank" rel="noopener noreferrer" className="lm-minimal-link">
                              <ExternalLink size={14} /> View Attached Document / Proof
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="lm-minimal-footer">
                        <button className="lm-btn-min-reject" onClick={() => { setShowPendingModal(false); openActionModal(group, 'Rejected'); }}>Reject</button>
                        <button className="lm-btn-min-approve" onClick={() => { setShowPendingModal(false); openActionModal(group, 'Approved'); }}>Approve</button>
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

      {/* REMARKS MODAL */}
      {showRemarksModal && (
        <div className="lm-custom-modal-backdrop" onClick={() => setShowRemarksModal(false)}>
          <div className="lm-custom-modal small" onClick={e => e.stopPropagation()}>
            <div className="lm-custom-modal-header">
              <div>
                <h3>{actionType} Leave Request</h3>
                <p className="lm-modal-subtitle">Add official review notes for this action</p>
              </div>
              <button className="lm-custom-close-btn" onClick={() => setShowRemarksModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="lm-custom-modal-body">
              <div className="lm-action-notice-box">
                <p>
                  You are about to <strong>{actionType.toLowerCase()}</strong> the leave request for <strong>{selectedGroup?.full_name}</strong>.
                </p>
                <p className="lm-action-dates">
                  Dates: <strong>{formatDateOnly(selectedGroup?.start_date)}</strong> to <strong>{formatDateOnly(selectedGroup?.end_date)}</strong> ({selectedGroup?.request_count} days)
                </p>
              </div>

              <div className="expert-form-group">
                <label>Administrator Remarks (Optional)</label>
                <textarea
                  rows="3"
                  className="expert-clean-input border"
                  placeholder="Add any comments (visible to the employee)..."
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  disabled={processing}
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