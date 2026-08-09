// src/pages/TodayVisitors.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { User, Info, RefreshCw, Calendar, Users, UserCheck, XCircle, ArrowLeftRight } from 'lucide-react';
import { API_BASE } from '../api';
import FormalModal from '../components/FormalModal';
import './TodayVisitors.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const FLOOR_3_ROOMS = [
  'AHA Room', 'Private Room', 'Operating Room', 'Delivery Room', 'MICU', 'ICU',
  'Classroom', 'Library', 'Breakout Room 1', 'Breakout Room 2', 'Breakout Room 3',
  'Faculty Room', 'Main Entrance'
];
const FLOOR_5_ROOMS = [
  'Lounge / IV Drip', 'Operating Room', 'Delivery Room', 'ICU', 'Educ Head',
  'Executive', 'Conference', 'Creatives', 'Debrief Room', 'Entrance',
  'AHA Room', 'Classroom 1', 'Classroom 2', 'HR / Admin', 'Pantry'
];

const ALL_ROOMS = [...new Set([...FLOOR_3_ROOMS, ...FLOOR_5_ROOMS])];

const getFloorByRoom = (roomName) => {
  if (FLOOR_3_ROOMS.includes(roomName)) return '3';
  if (FLOOR_5_ROOMS.includes(roomName)) return '5';
  return '3';
};

const formatTo12Hour = (timeStr) => {
  if (!timeStr) return '—';
  const [hour, minute] = timeStr.split(':');
  let h = parseInt(hour, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${minute} ${ampm}`;
};

const TodayVisitors = () => {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [visitors, setVisitors] = useState([]);
  const [allBleTags, setAllBleTags] = useState([]);
  const [availableBleTags, setAvailableBleTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, arrived: 0, noShow: 0, returned: 0 });
  
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [noShowTargetId, setNoShowTargetId] = useState(null);
  
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnTargetId, setReturnTargetId] = useState(null);

  const fetchVisitorsForDate = useCallback(async (date) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/visitor-requests`, {
        params: { date, status: 'APPROVED' },
        ...getAuthHeaders()
      });
      const data = res.data || [];
      setVisitors(data);
      setStats({
        total: data.length,
        arrived: data.filter(v => v.arrived == 1 && v.returned != 1).length,
        noShow: data.filter(v => v.no_show == 1).length,
        returned: data.filter(v => v.returned == 1).length,
      });
    } catch (err) {
      console.error('Failed to fetch visitors', err);
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
        inUse: inUseRes.data.includes(tag.ble_id)
      }));
      setAllBleTags(allTags);
      setAvailableBleTags(allTags.filter(tag => !tag.inUse));
    } catch (err) {
      console.error('Failed to load BLE tags', err);
      toast.error('Could not load BLE tags.');
    } finally {
      setTagsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVisitorsForDate(selectedDate);
  }, [selectedDate, fetchVisitorsForDate]);

  useEffect(() => {
    fetchBleTags();
  }, [fetchBleTags]);

  const markArrived = async (id, room, bleId) => {
    if (!room || !bleId) {
      toast.warning('Please select both a destination room and a BLE tag.');
      return;
    }
    try {
      await axios.put(`${API_BASE}/visitor-requests/${id}/arrive`, {
        destination: room,
        ble_id: bleId
      }, getAuthHeaders());
      await fetchVisitorsForDate(selectedDate);
      await fetchBleTags();
      toast.success('Visitor checked in and BLE tag assigned.');
    } catch (err) {
      console.error(err);
      toast.error('Error marking arrival.');
    }
  };

  const confirmNoShow = (id) => {
    setNoShowTargetId(id);
    setShowNoShowModal(true);
  };

  const markNoShow = async () => {
    if (!noShowTargetId) return;
    try {
      await axios.put(`${API_BASE}/visitor-requests/${noShowTargetId}/no-show`, {}, getAuthHeaders());
      await fetchVisitorsForDate(selectedDate);
      await fetchBleTags();
      toast.info('Visitor marked as no show.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to mark as no show.');
    } finally {
      setShowNoShowModal(false);
      setNoShowTargetId(null);
    }
  };

  const confirmReturn = (id) => {
    setReturnTargetId(id);
    setShowReturnModal(true);
  };

  const returnBleTag = async () => {
    if (!returnTargetId) return;
    try {
      await axios.put(`${API_BASE}/visitor-requests/${returnTargetId}/return`, {}, getAuthHeaders());
      await fetchVisitorsForDate(selectedDate);
      await fetchBleTags();
      toast.success('BLE tag returned and now available.');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to return tag.');
    } finally {
      setShowReturnModal(false);
      setReturnTargetId(null);
    }
  };

  const formattedDate = new Date(selectedDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <div className="tv-container">
      {/* Header Section */}
      <div className="tv-header-section">
        <div>
          <h2 className="tv-title">Daily Visitor Operations</h2>
          <p className="tv-subtitle">Manage arrivals, assign BLE tags, and track scheduled visitors.</p>
        </div>
        <div className="tv-actions">
          <div className="tv-date-picker-box">
            <Calendar size={16} className="tv-icon-muted" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="tv-date-input"
            />
          </div>
          <button className="btn-tv-outline" onClick={() => { fetchBleTags(); setShowTagsModal(true); }}>
            <Info size={16} /> BLE Tag Inventory
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="tv-stats-grid">
        <div className="tv-stat-card">
          <div className="tv-stat-header">
            <div className="tv-stat-icon bg-blue"><Users size={20} /></div>
            <span>Scheduled Today</span>
          </div>
          <div className="tv-stat-value">{stats.total}</div>
        </div>
        <div className="tv-stat-card">
          <div className="tv-stat-header">
            <div className="tv-stat-icon bg-teal"><UserCheck size={20} /></div>
            <span>Checked In</span>
          </div>
          <div className="tv-stat-value">{stats.arrived}</div>
        </div>
        <div className="tv-stat-card">
          <div className="tv-stat-header">
            <div className="tv-stat-icon bg-red"><XCircle size={20} /></div>
            <span>No Show</span>
          </div>
          <div className="tv-stat-value">{stats.noShow}</div>
        </div>
        <div className="tv-stat-card">
          <div className="tv-stat-header">
            <div className="tv-stat-icon bg-gray"><ArrowLeftRight size={20} /></div>
            <span>Tags Returned</span>
          </div>
          <div className="tv-stat-value">{stats.returned}</div>
        </div>
      </div>

      {/* Main Card */}
      <div className="tv-card">
        <div className="tv-card-header">
          <h3>Approved Appointments for {formattedDate}</h3>
        </div>

        <div className="tv-table-wrapper">
          {loading ? (
            <div className="tv-state-box">Loading visitor data...</div>
          ) : visitors.length === 0 ? (
            <div className="tv-state-box">
              <User size={32} className="tv-icon-muted mb-2" />
              <p>No approved visitors scheduled for this date.</p>
            </div>
          ) : (
            <table className="tv-table">
              <thead>
                <tr>
                  <th>Visitor Details</th>
                  <th>Schedule</th>
                  <th>Purpose</th>
                  <th>Room & Tag Assignment</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visitors.map(v => (
                  <tr key={v.id}>
                    <td>
                      <div className="tv-guest-name">{v.first_name} {v.last_name}</div>
                      <div className="tv-guest-email">{v.email}</div>
                    </td>
                    <td><span className="tv-time-text">{v.visit_time ? formatTo12Hour(v.visit_time) : '—'}</span></td>
                    <td><span className="tv-purpose-text" title={v.reason}>{v.reason || '—'}</span></td>
                    <td>
                      {!v.arrived && !v.no_show ? (
                        <div className="tv-assignment-controls">
                          <select id={`room-${v.id}`} className="tv-select">
                            <option value="">Select Room</option>
                            {ALL_ROOMS.map(room => <option key={room} value={room}>{room}</option>)}
                          </select>
                          <select id={`ble-${v.id}`} className="tv-select">
                            <option value="">Select BLE Tag</option>
                            {availableBleTags.length === 0 ? (
                              <option disabled>No tags available</option>
                            ) : (
                              availableBleTags.map(tag => (
                                <option key={tag.ble_id} value={tag.ble_id}>{tag.ble_id} – {tag.label || tag.ble_id}</option>
                              ))
                            )}
                          </select>
                        </div>
                      ) : (
                        <div className="tv-assigned-info">
                          {v.destination ? <span className="tv-assigned-room">Room: {v.destination}</span> : <span>—</span>}
                          {v.ble_id ? <span className="tv-assigned-tag">BLE: {v.ble_id}</span> : <span>—</span>}
                        </div>
                      )}
                    </td>
                    <td className="text-center">
                      {v.arrived && v.returned ? (
                        <span className="tv-badge returned">Returned</span>
                      ) : v.arrived ? (
                        <span className="tv-badge arrived">Checked In</span>
                      ) : v.no_show ? (
                        <span className="tv-badge noshow">No Show</span>
                      ) : (
                        <span className="tv-badge expected">Expected</span>
                      )}
                    </td>
                    <td className="text-right">
                      {!v.arrived && !v.no_show && (
                        <div className="tv-action-group">
                          <button
                            className="btn-tv-success"
                            onClick={() => markArrived(
                              v.id,
                              document.getElementById(`room-${v.id}`).value,
                              document.getElementById(`ble-${v.id}`).value
                            )}
                            disabled={availableBleTags.length === 0}
                          >
                            Check In
                          </button>
                          <button className="btn-tv-danger-outline" onClick={() => confirmNoShow(v.id)}>
                            No Show
                          </button>
                        </div>
                      )}
                      {v.arrived && !v.returned && (
                        <button className="btn-tv-warning" onClick={() => confirmReturn(v.id)}>
                          Return Tag
                        </button>
                      )}
                      {v.returned && <span className="tv-completed-text">Completed</span>}
                      {v.no_show && <span className="tv-completed-text">Cancelled</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* BLE Tags Inventory Modal */}
      <FormalModal
        show={showTagsModal}
        onClose={() => setShowTagsModal(false)}
        title="BLE Tags Inventory"
        wide
        footer={<button className="btn-tv-cancel" onClick={() => setShowTagsModal(false)}>Close</button>}
      >
        <div className="tv-modal-toolbar">
          <button className="btn-tv-outline-sm" onClick={fetchBleTags} disabled={tagsLoading}>
            <RefreshCw size={14} /> {tagsLoading ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>
        <div className="tv-table-wrapper" style={{ maxHeight: '400px' }}>
          {tagsLoading && allBleTags.length === 0 ? (
            <div className="tv-state-box">Loading tags...</div>
          ) : allBleTags.length === 0 ? (
            <div className="tv-state-box">No BLE tags registered in the system.</div>
          ) : (
            <table className="tv-table">
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th>BLE ID</th>
                  <th>Hardware Label</th>
                  <th>MAC Address</th>
                  <th className="text-center">Current Status</th>
                </tr>
              </thead>
              <tbody>
                {allBleTags.map(tag => (
                  <tr key={tag.id}>
                    <td><strong>{tag.ble_id}</strong></td>
                    <td>{tag.label || '—'}</td>
                    <td><span className="tv-mono-text">{tag.mac_address || '—'}</span></td>
                    <td className="text-center">
                      {tag.inUse ? (
                        <span className="tv-badge noshow">In Use</span>
                      ) : (
                        <span className="tv-badge arrived">Available</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </FormalModal>

      {/* No Show Modal */}
      <FormalModal
        show={showNoShowModal}
        onClose={() => setShowNoShowModal(false)}
        title="Confirm No Show"
        footer={
          <>
            <button className="btn-tv-cancel" onClick={() => setShowNoShowModal(false)}>Cancel</button>
            <button className="btn-tv-danger" onClick={markNoShow}>Yes, Mark No Show</button>
          </>
        }
      >
        <p className="tv-modal-text">Are you sure you want to mark this visitor as <strong>No Show</strong>?</p>
        <p className="tv-modal-warning">This action will cancel their appointment for today and cannot be undone.</p>
      </FormalModal>

      {/* Return Tag Modal */}
      <FormalModal
        show={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        title="Confirm Tag Return"
        footer={
          <>
            <button className="btn-tv-cancel" onClick={() => setShowReturnModal(false)}>Cancel</button>
            <button className="btn-tv-warning" onClick={returnBleTag}>Yes, Return Tag</button>
          </>
        }
      >
        <p className="tv-modal-text">Confirm the return of the BLE Tag.</p>
        <p className="tv-modal-warning">This will check the visitor out of the campus and make the tag available for new assignments.</p>
      </FormalModal>
    </div>
  );
};

export default TodayVisitors;