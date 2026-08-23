import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import { Search, Edit3, ClipboardEdit, ClipboardList, CheckCircle, XCircle, Eye, X, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
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

const cleanLocation = (locStr) => {
  if (!locStr) return '—';
  return locStr.split('(')[0].trim();
};

const formatDate = (dateString) => {
  if (!dateString) return '--';
  return dateString.split('T')[0];
};

const AttendanceCorrection = () => {
  const [employeeId, setEmployeeId] = useState('');
  const [searchDate, setSearchDate] = useState('');
  
  const [defaultRecords, setDefaultRecords] = useState([]); // Holds recent-to-old default records
  const [searchRecords, setSearchRecords] = useState([]);   // Holds specific search records
  const [searchDone, setSearchDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ time_in: '', time_out: '', status: '', location: '' });

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const itemsPerPage = 10;

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingCorrections, setPendingCorrections] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  
  const [previewImage, setPreviewImage] = useState(null);
  const [viewingRecord, setViewingRecord] = useState(null);

  // Load default recent records on mount
  useEffect(() => {
    fetchDefaultRecords();
  }, []);

  // Reset search status when input is cleared
  useEffect(() => {
    if (!employeeId.trim()) {
      setSearchDone(false);
      setCurrentPage(1);
    }
  }, [employeeId]);

  const fetchDefaultRecords = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/attendance/all-recent`, getAuthHeaders());
      const sorted = res.data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setDefaultRecords(sorted);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecords = async () => {
    if (!employeeId.trim()) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/attendance-report-user/${employeeId.trim()}`, getAuthHeaders());
      const sorted = res.data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setSearchRecords(sorted);
      setSearchDone(true);
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch attendance records');
    } finally {
      setLoading(false);
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
      if (searchDone) fetchRecords();
      fetchDefaultRecords();
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
      const sorted = res.data.sort((a, b) => new Date(b.attendance_date) - new Date(a.attendance_date));
      setPendingCorrections(sorted);
      setPendingPage(1);
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
      fetchDefaultRecords();
      if (searchDone) fetchRecords();
    } catch (err) {
      console.error(err);
      toast.error(`Failed to ${status} correction`);
    }
  };

  // Determine which data array to filter and paginate
  const baseRecords = searchDone ? searchRecords : defaultRecords;
  
  const filteredRecords = baseRecords.filter(rec => {
    const matchesDate = !searchDate || formatDate(rec.date) === searchDate;
    // Live filter default records if user types but hasn't pressed search
    const matchesLiveSearch = searchDone || !employeeId.trim() || 
      rec.employee_id?.toLowerCase().includes(employeeId.toLowerCase()) || 
      rec.full_name?.toLowerCase().includes(employeeId.toLowerCase());
    return matchesDate && matchesLiveSearch;
  });

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const currentRecords = filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const pendingTotalPages = Math.ceil(pendingCorrections.length / itemsPerPage);
  const currentPending = pendingCorrections.slice((pendingPage - 1) * itemsPerPage, pendingPage * itemsPerPage);

  return (
    <div className="ac-container">
      <div className="ac-header">
        <div className="ac-title-group">
          
          <div>
            <h3 className="ac-title">Attendance Correction</h3>
            <p className="ac-subtitle">Manually adjust records and review employee requests.</p>
          </div>
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
              placeholder="Search Name or Employee ID (e.g., E002)"
              value={employeeId}
              onChange={e => { setEmployeeId(e.target.value); setCurrentPage(1); }}
              className="ac-input-search"
            />
            {employeeId && <X size={16} className="ac-clear-icon" onClick={() => setEmployeeId('')} />}
          </div>
          <div className="ac-search-input-wrapper date-picker">
            <Calendar size={16} className="ac-search-icon" />
            <input
              type="date"
              value={searchDate}
              onChange={e => { setSearchDate(e.target.value); setCurrentPage(1); }}
              className="ac-input-search"
              style={{ color: searchDate ? '#0F172A' : '#94A3B8' }}
            />
            {searchDate && <X size={16} className="ac-clear-icon" onClick={() => setSearchDate('')} />}
          </div>
          <button className="ac-search-btn" onClick={fetchRecords}>
            Search Records
          </button>
        </div>
      </div>

      <div className="ac-card">
        {loading ? (
          <div className="ac-loading-state">Loading records...</div>
        ) : (
          <>
            <div className="ac-table-wrapper">
              <table className="ac-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Time In</th>
                    <th>Time Out</th>
                    <th>Status</th>
                    <th>Audit Status</th>
                    <th>Location</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRecords.length === 0 ? (
                    <tr>
                      <td colSpan="8"><div className="ac-empty-state">No records found matching your search.</div></td>
                    </tr>
                  ) : (
                    currentRecords.map(rec => {
                      const isCorrected = rec.correction_requested === 1 && rec.updated_at != null;
                      const displayLocation = cleanLocation(rec.location);

                      return (
                        <tr key={rec.id}>
                          <td>
                            <div className="ac-emp-name">{rec.full_name || 'Unknown'}</div>
                            <div className="ac-emp-id">{rec.employee_id || '—'}</div>
                          </td>
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
                              <span className="ac-status-badge warning" style={{fontSize: '0.65rem'}}>Corrected</span>
                            ) : (
                              <span className="ac-status-badge default" style={{fontSize: '0.65rem'}}>Original</span>
                            )}
                          </td>
                          <td className="ac-location-cell" title={displayLocation}>
                            {displayLocation}
                          </td>
                          <td>
                            <div className="ac-action-group">
                              <button onClick={() => setViewingRecord(rec)} className="ac-edit-btn" title="View Full Details">
                                <Eye size={18} color="#0D9488" />
                              </button>
                              <button onClick={() => openEditor(rec)} className="ac-edit-btn" title="Edit Record">
                                <Edit3 size={18} color="#475569" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="ac-pagination">
                <span className="ac-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredRecords.length)} of {filteredRecords.length}</span>
                <div className="ac-page-controls">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="ac-page-btn"><ChevronLeft size={16} /> Prev</button>
                  <span className="ac-page-current">{currentPage} / {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="ac-page-btn">Next <ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* View Full Details Modal */}
      <FormalModal show={!!viewingRecord} onClose={() => setViewingRecord(null)} title="Record Details" footer={<button className="btn-modal-cancel" onClick={() => setViewingRecord(null)}>Close</button>}>
        {viewingRecord && (
          <div className="ac-details-grid">
            <p><strong>Employee:</strong> {viewingRecord.full_name} ({viewingRecord.employee_id})</p>
            <p><strong>Date:</strong> {formatDate(viewingRecord.date)}</p>
            <p><strong>Time In:</strong> {formatTo12Hour(viewingRecord.time_in)}</p>
            <p><strong>Time Out:</strong> {formatTo12Hour(viewingRecord.time_out)}</p>
            <p><strong>Status:</strong> {viewingRecord.status || '—'}</p>
            <p><strong>Location:</strong> {cleanLocation(viewingRecord.location)}</p>
            <p><strong>Audit:</strong> {(viewingRecord.correction_requested === 1 && viewingRecord.updated_at != null) ? 'Corrected Record' : 'Original Record'}</p>
            <p><strong>Last Edit:</strong> {viewingRecord.updated_at ? new Date(viewingRecord.updated_at).toLocaleString() : '—'}</p>
          </div>
        )}
      </FormalModal>

      {/* Edit Form Modal */}
      <FormalModal show={!!editing} onClose={() => setEditing(null)} title="Edit Attendance Record" footer={
        <>
          <button className="btn-modal-cancel" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn-modal-submit" onClick={handleSave}>Save Changes</button>
        </>
      }>
        <div className="ac-form-grid">
          <div className="ac-modal-group">
            <label className="ac-modal-label">Time In (AM/PM format)</label>
            <input type="time" className="ac-input border" value={form.time_in} onChange={e => setForm({...form, time_in: e.target.value})} />
            <small className="ac-text-muted">Reflects as: {formatTo12Hour(form.time_in)}</small>
          </div>
          <div className="ac-modal-group">
            <label className="ac-modal-label">Time Out (AM/PM format)</label>
            <input type="time" className="ac-input border" value={form.time_out} onChange={e => setForm({...form, time_out: e.target.value})} />
            <small className="ac-text-muted">Reflects as: {formatTo12Hour(form.time_out)}</small>
          </div>
          <div className="ac-modal-group">
            <label className="ac-modal-label">Status</label>
            <select className="ac-select border" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
              <option value="">Select Status...</option>
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Absent">Absent</option>
              <option value="On Leave">On Leave</option>
            </select>
          </div>
          <div className="ac-modal-group">
            <label className="ac-modal-label">Location</label>
            <input type="text" className="ac-input border" placeholder="e.g. Main Campus" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
          </div>
        </div>
      </FormalModal>

      {/* Pending Corrections Modal */}
      <FormalModal show={showPendingModal} onClose={() => setShowPendingModal(false)} title="Pending Correction Requests" wide footer={<button className="btn-modal-cancel" onClick={() => setShowPendingModal(false)}>Close Window</button>}>
        {loadingPending ? <div className="ac-loading-state">Loading requests...</div> : pendingCorrections.length === 0 ? <div className="ac-empty-state">No pending correction requests at this time.</div> : (
          <div className="ac-modal-content">
            <div className="ac-table-wrapper">
              <table className="ac-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Requested Time</th>
                    <th>Reason</th>
                    <th className="text-center">Proof</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentPending.map(c => (
                    <tr key={c.id}>
                      <td>
                        <div className="ac-emp-name">{c.full_name}</div>
                        <div className="ac-emp-id">{c.employee_id}</div>
                      </td>
                      <td className="font-medium text-gray-900">{formatDate(c.attendance_date)}</td>
                      <td><span className="ac-status-badge default">{c.requested_clock_in ? 'Clock In' : 'Clock Out'}</span></td>
                      <td className="font-medium">{formatTo12Hour(c.requested_clock_in || c.requested_clock_out)}</td>
                      <td className="ac-reason-cell" title={c.reason}>{c.reason}</td>
                      <td className="text-center">
                        {c.selfie_url ? (
                          <button onClick={() => setPreviewImage(`${API_BASE.replace('/api', '')}${c.selfie_url}`)} className="ac-link-btn" style={{ border: 'none', cursor: 'pointer', background: 'transparent' }}>
                            <Eye size={16} /> View
                          </button>
                        ) : <span className="ac-text-muted">—</span>}
                      </td>
                      <td>
                        <div className="ac-action-group right">
                          <button className="ac-btn-icon success" onClick={() => handleCorrectionAction(c.id, 'approved')} title="Approve"><CheckCircle size={18} /></button>
                          <button className="ac-btn-icon danger" onClick={() => handleCorrectionAction(c.id, 'rejected')} title="Reject"><XCircle size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pendingTotalPages > 1 && (
              <div className="ac-pagination">
                <span className="ac-page-info">Showing {(pendingPage - 1) * itemsPerPage + 1} to {Math.min(pendingPage * itemsPerPage, pendingCorrections.length)} of {pendingCorrections.length}</span>
                <div className="ac-page-controls">
                  <button onClick={() => setPendingPage(p => Math.max(1, p - 1))} disabled={pendingPage === 1} className="ac-page-btn"><ChevronLeft size={16} /></button>
                  <span className="ac-page-current">{pendingPage} / {pendingTotalPages}</span>
                  <button onClick={() => setPendingPage(p => Math.min(pendingTotalPages, p + 1))} disabled={pendingPage === pendingTotalPages} className="ac-page-btn"><ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </div>
        )}
      </FormalModal>

      {/* Full-Screen Image Preview */}
      {previewImage && (
        <div className="ac-image-preview-overlay" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="Proof" className="ac-image-preview-img" />
          <button className="ac-image-preview-close" onClick={() => setPreviewImage(null)}><X size={36} /></button>
        </div>
      )}
    </div>
  );
};

export default AttendanceCorrection;