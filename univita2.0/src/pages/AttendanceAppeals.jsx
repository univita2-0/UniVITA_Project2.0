// src/pages/AttendanceAppeals.jsx
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import { CheckCircle, XCircle, ExternalLink, ClipboardList, ChevronLeft, ChevronRight, Search, X, Eye } from 'lucide-react';
import { API_BASE, getWebApiErrorMessage } from '../api';
import { useRole } from '../permissions';
import './AttendanceAppeals.css';


// Presentation only: use consistent labels and semantic status colors.
const getDisplayStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();

  const labels = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled'
  };

  return labels[normalized] || (status ? String(status) : '—');
};

const getDisplayStatusTone = (status) => {
  switch (String(status || '').trim().toLowerCase()) {
    case 'approved':
      return 'success';
    case 'rejected':
      return 'danger';
    case 'pending':
      return 'warning';
    default:
      return 'default';
  }
};

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const useDebounce = (value, delay = 250) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return dateStr.split('T')[0];
};

const formatTo12Hour = (timeStr) => {
  if (!timeStr || timeStr === '--:--' || timeStr.includes('--')) return '—';
  const parts = timeStr.substring(0, 5).split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
};

const STATUS_TABS = [
  { key: 'all',       label: 'All' },
  { key: 'approved',  label: 'Approved' },
  { key: 'rejected',  label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
];

const AttendanceAppeals = () => {
  const { can } = useRole();
  const canReviewAppeals = can('appeals:review');

  const [searchQuery, setSearchQuery] = useState('');
  const [historyAppeals, setHistoryAppeals] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingAppeals, setPendingAppeals] = useState([]);
  const [c15FocusedId, setC15FocusedId] = useState(null);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [loadingPending, setLoadingPending] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const [selectedAppeal, setSelectedAppeal] = useState(null);
  const [viewingAppeal, setViewingAppeal] = useState(null);
  const [adminRemarks, setAdminRemarks] = useState('');
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [actionType, setActionType] = useState('');
  const [processing, setProcessing] = useState(false);
  const reviewingAppealRef = useRef(false); // C11: synchronously guard review submissions

  const [historyPage, setHistoryPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const itemsPerPage = 20;

  const [activeStatusTab, setActiveStatusTab] = useState('all');
  // C14.4: Bring HR pending status up to date when returning to browser tab.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      fetchPendingAppeals();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, []);


  const debouncedSearchQuery = useDebounce(searchQuery);
  const debouncedPendingSearch = useDebounce(pendingSearch);

  useEffect(() => { setHistoryPage(1); }, [debouncedSearchQuery, activeStatusTab]);
  useEffect(() => { setPendingPage(1); }, [debouncedPendingSearch]);

  useEffect(() => {
    fetchHistoryAppeals();
    fetchPendingAppeals();
  }, []);


  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setViewingAppeal(null);
      setShowPendingModal(false);
      setShowRemarkModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fetchHistoryAppeals = async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API_BASE}/attendance-appeals/history`, getAuthHeaders());
      const sorted = (res.data || []).sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      setHistoryAppeals(sorted);
    } catch (err) {
      toast.error('Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchPendingAppeals = async () => {
    setLoadingPending(true);
    try {
      const res = await axios.get(`${API_BASE}/attendance-appeals/pending`, getAuthHeaders());
      const sorted = (res.data || []).sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      setPendingAppeals(sorted);
      setPendingCount(sorted.length);
    } catch (err) {
      toast.error('Failed to load pending appeals');
    } finally {
      setLoadingPending(false);
    }
  };

  // C15: Resolve the exact pending appeal referenced by the dashboard notification.
  useEffect(() => {
    const raw = sessionStorage.getItem('c15_request_focus');
    if (!raw) return;
    let intent;
    try { intent = JSON.parse(raw); } catch (_) { sessionStorage.removeItem('c15_request_focus'); return; }
    if (intent?.kind !== 'appeal') return;
    sessionStorage.removeItem('c15_request_focus');
    if (!Number.isSafeInteger(intent.id) || intent.id <= 0) return;
    setC15FocusedId(intent.id);
    fetchPendingAppeals();
  }, []);

  useEffect(() => {
    if (!c15FocusedId || loadingPending) return;
    const matchingPending = pendingAppeals.find(a => Number(a.id) === c15FocusedId);
    if (matchingPending) {
      setViewingAppeal(matchingPending);
    } else {
      const matchingHistory = historyAppeals.find(a => Number(a.id) === c15FocusedId);
      if (matchingHistory) setViewingAppeal(matchingHistory);
      else if (!loadingHistory) toast.info('This appeal is not in the current request list.');
    }
    setC15FocusedId(null);
  }, [c15FocusedId, pendingAppeals, historyAppeals, loadingPending, loadingHistory]);

  const openRemarkModal = (appeal, action) => {
    // FIX 10.4 — defense-in-depth: only HR can open the review modal
    if (!canReviewAppeals) {
      toast.error('You do not have permission to review attendance appeals.');
      return;
    }
    setSelectedAppeal(appeal);
    setActionType(action);
    setAdminRemarks('');
    setViewingAppeal(null);
    setShowRemarkModal(true);
  };

  const confirmThenOpenRemark = (appeal, action) => {
    // FIX 10.4 — defense-in-depth: gate before confirmation dialog
    if (!canReviewAppeals) {
      toast.error('You do not have permission to review attendance appeals.');
      return;
    }
    // The review modal provides the single, explicit final confirmation.
    openRemarkModal(appeal, action);
  };

  const updateAppealStatus = async () => {
    if (reviewingAppealRef.current) return;
    // FIX 10.4 — defense-in-depth: reject API call if role lacks permission
    if (!canReviewAppeals) {
      toast.error('You do not have permission to review attendance appeals.');
      return;
    }
    if (!selectedAppeal) return;

    if (actionType === 'rejected' && adminRemarks.trim().length < 5) {
      toast.error('A rejection reason of at least 5 characters is required.');
      return;
    }

    if (adminRemarks.trim().length > 500) {
      toast.error('Remarks are too long (max 500 characters).');
      return;
    }

    reviewingAppealRef.current = true;
    setProcessing(true);
    try {
      await axios.put(`${API_BASE}/attendance-appeals/${selectedAppeal.id}/status`, {
        status: actionType,
        admin_remarks: adminRemarks.trim() || null,
      }, getAuthHeaders());
      toast.success(`Appeal ${actionType === 'approved' ? 'approved' : 'rejected'} successfully.`);
      setShowRemarkModal(false);
      fetchPendingAppeals();
      fetchHistoryAppeals();
    } catch (err) {
      toast.error(getWebApiErrorMessage(err, 'Failed to update appeal status. Please try again.'));
      if (err?.response?.status === 409) {
        await Promise.all([fetchPendingAppeals(), fetchHistoryAppeals()]);
      }
    } finally {
      reviewingAppealRef.current = false;
      setProcessing(false);
    }
  };

  const searchFilteredHistory = historyAppeals.filter(r =>
    !debouncedSearchQuery ||
    r.full_name?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
    r.employee_id?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
  );

  const tabCounts = {
    all: searchFilteredHistory.length,
    approved: searchFilteredHistory.filter(r => r.status?.toLowerCase() === 'approved').length,
    rejected: searchFilteredHistory.filter(r => r.status?.toLowerCase() === 'rejected').length,
    cancelled: searchFilteredHistory.filter(r => r.status?.toLowerCase() === 'cancelled').length,
  };

  const filteredHistory = searchFilteredHistory.filter(r => {
    if (activeStatusTab === 'all') return true;
    return r.status?.toLowerCase() === activeStatusTab;
  });

  const filteredPending = pendingAppeals.filter(r =>
    !debouncedPendingSearch ||
    r.full_name?.toLowerCase().includes(debouncedPendingSearch.toLowerCase()) ||
    r.employee_id?.toLowerCase().includes(debouncedPendingSearch.toLowerCase())
  );

  const historyTotalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const currentHistory = filteredHistory.slice((historyPage - 1) * itemsPerPage, historyPage * itemsPerPage);

  const pendingTotalPages = Math.ceil(filteredPending.length / itemsPerPage);
  const currentPending = filteredPending.slice((pendingPage - 1) * itemsPerPage, pendingPage * itemsPerPage);

  return (
    <div className="aa-container">
      
      <header className="aa-header">
        <div className="aa-title-group">
          
          <p className="aa-subtitle">Review employee disputes, supporting evidence, and finalized decisions.</p>
        </div>
        <button type="button" className="aa-btn-secondary aa-review-cta" onClick={() => { setShowPendingModal(true); fetchPendingAppeals(); }}>
          Pending requests
          {pendingCount > 0 && <span className="aa-badge-count">{pendingCount}</span>}
        </button>
      </header>

      <section className="aa-summary" aria-label="Appeals overview">
        <div className="aa-summary-item"><span>Total resolved</span><strong>{historyAppeals.length}</strong></div>
        <div className="aa-summary-item"><span>Pending review</span><strong>{pendingCount}</strong></div>
        <div className="aa-summary-item"><span>Approved</span><strong>{historyAppeals.filter(a => a.status?.toLowerCase() === 'approved').length}</strong></div>
        <div className="aa-summary-item"><span>Rejected</span><strong>{historyAppeals.filter(a => a.status?.toLowerCase() === 'rejected').length}</strong></div>
      </section>
      <div className="aa-section-intro"><div><p>Filter and inspect submitted attendance appeals.</p></div><span>{filteredHistory.length} records</span></div>

      {/* STATUS TABS */}
      <div className="aa-tabs" role="tablist" aria-label="Appeal status filter">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeStatusTab === tab.key}
            className={`aa-tab ${activeStatusTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveStatusTab(tab.key)}
          >
            {tab.label}
            <span className="aa-tab-count">{tabCounts[tab.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="aa-search-card">
        <div className="aa-search-row">
          <div className="aa-search-input-group">
            <Search size={18} className="text-muted" />
            <input
              type="text"
              placeholder="Search Name or Employee ID..."
              value={searchQuery}
              maxLength={100}
              onChange={e => setSearchQuery(e.target.value)}
              className="aa-clean-input"
            />
            {searchQuery && <button type="button" className="aa-input-clear" aria-label="Clear appeal search" onClick={() => setSearchQuery('')}><X size={16}/></button>}
          </div>
        </div>
      </div>

      <div className="aa-card">
        {loadingHistory ? (
          <div className="aa-loading">Loading appeal history...</div>
        ) : filteredHistory.length === 0 ? (
          <div className="aa-empty">
            {activeStatusTab === 'all'
              ? 'No historical appeal records match your criteria.'
              : `No ${activeStatusTab} appeals found${debouncedSearchQuery ? ' for your search' : ''}.`}
          </div>
        ) : (
          <>
            <div className="aa-table-wrapper">
              <table className="aa-table">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Employee Name</th>
                    <th>Date</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentHistory.map((appeal) => (
                    <tr key={appeal.id}>
                      <td className="font-mono text-xs text-muted whitespace-nowrap">{appeal.employee_id || '—'}</td>
                      <td className="font-semibold text-dark whitespace-nowrap">{appeal.full_name}</td>
                      <td className="font-medium text-dark whitespace-nowrap">{formatDate(appeal.date)}</td>
                      <td className="text-center whitespace-nowrap">
                        <span className={`aa-chip ${getDisplayStatusTone(appeal.status)}`}>
                          {getDisplayStatus(appeal.status)}
                        </span>
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <button className="aa-action-inspect-btn" onClick={() => setViewingAppeal(appeal)} title="View Details">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {historyTotalPages > 1 && (
              <div className="aa-pagination">
                <span className="aa-page-info">Showing {(historyPage - 1) * itemsPerPage + 1} to {Math.min(historyPage * itemsPerPage, filteredHistory.length)} of {filteredHistory.length} entries</span>
                <div className="aa-page-controls">
                  <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1} className="aa-page-btn"><ChevronLeft size={16} /> Prev</button>
                  <span className="aa-page-current">{historyPage} / {historyTotalPages}</span>
                  <button onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))} disabled={historyPage === historyTotalPages} className="aa-page-btn">Next <ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* VIEW DETAILS MODAL */}
      {viewingAppeal && (
        <div className="aa-custom-modal-backdrop" onClick={() => setViewingAppeal(null)}>
          <div className="aa-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="aa-custom-modal-header">
              <h3>Attendance Appeal Details</h3>
              <button className="aa-custom-close-btn" onClick={() => setViewingAppeal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="aa-custom-modal-body">
              <div className="aa-modal-wrapper">
                <div className="aa-user-profile-header">
                  <div className="aa-user-info-group">
                    <div className="aa-avatar-circle">
                      {viewingAppeal.full_name ? viewingAppeal.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className="aa-user-meta">
                      <span className="aa-user-name">{viewingAppeal.full_name}</span>
                      <span className="aa-user-id">{viewingAppeal.employee_id}</span>
                    </div>
                  </div>
                  <span className={`aa-chip ${getDisplayStatusTone(viewingAppeal.status)}`}>
                    {getDisplayStatus(viewingAppeal.status)}
                  </span>
                </div>

                <div className="aa-custom-details-grid">
                  <div className="aa-detail-box">
                    <label>Attendance Date</label>
                    <span>{formatDate(viewingAppeal.date)}</span>
                  </div>
                  <div className="aa-detail-box">
                    <label>Assigned Shift</label>
                    <span>{viewingAppeal.schedule_id ? `Schedule #${viewingAppeal.schedule_id}` : 'Not specified'}</span>
                  </div>
                  <div className="aa-detail-box">
                    <label>Submitted Date & Time</label>
                    <span>{viewingAppeal.submitted_at ? new Date(viewingAppeal.submitted_at).toLocaleString() : '—'}</span>
                  </div>
                  <div className="aa-detail-box">
                    <label>Requested Time In</label>
                    <span>{formatTo12Hour(viewingAppeal.requested_time_in)}</span>
                  </div>
                  <div className="aa-detail-box">
                    <label>Requested Time Out</label>
                    <span>{formatTo12Hour(viewingAppeal.requested_time_out)}</span>
                  </div>
                  <div className="aa-detail-box full-width">
                    <label>Dispute Reason</label>
                    <p className="reason-text">{viewingAppeal.reason || '—'}</p>
                  </div>
                  <div className="aa-detail-box full-width">
                    <label>Admin Remarks</label>
                    <p className="reason-text">{viewingAppeal.admin_remarks || '—'}</p>
                  </div>
                  {viewingAppeal.image_url && (
                    <div className="aa-detail-box full-width">
                      <label>Supporting Evidence</label>
                      <div>
                        <a href={`${API_BASE.replace(/\/api$/, '')}${viewingAppeal.image_url}`} target="_blank" rel="noopener noreferrer" className="aa-proof-action-btn">
                          View Supporting Image
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="aa-custom-modal-footer">
              {/* FIX 10.4 — Approve/Reject only for HR */}
              {viewingAppeal.status === 'pending' && canReviewAppeals && (
                <>
                  <button className="aa-btn-reject-custom" onClick={() => confirmThenOpenRemark(viewingAppeal, 'rejected')}>
                    <XCircle size={16} /> Reject
                  </button>
                  <button className="aa-btn-approve-custom" onClick={() => confirmThenOpenRemark(viewingAppeal, 'approved')}>
                    <CheckCircle size={16} /> Approve
                  </button>
                </>
              )}
              {viewingAppeal.status === 'pending' && !canReviewAppeals && (
                <span style={{ fontSize: '0.8rem', color: '#64748B', fontStyle: 'italic', marginRight: 'auto' }}>
                  Read-only — awaiting HR review
                </span>
              )}
              <button className="aa-btn-secondary" onClick={() => setViewingAppeal(null)}>Close Window</button>
            </div>
          </div>
        </div>
      )}

      {/* PENDING APPEALS MODAL */}
      {showPendingModal && (
        <div className="aa-custom-modal-backdrop" onClick={() => setShowPendingModal(false)}>
          <div className="aa-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="aa-custom-modal-header">
              <h3>Pending Appeal Requests</h3>
              <button className="aa-custom-close-btn" onClick={() => setShowPendingModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="aa-custom-modal-body">
              <div className="aa-search-input-group border" style={{ marginBottom: '1.25rem', maxWidth: '100%' }}>
                <Search size={18} className="text-muted" />
                <input
                  type="text"
                  placeholder="Search Name or Employee ID..."
                  value={pendingSearch}
                  maxLength={100}
                  onChange={e => setPendingSearch(e.target.value)}
                  className="aa-clean-input"
                />
                {pendingSearch && <button type="button" className="aa-input-clear" aria-label="Clear pending appeal search" onClick={() => setPendingSearch('')}><X size={16}/></button>}
              </div>

              {loadingPending ? (
                <div className="aa-loading">Loading pending appeals...</div>
              ) : filteredPending.length === 0 ? (
                <div className="aa-empty">No pending appeals match your criteria.</div>
              ) : (
                <div className="aa-minimal-list">
                  {currentPending.map(appeal => (
                    <div key={appeal.id} className="aa-minimal-card">
                      <div className="aa-minimal-header">
                        <div className="aa-minimal-user">
                          <div className="aa-minimal-avatar">
                            {appeal.full_name ? appeal.full_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div className="aa-minimal-user-info">
                            <span className="aa-minimal-name">{appeal.full_name}</span>
                            <span className="aa-minimal-id">{appeal.employee_id}</span>
                          </div>
                        </div>
                        <span className="aa-minimal-type-badge">{formatDate(appeal.date)}</span>
                      </div>

                      <div className="aa-minimal-body">
                        <div className="aa-minimal-grid">
                          <div className="aa-minimal-field">
                            <label>Assigned Shift</label>
                            <span>{appeal.schedule_id ? `Schedule #${appeal.schedule_id}` : 'Not specified'}</span>
                          </div>
                          <div className="aa-minimal-field">
                            <label>Requested Time In</label>
                            <span>{formatTo12Hour(appeal.requested_time_in)}</span>
                          </div>
                          <div className="aa-minimal-field">
                            <label>Requested Time Out</label>
                            <span>{formatTo12Hour(appeal.requested_time_out)}</span>
                          </div>
                        </div>

                        <div className="aa-minimal-field full-width" style={{ marginTop: '0.5rem' }}>
                          <label>Dispute Reason</label>
                          <p>{appeal.reason || '—'}</p>
                        </div>

                        {appeal.image_url && (
                          <div className="aa-minimal-field full-width">
                            <a href={`${API_BASE.replace(/\/api$/, '')}${appeal.image_url}`} target="_blank" rel="noopener noreferrer" className="aa-minimal-link">
                              View Supporting Image
                            </a>
                          </div>
                        )}
                      </div>

                      {/* FIX 10.4 — Approve/Reject only for HR */}
                      {canReviewAppeals ? (
                        <div className="aa-minimal-footer">
                          <button className="aa-btn-min-reject" onClick={() => confirmThenOpenRemark(appeal, 'rejected')}>Reject</button>
                          <button className="aa-btn-min-approve" onClick={() => confirmThenOpenRemark(appeal, 'approved')}>Approve</button>
                        </div>
                      ) : (
                        <div className="aa-minimal-footer" style={{ justifyContent: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748B', fontStyle: 'italic' }}>Read-only — awaiting HR review</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {pendingTotalPages > 1 && (
                <div className="aa-pagination" style={{ marginTop: '1rem' }}>
                  <span className="aa-page-info">Showing {(pendingPage - 1) * itemsPerPage + 1} to {Math.min(pendingPage * itemsPerPage, filteredPending.length)} of {filteredPending.length}</span>
                  <div className="aa-page-controls">
                    <button onClick={() => setPendingPage(p => Math.max(1, p - 1))} disabled={pendingPage === 1} className="aa-page-btn"><ChevronLeft size={16} /> Prev</button>
                    <span className="aa-page-current">{pendingPage} / {pendingTotalPages}</span>
                    <button onClick={() => setPendingPage(p => Math.min(pendingTotalPages, p + 1))} disabled={pendingPage === pendingTotalPages} className="aa-page-btn">Next <ChevronRight size={16} /></button>
                  </div>
                </div>
              )}
            </div>

            <div className="aa-custom-modal-footer">
              <button className="aa-btn-secondary" onClick={() => setShowPendingModal(false)}>Close Window</button>
            </div>
          </div>
        </div>
      )}

      {/* REMARK MODAL — reachable only via HR-gated confirmThenOpenRemark */}
      <FormalModal show={showRemarkModal} onClose={() => !processing && setShowRemarkModal(false)} title={`${actionType === 'approved' ? 'Approve' : 'Reject'} Appeal`} footer={
        <>
          <button className="aa-btn-secondary" onClick={() => setShowRemarkModal(false)} disabled={processing}>Cancel</button>
          <button className={`aa-btn-primary ${actionType === 'rejected' ? 'bg-red' : ''}`} onClick={updateAppealStatus} disabled={processing}>
            {processing ? 'Processing...' : actionType === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
          </button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Review Remarks {actionType === 'rejected' ? '(Required: 5–500 characters)' : '(Optional, max 500 characters)'}</label>
          <textarea
            rows="4"
            maxLength={500}
            placeholder="Enter justification or remarks..."
            value={adminRemarks}
            onChange={(e) => setAdminRemarks(e.target.value)}
            disabled={processing}
            className="aa-clean-input border"
            style={{ resize: 'vertical' }}
          />
          <small style={{ fontSize: '0.7rem', color: adminRemarks.length > 500 ? '#DC2626' : '#64748B' }}>
            {adminRemarks.length} / 500
          </small>
        </div>
      </FormalModal>
    </div>
  );
};

export default AttendanceAppeals;