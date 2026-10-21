// src/pages/Attendance.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './Attendance.css';
import { Download, ChevronLeft, ChevronRight, Search, Calendar, Eye, X, Maximize2 } from 'lucide-react';
import axios from 'axios';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const STATIC_BASE = API_BASE.replace(/\/api$/, '');

/* ---------------- date helpers (timezone-safe) ---------------- */
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const toISOMonth = (d) => toISODate(d).slice(0, 7);

// Strictly validates YYYY-MM-DD (daily) or YYYY-MM (monthly).
// Returns a local-midnight Date or null on any invalid input.
const parseDateInput = (value, mode) => {
  if (!value) return null;
  if (mode === 'monthly') {
    const m = /^(\d{4})-(\d{2})$/.exec(value);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    return new Date(year, month - 1, 1);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  // Rejects overflow such as 2024-02-31 rolling into March
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
};

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

// Debounce helper for the search field
const useDebouncedValue = (value, delay = 300) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

const Attendance = () => {
  const [view, setView] = useState('daily');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [attendanceData, setAttendanceData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, overtime: 0 });

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const dateInputRef = useRef(null);

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [expandedSelfie, setExpandedSelfie] = useState(null);

  const debouncedSearch = useDebouncedValue(searchTerm.trim(), 300);

  // "Now" limits — the UI cannot navigate past today / current month
  const now = new Date();
  const maxDaily = startOfDay(now);
  const maxMonthly = startOfMonth(now);

  const isFutureDate = (date) => {
    const checkDate = startOfDay(date);
    return view === 'daily' ? checkDate > maxDaily : checkDate > maxMonthly;
  };
  const isFuture = isFutureDate(currentDate);

  const fetchAttendance = useCallback(async (signal) => {
    setLoading(true);
    setFetchError('');

    if (view === 'daily' && isFuture) {
      setAttendanceData([]);
      setStats({ present: 0, absent: 0, late: 0, overtime: 0 });
      setLoading(false);
      return;
    }

    try {
      const dateStr = toISODate(currentDate);
      const monthStr = toISOMonth(currentDate);

      const endpoint = view === 'monthly'
        ? `${API_BASE}/attendance-report?month=${monthStr}`
        : `${API_BASE}/attendance-report?date=${dateStr}`;

      const response = await axios.get(endpoint, { ...getAuthHeaders(), signal });
      const rawData = Array.isArray(response.data) ? response.data : [];

      if (view === 'daily') {
        const nowInner = new Date();
        const currentTimeStr = nowInner.toTimeString().split(' ')[0];
        const isToday = startOfDay(currentDate).getTime() === startOfDay(nowInner).getTime();
        const isPastDay = startOfDay(currentDate) < startOfDay(nowInner);

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
            clock_in_selfie: (record.clock_in_selfie && record.clock_in_selfie !== 'null' && record.clock_in_selfie !== '--:--' && record.clock_in_selfie.trim() !== '') ? record.clock_in_selfie : null,
            clock_out_selfie: (record.clock_out_selfie && record.clock_out_selfie !== 'null' && record.clock_out_selfie !== '--:--' && record.clock_out_selfie.trim() !== '') ? record.clock_out_selfie : null,
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
              late_days: 0,
              overtime_days: 0,
            });
          }
          const emp = summaryMap.get(empId);
          emp.total_working += 1;

          const hours = Number.parseFloat(record.total_hours);
          if (Number.isFinite(hours) && hours > 8) emp.overtime_days += 1;

          const hasClockedIn = record.time_in && record.time_in !== '--:--';
          const hasSchedule = record.scheduled_start && record.scheduled_start !== '--:--';

          if (hasClockedIn) {
            emp.present_days += 1;
            if (hasSchedule) {
              const graceEnd = addMinutes(record.scheduled_start, 15);
              if (record.time_in > graceEnd) {
                emp.late_days += 1;
              }
            }
          } else if (hasSchedule) {
            const recordDate =
              parseDateInput(String(record.attendance_date || '').slice(0, 10), 'daily') ||
              new Date(record.attendance_date);
            const nowInner = new Date();
            const isToday = startOfDay(recordDate).getTime() === startOfDay(nowInner).getTime();
            const currentTimeStr = nowInner.toTimeString().split(' ')[0];

            if (startOfDay(recordDate) < startOfDay(nowInner) && (!isToday || (record.scheduled_end && currentTimeStr >= record.scheduled_end))) {
              emp.absent_days += 1;
            }
          }
        });

        const summary = Array.from(summaryMap.values());
        setAttendanceData(summary);

        // Fix: monthly stats were previously left stale from daily view
        const monthlyStats = summary.reduce(
          (acc, emp) => ({
            present: acc.present + emp.present_days,
            absent: acc.absent + emp.absent_days,
            late: acc.late + emp.late_days,
            overtime: acc.overtime + emp.overtime_days,
          }),
          { present: 0, absent: 0, late: 0, overtime: 0 }
        );
        setStats(monthlyStats);
      }
    } catch (error) {
      // Ignore aborted requests (user switched date/view mid-flight)
      if (
        axios.isCancel?.(error) ||
        error?.code === 'ERR_CANCELED' ||
        error?.name === 'CanceledError' ||
        signal?.aborted
      ) {
        return;
      }
      console.error('Error fetching attendance:', error);
      setAttendanceData([]);
      setStats({ present: 0, absent: 0, late: 0, overtime: 0 });
      setFetchError('Unable to load attendance records. Please try again.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [currentDate, view, isFuture]);

  useEffect(() => {
    const controller = new AbortController();
    fetchAttendance(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAttendance, reloadKey]);

  // ESC closes the enlarged selfie
  useEffect(() => {
    if (!expandedSelfie) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setExpandedSelfie(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedSelfie]);

  const calculateStats = (data) => {
    let counts = { present: 0, absent: 0, late: 0, overtime: 0 };
    data.forEach(item => {
      const s = item.status?.toLowerCase();
      if (s === 'present') counts.present++;
      else if (s === 'absent') counts.absent++;
      else if (s === 'late') counts.late++;
      const hours = Number.parseFloat(item.total_hours);
      if (Number.isFinite(hours) && hours > 8) counts.overtime++;
    });
    setStats(counts);
  };

  const changeDate = (offset) => {
    const newDate = new Date(currentDate);
    if (view === 'daily') {
      newDate.setDate(newDate.getDate() + offset);
      if (startOfDay(newDate) > maxDaily) return; // block future days
    } else {
      newDate.setDate(1);
      newDate.setMonth(newDate.getMonth() + offset);
      if (startOfMonth(newDate) > maxMonthly) return; // block future months
    }
    setCurrentDate(newDate);
  };

  const handleDateSelect = (e) => {
    const parsed = parseDateInput(e.target.value, view);
    if (!parsed) return; // invalid / empty input — keep current selection
    if (view === 'daily' && parsed > maxDaily) return;
    if (view === 'monthly' && parsed > maxMonthly) return;
    setCurrentDate(parsed);
  };

  const openDatePicker = () => {
    try {
      dateInputRef.current?.showPicker?.();
    } catch {
      dateInputRef.current?.focus?.();
    }
  };

  const handleViewDetails = (record) => {
    if (!record) return;
    setSelectedRecord(record);
    setShowDetailModal(true);
  };

  const retryFetch = () => setReloadKey(k => k + 1);

  const filteredData = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return attendanceData.filter(row => {
      const nameMatch = (row.full_name || '').toLowerCase().includes(term);
      const statusMatch = view === 'monthly' || statusFilter === 'All Status' || row.status === statusFilter;
      return nameMatch && statusMatch;
    });
  }, [attendanceData, debouncedSearch, statusFilter, view]);

  const canGoForward = !isFuture;
  const colSpan = view === 'daily' ? 6 : 5;

  const statCards = view === 'daily'
    ? [
        { label: 'Present Today', value: isFuture ? 0 : stats.present, border: 'border-green' },
        { label: 'Absent Today', value: isFuture ? 0 : stats.absent, border: 'border-red' },
        { label: 'Late Arrivals', value: isFuture ? 0 : stats.late, border: 'border-orange' },
        { label: 'Overtime', value: isFuture ? 0 : stats.overtime, border: 'border-purple' },
      ]
    : [
        { label: 'Present (Month)', value: stats.present, border: 'border-green' },
        { label: 'Absent (Month)', value: stats.absent, border: 'border-red' },
        { label: 'Late (Month)', value: stats.late, border: 'border-orange' },
        { label: 'Overtime Days', value: stats.overtime, border: 'border-purple' },
      ];

  return (
    <div className="attendance-container">
      <div className="att-header-row">
        <div>
          <p className="att-page-subtitle">Monitor and review employee attendance records and activity summaries.</p>
        </div>
      </div>

      <div className="att-stats-row">
        {statCards.map((stat, idx) => (
          <div key={idx} className={`att-stat-card ${stat.border}`}>
            <p className="att-stat-label">{stat.label}</p>
            <p className="att-stat-value">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="att-main-card">
        <div className="att-controls">
          <div className="view-toggles">
            <button
              className={`btn-toggle ${view === 'daily' ? 'active' : ''}`}
              aria-pressed={view === 'daily'}
              onClick={() => setView('daily')}
            >
              Daily View
            </button>
            <button
              className={`btn-toggle ${view === 'monthly' ? 'active' : ''}`}
              aria-pressed={view === 'monthly'}
              onClick={() => setView('monthly')}
            >
              Monthly View
            </button>
          </div>

          <div className="att-actions">
            <div className="att-search">
              <Search size={16} className="att-search-icon" />
              <input
                type="text"
                placeholder="Search employee..."
                aria-label="Search employee"
                maxLength={100}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {view === 'daily' && (
              <select
                className="att-select"
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
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
          <button
            className="nav-arrow"
            aria-label={view === 'daily' ? 'Previous day' : 'Previous month'}
            onClick={() => changeDate(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <div
            className="current-date-display"
            role="button"
            tabIndex={0}
            aria-label="Open date picker"
            onClick={openDatePicker}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDatePicker();
              }
            }}
          >
            <Calendar size={18} color="#0D9488" />
            <span>
              {view === 'daily'
                ? currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                : currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
            </span>
            <input
              type={view === 'daily' ? 'date' : 'month'}
              ref={dateInputRef}
              className="hidden-date-input"
              aria-label={view === 'daily' ? 'Select date' : 'Select month'}
              max={view === 'daily' ? toISODate(maxDaily) : toISOMonth(maxMonthly)}
              onChange={handleDateSelect}
              value={view === 'daily' ? toISODate(currentDate) : toISOMonth(currentDate)}
            />
          </div>
          <button
            className="nav-arrow"
            aria-label={view === 'daily' ? 'Next day' : 'Next month'}
            onClick={() => changeDate(1)}
            disabled={!canGoForward}
            style={!canGoForward ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
          >
            <ChevronRight size={20} />
          </button>
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
                  <th className="text-center">Action</th>
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
              {loading ? (
                <tr><td colSpan={colSpan} className="empty-row-message">Loading attendance…</td></tr>
              ) : fetchError ? (
                <tr>
                  <td colSpan={colSpan} className="empty-row-message">
                    <span className="text-rose-600">{fetchError}</span>{' '}
                    <button
                      type="button"
                      onClick={retryFetch}
                      style={{
                        marginLeft: 8,
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #0D9488',
                        background: '#fff',
                        color: '#0D9488',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ) : (isFuture && view === 'daily') ? (
                <tr><td colSpan={colSpan} className="empty-row-message">No records available for future dates.</td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan={colSpan} className="empty-row-message">No records found for this period.</td></tr>
              ) : (
                filteredData.map((row, idx) => (
                  <tr key={`${row.employee_id}-${idx}`}>
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
                        <td className="text-center">
                          <button
                            className="btn-view-details"
                            onClick={() => handleViewDetails(row)}
                            title="View Details"
                            aria-label={`View details for ${row.full_name || 'employee'}`}
                          >
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
          <div className="att-modal-wrapper">
            <div className="att-user-profile-header">
              <div className="att-user-info-group">
                <div className="att-avatar-circle">
                  {selectedRecord.full_name ? selectedRecord.full_name.charAt(0).toUpperCase() : 'E'}
                </div>
                <div className="att-user-meta">
                  <span className="att-user-name">{selectedRecord.full_name}</span>
                  <span className="att-user-id">{selectedRecord.employee_id}</span>
                </div>
              </div>
              <span className={`status-badge inline-flex ${selectedRecord.status?.toLowerCase().replace(' ', '-')}`}>
                {selectedRecord.status}
              </span>
            </div>

            <div className="attendance-detail-grid">
              <div className="detail-field">
                <span className="detail-label">Status</span>
                <span className="detail-value">{selectedRecord.status}</span>
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
                {selectedRecord.clock_in_selfie ? (
                  <button className="selfie-view-btn" onClick={() => setExpandedSelfie(selectedRecord.clock_in_selfie)}>
                    <Eye size={14} /> View Photo
                  </button>
                ) : (
                  <span className="detail-value text-gray">—</span>
                )}
              </div>
              <div className="detail-field">
                <span className="detail-label">Clock Out Selfie</span>
                {selectedRecord.clock_out_selfie ? (
                  <button className="selfie-view-btn" onClick={() => setExpandedSelfie(selectedRecord.clock_out_selfie)}>
                    <Eye size={14} /> View Photo
                  </button>
                ) : (
                  <span className="detail-value text-gray">—</span>
                )}
              </div>
            </div>
          </div>
        )}
      </FormalModal>

      {expandedSelfie && (
        <div
          className="selfie-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged selfie"
          onClick={() => setExpandedSelfie(null)}
        >
          <div className="selfie-modal" onClick={(e) => e.stopPropagation()}>
            <button className="selfie-close-btn" aria-label="Close photo" onClick={() => setExpandedSelfie(null)}>
              <X size={20} />
            </button>
            <img src={`${STATIC_BASE}${expandedSelfie}`} alt="Attendance selfie" className="selfie-img-large" />
            <button className="selfie-fullscreen" onClick={() => window.open(`${STATIC_BASE}${expandedSelfie}`, '_blank')}>
              <Maximize2 size={16} /> Open Fullscreen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Attendance;