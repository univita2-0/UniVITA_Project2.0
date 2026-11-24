// src/pages/Attendance.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './Attendance.css';
import { Printer, ChevronLeft, ChevronRight, Search, CalendarDays, Eye, X, Maximize2, RefreshCw, Users, UserCheck, UserX, Clock3, Timer, ClipboardList } from 'lucide-react';
import axios from 'axios';
import FormalModal from '../components/FormalModal';
import { API_BASE, fetchC12WebRecovery, fetchC13RecoveryQueue } from '../api';
import { useRole } from '../permissions';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const STATIC_BASE = API_BASE.replace(/\/api$/, '');

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

const useDebouncedValue = (value, delay = 300) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

// C10 legacy-data visibility: flag possible missing stored hours; never infer payable hours.
const leaveDurationLabel = value => ({ 'Whole Day': 'Full-day leave', '1st Half': 'First-half leave', '2nd Half': 'Second-half leave' }[value] || null);
const isApprovedFullLeave = r => r?.leave_duration === 'Whole Day' || (String(r?.status || '').toLowerCase() === 'on leave' && !r?.leave_duration);
const hasApprovedPartialLeave = r => ['1st Half', '2nd Half'].includes(r?.leave_duration);

const hasStoredHoursDiscrepancy = (record) => {
  const valid = value => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(String(value || ''));
  if (!valid(record?.time_in) || !valid(record?.time_out)) return false;
  return Number(record?.total_hours) === 0 && record.time_in !== record.time_out;
};

// C13 Web: these are HR/Admin explanations, NOT instructions to the instructor.
// Preserve the backend's mobile guidance. A scheduled shift ending does not
// mean the employee attended or that an HR request was submitted.
const getHrRecoveryStateLabel = (row) => {
  switch (String(row?.recovery_state || '').toUpperCase()) {
    case 'NEEDS_CORRECTION': return 'MISSING CLOCK-OUT';
    case 'NEEDS_REVIEW': return 'NO ATTENDANCE RECORDED';
    case 'AWAITING_HR': return 'PENDING HR REVIEW';
    case 'RESOLVED': return 'RESOLVED';
    case 'IN_PROGRESS': return 'SHIFT IN PROGRESS';
    default: return 'STATUS NOT VERIFIED';
  }
};


const getHrRecoveryGuidance = (row) => {
  switch (String(row?.recovery_state || '').toUpperCase()) {
    case 'NEEDS_CORRECTION':
      return 'Clock In recorded, but Clock Out is missing.';

    case 'AWAITING_HR':
      return 'Attendance correction or appeal awaiting HR approval.';

    case 'NEEDS_REVIEW':
      return 'No Clock In or Clock Out recorded for this shift.';

    case 'RESOLVED':
      return 'No outstanding attendance issue.';

    case 'IN_PROGRESS':
      return 'Instructor has clocked in and the shift is ongoing.';

    default:
      return 'Attendance recovery status is unavailable.';
  }
};


const Attendance = () => {
  useRole(); // Attendance access is guarded by the existing route permissions.
  const [view, setView] = useState('daily');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [attendanceData, setAttendanceData] = useState([]);
  const [c12Recovery, setC12Recovery] = useState([]);
  const [c13Queue, setC13Queue] = useState([]);
  const [c13QueueError, setC13QueueError] = useState('');
  const [c13Filter, setC13Filter] = useState('open');
  // Keep records and recovery as separate workspaces, without duplicating HR approval pages.
  const [attendanceTab, setAttendanceTab] = useState('records');
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
      // Recovery monitoring is best-effort; never suppress the existing report if unavailable.
      let recoveryRows = [];
      try {
        const rangeStart = view === 'daily' ? dateStr : `${monthStr}-01`;
        const rangeEnd = view === 'daily' ? dateStr : toISODate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
        const recovery = await fetchC12WebRecovery(rangeStart, rangeEnd);
        recoveryRows = Array.isArray(recovery?.data) ? recovery.data : [];
        if (!signal?.aborted) setC12Recovery(recoveryRows);
      } catch { if (!signal?.aborted) setC12Recovery([]); }
      // C13: Read-only HR recovery queue; never hide attendance if unavailable.
      try {
        const rangeStart = view === 'daily' ? dateStr : `${monthStr}-01`;
        const rangeEnd = view === 'daily' ? dateStr : toISODate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
        const result = await fetchC13RecoveryQueue(rangeStart, rangeEnd);
        if (!signal?.aborted) {
          setC13Queue(Array.isArray(result?.data) ? result.data : []);
          setC13QueueError(result?.truncated ? 'Results are limited to 500 schedules. Select a shorter period for a complete count.' : '');
        }
      } catch (error) {
        if (!signal?.aborted) {
          setC13Queue([]);
          setC13QueueError(error?.response?.data?.message || 'Recovery queue unavailable. Attendance records are still accessible.');
        }
      }

      if (view === 'daily') {
        const nowInner = new Date();
        const currentTimeStr = nowInner.toTimeString().split(' ')[0];
        const isToday = startOfDay(currentDate).getTime() === startOfDay(nowInner).getTime();
        const isPastDay = startOfDay(currentDate) < startOfDay(nowInner);

        const recoveryBySchedule = new Map(recoveryRows.map(r => [String(r.schedule_id), r]));
        const processed = rawData.map(record => {
          const c12 = recoveryBySchedule.get(String(record.schedule_id));
          const sStart = record.start_time || record.scheduled_start;
          const sEnd = record.end_time || record.scheduled_end;
          const storedStatus = String(record.status || '').trim();
          const approvedFullLeave = record.leave_duration === 'Whole Day';
          const knownStatuses = ['Present', 'Late', 'Absent', 'Scheduled', 'No Schedule', 'Pending', 'Missing Clock-Out', 'In Progress', 'On Leave', 'Partial Leave', 'Pending HR Review'];
          let calcStatus = approvedFullLeave ? 'On Leave' : (knownStatuses.find(s => s.toLowerCase() === storedStatus.toLowerCase()) || 'Scheduled');
          if (calcStatus === 'Scheduled' && (!sStart || sStart === '--:--')) calcStatus = 'No Schedule';
          return {
            ...record,
            status: approvedFullLeave ? 'On Leave' : c12?.status === 'MISSING_CLOCK_OUT' ? 'Missing Clock-Out'
              : c12?.status === 'IN_PROGRESS' ? 'In Progress'
              : ['PENDING_HR_REVIEW', 'OFFLINE_PENDING_REVIEW'].includes(c12?.status) ? 'Pending HR Review'
              : c12?.status === 'ON_LEAVE' ? 'On Leave'
              : calcStatus,
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
          const approvedFullLeave = isApprovedFullLeave(record);
          const approvedPartialLeave = hasApprovedPartialLeave(record);
          const hasSchedule = record.scheduled_start && record.scheduled_start !== '--:--';

          if (hasClockedIn) {
            emp.present_days += 1;
            if (hasSchedule) {
              const graceEnd = addMinutes(record.scheduled_start, 30);
              if (record.time_in > graceEnd) {
                emp.late_days += 1;
              }
            }
          } else if (hasSchedule && !approvedFullLeave && !approvedPartialLeave) {
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
  }, [fetchAttendance, reloadKey]);

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
      if (isApprovedFullLeave(item)) return;
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
      if (startOfDay(newDate) > maxDaily) return;
    } else {
      newDate.setDate(1);
      newDate.setMonth(newDate.getMonth() + offset);
      if (startOfMonth(newDate) > maxMonthly) return;
    }
    setCurrentDate(newDate);
  };

  const handleDateSelect = (e) => {
    const parsed = parseDateInput(e.target.value, view);
    if (!parsed) return;
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

  // C13.1: Clicking a recovery counter opens the queue. Selecting a record
  // also focuses its day and employee in existing attendance management.
  const c13Missing = c13Queue.filter(r => r.recovery_state === 'NEEDS_CORRECTION');
  const c13Pending = c13Queue.filter(r => r.recovery_state === 'AWAITING_HR');
  const c13Filtered = c13Queue.filter(r => c13Filter === 'all' ||
    (c13Filter === 'open' && ['NEEDS_CORRECTION', 'NEEDS_REVIEW', 'AWAITING_HR'].includes(r.recovery_state)) ||
    (c13Filter === 'missing' && r.recovery_state === 'NEEDS_CORRECTION') ||
    (c13Filter === 'pending' && r.recovery_state === 'AWAITING_HR') ||
    (c13Filter === 'resolved' && r.recovery_state === 'RESOLVED'));
  const c13Focus = row => {
    const match = /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ''));
    if (!match) return;
    const [y, m, d] = row.date.split('-').map(Number);
    setCurrentDate(new Date(y, m - 1, d));
    setView('daily');
    setAttendanceTab('records');
    setSearchTerm(row.full_name || '');
    setStatusFilter('All Status');
  };
  const c13OpenQueue = filter => { setAttendanceTab('recovery'); setC13Filter(filter); };

  const canGoForward = view === 'daily' ? startOfDay(currentDate) < maxDaily : startOfMonth(currentDate) < maxMonthly;
  const colSpan = view === 'daily' ? 6 : 5;

  
const statCards = view === 'daily'
  ? [
      {
        label: 'Present Today',
        value: isFuture ? 0 : stats.present,
        color: 'green'
      },
      {
        label: 'Absent Today',
        value: isFuture ? 0 : stats.absent,
        color: 'red'
      },
      {
        label: 'Late Arrivals',
        value: isFuture ? 0 : stats.late,
        color: 'orange'
      },
      {
        label: 'Recorded Shifts Over 8h',
        value: isFuture ? 0 : stats.overtime,
        color: 'purple'
      }
    ]
  : [
      {
        label: 'Present (Month)',
        value: stats.present,
        color: 'green'
      },
      {
        label: 'Absent (Month)',
        value: stats.absent,
        color: 'red'
      },
      {
        label: 'Late (Month)',
        value: stats.late,
        color: 'orange'
      },
      {
        label: 'Recorded Days Over 8h',
        value: stats.overtime,
        color: 'purple'
      }
    ];


  const metricIcons = [UserCheck, UserX, Clock3, Timer];
  const periodLabel = view === 'daily'
    ? currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

  return (
    <div className="att-container">
      <header className="att-header-row">
        <div className="att-page-heading">
          
          <p className="att-page-subtitle">Review daily time logs, monthly attendance summaries, and employee clock-in evidence.</p>
        </div>
        <div className="att-header-actions">
          <button type="button" className="att-btn-neutral" onClick={retryFetch} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'att-spinning' : ''} /> Refresh
          </button>
          {attendanceTab === 'records' && <button type="button" className="att-btn-export" onClick={() => window.print()}>
            <Printer size={16} /> Print Report
          </button>}
        </div>
      </header>

      <div className="att-main-tabs" role="tablist" aria-label="Attendance sections">
        <button type="button" id="att-tab-records" role="tab" aria-controls="att-panel-records"
          aria-selected={attendanceTab === 'records'} className={`att-main-tab ${attendanceTab === 'records' ? 'active' : ''}`}
          onClick={() => setAttendanceTab('records')}>
         Attendance Records
        </button>
        <button type="button" id="att-tab-recovery" role="tab" aria-controls="att-panel-recovery"
          aria-selected={attendanceTab === 'recovery'} className={`att-main-tab ${attendanceTab === 'recovery' ? 'active' : ''}`}
          onClick={() => setAttendanceTab('recovery')}>
           Attendance Recovery
        </button>
      </div>

      {attendanceTab === 'records' && <div id="att-panel-records" role="tabpanel" aria-labelledby="att-tab-records" className="att-tab-panel">
      <div className="att-stats-row" aria-label="Attendance metrics">
        {statCards.map((stat, idx) => {
          const Icon = metricIcons[idx];
          return (
            <section key={stat.label} className={`att-stat-card border-${stat.color}`}>
              <div className="att-stat-top"><span className="att-stat-label">{stat.label}</span><Icon size={17} aria-hidden="true" /></div>
              <p className="att-stat-value">{loading ? '—' : stat.value}</p>
              <p className="att-stat-caption">{view === 'daily' ? 'Selected day' : 'Selected month'}</p>
            </section>
          );
        })}
      </div>

      <section className="att-main-card" aria-label="Attendance records">
        <div className="att-workspace-header">
          <div className="att-workspace-title">
           
            <div><h2>Attendance Records</h2><p>{view === 'daily' ? 'Daily clock-in and clock-out records (long shifts are not automatically approved overtime)' : 'Monthly attendance totals by employee'}</p></div>
          </div>
          <span className="att-record-count">{loading ? 'Loading' : `${filteredData.length} record${filteredData.length === 1 ? '' : 's'}`}</span>
        </div>

        <div className="att-controls">
          <div className="att-view-toggles" role="group" aria-label="Attendance report period">
            <button type="button" className={`att-btn-toggle ${view === 'daily' ? 'active' : ''}`} aria-pressed={view === 'daily'} onClick={() => setView('daily')}>Daily records</button>
            <button type="button" className={`att-btn-toggle ${view === 'monthly' ? 'active' : ''}`} aria-pressed={view === 'monthly'} onClick={() => setView('monthly')}>Monthly summary</button>
          </div>
          <div className="att-date-nav" aria-label="Select report date">
            <button type="button" className="att-nav-arrow" aria-label={view === 'daily' ? 'Previous day' : 'Previous month'} onClick={() => changeDate(-1)}><ChevronLeft size={17} /></button>
            <div className="att-current-date" role="button" tabIndex={0} onClick={openDatePicker}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDatePicker(); } }} title="Choose date">
              <CalendarDays size={16} /><span>{periodLabel}</span>
              <input type={view === 'daily' ? 'date' : 'month'} ref={dateInputRef} className="att-hidden-date-input"
                max={view === 'daily' ? toISODate(maxDaily) : toISOMonth(maxMonthly)}
                onChange={handleDateSelect} value={view === 'daily' ? toISODate(currentDate) : toISOMonth(currentDate)} tabIndex={-1} aria-label="Report date" />
            </div>
            <button type="button" className="att-nav-arrow" aria-label={view === 'daily' ? 'Next day' : 'Next month'} onClick={() => changeDate(1)} disabled={!canGoForward}><ChevronRight size={17} /></button>
          </div>
        </div>

        <div className="att-filter-bar">
          <div className="att-search"><Search size={16} className="att-search-icon" /><input type="search" placeholder="Search employee name" maxLength={100}
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="att-input" aria-label="Search employee" /></div>
          {view === 'daily' && <select className="att-select" aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All Status">All statuses</option><option value="Present">Present</option><option value="Late">Late</option>
            <option value="Absent">Absent</option><option value="Missing Clock-Out">Missing Clock-Out</option><option value="In Progress">In Progress</option><option value="Pending HR Review">Pending HR Review</option><option value="On Leave">On Leave</option><option value="Partial Leave">Partial Leave</option><option value="Scheduled">Scheduled</option><option value="No Schedule">No Schedule</option>
          </select>}
          <div className="att-filter-spacer" />
          <span className="att-filter-hint">Showing {filteredData.length} of {attendanceData.length} employees</span>
        </div>

        <div className="att-table-container">
          <table className="att-table">
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
                <tr><td colSpan={colSpan} className="att-empty-cell">Loading attendance…</td></tr>
              ) : fetchError ? (
                <tr>
                  <td colSpan={colSpan} className="att-empty-cell">
                    <span className="text-rose-600">{fetchError}</span>{' '}
                    <button onClick={retryFetch} className="att-retry-btn">Retry</button>
                  </td>
                </tr>
              ) : (isFuture && view === 'daily') ? (
                <tr><td colSpan={colSpan} className="att-empty-cell">No records available for future dates.</td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan={colSpan} className="att-empty-cell">No records found for this period.</td></tr>
              ) : (
                filteredData.map((row, idx) => (
                  <tr key={`${row.employee_id}-${idx}`}>
                    {view === 'daily' ? (
                      <>
                        <td>
                          <div className="att-emp-name">{row.full_name}</div>
                          <div className="att-emp-id">{row.employee_id}</div>
                        </td>
                        <td><span className={`att-status-badge ${row.status?.toLowerCase().replace(' ', '-')}`}>{row.status}</span>{hasApprovedPartialLeave(row) && <span className="att-leave-note">{leaveDurationLabel(row.leave_duration)} approved</span>}</td>
                        <td>{formatTo12Hour(row.time_in)}</td>
                        <td>{formatTo12Hour(row.time_out)}</td>
                        <td>{row.total_hours} hrs{hasStoredHoursDiscrepancy(row) && <span title="Recorded clock times differ, but stored hours are zero. Verify with HR before payroll use." style={{ display: 'block', color: '#b45309', fontSize: 11 }}>Review hours</span>}</td>
                        <td className="text-center">
                          <button
                            className="att-btn-view"
                            type="button" aria-label={`View attendance details for ${row.full_name || row.employee_id}`} title="View record"
                            onClick={() => handleViewDetails(row)}
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <div className="att-emp-name">{row.full_name}</div>
                          <div className="att-emp-id">{row.employee_id}</div>
                        </td>
                        <td className="text-center font-medium">{row.total_working}</td>
                        <td className="text-center text-emerald font-semibold">{row.present_days}</td>
                        <td className="text-center text-rose font-semibold">{row.absent_days}</td>
                        <td className="text-center text-amber font-semibold">{row.late_days}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      </div>}

      {attendanceTab === 'recovery' && <div id="att-panel-recovery" role="tabpanel" aria-labelledby="att-tab-recovery" className="att-tab-panel">
      <section className="c13-monitor" aria-label="Attendance recovery monitoring">
        <div className="c13-monitor-heading">
          <div><p>Monitor missing Clock-Outs and requests awaiting HR review. Approvals remain in Attendance Corrections and Appeals.</p></div>
        </div>
        <div className="att-controls c13-period-controls">
          <div className="att-view-toggles" role="group" aria-label="Recovery report period">
            <button type="button" className={`att-btn-toggle ${view === 'daily' ? 'active' : ''}`} aria-pressed={view === 'daily'} onClick={() => setView('daily')}>Daily records</button>
            <button type="button" className={`att-btn-toggle ${view === 'monthly' ? 'active' : ''}`} aria-pressed={view === 'monthly'} onClick={() => setView('monthly')}>Monthly summary</button>
          </div>
          <div className="att-date-nav" aria-label="Select recovery date">
            <button type="button" className="att-nav-arrow" aria-label={view === 'daily' ? 'Previous day' : 'Previous month'} onClick={() => changeDate(-1)}><ChevronLeft size={17} /></button>
            <div className="att-current-date" role="button" tabIndex={0} onClick={openDatePicker}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDatePicker(); } }} title="Choose date">
              <CalendarDays size={16} /><span>{periodLabel}</span>
              <input type={view === 'daily' ? 'date' : 'month'} ref={dateInputRef} className="att-hidden-date-input"
                max={view === 'daily' ? toISODate(maxDaily) : toISOMonth(maxMonthly)}
                onChange={handleDateSelect} value={view === 'daily' ? toISODate(currentDate) : toISOMonth(currentDate)} tabIndex={-1} aria-label="Recovery date" />
            </div>
            <button type="button" className="att-nav-arrow" aria-label={view === 'daily' ? 'Next day' : 'Next month'} onClick={() => changeDate(1)} disabled={!canGoForward}><ChevronRight size={17} /></button>
          </div>
        </div>
        <div className="c13-counter-row">
          <button type="button" className="c13-counter" onClick={() => c13OpenQueue('missing')}>
            <span>Missing Clock-Out</span><strong>{loading || c13QueueError ? "—" : c13Missing.length}</strong><small>View affected shifts</small>
          </button>
          <button type="button" className="c13-counter" onClick={() => c13OpenQueue('pending')}>
            <span>Pending HR Review</span><strong>{loading || c13QueueError ? "—" : c13Pending.length}</strong><small>View correction and appeal requests</small>
          </button>
        </div>
        {c13QueueError && <p role="alert" className="c13-note">{c13QueueError}</p>}
        <div className="c13-queue">
          <div className="c13-queue-top">
            <strong>Recovery Cases</strong>
            <select aria-label="Recovery queue filter" value={c13Filter} onChange={event => setC13Filter(event.target.value)}>
              <option value="open">Needs Attention</option><option value="missing">Missing Clock-Out</option>
              <option value="pending">Pending HR Review</option><option value="resolved">Resolved</option><option value="all">All Records</option>
            </select>
          </div>
          <div className="c13-queue-scroll"><table className="c13-table"><thead><tr><th>Employee</th><th className="c13-date-col">Date</th><th>Issue / State</th><th>Attendance</th></tr></thead><tbody>
            {loading ? <tr><td colSpan="5">Loading recovery cases…</td></tr> : c13QueueError ? <tr><td colSpan="5">Unable to verify recovery cases for this period.</td></tr> : c13Filtered.length ? c13Filtered.map(row => <tr key={`c13-${row.schedule_id}`}>
              <td><strong>{row.full_name || row.employee_id}</strong><small>{row.employee_id}</small></td>
              <td className="c13-date-col">{row.date}</td>
              <td><span className="c13-state">{getHrRecoveryStateLabel(row)}</span><small>{getHrRecoveryGuidance(row)}</small></td>
              
              <td><button className="att-btn-neutral" type="button" onClick={() => c13Focus(row)}>View day</button></td>
            </tr>) : <tr><td colSpan="5">No matching recovery cases for this period.</td></tr>}
          </tbody></table></div>
          <p className="c13-note">This is a read-only monitoring list, not another approval page. 'No attendance recorded' may indicate an ordinary absence and does not mean an HR request is pending. Review approvals only on Attendance Corrections or Attendance Appeals. Phone-only offline events are not visible until submitted.</p>
        </div>
      </section>
      </div>}

      <FormalModal show={showDetailModal} onClose={() => setShowDetailModal(false)} title="Attendance Details" footer={<button type="button" className="btn-modal-cancel" onClick={() => setShowDetailModal(false)}>Close</button>}>
        {selectedRecord && (
          <div className="att-modal-wrapper">
            <div className="att-user-header">
              <div className="att-user-info">
                <div className="att-avatar">
                  {selectedRecord.full_name ? selectedRecord.full_name.charAt(0).toUpperCase() : 'E'}
                </div>
                <div className="att-user-meta">
                  <span className="att-user-name">{selectedRecord.full_name}</span>
                  <span className="att-user-id">{selectedRecord.employee_id}</span>
                </div>
              </div>
              <span className={`att-status-badge inline-flex ${selectedRecord.status?.toLowerCase().replace(' ', '-')}`}>
                {selectedRecord.status}
              </span>
            </div>

            <div className="att-detail-grid">
              <div className="att-detail-field">
                <span className="att-detail-label">Status</span>
                <span className="att-detail-value">{selectedRecord.status}</span>
                {selectedRecord.leave_duration && <span className="att-leave-note">Approved: {leaveDurationLabel(selectedRecord.leave_duration)}</span>}
              </div>
              <div className="att-detail-field">
                <span className="att-detail-label">Total Hours</span>
                <span className="att-detail-value">{selectedRecord.total_hours} hrs{hasStoredHoursDiscrepancy(selectedRecord) && <small style={{ display: 'block', color: '#b45309' }}>Stored hours need review; do not assume payable hours.</small>}</span>
              </div>
              <div className="att-detail-field">
                <span className="att-detail-label">Time In</span>
                <span className="att-detail-value">{formatTo12Hour(selectedRecord.time_in)}</span>
              </div>
              <div className="att-detail-field">
                <span className="att-detail-label">Time Out</span>
                <span className="att-detail-value">{formatTo12Hour(selectedRecord.time_out)}</span>
              </div>
              <div className="att-detail-field">
                <span className="att-detail-label">Clock In Location</span>
                <span className="att-detail-value">{selectedRecord.location ? selectedRecord.location.split('(')[0] : '—'}</span>
              </div>
              <div className="att-detail-field">
                <span className="att-detail-label">Clock Out Location</span>
                <span className="att-detail-value">{selectedRecord.location && selectedRecord.time_out !== '--:--' ? selectedRecord.location.split('(')[0] : '—'}</span>
              </div>
              <div className="att-detail-field">
                <span className="att-detail-label">Clock In Selfie</span>
                {selectedRecord.clock_in_selfie ? (
                  <button className="att-selfie-btn" type="button" onClick={() => setExpandedSelfie(selectedRecord.clock_in_selfie)}>
                    <Eye size={14} /> View Photo
                  </button>
                ) : (
                  <span className="att-detail-value text-gray">—</span>
                )}
              </div>
              <div className="att-detail-field">
                <span className="att-detail-label">Clock Out Selfie</span>
                {selectedRecord.clock_out_selfie ? (
                  <button className="att-selfie-btn" type="button" onClick={() => setExpandedSelfie(selectedRecord.clock_out_selfie)}>
                    <Eye size={14} /> View Photo
                  </button>
                ) : (
                  <span className="att-detail-value text-gray">—</span>
                )}
              </div>
            </div>
          </div>
        )}
      </FormalModal>

      {expandedSelfie && (
        <div
          className="att-selfie-overlay" role="presentation"
          onClick={() => setExpandedSelfie(null)}
        >
          <div className="att-selfie-modal" onClick={(e) => e.stopPropagation()}>
            <button className="att-selfie-close" type="button" aria-label="Close photo" onClick={() => setExpandedSelfie(null)}>
              <X size={20} />
            </button>
            <img src={`${STATIC_BASE}${expandedSelfie}`} alt="Attendance selfie" className="att-selfie-img" />
            <button className="att-selfie-fullscreen" type="button" onClick={() => window.open(`${STATIC_BASE}${expandedSelfie}`, '_blank')}>
              <Maximize2 size={16} /> Open Fullscreen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Attendance;