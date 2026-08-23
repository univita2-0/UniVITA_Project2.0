import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Clock, CheckCircle, XCircle, ClipboardList, ChevronLeft, ChevronRight, Paperclip, Search, X } from 'lucide-react';
import { API_BASE } from '../api';
import FormalModal from '../components/FormalModal';
import './OvertimeRequests.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return dateStr.split('T')[0];
};

const formatTime = (timeStr) => {
  if (!timeStr) return '—';
  return timeStr.substring(0, 5);
};

const OvertimeRequests = () => {
  // Main Page States (History)
  const [searchQuery, setSearchQuery] = useState('');
  const [historyRequests, setHistoryRequests] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Modal States (Pending)
  const [pendingSearch, setPendingSearch] = useState('');
  const [requests, setRequests] = useState([]);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [loadingPending, setLoadingPending] = useState(true);

  // Pagination States
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
      // Sort newest to oldest
      const sorted = res.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setHistoryRequests(sorted);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchPending = async () => {
    setLoadingPending(true);
    try {
      const res = await axios.get(`${API_BASE}/overtime-requests/pending`, getAuthHeaders());
      // Sort newest to oldest
      const sorted = res.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setRequests(sorted);
    } catch (err) {
      console.error(err);
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
      fetchAllHistory(); // Refresh main table to show the newly processed request
    } catch (err) {
      console.error(err);
      toast.error(`Failed to ${status} request`);
    }
  };

  const getScenarioLabel = (scenario) => {
    switch (scenario) {
      case 'future': return 'Future Date';
      case 'ongoing': return 'Ongoing Shift';
      case 'after_shift': return 'After Shift';
      default: return scenario || '—';
    }
  };

  // Instant Client-Side Filtering
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

  // Pagination Logic
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
                    <th>Date</th>
                    <th>Employee</th>
                    <th>Scenario</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {currentHistory.map(req => (
                    <tr key={req.id}>
                      <td className="font-medium text-dark">{formatDate(req.date)}</td>
                      <td>
                        <div className="font-semibold text-dark">{req.full_name}</div>
                        <div className="text-xs text-muted">{req.employee_id}</div>
                      </td>
                      <td><span className="ot-chip default">{getScenarioLabel(req.scenario_type)}</span></td>
                      <td>{formatTime(req.start_time)} – {formatTime(req.end_time)}</td>
                      <td>
                        <span className={`ot-chip ${req.status?.toLowerCase() === 'approved' ? 'success' : req.status?.toLowerCase() === 'rejected' ? 'danger' : 'warning'}`}>
                          {req.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-xs text-muted">{new Date(req.created_at).toLocaleString()}</td>
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

      {/* PENDING REQUESTS MODAL */}
      <FormalModal show={showPendingModal} onClose={() => setShowPendingModal(false)} title="Pending Overtime Requests" wide footer={<button className="ot-btn-secondary" onClick={() => setShowPendingModal(false)}>Close Window</button>}>
        {loadingPending ? (
          <div className="ot-loading">Loading pending requests...</div>
        ) : (
          <div className="ot-modal-content">
            <div className="ot-search-input-group border" style={{ marginBottom: '16px' }}>
              <Search size={18} className="text-muted" />
              <input type="text" placeholder="Search Name or Employee ID..." value={pendingSearch} onChange={e => setPendingSearch(e.target.value)} className="ot-clean-input" />
              {pendingSearch && <X size={16} className="text-muted cursor-pointer" onClick={() => setPendingSearch('')} />}
            </div>

            {filteredPending.length === 0 ? (
              <div className="ot-empty">No pending overtime requests match your criteria.</div>
            ) : (
              <>
                <div className="ot-table-wrapper" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                  <table className="ot-table">
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr>
                        <th>Employee</th>
                        <th>Date</th>
                        <th>Scenario</th>
                        <th>Time Period</th>
                        <th>Reason</th>
                        <th className="text-center">Proof</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPending.map(req => (
                        <tr key={req.id}>
                          <td>
                            <div className="ot-emp-name">{req.full_name}</div>
                            <div className="ot-emp-id">{req.employee_id}</div>
                          </td>
                          <td className="font-medium text-dark">{formatDate(req.date)}</td>
                          <td><span className="ot-chip default">{getScenarioLabel(req.scenario_type)}</span></td>
                          <td>{formatTime(req.start_time)} – {formatTime(req.end_time)}</td>
                          <td className="max-w-xs truncate" title={req.reason}>{req.reason}</td>
                          <td className="text-center">
                            {req.attachment ? (
                              <a href={`${API_BASE.replace('/api', '')}${req.attachment}`} target="_blank" rel="noopener noreferrer" className="ot-link">
                                <Paperclip size={14} /> View
                              </a>
                            ) : <span className="text-muted">—</span>}
                          </td>
                          <td>
                            <div className="ot-action-group right">
                              <button className="ot-btn-icon success" onClick={() => handleAction(req.id, 'approved')} title="Approve">
                                <CheckCircle size={18} />
                              </button>
                              <button className="ot-btn-icon danger" onClick={() => handleAction(req.id, 'rejected')} title="Reject">
                                <XCircle size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {pendingTotalPages > 1 && (
                  <div className="ot-pagination">
                    <span className="ot-page-info">Showing {(pendingPage - 1) * itemsPerPage + 1} to {Math.min(pendingPage * itemsPerPage, filteredPending.length)} of {filteredPending.length}</span>
                    <div className="ot-page-controls">
                      <button onClick={() => setPendingPage(p => Math.max(1, p - 1))} disabled={pendingPage === 1} className="ot-page-btn"><ChevronLeft size={16} /></button>
                      <span className="ot-page-current">{pendingPage} / {pendingTotalPages}</span>
                      <button onClick={() => setPendingPage(p => Math.min(pendingTotalPages, p + 1))} disabled={pendingPage === pendingTotalPages} className="ot-page-btn"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </FormalModal>
    </div>
  );
};

export default OvertimeRequests;