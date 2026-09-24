// src/pages/OvertimeRequests.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Clock, CheckCircle, XCircle, ClipboardList, ChevronLeft, ChevronRight, Paperclip, Search, X, Eye } from 'lucide-react';
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

const OvertimeRequests = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [historyRequests, setHistoryRequests] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [pendingSearch, setPendingSearch] = useState('');
  const [requests, setRequests] = useState([]);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [loadingPending, setLoadingPending] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const [viewingRequest, setViewingRequest] = useState(null);

  const [historyPage, setHistoryPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => { setHistoryPage(1); }, [searchQuery]);
  useEffect(() => { setPendingPage(1); }, [pendingSearch]);

  useEffect(() => {
    fetchAllHistory();
    fetchPending();
  }, []);

  const fetchAllHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API_BASE}/overtime-requests/all`, getAuthHeaders());
      const sorted = res.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
      const sorted = res.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setRequests(sorted);
      setPendingCount(sorted.length);
    } catch (err) {
      toast.error('Failed to load pending requests');
    } finally {
      setLoadingPending(false);
    }
  };

  const handleAction = async (id, status) => {
    try {
      await axios.put(`${API_BASE}/overtime-requests/${id}/status`, { status }, getAuthHeaders());
      toast.success(`Request ${status}`);
      fetchPending(); 
      fetchAllHistory();
      setViewingRequest(null);
    } catch (err) {
      toast.error(`Failed to ${status} request`);
    }
  };

  const getScenarioLabel = (scenario) => {
    switch (scenario) {
      case 'future': return 'Future Date';
      case 'ongoing': return 'Ongoing Shift';
      case 'after_shift': return 'After Shift';
      case 'early_ot': return 'Early OT';
      case 'normal_ot': return 'Normal OT';
      default: return scenario || '—';
    }
  };

  const filteredHistory = historyRequests.filter(r => 
    !searchQuery || 
    r.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.employee_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPending = requests.filter(r => 
    !pendingSearch || 
    r.full_name?.toLowerCase().includes(pendingSearch.toLowerCase()) || 
    r.employee_id?.toLowerCase().includes(pendingSearch.toLowerCase())
  );

  const historyTotalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const currentHistory = filteredHistory.slice((historyPage - 1) * itemsPerPage, historyPage * itemsPerPage);

  const pendingTotalPages = Math.ceil(filteredPending.length / itemsPerPage);
  const currentPending = filteredPending.slice((pendingPage - 1) * itemsPerPage, pendingPage * itemsPerPage);

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

      <div className="ot-search-card" style={{ padding: '12px 20px' }}>
        <div className="ot-search-row">
          <div className="ot-search-input-group" style={{ maxWidth: '400px' }}>
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
      </div>

      <div className="ot-card">
        {loadingHistory ? (
          <div className="ot-loading">Loading overtime history...</div>
        ) : filteredHistory.length === 0 ? (
          <div className="ot-empty">No historical records match your criteria.</div>
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
                      <td className="whitespace-nowrap"><span className="ot-chip default">{req.overtime_type || 'Regular Overtime'}</span></td>
                      <td className="text-center whitespace-nowrap">
                        <span className={`ot-chip ${req.status?.toLowerCase() === 'approved' ? 'success' : req.status?.toLowerCase() === 'rejected' ? 'danger' : req.status?.toLowerCase() === 'cancelled' ? 'default' : 'warning'}`}>
                          {req.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <button className="ot-action-inspect-btn" onClick={() => setViewingRequest(req)} title="View Details">
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
                <span className="ot-page-info">Showing {(historyPage - 1) * itemsPerPage + 1} to {Math.min(historyPage * itemsPerPage, filteredHistory.length)} of {filteredHistory.length} entries</span>
                <div className="ot-page-controls">
                  <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1} className="ot-page-btn"><ChevronLeft size={16} /> Prev</button>
                  <span className="ot-page-current">{historyPage} / {historyTotalPages}</span>
                  <button onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))} disabled={historyPage === historyTotalPages} className="ot-page-btn">Next <ChevronRight size={16} /></button>
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
              <div className="ot-custom-request-card" style={{ boxShadow: 'none', border: 'none', padding: 0 }}>
                <div className="ot-custom-req-top">
                  <div>
                    <span className="ot-custom-name">{viewingRequest.full_name}</span>
                    <span className="ot-custom-id-tag">{viewingRequest.employee_id}</span>
                  </div>
                  <span className={`ot-chip ${viewingRequest.status?.toLowerCase() === 'approved' ? 'success' : viewingRequest.status?.toLowerCase() === 'rejected' ? 'danger' : 'warning'}`}>
                    {viewingRequest.status?.toUpperCase()}
                  </span>
                </div>
                
                <div className="ot-custom-details-grid">
                  <div className="ot-custom-prop">
                    <label>Type</label>
                    <span>{viewingRequest.overtime_type || 'Regular Overtime'}</span>
                  </div>
                  <div className="ot-custom-prop">
                    <label>Timing</label>
                    <span className="nowrap">{getScenarioLabel(viewingRequest.scenario_type)}</span>
                  </div>
                  <div className="ot-custom-prop">
                    <label>Date</label>
                    <span className="nowrap">{formatDate(viewingRequest.date)}</span>
                  </div>
                  <div className="ot-custom-prop">
                    <label>Time</label>
                    <span className="nowrap">{formatTo12Hour(viewingRequest.start_time)} – {formatTo12Hour(viewingRequest.end_time)}</span>
                  </div>
                  <div className="ot-custom-prop full-width">
                    <label>Submitted Date and Time</label>
                    <span>{new Date(viewingRequest.created_at).toLocaleString()}</span>
                  </div>
                  <div className="ot-custom-prop full-width">
                    <label>Reason / Remarks</label>
                    <span className="reason-text">{viewingRequest.reason || '—'}</span>
                  </div>
                  {viewingRequest.attachment && (
                    <div className="ot-custom-prop full-width">
                      <label>Proof</label>
                      <span>
                        <a href={`${API_BASE.replace(/\/api$/, '')}${viewingRequest.attachment}`} target="_blank" rel="noopener noreferrer" className="ot-link">
                          <Paperclip size={14} /> View Document Proof
                        </a>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="ot-custom-modal-footer">
              {viewingRequest.status === 'pending' && (
                <>
                  <button className="ot-btn-reject-custom" onClick={() => handleAction(viewingRequest.id, 'rejected')}>
                    <XCircle size={16} /> Reject
                  </button>
                  <button className="ot-btn-approve-custom" onClick={() => handleAction(viewingRequest.id, 'approved')}>
                    <CheckCircle size={16} /> Approve
                  </button>
                </>
              )}
              <button className="ot-btn-secondary" onClick={() => setViewingRequest(null)}>Close Window</button>
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
                <Search size={18} className="text-muted" />
                <input type="text" placeholder="Search Name or Employee ID..." value={pendingSearch} onChange={e => setPendingSearch(e.target.value)} className="ot-clean-input" />
                {pendingSearch && <X size={16} className="text-muted cursor-pointer" onClick={() => setPendingSearch('')} />}
              </div>

              {loadingPending ? (
                <div className="ot-loading">Loading pending requests...</div>
              ) : filteredPending.length === 0 ? (
                <div className="ot-empty">No pending overtime requests match your criteria.</div>
              ) : (
                <div className="ot-custom-requests-list">
                  {currentPending.map(req => (
                    <div key={req.id} className="ot-custom-request-card">
                      <div className="ot-custom-req-top">
                        <div>
                          <span className="ot-custom-name">{req.full_name}</span>
                          <span className="ot-custom-id-tag">{req.employee_id}</span>
                        </div>
                        <span className="ot-custom-scenario-pill">{req.overtime_type || 'Regular Overtime'} ({getScenarioLabel(req.scenario_type)})</span>
                      </div>
                      
                      <div className="ot-custom-details-grid">
                        <div className="ot-custom-prop">
                          <label>Date</label>
                          <span className="nowrap">{formatDate(req.date)}</span>
                        </div>
                        <div className="ot-custom-prop">
                          <label>Time Period</label>
                          <span className="nowrap">{formatTo12Hour(req.start_time)} – {formatTo12Hour(req.end_time)}</span>
                        </div>
                        <div className="ot-custom-prop full-width">
                          <label>Reason for Overtime</label>
                          <span className="reason-text">{req.reason}</span>
                        </div>
                        {req.attachment && (
                          <div className="ot-custom-prop full-width">
                            <label>Attached Document</label>
                            <span>
                              <a href={`${API_BASE.replace(/\/api$/, '')}${req.attachment}`} target="_blank" rel="noopener noreferrer" className="ot-link">
                                <Paperclip size={14} /> View Document Proof
                              </a>
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="ot-custom-req-actions">
                        <button className="ot-btn-reject-custom" onClick={() => handleAction(req.id, 'rejected')}>
                          <XCircle size={16} /> Reject Request
                        </button>
                        <button className="ot-btn-approve-custom" onClick={() => handleAction(req.id, 'approved')}>
                          <CheckCircle size={16} /> Approve Overtime
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ot-custom-modal-footer">
              <button className="ot-btn-secondary" onClick={() => setShowPendingModal(false)}>Close Window</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OvertimeRequests;