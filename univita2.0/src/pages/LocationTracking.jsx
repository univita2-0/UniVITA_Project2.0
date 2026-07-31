import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { RefreshCw, History, AlertCircle, Eye } from 'lucide-react';
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

  const isWithinShift = (start, end) => {
    if (!start || !end) return false;
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return currentTime >= (sh * 60 + sm) && currentTime <= (eh * 60 + em);
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

  const openTimelineModal = async (employeeId, fullName) => {
    setSelectedInstructor({ id: employeeId, name: fullName });
    setShowTimelineModal(true);
    setTimelineLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/location-tracking/instructor-timeline/${employeeId}?date=${selectedDate}`, getAuthHeaders());
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
    const ws = new WebSocket(`ws://${window.location.hostname}:5000?token=${localStorage.getItem('auth_token')}`);
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
    return () => ws.close();
  }, [selectedDate]);

  useEffect(() => {
    if (showHistoryModal) {
      fetchAlertHistory(historyDate);
    }
  }, [showHistoryModal, historyDate]);

  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === todayStr;

  // Build unified events for timeline modal
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

    // 1. GPS status changes
    for (let i = 0; i < timeline.length; i++) {
      const curr = timeline[i];
      if (!isWithinShiftTime(curr.ping_time)) continue;
      const prev = i > 0 ? timeline[i-1] : null;
      if (prev && prev.location_enabled !== curr.location_enabled) {
        events.push({
          time: curr.ping_time,
          type: 'GPS',
          detail: curr.location_enabled ? 'GPS turned ON' : 'GPS turned OFF'
        });
      }
    }

    // 2. Campus status changes (inside ↔ outside)
    for (let i = 0; i < timeline.length; i++) {
      const curr = timeline[i];
      if (!isWithinShiftTime(curr.ping_time)) continue;
      const prev = i > 0 ? timeline[i-1] : null;
      if (prev && prev.is_inside_campus !== curr.is_inside_campus && curr.location_enabled) {
        const action = curr.is_inside_campus ? 'Entered campus' : 'Went outside campus';
        events.push({
          time: curr.ping_time,
          type: 'Campus',
          detail: `${action} (${curr.location_name || 'Unknown'})`
        });
      }
    }

    // 3. Alerts from location_alerts table
    (timelineData.alerts || []).forEach(alert => {
      events.push({
        time: alert.created_at,
        type: 'Alert',
        detail: alert.alert_message
      });
    });

    // Sort by timestamp
    events.sort((a, b) => new Date(a.time) - new Date(b.time));
    return events;
  };

  return (
    <div className="lt-dashboard">
      <div className="lt-header">
        <div>
          <p className="subtitle">Real-time campus geofencing compliance</p>
        </div>
        <div className="lt-actions">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="date-picker"
          />
          <button className="nav-action-btn" onClick={() => setShowHistoryModal(true)}>
            <History size={16} /> History
          </button>
          <button className="nav-action-btn sync-btn" onClick={() => fetchData(selectedDate)}>
            <RefreshCw size={16} /> Sync
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-skeleton">Loading...</div>
      ) : (
        <>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-value">{instructors.length}</div>
              <div className="stat-label">Active Shifts</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{instructors.filter(i => i.last_is_inside === 1).length}</div>
              <div className="stat-label">On‑Campus (now)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#dc2626' }}>{alerts.length}</div>
              <div className="stat-label">Alerts (this date)</div>
            </div>
          </div>

          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Instructor</th>
                  <th>Assignment</th>
                  <th>GPS Status</th>
                  <th>Campus Status</th>
                  <th>Last Position</th>
                  <th>Entered Campus</th>
                  <th>Went Outside</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {instructors.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan="8">No active shifts on this date.</td>
                  </tr>
                ) : (
                  instructors.map(inst => {
                    const isGpsOn = inst.gps_status === 'GPS ON';
                    const isOutside = inst.last_is_inside === 0;
                    const isAlert = isToday && (!isGpsOn || isOutside);

                    return (
                      <tr key={inst.employee_id} className={isAlert ? 'alert-row' : ''}>
                        <td>
                          <div className="instructor-name">{inst.full_name}</div>
                          <div className="employee-id">{inst.employee_id}</div>
                          {isToday && <span className="active-badge">ACTIVE NOW</span>}
                        </td>
                        <td>
                          {inst.schedule_course ? (
                            <div className="schedule-badge">
                              <span className="schedule-course">{inst.schedule_course}</span>
                              <span className="schedule-time">
                                {formatTo12Hour(inst.start_time)} – {formatTo12Hour(inst.end_time)}
                              </span>
                            </div>
                          ) : (
                            <div className="no-schedule-text">No active shift</div>
                          )}
                        </td>
                        <td>
                          <span className={`status-pill ${isGpsOn ? 'pill-gps-on' : 'pill-gps-off'}`}>
                            {isGpsOn ? 'ON' : 'OFF'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${inst.last_is_inside === 1 ? 'pill-active' : 'pill-outside'}`}>
                            {inst.last_is_inside === 1 ? 'INSIDE' : 'OUTSIDE'}
                          </span>
                        </td>
                        <td className="coordinates">
                          {isGpsOn ? (inst.last_position_name || 'Calculating...') : 'Unavailable'}
                        </td>
                        <td>{inst.campus_entry_time || '—'}</td>
                        <td>{inst.campus_exit_time || '—'}</td>
                        <td>
                          <button
                            className="action-icon eye-icon"
                            onClick={() => openTimelineModal(inst.employee_id, inst.full_name)}
                            title="View detailed timeline"
                          >
                            <Eye size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Alert History Modal (unchanged) */}
      <FormalModal
        show={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="Alert History"
        wide
        style={{ maxWidth: '85vw', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div className="history-controls">
          <label>Filter by date:</label>
          <input
            type="date"
            value={historyDate}
            onChange={e => setHistoryDate(e.target.value)}
            className="date-picker"
          />
          <button onClick={() => fetchAlertHistory(historyDate)}>Refresh</button>
        </div>
        {historyLoading ? (
          <p>Loading...</p>
        ) : (
          <table className="data-table small">
            <thead>
              <tr><th>Time</th><th>Instructor</th><th>Alert Message</th><th>Campus</th></tr>
            </thead>
            <tbody>
              {alertHistory.length === 0 ? (
                <tr><td colSpan="4">No alerts on this date.</td></tr>
              ) : (
                alertHistory.map(alert => (
                  <tr key={alert.id}>
                    <td>{new Date(alert.created_at).toLocaleString()}</td>
                    <td>{alert.full_name}</td>
                    <td>{alert.alert_message}</td>
                    <td>{alert.location_name || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </FormalModal>

      {/* Unified Timeline Modal */}
      <FormalModal
        show={showTimelineModal}
        onClose={() => setShowTimelineModal(false)}
        title={`Timeline & Alerts for ${selectedInstructor?.name} (${selectedDate})`}
        wide
        style={{ maxWidth: '85vw', maxHeight: '85vh', overflowY: 'auto' }}
      >
        {timelineLoading ? (
          <div>Loading timeline...</div>
        ) : (
          <>
            <h4>Combined Event Log (GPS, Campus, Alerts)</h4>
            <table className="data-table small unified-events">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event Type</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {buildUnifiedEvents().length === 0 ? (
                  <tr><td colSpan="3">No events recorded during this shift.</td></tr>
                ) : (
                  buildUnifiedEvents().map((ev, idx) => (
                    <tr key={idx} className={
                      ev.type === 'Alert' ? 'alert-row' :
                      ev.type === 'GPS' ? (ev.detail.includes('ON') ? 'gps-on' : 'gps-off') :
                      ev.type === 'Campus' ? 'campus-transition' : ''
                    }>
                      <td>{new Date(ev.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                      <td><strong>{ev.type}</strong></td>
                      <td>{ev.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}
      </FormalModal>
    </div>
  );
};

export default LocationTracking;