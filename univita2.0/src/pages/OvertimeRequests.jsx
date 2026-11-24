// src/pages/OvertimeRequests.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { ClipboardList, ChevronLeft, ChevronRight, Paperclip, Search, X, Eye, Clock3, CheckCircle2, XCircle, RefreshCw, FileClock } from 'lucide-react';
import { API_BASE } from '../api';
import { useRole } from '../permissions';
import './OvertimeRequests.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

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

// Current overtime requests support same-day intervals only.
// Compare the Philippine local wall clock with the selected overtime end.
const phNowTimestamp = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
};

const overtimeHasEnded = request => {
  const date = formatDate(String(request?.date || ''));
  const time = String(request?.end_time || '').slice(0, 8);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) return false;
  return `${date} ${time.length === 5 ? `${time}:00` : time}` <= phNowTimestamp();
};

const normalizeStatus = (status) => {
  const s = String(status || '').toLowerCase().trim();
  if (['pending', 'approved', 'rejected', 'cancelled'].includes(s)) return s;
  return 'unknown';
};

const formatStatusLabel = (status) => {
  const value = normalizeStatus(status);
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const getChipClass = (status) => {
  const s = normalizeStatus(status);
  if (s === 'approved') return 'success';
  if (s === 'rejected') return 'danger';
  if (s === 'cancelled') return 'default';
  if (s === 'unknown') return 'default';
  return 'warning';
};

const TABS = [
  { key: 'all',       label: 'All' },
  { key: 'approved',  label: 'Approved' },
  { key: 'rejected',  label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
];

const OvertimeRequests = () => {
  const { can, isAdmin } = useRole();
  const canApprove = can('overtime:approve');
  const canReject = can('overtime:reject');
  const canDecide = canApprove || canReject;

  const [searchQuery, setSearchQuery] = useState('');
  const [historyRequests, setHistoryRequests] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const [pendingSearch, setPendingSearch] = useState('');
  const [requests, setRequests] = useState([]);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [loadingPending, setLoadingPending] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const [viewingRequest, setViewingRequest] = useState(null);
  const [reviewingRequest, setReviewingRequest] = useState(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [evidenceVerified, setEvidenceVerified] = useState(false);
  const [reviewAction, setReviewAction] = useState('approved');
  const [processing, setProcessing] = useState(false);
  // Approval records an authorization; it does not prove actual clocked work.
  // HR should reconcile submitted evidence with attendance before approval.

  const [historyPage, setHistoryPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => { setHistoryPage(1); }, [searchQuery, activeTab]);
  useEffect(() => { setPendingPage(1); }, [pendingSearch]);

  useEffect(() => {
    fetchAllHistory();
    fetchPending();
  }, []);

  const fetchAllHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API_BASE}/overtime-requests/all`, getAuthHeaders());
      const sorted = (res.data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setHistoryRequests(sorted);
    } catch (err) {
      toast.error('Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchPending = async () => {
    setLoadingPending(true);
    try {
      const res = await axios.get(`${API_BASE}/overtime-requests/pending`, getAuthHeaders());
      const sorted = (res.data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setRequests(sorted);
      setPendingCount(sorted.length);
    } catch (err) {
      toast.error('Failed to load pending requests');
    } finally {
      setLoadingPending(false);
    }
  };

  const openReview = (req, action) => {
    // FIX 10.5 — defense-in-depth: only HR can open the review modal
    if (!can(action === 'approved' ? 'overtime:approve' : 'overtime:reject')) {
      toast.error('You do not have permission to perform this action.');
      return;
    }
    setReviewingRequest(req);
    setReviewAction(action);
    setReviewRemarks('');
    setEvidenceVerified(false);
  };

  const handleAction = async (id, status, remarks) => {
    // FIX 10.5 — defense-in-depth: reject API call if role lacks permission
    if (!can(status === 'approved' ? 'overtime:approve' : 'overtime:reject')) {
      toast.error('You do not have permission to perform this action.');
      return;
    }
    if (processing) return;
    if (status === 'approved' && !overtimeHasEnded(reviewingRequest)) {
      toast.error('The requested overtime must be completed before final approval. Keep it Pending.');
      return;
    }
    if (status === 'approved' && !evidenceVerified) {
      toast.error('Verify the actual overtime evidence before approving.');
      return;
    }
    if (status === 'rejected' && String(remarks || '').trim().length < 5) {
      toast.error('Please explain the rejection (minimum 5 characters).');
      return;
    }
    if (String(remarks || '').trim().length > 500) {
      toast.error('Review remarks must not exceed 500 characters.');
      return;
    }
    setProcessing(true);
    try {
      await axios.put(
        `${API_BASE}/overtime-requests/${id}/status`,
        { status, admin_remarks: remarks?.trim() || null, evidence_verified: status === 'approved' && evidenceVerified },
        getAuthHeaders()
      );
      toast.success(`Request ${status}`);
      fetchPending();
      fetchAllHistory();
      setViewingRequest(null);
      setReviewingRequest(null);
      setReviewRemarks('');
      setEvidenceVerified(false);
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${status} request`);
    } finally {
      setProcessing(false);
    }
  };

  const getScenarioLabel = (scenario) => {
    if (scenario === 'early_ot') return 'Early OT';
    if (scenario === 'normal_ot') return 'Normal OT';
    return scenario || '—';
  };

  const searchFiltered = historyRequests.filter(r =>
    !searchQuery ||
    r.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.employee_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const tabCounts = {
    all: searchFiltered.length,
    approved: searchFiltered.filter(r => normalizeStatus(r.status) === 'approved').length,
    rejected: searchFiltered.filter(r => normalizeStatus(r.status) === 'rejected').length,
    cancelled: searchFiltered.filter(r => normalizeStatus(r.status) === 'cancelled').length,
  };

  const filteredHistory = searchFiltered.filter(r => {
    if (activeTab === 'all') return true;
    return normalizeStatus(r.status) === activeTab;
  });

  const filteredPending = requests.filter(r =>
    !pendingSearch ||
    r.full_name?.toLowerCase().includes(pendingSearch.toLowerCase()) ||
    r.employee_id?.toLowerCase().includes(pendingSearch.toLowerCase())
  );

  const historyTotalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const currentHistory = filteredHistory.slice((historyPage - 1) * itemsPerPage, historyPage * itemsPerPage);

  const pendingTotalPages = Math.ceil(filteredPending.length / itemsPerPage);
  const currentPending = filteredPending.slice((pendingPage - 1) * itemsPerPage, pendingPage * itemsPerPage);

  const recordSummary = {
    total: historyRequests.length,
    approved: historyRequests.filter(r => normalizeStatus(r.status) === 'approved').length,
    rejected: historyRequests.filter(r => normalizeStatus(r.status) === 'rejected').length,
  };

  const emptyMessage = (() => {
    const tabLabel = activeTab === 'all' ? '' : `${activeTab} `;
    if (searchQuery) return `No ${tabLabel}overtime records match your search.`;
    return `No ${tabLabel}overtime records found.`;
  })();

  return (
    <div className="ot-container">
      <div className="ot-page-heading">
        <div>
         
        </div>
        <div className="ot-heading-actions">
          <button className="ot-btn-primary" onClick={() => setShowPendingModal(true)}>
            Pending Requests
            {pendingCount > 0 && <span className="ot-badge-count">{pendingCount}</span>}
          </button>
        </div>
      </div>

     
      <div className="ot-summary-grid" aria-label="Overtime request summary">
        <div className="ot-summary-card"><div className="ot-summary-top"><span>Total Requests</span></div><strong>{recordSummary.total}</strong></div>
        <div className="ot-summary-card"><div className="ot-summary-top"><span>Pending Review</span></div><strong>{pendingCount}</strong></div>
        <div className="ot-summary-card"><div className="ot-summary-top"><span>Approved</span></div><strong>{recordSummary.approved}</strong></div>
        <div className="ot-summary-card"><div className="ot-summary-top"><span>Rejected</span></div><strong>{recordSummary.rejected}</strong></div>
      </div>

      <section className="ot-records-section" aria-label="Overtime request records">
        <div className="ot-section-header">
          <div><p>Browse and filter previously submitted requests.</p></div>
          <span className="ot-record-count">{filteredHistory.length} record{filteredHistory.length !== 1 ? 's' : ''}</span>
        </div>
      {/* STATUS TABS */}
      <div className="ot-tabs" role="tablist" aria-label="Overtime status filter">
        {TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`ot-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            <span className="ot-tab-count">{tabCounts[tab.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* SEARCH CARD */}
      <div className="ot-search-card">
        <div className="ot-search-input-group">
          <Search size={18} className="text-muted" />
          <input
            type="text"
            placeholder="Search Name or Employee ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="ot-clean-input"
          />
          {searchQuery && <button type="button" className="ot-clear-search" aria-label="Clear search" onClick={() => setSearchQuery('')}><X size={16} /></button>}
        </div>
      </div>

      <div className="ot-card">
        {loadingHistory ? (
          <div className="ot-loading">Loading overtime history...</div>
        ) : filteredHistory.length === 0 ? (
          <div className="ot-empty">{emptyMessage}</div>
        ) : (
          <>
            <div className="ot-table-wrapper">
              <table className="ot-table">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Employee Name</th>
                    <th>Type</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentHistory.map(req => (
                    <tr key={req.id}>
                      <td className="font-mono text-xs text-muted whitespace-nowrap">{req.employee_id || '—'}</td>
                      <td className="font-semibold text-dark whitespace-nowrap">{req.full_name}</td>
                      <td className="whitespace-nowrap">
                        <span className="ot-chip default">{req.overtime_type || 'Regular Overtime'}</span>
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <span className={`ot-chip ${getChipClass(req.status)}`}>
                          {formatStatusLabel(req.status)}
                        </span>
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <button
                          className="ot-action-inspect-btn"
                          onClick={() => { setReviewRemarks(''); setViewingRequest(req); }}
                          title="View Details"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {historyTotalPages > 1 && (
              <div className="ot-pagination">
                <span className="ot-page-info">
                  Showing {(historyPage - 1) * itemsPerPage + 1} to {Math.min(historyPage * itemsPerPage, filteredHistory.length)} of {filteredHistory.length} entries
                </span>
                <div className="ot-page-controls">
                  <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1} className="ot-page-btn">
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <span className="ot-page-current">{historyPage} / {historyTotalPages}</span>
                  <button onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))} disabled={historyPage === historyTotalPages} className="ot-page-btn">
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      </section>

      {/* VIEW DETAILS MODAL */}
      {viewingRequest && (
        <div className="ot-custom-modal-backdrop" onClick={() => setViewingRequest(null)}>
          <div className="ot-custom-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="ot-custom-modal-header">
              <div className="ot-modal-title-block"><h3>Overtime Request Details</h3><p>Complete information for this overtime submission.</p></div>
              <button className="ot-custom-close-btn" aria-label="Close dialog" onClick={() => setViewingRequest(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="ot-custom-modal-body">
              <div className="ot-modal-wrapper">
                <div className="ot-user-profile-header">
                  <div className="ot-user-info-group">
                    <div className="ot-avatar-circle">
                      {viewingRequest.full_name ? viewingRequest.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className="ot-user-meta">
                      <span className="ot-user-name">{viewingRequest.full_name}</span>
                      <span className="ot-user-id">{viewingRequest.employee_id}</span>
                    </div>
                  </div>
                  <span className={`ot-status-dot ${normalizeStatus(viewingRequest.status)}`}>
                    {formatStatusLabel(viewingRequest.status)}
                  </span>
                </div>

                <div className="ot-custom-details-grid">
                  <div className="ot-detail-box">
                    <label>Date</label>
                    <span>{formatDate(viewingRequest.date)}</span>
                  </div>
                  <div className="ot-detail-box">
                    <label>Time Schedule</label>
                    <span>{formatTo12Hour(viewingRequest.start_time)} – {formatTo12Hour(viewingRequest.end_time)}</span>
                  </div>
                  <div className="ot-detail-box">
                    <label>Overtime Type</label>
                    <span>{viewingRequest.overtime_type || 'Regular'} ({getScenarioLabel(viewingRequest.scenario_type)})</span>
                  </div>
                  <div className="ot-detail-box">
                    <label>Submitted On</label>
                    <span>
                      {viewingRequest.created_at
                        ? new Date(viewingRequest.created_at).toLocaleString()
                        : '—'}
                    </span>
                  </div>
                  <div className="ot-detail-box full-width">
                    <label>Reason for Overtime</label>
                    <p>{viewingRequest.reason || '—'}</p>
                  </div>

                  {viewingRequest.admin_remarks && (
                    <div className="ot-detail-box full-width">
                      <label>Admin Remarks</label>
                      <p>{viewingRequest.admin_remarks}</p>
                    </div>
                  )}

                  {viewingRequest.attachment && (
                    <div className="ot-detail-box full-width">
                      <label>Attachment Document</label>
                      <div>
                        <a
                          href={`${API_BASE.replace(/\/api$/, '')}${viewingRequest.attachment}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ot-proof-action-btn"
                        >
                          View Attached Document
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* FIX 10.5 — inline action section hidden for non-HR; read-only hint for Admin */}
                {normalizeStatus(viewingRequest.status) === 'pending' && canDecide && (
                  <div style={{ marginTop: '0.75rem', borderTop: '1px solid #F1F5F9', paddingTop: '0.75rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block', marginBottom: '0.35rem' }}>
                      Review Remarks (required for rejection)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Add remarks visible to the employee..."
                      value={reviewRemarks}
                      onChange={e => setReviewRemarks(e.target.value)}
                      maxLength={500}
                      style={{
                        width: '100%', padding: '0.6rem', border: '1px solid #CBD5E1',
                        borderRadius: '8px', fontFamily: 'inherit', fontSize: '0.85rem',
                        marginBottom: '0.5rem', resize: 'vertical', outline: 'none',
                      }}
                    />
                    <div
                      className="ot-minimal-footer"
                      style={{ borderRadius: '8px', padding: 0, borderTop: 'none', background: 'transparent', justifyContent: 'flex-end' }}
                    >
                      <button
                        className="ot-btn-min-reject"
                        onClick={() => handleAction(viewingRequest.id, 'rejected', reviewRemarks)}
                        disabled={processing || !canReject || reviewRemarks.trim().length < 5}
                        style={{ opacity: processing ? 0.6 : 1, cursor: processing ? 'not-allowed' : 'pointer' }}
                      >
                        {processing ? 'Processing...' : 'Reject'}
                      </button>
                      <button
                        className="ot-btn-min-approve"
                        onClick={() => {
  openReview(viewingRequest, 'approved');
  setViewingRequest(null);
}}
                        disabled={processing || !canApprove}
                        style={{ opacity: processing ? 0.6 : 1, cursor: processing ? 'not-allowed' : 'pointer' }}
                      >
                        {processing ? 'Processing...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                )}

                {normalizeStatus(viewingRequest.status) === 'pending' && !canDecide && (
                  <div style={{
                    marginTop: '0.75rem', borderTop: '1px solid #F1F5F9', paddingTop: '0.75rem',
                    textAlign: 'center', fontSize: '0.8rem', color: '#64748B', fontStyle: 'italic'
                  }}>
                    Read-only — awaiting HR review
                  </div>
                )}
              </div>
            </div>

            <div className="ot-custom-modal-footer">
              <button className="ot-btn-secondary" onClick={() => setViewingRequest(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* PENDING OVERTIME REQUESTS MODAL */}
      {showPendingModal && (
        <div className="ot-custom-modal-backdrop" onClick={() => setShowPendingModal(false)}>
          <div className="ot-custom-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="ot-custom-modal-header">
              <div className="ot-modal-title-block"><h3>Pending Overtime Requests</h3><p>Review submitted requests and record your decision.</p></div>
              <button className="ot-custom-close-btn" aria-label="Close dialog" onClick={() => setShowPendingModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="ot-custom-modal-body">
              <div className="ot-search-input-group border" style={{ marginBottom: '1.25rem', maxWidth: '100%' }}>
                <Search size={16} className="text-muted" />
                <input
                  type="text"
                  placeholder="Search by Employee Name or ID..."
                  value={pendingSearch}
                  onChange={e => setPendingSearch(e.target.value)}
                  className="ot-clean-input"
                />
                {pendingSearch && <button type="button" className="ot-clear-search" aria-label="Clear pending search" onClick={() => setPendingSearch('')}><X size={16} /></button>}
              </div>

              {loadingPending ? (
                <div className="ot-loading">Loading pending requests...</div>
              ) : filteredPending.length === 0 ? (
                <div className="ot-empty">No pending overtime requests match your criteria.</div>
              ) : (
                <div className="ot-minimal-list">
                  {currentPending.map(req => (
                    <div key={req.id} className="ot-minimal-card">
                      <div className="ot-minimal-header">
                        <div className="ot-minimal-user">
                          <div className="ot-minimal-avatar">
                            {req.full_name ? req.full_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div className="ot-minimal-user-info">
                            <span className="ot-minimal-name">{req.full_name}</span>
                            <span className="ot-minimal-id">{req.employee_id}</span>
                          </div>
                        </div>
                        <span className="ot-minimal-type-badge">
                          {req.overtime_type || 'Regular OT'}
                        </span>
                      </div>

                      <div className="ot-minimal-body">
                        <div className="ot-minimal-grid">
                          <div className="ot-minimal-field">
                            <label>Date</label>
                            <span>{formatDate(req.date)}</span>
                          </div>
                          <div className="ot-minimal-field">
                            <label>Time</label>
                            <span>{formatTo12Hour(req.start_time)} – {formatTo12Hour(req.end_time)}</span>
                          </div>
                          <div className="ot-minimal-field">
                            <label>Scenario</label>
                            <span>{getScenarioLabel(req.scenario_type)}</span>
                          </div>
                        </div>

                        <div className="ot-minimal-field full-width" style={{ marginTop: '0.5rem' }}>
                          <label>Reason</label>
                          <p>{req.reason}</p>
                        </div>

                        {req.attachment && (
                          <div className="ot-minimal-field full-width">
                            <a
                              href={`${API_BASE.replace(/\/api$/, '')}${req.attachment}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ot-minimal-link"
                            >
                              View Attached Document
                            </a>
                          </div>
                        )}
                      </div>

                      {/* FIX 10.5 — Approve/Reject only for HR */}
                      {canDecide ? (
                        <div className="ot-minimal-footer">
                          {canReject && <button className="ot-btn-min-reject" onClick={() => openReview(req, 'rejected')}>Reject</button>}
                          {canApprove && <button className="ot-btn-min-approve" onClick={() => openReview(req, 'approved')}>Approve</button>}
                        </div>
                      ) : (
                        <div className="ot-minimal-footer" style={{ justifyContent: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748B', fontStyle: 'italic' }}>Read-only — awaiting HR review</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ot-custom-modal-footer">
              <button className="ot-btn-secondary" onClick={() => setShowPendingModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW CONFIRMATION MODAL — only reachable via HR-gated openReview */}
      {reviewingRequest && (
        <div className="ot-custom-modal-backdrop" onClick={() => setReviewingRequest(null)}>
          <div className="ot-custom-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="ot-custom-modal-header">
<div className="ot-modal-title-block"><h3>{reviewAction === 'approved' ? 'Approve' : 'Reject'} Overtime Request</h3><p>Confirm the decision before updating this request.</p></div>
              <button className="ot-custom-close-btn" aria-label="Close dialog" onClick={() => setReviewingRequest(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="ot-custom-modal-body">
              <div className="ot-modal-wrapper">
                <div className="ot-user-profile-header">
                  <div className="ot-user-info-group">
                    <div className="ot-avatar-circle">
                      {reviewingRequest.full_name ? reviewingRequest.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className="ot-user-meta">
                      <span className="ot-user-name">{reviewingRequest.full_name}</span>
                      <span className="ot-user-id">{reviewingRequest.employee_id}</span>
                    </div>
                  </div>
                </div>

                <div className="ot-custom-details-grid">
                  <div className="ot-detail-box">
                    <label>Date</label>
                    <span>{formatDate(reviewingRequest.date)}</span>
                  </div>
                  <div className="ot-detail-box">
                    <label>Time</label>
                    <span>{formatTo12Hour(reviewingRequest.start_time)} – {formatTo12Hour(reviewingRequest.end_time)}</span>
                  </div>
                  <div className="ot-detail-box full-width">
                    <label>Reason</label>
                    <p>{reviewingRequest.reason || '—'}</p>
                  </div>

                  {reviewingRequest.attachment && (
                    <div className="ot-detail-box full-width">
                      <label>Attachment</label>
                      <div>
                        <a
                          href={`${API_BASE.replace(/\/api$/, '')}${reviewingRequest.attachment}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ot-proof-action-btn"
                        >
                          View Attached Document
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {reviewAction === 'approved' && (
                  <div style={{ marginTop: '0.75rem', padding: '12px', border: '1px solid #E2E8F0', borderRadius: 6, background: '#F8FAFC' }}>
                    {!overtimeHasEnded(reviewingRequest) && (
                      <p role="alert" style={{ color: '#B45309', fontSize: 12, margin: '0 0 8px' }}>
                        This overtime period has not ended. The request must remain Pending. You can reject it, or return to review it after the period ends.
                      </p>
                    )}
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12, lineHeight: 1.5, color: '#334155', cursor: overtimeHasEnded(reviewingRequest) ? 'pointer' : 'not-allowed' }}>
                      <input type="checkbox" checked={evidenceVerified} disabled={!overtimeHasEnded(reviewingRequest)}
                        onChange={e => setEvidenceVerified(e.target.checked)} style={{ marginTop: 3 }} />
                      I have verified that the requested overtime period has ended and reviewed the supporting work evidence or completed attendance record.
                    </label>
                  </div>
                )}
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block', marginBottom: '0.35rem' }}>
                    Admin Remarks (Visible to Employee)
                  </label>
                  <textarea
                    rows={3}
                    placeholder={reviewAction === 'rejected'
                      ? 'Explain why this request is being rejected...'
                      : 'Optional approval notes...'}
                    value={reviewRemarks}
                    maxLength={500}
                    onChange={e => setReviewRemarks(e.target.value)}
                    style={{
                      width: '100%', padding: '0.6rem', border: '1px solid #CBD5E1',
                      borderRadius: '8px', fontFamily: 'inherit', fontSize: '0.85rem',
                      resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="ot-custom-modal-footer">
              <button
                className="ot-btn-secondary"
                onClick={() => setReviewingRequest(null)}
                disabled={processing}
              >
                Cancel
              </button>
              <button
                className={reviewAction === 'approved' ? 'ot-btn-min-approve' : 'ot-btn-min-reject'}
                onClick={() => handleAction(reviewingRequest.id, reviewAction, reviewRemarks)}
                disabled={processing || (reviewAction === 'rejected' && reviewRemarks.trim().length < 5) || (reviewAction === 'approved' && (!overtimeHasEnded(reviewingRequest) || !evidenceVerified))}
                style={{ padding: '0.6rem 1rem', opacity: processing ? 0.6 : 1, cursor: processing ? 'not-allowed' : 'pointer' }}
              >
                {processing ? 'Processing...' : `Confirm ${reviewAction === 'approved' ? 'Approval' : 'Rejection'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OvertimeRequests;