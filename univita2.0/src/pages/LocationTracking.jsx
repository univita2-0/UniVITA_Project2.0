// src/pages/LocationTracking.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  RefreshCw, History, Eye, AlertTriangle, ShieldCheck, Clock,
  Search, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';
import './LocationTracking.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
});

const PAGE_SIZE = 25;
const TIMELINE_PAGE_SIZE = 50;
const GPS_DISPLAY_GRACE_MS = 60_000; 

/* ---------------- date helpers (timezone-safe) ---------------- */
const toLocalISODate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatPHT = (dateStr) => {
  if (!dateStr) return '—';
  let s = String(dateStr);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    s = s.replace(' ', 'T') + '+08:00';
  }
  return new Date(s).toLocaleString('en-US', { timeZone: 'Asia/Manila' });
};


const formatTimePHT = (val) => {
  if (!val) return '—';
  
  
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '—';
    return val.toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' 
    });
  }

  const s = String(val).trim();
  
  
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const sec = parts[2] ? parseInt(parts[2], 10) : 0;
    
    
    const date = new Date(Date.UTC(1970, 0, 1, h, m, sec));
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' 
    });
  }
  
 
  if (s.includes('T') || s.includes('-')) {
    let dateStr = s;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
      dateStr = s.replace(' ', 'T') + 'Z'; // Force UTC
    } else if (s.includes('T') && !s.includes('Z') && !s.includes('+')) {
      dateStr = s + 'Z'; // Force UTC
    }
    
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' 
    });
  }
  
  return '—';
};


const parseDateInput = (value) => {
  if (!value) return null;
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

const isAbortError = (err, signal) =>
  axios.isCancel?.(err) ||
  err?.code === 'ERR_CANCELED' ||
  err?.name === 'CanceledError' ||
  signal?.aborted;

const useDebouncedValue = (value, delay = 300) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

/* ---------------- small pagination control ---------------- */
const Pagination = ({ page, totalPages, onChange, label }) => {
  if (totalPages <= 1) return null;
  return (
    <div
      role="navigation"
      aria-label={label || 'Pagination'}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 0' }}
    >
      <button
        type="button"
        className="btn-lt-outline"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        aria-label="Previous page"
        style={{ padding: '6px 10px', opacity: page <= 1 ? 0.5 : 1 }}
      >
        <ChevronLeft size={16} />
      </button>
      <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="btn-lt-outline"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        aria-label="Next page"
        style={{ padding: '6px 10px', opacity: page >= totalPages ? 0.5 : 1 }}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

const LocationTracking = () => {
  const [instructors, setInstructors] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedDate, setSelectedDate] = useState(toLocalISODate());

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyDate, setHistoryDate] = useState(toLocalISODate());
  const [alertHistory, setAlertHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [timelineData, setTimelineData] = useState({ timeline: [], alerts: [], start_time: null, end_time: null });
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelinePage, setTimelinePage] = useState(1);

  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300);

  // Ref used by the WebSocket handler so it doesn't need to reconnect on date change
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  const formatTo12Hour = (timeString) => {
    if (!timeString || timeString === '00:00:00') return 'N/A';
    const [hours, minutes] = timeString.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h % 12 || 12;
    return `${displayHours}:${minutes} ${ampm}`;
  };

  /* ---------------- fetch ---------------- */
  const fetchData = useCallback(async (date = selectedDate, signal) => {
    setLoading(true);
    setError('');
    try {
      const [statusRes, alertsRes] = await Promise.all([
        axios.get(`${API_BASE}/location-tracking/status?date=${date}`, { ...getAuthHeaders(), signal }),
        axios.get(`${API_BASE}/location-tracking/alerts?date=${date}`, { ...getAuthHeaders(), signal }),
      ]);
      if (signal?.aborted) return;
      setInstructors(Array.isArray(statusRes.data) ? statusRes.data : []);
      setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : []);
    } catch (err) {
      if (isAbortError(err, signal)) return;
      console.error('fetchData error:', err);
      setInstructors([]);
      setAlerts([]);
      setError('Failed to load tracking data.');
      toast.error('Failed to load tracking data.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [selectedDate]);

  // Keep latest fetchData available inside the WS handler without re-subscribing
  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);

  const fetchAlertHistory = useCallback(async (date, signal) => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/location-tracking/alerts?date=${date}`, { ...getAuthHeaders(), signal });
      if (signal?.aborted) return;
      setAlertHistory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (isAbortError(err, signal)) return;
      console.error('fetchAlertHistory error:', err);
      setAlertHistory([]);
      toast.error('Failed to load alert history');
    } finally {
      if (!signal?.aborted) setHistoryLoading(false);
    }
  }, []);

  const openTimelineModal = useCallback(async (inst, signal) => {
    setSelectedInstructor(inst);
    setShowTimelineModal(true);
    setTimelinePage(1);
    setTimelineLoading(true);
    setTimelineData({ timeline: [], alerts: [], start_time: null, end_time: null });
    try {
      const res = await axios.get(
        `${API_BASE}/location-tracking/instructor-timeline/${inst.employee_id}?date=${selectedDate}`,
        { ...getAuthHeaders(), signal }
      );
      if (signal?.aborted) return;
      const payload = res.data || {};
      setTimelineData({
        timeline: Array.isArray(payload.timeline) ? payload.timeline : [],
        alerts: Array.isArray(payload.alerts) ? payload.alerts : [],
        start_time: payload.start_time || null,
        end_time: payload.end_time || null,
      });
    } catch (err) {
      if (isAbortError(err, signal)) return;
      console.error('openTimelineModal error:', err);
      toast.error('Failed to load timeline data');
    } finally {
      if (!signal?.aborted) setTimelineLoading(false);
    }
  }, [selectedDate]);

  /* ---------------- effects ---------------- */
  useEffect(() => {
    const controller = new AbortController();
    fetchData(selectedDate, controller.signal);
    return () => controller.abort();
  }, [selectedDate, fetchData]);

  // Single WebSocket for component lifetime
  useEffect(() => {
    let ws;
    const getWsUrl = () => {
      try {
        if (API_BASE.startsWith('http')) {
          const url = new URL(API_BASE);
          const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${wsProtocol}//${url.host}?token=${localStorage.getItem('auth_token')}`;
        }
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname === 'localhost' ? 'localhost:5000' : window.location.host;
        return `${protocol}//${host}?token=${localStorage.getItem('auth_token')}`;
      } catch {
        return null;
      }
    };

    const wsUrl = getWsUrl();
    if (!wsUrl) return undefined;

    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        if (!data || typeof data !== 'object') return;

        const today = toLocalISODate();
        if (selectedDateRef.current !== today) return;

        if (data.type === 'instructor_status_update' && data.instructor && data.instructor.employee_id) {
          setInstructors(prev => prev.map(inst =>
            inst.employee_id === data.instructor.employee_id
              ? { ...inst, ...data.instructor }
              : inst
          ));
        } else if (data.type === 'new_alert') {
          fetchDataRef.current(today);
        }
      };
      ws.onerror = () => { /* swallow — reconnect would be an enhancement */ };
    } catch (err) {
      console.error('WebSocket Error:', err);
    }

    return () => {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        try { ws.close(); } catch { /* noop */ }
      }
    };
  }, []);

  // Alert history modal fetch
  useEffect(() => {
    if (!showHistoryModal) return undefined;
    const controller = new AbortController();
    fetchAlertHistory(historyDate, controller.signal);
    return () => controller.abort();
  }, [showHistoryModal, historyDate, fetchAlertHistory]);

  // Reset pagination when filters / date change
  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, selectedDate]);

  /* ---------------- filtering + pagination ---------------- */
  const filteredInstructors = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    if (!q) return instructors;
    return instructors.filter(inst =>
      inst.full_name?.toLowerCase().includes(q) ||
      inst.employee_id?.toLowerCase().includes(q) ||
      inst.schedule_course?.toLowerCase().includes(q)
    );
  }, [instructors, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredInstructors.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

    const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = filteredInstructors.slice(pageStart, pageStart + PAGE_SIZE);

 
  const activeAlerts = useMemo(() => {
    const activeEmpIds = new Set(
      instructors
        .filter(i => {
          const s = String(i.attendance_status || '').toLowerCase();
          return !s.includes('miss') && !s.includes('absent');
        })
        .map(i => i.employee_id)
    );
    return alerts.filter(a => activeEmpIds.has(a.employee_id));
  }, [alerts, instructors]);

  const todayStr = toLocalISODate();
  const isToday = selectedDate === todayStr;

    const toTimestamp = useCallback((timeStr) => {
    if (!timeStr) return NaN;
    let s = String(timeStr);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
      s = s.replace(' ', 'T') + '+08:00';
    } else if (s.includes('T') && !s.includes('Z') && !s.includes('+')) {
      s += '+08:00';
    }
    const d = new Date(s);
    return d.getTime();
  }, [selectedDate]);

    const unifiedEvents = useMemo(() => {
    const events = [];
    const timeline = timelineData.timeline || [];
    const shiftStart = timelineData.start_time;
    const shiftEnd = timelineData.end_time;

    const isWithinShiftTime = (timeStr) => {
      if (!shiftStart || !shiftEnd) return true;
      try {
        const safeStr = String(timeStr).includes('T')
          ? String(timeStr).split('T')[1]
          : String(timeStr).split(' ')[1] || String(timeStr);
        const [h, m] = safeStr.split(':').map(Number);
        const totalMinutes = (h || 0) * 60 + (m || 0);
        const [sh, sm] = shiftStart.split(':').map(Number);
        const [eh, em] = shiftEnd.split(':').map(Number);
        const startTotal = (sh || 0) * 60 + (sm || 0) - 30;
        const endTotal = (eh || 0) * 60 + (em || 0) + 30;
        return totalMinutes >= startTotal && totalMinutes <= endTotal;
      } catch {
        return true;
      }
    };

    const validTimeline = timeline.filter(t => isWithinShiftTime(t.ping_time));

    if (validTimeline.length > 0) {
      // 1. Group into segments of stable state
      let currentSegment = {
        location_enabled: validTimeline[0].location_enabled,
        is_inside_campus: validTimeline[0].is_inside_campus,
        location_name: validTimeline[0].location_name,
        startTime: validTimeline[0].ping_time,
        endTime: validTimeline[0].ping_time
      };
      
      const segments = [];

      for (let i = 1; i < validTimeline.length; i++) {
        const curr = validTimeline[i];
        if (
          currentSegment.location_enabled === curr.location_enabled &&
          currentSegment.is_inside_campus === curr.is_inside_campus &&
          currentSegment.location_name === curr.location_name
        ) {
          currentSegment.endTime = curr.ping_time;
        } else {
          segments.push(currentSegment);
          currentSegment = {
            location_enabled: curr.location_enabled,
            is_inside_campus: curr.is_inside_campus,
            location_name: curr.location_name,
            startTime: curr.ping_time,
            endTime: curr.ping_time
          };
        }
      }
      segments.push(currentSegment);

      // 2. Filter out segments shorter than 2 minutes (to remove GPS flickers)
      const MIN_DURATION_MS = 120000; // 2 mins
      const stableSegments = segments.filter((seg, idx) => {
        if (idx === segments.length - 1) return true; // Always keep the latest state
        const duration = new Date(seg.endTime).getTime() - new Date(seg.startTime).getTime();
        return duration >= MIN_DURATION_MS || idx === 0;
      });

      // 3. Push clean events
      stableSegments.forEach(seg => {
        events.push({
          time: seg.startTime,
          type: 'GPS',
          detail: seg.location_enabled ? 'GPS tracking activated (ON)' : 'GPS tracking disabled (OFF)',
        });
        if (seg.location_enabled) {
          events.push({
            time: seg.startTime,
            type: 'Campus',
            detail: seg.is_inside_campus
              ? `Position inside perimeter — Zone: ${seg.location_name || 'Designated Area'}`
              : `Position outside perimeter — Zone: ${seg.location_name || 'Outside Campus'}`,
          });
        }
      });
    }

   
    (timelineData.alerts || []).forEach(alert => {
      events.push({
        time: alert.created_at,
        type: 'Alert',
        detail: alert.alert_message || 'Geofence compliance alert',
      });
    });

    events.sort((a, b) => toTimestamp(a.time) - toTimestamp(b.time));
    return events;
  }, [timelineData, toTimestamp]);

    

  const totalTimelinePages = Math.max(1, Math.ceil(unifiedEvents.length / TIMELINE_PAGE_SIZE));
  const safeTimelinePage = Math.min(timelinePage, totalTimelinePages);
  useEffect(() => {
    if (timelinePage > totalTimelinePages) setTimelinePage(totalTimelinePages);
  }, [timelinePage, totalTimelinePages]);

  const timelinePageEvents = useMemo(() => {
    const start = (safeTimelinePage - 1) * TIMELINE_PAGE_SIZE;
    return unifiedEvents.slice(start, start + TIMELINE_PAGE_SIZE);
  }, [unifiedEvents, safeTimelinePage]);

    const renderEventTime = (time) => {
    const ts = toTimestamp(time);
    if (!Number.isFinite(ts)) return String(time ?? '—');
    return new Date(ts).toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Manila'
    });
  };

  /* ---------------- handlers ---------------- */
  const handleSelectedDateChange = (e) => {
    const v = e.target.value;
    const parsed = parseDateInput(v);
    if (!parsed) return;
    if (v > todayStr) { toast.info('Future dates are not available.'); return; }
    setSelectedDate(v);
  };

  const handleHistoryDateChange = (e) => {
    const v = e.target.value;
    const parsed = parseDateInput(v);
    if (!parsed) return;
    if (v > todayStr) { toast.info('Future dates are not available.'); return; }
    setHistoryDate(v);
  };

  const closeTimelineModal = () => {
    setShowTimelineModal(false);
    setSelectedInstructor(null);
    setTimelinePage(1);
  };

  /* ---------------- render ---------------- */
  return (
    <div className="lt-container">
      <div className="lt-header-row">
        <div className="lt-title-group">
          <div>
            <p className="lt-page-subtitle">Real-time geofencing and campus compliance monitoring.</p>
          </div>
        </div>
        <div className="lt-header-actions">
          <input
            type="date"
            value={selectedDate}
            max={todayStr}
            onChange={handleSelectedDateChange}
            className="lt-date-input"
            aria-label="Tracking date"
          />
          <button className="btn-lt-outline" onClick={() => setShowHistoryModal(true)}>
            <History size={16} /> <span>Alert History</span>
          </button>
          <button
            className="btn-lt-primary"
            onClick={() => fetchData(selectedDate)}
            disabled={loading}
            aria-busy={loading}
          >
            <RefreshCw size={16} /> <span>Sync Data</span>
          </button>
        </div>
      </div>

      <div className="lt-search-card">
        <div className="lt-search-input-group">
          <Search size={18} className="text-muted" />
          <input
            type="text"
            placeholder="Search Name, Employee ID, or Course..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="lt-clean-input"
            maxLength={100}
            aria-label="Search instructors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
            >
              <X size={16} className="text-muted" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="lt-loading-state" aria-live="polite">Gathering location telemetry...</div>
      ) : error ? (
        <div className="lt-loading-state" role="alert">
          <span style={{ color: '#B91C1C' }}>{error}</span>{' '}
          <button
            type="button"
            onClick={() => fetchData(selectedDate)}
            style={{
              marginLeft: 8, padding: '6px 12px', borderRadius: 6,
              border: '1px solid #0D9488', background: '#fff',
              color: '#0D9488', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="lt-stats-grid">
            <div className="lt-stat-card">
              <div className="stat-icon-wrapper active"><Clock size={20} /></div>
              <div className="stat-info">
                <span className="stat-label">Active Shifts</span>
                <span className="stat-value">{instructors.length}</span>
              </div>
            </div>
            <div className="lt-stat-card">
              <div className="stat-icon-wrapper success"><ShieldCheck size={20} /></div>
              <div className="stat-info">
                <span className="stat-label">On-Campus Now</span>
                <span className="stat-value">
                  {instructors.filter(i => i.last_is_inside === 1 && i.gps_status === 'GPS ON').length}
                </span>
              </div>
            </div>
                        <div className="lt-stat-card alert">
              <div className="stat-icon-wrapper danger"><AlertTriangle size={20} /></div>
              <div className="stat-info">
                <span className="stat-label">
                  Daily Alerts
                  {activeAlerts.length > 0 && (
                    <span
                      aria-label={`${activeAlerts.length} alerts`}
                      style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: '#DC2626', marginLeft: 6, verticalAlign: 'middle',
                        boxShadow: '0 0 0 0 rgba(220,38,38,0.7)',
                        animation: 'ltAlertPulse 1.8s infinite',
                      }}
                    />
                  )}
                </span>
                <span className="stat-value">{activeAlerts.length}</span>
              </div>
            </div>
          </div>

          <div className="lt-table-card">
            <div className="lt-table-wrapper">
              <table className="lt-table">
                <thead>
                  <tr>
                    <th>Instructor</th>
                    <th>Assignment</th>
                    <th className="text-center">Attendance</th>
                    <th className="text-center">GPS</th>
                    <th className="text-center">Location</th>
                    <th className="text-center">Timeline</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInstructors.length === 0 ? (
                    <tr className="lt-empty-row">
                      <td colSpan="6">No active shifts found matching your criteria.</td>
                    </tr>
                  ) : (
                                        pageRows.map(inst => {
                      const attStatus = inst.attendance_status || 'Unknown';
                      let attBadgeClass = 'gps-off';

                      const isMissed =
                        attStatus.toLowerCase().includes('miss') ||
                        attStatus.toLowerCase().includes('absent');

                      if (isMissed) attBadgeClass = 'outside';
                      else if (attStatus.toLowerCase().includes('present')) attBadgeClass = 'inside';
                      else if (attStatus.toLowerCase().includes('late')) attBadgeClass = 'warning';

                      
                      const gpsLastPing = inst.last_ping_time
                        ? new Date(inst.last_ping_time).getTime()
                        : null;
                      const gpsIsStale =
                        gpsLastPing !== null &&
                        Date.now() - gpsLastPing > GPS_DISPLAY_GRACE_MS;

                      const displayGpsOn = isMissed ? false : (inst.gps_status === 'GPS ON' && !gpsIsStale);
                      const displayLocation = isMissed ? null : inst.last_is_inside;

                      
                      const hasClockedIn =
  inst.time_in !== null &&
  inst.time_in !== '--:--' &&
  inst.time_in !== undefined;

const shiftIsOpen = inst.time_out === null || inst.time_out === '--:--';

const isAlert =
  isToday &&
  !isMissed &&
  hasClockedIn &&       
  !gpsIsStale &&
  shiftIsOpen &&
  (
    inst.gps_status === 'GPS OFF' ||
    inst.last_is_inside === 0
  );

                      return (
                        <tr key={inst.employee_id} className={isAlert ? 'lt-alert-row' : ''}>
                          <td>
                            <div className="lt-emp-name">{inst.full_name}</div>
                            <div className="lt-emp-id">{inst.employee_id}</div>
                          </td>

                          <td>
                            {inst.schedule_course ? (
                              <div className="lt-assignment">
                                <span className="lt-course">{inst.schedule_course}</span>
                                <span className="lt-time">
                                  {formatTo12Hour(inst.start_time)} – {formatTo12Hour(inst.end_time)}
                                </span>
                              </div>
                            ) : (
                              <span className="lt-no-shift">No active shift</span>
                            )}
                          </td>

                          <td className="text-center">
                            <span
                              className={`lt-status-badge ${attBadgeClass}`}
                              style={
                                attStatus === 'Scheduled'
                                  ? { backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }
                                  : {}
                              }
                            >
                              {attStatus.toUpperCase()}
                            </span>
                          </td>

                          <td className="text-center">
                            <span className={`lt-status-badge ${displayGpsOn ? 'gps-on' : 'gps-off'}`}>
                              {displayGpsOn ? 'ON' : 'OFF'}
                            </span>
                          </td>

                          <td className="text-center">
                            {!displayGpsOn || displayLocation === null ? (
                              <span
                                className="lt-status-badge"
                                style={{ backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' }}
                              >
                                UNAVAILABLE
                              </span>
                            ) : displayLocation === 1 ? (
                              <span className="lt-status-badge inside">INSIDE</span>
                            ) : (
                              <span className="lt-status-badge outside">OUTSIDE</span>
                            )}
                          </td>

                          <td className="text-center">
                            <button
                              className="lt-btn-icon"
                              onClick={() => openTimelineModal(inst)}
                              title="View Timeline & Details"
                              aria-label={`View timeline for ${inst.full_name || inst.employee_id}`}
                            >
                              <Eye size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {filteredInstructors.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                <span style={{ fontSize: 13, color: '#64748B' }}>
                  Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredInstructors.length)} of {filteredInstructors.length}
                </span>
                <Pagination
                  page={safePage}
                  totalPages={totalPages}
                  onChange={setCurrentPage}
                  label="Instructor table pagination"
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Alert History Modal */}
      <FormalModal
        show={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="Tracking Alert History"
        wide
        footer={<button className="btn-modal-cancel" onClick={() => setShowHistoryModal(false)}>Close Window</button>}
      >
        <div className="lt-modal-toolbar">
          <div className="lt-modal-filter">
            <label>Filter Date</label>
            <input
              type="date"
              value={historyDate}
              max={todayStr}
              onChange={handleHistoryDateChange}
              className="lt-date-input"
              aria-label="Alert history date"
            />
          </div>
          <button className="btn-lt-primary" onClick={() => fetchAlertHistory(historyDate)} disabled={historyLoading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {historyLoading ? (
          <div className="lt-loading-state" aria-live="polite">Loading history...</div>
        ) : (
          <div className="lt-table-wrapper" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            <table className="lt-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Instructor</th>
                  <th>Alert Details</th>
                  <th>Campus Location</th>
                </tr>
              </thead>
              <tbody>
                {alertHistory.length === 0 ? (
                  <tr className="lt-empty-row"><td colSpan="4">No alerts recorded on this date.</td></tr>
                ) : (
                  alertHistory.map(alert => (
                    <tr key={alert.id}>
                      <td className="lt-time-text">{formatPHT(alert.created_at)}</td>
                      <td className="font-semibold text-dark">{alert.full_name}</td>
                      <td className="text-red-600">{alert.alert_message}</td>
                      <td>{alert.location_name || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </FormalModal>

      {/* Unified Timeline Modal */}
      <FormalModal
        show={showTimelineModal}
        onClose={closeTimelineModal}
        title={`Geofence Details: ${selectedInstructor?.full_name || selectedInstructor?.name || 'Instructor'}`}
        wide
        footer={<button className="btn-modal-cancel" onClick={closeTimelineModal}>Close Window</button>}
      >
        {timelineLoading ? (
          <div className="lt-loading-state" aria-live="polite">Compiling timeline...</div>
        ) : (
          <div className="lt-modal-wrapper">
            <div className="lt-user-profile-header">
              <div className="lt-user-info-group">
                <div className="lt-avatar-circle">
                  {selectedInstructor?.full_name
                    ? selectedInstructor.full_name.charAt(0).toUpperCase()
                    : selectedInstructor?.name
                      ? selectedInstructor.name.charAt(0).toUpperCase()
                      : 'I'}
                </div>
                <div className="lt-user-meta">
                  <span className="lt-user-name">
                    {selectedInstructor?.full_name || selectedInstructor?.name || 'Unknown'}
                  </span>
                  <span className="lt-user-id">{selectedInstructor?.employee_id || '—'}</span>
                </div>
              </div>
              <span className={`lt-status-badge ${selectedInstructor?.gps_status === 'GPS ON' ? 'gps-on' : 'gps-off'}`}>
                {selectedInstructor?.gps_status || 'STATUS N/A'}
              </span>
            </div>

            <div className="lt-modal-info">
              <span>
                Displaying location summaries, boundary transitions, and system alerts for <strong>{selectedDate}</strong>.
              </span>
            </div>

            <div className="lt-timeline-summary">
              <div className="summary-item">
                <span className="summary-label">Last Known Position</span>
                <span className="summary-value">{selectedInstructor?.last_position_name || 'Unavailable'}</span>
              </div>
                <div className="summary-item">
                <span className="summary-label">Clock in Time</span>
                <span className="summary-value">{formatTimePHT(selectedInstructor?.campus_entry_time)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Clock out Time</span>
                <span className="summary-value">{formatTimePHT(selectedInstructor?.campus_exit_time)}</span>
              </div>
            </div>

            <div className="lt-table-wrapper" style={{ maxHeight: '40vh', overflowY: 'auto' }}>
              <table className="lt-table unified-timeline">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Event Type</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {unifiedEvents.length === 0 ? (
                    <tr className="lt-empty-row"><td colSpan="3">No telemetry events recorded during this shift.</td></tr>
                  ) : (
                    timelinePageEvents.map((ev, idx) => (
                      <tr
                        key={idx}
                        className={
                          ev.type === 'Alert' ? 'bg-red-50'
                          : ev.type === 'GPS' ? (ev.detail.includes('ON') ? 'bg-blue-50' : 'bg-gray-50')
                          : ev.type === 'Campus' ? 'bg-yellow-50'
                          : ''
                        }
                      >
                        <td className="lt-mono-text">{renderEventTime(ev.time)}</td>
                        <td>
                          <span className={`lt-event-badge ${ev.type.toLowerCase()}`}>{ev.type}</span>
                        </td>
                        <td className="text-dark">{ev.detail}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              page={safeTimelinePage}
              totalPages={totalTimelinePages}
              onChange={setTimelinePage}
              label="Timeline pagination"
            />
          </div>
        )}
      </FormalModal>

      {/* Pulse animation for the alert badge (safe inline injection) */}
      <style>{`@keyframes ltAlertPulse {
        0%   { box-shadow: 0 0 0 0 rgba(220,38,38,0.7); }
        70%  { box-shadow: 0 0 0 6px rgba(220,38,38,0); }
        100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
      }`}</style>
    </div>
  );
};

export default LocationTracking;