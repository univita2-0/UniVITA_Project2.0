// src/pages/LocationTracking.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { RefreshCw, History, Eye, Map, AlertTriangle, ShieldCheck, Clock } from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';
import './LocationTracking.css';

const getAuthHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });

const LocationTracking = () => {
  const [instructors, setInstructors] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0]);
  const [alertHistory, setAlertHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [timelineData, setTimelineData] = useState({ timeline: [], alerts: [], start_time: null, end_time: null });
  const [timelineLoading, setTimelineLoading] = useState(false);

  const formatTo12Hour = (timeString) => {
    if (!timeString || timeString === '00:00:00') return 'N/A';
    const [hours, minutes] = timeString.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h % 12 || 12;
    return `${displayHours}:${minutes} ${ampm}`;
  };

  const fetchData = async (date = selectedDate) => {
    setLoading(true);
    try {
      const [statusRes, alertsRes] = await Promise.all([
        axios.get(`${API_BASE}/location-tracking/status?date=${date}`, getAuthHeaders()),
        axios.get(`${API_BASE}/location-tracking/alerts?date=${date}`, getAuthHeaders())
      ]);
      setInstructors(statusRes.data || []);
      setAlerts(alertsRes.data || []);
    } catch (err) {
      toast.error('Failed to load tracking data.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAlertHistory = async (date) => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/location-tracking/alerts?date=${date}`, getAuthHeaders());
      setAlertHistory(res.data);
    } catch (err) {
      toast.error('Failed to load alert history');
    } finally {
      setHistoryLoading(false);
    }
  };

  // UPDATED: Now accepts the entire instructor object to populate modal headers
  const openTimelineModal = async (inst) => {
    setSelectedInstructor(inst);
    setShowTimelineModal(true);
    setTimelineLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/location-tracking/instructor-timeline/${inst.employee_id}?date=${selectedDate}`, getAuthHeaders());
      setTimelineData(res.data);
    } catch (err) {
      toast.error('Failed to load timeline data');
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate]);

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
      } catch (err) {
        return null;
      }
    };

    const wsUrl = getWsUrl();
    if (wsUrl) {
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'instructor_status_update') {
            if (selectedDate === new Date().toISOString().split('T')[0]) {
              setInstructors(prev => prev.map(inst =>
                inst.employee_id === data.instructor.employee_id ? { ...inst, ...data.instructor } : inst
              ));
            }
          } else if (data.type === 'new_alert') {
            if (selectedDate === new Date().toISOString().split('T')[0]) {
              fetchData(selectedDate);
            }
          }
        };
      } catch (error) {
        console.error("WebSocket Error:", error);
      }
    }
    return () => { if (ws && ws.readyState === WebSocket.OPEN) ws.close(); };
  }, [selectedDate]);

  useEffect(() => {
    if (showHistoryModal) fetchAlertHistory(historyDate);
  }, [showHistoryModal, historyDate]);

  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === todayStr;

  const buildUnifiedEvents = () => {
    const events = [];
    const timeline = timelineData.timeline || [];
    const shiftStart = timelineData.start_time;
    const shiftEnd = timelineData.end_time;

    const isWithinShiftTime = (timeStr) => {
      if (!shiftStart || !shiftEnd) return true;
      const t = new Date(timeStr);
      const hours = t.getHours(), minutes = t.getMinutes();
      const total = hours * 60 + minutes;
      const [sh, sm] = shiftStart.split(':').map(Number);
      const [eh, em] = shiftEnd.split(':').map(Number);
      return total >= (sh*60+sm) && total <= (eh*60+em);
    };

    for (let i = 0; i < timeline.length; i++) {
      const curr = timeline[i];
      if (!isWithinShiftTime(curr.ping_time)) continue;
      const prev = i > 0 ? timeline[i-1] : null;
      if (prev && prev.location_enabled !== curr.location_enabled) {
        events.push({ time: curr.ping_time, type: 'GPS', detail: curr.location_enabled ? 'GPS turned ON' : 'GPS turned OFF' });
      }
    }

    for (let i = 0; i < timeline.length; i++) {
      const curr = timeline[i];
      if (!isWithinShiftTime(curr.ping_time)) continue;
      const prev = i > 0 ? timeline[i-1] : null;
      if (prev && prev.is_inside_campus !== curr.is_inside_campus && curr.location_enabled) {
        const action = curr.is_inside_campus ? 'Entered campus' : 'Went outside campus';
        events.push({ time: curr.ping_time, type: 'Campus', detail: `${action} (${curr.location_name || 'Unknown'})` });
      }
    }

    (timelineData.alerts || []).forEach(alert => {
      events.push({ time: alert.created_at, type: 'Alert', detail: alert.alert_message });
    });

    events.sort((a, b) => new Date(a.time) - new Date(b.time));
    return events;
  };

  return (
    <div className="lt-container">
      <div className="lt-header-row">
        <div>
          <p className="lt-page-subtitle">Real-time geofencing and campus compliance monitoring.</p>
        </div>
        <div className="lt-header-actions">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="lt-date-input"
          />
          <button className="btn-lt-outline" onClick={() => setShowHistoryModal(true)}>
            <History size={16} /> <span>Alert History</span>
          </button>
          <button className="btn-lt-primary" onClick={() => fetchData(selectedDate)}>
            <RefreshCw size={16} /> <span>Sync Data</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="lt-loading-state">Gathering location telemetry...</div>
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
                <span className="stat-value">{instructors.filter(i => i.last_is_inside === 1).length}</span>
              </div>
            </div>
            <div className="lt-stat-card alert">
              <div className="stat-icon-wrapper danger"><AlertTriangle size={20} /></div>
              <div className="stat-info">
                <span className="stat-label">Daily Alerts</span>
                <span className="stat-value">{alerts.length}</span>
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
                  {instructors.length === 0 ? (
                    <tr className="lt-empty-row">
                      <td colSpan="6">No active shifts scheduled for this date.</td>
                    </tr>
                  ) : (
                    instructors.map(inst => {
                      const isGpsOn = inst.gps_status === 'GPS ON';
                      const isOutside = inst.last_is_inside === 0;
                      const isAlert = isToday && (!isGpsOn || isOutside);

                      // Determine dynamic styling for the Attendance status
                      const attStatus = inst.attendance_status || 'Unknown';
                      let attBadgeClass = 'gps-off';
                      
                      // Identify missed or absent logic
                      const isMissed = attStatus.toLowerCase().includes('miss') || attStatus.toLowerCase().includes('absent');

                      if (isMissed) attBadgeClass = 'outside';
                      else if (attStatus.toLowerCase().includes('present')) attBadgeClass = 'inside';
                      else if (attStatus.toLowerCase().includes('late')) attBadgeClass = 'warning';

                      // FORCE UNAVAILABLE FOR LOCATION & GPS IF MISSED/ABSENT
                      const displayGpsOn = isMissed ? false : isGpsOn;
                      const displayLocation = isMissed ? null : inst.last_is_inside;

                      return (
                        <tr key={inst.employee_id} className={isAlert ? 'lt-alert-row' : ''}>
                          {/* 1. INSTRUCTOR */}
                          <td>
                            <div className="lt-emp-name">{inst.full_name}</div>
                            <div className="lt-emp-id">{inst.employee_id}</div>
                          </td>
                          
                          {/* 2. ASSIGNMENT */}
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

                          {/* 3. ATTENDANCE STATUS */}
                          <td className="text-center">
                            <span className={`lt-status-badge ${attBadgeClass}`} style={attStatus === 'Scheduled' ? { backgroundColor: '#EFF6FF', color: '#1D4ED8' } : {}}>
                              {attStatus.toUpperCase()}
                            </span>
                          </td>
                          
                          {/* 4. GPS */}
                          <td className="text-center">
                            <span className={`lt-status-badge ${displayGpsOn ? 'gps-on' : 'gps-off'}`}>
                              {displayGpsOn ? 'ON' : 'OFF'}
                            </span>
                          </td>
                          
                          {/* 5. LOCATION */}
                          <td className="text-center">
                            {displayLocation === null ? (
                              <span className="lt-status-badge outside" style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}>
                                UNAVAILABLE
                              </span>
                            ) : (
                              <span className={`lt-status-badge ${displayLocation === 1 ? 'inside' : 'outside'}`}>
                                {displayLocation === 1 ? 'INSIDE' : 'OUTSIDE'}
                              </span>
                            )}
                          </td>
                          
                          {/* 6. TIMELINE (Eye Icon) */}
                          <td className="text-center">
                            <button
                              className="lt-btn-icon"
                              onClick={() => openTimelineModal(inst)}
                              title="View Timeline & Details"
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
              onChange={e => setHistoryDate(e.target.value)}
              className="lt-date-input"
            />
          </div>
          <button className="btn-lt-primary" onClick={() => fetchAlertHistory(historyDate)}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        
        {historyLoading ? (
          <div className="lt-loading-state">Loading history...</div>
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
                      <td className="lt-time-text">{new Date(alert.created_at).toLocaleString()}</td>
                      <td className="font-medium text-gray-900">{alert.full_name}</td>
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
        onClose={() => setShowTimelineModal(false)}
        title={`Geofence Details: ${selectedInstructor?.full_name || selectedInstructor?.name}`}
        wide
        footer={<button className="btn-modal-cancel" onClick={() => setShowTimelineModal(false)}>Close Window</button>}
      >
        {timelineLoading ? (
          <div className="lt-loading-state">Compiling timeline...</div>
        ) : (
          <>
            <div className="lt-modal-info">
              <Map size={16} />
              <span>Displaying location summaries, boundary transitions, and system alerts for <strong>{selectedDate}</strong>.</span>
            </div>

            {/* MOVED COLUMNS INSIDE THE MODAL */}
            <div className="lt-timeline-summary">
              <div className="summary-item">
                <span className="summary-label">Last Known Position</span>
                <span className="summary-value">{selectedInstructor?.last_position_name || 'Unavailable'}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Campus Entry Time</span>
                <span className="summary-value">{selectedInstructor?.campus_entry_time || '—'}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Campus Exit Time</span>
                <span className="summary-value">{selectedInstructor?.campus_exit_time || '—'}</span>
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
                  {buildUnifiedEvents().length === 0 ? (
                    <tr className="lt-empty-row"><td colSpan="3">No telemetry events recorded during this shift.</td></tr>
                  ) : (
                    buildUnifiedEvents().map((ev, idx) => (
                      <tr key={idx} className={
                        ev.type === 'Alert' ? 'bg-red-50' :
                        ev.type === 'GPS' ? (ev.detail.includes('ON') ? 'bg-blue-50' : 'bg-gray-50') :
                        ev.type === 'Campus' ? 'bg-yellow-50' : ''
                      }>
                        <td className="lt-mono-text">
                          {new Date(ev.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td>
                          <span className={`lt-event-badge ${ev.type.toLowerCase()}`}>{ev.type}</span>
                        </td>
                        <td className="text-gray-900">{ev.detail}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </FormalModal>
    </div>
  );
};

export default LocationTracking;