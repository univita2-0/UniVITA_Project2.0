import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import { Search, Edit3, ClipboardList, CheckCircle, XCircle, Eye, X, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { API_BASE } from '../api';
import './AttendanceCorrection.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const formatTo12Hour = (timeStr) => {
  if (!timeStr || timeStr === '--:--' || timeStr.includes('--')) return '--:--';
  const parts = timeStr.substring(0, 5).split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
};

// Helper: Remove coordinates from location string
const cleanLocation = (locStr) => {
  if (!locStr) return '—';
  return locStr.split('(')[0].trim();
};

const AttendanceCorrection = () => {
  const [employeeId, setEmployeeId] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [records, setRecords] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ time_in: '', time_out: '', status: '', location: '' });
  const [searchDone, setSearchDone] = useState(false);

  // Pagination states (10 items per page)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingCorrections, setPendingCorrections] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  
  // States for Modals
  const [previewImage, setPreviewImage] = useState(null);
  const [viewingRecord, setViewingRecord] = useState(null);

  const formatDate = (dateString) => {
    if (!dateString) return '--';
    return dateString.split('T')[0];
  };

  const fetchRecords = async () => {
    if (!employeeId.trim()) return;
    try {
      const res = await axios.get(`${API_BASE}/attendance-report-user/${employeeId.trim()}`, getAuthHeaders());
      setRecords(res.data || []);
      setSearchDone(true);
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch attendance records');
    }
  };

  const openEditor = (record) => {
    setEditing(record);
    setForm({
      time_in: record.time_in ? record.time_in.substring(0, 5) : '',
      time_out: record.time_out ? record.time_out.substring(0, 5) : '',
      status: record.status || '',
      location: cleanLocation(record.location)
    });
  };

  const handleSave = async () => {
    try {
      const safeStatus = form.status ? form.status.toLowerCase() : null;
      let safeTimeIn = form.time_in || null;
      if (safeTimeIn && safeTimeIn.length === 5) safeTimeIn = `${safeTimeIn}:00`;
      let safeTimeOut = form.time_out || null;
      if (safeTimeOut && safeTimeOut.length === 5) safeTimeOut = `${safeTimeOut}:00`;

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
      console.error("Backend Error Details:", err.response?.data || err.message);
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Failed to update record.';
      toast.error(errorMessage);
    }
  };

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

  const handleCorrectionAction = async (id, status) => {
    try {
      await axios.put(`${API_BASE}/attendance/corrections/${id}/review`, { status }, getAuthHeaders());
      toast.success(`Correction request ${status}`);
      fetchPendingCorrections(); 
    } catch (err) {
      console.error(err);
      toast.error(`Failed to ${status} correction`);
    }
  };

  // Filter records by date before pagination
  const filteredRecords = records.filter(rec => {
    if (!searchDate) return true;
    return formatDate(rec.date) === searchDate;
  });

  // Pagination Calculations
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentRecords = filteredRecords.slice(indexOfFirstItem, indexOfLastItem);

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
          <div className="ac-search-input-wrapper" style={{ flex: '0 0 200px' }}>
            <Calendar size={16} className="ac-search-icon" />
            <input
              type="date"
              value={searchDate}
              onChange={e => {
                setSearchDate(e.target.value);
                setCurrentPage(1);
              }}
              className="ac-input-search"
              style={{ color: searchDate ? '#0F172A' : '#94A3B8' }}
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
                <th>Audit Status</th>
                <th>Approval Timestamp</th>
                <th>Location</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {currentRecords.length === 0 ? (
                <tr className="ac-empty-row">
                  <td colSpan="8">No records found matching your search.</td>
                </tr>
              ) : (
                currentRecords.map(rec => {
                  // A record is only corrected if correction_requested is 1 and updated_at exists
                  const isCorrected = rec.correction_requested === 1 && rec.updated_at != null;
                  const displayLocation = cleanLocation(rec.location);

                  return (
                    <tr key={rec.id}>
                      <td className="font-medium text-gray-900">{formatDate(rec.date)}</td>
                      <td>{formatTo12Hour(rec.time_in)}</td>
                      <td>{formatTo12Hour(rec.time_out)}</td>
                      <td>
                        <span className={`ac-status-badge ${rec.status?.toLowerCase() || 'default'}`}>
                          {rec.status || 'Unknown'}
                        </span>
                      </td>
                      <td>
                        {isCorrected ? (
                          <div>
                            <span style={{ color: '#D97706', fontWeight: '600', fontSize: '12px' }}>
                              Corrected
                            </span>
                            
                          </div>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '12px' }}>Original</span>
                        )}
                      </td>
                      <td>
                        {rec.reviewed_at ? (
                          <div style={{ fontSize: '12px', color: '#0F172A', fontWeight: '500' }}>
                            {new Date(rec.reviewed_at).toLocaleString()}
                          </div>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '12px' }}>—</span>
                        )}
                      </td>
                      <td className="ac-location-cell" title={displayLocation}>
                        {displayLocation.length > 25 ? displayLocation.substring(0, 25) + '…' : displayLocation}
                      </td>
                      <td className="text-center" style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center', paddingTop: '16px' }}>
                        <button onClick={() => setViewingRecord(rec)} className="ac-edit-btn" title="View Full Details" style={{ backgroundColor: '#E0F2F1', color: '#00897B' }}>
                          <Eye size={16} />
                        </button>
                        <button onClick={() => openEditor(rec)} className="ac-edit-btn" title="Edit Record">
                          <Edit3 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
              <span style={{ fontSize: '13px', color: '#64748B' }}>
                Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredRecords.length)} of {filteredRecords.length} records
              </span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: currentPage === 1 ? '#F1F5F9' : '#FFFFFF', color: currentPage === 1 ? '#94A3B8' : '#0F172A', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: '500', fontSize: '13px' }}
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', padding: '0 8px' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: currentPage === totalPages ? '#F1F5F9' : '#FFFFFF', color: currentPage === totalPages ? '#94A3B8' : '#0F172A', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontWeight: '500', fontSize: '13px' }}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* View Full Details Modal (Expanded via Eye Icon) */}
      <FormalModal
        show={!!viewingRecord}
        onClose={() => setViewingRecord(null)}
        title="Attendance Record Details"
        footer={<button className="btn-modal-cancel" onClick={() => setViewingRecord(null)}>Close</button>}
      >
        {viewingRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px', color: '#334155' }}>
            <p><strong>Date:</strong> {formatDate(viewingRecord.date)}</p>
            <p><strong>Time In:</strong> {formatTo12Hour(viewingRecord.time_in)}</p>
            <p><strong>Time Out:</strong> {formatTo12Hour(viewingRecord.time_out)}</p>
            <p><strong>Status:</strong> {viewingRecord.status || '—'}</p>
            <p><strong>Campus Location:</strong> {cleanLocation(viewingRecord.location)}</p>
            <p><strong>Audit Status:</strong> {(viewingRecord.correction_requested === 1 && viewingRecord.updated_at != null) ? 'Corrected' : 'Original'}</p>
            <p><strong>Last Edited At:</strong> {viewingRecord.updated_at ? new Date(viewingRecord.updated_at).toLocaleString() : '—'}</p>
           
          </div>
        )}
      </FormalModal>

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
            <label className="ac-modal-label">Time In (AM/PM format)</label>
            <input type="time" className="ac-input" value={form.time_in} onChange={e => setForm({...form, time_in: e.target.value})} />
            <span style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', display: 'block' }}>Reflects as: <strong>{formatTo12Hour(form.time_in)}</strong></span>
          </div>
          <div className="ac-modal-group">
            <label className="ac-modal-label">Time Out (AM/PM format)</label>
            <input type="time" className="ac-input" value={form.time_out} onChange={e => setForm({...form, time_out: e.target.value})} />
            <span style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', display: 'block' }}>Reflects as: <strong>{formatTo12Hour(form.time_out)}</strong></span>
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
                    <td className="font-medium">{formatDate(c.attendance_date)}</td>
                    <td>{c.requested_clock_in ? 'Clock In' : 'Clock Out'}</td>
                    <td className="font-medium">{formatTo12Hour(c.requested_clock_in || c.requested_clock_out)}</td>
                    <td style={{ whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '150px' }}>
                      {c.reason}
                    </td>
                    <td className="text-center">
                      {c.selfie_url ? (
                        <button 
                          onClick={() => setPreviewImage(`${API_BASE.replace('/api', '')}${c.selfie_url}`)}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00897B', background: 'none', border: 'none', cursor: 'pointer', margin: '0 auto', fontWeight: '500' }}
                        >
                          <Eye size={16} /> View
                        </button>
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

      {/* Full-Screen Image Preview Modal */}
      {previewImage && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }} 
          onClick={() => setPreviewImage(null)}
        >
          <img 
            src={previewImage} 
            alt="Proof Preview" 
            style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '12px', objectFit: 'contain' }} 
          />
          <button 
            style={{ position: 'absolute', top: '25px', right: '30px', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }} 
            onClick={() => setPreviewImage(null)}
          >
            <X size={36} />
          </button>
        </div>
      )}
    </div>
  );
};

export default AttendanceCorrection;