import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import { CheckCircle, XCircle, ExternalLink, Scale, ClipboardList, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { API_BASE } from '../api';
import './AttendanceAppeals.css';

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

const AttendanceAppeals = () => {
  // Main Page States (History)
  const [searchQuery, setSearchQuery] = useState('');
  const [historyAppeals, setHistoryAppeals] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Modal States (Pending)
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingAppeals, setPendingAppeals] = useState([]);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [loadingPending, setLoadingPending] = useState(true);
  
  // Action Modals
  const [selectedAppeal, setSelectedAppeal] = useState(null);
  const [adminRemarks, setAdminRemarks] = useState('');
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [actionType, setActionType] = useState('');
  const [processing, setProcessing] = useState(false);

  // Pagination States
  const [historyPage, setHistoryPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => { setHistoryPage(1); }, [searchQuery]);
  useEffect(() => { setPendingPage(1); }, [pendingSearch]);

  useEffect(() => {
    fetchHistoryAppeals();
    fetchPendingAppeals();
  }, []);

  const fetchHistoryAppeals = async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API_BASE}/attendance-appeals/history`, getAuthHeaders());
      const sorted = res.data.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      setHistoryAppeals(sorted);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchPendingAppeals = async () => {
    setLoadingPending(true);
    try {
      const res = await axios.get(`${API_BASE}/attendance-appeals/pending`, getAuthHeaders());
      const sorted = res.data.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      setPendingAppeals(sorted);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load pending appeals');
    } finally {
      setLoadingPending(false);
    }
  };

  const openRemarkModal = (appeal, action) => {
    setSelectedAppeal(appeal);
    setActionType(action);
    setAdminRemarks('');
    setShowRemarkModal(true);
  };

  const updateAppealStatus = async () => {
    if (!selectedAppeal) return;
    setProcessing(true);
    try {
      await axios.put(`${API_BASE}/attendance-appeals/${selectedAppeal.id}/status`, {
        status: actionType,
        admin_remarks: adminRemarks || null,
      }, getAuthHeaders());
      toast.success(`Appeal ${actionType === 'approved' ? 'approved' : 'rejected'} successfully.`);
      setShowRemarkModal(false);
      fetchPendingAppeals();
      fetchHistoryAppeals(); // Refresh main table
    } catch (err) {
      console.error(err);
      toast.error('Failed to update appeal status. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // Instant Filtering
  const filteredHistory = historyAppeals.filter(r => 
    !searchQuery || 
    r.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.employee_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPending = pendingAppeals.filter(r => 
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
    <div className="aa-container">
      <div className="aa-header">
        <div className="aa-title-group">
          
          <div>
            
            <p className="aa-subtitle">Review historical and resolved employee attendance disputes.</p>
          </div>
        </div>
        <button className="aa-btn-secondary" onClick={() => setShowPendingModal(true)}>
          <ClipboardList size={16} /> Pending Requests
        </button>
      </div>

      <div className="aa-search-card" style={{ padding: '12px 20px' }}>
        <div className="aa-search-row">
          <div className="aa-search-input-group" style={{ maxWidth: '400px' }}>
            <Search size={18} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search Name or Employee ID..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="aa-clean-input" 
            />
            {searchQuery && <X size={16} className="text-muted cursor-pointer" onClick={() => setSearchQuery('')} />}
          </div>
        </div>
      </div>

      <div className="aa-card">
        {loadingHistory ? (
          <div className="aa-loading">Loading appeal history...</div>
        ) : filteredHistory.length === 0 ? (
          <div className="aa-empty">No historical appeal records match your criteria.</div>
        ) : (
          <>
            <div className="aa-table-wrapper">
              <table className="aa-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Req. In</th>
                    <th>Req. Out</th>
                    <th className="text-center">Status</th>
                    <th>Admin Remarks</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {currentHistory.map((appeal) => (
                    <tr key={appeal.id}>
                      <td>
                        <div className="font-semibold text-dark">{appeal.full_name}</div>
                        <div className="text-xs text-muted">{appeal.employee_id}</div>
                      </td>
                      <td className="font-medium text-dark">{formatDate(appeal.date)}</td>
                      <td>{formatTime(appeal.requested_time_in)}</td>
                      <td>{formatTime(appeal.requested_time_out)}</td>
                      <td className="text-center">
                        <span className={`aa-chip ${appeal.status?.toLowerCase() === 'approved' ? 'success' : 'danger'}`}>
                          {appeal.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="max-w-xs truncate" title={appeal.admin_remarks}>{appeal.admin_remarks || '—'}</td>
                      <td className="text-xs text-muted">{new Date(appeal.submitted_at).toLocaleDateString()}</td>
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

      {/* PENDING REQUESTS MODAL */}
      <FormalModal show={showPendingModal} onClose={() => setShowPendingModal(false)} title="Pending Appeal Requests" wide footer={<button className="aa-btn-secondary" onClick={() => setShowPendingModal(false)}>Close Window</button>}>
        {loadingPending ? (
          <div className="aa-loading">Loading pending appeals...</div>
        ) : (
          <div className="aa-modal-content">
            <div className="aa-search-input-group border" style={{ marginBottom: '16px' }}>
              <Search size={18} className="text-muted" />
              <input type="text" placeholder="Search Name or Employee ID..." value={pendingSearch} onChange={e => setPendingSearch(e.target.value)} className="aa-clean-input" />
              {pendingSearch && <X size={16} className="text-muted cursor-pointer" onClick={() => setPendingSearch('')} />}
            </div>

            {filteredPending.length === 0 ? (
              <div className="aa-empty">No pending appeals match your criteria.</div>
            ) : (
              <>
                <div className="aa-table-wrapper" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                  <table className="aa-table">
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr>
                        <th>Employee</th>
                        <th>Date</th>
                        <th>Req. In</th>
                        <th>Req. Out</th>
                        <th>Reason</th>
                        <th className="text-center">Proof</th>
                        <th>Submitted</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPending.map((appeal) => (
                        <tr key={appeal.id}>
                          <td>
                            <div className="font-semibold text-dark">{appeal.full_name}</div>
                            <div className="text-xs text-muted">{appeal.employee_id}</div>
                          </td>
                          <td className="font-medium text-dark">{formatDate(appeal.date)}</td>
                          <td>{formatTime(appeal.requested_time_in)}</td>
                          <td>{formatTime(appeal.requested_time_out)}</td>
                          <td className="max-w-xs truncate" title={appeal.reason}>{appeal.reason}</td>
                          <td className="text-center">
                            {appeal.image_url ? (
                              <a href={`${API_BASE.replace(/\/api$/, '')}${appeal.image_url}`} target="_blank" rel="noopener noreferrer" className="aa-link">
                                <ExternalLink size={14} /> View
                              </a>
                            ) : <span className="text-muted">—</span>}
                          </td>
                          <td className="text-xs text-muted">{new Date(appeal.submitted_at).toLocaleString()}</td>
                          <td>
                            <div className="aa-action-group right">
                              <button className="aa-btn-icon success" onClick={() => openRemarkModal(appeal, 'approved')} title="Approve">
                                <CheckCircle size={18} />
                              </button>
                              <button className="aa-btn-icon danger" onClick={() => openRemarkModal(appeal, 'rejected')} title="Reject">
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
                  <div className="aa-pagination">
                    <span className="aa-page-info">Showing {(pendingPage - 1) * itemsPerPage + 1} to {Math.min(pendingPage * itemsPerPage, filteredPending.length)} of {filteredPending.length}</span>
                    <div className="aa-page-controls">
                      <button onClick={() => setPendingPage(p => Math.max(1, p - 1))} disabled={pendingPage === 1} className="aa-page-btn"><ChevronLeft size={16} /></button>
                      <span className="aa-page-current">{pendingPage} / {pendingTotalPages}</span>
                      <button onClick={() => setPendingPage(p => Math.min(pendingTotalPages, p + 1))} disabled={pendingPage === pendingTotalPages} className="aa-page-btn"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </FormalModal>

      {/* Approve/Reject Remarks Modal */}
      <FormalModal show={showRemarkModal} onClose={() => setShowRemarkModal(false)} title={`${actionType === 'approved' ? 'Approve' : 'Reject'} Appeal`} footer={
        <>
          <button className="aa-btn-secondary" onClick={() => setShowRemarkModal(false)} disabled={processing}>Cancel</button>
          <button className={`aa-btn-primary ${actionType === 'rejected' ? 'bg-red' : ''}`} onClick={updateAppealStatus} disabled={processing}>
            {processing ? 'Processing...' : actionType === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
          </button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Admin Remarks (Optional)</label>
          <textarea
            rows="4"
            placeholder="Enter justification or remarks..."
            value={adminRemarks}
            onChange={(e) => setAdminRemarks(e.target.value)}
            disabled={processing}
            className="aa-clean-input border"
            style={{ resize: 'vertical' }}
          />
        </div>
      </FormalModal>
    </div>
  );
};

export default AttendanceAppeals;