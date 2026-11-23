import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';
import { getUserRole } from '../permissions';
import './ManageRequest.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
};

const formatTime = (timeStr) => {
  if (!timeStr || timeStr === '--:--' || timeStr.includes('--')) return '—';
  const parts = timeStr.substring(0, 5).split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
};


// Display-only status presentation: API status values remain unchanged.
const getDisplayStatus = (value) => {
  const normalized = String(value || 'pending').trim().toLowerCase();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/_/g, ' ') : 'Pending';
};

const getStatusTone = (value) => {
  const status = String(value || 'pending').trim().toLowerCase();
  if (['approved', 'completed'].includes(status)) return 'success';
  if (['rejected', 'cancelled'].includes(status)) return 'danger';
  return 'pending';
};

const ManageRequest = () => {
  const currentUserRole = getUserRole();
  const isAdmin = currentUserRole === 'admin';
  const isSecurity = currentUserRole === 'security';
  const canWrite = isAdmin || isSecurity; 

  const [historyData, setHistoryData] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [activeHistoryTab, setActiveHistoryTab] = useState('all');

  const [pendingData, setPendingData] = useState([]);
  const [pendingSearch, setPendingSearch] = useState('');
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [loadingPending, setLoadingPending] = useState(true);

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [additionalVisitors, setAdditionalVisitors] = useState([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showPendingDetailsModal, setShowPendingDetailsModal] = useState(false);
  const [showHistoryDetailsModal, setShowHistoryDetailsModal] = useState(false);
  const [showEditScheduleModal, setShowEditScheduleModal] = useState(false);

  const [rejectionReason, setRejectionReason] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isPastAppointment, setIsPastAppointment] = useState(false);

  const [historyPage, setHistoryPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => { setHistoryPage(1); }, [historySearch, activeHistoryTab]);
  useEffect(() => { setPendingPage(1); }, [pendingSearch]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API_BASE}/appointments/history`, getAuthHeaders());
      const sorted = res.data.sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date));
      setHistoryData(sorted);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load request history.');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await axios.get(`${API_BASE}/appointments/pending`, getAuthHeaders());
      const sorted = (res.data || []).sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date));
      setPendingData(sorted);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load pending requests');
    } finally {
      setLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchPending();
  }, [fetchHistory, fetchPending]);

  const fetchAdditionalVisitors = async (appointmentId) => {
    try {
      const res = await axios.get(`${API_BASE}/appointments/${appointmentId}/visitors`, getAuthHeaders());
      return res.data || [];
    } catch (err) {
      console.error('Error fetching visitors:', err);
      return [];
    }
  };

  const openPendingDetails = async (request) => {
    setSelectedRequest(request);
    const visitors = await fetchAdditionalVisitors(request.id);
    setAdditionalVisitors(visitors);
    setShowPendingDetailsModal(true);
  };

  const openRejectModal = (request) => {
    if (!isAdmin) {
      toast.error('Only System Administrators can reject visit requests.');
      return;
    }
    setSelectedRequest(request);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleApprove = async (req) => {
    if (!isAdmin) {
      toast.error('Only System Administrators can approve visit requests.');
      return;
    }
    const currentAdminId = localStorage.getItem('user_id');
    if (!currentAdminId) return toast.error("Session Error: Please logout and login again.");

    setPendingData(prev => prev.filter(item => item.id !== req.id));
    setShowPendingDetailsModal(false);
    toast.info('Processing approval and notifying visitor...', { autoClose: 2500 });

    try {
      await axios.put(`${API_BASE}/appointments/${req.id}/status`, {
        status: 'APPROVED',
        adminNotes: '',
        visitorEmail: req.email,
        visitorName: `${req.first_name || ''} ${req.last_name || ''}`,
        adminId: currentAdminId
      }, getAuthHeaders());

      toast.success('Visit request approved successfully!');
      fetchHistory();
    } catch (err) {
      console.error(err);
      toast.error('Failed to approve request.');
      fetchPending();
    }
  };

  const handleRejectConfirm = async () => {
    if (!isAdmin) return;
    if (!rejectionReason.trim()) return toast.warning('Please provide a reason for rejection.');
    const currentAdminId = localStorage.getItem('user_id');
    if (!currentAdminId) return toast.error("Session Error: Please logout and login again.");

    const targetReq = selectedRequest;
    const currentReason = rejectionReason;

    setPendingData(prev => prev.filter(item => item.id !== targetReq.id));
    setShowRejectModal(false);
    setShowPendingDetailsModal(false);
    setSelectedRequest(null);
    setRejectionReason('');
    toast.info('Processing rejection and notifying visitor...', { autoClose: 2500 });

    try {
      await axios.put(`${API_BASE}/appointments/${targetReq.id}/status`, {
        status: 'REJECTED',
        adminNotes: currentReason,
        visitorEmail: targetReq.email,
        visitorName: `${targetReq.first_name || ''} ${targetReq.last_name || ''}`,
        adminId: currentAdminId
      }, getAuthHeaders());

      toast.success('Visit request rejected successfully.');
      fetchHistory();
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject request.');
      fetchPending();
    }
  };

  const openHistoryDetails = async (appointment) => {
    setSelectedRequest(appointment);
    const visitors = await fetchAdditionalVisitors(appointment.id);
    setAdditionalVisitors(visitors);
    setShowHistoryDetailsModal(true);
  };

  const openEditScheduleModal = async (appointment) => {
    if (!isAdmin) {
      toast.error('Only Administrators can reschedule appointments.');
      return;
    }
    setSelectedRequest(appointment);
    const visitDate = appointment.visit_date?.split('T')[0] || '';
    setEditDate(visitDate);
    setEditTime(appointment.visit_time?.substring(0, 5) || '');
    setRescheduleReason('');

    const today = new Date().toISOString().split('T')[0];
    setIsPastAppointment(visitDate < today);

    const visitors = await fetchAdditionalVisitors(appointment.id);
    setAdditionalVisitors(visitors);
    setShowEditScheduleModal(true);
  };

  const handleHistoryUpdate = async () => {
    if (!isAdmin) return toast.error('Only Administrators can reschedule appointments.');
    if (!editDate || !editTime) return toast.warning('Please provide both date and time.');
    const [year, month, day] = editDate.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const mins = Number(editTime.slice(0, 2)) * 60 + Number(editTime.slice(3, 5));
    if (weekday === 0 || mins < 480 || (weekday === 6 ? mins >= 720 : mins >= 1020)) {
      return toast.warning(weekday === 0 ? 'Appointments are unavailable on Sundays.' : 'Select a time within HCT Academy visiting hours.');
    }

    const targetReq = selectedRequest;
    toast.info('Updating schedule and notifying visitor...', { autoClose: 2500 });

    try {
      await axios.put(`${API_BASE}/appointments/${targetReq.id}`, {
        visit_date: editDate,
        visit_time: editTime,
        admin_notes: rescheduleReason
      }, getAuthHeaders());

      toast.success('Appointment schedule updated!');
      setShowEditScheduleModal(false);
      fetchHistory();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to update schedule.');
    }
  };

  const approvedCount = historyData.filter(item => ['approved', 'completed'].includes(item.status?.toLowerCase())).length;
  const rejectedCount = historyData.filter(item => ['rejected', 'cancelled'].includes(item.status?.toLowerCase())).length;
  const totalRequests = historyData.length + pendingData.length;

  const filteredHistory = historyData.filter(item => {
    const searchString = `${item.first_name} ${item.last_name} ${item.email} ${item.reason}`.toLowerCase();
    const matchesSearch = !historySearch || searchString.includes(historySearch.toLowerCase());
    let matchesTab = true;
    if (activeHistoryTab === 'approved') matchesTab = ['approved', 'completed'].includes(item.status?.toLowerCase());
    else if (activeHistoryTab === 'rejected') matchesTab = ['rejected', 'cancelled'].includes(item.status?.toLowerCase());
    return matchesSearch && matchesTab;
  });

  const filteredPending = pendingData.filter(item => {
    const searchString = `${item.first_name} ${item.last_name} ${item.email} ${item.reason}`.toLowerCase();
    return !pendingSearch || searchString.includes(pendingSearch.toLowerCase());
  });

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / itemsPerPage));
  const currentHistory = filteredHistory.slice((historyPage - 1) * itemsPerPage, historyPage * itemsPerPage);

  const pendingTotalPages = Math.max(1, Math.ceil(filteredPending.length / itemsPerPage));
  const currentPending = filteredPending.slice((pendingPage - 1) * itemsPerPage, pendingPage * itemsPerPage);

  return (
    <div className="vm-container">
      <header className="vm-header">
        <div className="vm-title-group">
          
          <p className="vm-subtitle">Manage appointment submissions, monitor decisions, and maintain accurate visitor schedules.</p>
        </div>
        <div className="vm-header-actions">
          <button type="button" className="vm-btn-primary" onClick={() => setShowPendingModal(true)}>
            Pending Requests <span className="vm-header-count">{pendingData.length}</span>
          </button>
        </div>
      </header>

      <section className="vm-metric-grid" aria-label="Visitor request summary">
        <div className="vm-metric"><div className="vm-metric-top"><span>Total Requests</span></div><strong>{totalRequests}</strong><small>Pending and processed</small></div>
        <div className="vm-metric"><div className="vm-metric-top"><span>Pending Review</span></div><strong>{pendingData.length}</strong><small>Awaiting decision</small></div>
        <div className="vm-metric"><div className="vm-metric-top"><span>Approved</span></div><strong>{approvedCount}</strong><small>Accepted appointments</small></div>
        <div className="vm-metric"><div className="vm-metric-top"><span>Rejected</span></div><strong>{rejectedCount}</strong><small>Declined or cancelled</small></div>
      </section>

      <div className="vm-section-heading"><div><p>Search, filter, and review processed visitor appointments.</p></div><span className="vm-record-counter">{filteredHistory.length} records</span></div>

      {!canWrite && (
        <p className="vm-readonly-banner" role="note">View-only access</p>
      )}

      <div className="vm-search-card">
        <div className="vm-filter-tabs">
          <button className={`vm-filter-tab ${activeHistoryTab === 'all' ? 'active' : ''}`} onClick={() => setActiveHistoryTab('all')}>
            All <span className="tab-count">{historyData.length}</span>
          </button>
          <button className={`vm-filter-tab ${activeHistoryTab === 'approved' ? 'active' : ''}`} onClick={() => setActiveHistoryTab('approved')}>
            Approved <span className="tab-count">{approvedCount}</span>
          </button>
          <button className={`vm-filter-tab ${activeHistoryTab === 'rejected' ? 'active' : ''}`} onClick={() => setActiveHistoryTab('rejected')}>
            Rejected <span className="tab-count">{rejectedCount}</span>
          </button>
        </div>

        <div className="vm-search-input-group">
          <Search size={18} className="text-muted" />
          <input
            type="text"
            placeholder="Search visitor name, email, or purpose..."
            value={historySearch}
            onChange={e => setHistorySearch(e.target.value)}
            className="vm-clean-input"
          />
          {historySearch && <button type="button" className="vm-clear-search" aria-label="Clear visitor search" onClick={() => setHistorySearch('')}><X size={16} /></button>}
        </div>
      </div>

      <div className="vm-card">
        {loadingHistory ? (
          <div className="vm-loading">Loading visitor history...</div>
        ) : filteredHistory.length === 0 ? (
          <div className="vm-empty">No historical records match your criteria.</div>
        ) : (
          <>
            <div className="vm-table-wrapper">
              <table className="vm-table">
                <thead>
                  <tr>
                    <th>Visitor Details</th>
                    <th>Purpose of Visit</th>
                    <th>Schedule</th>
                    <th className="text-center">Status</th>
                    {canWrite && <th className="text-right">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {currentHistory.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="font-semibold text-dark">{item.first_name} {item.last_name}</div>
                        <div className="text-xs text-muted">{item.email}</div>
                      </td>
                      <td className="max-w-xs truncate" title={item.reason}>{item.reason || '—'}</td>
                      <td>
                        <div className="font-medium text-dark">{formatDate(item.visit_date)}</div>
                        <div className="text-xs text-muted">{formatTime(item.visit_time)}</div>
                      </td>
                      <td className="text-center">
                        <span className={`vm-chip ${getStatusTone(item.status)}`}>
                          {getDisplayStatus(item.status)}
                        </span>
                      </td>
                      {canWrite && (
                        <td>
                          <div className="vm-action-group right">
                            <button className="vm-btn-icon" onClick={() => openHistoryDetails(item)} title="View Details">
                              View
                            </button>
                            {isAdmin && ['PENDING', 'APPROVED', 'RESCHEDULED'].includes(item.status) && !item.arrived && !item.returned && !item.no_show && (
                              <button className="vm-btn-icon" onClick={() => openEditScheduleModal(item)} title="Edit Schedule">
                                Edit
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {historyTotalPages > 1 && (
              <div className="vm-pagination">
                <span className="vm-page-info">
                  Showing {(historyPage - 1) * itemsPerPage + 1} to {Math.min(historyPage * itemsPerPage, filteredHistory.length)} of {filteredHistory.length} entries
                </span>
                <div className="vm-page-controls">
                  <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1} className="vm-page-btn">
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <span className="vm-page-current">{historyPage} / {historyTotalPages}</span>
                  <button onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))} disabled={historyPage === historyTotalPages} className="vm-page-btn">
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* PENDING VISITOR REQUESTS MODAL */}
      {showPendingModal && (
        <div className="vm-custom-modal-backdrop" onClick={() => setShowPendingModal(false)}>
          <div className="vm-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="vm-custom-modal-header">
              <h3>Pending Visitor Requests</h3>
              <button className="vm-custom-close-btn" aria-label="Close pending requests" onClick={() => setShowPendingModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="vm-custom-modal-body">
              <div className="vm-search-input-group border" style={{ marginBottom: '1.25rem' }}>
                <Search size={18} className="text-muted" />
                <input
                  type="text"
                  placeholder="Search visitor name or email..."
                  value={pendingSearch}
                  onChange={e => setPendingSearch(e.target.value)}
                  className="vm-clean-input"
                />
                {pendingSearch && <button type="button" className="vm-clear-search" aria-label="Clear pending search" onClick={() => setPendingSearch('')}><X size={16} /></button>}
              </div>

              {loadingPending ? (
                <div className="vm-loading">Loading pending requests...</div>
              ) : filteredPending.length === 0 ? (
                <div className="vm-empty">No pending visitor requests match your criteria.</div>
              ) : (
                <div className="vm-minimal-list">
                  {currentPending.map(req => (
                    <div key={req.id} className="vm-minimal-card">
                      <div className="vm-minimal-header">
                        <div className="vm-minimal-user">
                          <div className="vm-minimal-user-info">
                            <span className="vm-minimal-name">{req.first_name} {req.last_name}</span>
                            <span className="vm-minimal-id">{req.email}</span>
                          </div>
                        </div>
                        <span className="vm-minimal-type-badge">{formatDate(req.visit_date)}</span>
                      </div>

                      <div className="vm-minimal-body">
                        <div className="vm-minimal-grid">
                          <div className="vm-minimal-field">
                            <label>Visit Time</label>
                            <span>{formatTime(req.visit_time)}</span>
                          </div>
                          <div className="vm-minimal-field">
                            <label>Contact Number</label>
                            <span>{req.phone || 'N/A'}</span>
                          </div>
                        </div>

                        <div className="vm-minimal-field full-width" style={{ marginTop: '0.5rem' }}>
                          <label>Purpose of Visit</label>
                          <p>{req.reason || '—'}</p>
                        </div>
                      </div>

                      <div className="vm-minimal-footer">
                        {canWrite && isAdmin && (
                          <>
                            <button className="vm-btn-min-reject" onClick={() => openRejectModal(req)}>Reject</button>
                            <button className="vm-btn-min-approve" onClick={() => handleApprove(req)}>Approve</button>
                          </>
                        )}
                        <button className="vm-btn-secondary" onClick={() => openPendingDetails(req)}>View</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {pendingTotalPages > 1 && (
              <div className="vm-custom-modal-pagination">
                <span className="vm-page-info">
                  Showing {(pendingPage - 1) * itemsPerPage + 1} to {Math.min(pendingPage * itemsPerPage, filteredPending.length)} of {filteredPending.length}
                </span>
                <div className="vm-page-controls">
                  <button onClick={() => setPendingPage(p => Math.max(1, p - 1))} disabled={pendingPage === 1} className="vm-page-btn"><ChevronLeft size={16} /></button>
                  <span className="vm-page-current">{pendingPage} / {pendingTotalPages}</span>
                  <button onClick={() => setPendingPage(p => Math.min(pendingTotalPages, p + 1))} disabled={pendingPage === pendingTotalPages} className="vm-page-btn"><ChevronRight size={16} /></button>
                </div>
              </div>
            )}

            <div className="vm-custom-modal-footer">
              <button className="vm-btn-secondary" onClick={() => setShowPendingModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* FORMAL PENDING DETAILS MODAL */}
      <FormalModal
        show={showPendingDetailsModal}
        onClose={() => setShowPendingDetailsModal(false)}
        title="Visit Request Details"
        footer={
          <>
            <button className="vm-btn-secondary" onClick={() => setShowPendingDetailsModal(false)}>Close</button>
            {canWrite && isAdmin && (
              <>
                <button className="vm-btn-primary bg-red" onClick={() => { setShowPendingDetailsModal(false); openRejectModal(selectedRequest); }}>Reject</button>
                <button className="vm-btn-primary" onClick={() => handleApprove(selectedRequest)}>Approve Request</button>
              </>
            )}
          </>
        }
      >
        {selectedRequest && (
          <div className="candidate-formal-layout">
            <div className="cf-row">
              <div className="cf-label">Visitor Name</div>
              <div className="cf-value">{selectedRequest.first_name} {selectedRequest.last_name}</div>
            </div>
            <div className="cf-row">
              <div className="cf-label">Email Address</div>
              <div className="cf-value">{selectedRequest.email}</div>
            </div>
            <div className="cf-row">
              <div className="cf-label">Phone Number</div>
              <div className="cf-value">{selectedRequest.phone || '—'}</div>
            </div>
            <div className="cf-row">
              <div className="cf-label">Status</div>
              <div className="cf-value">
                <span className={`vm-chip ${getStatusTone(selectedRequest.status)}`}>
                  {getDisplayStatus(selectedRequest.status)}
                </span>
              </div>
            </div>
            <div className="cf-row">
              <div className="cf-label">Date</div>
              <div className="cf-value">{formatDate(selectedRequest.visit_date)}</div>
            </div>
            <div className="cf-row">
              <div className="cf-label">Time</div>
              <div className="cf-value">{formatTime(selectedRequest.visit_time)}</div>
            </div>
            <div className="cf-row vertical">
              <div className="cf-label">Purpose of Visit</div>
              <div className="cf-value cf-letter-text">{selectedRequest.reason || '—'}</div>
            </div>
            {additionalVisitors.length > 0 && (
              <div className="cf-row vertical">
                <div className="cf-label">Additional Visitors</div>
                <div className="cf-value">
                  <ul className="cf-list">
                    {additionalVisitors.map((v, idx) => (
                      <li key={idx}>{v.visitor_name}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </FormalModal>

      {/* FORMAL HISTORY FINAL DETAILS MODAL */}
      <FormalModal
        show={showHistoryDetailsModal}
        onClose={() => setShowHistoryDetailsModal(false)}
        title="Appointment Final Details"
        footer={<button className="vm-btn-secondary" onClick={() => setShowHistoryDetailsModal(false)}>Close</button>}
      >
        {selectedRequest && (
          <div className="candidate-formal-layout">
            <div className="cf-row">
              <div className="cf-label">Visitor Name</div>
              <div className="cf-value">{selectedRequest.first_name} {selectedRequest.last_name}</div>
            </div>
            <div className="cf-row">
              <div className="cf-label">Email Address</div>
              <div className="cf-value">{selectedRequest.email}</div>
            </div>
            <div className="cf-row">
              <div className="cf-label">Phone Number</div>
              <div className="cf-value">{selectedRequest.phone || '—'}</div>
            </div>
            <div className="cf-row">
              <div className="cf-label">Status</div>
              <div className="cf-value">
                <span className={`vm-chip ${getStatusTone(selectedRequest.status)}`}>
                  {getDisplayStatus(selectedRequest.status)}
                </span>
              </div>
            </div>
            <div className="cf-row">
              <div className="cf-label">Date</div>
              <div className="cf-value">{formatDate(selectedRequest.visit_date)}</div>
            </div>
            <div className="cf-row">
              <div className="cf-label">Time</div>
              <div className="cf-value">{formatTime(selectedRequest.visit_time)}</div>
            </div>
            <div className="cf-row vertical">
              <div className="cf-label">Purpose of Visit</div>
              <div className="cf-value cf-letter-text">{selectedRequest.reason || '—'}</div>
            </div>
            {additionalVisitors.length > 0 && (
              <div className="cf-row vertical">
                <div className="cf-label">Additional Visitors</div>
                <div className="cf-value">
                  <ul className="cf-list">
                    {additionalVisitors.map((v, idx) => (
                      <li key={idx}>{v.visitor_name}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {selectedRequest.admin_notes && (
              <div className="cf-row vertical">
                <div className="cf-label">Administrator Notes / Reschedule Reason</div>
                <div className="cf-value cf-letter-text">{selectedRequest.admin_notes}</div>
              </div>
            )}
          </div>
        )}
      </FormalModal>

      {/* EDIT SCHEDULE MODAL */}
      <FormalModal
        show={showEditScheduleModal}
        onClose={() => setShowEditScheduleModal(false)}
        title="Update Appointment Schedule"
        footer={
          <>
            <button className="vm-btn-secondary" onClick={() => setShowEditScheduleModal(false)}>Cancel</button>
            {!isPastAppointment && isAdmin && (
              <button className="vm-btn-primary" onClick={handleHistoryUpdate}>
                Save & Notify Visitor
              </button>
            )}
          </>
        }
      >
        {selectedRequest && (
          <div className="vm-details-container">
            <div style={{ fontSize: '0.9375rem', color: '#475569', marginBottom: '0.5rem' }}>
              Rescheduling appointment for: <strong>{selectedRequest.first_name} {selectedRequest.last_name}</strong>
            </div>

            {isPastAppointment ? (
              <div className="vm-alert-box">
                <span>This appointment is in the past and its schedule cannot be modified.</span>
              </div>
            ) : (
              <>
                <div className="vm-section-box edit">
                  <label>New Schedule Details</label>
                  <div className="vm-form-row">
                    <div className="vm-form-group">
                      <span className="vm-form-label">Date</span>
                      <input
                        type="date"
                        className="vm-clean-input border"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div className="vm-form-group">
                      <span className="vm-form-label">Time</span>
                      <input
                        type="time"
                        className="vm-clean-input border"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="vm-section-box edit">
                  <label>Reason for Rescheduling (Included in Email)</label>
                  <textarea
                    rows="3"
                    placeholder="Enter reason why this appointment is being rescheduled..."
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    className="vm-clean-input border"
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </FormalModal>

      {/* REJECT CONFIRMATION MODAL */}
      <FormalModal
        show={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Reject Visit Request"
        footer={
          <>
            <button className="vm-btn-secondary" onClick={() => setShowRejectModal(false)}>Cancel</button>
            <button className="vm-btn-primary bg-red" onClick={handleRejectConfirm}>
              Confirm Rejection
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ fontSize: '0.9375rem', color: '#334155', marginBottom: '0.5rem', marginTop: 0 }}>
            Are you sure you want to reject <strong>{selectedRequest?.first_name} {selectedRequest?.last_name}</strong>'s request?
          </p>
          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Reason for Rejection *
          </label>
          <textarea
            rows="3"
            placeholder="Provide a clear explanation..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="vm-clean-input border"
            style={{ resize: 'vertical' }}
          />
        </div>
      </FormalModal>
    </div>
  );
};

export default ManageRequest;