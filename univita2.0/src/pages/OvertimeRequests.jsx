// src/pages/OvertimeRequests.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { ClipboardList, ChevronLeft, ChevronRight, Paperclip, Search, X, Eye } from 'lucide-react';
import { API_BASE } from '../api';
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

// --- Status helpers: null-safe, case-insensitive, whitelist-normalized ---
const normalizeStatus = (status) => {
  const s = String(status || '').toLowerCase().trim();
  if (['pending', 'approved', 'rejected', 'cancelled'].includes(s)) return s;
  return 'pending';
};

const formatStatusLabel = (status) => normalizeStatus(status).toUpperCase();

const getChipClass = (status) => {
  const s = normalizeStatus(status);
  if (s === 'approved') return 'success';
  if (s === 'rejected') return 'danger';
  if (s === 'cancelled') return 'default';
  return 'warning';
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const OvertimeRequests = () => {
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
  const [reviewAction, setReviewAction] = useState('approved');
  const [processing, setProcessing] = useState(false);

  const [historyPage, setHistoryPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const itemsPerPage = 20;

  // Reset pagination when search OR tab changes
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
    setReviewingRequest(req);
    setReviewAction(action);
    setReviewRemarks('');
  };

  const handleAction = async (id, status, remarks) => {
    setProcessing(true);
    try {
      await axios.put(
        `${API_BASE}/overtime-requests/${id}/status`,
        { status, admin_remarks: remarks?.trim() || null },
        getAuthHeaders()
      );
      toast.success(`Request ${status}`);
      fetchPending();
      fetchAllHistory();
      setViewingRequest(null);
      setReviewingRequest(null);
      setReviewRemarks('');
    } catch (err) {
      // Surface backend validation messages (overlap, CTO min, invalid range, etc.)
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

  // 1) Apply search filter first
  const searchFiltered = historyRequests.filter(r =>
    !searchQuery ||
    r.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.employee_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 2) Compute tab counts from the search-filtered set so badges match what's visible
  const tabCounts = {
    all: searchFiltered.length,
    approved: searchFiltered.filter(r => normalizeStatus(r.status) === 'approved').length,
    rejected: searchFiltered.filter(r => normalizeStatus(r.status) === 'rejected').length,
  };

  // 3) Apply tab filter on top of search
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

  const emptyMessage = (() => {
    const tabLabel = activeTab === 'all' ? '' : `${activeTab} `;
    if (searchQuery) return `No ${tabLabel}overtime records match your search.`;
    return `No ${tabLabel}overtime records found.`;
  })();

  return (
    <div className="ot-container">
      <div className="ot-header">
        <div className="ot-title-group">
          <div>
            <p className="ot-subtitle">Review historical and processed overtime records.</p>
          </div>
        </div>
        <button className="ot-btn-secondary" onClick={() => setShowPendingModal(true)}>
          <ClipboardList size={16} /> Pending Requests
          {pendingCount > 0 && <span className="ot-badge-count">{pendingCount}</span>}
        </button>
      </div>

      {/* TAB BAR + SEARCH merged into a single control card */}
      <div className="ot-controls-card">
        <div className="ot-tab-bar" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`ot-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              <span className="ot-tab-count">{tabCounts[tab.key]}</span>
            </button>
          ))}
        </div>

        <div className="ot-search-input-group">
          <Search size={18} className="text-muted" />
          <input
            type="text"
            placeholder="Search Name or Employee ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="ot-clean-input"
          />
          {searchQuery && <X size={16} className="text-muted cursor-pointer" onClick={() => setSearchQuery('')} />}
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
                          <Eye size={16} color="#475569" />
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

      {/* VIEW DETAILS MODAL */}
      {viewingRequest && (
        <div className="ot-custom-modal-backdrop" onClick={() => setViewingRequest(null)}>
          <div className="ot-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="ot-custom-modal-header">
              <h3>Overtime Request Details</h3>
              <button className="ot-custom-close-btn" onClick={() => setViewingRequest(null)}>
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
                          <Paperclip size={14} /> View Attached Document
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {normalizeStatus(viewingRequest.status) === 'pending' && (
                  <div style={{ marginTop: '0.75rem', borderTop: '1px solid #F1F5F9', paddingTop: '0.75rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block', marginBottom: '0.35rem' }}>
                      Admin Remarks (Optional)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Add remarks visible to the employee..."
                      value={reviewRemarks}
                      onChange={e => setReviewRemarks(e.target.value)}
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
                        disabled={processing}
                        style={{ opacity: processing ? 0.6 : 1, cursor: processing ? 'not-allowed' : 'pointer' }}
                      >
                        {processing ? 'Processing...' : 'Reject'}
                      </button>
                      <button
                        className="ot-btn-min-approve"
                        onClick={() => handleAction(viewingRequest.id, 'approved', reviewRemarks)}
                        disabled={processing}
                        style={{ opacity: processing ? 0.6 : 1, cursor: processing ? 'not-allowed' : 'pointer' }}
                      >
                        {processing ? 'Processing...' : 'Approve'}
                      </button>
                    </div>
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
          <div className="ot-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="ot-custom-modal-header">
              <h3>Pending Overtime Requests</h3>
              <button className="ot-custom-close-btn" onClick={() => setShowPendingModal(false)}>
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
                {pendingSearch && <X size={16} className="text-muted cursor-pointer" onClick={() => setPendingSearch('')} />}
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
                              <Paperclip size={14} /> View Attached Document
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="ot-minimal-footer">
                        <button className="ot-btn-min-reject" onClick={() => openReview(req, 'rejected')}>Reject</button>
                        <button className="ot-btn-min-approve" onClick={() => openReview(req, 'approved')}>Approve</button>
                      </div>
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

      {/* REVIEW CONFIRMATION MODAL */}
      {reviewingRequest && (
        <div className="ot-custom-modal-backdrop" onClick={() => setReviewingRequest(null)}>
          <div className="ot-custom-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="ot-custom-modal-header">
              <h3>{reviewAction === 'approved' ? 'Approve' : 'Reject'} Overtime Request</h3>
              <button className="ot-custom-close-btn" onClick={() => setReviewingRequest(null)}>
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
                          <Paperclip size={14} /> View Attached Document
                        </a>
                      </div>
                    </div>
                  )}
                </div>

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
                disabled={processing}
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