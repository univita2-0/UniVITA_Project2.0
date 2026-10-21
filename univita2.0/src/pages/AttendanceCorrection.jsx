// src/pages/AttendanceCorrection.jsx
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import { Search, Edit3, ClipboardList, Eye, X, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { API_BASE } from '../api';
import './AttendanceCorrection.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const useDebounce = (value, delay = 250) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
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

const cleanLocation = (locStr) => {
  if (!locStr) return '—';
  return locStr.split('(')[0].trim();
};

const formatDate = (dateString) => {
  if (!dateString) return '—';
  return dateString.split('T')[0];
};

// ✅ FIX C13 — Centralized audit-status helper (fixes old isCorrected-only check
//               that showed "Original" for approved/rejected corrections)
const getAuditStatus = (rec) => {
  if (!rec) return { label: 'Original', cls: 'default' };
  const cs = String(rec.correction_status || '').toLowerCase();
  if (cs === 'pending') return { label: 'Pending Review', cls: 'warning' };
  if (cs === 'approved') return { label: 'Approved', cls: 'success' };
  if (cs === 'rejected') return { label: 'Rejected', cls: 'danger' };
  return { label: 'Original', cls: 'default' };
};

// ✅ FIX T6 — Tab config
const STATUS_TABS = [
  { key: 'all',      label: 'All' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const ALLOWED_STATUSES = ['present', 'late', 'absent', 'on leave'];

const AttendanceCorrection = () => {
  const [employeeId, setEmployeeId] = useState('');
  const [searchDate, setSearchDate] = useState('');

  const [defaultRecords, setDefaultRecords] = useState([]);
  const [searchRecords, setSearchRecords] = useState([]);
  const [searchDone, setSearchDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ time_in: '', time_out: '', status: '', location: '' });
  const [saveError, setSaveError] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const itemsPerPage = 10;

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingCorrections, setPendingCorrections] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingTypeFilter, setPendingTypeFilter] = useState('all');

  const [previewImage, setPreviewImage] = useState(null);
  const [viewingRecord, setViewingRecord] = useState(null);

  // ✅ FIX T7 — Active status tab
  const [activeStatusTab, setActiveStatusTab] = useState('all');

  const debouncedEmployeeId = useDebounce(employeeId);

  useEffect(() => {
    fetchDefaultRecords();
    fetchPendingCount();
  }, []);

  useEffect(() => {
    if (!debouncedEmployeeId.trim()) {
      setSearchDone(false);
      setCurrentPage(1);
    }
  }, [debouncedEmployeeId]);

  // Reset to page 1 whenever tab changes
  useEffect(() => { setCurrentPage(1); }, [activeStatusTab]);
  useEffect(() => { setPendingPage(1); }, [pendingTypeFilter]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setViewingRecord(null);
      setEditing(null);
      setShowPendingModal(false);
      setPreviewImage(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fetchDefaultRecords = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/attendance/all-recent`, getAuthHeaders());
      const sorted = (res.data || []).sort((a, b) => new Date(b.date) - new Date(a.date));
      setDefaultRecords(sorted);
    } catch (err) {
      toast.error('Failed to load recent records');
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingCount = async () => {
    try {
      const res = await axios.get(`${API_BASE}/attendance/corrections/pending`, getAuthHeaders());
      setPendingCount((res.data || []).length);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRecords = async () => {
    if (!employeeId.trim()) {
      toast.error('Please enter an Employee ID to search.');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/attendance-report-user/${employeeId.trim()}`, getAuthHeaders());
      const sorted = (res.data || []).sort((a, b) => new Date(b.date) - new Date(a.date));
      setSearchRecords(sorted);
      setSearchDone(true);
      setCurrentPage(1);
    } catch (err) {
      toast.error('Failed to fetch attendance records');
    } finally {
      setLoading(false);
    }
  };

  const openEditor = (record) => {
    setEditing(record);
    setSaveError('');
    setForm({
      time_in: record.time_in ? record.time_in.substring(0, 5) : '',
      time_out: record.time_out ? record.time_out.substring(0, 5) : '',
      status: record.status || '',
      location: cleanLocation(record.location)
    });
  };

  const handleSave = async () => {
    setSaveError('');

    if (form.status) {
      const normalized = form.status.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!ALLOWED_STATUSES.includes(normalized)) {
        const msg = 'Invalid status. Allowed: Present, Late, Absent, On Leave.';
        setSaveError(msg); toast.error(msg); return;
      }
    }

    if (form.time_in && form.time_out) {
      const [ih, im] = form.time_in.split(':').map(Number);
      const [oh, om] = form.time_out.split(':').map(Number);
      const diff = (oh * 60 + om) - (ih * 60 + im);

      if (diff === 0) {
        const msg = 'Time Out cannot be the same as Time In.';
        setSaveError(msg); toast.error(msg); return;
      }
      if (diff < 0 && Math.abs(diff) < 12 * 60) {
        const msg = 'Time Out must be later than Time In for same-day shifts.';
        setSaveError(msg); toast.error(msg); return;
      }
    }

    if (form.location && form.location.length > 200) {
      const msg = 'Location is too long (max 200 characters).';
      setSaveError(msg); toast.error(msg); return;
    }

    if (!window.confirm('Save these changes to the attendance record?')) return;

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
        location: form.location ? form.location.trim() : null
      };

      await axios.put(`${API_BASE}/attendance/update/${editing.id}`, payload, getAuthHeaders());
      toast.success('Record updated successfully');
      setEditing(null);
      if (searchDone) fetchRecords();
      fetchDefaultRecords();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to update record.';
      setSaveError(msg);
      toast.error(msg);
    }
  };

  const fetchPendingCorrections = async () => {
    setLoadingPending(true);
    try {
      const res = await axios.get(`${API_BASE}/attendance/corrections/pending`, getAuthHeaders());
      const sorted = (res.data || []).sort((a, b) => new Date(b.attendance_date) - new Date(a.attendance_date));
      setPendingCorrections(sorted);
      setPendingCount(sorted.length);
      setPendingPage(1);
      setShowPendingModal(true);
    } catch (err) {
      toast.error('Failed to load pending corrections');
    } finally {
      setLoadingPending(false);
    }
  };

  const handleCorrectionAction = async (id, status) => {
    const verb = status === 'approved' ? 'approve' : 'reject';
    if (!window.confirm(`Are you sure you want to ${verb} this correction request?`)) return;

    try {
      await axios.put(`${API_BASE}/attendance/corrections/${id}/review`, { status }, getAuthHeaders());
      toast.success(`Correction request ${status}`);
      fetchPendingCorrections();
      fetchDefaultRecords();
      fetchPendingCount();
      if (searchDone) fetchRecords();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${status} correction`);
    }
  };

  const baseRecords = searchDone ? searchRecords : defaultRecords;

  // ✅ FIX T8 — Search + date filtered base (before tab filter) → drives tab counts
  const searchFilteredRecords = baseRecords.filter(rec => {
    const matchesDate = !searchDate || formatDate(rec.date) === searchDate;
    const matchesLiveSearch = searchDone || !debouncedEmployeeId.trim() ||
      rec.employee_id?.toLowerCase().includes(debouncedEmployeeId.toLowerCase()) ||
      rec.full_name?.toLowerCase().includes(debouncedEmployeeId.toLowerCase());
    return matchesDate && matchesLiveSearch;
  });

  const tabCounts = {
    all: searchFilteredRecords.length,
    approved: searchFilteredRecords.filter(r => String(r.correction_status || '').toLowerCase() === 'approved').length,
    rejected: searchFilteredRecords.filter(r => String(r.correction_status || '').toLowerCase() === 'rejected').length,
  };

  // ✅ FIX T9 — Apply status tab filter on top of search + date
  const filteredRecords = searchFilteredRecords.filter(rec => {
    if (activeStatusTab === 'all') return true;
    return String(rec.correction_status || '').toLowerCase() === activeStatusTab;
  });

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const currentRecords = filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const filteredPendingAll = useMemo(() => {
    return pendingCorrections.filter(c => {
      if (pendingTypeFilter === 'in') return !!c.requested_clock_in;
      if (pendingTypeFilter === 'out') return !!c.requested_clock_out;
      return true;
    });
  }, [pendingCorrections, pendingTypeFilter]);

  const pendingTotalPages = Math.ceil(filteredPendingAll.length / itemsPerPage);
  const currentPending = filteredPendingAll.slice((pendingPage - 1) * itemsPerPage, pendingPage * itemsPerPage);

  return (
    <div className="ac-container">
      <div className="ac-header">
        <div className="ac-title-group">
          <div>
            <p className="ac-subtitle">Manually adjust records and review employee correction requests.</p>
          </div>
        </div>
        <button className="ac-pending-btn" onClick={fetchPendingCorrections}>
          <ClipboardList size={18} />
          <span>Pending Requests</span>
          {pendingCount > 0 && <span className="ac-badge-count">{pendingCount}</span>}
        </button>
      </div>

      {/* ✅ FIX T10 — Status tabs row */}
      <div className="ac-tabs" role="tablist" aria-label="Correction audit status filter">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeStatusTab === tab.key}
            className={`ac-tab ${activeStatusTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveStatusTab(tab.key)}
          >
            {tab.label}
            <span className="ac-tab-count">{tabCounts[tab.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="ac-search-card">
        <div className="ac-search-row">
          <div className="ac-search-input-wrapper">
            <Search size={16} className="ac-search-icon" />
            <input
              type="text"
              placeholder="Search Name or Employee ID (e.g., E002)"
              value={employeeId}
              maxLength={100}
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
              max={new Date().toISOString().split('T')[0]}
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
                    <th>Employee ID</th>
                    <th>Employee Name</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Audit Status</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRecords.length === 0 ? (
                    <tr>
                      <td colSpan="5">
                        <div className="ac-empty-state">
                          {activeStatusTab === 'all'
                            ? 'No records found matching your search.'
                            : `No ${activeStatusTab} corrections found.`}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    currentRecords.map(rec => {
                      // ✅ FIX C13 (cont.) — use helper for the audit column
                      const audit = getAuditStatus(rec);
                      return (
                        <tr key={rec.id}>
                          <td className="font-mono text-xs text-muted">{rec.employee_id || '—'}</td>
                          <td className="font-semibold text-dark">{rec.full_name || 'Unknown'}</td>
                          <td className="text-center whitespace-nowrap">
                            <span className={`ac-status-badge ${rec.status?.toLowerCase().replace(/\s+/g, '-') || 'default'}`}>
                              {rec.status || 'Unknown'}
                            </span>
                          </td>
                          <td className="text-center whitespace-nowrap">
                            <span className={`ac-status-badge ${audit.cls}`}>
                              {audit.label}
                            </span>
                          </td>
                          <td className="text-center whitespace-nowrap">
                            <div className="ac-action-group" style={{ justifyContent: 'center' }}>
                              <button onClick={() => setViewingRecord(rec)} className="ac-edit-btn" title="View Full Details">
                                <Eye size={16} color="#475569" />
                              </button>
                              <button onClick={() => openEditor(rec)} className="ac-edit-btn" title="Edit Record">
                                <Edit3 size={16} color="#475569" />
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

      {/* VIEW DETAILS MODAL */}
      <FormalModal show={!!viewingRecord} onClose={() => setViewingRecord(null)} title="Attendance Record Details" footer={<button className="btn-modal-cancel" onClick={() => setViewingRecord(null)}>Close Window</button>}>
        {viewingRecord && (() => {
          const audit = getAuditStatus(viewingRecord);
          return (
            <div className="ac-modal-wrapper">
              <div className="ac-user-profile-header">
                <div className="ac-user-info-group">
                  <div className="ac-avatar-circle">
                    {viewingRecord.full_name ? viewingRecord.full_name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="ac-user-meta">
                    <span className="ac-user-name">{viewingRecord.full_name || 'Unknown Employee'}</span>
                    <span className="ac-user-id">{viewingRecord.employee_id || '—'}</span>
                  </div>
                </div>
                <span className={`ac-status-badge ${viewingRecord.status?.toLowerCase().replace(/\s+/g, '-') || 'default'}`}>
                  {viewingRecord.status || 'Unknown'}
                </span>
              </div>

              <div className="ac-custom-details-grid">
                <div className="ac-detail-box">
                  <label>Date</label>
                  <span>{formatDate(viewingRecord.date)}</span>
                </div>
                <div className="ac-detail-box">
                  <label>Audit Status</label>
                  <span>{audit.label}</span>
                </div>
                <div className="ac-detail-box">
                  <label>Time In</label>
                  <span>{formatTo12Hour(viewingRecord.time_in)}</span>
                </div>
                <div className="ac-detail-box">
                  <label>Time Out</label>
                  <span>{formatTo12Hour(viewingRecord.time_out)}</span>
                </div>
                <div className="ac-detail-box full-width">
                  <label>Location</label>
                  <span>{cleanLocation(viewingRecord.location)}</span>
                </div>
                {(viewingRecord.clock_in_selfie || viewingRecord.clock_out_selfie) && (
                  <div className="ac-detail-box full-width">
                    <label>Proof Verification</label>
                    <div>
                      <button onClick={() => setPreviewImage(`${API_BASE.replace(/\/api$/, '')}${viewingRecord.clock_in_selfie || viewingRecord.clock_out_selfie}`)} className="ac-proof-action-btn">
                        <Eye size={14} /> View Selfie Verification Proof
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </FormalModal>

      {/* EDIT MODAL */}
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
            <input type="text" className="ac-input border" maxLength={200} placeholder="e.g. Main Campus" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
          </div>
        </div>
        {saveError && (
          <div style={{ marginTop: '1rem', color: '#DC2626', fontSize: '0.85rem', fontWeight: 600 }}>
            ⚠ {saveError}
          </div>
        )}
      </FormalModal>

      {/* PENDING CORRECTIONS MODAL */}
      {showPendingModal && (
        <div className="ac-custom-modal-backdrop" onClick={() => setShowPendingModal(false)}>
          <div className="ac-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="ac-custom-modal-header">
              <h3>Pending Correction Requests</h3>
              <button className="ac-custom-close-btn" onClick={() => setShowPendingModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="ac-custom-modal-body">
              <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: 'All' },
                  { key: 'in', label: 'Clock In' },
                  { key: 'out', label: 'Clock Out' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setPendingTypeFilter(opt.key)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 999,
                      border: '1px solid ' + (pendingTypeFilter === opt.key ? '#0D9488' : '#CBD5E1'),
                      background: pendingTypeFilter === opt.key ? '#0D9488' : '#FFFFFF',
                      color: pendingTypeFilter === opt.key ? '#FFFFFF' : '#334155',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {loadingPending ? (
                <div className="ac-loading-state">Loading pending corrections...</div>
              ) : filteredPendingAll.length === 0 ? (
                <div className="ac-empty-state">No pending correction requests at this time.</div>
              ) : (
                <div className="ac-minimal-list">
                  {currentPending.map(c => (
                    <div key={c.id} className="ac-minimal-card">
                      <div className="ac-minimal-header">
                        <div className="ac-minimal-user">
                          <div className="ac-minimal-avatar">
                            {c.full_name ? c.full_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div className="ac-minimal-user-info">
                            <span className="ac-minimal-name">{c.full_name}</span>
                            <span className="ac-minimal-id">{c.employee_id}</span>
                          </div>
                        </div>
                        <span className="ac-minimal-type-badge">
                          {c.requested_clock_in ? 'Clock In Correction' : 'Clock Out Correction'}
                        </span>
                      </div>

                      <div className="ac-minimal-body">
                        <div className="ac-minimal-grid">
                          <div className="ac-minimal-field">
                            <label>Attendance Date</label>
                            <span>{formatDate(c.attendance_date)}</span>
                          </div>
                          <div className="ac-minimal-field">
                            <label>Requested Time</label>
                            <span>{formatTo12Hour(c.requested_clock_in || c.requested_clock_out)}</span>
                          </div>
                        </div>

                        <div className="ac-minimal-field full-width" style={{ marginTop: '0.5rem' }}>
                          <label>Reason for Correction</label>
                          <p>{c.reason || '—'}</p>
                        </div>

                        {c.selfie_url && (
                          <div className="ac-minimal-field full-width">
                            <button onClick={() => setPreviewImage(`${API_BASE.replace(/\/api$/, '')}${c.selfie_url}`)} className="ac-minimal-link" style={{ border: 'none', cursor: 'pointer', background: 'transparent', padding: 0 }}>
                              <Eye size={14} /> View Proof
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="ac-minimal-footer">
                        <button className="ac-btn-min-reject" onClick={() => handleCorrectionAction(c.id, 'rejected')}>Reject</button>
                        <button className="ac-btn-min-approve" onClick={() => handleCorrectionAction(c.id, 'approved')}>Approve</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingTotalPages > 1 && (
                <div className="ac-pagination" style={{ marginTop: '1rem' }}>
                  <span className="ac-page-info">Showing {(pendingPage - 1) * itemsPerPage + 1} to {Math.min(pendingPage * itemsPerPage, filteredPendingAll.length)} of {filteredPendingAll.length}</span>
                  <div className="ac-page-controls">
                    <button onClick={() => setPendingPage(p => Math.max(1, p - 1))} disabled={pendingPage === 1} className="ac-page-btn"><ChevronLeft size={16} /> Prev</button>
                    <span className="ac-page-current">{pendingPage} / {pendingTotalPages}</span>
                    <button onClick={() => setPendingPage(p => Math.min(pendingTotalPages, p + 1))} disabled={pendingPage === pendingTotalPages} className="ac-page-btn">Next <ChevronRight size={16} /></button>
                  </div>
                </div>
              )}
            </div>

            <div className="ac-custom-modal-footer">
              <button className="ac-pending-btn" onClick={() => setShowPendingModal(false)}>Close Window</button>
            </div>
          </div>
        </div>
      )}

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