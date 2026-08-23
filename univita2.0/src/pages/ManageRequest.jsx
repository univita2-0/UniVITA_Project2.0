// src/pages/ManageRequest.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Search, CheckCircle, XCircle, Eye, Calendar, Clock, User, Mail, Phone, Users, X, ClipboardList, ChevronLeft, ChevronRight, Edit3 } from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';
import './ManageRequest.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
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

const ManageRequest = () => {
  const [historyData, setHistoryData] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);

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
  const [updating, setUpdating] = useState(false);

  const [historyPage, setHistoryPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => { setHistoryPage(1); }, [historySearch]);
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
    setSelectedRequest(request);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleApprove = async (req) => {
    const currentAdminId = localStorage.getItem('user_id');
    if (!currentAdminId) return toast.error("Session Error: Please logout and login again.");
    
    setUpdating(true);
    try {
      await axios.put(`${API_BASE}/appointments/${req.id}/status`, {
        status: 'APPROVED',
        adminNotes: '',
        visitorEmail: req.email,
        visitorName: `${req.first_name || ''} ${req.last_name || ''}`,
        adminId: currentAdminId
      }, getAuthHeaders());
      toast.success('Visit request approved successfully!');
      setShowPendingDetailsModal(false);
      fetchPending();
      fetchHistory();
    } catch (err) {
      console.error(err);
      toast.error('Failed to approve request.');
    } finally {
      setUpdating(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectionReason.trim()) return toast.warning('Please provide a reason for rejection.');
    const currentAdminId = localStorage.getItem('user_id');
    if (!currentAdminId) return toast.error("Session Error: Please logout and login again.");
    
    setUpdating(true);
    try {
      await axios.put(`${API_BASE}/appointments/${selectedRequest.id}/status`, {
        status: 'REJECTED',
        adminNotes: rejectionReason,
        visitorEmail: selectedRequest.email,
        visitorName: `${selectedRequest.first_name || ''} ${selectedRequest.last_name || ''}`,
        adminId: currentAdminId
      }, getAuthHeaders());
      toast.success('Visit request rejected successfully.');
      setShowRejectModal(false);
      setShowPendingDetailsModal(false);
      setSelectedRequest(null);
      setRejectionReason('');
      fetchPending();
      fetchHistory();
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject request.');
    } finally {
      setUpdating(false);
    }
  };

  const openHistoryDetails = async (appointment) => {
    setSelectedRequest(appointment);
    const visitors = await fetchAdditionalVisitors(appointment.id);
    setAdditionalVisitors(visitors);
    setShowHistoryDetailsModal(true);
  };

  const openEditScheduleModal = async (appointment) => {
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
    if (!editDate || !editTime) return toast.warning('Please provide both date and time.');
    setUpdating(true);
    try {
      await axios.put(`${API_BASE}/appointments/${selectedRequest.id}`, {
        visit_date: editDate,
        visit_time: editTime,
        admin_notes: rescheduleReason
      }, getAuthHeaders());
      toast.success('Appointment schedule updated and visitor notified via email.');
      setShowEditScheduleModal(false);
      fetchHistory();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to update schedule.');
    } finally {
      setUpdating(false);
    }
  };

  const filteredHistory = historyData.filter(item => {
    const searchString = `${item.first_name} ${item.last_name} ${item.email} ${item.reason}`.toLowerCase();
    return !historySearch || searchString.includes(historySearch.toLowerCase());
  });

  const filteredPending = pendingData.filter(item => {
    const searchString = `${item.first_name} ${item.last_name} ${item.email} ${item.reason}`.toLowerCase();
    return !pendingSearch || searchString.includes(pendingSearch.toLowerCase());
  });

  const historyTotalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const currentHistory = filteredHistory.slice((historyPage - 1) * itemsPerPage, historyPage * itemsPerPage);

  const pendingTotalPages = Math.ceil(filteredPending.length / itemsPerPage);
  const currentPending = filteredPending.slice((pendingPage - 1) * itemsPerPage, pendingPage * itemsPerPage);

  return (
    <div className="vm-container">
      <div className="vm-header">
        <div className="vm-title-group">
          <div>
            
            <p className="vm-subtitle">Review, inspect, and manage visitor appointments and campus schedules.</p>
          </div>
        </div>
        <button className="vm-btn-secondary" onClick={() => setShowPendingModal(true)}>
          <ClipboardList size={16} /> Pending Requests
        </button>
      </div>

      <div className="vm-search-card" style={{ padding: '12px 20px' }}>
        <div className="vm-search-input-group" style={{ maxWidth: '400px' }}>
          <Search size={18} className="text-muted" />
          <input 
            type="text" 
            placeholder="Search visitor name, email, or purpose..." 
            value={historySearch} 
            onChange={e => setHistorySearch(e.target.value)} 
            className="vm-clean-input" 
          />
          {historySearch && <X size={16} className="text-muted cursor-pointer" onClick={() => setHistorySearch('')} />}
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
                    <th className="text-right">Action</th>
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
                        <span className={`vm-chip ${['approved', 'completed'].includes(item.status?.toLowerCase()) ? 'success' : 'danger'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <div className="vm-action-group right">
                          <button className="vm-btn-icon" onClick={() => openHistoryDetails(item)} title="View Final Details">
                            <Eye size={16} color="#475569" />
                          </button>
                          <button className="vm-btn-icon" onClick={() => openEditScheduleModal(item)} title="Edit Schedule">
                            <Edit3 size={16} color="#0D9488" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {historyTotalPages > 1 && (
              <div className="vm-pagination">
                <span className="vm-page-info">Showing {(historyPage - 1) * itemsPerPage + 1} to {Math.min(historyPage * itemsPerPage, filteredHistory.length)} of {filteredHistory.length} entries</span>
                <div className="vm-page-controls">
                  <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1} className="vm-page-btn"><ChevronLeft size={16} /> Prev</button>
                  <span className="vm-page-current">{historyPage} / {historyTotalPages}</span>
                  <button onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))} disabled={historyPage === historyTotalPages} className="vm-page-btn">Next <ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* PENDING REQUESTS MODAL */}
      <FormalModal show={showPendingModal} onClose={() => setShowPendingModal(false)} title="Pending Visitor Requests" wide footer={<button className="vm-btn-secondary" onClick={() => setShowPendingModal(false)}>Close Window</button>}>
        {loadingPending ? (
          <div className="vm-loading">Loading pending requests...</div>
        ) : (
          <div className="vm-modal-content">
            <div className="vm-search-input-group border" style={{ marginBottom: '16px' }}>
              <Search size={18} className="text-muted" />
              <input type="text" placeholder="Search visitor name or email..." value={pendingSearch} onChange={e => setPendingSearch(e.target.value)} className="vm-clean-input" />
              {pendingSearch && <X size={16} className="text-muted cursor-pointer" onClick={() => setPendingSearch('')} />}
            </div>

            {filteredPending.length === 0 ? (
              <div className="vm-empty">No pending visitor requests match your criteria.</div>
            ) : (
              <>
                <div className="vm-table-wrapper" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                  <table className="vm-table">
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr>
                        <th>Guest</th>
                        <th>Date & Time</th>
                        <th>Purpose</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPending.map(req => (
                        <tr key={req.id}>
                          <td>
                            <div className="font-semibold text-dark">{req.first_name} {req.last_name}</div>
                            <div className="text-xs text-muted">{req.email}</div>
                          </td>
                          <td>
                            <div className="font-medium text-dark">{formatDate(req.visit_date)}</div>
                            <div className="text-xs text-muted">{formatTime(req.visit_time)}</div>
                          </td>
                          <td className="max-w-xs truncate" title={req.reason}>{req.reason || '—'}</td>
                          <td>
                            <div className="vm-action-group right">
                              <button className="vm-btn-icon" onClick={() => openPendingDetails(req)} title="View Details">
                                <Eye size={18} color="#475569" />
                              </button>
                              <button className="vm-btn-icon success" onClick={() => handleApprove(req)} title="Approve">
                                <CheckCircle size={18} />
                              </button>
                              <button className="vm-btn-icon danger" onClick={() => openRejectModal(req)} title="Reject">
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
                  <div className="vm-pagination">
                    <span className="vm-page-info">Showing {(pendingPage - 1) * itemsPerPage + 1} to {Math.min(pendingPage * itemsPerPage, filteredPending.length)} of {filteredPending.length}</span>
                    <div className="vm-page-controls">
                      <button onClick={() => setPendingPage(p => Math.max(1, p - 1))} disabled={pendingPage === 1} className="vm-page-btn"><ChevronLeft size={16} /></button>
                      <span className="vm-page-current">{pendingPage} / {pendingTotalPages}</span>
                      <button onClick={() => setPendingPage(p => Math.min(pendingTotalPages, p + 1))} disabled={pendingPage === pendingTotalPages} className="vm-page-btn"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </FormalModal>

      {/* PENDING DETAILS MODAL */}
      <FormalModal show={showPendingDetailsModal} onClose={() => setShowPendingDetailsModal(false)} title="Visit Request Details" wide footer={
        <>
          <button className="vm-btn-secondary" onClick={() => setShowPendingDetailsModal(false)}>Close</button>
          <button className="vm-btn-primary bg-red" onClick={() => { setShowPendingDetailsModal(false); openRejectModal(selectedRequest); }}>Reject</button>
          <button className="vm-btn-primary" onClick={() => handleApprove(selectedRequest)} disabled={updating}>
            {updating ? 'Processing...' : 'Approve Request'}
          </button>
        </>
      }>
        {selectedRequest && (
          <div className="vm-details-container">
            <div className="vm-details-grid-clean">
              <div className="vm-detail-box">
                <span className="vm-detail-label"><User size={14} /> Visitor</span>
                <p className="vm-detail-value">{selectedRequest.first_name} {selectedRequest.last_name}</p>
              </div>
              <div className="vm-detail-box">
                <span className="vm-detail-label"><Mail size={14} /> Email</span>
                <p className="vm-detail-value">{selectedRequest.email}</p>
              </div>
              <div className="vm-detail-box">
                <span className="vm-detail-label"><Phone size={14} /> Phone</span>
                <p className="vm-detail-value">{selectedRequest.phone || 'N/A'}</p>
              </div>
              <div className="vm-detail-box">
                <span className="vm-detail-label"><CheckCircle size={14} /> Status</span>
                <p className="vm-detail-value">
                  <span className={`vm-chip ${['approved', 'completed'].includes(selectedRequest.status.toLowerCase()) ? 'success' : 'danger'}`}>
                    {selectedRequest.status}
                  </span>
                </p>
              </div>
              <div className="vm-detail-box">
                <span className="vm-detail-label"><Calendar size={14} /> Date</span>
                <p className="vm-detail-value">{formatDate(selectedRequest.visit_date)}</p>
              </div>
              <div className="vm-detail-box">
                <span className="vm-detail-label"><Clock size={14} /> Time</span>
                <p className="vm-detail-value">{formatTime(selectedRequest.visit_time)}</p>
              </div>
            </div>

            <div className="vm-section-box">
              <label>Purpose of Visit</label>
              <p>{selectedRequest.reason || '—'}</p>
            </div>

            {additionalVisitors.length > 0 && (
              <div className="vm-additional-visitors">
                <h4><Users size={16} color="#0F172A" /> Additional Visitors</h4>
                <ul className="vm-visitor-list">
                  {additionalVisitors.map((v, idx) => (
                    <li key={idx}>{v.visitor_name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </FormalModal>

      {/* HISTORY FINAL DETAILS MODAL (Read-Only) */}
      <FormalModal show={showHistoryDetailsModal} onClose={() => setShowHistoryDetailsModal(false)} title="Appointment Final Details" wide footer={
        <button className="vm-btn-secondary" onClick={() => setShowHistoryDetailsModal(false)}>Close Window</button>
      }>
        {selectedRequest && (
          <div className="vm-details-container">
            <div className="vm-details-grid-clean">
              <div className="vm-detail-box">
                <span className="vm-detail-label"><User size={14} /> Visitor</span>
                <p className="vm-detail-value">{selectedRequest.first_name} {selectedRequest.last_name}</p>
              </div>
              <div className="vm-detail-box">
                <span className="vm-detail-label"><Mail size={14} /> Email</span>
                <p className="vm-detail-value">{selectedRequest.email}</p>
              </div>
              <div className="vm-detail-box">
                <span className="vm-detail-label"><Phone size={14} /> Phone</span>
                <p className="vm-detail-value">{selectedRequest.phone || 'N/A'}</p>
              </div>
              <div className="vm-detail-box">
                <span className="vm-detail-label"><CheckCircle size={14} /> Status</span>
                <p className="vm-detail-value">
                  <span className={`vm-chip ${['approved', 'completed'].includes(selectedRequest.status.toLowerCase()) ? 'success' : 'danger'}`}>
                    {selectedRequest.status}
                  </span>
                </p>
              </div>
              <div className="vm-detail-box">
                <span className="vm-detail-label"><Calendar size={14} /> Date</span>
                <p className="vm-detail-value">{formatDate(selectedRequest.visit_date)}</p>
              </div>
              <div className="vm-detail-box">
                <span className="vm-detail-label"><Clock size={14} /> Time</span>
                <p className="vm-detail-value">{formatTime(selectedRequest.visit_time)}</p>
              </div>
            </div>

            <div className="vm-section-box">
              <label>Purpose of Visit</label>
              <p>{selectedRequest.reason || '—'}</p>
            </div>

            {additionalVisitors.length > 0 && (
              <div className="vm-additional-visitors">
                <h4><Users size={16} color="#0F172A" /> Additional Visitors</h4>
                <ul className="vm-visitor-list">
                  {additionalVisitors.map((v, idx) => (
                    <li key={idx}>{v.visitor_name}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedRequest.admin_notes && (
              <div className="vm-section-box">
                <label>Administrator Notes / Reschedule Reason</label>
                <p>{selectedRequest.admin_notes}</p>
              </div>
            )}
          </div>
        )}
      </FormalModal>

      {/* EDIT SCHEDULE MODAL (Reschedule with Reason) */}
      <FormalModal show={showEditScheduleModal} onClose={() => setShowEditScheduleModal(false)} title="Update Appointment Schedule" footer={
        <>
          <button className="vm-btn-secondary" onClick={() => setShowEditScheduleModal(false)}>Cancel</button>
          {!isPastAppointment && (
            <button className="vm-btn-primary" onClick={handleHistoryUpdate} disabled={updating}>
              {updating ? 'Saving & Notifying...' : 'Save & Notify Visitor'}
            </button>
          )}
        </>
      }>
        {selectedRequest && (
          <div className="vm-details-container">
            <div style={{ fontSize: '0.9rem', color: '#475569' }}>
              Rescheduling appointment for: <strong>{selectedRequest.first_name} {selectedRequest.last_name}</strong>
            </div>

            {isPastAppointment ? (
              <div className="vm-alert-box">
                <Clock size={16} />
                <span>This appointment is in the past and its schedule cannot be modified.</span>
              </div>
            ) : (
              <>
                <div className="vm-section-box edit">
                  <label>New Schedule Details</label>
                  <div className="vm-form-row">
                    <div className="vm-form-group">
                      <span className="vm-form-label"><Calendar size={14} /> Date</span>
                      <input 
                        type="date" 
                        className="vm-clean-input border" 
                        value={editDate} 
                        onChange={(e) => setEditDate(e.target.value)} 
                        min={new Date().toISOString().split('T')[0]} 
                      />
                    </div>
                    <div className="vm-form-group">
                      <span className="vm-form-label"><Clock size={14} /> Time</span>
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
      <FormalModal show={showRejectModal} onClose={() => setShowRejectModal(false)} title="Reject Visit Request" footer={
        <>
          <button className="vm-btn-secondary" onClick={() => setShowRejectModal(false)} disabled={updating}>Cancel</button>
          <button className="vm-btn-primary bg-red" onClick={handleRejectConfirm} disabled={updating}>
            {updating ? 'Processing...' : 'Confirm Rejection'}
          </button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '0.95rem', color: '#334155', marginBottom: '8px' }}>
            Are you sure you want to reject <strong>{selectedRequest?.first_name} {selectedRequest?.last_name}</strong>'s request?
          </p>
          <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Reason for Rejection *</label>
          <textarea
            rows="3"
            placeholder="Provide a clear explanation..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            disabled={updating}
            className="vm-clean-input border"
            style={{ resize: 'vertical' }}
          />
        </div>
      </FormalModal>

    </div>
  );
};

export default ManageRequest;