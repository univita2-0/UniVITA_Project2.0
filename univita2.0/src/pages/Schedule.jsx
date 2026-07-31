import React, { useState, useEffect, useCallback } from 'react';
import './Schedule.css';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Edit3, Calendar, Info, ShieldAlert, Bell
} from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const Schedule = () => {
  const userRole = localStorage.getItem('user_role') || 'instructor';
  const canEdit = userRole === 'admin' || userRole === 'hr_admin';

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentScheduleId, setCurrentScheduleId] = useState(null);
  const [instructors, setInstructors] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schoolLocations, setSchoolLocations] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [conflicts, setConflicts] = useState([]);
  const [hasConflict, setHasConflict] = useState(false);

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailSession, setDetailSession] = useState(null);

  const [showScheduleRequests, setShowScheduleRequests] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const [formData, setFormData] = useState({
    user_id: '', date: '', place: '', course: '',
    start_time: '08:00', end_time: '17:00', status: 'Scheduled'
  });

  const todayStr = new Date().toISOString().split('T')[0];

  const getManualDateString = (dateObj) => {
    const y = dateObj.getFullYear(),
          m = String(dateObj.getMonth() + 1).padStart(2, '0'),
          d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getStartOfWeek = (date) => {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  const weekDaysDates = Array.from({ length: 7 }, (_, i) => {
    const d = getStartOfWeek(currentDate);
    d.setDate(d.getDate() + i);
    d.setHours(12, 0, 0, 0);
    return d;
  });

  const formatDateRange = () => {
    const start = weekDaysDates[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const end = weekDaysDates[6].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return `${start} – ${end}`;
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, schedRes, locRes, courseRes] = await Promise.all([
        axios.get(`${API_BASE}/employees`, getAuthHeaders()),
        axios.get(`${API_BASE}/schedules`, getAuthHeaders()),
        axios.get(`${API_BASE}/school-locations`, getAuthHeaders()),
        axios.get(`${API_BASE}/courses`, getAuthHeaders())
      ]);
      const instList = empRes.data.filter(u => u.role.toLowerCase() === 'instructor' && u.status === 'active');
      setInstructors(instList);

      const cleaned = (schedRes.data || []).map(s => ({
        ...s,
        schedule_date: s.schedule_date ? s.schedule_date.split('T')[0] : ''
      }));
      setSchedules(cleaned);
      setSchoolLocations(locRes.data);
      setCourses(courseRes.data);

      fetchPendingCount();
    } catch (err) {
      console.error(err);
      toast.error('Failed to load schedule data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPendingCount = async () => {
    if (!canEdit) return;
    try {
      const res = await axios.get(`${API_BASE}/schedule-requests/pending-count`, getAuthHeaders());
      setPendingCount(res.data.count || 0);
    } catch (err) {
      console.error('Pending count error', err);
    }
  };

  useEffect(() => { loadData(); }, [loadData]);

  const checkConflict = async (userId, date, start, end, excludeId = null) => {
    if (!userId || !date || !start || !end) {
      setHasConflict(false);
      setConflicts([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/schedules/conflicts`, {
        params: { user_id: userId, date, exclude_id: excludeId },
        headers: getAuthHeaders().headers
      });
      const busy = res.data || [];
      setConflicts(busy);
      const overlap = busy.some(bsy => start < bsy.end_time.substring(0, 5) && end > bsy.start_time.substring(0, 5));
      setHasConflict(overlap);
      return overlap;
    } catch (e) {
      console.error(e);
      setHasConflict(false);
    }
  };

  useEffect(() => {
    if (formData.user_id && formData.date && formData.start_time && formData.end_time) {
      checkConflict(formData.user_id, formData.date, formData.start_time, formData.end_time, currentScheduleId);
    }
  }, [formData.user_id, formData.date, formData.start_time, formData.end_time, currentScheduleId]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEditClick = (session) => {
    setFormData({
      user_id: session.employee_id,
      date: session.schedule_date,
      place: session.place || '',
      course: session.course || '',
      start_time: session.start_time ? session.start_time.substring(0, 5) : '08:00',
      end_time: session.end_time ? session.end_time.substring(0, 5) : '17:00',
      status: session.original_status || 'Scheduled'
    });
    setCurrentScheduleId(session.schedule_id);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleQuickAdd = (instructor, dateStr) => {
    setFormData({
      user_id: instructor.employee_id,
      date: dateStr,
      place: schoolLocations[0]?.name || '',
      course: '',
      start_time: '08:00',
      end_time: '17:00',
      status: 'Scheduled'
    });
    setIsEditing(false);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      user_id: '', date: '', place: schoolLocations[0]?.name || '',
      course: '', start_time: '08:00', end_time: '17:00', status: 'Scheduled'
    });
    setIsEditing(false);
    setCurrentScheduleId(null);
    setConflicts([]);
    setHasConflict(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (hasConflict) {
      toast.warning("Time conflict – please adjust.");
      return;
    }
    if (formData.date && formData.date < todayStr) {
      toast.warning("Cannot schedule for a past date.");
      return;
    }
    if (!formData.place) {
      toast.warning("Please select a school location.");
      return;
    }
    if (formData.start_time >= formData.end_time) {
      toast.warning("End time must be after start time.");
      return;
    }
    try {
      const url = isEditing
        ? `${API_BASE}/schedules/${currentScheduleId}`
        : `${API_BASE}/schedules`;
      const res = await (isEditing
        ? axios.put(url, formData, getAuthHeaders())
        : axios.post(url, formData, getAuthHeaders()));
      if (res.data.success) {
        toast.success(isEditing ? 'Schedule updated' : 'Schedule added');
        setShowModal(false);
        resetForm();
        await loadData();
      }
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error(error.response.data.error || 'Cannot modify: Attendance recorded.');
      } else if (error.response?.status === 409) {
        toast.error(error.response.data.error);
      } else {
        toast.error('Error saving schedule.');
      }
    }
  };

  const openDeleteConfirm = (id) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await axios.delete(`${API_BASE}/schedules/${deleteTargetId}`, getAuthHeaders());
      toast.success('Schedule deleted');
      loadData();
    } catch (error) {
      console.error("Delete Error:", error);
      toast.error('Failed to delete schedule.');
    } finally {
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const res = await axios.get(`${API_BASE}/schedule-requests/pending`, getAuthHeaders());
      setPendingRequests(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const openRejectModal = (id) => {
    setRejectTargetId(id);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!rejectTargetId) return;
    try {
      await axios.put(`${API_BASE}/schedule-requests/${rejectTargetId}/status`, {
        status: 'rejected',
        admin_remarks: rejectReason
      }, getAuthHeaders());
      toast.info('Request rejected');
      setShowRejectModal(false);
      fetchPendingRequests();
      loadData();
    } catch (err) {
      toast.error('Failed to update request.');
    }
  };

  const handleProcessRequest = async (id, status) => {
    if (status === 'rejected') {
      openRejectModal(id);
      return;
    }
    try {
      await axios.put(`${API_BASE}/schedule-requests/${id}/status`, {
        status,
        admin_remarks: ''
      }, getAuthHeaders());
      toast.success('Request approved');
      fetchPendingRequests();
      loadData();
    } catch (err) {
      toast.error('Failed to update request.');
    }
  };

  return (
    <div className="card">
      <div className="sched-header">
        <div>
          <div className="sched-date-range">
            <Calendar size={18} color="#64748b" style={{ marginRight: '8px' }} />
            <span>{formatDateRange()}</span>
            <div style={{ display: 'flex', gap: '16px', marginLeft: '1.5rem' }}>
              <ChevronLeft size={24} className="nav-arrow" onClick={() => {
                const prev = new Date(currentDate);
                prev.setDate(prev.getDate() - 7);
                setCurrentDate(prev);
              }} />
              <ChevronRight size={24} className="nav-arrow" onClick={() => {
                const next = new Date(currentDate);
                next.setDate(next.getDate() + 7);
                setCurrentDate(next);
              }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {canEdit && (
            <>
              <button className="btn-add-schedule" onClick={() => { resetForm(); setShowModal(true); }}>
                <Plus size={20} /> Add Schedule
              </button>
              <button
                className="btn-add-schedule"
                style={{ backgroundColor: '#6366f1', position: 'relative' }}
                onClick={() => { setShowScheduleRequests(true); fetchPendingRequests(); }}
              >
                <Bell size={18} /> Requests
                {pendingCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6,
                    backgroundColor: '#ef4444', color: 'white',
                    borderRadius: '50%', minWidth: 20, height: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, padding: '0 4px'
                  }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner">Loading schedules...</div>
      ) : (
        <div className="table-container">
          <table className="custom-table schedule-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingLeft: '20px' }}>Instructors</th>
                {weekDaysDates.map(date => (
                  <th key={date.toString()} className="text-center">
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                    </div>
                    <div style={{ fontSize: '14px' }}>{date.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {instructors.map((inst) => (
                <tr key={inst.employee_id}>
                  <td style={{ paddingLeft: '20px' }}>
                    <div className="instructor-name">{inst.full_name}</div>
                    <div className="instructor-role">{inst.employee_id}</div>
                  </td>
                  {weekDaysDates.map((dateObj) => {
                    const colDateStr = getManualDateString(dateObj);
                    const daySessions = schedules.filter(s =>
                      String(s.employee_id).trim() === String(inst.employee_id).trim() &&
                      String(s.schedule_date || '').split('T')[0] === colDateStr
                    );
                    if (daySessions.length === 0) {
                      return (
                        <td key={colDateStr}>
                          <div className="no-session-clickable" onClick={() => canEdit && handleQuickAdd(inst, colDateStr)}>
                            No Scheduled
                          </div>
                         </td>
                      );
                    }
                    const pendingSessions = daySessions.filter(s => s.attendance_status !== 'COMPLETED');
                    const displaySession = pendingSessions.length > 0 ? pendingSessions[0] : daySessions[0];
                    const isCompleted = displaySession.attendance_status === 'COMPLETED';
                    const totalCount = daySessions.length;
                    return (
                      <td key={colDateStr} style={{ verticalAlign: 'top', padding: '4px' }}>
                        <div
                          className="green-block"
                          onClick={() => { setDetailSession(daySessions); setShowDetailModal(true); }}
                          style={{
                            cursor: 'pointer',
                            backgroundColor: isCompleted ? '#64748b' : '#00897B',
                            position: 'relative',
                            marginBottom: '6px'
                          }}
                        >
                          {totalCount > 1 && (
                            <div style={{
                              position: 'absolute', top: -8, right: -8,
                              background: '#EF4444', color: 'white', borderRadius: '50%',
                              width: 20, height: 20, fontSize: '10px', fontWeight: 'bold',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}>
                              {totalCount}
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '10px', color: 'white', fontWeight: 'bold' }}>
                              {displaySession.start_time?.substring(0,5)} – {displaySession.end_time?.substring(0,5)}
                            </span>
                            {canEdit && (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <Edit3 size={12} color="white" style={{ cursor: 'pointer' }}
                                       onClick={(e) => { e.stopPropagation(); handleEditClick(displaySession); }} />
                                <Trash2 size={12} color="white" style={{ cursor: 'pointer' }}
                                       onClick={(e) => { e.stopPropagation(); openDeleteConfirm(displaySession.schedule_id); }} />
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: 'white', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displaySession.course || 'No Course'}
                          </div>
                          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.9)' }}>
                            {totalCount > 1 ? `${totalCount} total sessions` : (displaySession.place || 'No Room')}
                          </div>
                          {isCompleted && (
                            <div style={{
                              marginTop: '6px', fontSize: '9px', fontWeight: '800',
                              color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.2)',
                              padding: '2px 4px', borderRadius: '4px', textAlign: 'center',
                              textTransform: 'uppercase'
                            }}>
                              Completed
                            </div>
                          )}
                        </div>
                       </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <FormalModal
          show={showModal}
          onClose={() => { setShowModal(false); resetForm(); }}
          title={isEditing ? 'Edit Instructor Schedule' : 'Add Instructor Schedule'}
          wide
          footer={
            <>
              <button className="btn-modal-cancel" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
              <button className="btn-modal-submit" onClick={handleSubmit} disabled={hasConflict}>
                {isEditing ? 'Update Schedule' : 'Save Schedule'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSubmit}>
            <div className="modal-form-group">
              <label className="modal-label">Select Instructor</label>
              <select name="user_id" className="modal-select" value={formData.user_id} onChange={handleInputChange} required>
                <option value="">Select Instructor</option>
                {instructors.map(inst => (
                  <option key={inst.employee_id} value={inst.employee_id}>{inst.full_name} ({inst.employee_id})</option>
                ))}
              </select>
            </div>

            <div className="form-row-grid">
              <div className="modal-form-group">
                <label className="modal-label">Date</label>
                <input type="date" name="date" className="modal-input" value={formData.date} onChange={handleInputChange} min={todayStr} required />
              </div>
              <div className="modal-form-group">
                <label className="modal-label">School Location</label>
                <select name="place" className="modal-select" value={formData.place} onChange={handleInputChange} required>
                  <option value="">Select Location</option>
                  {schoolLocations.map(loc => (
                    <option key={loc.id} value={loc.name}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="modal-form-group" style={{ marginTop: '1rem' }}>
              <label className="modal-label">Course / Subject</label>
              <select name="course" className="modal-select" value={formData.course} onChange={handleInputChange} required>
                <option value="">Select Course</option>
                {courses.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-row-grid" style={{ marginTop: '1rem' }}>
              <div className="modal-form-group">
                <label className="modal-label">Start Time</label>
                <input type="time" name="start_time" className="modal-input" value={formData.start_time} onChange={handleInputChange} required step="60" />
              </div>
              <div className="modal-form-group">
                <label className="modal-label">End Time</label>
                <input type="time" name="end_time" className="modal-input" value={formData.end_time} onChange={handleInputChange} required step="60" />
              </div>
            </div>

            {hasConflict && (
              <div className="conflict-warning">
                <ShieldAlert size={18} /> Time conflict – please adjust.
              </div>
            )}
          </form>
        </FormalModal>
      )}

      <FormalModal show={showDetailModal} onClose={() => setShowDetailModal(false)} title="Schedule Details for the Day" wide>
  {Array.isArray(detailSession) && detailSession.length > 0 ? (
    detailSession.map((s, idx) => {
      // 1. Calculate dynamic status based on time
      const now = new Date();
      const [startH, startM] = s.start_time.split(':').map(Number);
      const [endH, endM] = s.end_time.split(':').map(Number);
      
      const startTime = new Date(now); startTime.setHours(startH, startM, 0);
      const endTime = new Date(now); endTime.setHours(endH, endM, 0);
      
      // Determine final status
      let finalStatus = s.attendance_status;
      if (s.attendance_status === 'IN PROGRESS' && now > endTime) {
        finalStatus = 'NOT COMPLETED'; // Shift ended, but time_out missing
      }

      // 2. Map statuses to UI-friendly labels
      const statusLabels = {
        'COMPLETED': 'COMPLETED',
        'IN PROGRESS': 'IN PROGRESS',
        'NOT COMPLETED': 'NOT COMPLETED'
      };
      
      const statusClass = finalStatus === 'COMPLETED' ? 'status-completed' : 
                          finalStatus === 'IN PROGRESS' ? 'status-inprogress' : 
                          'status-scheduled';

      return (
        <div key={s.schedule_id || idx} className="detail-session" style={{ marginBottom: '15px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
          <div className="detail-row">
            <span className="detail-label">Course</span>
            <span className="detail-value">{s.course}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Time</span>
            <span className="detail-value">{s.start_time?.substring(0,5)} – {s.end_time?.substring(0,5)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Location</span>
            <span className="detail-value">{s.place || 'N/A'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Status</span>
            <span className={`status-value ${statusClass}`}>
              {statusLabels[finalStatus] || 'NOT COMPLETED'}
            </span>
          </div>
        </div>
      );
    })
  ) : (
    <p>No schedule details available.</p>
  )}
</FormalModal>

      {/* Schedule Requests Modal */}
      <FormalModal
        show={showScheduleRequests}
        onClose={() => setShowScheduleRequests(false)}
        title="Pending Schedule Requests"
        wide
      >
        {pendingRequests.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No pending requests.</p>
        ) : (
          <div className="pending-requests-list">
            {pendingRequests.map(req => (
              <div key={req.id} className="pending-request-card">
                <div><strong>{req.full_name}</strong> – {req.request_type === 'new' ? 'New Schedule' : 'Change Existing'} on {req.date}</div>
                <div>{req.course} at {req.place} ({req.start_time} – {req.end_time})</div>
                {req.reason && <div className="request-reason">Reason: {req.reason}</div>}
                <div className="request-actions">
                  <button className="btn-approve-req" onClick={() => handleProcessRequest(req.id, 'approved')}>Approve</button>
                  <button className="btn-reject-req" onClick={() => handleProcessRequest(req.id, 'rejected')}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormalModal>

      {/* Rejection Reason Modal */}
      <FormalModal
        show={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Rejection Reason (Optional)"
        footer={
          <>
            <button className="btn-modal-cancel" onClick={() => setShowRejectModal(false)}>Cancel</button>
            <button className="btn-modal-submit" onClick={confirmReject}>Confirm Rejection</button>
          </>
        }
      >
        <textarea
          className="modal-input"
          rows="3"
          placeholder="Enter a reason for the rejection..."
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
        />
      </FormalModal>

      {/* Delete Confirmation Modal */}
      <FormalModal
        show={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Schedule"
        footer={
          <>
            <button className="btn-modal-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button className="btn-modal-submit" onClick={confirmDelete} style={{ backgroundColor: '#dc2626' }}>Yes, Delete</button>
          </>
        }
      >
        <p>Are you sure you want to permanently delete this schedule? This action cannot be undone.</p>
      </FormalModal>
    </div>
  );
};

export default Schedule;