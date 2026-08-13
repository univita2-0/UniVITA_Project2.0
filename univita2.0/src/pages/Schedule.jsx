import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Schedule.css';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Edit3, Calendar, ShieldAlert, Bell, Clock, MapPin
} from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

// Helper: Convert 24-hour time (e.g., "14:30:00" or "14:30") to 12-hour AM/PM format (e.g., "2:30 PM")
const formatTo12Hour = (timeStr) => {
  if (!timeStr) return '';
  const parts = timeStr.substring(0, 5).split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  return `${hours}:${minutes} ${ampm}`;
};

// Helper: Clean raw ISO date strings into readable formats (e.g., "August 11, 2026")
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

  // --- Bulk Upload States ---
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkData, setBulkData] = useState([]);
  const [isUploadingBulk, setIsUploadingBulk] = useState(false);
  const fileInputRef = useRef(null);

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

  // --- Bulk Upload Functions ---
  const downloadTemplate = () => {
    const headers = "employee_id,date,place,course,start_time,end_time\n";
    const sampleRow = "E001,2026-09-01,HCT Academy Pasig,Web Development,08:00,12:00\n";
    const blob = new Blob([headers + sampleRow], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Bulk_Schedule_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
        toast.error("File is empty or missing data rows.");
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const expectedHeaders = ['employee_id', 'date', 'place', 'course', 'start_time', 'end_time'];
      
      const isValid = expectedHeaders.every(h => headers.includes(h));
      if (!isValid) {
        toast.error("Invalid CSV format. Please download and use the official template.");
        return;
      }

      const schedules = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length === headers.length) {
          const rowObj = {};
          headers.forEach((h, index) => { rowObj[h] = values[index]; });
          schedules.push(rowObj);
        }
      }
      setBulkData(schedules);
    };
    reader.readAsText(file);
  };

  const submitBulkUpload = async () => {
    if (bulkData.length === 0) return toast.warning("No valid schedule data found in the file.");
    
    setIsUploadingBulk(true);
    try {
      const res = await axios.post(`${API_BASE}/schedules/bulk`, { schedules: bulkData }, getAuthHeaders());
      
      if (res.data.successCount > 0) {
        toast.success(`Successfully assigned ${res.data.successCount} schedules.`);
      }
      
      if (res.data.errors && res.data.errors.length > 0) {
        // Show errors in a readable way (first 3 errors to prevent huge toasts)
        const errorSummary = res.data.errors.slice(0, 3).join('\n');
        toast.error(`Skipped ${res.data.errors.length} rows with errors:\n${errorSummary}`);
      }

      setShowBulkModal(false);
      setBulkData([]);
      if (fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
      await loadData(); // Refresh calendar

    } catch (error) {
      toast.error(error.response?.data?.error || "Error processing bulk upload.");
    } finally {
      setIsUploadingBulk(false);
    }
  };

  return (
    <div className="sch-container">
      <div className="sch-header">
        <div className="sch-title-area">
          <h2 className="sch-title">Schedule Management</h2>
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
              
              <button className="btn-sch-outline" onClick={() => setShowBulkModal(true)}>
                <Calendar size={16} /> 
                <span>Bulk Upload</span>
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
        {/* Calendar Toolbar */}
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

        {/* Schedule Grid */}
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
                                  <Trash2 size={14} className="sch-action-icon delete" onClick={(e) => { e.stopPropagation(); openDeleteConfirm(displaySession.schedule_id); }} />
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

      {/* Add / Edit Schedule Modal */}
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
                <span className="sch-time-preview">Reflects as: <strong>{formatTo12Hour(formData.start_time)}</strong></span>
              </div>
              <div className="sch-form-group">
                <label>End Time (AM/PM format)</label>
                <input type="time" name="end_time" className="sch-input" value={formData.end_time} onChange={handleInputChange} required step="60" />
                <span className="sch-time-preview">Reflects as: <strong>{formatTo12Hour(formData.end_time)}</strong></span>
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

      {/* Bulk Upload Modal */}
      {canEdit && (
        <FormalModal
          show={showBulkModal}
          onClose={() => {
            setShowBulkModal(false);
            setBulkData([]);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          title="Bulk Assign Schedules"
          footer={
            <>
              <button className="btn-sch-cancel" onClick={() => setShowBulkModal(false)}>Cancel</button>
              <button 
                className="btn-sch-primary" 
                onClick={submitBulkUpload} 
                disabled={bulkData.length === 0 || isUploadingBulk}
              >
                {isUploadingBulk ? 'Processing...' : `Upload ${bulkData.length} Records`}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '14px', color: '#4B5563' }}>
              Upload a CSV file to assign multiple schedules at once. The file must strictly follow the required headers.
            </p>
            
            <button 
              className="btn-sch-outline" 
              onClick={downloadTemplate}
              style={{ alignSelf: 'flex-start' }}
            >
              Download CSV Template
            </button>

            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', color: '#111827', display: 'block', marginBottom: '8px' }}>
                Upload Filled Template
              </label>
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileUpload} 
                ref={fileInputRef}
                style={{
                  display: 'block', width: '100%', padding: '10px', 
                  border: '1px dashed #D1D5DB', borderRadius: '8px',
                  backgroundColor: '#F9FAFB'
                }}
              />
            </div>
            
            {bulkData.length > 0 && (
              <div style={{ padding: '12px', backgroundColor: '#ECFDF5', borderRadius: '8px', border: '1px solid #D1FAE5' }}>
                <span style={{ color: '#065F46', fontSize: '14px', fontWeight: '500' }}>
                  ✓ Successfully read {bulkData.length} schedules from file. Ready to process.
                </span>
              </div>
            )}
          </div>
        </FormalModal>
      )}

      {/* Schedule Detail Modal */}
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

      {/* Pending Requests Modal */}
      <FormalModal
        show={showScheduleRequests}
        onClose={() => setShowScheduleRequests(false)}
        title="Pending Schedule Requests"
        wide
        footer={<button className="btn-sch-cancel" onClick={() => setShowScheduleRequests(false)}>Close</button>}
      >
        {pendingRequests.length === 0 ? (
          <div className="sch-empty-state">No pending requests at this time.</div>
        ) : (
          <div className="sch-requests-list">
            {pendingRequests.map(req => (
              <div key={req.id} className="sch-request-card">
                <div className="sch-req-header">
                  <div className="sch-req-info">
                    <span className="sch-req-name">{req.full_name}</span>
                    <span className="sch-req-type">{req.request_type === 'new' ? 'New Schedule' : 'Schedule Change'}</span>
                  </div>
                  <span className="sch-req-date">{formatDisplayDate(req.date)}</span>
                </div>
                <div className="sch-req-body">
                  <p><strong>Course:</strong> {req.course} at {req.place}</p>
                  <p><strong>Time:</strong> {formatTo12Hour(req.start_time)} – {formatTo12Hour(req.end_time)}</p>
                  {req.reason && <p className="sch-req-reason"><strong>Reason:</strong> {req.reason}</p>}
                </div>
                <div className="sch-req-actions">
                  <button className="btn-sch-reject" onClick={() => handleProcessRequest(req.id, 'rejected')}>Reject</button>
                  <button className="btn-sch-approve" onClick={() => handleProcessRequest(req.id, 'approved')}>Approve Request</button>
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

      {/* Delete Confirmation Modal */}
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