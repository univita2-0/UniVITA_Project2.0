// src/pages/TodayVisitors.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { User, Info, RefreshCw, Users, UserCheck, XCircle, ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_BASE } from '../api';
import FormalModal from '../components/FormalModal';
import './TodayVisitors.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

export const FLOOR_3_ROOMS = ['Classroom', 'AHA Room', 'Private Room', 'Operating Room', 'Delivery Room', 'NICU', 'ICU', 'Library', 'Breakout Room 1', 'Breakout Room 2', 'Breakout Room 3', 'Faculty Room', 'Main Entrance'];
export const FLOOR_5_ROOMS = ['Lounge / IV Drip', 'Operating Room', 'Delivery Room', 'ICU', 'Educ Head', 'Executive', 'Conference', 'Creatives', 'Debrief Room', 'Lobby', 'Entrance', 'AHA Room', 'Classroom 1', 'Classroom 2', 'HR / Admin', 'Pantry', 'Toilet'];

const formatTo12Hour = (timeStr) => {
  if (!timeStr) return '—';
  const [hour, minute] = timeStr.split(':');
  let h = parseInt(hour, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${minute} ${ampm}`;
};

// --- STRICT BATTERY VALIDATION & UI RENDERER ---
const renderBatteryValidation = (mV) => {
  if (!mV || isNaN(mV) || mV <= 0) {
    return <span className="tv-mono-text" style={{ color: '#94A3B8' }}>Awaiting Telemetry...</span>;
  }

  // Filter out ESP32 packet shift anomalies (CR2032 physical limits are 2000mV to 3600mV)
  if (mV > 3600 || mV < 2000) {
    return (
      <div className="tv-batt-alert">
        <span className="tv-batt-val error">{mV} mV</span>
        <span className="tv-batt-status error">Data Anomaly</span>
      </div>
    );
  }

  // Corrected CR2032 percentage calculation (2000mV is 0%, 3000mV is 100%)
  const minVoltage = 2000;
  const maxVoltage = 3000;
  const percentage = Math.min(100, Math.max(0, Math.round(((mV - minVoltage) / (maxVoltage - minVoltage)) * 100)));
  
  let statusClass = 'good';
  if (percentage <= 20) statusClass = 'critical';
  else if (percentage <= 50) statusClass = 'warning';

  return (
    <div className="tv-batt-container">
      <div className="tv-batt-header">
        <span className={`tv-batt-val ${statusClass}`}>{mV} mV</span>
        <span className={`tv-batt-pct ${statusClass}`}>{percentage}%</span>
      </div>
      <div className="tv-batt-bar-bg">
        <div className={`tv-batt-bar-fill ${statusClass}`} style={{ width: `${percentage}%` }}></div>
      </div>
      {percentage <= 20 && <span className="tv-batt-status critical">Replace CR2032</span>}
    </div>
  );
};

const TodayVisitors = () => {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [visitors, setVisitors] = useState([]);
  const [allBleTags, setAllBleTags] = useState([]);
  const [availableBleTags, setAvailableBleTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, arrived: 0, noShow: 0, returned: 0 });
  const [assignments, setAssignments] = useState({});

  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [noShowTargetId, setNoShowTargetId] = useState(null);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnTargetId, setReturnTargetId] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [tagsCurrentPage, setTagsCurrentPage] = useState(1);
  const tagsPerPage = 10;

  useEffect(() => { setCurrentPage(1); }, [selectedDate]);

  const fetchVisitorsForDate = useCallback(async (date) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/visitor-requests`, {
        params: { date, status: 'APPROVED' },
        ...getAuthHeaders()
      });
      const data = res.data || [];
      
      const currentActiveVisitors = data.filter(v => v.returned !== 1 && v.no_show !== 1);
      setVisitors(currentActiveVisitors);
      
      setStats({
        total: data.length,
        arrived: data.filter(v => v.arrived == 1 && v.returned != 1).length,
        noShow: data.filter(v => v.no_show == 1).length,
        returned: data.filter(v => v.returned == 1).length,
      });
    } catch (err) {
      toast.error('Could not load visitor list');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBleTags = useCallback(async () => {
    setTagsLoading(true);
    try {
      const [tagsRes, inUseRes] = await Promise.all([
        axios.get(`${API_BASE}/ble-tags`, getAuthHeaders()),
        axios.get(`${API_BASE}/ble-tags/in-use`, getAuthHeaders())
      ]);
      const allTags = tagsRes.data.map(tag => ({
        ...tag,
        inUse: inUseRes.data.includes(tag.ble_id) || tag.current_status === 'IN USE'
      }));
      setAllBleTags(allTags);
      setAvailableBleTags(allTags.filter(tag => !tag.inUse));
      setTagsCurrentPage(1);
    } catch (err) {
      toast.error('Could not load BLE tags.');
    } finally {
      setTagsLoading(false);
    }
  }, []);

  useEffect(() => { fetchVisitorsForDate(selectedDate); }, [selectedDate, fetchVisitorsForDate]);
  useEffect(() => { fetchBleTags(); }, [fetchBleTags]);

  const handleAssignmentChange = (visitorId, field, value) => {
    setAssignments(prev => {
      const current = prev[visitorId] || { floor: '', room: '', bleId: '' };
      const updated = { ...current, [field]: value };
      if (field === 'floor') updated.room = '';
      return { ...prev, [visitorId]: updated };
    });
  };

  const markArrived = async (id, floor, room, bleId) => {
    if (!floor || !room || !bleId) return toast.warning('Select floor, room, and BLE tag.');
    try {
      const res = await axios.put(`${API_BASE}/visitor-requests/${id}/arrive`, { floor, destination: room, ble_id: bleId }, getAuthHeaders());
      setAssignments(prev => { const newAssigns = { ...prev }; delete newAssigns[id]; return newAssigns; });
      await fetchVisitorsForDate(selectedDate);
      await fetchBleTags();
      toast.success(res.data.message || 'Visitor checked in.');
    } catch (err) { toast.error(err.response?.data?.message || 'Error marking arrival.'); }
  };

  const confirmNoShow = (id) => { setNoShowTargetId(id); setShowNoShowModal(true); };
  const markNoShow = async () => {
    if (!noShowTargetId) return;
    try {
      await axios.put(`${API_BASE}/visitor-requests/${noShowTargetId}/no-show`, {}, getAuthHeaders());
      await fetchVisitorsForDate(selectedDate);
      await fetchBleTags();
      toast.info('Visitor marked as no show.');
    } catch (err) { toast.error('Failed to mark as no show.'); } 
    finally { setShowNoShowModal(false); setNoShowTargetId(null); }
  };

  const confirmReturn = (id) => { setReturnTargetId(id); setShowReturnModal(true); };
  const returnBleTag = async () => {
    if (!returnTargetId) return;
    try {
      await axios.put(`${API_BASE}/visitor-requests/${returnTargetId}/return`, {}, getAuthHeaders());
      await fetchVisitorsForDate(selectedDate);
      await fetchBleTags();
      toast.success('BLE tag returned.');
    } catch (err) { toast.error('Failed to return tag.'); } 
    finally { setShowReturnModal(false); setReturnTargetId(null); }
  };

  const formattedDate = new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const totalPages = Math.ceil(visitors.length / itemsPerPage);
  const currentVisitors = visitors.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalTagsPages = Math.ceil(allBleTags.length / tagsPerPage);
  const currentTags = allBleTags.slice((tagsCurrentPage - 1) * tagsPerPage, tagsCurrentPage * tagsPerPage);

  return (
    <div className="tv-container">
      <div className="tv-header-section">
        <div><p className="tv-subtitle">Manage arrivals, assign BLE tags, and track scheduled visitors.</p></div>
        <div className="tv-actions">
          <div className="tv-date-picker-box">
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="tv-date-input" />
          </div>
          <button className="btn-tv-outline" onClick={() => { fetchBleTags(); setShowTagsModal(true); }}>
            <Info size={16} color="#0F172A" /> BLE Tag Inventory
          </button>
        </div>
      </div>

      <div className="tv-stats-grid">
        <div className="tv-stat-card">
          <div className="tv-stat-header"><div className="tv-stat-icon"><Users size={20} color="#0F172A" /></div><span>Scheduled Today</span></div>
          <div className="tv-stat-value">{stats.total}</div>
        </div>
        <div className="tv-stat-card">
          <div className="tv-stat-header"><div className="tv-stat-icon"><UserCheck size={20} color="#0F172A" /></div><span>Checked In</span></div>
          <div className="tv-stat-value">{stats.arrived}</div>
        </div>
        <div className="tv-stat-card">
          <div className="tv-stat-header"><div className="tv-stat-icon"><XCircle size={20} color="#0F172A" /></div><span>No Show</span></div>
          <div className="tv-stat-value">{stats.noShow}</div>
        </div>
        <div className="tv-stat-card">
          <div className="tv-stat-header"><div className="tv-stat-icon"><ArrowLeftRight size={20} color="#0F172A" /></div><span>Tags Returned</span></div>
          <div className="tv-stat-value">{stats.returned}</div>
        </div>
      </div>

      <div className="tv-card">
        <div className="tv-card-header">
          <h3>Current Visitors ({formattedDate})</h3>
        </div>

        <div className="tv-table-wrapper">
          {loading ? (
            <div className="tv-state-box">Loading visitor data...</div>
          ) : visitors.length === 0 ? (
            <div className="tv-state-box">
              <User size={32} color="#94A3B8" className="mb-2" />
              <p>No current visitors on campus.</p>
            </div>
          ) : (
            <>
              <table className="tv-table">
                <thead>
                  <tr>
                    <th>Visitor Details</th><th>Schedule</th><th>Purpose</th><th>Floor, Room & Tag</th><th className="text-center">Status</th><th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentVisitors.map(v => {
                    const displayBleId = v.used_ble_id || v.ble_id;
                    const visitorAssign = assignments[v.id] || { floor: '', room: '', bleId: '' };
                    return (
                      <tr key={v.id}>
                        <td><div className="tv-guest-name">{v.first_name} {v.last_name}</div><div className="tv-guest-email">{v.email}</div></td>
                        <td><span className="tv-time-text">{v.visit_time ? formatTo12Hour(v.visit_time) : '—'}</span></td>
                        <td><span className="tv-purpose-text" title={v.reason}>{v.reason || '—'}</span></td>
                        <td>
                          {v.arrived != 1 && v.no_show != 1 ? (
                            <div className="tv-assignment-controls">
                              <select className="tv-select" value={visitorAssign.floor} onChange={(e) => handleAssignmentChange(v.id, 'floor', e.target.value)}>
                                <option value="">Select Floor</option><option value="3">3rd Floor</option><option value="5">5th Floor</option>
                              </select>
                              <select className="tv-select" value={visitorAssign.room} onChange={(e) => handleAssignmentChange(v.id, 'room', e.target.value)} disabled={!visitorAssign.floor}>
                                <option value="">Select Room</option>
                                {visitorAssign.floor === '3' && FLOOR_3_ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
                                {visitorAssign.floor === '5' && FLOOR_5_ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <select className="tv-select" value={visitorAssign.bleId} onChange={(e) => handleAssignmentChange(v.id, 'bleId', e.target.value)}>
                                <option value="">Select BLE Tag</option>
                                {availableBleTags.map(t => <option key={t.ble_id} value={t.ble_id}>{t.ble_id} – {t.label || t.ble_id}</option>)}
                              </select>
                            </div>
                          ) : (
                            <div className="tv-assigned-info"><span className="tv-assigned-room">Room: {v.destination || '—'}</span><span className="tv-assigned-tag">BLE: {displayBleId || '—'}</span></div>
                          )}
                        </td>
                        <td className="text-center">
                          {v.arrived == 1 ? <span className="tv-badge arrived">Checked In</span> : <span className="tv-badge expected">Expected</span>}
                        </td>
                        <td className="text-right">
                          {v.arrived != 1 ? (
                            <div className="tv-action-group">
                              <button className="btn-tv-success" onClick={() => markArrived(v.id, visitorAssign.floor, visitorAssign.room, visitorAssign.bleId)} disabled={availableBleTags.length === 0}>Check In</button>
                              <button className="btn-tv-danger-outline" onClick={() => confirmNoShow(v.id)}>No Show</button>
                            </div>
                          ) : (
                            <button className="btn-tv-warning" onClick={() => confirmReturn(v.id)}>Return Tag</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="tv-pagination">
                  <span className="tv-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, visitors.length)}</span>
                  <div className="tv-page-controls">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="tv-page-btn"><ChevronLeft size={16} /> Prev</button>
                    <span className="tv-page-current">{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="tv-page-btn">Next <ChevronRight size={16} /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <FormalModal show={showTagsModal} onClose={() => setShowTagsModal(false)} title="BLE Tags Inventory & Battery Health" wide footer={<button className="btn-tv-cancel" onClick={() => setShowTagsModal(false)}>Close</button>}>
        <div className="tv-modal-toolbar">
          <button className="btn-tv-outline-sm" onClick={fetchBleTags} disabled={tagsLoading}>
            <RefreshCw size={14} color="#0F172A" /> {tagsLoading ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>
        <div className="tv-table-wrapper" style={{ minHeight: '400px' }}>
          {tagsLoading && allBleTags.length === 0 ? <div className="tv-state-box">Loading tags...</div> : (
            <table className="tv-table">
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr><th>HARDWARE LABEL</th><th>MAC ADDRESS</th><th>BATTERY VALIDATION</th><th>LAST USED / ASSIGNED TO</th><th className="text-center">CURRENT STATUS</th></tr>
              </thead>
              <tbody>
                {currentTags.map(tag => (
                  <tr key={tag.id}>
                    <td>{tag.label || '—'}</td>
                    <td><span className="tv-mono-text">{tag.mac_address || '—'}</span></td>
                    
                    {/* IMPLEMENTED BATTERY VALIDATION */}
                    <td>{renderBatteryValidation(tag.battery_level)}</td>

                    <td>
                      {tag.inUse ? (
                        <span className="text-red-600 font-medium" style={{ fontSize: '0.85rem' }}>
                          In use by: {tag.active_first} {tag.active_last} <br/>
                          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Checked in: {tag.active_arrived_at || '—'}</span>
                        </span>
                      ) : tag.last_last ? (
                        <span className="text-gray-600" style={{ fontSize: '0.85rem' }}>
                          {tag.last_first} {tag.last_last} <br/>
                          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Returned: {tag.last_returned_at || '—'}</span>
                        </span>
                      ) : <span className="text-gray-400" style={{ fontSize: '0.85rem' }}>Never used</span>}
                    </td>
                    <td className="text-center">{tag.inUse ? <span className="tv-badge noshow">IN USE</span> : <span className="tv-badge arrived">AVAILABLE</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </FormalModal>
      
      <FormalModal show={showNoShowModal} onClose={() => setShowNoShowModal(false)} title="Confirm No Show" footer={<><button className="btn-tv-cancel" onClick={() => setShowNoShowModal(false)}>Cancel</button><button className="btn-tv-danger" onClick={markNoShow}>Yes, Mark No Show</button></>}>
        <p className="tv-modal-text">Are you sure you want to mark this visitor as <strong>No Show</strong>?</p>
      </FormalModal>
      <FormalModal show={showReturnModal} onClose={() => setShowReturnModal(false)} title="Confirm Tag Return" footer={<><button className="btn-tv-cancel" onClick={() => setShowReturnModal(false)}>Cancel</button><button className="btn-tv-warning" onClick={returnBleTag}>Yes, Return Tag</button></>}>
        <p className="tv-modal-text">Confirm the return of the BLE Tag.</p>
      </FormalModal>
    </div>
  );
};

export default TodayVisitors;