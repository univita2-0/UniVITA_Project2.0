import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import { Search, Edit3, ClipboardList, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { API_BASE } from '../api';
import './AttendanceCorrection.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const AttendanceCorrection = () => {
  const [employeeId, setEmployeeId] = useState('');
  const [records, setRecords] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ time_in: '', time_out: '', status: '', location: '' });
  const [searchDone, setSearchDone] = useState(false);

  // State for pending corrections modal
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingCorrections, setPendingCorrections] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // Fetch attendance records for a specific employee
  const fetchRecords = async () => {
    if (!employeeId.trim()) return;
    try {
      const res = await axios.get(`${API_BASE}/attendance-report-user/${employeeId.trim()}`, getAuthHeaders());
      setRecords(res.data || []);
      setSearchDone(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch attendance records');
    }
  };

  // Open edit modal for an attendance record
  const openEditor = (record) => {
    setEditing(record);
    setForm({
      time_in: record.time_in || '',
      time_out: record.time_out || '',
      status: record.status || '',
      location: record.location || ''
    });
  };

  // Save edited attendance record with sanitized data for MySQL strict mode
  // Save edited attendance record with sanitized data for MySQL strict mode
  const handleSave = async () => {
    try {
      // 1. Convert status to exact lowercase, or null if empty
      const safeStatus = form.status ? form.status.toLowerCase() : null;

      // 2. Format times to HH:mm:ss, or set to null if empty
      let safeTimeIn = form.time_in || null;
      if (safeTimeIn && safeTimeIn.length === 5) {
        safeTimeIn = `${safeTimeIn}:00`;
      }

      let safeTimeOut = form.time_out || null;
      if (safeTimeOut && safeTimeOut.length === 5) {
        safeTimeOut = `${safeTimeOut}:00`;
      }

      // 3. Only send the exact fields the database expects
      const payload = {
        time_in: safeTimeIn,
        time_out: safeTimeOut,
        status: safeStatus,
        location: form.location || null
      };

      await axios.put(`${API_BASE}/attendance/update/${editing.id}`, payload, getAuthHeaders());
      toast.success('Record updated successfully');
      setEditing(null);
      fetchRecords();
    } catch (err) {
      // THIS IS THE CRITICAL PART: It will print the exact backend error to your browser console
      console.error("Backend Error Details:", err.response?.data || err.message);
      
      // Show the actual backend error message in the toast if it exists
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Failed to update record.';
      toast.error(errorMessage);
    }
  };

  // Fetch all pending correction requests
  const fetchPendingCorrections = async () => {
    setLoadingPending(true);
    try {
      const res = await axios.get(`${API_BASE}/attendance/corrections/pending`, getAuthHeaders());
      setPendingCorrections(res.data);
      setShowPendingModal(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load pending corrections');
    } finally {
      setLoadingPending(false);
    }
  };

  // Approve or reject a correction request
  const handleCorrectionAction = async (id, status) => {
    try {
      await axios.put(`${API_BASE}/attendance/corrections/${id}/review`, { status }, getAuthHeaders());
      toast.success(`Correction request ${status}`);
      fetchPendingCorrections(); // refresh the list
    } catch (err) {
      console.error(err);
      toast.error(`Failed to ${status} correction`);
    }
  };

  return (
    <div className="ac-container">
      <div className="ac-header">
        <div>
          <h3 className="ac-title">Attendance Correction</h3>
          <p className="ac-subtitle">Manually adjust records and review employee requests.</p>
        </div>
        <button className="ac-pending-btn" onClick={fetchPendingCorrections}>
          <ClipboardList size={18} /> 
          <span>Pending Requests</span>
        </button>
      </div>

      <div className="ac-search-card">
        <div className="ac-search-row">
          <div className="ac-search-input-wrapper">
            <Search size={16} className="ac-search-icon" />
            <input
              type="text"
              placeholder="Search Employee ID (e.g., E002)"
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              className="ac-input-search"
            />
          </div>
          <button className="ac-search-btn" onClick={fetchRecords}>
            Search Records
          </button>
        </div>
      </div>

      {searchDone && (
        <div className="ac-table-wrapper">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Status</th>
                <th>Location</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr className="ac-empty-row">
                  <td colSpan="6">No records found for this employee.</td>
                </tr>
              ) : (
                records.map(rec => (
                  <tr key={rec.id}>
                    <td className="font-medium text-gray-900">{rec.date}</td>
                    <td>{rec.time_in || '--:--'}</td>
                    <td>{rec.time_out || '--:--'}</td>
                    <td>
                      <span className={`ac-status-badge ${rec.status?.toLowerCase() || 'default'}`}>
                        {rec.status || 'Unknown'}
                      </span>
                    </td>
                    <td className="ac-location-cell" title={rec.location}>
                      {rec.location && rec.location.length > 30 ? rec.location.substring(0, 30) + '…' : rec.location || '—'}
                    </td>
                    <td className="text-center">
                      <button onClick={() => openEditor(rec)} className="ac-edit-btn" title="Edit Record">
                        <Edit3 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Attendance Modal */}
      <FormalModal
        show={!!editing}
        onClose={() => setEditing(null)}
        title="Edit Attendance Record"
        footer={
          <>
            <button className="btn-modal-cancel" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-modal-submit" onClick={handleSave}>Save Changes</button>
          </>
        }
      >
        <div className="ac-form-grid">
          <div className="ac-modal-group">
            <label className="ac-modal-label">Time In</label>
            <input type="time" className="ac-input" value={form.time_in} onChange={e => setForm({...form, time_in: e.target.value})} />
          </div>
          <div className="ac-modal-group">
            <label className="ac-modal-label">Time Out</label>
            <input type="time" className="ac-input" value={form.time_out} onChange={e => setForm({...form, time_out: e.target.value})} />
          </div>
          <div className="ac-modal-group">
            <label className="ac-modal-label">Status</label>
            <select className="ac-select" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
              <option value="">Select Status...</option>
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Absent">Absent</option>
              <option value="On Leave">On Leave</option>
            </select>
          </div>
          <div className="ac-modal-group">
            <label className="ac-modal-label">Location</label>
            <input type="text" className="ac-input" placeholder="e.g. Main Campus" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
          </div>
        </div>
      </FormalModal>

      {/* Pending Corrections Modal */}
      <FormalModal
        show={showPendingModal}
        onClose={() => setShowPendingModal(false)}
        title="Pending Correction Requests"
        wide 
        footer={<button className="btn-modal-cancel" onClick={() => setShowPendingModal(false)}>Close Window</button>}
      >
        {loadingPending ? (
          <div className="ac-loading-state">Loading requests...</div>
        ) : pendingCorrections.length === 0 ? (
          <div className="ac-empty-state">No pending correction requests at this time.</div>
        ) : (
          <div className="pending-table-wrapper">
            <table className="pending-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Request Type</th>
                  <th>Requested Time</th>
                  <th>Reason</th>
                  <th className="text-center">Proof</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingCorrections.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="ac-emp-name">{c.full_name}</div>
                      <div className="ac-emp-id">{c.employee_id}</div>
                    </td>
                    <td className="font-medium">{c.attendance_date}</td>
                    <td>{c.requested_clock_in ? 'Clock In' : 'Clock Out'}</td>
                    <td className="font-medium">{c.requested_clock_in || c.requested_clock_out}</td>
                    <td className="ac-reason-cell" title={c.reason}>{c.reason}</td>
                    <td className="text-center">
                      {c.selfie_url ? (
                        <a href={`${API_BASE.replace('/api', '')}${c.selfie_url}`} target="_blank" rel="noopener noreferrer" className="ac-link-btn">
                          <ExternalLink size={14} /> View
                        </a>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="approve-correction" onClick={() => handleCorrectionAction(c.id, 'approved')}>
                          <CheckCircle size={14} /> Approve
                        </button>
                        <button className="reject-correction" onClick={() => handleCorrectionAction(c.id, 'rejected')}>
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                    </td>
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

export default AttendanceCorrection;