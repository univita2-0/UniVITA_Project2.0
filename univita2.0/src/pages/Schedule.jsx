// src/pages/Schedule.js
import React, { useState, useEffect, useCallback } from 'react';
import './Schedule.css';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Edit3, Calendar, ShieldAlert, Bell, Clock, MapPin, Check, X
} from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const formatTo12Hour = (timeStr) => {
  if (!timeStr) return '';
  const parts = timeStr.substring(0, 5).split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; 
  return `${hours}:${minutes} ${ampm}`;
};

const formatDisplayDate = (dateString) => {
  if (!dateString) return '';
  const cleanDate = dateString.split('T')[0];
  const [year, month, day] = cleanDate.split('-');
  if (!year || !month || !day) return cleanDate;
  const dateObj = new Date(year, month - 1, day);
  return dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

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

  // --- Bulk Upload States (Grid Only) ---
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [manualBulkRows, setManualBulkRows] = useState([]);
  const [isUploadingBulk, setIsUploadingBulk] = useState(false);

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
    } catch (err) {}
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
    const now = new Date();
    const currentLocalDate = now.toLocaleDateString('en-CA');
    const currentTimeStr = now.toTimeString().substring(0, 5); 
    const sessionDateStr = session.schedule_date ? session.schedule_date.split('T')[0] : '';
    const sessionEndTime = session.end_time ? session.end_time.substring(0, 5) : '';

    if (sessionDateStr < currentLocalDate || (sessionDateStr === currentLocalDate && sessionEndTime < currentTimeStr)) {
       toast.warning("This schedule has already passed and cannot be edited.");
       return;
    }

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

    const userSchedules = schedules.filter(s => String(s.employee_id).trim() === String(formData.user_id).trim() && String(s.schedule_date).split('T')[0] === formData.date);
    const isOnLeave = userSchedules.some(s => s.course === 'On Leave' || s.place === 'Remote/Leave');
    
    if (isOnLeave) {
      toast.error("Cannot assign a schedule. The employee is on leave on this date.");
      return;
    }

    if (hasConflict) {
      toast.warning("Time conflict – please adjust.");
      return;
    }

    const now = new Date();
    const currentLocalDate = now.toLocaleDateString('en-CA');
    const currentTimeStr = now.toTimeString().substring(0, 5); 

    if (formData.date < currentLocalDate) {
      toast.warning("Cannot schedule for a past date.");
      return;
    }

    if (formData.date === currentLocalDate && formData.start_time < currentTimeStr) {
      toast.warning("Cannot schedule a start time that has already passed today.");
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
      toast.error(error.response?.data?.error || 'Error saving schedule.');
    }
  };

  const openDeleteConfirm = (session) => {
    const now = new Date();
    const currentLocalDate = now.toLocaleDateString('en-CA');
    const currentTimeStr = now.toTimeString().substring(0, 5); 
    const sessionDateStr = session.schedule_date ? session.schedule_date.split('T')[0] : '';
    const sessionEndTime = session.end_time ? session.end_time.substring(0, 5) : '';

    if (sessionDateStr < currentLocalDate || (sessionDateStr === currentLocalDate && sessionEndTime < currentTimeStr)) {
       toast.warning("This schedule has already passed and cannot be deleted.");
       return;
    }

    setDeleteTargetId(session.schedule_id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await axios.delete(`${API_BASE}/schedules/${deleteTargetId}`, getAuthHeaders());
      toast.success('Schedule deleted');
      loadData();
    } catch (error) {
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
    } catch (err) {}
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

  const addManualBulkRow = () => {
    setManualBulkRows([...manualBulkRows, {
      id: Date.now() + Math.random(),
      employee_id: '',
      date: '',
      place: schoolLocations[0]?.name || '',
      course: '',
      start_time: '08:00',
      end_time: '17:00'
    }]);
  };

  const removeManualBulkRow = (id) => {
    setManualBulkRows(manualBulkRows.filter(row => row.id !== id));
  };

  const updateManualBulkRow = (id, field, value) => {
    setManualBulkRows(manualBulkRows.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  const submitInteractiveBulk = async () => {
    const validRows = manualBulkRows.filter(r => r.employee_id && r.date && r.place && r.course && r.start_time && r.end_time);
    
    if (validRows.length === 0) {
      return toast.warning("Please fill out all fields in at least one row.");
    }

    setIsUploadingBulk(true);
    try {
      const res = await axios.post(`${API_BASE}/schedules/bulk`, { schedules: validRows }, getAuthHeaders());
      if (res.data.successCount > 0) toast.success(`Successfully assigned ${res.data.successCount} schedules.`);
      if (res.data.errors && res.data.errors.length > 0) {
        const errorSummary = res.data.errors.slice(0, 3).join('\n');
        toast.error(`Skipped ${res.data.errors.length} rows with errors:\n${errorSummary}`);
      }
      setShowBulkModal(false);
      setManualBulkRows([]);
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || "Error processing schedules.");
    } finally {
      setIsUploadingBulk(false);
    }
  };

  const openBulkModal = () => {
    setManualBulkRows([{
      id: Date.now(),
      employee_id: '',
      date: '',
      place: schoolLocations[0]?.name || '',
      course: '',
      start_time: '08:00',
      end_time: '17:00'
    }]);
    setShowBulkModal(true);
  };

  return (
    <div className="sch-container">
      <div className="sch-header">
        <div className="sch-title-area">
          <p className="sch-subtitle">Manage instructor schedules, locations, and course assignments.</p>
        </div>
        
        <div className="sch-actions">
          {canEdit && (
            <>
              <button 
                className="btn-sch-outline sch-requests-btn" 
                onClick={() => { setShowScheduleRequests(true); fetchPendingRequests(); }}
              >
                <Bell size={16} /> 
                <span>Requests</span>
                {pendingCount > 0 && <span className="sch-badge-count">{pendingCount}</span>}
              </button>
              
              <button className="btn-sch-outline" onClick={openBulkModal}>
                <Calendar size={16} /> 
                <span>Bulk Assign</span>
              </button>

              <button className="btn-sch-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                <Plus size={16} /> 
                <span>Add Schedule</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="sch-card">
        <div className="sch-toolbar">
          <div className="sch-date-nav">
            <button className="sch-nav-btn" onClick={() => {
              const prev = new Date(currentDate);
              prev.setDate(prev.getDate() - 7);
              setCurrentDate(prev);
            }}>
              <ChevronLeft size={20} />
            </button>
            <div className="sch-current-date">
              <Calendar size={18} className="sch-date-icon" />
              <span>{formatDateRange()}</span>
            </div>
            <button className="sch-nav-btn" onClick={() => {
              const next = new Date(currentDate);
              next.setDate(next.getDate() + 7);
              setCurrentDate(next);
            }}>
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="sch-loading-state">Loading schedules...</div>
        ) : (
          <div className="sch-table-wrapper">
            <table className="sch-table">
              <thead>
                <tr>
                  <th className="sch-col-fixed">Instructors</th>
                  {weekDaysDates.map(date => {
                    const isToday = getManualDateString(date) === todayStr;
                    return (
                      <th key={date.toString()} className={`text-center ${isToday ? 'sch-th-today' : ''}`}>
                        <div className="sch-th-day">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                        <div className="sch-th-date">{date.getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {instructors.map((inst) => (
                  <tr key={inst.employee_id}>
                    <td className="sch-col-fixed">
                      <div className="sch-emp-name">{inst.full_name}</div>
                      <div className="sch-emp-id">{inst.employee_id}</div>
                    </td>
                    
                    {weekDaysDates.map((dateObj) => {
                      const colDateStr = getManualDateString(dateObj);
                      const daySessions = schedules.filter(s =>
                        String(s.employee_id).trim() === String(inst.employee_id).trim() &&
                        String(s.schedule_date || '').split('T')[0] === colDateStr
                      );

                      const leaveSession = daySessions.find(s => s.course === 'On Leave' || s.place === 'Remote/Leave');
                      
                      if (leaveSession) {
                        return (
                          <td key={colDateStr} className="sch-cell">
                            <div className="sch-session-block on-leave-block">
                              <div className="sch-session-course">ON LEAVE</div>
                              <div className="sch-session-place">Not available to schedule</div>
                            </div>
                          </td>
                        );
                      }

                      if (daySessions.length === 0) {
                        return (
                          <td key={colDateStr} className="sch-cell">
                            <div className="sch-empty-slot" onClick={() => canEdit && handleQuickAdd(inst, colDateStr)}>
                              {canEdit ? <><Plus size={14} /> Add</> : 'No Schedule'}
                            </div>
                           </td>
                        );
                      }

                      const pendingSessions = daySessions.filter(s => s.attendance_status !== 'COMPLETED');
                      const displaySession = pendingSessions.length > 0 ? pendingSessions[0] : daySessions[0];
                      const isCompleted = displaySession.attendance_status === 'COMPLETED';
                      const totalCount = daySessions.length;

                      return (
                        <td key={colDateStr} className="sch-cell">
                          <div 
                            className={`sch-session-block ${isCompleted ? 'completed' : 'active'}`}
                            onClick={() => { setDetailSession(daySessions); setShowDetailModal(true); }}
                          >
                            {totalCount > 1 && (
                              <div className="sch-multi-badge">{totalCount}</div>
                            )}
                            
                            <div className="sch-session-header">
                              <span className="sch-session-time">
                                {formatTo12Hour(displaySession.start_time)} – {formatTo12Hour(displaySession.end_time)}
                              </span>
                              {canEdit && (
                                <div className="sch-session-actions">
                                  <Edit3 size={14} className="sch-action-icon edit" onClick={(e) => { e.stopPropagation(); handleEditClick(displaySession); }} />
                                  <Trash2 size={14} className="sch-action-icon delete" onClick={(e) => { e.stopPropagation(); openDeleteConfirm(displaySession); }} />
                                </div>
                              )}
                            </div>
                            <div className="sch-session-course">{displaySession.course || 'No Course'}</div>
                            <div className="sch-session-place">
                              {totalCount > 1 ? `${totalCount} Total Sessions` : (displaySession.place || 'No Room')}
                            </div>
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
      </div>

      {canEdit && (
        <FormalModal
          show={showModal}
          onClose={() => { setShowModal(false); resetForm(); }}
          title={isEditing ? 'Edit Instructor Schedule' : 'Add Instructor Schedule'}
          wide
          footer={
            <>
              <button className="btn-sch-cancel" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
              <button className="btn-sch-primary" onClick={handleSubmit} disabled={hasConflict}>
                {isEditing ? 'Update Schedule' : 'Save Schedule'}
              </button>
            </>
          }
        >
          <form className="sch-form" onSubmit={handleSubmit}>
            <div className="sch-form-group">
              <label>Select Instructor</label>
              <select name="user_id" className="sch-input" value={formData.user_id} onChange={handleInputChange} required>
                <option value="">Select Instructor</option>
                {instructors.map(inst => (
                  <option key={inst.employee_id} value={inst.employee_id}>{inst.full_name} ({inst.employee_id})</option>
                ))}
              </select>
            </div>

            <div className="sch-form-row">
              <div className="sch-form-group">
                <label>Date</label>
                <input type="date" name="date" className="sch-input" value={formData.date} onChange={handleInputChange} min={todayStr} required />
              </div>
              <div className="sch-form-group">
                <label>School Location</label>
                <select name="place" className="sch-input" value={formData.place} onChange={handleInputChange} required>
                  <option value="">Select Location</option>
                  {schoolLocations.map(loc => (
                    <option key={loc.id} value={loc.name}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="sch-form-group">
              <label>Course / Subject</label>
              <select name="course" className="sch-input" value={formData.course} onChange={handleInputChange} required>
                <option value="">Select Course</option>
                {courses.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="sch-form-row">
              <div className="sch-form-group">
                <label>Start Time (AM/PM format)</label>
                <input type="time" name="start_time" className="sch-input" value={formData.start_time} onChange={handleInputChange} required step="60" />
              </div>
              <div className="sch-form-group">
                <label>End Time (AM/PM format)</label>
                <input type="time" name="end_time" className="sch-input" value={formData.end_time} onChange={handleInputChange} required step="60" />
              </div>
            </div>

            {hasConflict && (
              <div className="sch-conflict-alert">
                <ShieldAlert size={16} />
                <span>Time conflict detected. Please adjust the schedule.</span>
              </div>
            )}
          </form>
        </FormalModal>
      )}

      {canEdit && (
        <FormalModal
          show={showBulkModal}
          onClose={() => {
            setShowBulkModal(false);
            setManualBulkRows([]);
          }}
          title="Bulk Assign Schedules"
          wide
          footer={
            <>
              <button className="btn-sch-cancel" onClick={() => setShowBulkModal(false)}>Cancel</button>
              <button 
                className="btn-sch-primary" 
                onClick={submitInteractiveBulk} 
                disabled={isUploadingBulk || manualBulkRows.length === 0}
              >
                {isUploadingBulk ? 'Processing...' : `Assign Schedules`}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="sch-interactive-grid-container">
              <p className="sch-bulk-desc">Add multiple schedules using the dropdowns below. This is faster and prevents typing errors.</p>
              
              <div className="sch-interactive-table-wrapper">
                <table className="sch-interactive-table">
                  <thead>
                    <tr>
                      <th>Instructor</th>
                      <th>Date</th>
                      <th>Location</th>
                      <th>Course</th>
                      <th>Start</th>
                      <th>End</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualBulkRows.map(row => (
                      <tr key={row.id}>
                        <td>
                          <select className="sch-input-small" value={row.employee_id} onChange={(e) => updateManualBulkRow(row.id, 'employee_id', e.target.value)}>
                            <option value="">Select...</option>
                            {instructors.map(inst => <option key={inst.employee_id} value={inst.employee_id}>{inst.full_name}</option>)}
                          </select>
                        </td>
                        <td>
                          <input type="date" className="sch-input-small" min={todayStr} value={row.date} onChange={(e) => updateManualBulkRow(row.id, 'date', e.target.value)} />
                        </td>
                        <td>
                          <select className="sch-input-small" value={row.place} onChange={(e) => updateManualBulkRow(row.id, 'place', e.target.value)}>
                            <option value="">Select...</option>
                            {schoolLocations.map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="sch-input-small" value={row.course} onChange={(e) => updateManualBulkRow(row.id, 'course', e.target.value)}>
                            <option value="">Select...</option>
                            {courses.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <input type="time" className="sch-input-small" value={row.start_time} onChange={(e) => updateManualBulkRow(row.id, 'start_time', e.target.value)} />
                        </td>
                        <td>
                          <input type="time" className="sch-input-small" value={row.end_time} onChange={(e) => updateManualBulkRow(row.id, 'end_time', e.target.value)} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button className="sch-remove-row-btn" onClick={() => removeManualBulkRow(row.id)} title="Remove row">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button className="btn-sch-outline" style={{ alignSelf: 'flex-start', marginTop: '10px' }} onClick={addManualBulkRow}>
                <Plus size={16} /> Add Another Row
              </button>
            </div>
          </div>
        </FormalModal>
      )}

      <FormalModal 
        show={showDetailModal} 
        onClose={() => setShowDetailModal(false)} 
        title="Daily Schedule Overview" 
        wide
        footer={<button className="btn-sch-cancel" onClick={() => setShowDetailModal(false)}>Close</button>}
      >
        <div className="sch-detail-list">
          {Array.isArray(detailSession) && detailSession.length > 0 ? (
            detailSession.map((s, idx) => {
              const now = new Date();
              const scheduleDateStr = s.schedule_date ? s.schedule_date.split('T')[0] : '';
              const startTime = new Date(`${scheduleDateStr}T${s.start_time}`);
              const endTime = new Date(`${scheduleDateStr}T${s.end_time}`);
              let finalStatus = s.attendance_status || 'SCHEDULED';
              
              if (finalStatus.toUpperCase() === 'IN PROGRESS' && now > endTime) {
                finalStatus = 'MISSING CLOCK-OUT'; 
              } else if (finalStatus.toUpperCase() === 'SCHEDULED' && now > endTime) {
                finalStatus = 'MISSED SHIFT';
              } else if (finalStatus.toUpperCase() === 'SCHEDULED' && now >= startTime && now <= endTime) {
                finalStatus = 'LATE / PENDING';
              }

              const statusClass = 
                finalStatus === 'COMPLETED' ? 'status-completed' : 
                finalStatus === 'IN PROGRESS' ? 'status-inprogress' : 
                finalStatus === 'MISSING CLOCK-OUT' || finalStatus === 'MISSED SHIFT' ? 'status-danger' :
                finalStatus === 'LATE / PENDING' ? 'status-warning' :
                'status-scheduled';

              return (
                <div key={s.schedule_id || idx} className="sch-detail-card">
                  <div className="sch-detail-header">
                    <h4 className="sch-detail-course">{s.course}</h4>
                    <span className={`sch-detail-status ${statusClass}`}>
                      {finalStatus}
                    </span>
                  </div>
                  <div className="sch-detail-body">
                    <div className="sch-detail-item">
                      <Clock size={14} />
                      <span>{formatTo12Hour(s.start_time)} – {formatTo12Hour(s.end_time)}</span>
                    </div>
                    <div className="sch-detail-item">
                      <MapPin size={14} />
                      <span>{s.place || 'Unassigned'}</span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="sch-empty-state">No schedule details available.</div>
          )}
        </div>
      </FormalModal>

      {/* CUSTOMIZED PENDING SCHEDULE REQUESTS MODAL (No FormalModal, Strict Unbroken Layout) */}
      {showScheduleRequests && (
        <div className="sch-custom-modal-backdrop" onClick={() => setShowScheduleRequests(false)}>
          <div className="sch-custom-modal" onClick={e => e.stopPropagation()}>
            <div className="sch-custom-modal-header">
              <h3>Pending Schedule Requests</h3>
              <button className="sch-custom-close-btn" onClick={() => setShowScheduleRequests(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="sch-custom-modal-body">
              {pendingRequests.length === 0 ? (
                <div className="sch-empty-state">No pending requests at this time.</div>
              ) : (
                <div className="sch-custom-requests-list">
                  {pendingRequests.map(req => (
                    <div key={req.id} className="sch-custom-request-card">
                      <div className="sch-custom-req-top">
                        <span className="sch-custom-name">{req.full_name}</span>
                        <span className="sch-custom-type-pill">{req.request_type === 'new' ? 'New Schedule' : 'Schedule Change'}</span>
                      </div>
                      <div className="sch-custom-details-grid">
                        <div className="sch-custom-prop">
                          <label>Date</label>
                          <span className="nowrap">{formatDisplayDate(req.date)}</span>
                        </div>
                        <div className="sch-custom-prop">
                          <label>Course & Location</label>
                          <span>{req.course} at {req.place}</span>
                        </div>
                        <div className="sch-custom-prop">
                          <label>Time Period</label>
                          <span className="nowrap">{formatTo12Hour(req.start_time)} – {formatTo12Hour(req.end_time)}</span>
                        </div>
                        {req.reason && (
                          <div className="sch-custom-prop full-width">
                            <label>Reason / Remarks</label>
                            <span className="reason-text">{req.reason}</span>
                          </div>
                        )}
                      </div>
                      <div className="sch-custom-req-actions">
                        <button className="btn-sch-reject" onClick={() => handleProcessRequest(req.id, 'rejected')}>
                          <X size={14} /> Reject
                        </button>
                        <button className="btn-sch-approve" onClick={() => handleProcessRequest(req.id, 'approved')}>
                          <Check size={14} /> Approve Request
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sch-custom-modal-footer">
              <button className="btn-sch-cancel" onClick={() => setShowScheduleRequests(false)}>Close Window</button>
            </div>
          </div>
        </div>
      )}

      <FormalModal
        show={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Provide Rejection Reason"
        footer={
          <>
            <button className="btn-sch-cancel" onClick={() => setShowRejectModal(false)}>Cancel</button>
            <button className="btn-sch-danger" onClick={confirmReject}>Confirm Rejection</button>
          </>
        }
      >
        <div className="sch-form-group">
          <label>Reason (Optional)</label>
          <textarea
            className="sch-input"
            rows="4"
            placeholder="Enter reason for rejecting the request..."
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
          />
        </div>
      </FormalModal>

      <FormalModal
        show={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Schedule"
        footer={
          <>
            <button className="btn-sch-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button className="btn-sch-danger" onClick={confirmDelete}>Yes, Delete</button>
          </>
        }
      >
        <p className="sch-confirm-text">Are you sure you want to permanently delete this schedule? This action cannot be undone.</p>
      </FormalModal>
    </div>
  );
};

export default Schedule;