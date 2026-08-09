// src/pages/Attendance.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Attendance.css';
import { Download, ChevronLeft, ChevronRight, Search, Calendar, Eye, X, Maximize2 } from 'lucide-react';
import axios from 'axios';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const STATIC_BASE = API_BASE.replace(/\/api$/, '');

const formatTo12Hour = (timeStr) => {
  if (!timeStr || timeStr === '--:--') return '—';
  let timePart = timeStr;
  if (timeStr.includes(':')) {
    const parts = timeStr.split(':');
    timePart = `${parts[0]}:${parts[1]}`;
  }
  const [hour, minute] = timePart.split(':');
  let h = parseInt(hour, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${minute} ${ampm}`;
};

const addMinutes = (timeStr, minutes) => {
  const [hour, minute, second] = timeStr.split(':').map(Number);
  const date = new Date(0, 0, 0, hour, minute, second || 0);
  date.setMinutes(date.getMinutes() + minutes);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};

const Attendance = () => {
  const [view, setView] = useState('daily');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [attendanceData, setAttendanceData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, overtime: 0 });
  const dateInputRef = useRef(null);

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [expandedSelfie, setExpandedSelfie] = useState(null);

  const isFutureDate = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate > today;
  };
  const isFuture = isFutureDate(currentDate);

  const fetchAttendance = useCallback(async () => {
    if (view === 'daily' && isFuture) {
      setAttendanceData([]);
      setStats({ present: 0, absent: 0, late: 0, overtime: 0 });
      return;
    }

    try {
      const dateStr = currentDate.toLocaleDateString('en-CA');
      const response = await axios.get(`${API_BASE}/attendance-report?date=${dateStr}`, getAuthHeaders());
      const rawData = response.data;

      if (view === 'daily') {
        const now = new Date();
        const currentTimeStr = now.toTimeString().split(' ')[0];
        const isToday = currentDate.toDateString() === now.toDateString();
        const isPastDay = currentDate < now && !isToday;

        const processed = rawData.map(record => {
          let calcStatus = '';
          const sStart = record.start_time || record.scheduled_start;
          const sEnd = record.end_time || record.scheduled_end;

          if (!sStart || sStart === '--:--') {
            calcStatus = 'No Schedule';
          } else if (record.time_in && record.time_in !== '--:--') {
            const graceEnd = addMinutes(sStart, 15);
            calcStatus = record.time_in > graceEnd ? 'Late' : 'Present';
          } else {
            if (isToday) {
              calcStatus = (sEnd && currentTimeStr < sEnd) ? 'Scheduled' : 'Absent';
            } else if (isPastDay) {
              calcStatus = 'Absent';
            } else {
              calcStatus = 'Scheduled';
            }
          }
          return {
            ...record,
            status: calcStatus,
            start_time: sStart,
            end_time: sEnd,
            location: (record.time_in && record.time_in !== '--:--') ? (record.location || 'Main Campus') : '--',
            time_in: record.time_in || '--:--',
            time_out: record.time_out || '--:--',
            total_hours: record.total_hours || '0.00',
            clock_in_selfie: record.clock_in_selfie || null,
            clock_out_selfie: record.clock_out_selfie || null,
          };
        });
        setAttendanceData(processed);
        calculateStats(processed);
      } 
      else { 
        const summaryMap = new Map();
        rawData.forEach(record => {
          const empId = record.employee_id;
          if (!summaryMap.has(empId)) {
            summaryMap.set(empId, {
              full_name: record.full_name,
              employee_id: empId,
              total_working: 0,
              present_days: 0,
              absent_days: 0,
              late_days: 0
            });
          }
          const emp = summaryMap.get(empId);
          emp.total_working += 1;
          const hasClockedIn = record.time_in && record.time_in !== '--:--';
          const hasSchedule = record.start_time && record.start_time !== '--:--';
          if (hasClockedIn) {
            emp.present_days += 1;
            if (hasSchedule) {
              const graceEnd = addMinutes(record.start_time, 15);
              if (record.time_in > graceEnd) {
                emp.late_days += 1;
              }
            }
          } else if (hasSchedule) {
            const recordDate = new Date(record.date);
            const now = new Date();
            const isToday = recordDate.toDateString() === now.toDateString();
            const currentTimeStr = now.toTimeString().split(' ')[0];
            if (recordDate < now && (!isToday || (record.end_time && currentTimeStr >= record.end_time))) {
              emp.absent_days += 1;
            }
          }
        });
        setAttendanceData(Array.from(summaryMap.values()));
      }
    } catch (error) {
      console.error("Error fetching attendance:", error);
      setAttendanceData([]);
    }
  }, [currentDate, view, isFuture]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  const calculateStats = (data) => {
    let counts = { present: 0, absent: 0, late: 0, overtime: 0 };
    data.forEach(item => {
      const s = item.status?.toLowerCase();
      if (s === 'present') counts.present++;
      else if (s === 'absent') counts.absent++;
      else if (s === 'late') counts.late++;
      if (parseFloat(item.total_hours) > 8) counts.overtime++;
    });
    setStats(counts);
  };

  const changeDate = (offset) => {
    const newDate = new Date(currentDate);
    if (view === 'daily') newDate.setDate(newDate.getDate() + offset);
    else newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const handleDateSelect = (e) => {
    const selectedDate = new Date(e.target.value);
    if (!isNaN(selectedDate)) setCurrentDate(selectedDate);
  };

  const handleViewDetails = (record) => {
    setSelectedRecord(record);
    setShowDetailModal(true);
  };

  const filteredData = attendanceData.filter(row => {
    const nameMatch = (row.full_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const statusMatch = view === 'monthly' || statusFilter === 'All Status' || row.status === statusFilter;
    return nameMatch && statusMatch;
  });

  return (
    <div className="attendance-container">
      <div className="att-header-row">
        <div>
          <h2 className="att-page-title">Attendance Tracker</h2>
          <p className="att-page-subtitle">Monitor and review employee attendance records.</p>
        </div>
      </div>

      <div className="att-stats-row">
        {[
          { label: "Present Today", value: isFuture ? 0 : stats.present, border: "border-green" },
          { label: "Absent Today", value: isFuture ? 0 : stats.absent, border: "border-red" },
          { label: "Late Arrivals", value: isFuture ? 0 : stats.late, border: "border-orange" },
          { label: "Overtime", value: isFuture ? 0 : stats.overtime, border: "border-purple" },
        ].map((stat, idx) => (
          <div key={idx} className={`att-stat-card ${stat.border}`}>
            <p className="att-stat-label">{stat.label}</p>
            <p className="att-stat-value">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="att-main-card">
        <div className="att-controls">
          <div className="view-toggles">
            <button className={`btn-toggle ${view === 'daily' ? 'active' : ''}`} onClick={() => setView('daily')}>Daily View</button>
            <button className={`btn-toggle ${view === 'monthly' ? 'active' : ''}`} onClick={() => setView('monthly')}>Monthly View</button>
          </div>
          
          <div className="att-actions">
            <div className="att-search">
              <Search size={16} className="att-search-icon" />
              <input type="text" placeholder="Search employee..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            {view === 'daily' && (
              <select className="att-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="All Status">All Status</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Absent">Absent</option>
                <option value="Scheduled">Scheduled</option>
              </select>
            )}
            <button className="btn-export" onClick={() => window.print()}><Download size={16} /> Export</button>
          </div>
        </div>

        <div className="date-nav">
          <button className="nav-arrow" onClick={() => changeDate(-1)}><ChevronLeft size={20} /></button>
          <div className="current-date-display" onClick={() => dateInputRef.current?.showPicker()}>
            <Calendar size={18} color="#0D9488" />
            <span>
              {view === 'daily'
                ? currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                : currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
            </span>
            <input
              type={view === 'daily' ? "date" : "month"}
              ref={dateInputRef}
              className="hidden-date-input"
              onChange={handleDateSelect}
              value={currentDate.toLocaleDateString('en-CA')}
            />
          </div>
          <button className="nav-arrow" onClick={() => changeDate(1)}><ChevronRight size={20} /></button>
        </div>

        <div className="table-container">
          <table className="custom-table">
            <thead>
              {view === 'daily' ? (
                <tr>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Total Hours</th>
                  <th>Action</th>
                </tr>
              ) : (
                <tr>
                  <th>Employee</th>
                  <th className="text-center">Working Days</th>
                  <th className="text-center">Present</th>
                  <th className="text-center">Absent</th>
                  <th className="text-center">Late</th>
                </tr>
              )}
            </thead>
            <tbody>
              {(isFuture && view === 'daily') ? (
                <tr><td colSpan="6" className="empty-row-message">No records available for future dates.</td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan={view === 'daily' ? "6" : "5"} className="empty-row-message">No records found for this period.</td></tr>
              ) : (
                filteredData.map((row, idx) => (
                  <tr key={idx}>
                    {view === 'daily' ? (
                      <>
                        <td>
                          <div className="emp-name">{row.full_name}</div>
                          <div className="emp-id">{row.employee_id}</div>
                        </td>
                        <td><span className={`status-badge ${row.status?.toLowerCase().replace(' ', '-')}`}>{row.status}</span></td>
                        <td>{formatTo12Hour(row.time_in)}</td>
                        <td>{formatTo12Hour(row.time_out)}</td>
                        <td>{row.total_hours} hrs</td>
                        <td>
                          <button className="btn-view-details" onClick={() => handleViewDetails(row)} title="View Details">
                            <Eye size={16} />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <div className="emp-name">{row.full_name}</div>
                          <div className="emp-id">{row.employee_id}</div>
                        </td>
                        <td className="text-center font-medium">{row.total_working}</td>
                        <td className="text-center text-emerald-600 font-semibold">{row.present_days}</td>
                        <td className="text-center text-rose-600 font-semibold">{row.absent_days}</td>
                        <td className="text-center text-amber-600 font-semibold">{row.late_days}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FormalModal show={showDetailModal} onClose={() => setShowDetailModal(false)} title="Attendance Details" footer={<button className="btn-modal-cancel" onClick={() => setShowDetailModal(false)}>Close</button>}>
        {selectedRecord && (
          <div className="attendance-detail-grid">
            <div className="detail-field">
              <span className="detail-label">Employee ID</span>
              <span className="detail-value">{selectedRecord.employee_id}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Full Name</span>
              <span className="detail-value">{selectedRecord.full_name}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Status</span>
              <span className={`status-badge inline-flex ${selectedRecord.status?.toLowerCase().replace(' ', '-')}`}>{selectedRecord.status}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Total Hours</span>
              <span className="detail-value">{selectedRecord.total_hours} hrs</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Time In</span>
              <span className="detail-value">{formatTo12Hour(selectedRecord.time_in)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Time Out</span>
              <span className="detail-value">{formatTo12Hour(selectedRecord.time_out)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Clock In Location</span>
              <span className="detail-value">{selectedRecord.location ? selectedRecord.location.split('(')[0] : '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Clock Out Location</span>
              <span className="detail-value">{selectedRecord.location && selectedRecord.time_out !== '--:--' ? selectedRecord.location.split('(')[0] : '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Clock In Selfie</span>
              {selectedRecord.clock_in_selfie ? 
                <button className="selfie-view-btn" onClick={() => setExpandedSelfie(selectedRecord.clock_in_selfie)}><Eye size={14} /> View Photo</button> 
                : <span className="detail-value text-gray">—</span>
              }
            </div>
            <div className="detail-field">
              <span className="detail-label">Clock Out Selfie</span>
              {selectedRecord.clock_out_selfie ? 
                <button className="selfie-view-btn" onClick={() => setExpandedSelfie(selectedRecord.clock_out_selfie)}><Eye size={14} /> View Photo</button> 
                : <span className="detail-value text-gray">—</span>
              }
            </div>
          </div>
        )}
      </FormalModal>

      {expandedSelfie && (
        <div className="selfie-overlay" onClick={() => setExpandedSelfie(null)}>
          <div className="selfie-modal" onClick={(e) => e.stopPropagation()}>
            <button className="selfie-close-btn" onClick={() => setExpandedSelfie(null)}><X size={20} /></button>
            <img src={`${STATIC_BASE}${expandedSelfie}`} alt="Selfie" className="selfie-img-large" />
            <button className="selfie-fullscreen" onClick={() => window.open(`${STATIC_BASE}${expandedSelfie}`, '_blank')}><Maximize2 size={16} /> Open Fullscreen</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Attendance;