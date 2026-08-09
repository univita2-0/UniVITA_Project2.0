// src/pages/AttendanceAppeals.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import { History, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { API_BASE } from '../api';
import './AttendanceAppeals.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

// Format date from ISO to YYYY-MM-DD[cite: 3]
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return dateStr.split('T')[0];
};

// Format time from HH:MM:SS to HH:MM[cite: 3]
const formatTime = (timeStr) => {
  if (!timeStr) return '';
  return timeStr.substring(0, 5);
};

const AttendanceAppeals = () => {
  const [pendingAppeals, setPendingAppeals] = useState([]);
  const [historyAppeals, setHistoryAppeals] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedAppeal, setSelectedAppeal] = useState(null);
  const [adminRemarks, setAdminRemarks] = useState('');
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [actionType, setActionType] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPendingAppeals();
  }, []);

  const fetchPendingAppeals = async () => {
    try {
      const res = await axios.get(`${API_BASE}/attendance-appeals/pending`, getAuthHeaders());
      setPendingAppeals(res.data);
    } catch (err) {
      console.error('Error fetching pending appeals:', err);
      toast.error('Failed to load pending appeals');
    }
  };

  const fetchHistoryAppeals = async () => {
    try {
      const res = await axios.get(`${API_BASE}/attendance-appeals/history`, getAuthHeaders());
      setHistoryAppeals(res.data);
    } catch (err) {
      console.error('Error fetching history appeals:', err);
      toast.error('Failed to load history');
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
    setLoading(true);
    try {
      await axios.put(`${API_BASE}/attendance-appeals/${selectedAppeal.id}/status`, {
        status: actionType,
        admin_remarks: adminRemarks || null,
      }, getAuthHeaders());
      toast.success(`Appeal ${actionType === 'approved' ? 'approved' : 'rejected'} successfully.`);
      setShowRemarkModal(false);
      fetchPendingAppeals();
      fetchHistoryAppeals();
    } catch (err) {
      console.error('Error updating appeal status:', err);
      toast.error('Failed to update appeal status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openHistoryModal = () => {
    fetchHistoryAppeals();
    setShowHistoryModal(true);
  };

  return (
    <div className="aa-container">
      <div className="aa-header">
        <div>
          <h1 className="aa-title">Attendance Appeals</h1>
          <p className="aa-subtitle">Review and manage employee attendance disputes.</p>
        </div>
        <button className="aa-history-btn" onClick={openHistoryModal}>
          <History size={16} /> View History
        </button>
      </div>

      {pendingAppeals.length === 0 ? (
        <div className="aa-empty-state">
          <p>No pending appeals at this time.</p>
        </div>
      ) : (
        <div className="aa-table-wrapper">
          <table className="aa-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Requested In</th>
                <th>Requested Out</th>
                <th>Reason</th>
                <th className="text-center">Proof</th>
                <th>Submitted</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingAppeals.map((appeal) => (
                <tr key={appeal.id}>
                  <td>
                    <div className="aa-emp-name">{appeal.full_name}</div>
                    <div className="aa-emp-id">{appeal.employee_id}</div>
                  </td>
                  <td className="font-medium text-gray-900">{formatDate(appeal.date)}</td>
                  <td>{appeal.requested_time_in ? formatTime(appeal.requested_time_in) : '—'}</td>
                  <td>{appeal.requested_time_out ? formatTime(appeal.requested_time_out) : '—'}</td>
                  <td className="aa-reason-cell" title={appeal.reason}>{appeal.reason}</td>
                  <td className="text-center">
                    {appeal.image_url ? (
                      <a href={`${API_BASE.replace(/\/api$/, '')}${appeal.image_url}`} target="_blank" rel="noopener noreferrer" className="aa-link-btn">
                        <ExternalLink size={14} /> View
                      </a>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="aa-date-cell">{new Date(appeal.submitted_at).toLocaleString()}</td>
                  <td>
                    <div className="aa-action-buttons">
                      <button className="btn-approve" onClick={() => openRemarkModal(appeal, 'approved')} title="Approve">
                        <CheckCircle size={16} />
                      </button>
                      <button className="btn-reject" onClick={() => openRemarkModal(appeal, 'rejected')} title="Reject">
                        <XCircle size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Remarks Modal[cite: 3] */}
      <FormalModal
        show={showRemarkModal}
        onClose={() => setShowRemarkModal(false)}
        title={`${actionType === 'approved' ? 'Approve' : 'Reject'} Appeal`}
        footer={
          <>
            <button className="btn-modal-cancel" onClick={() => setShowRemarkModal(false)} disabled={loading}>
              Cancel
            </button>
            <button className={`btn-modal-submit ${actionType === 'rejected' ? 'danger' : ''}`} onClick={updateAppealStatus} disabled={loading}>
              {loading ? 'Processing...' : actionType === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
            </button>
          </>
        }
      >
        <div className="aa-modal-group">
          <label className="aa-modal-label">Admin Remarks (Optional)</label>
          <textarea
            rows="4"
            placeholder="Enter remarks or reasoning..."
            value={adminRemarks}
            onChange={(e) => setAdminRemarks(e.target.value)}
            className="aa-textarea"
            disabled={loading}
          />
        </div>
      </FormalModal>

      {/* History Modal[cite: 3] */}
      <FormalModal
        show={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="Appeal History"
        wide
        footer={
          <button className="btn-modal-cancel" onClick={() => setShowHistoryModal(false)}>
            Close Window
          </button>
        }
      >
        {historyAppeals.length === 0 ? (
          <div className="aa-empty-state">No past appeals found.</div>
        ) : (
          <div className="aa-history-wrapper">
            <table className="aa-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Requested In</th>
                  <th>Requested Out</th>
                  <th>Reason</th>
                  <th className="text-center">Proof</th>
                  <th className="text-center">Status</th>
                  <th>Admin Remarks</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {historyAppeals.map((appeal) => (
                  <tr key={appeal.id}>
                    <td>
                      <div className="aa-emp-name">{appeal.full_name}</div>
                      <div className="aa-emp-id">{appeal.employee_id}</div>
                    </td>
                    <td className="font-medium text-gray-900">{formatDate(appeal.date)}</td>
                    <td>{appeal.requested_time_in ? formatTime(appeal.requested_time_in) : '—'}</td>
                    <td>{appeal.requested_time_out ? formatTime(appeal.requested_time_out) : '—'}</td>
                    <td className="aa-reason-cell" title={appeal.reason}>{appeal.reason}</td>
                    <td className="text-center">
                      {appeal.image_url ? (
                        <a href={`${API_BASE.replace(/\/api$/, '')}${appeal.image_url}`} target="_blank" rel="noopener noreferrer" className="aa-link-btn">
                          <ExternalLink size={14} /> View
                        </a>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="text-center">
                      <span className={`aa-status-badge ${appeal.status}`}>
                        {appeal.status}
                      </span>
                    </td>
                    <td className="aa-reason-cell" title={appeal.admin_remarks}>{appeal.admin_remarks || '—'}</td>
                    <td className="aa-date-cell">{new Date(appeal.submitted_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormalModal>
    </div>
  );
};

export default AttendanceAppeals;