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

const FLOOR_3_ROOMS = [
  'AHA Room', 'Private Room', 'Operating Room', 'Delivery Room', 'NICU', 'ICU',
  'Classroom', 'Library', 'Breakout Room 1', 'Breakout Room 2', 'Breakout Room 3',
  'Faculty Office', 'Main Entrance'
];
const FLOOR_5_ROOMS = [
  'Lounge / IV Drip', 'Operating Room', 'Delivery Room', 'ICU', 'Educ. Head',
  'Executive 1', 'Executive 2', 'Creatives', 'Debrief Room', 'Main El',
  'ArriA Room', 'Classroom 1', 'Classroom 2', 'HR / Admin Finance', 'Pantry', 'Toilet'
];

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
  
  // State to track assignments (floor, room, bleId) for each visitor row dynamically
  const [assignments, setAssignments] = useState({});

  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [noShowTargetId, setNoShowTargetId] = useState(null);
  
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnTargetId, setReturnTargetId] = useState(null);

  // Pagination states for Appointments
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Pagination states for BLE Tags Inventory
  const [tagsCurrentPage, setTagsCurrentPage] = useState(1);
  const tagsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate]);

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
        inUse: inUseRes.data.includes(tag.ble_id) || tag.current_status === 'IN USE'
      }));
      setAllBleTags(allTags);
      setAvailableBleTags(allTags.filter(tag => !tag.inUse));
      setTagsCurrentPage(1); // Reset tags pagination on fresh load
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

  // Handle dependent dropdown selections per visitor row
  const handleAssignmentChange = (visitorId, field, value) => {
    setAssignments(prev => {
      const current = prev[visitorId] || { floor: '', room: '', bleId: '' };
      const updated = { ...current, [field]: value };
      
      // If floor changes, auto-reset the room selection
      if (field === 'floor') updated.room = '';
      
      return { ...prev, [visitorId]: updated };
    });
  };

  const markArrived = async (id, floor, room, bleId) => {
    if (!floor) {
      toast.warning('Please select a floor first.');
      return;
    }
    if (!room || !bleId) {
      toast.warning('Please select both a destination room and a BLE tag.');
      return;
    }
    try {
      await axios.put(`${API_BASE}/visitor-requests/${id}/arrive`, {
        floor: floor,       
        destination: room,
        ble_id: bleId
      }, getAuthHeaders());
      
      setAssignments(prev => {
        const newAssigns = { ...prev };
        delete newAssigns[id];
        return newAssigns;
      });

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

  // Calculate pagination slices for Appointments
  const totalPages = Math.ceil(visitors.length / itemsPerPage);
  const currentVisitors = visitors.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Calculate pagination slices for BLE Tags Inventory
  const totalTagsPages = Math.ceil(allBleTags.length / tagsPerPage);
  const currentTags = allBleTags.slice((tagsCurrentPage - 1) * tagsPerPage, tagsCurrentPage * tagsPerPage);

  return (
    <div className="tv-container">
      {/* Header Section */}
      <div className="tv-header-section">
        <div>
          <p className="tv-subtitle">Manage arrivals, assign BLE tags, and track scheduled visitors.</p>
        </div>
        <div className="tv-actions">
          <div className="tv-date-picker-box">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="tv-date-input"
            />
          </div>
          <button className="btn-tv-outline" onClick={() => { fetchBleTags(); setShowTagsModal(true); }}>
            <Info size={16} color="#0F172A" /> BLE Tag Inventory
          </button>
        </div>
      </div>

      {/* Minimalist Monochrome Stats Grid */}
      <div className="tv-stats-grid">
        <div className="tv-stat-card">
          <div className="tv-stat-header">
            <div className="tv-stat-icon"><Users size={20} color="#0F172A" /></div>
            <span>Scheduled Today</span>
          </div>
          <div className="tv-stat-value">{stats.total}</div>
        </div>
        <div className="tv-stat-card">
          <div className="tv-stat-header">
            <div className="tv-stat-icon"><UserCheck size={20} color="#0F172A" /></div>
            <span>Checked In</span>
          </div>
          <div className="tv-stat-value">{stats.arrived}</div>
        </div>
        <div className="tv-stat-card">
          <div className="tv-stat-header">
            <div className="tv-stat-icon"><XCircle size={20} color="#0F172A" /></div>
            <span>No Show</span>
          </div>
          <div className="tv-stat-value">{stats.noShow}</div>
        </div>
        <div className="tv-stat-card">
          <div className="tv-stat-header">
            <div className="tv-stat-icon"><ArrowLeftRight size={20} color="#0F172A" /></div>
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
              <User size={32} color="#94A3B8" className="mb-2" />
              <p>No approved visitors scheduled for this date.</p>
            </div>
          ) : (
            <>
              <table className="tv-table">
                <thead>
                  <tr>
                    <th>Visitor Details</th>
                    <th>Schedule</th>
                    <th>Purpose</th>
                    <th>Floor, Room & Tag</th>
                    <th className="text-center">Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentVisitors.map(v => {
                    const displayBleId = v.used_ble_id || v.ble_id;
                    const visitorAssign = assignments[v.id] || { floor: '', room: '', bleId: '' };
                    
                    return (
                      <tr key={v.id}>
                        <td>
                          <div className="tv-guest-name">{v.first_name} {v.last_name}</div>
                          <div className="tv-guest-email">{v.email}</div>
                        </td>
                        <td><span className="tv-time-text">{v.visit_time ? formatTo12Hour(v.visit_time) : '—'}</span></td>
                        <td><span className="tv-purpose-text" title={v.reason}>{v.reason || '—'}</span></td>
                        <td>
                          {v.arrived != 1 && v.no_show != 1 ? (
                            <div className="tv-assignment-controls">
                              <select 
                                className="tv-select" 
                                value={visitorAssign.floor}
                                onChange={(e) => handleAssignmentChange(v.id, 'floor', e.target.value)}
                              >
                                <option value="">Select Floor</option>
                                <option value="3">3rd Floor</option>
                                <option value="5">5th Floor</option>
                              </select>
                              
                              <select 
                                className="tv-select" 
                                value={visitorAssign.room}
                                onChange={(e) => handleAssignmentChange(v.id, 'room', e.target.value)}
                                disabled={!visitorAssign.floor}
                              >
                                <option value="">Select Room</option>
                                {visitorAssign.floor === '3' && FLOOR_3_ROOMS.map(room => <option key={room} value={room}>{room}</option>)}
                                {visitorAssign.floor === '5' && FLOOR_5_ROOMS.map(room => <option key={room} value={room}>{room}</option>)}
                              </select>
                              
                              <select 
                                className="tv-select" 
                                value={visitorAssign.bleId}
                                onChange={(e) => handleAssignmentChange(v.id, 'bleId', e.target.value)}
                              >
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
                              <span className="tv-assigned-room">Room: {v.destination || '—'}</span>
                              <span className="tv-assigned-tag">BLE: {displayBleId || '—'}</span>
                            </div>
                          )}
                        </td>
                        <td className="text-center">
                          {v.arrived == 1 && v.returned == 1 ? (
                            <span className="tv-badge returned">Returned</span>
                          ) : v.arrived == 1 ? (
                            <span className="tv-badge arrived">Checked In</span>
                          ) : v.no_show == 1 ? (
                            <span className="tv-badge noshow">No Show</span>
                          ) : (
                            <span className="tv-badge expected">Expected</span>
                          )}
                        </td>
                        <td className="text-right">
                          {v.arrived != 1 && v.no_show != 1 ? (
                            <div className="tv-action-group">
                              <button
                                className="btn-tv-success"
                                onClick={() => markArrived(v.id, visitorAssign.floor, visitorAssign.room, visitorAssign.bleId)}
                                disabled={availableBleTags.length === 0}
                              >
                                Check In
                              </button>
                              <button className="btn-tv-danger-outline" onClick={() => confirmNoShow(v.id)}>
                                No Show
                              </button>
                            </div>
                          ) : null}

                          {v.arrived == 1 && v.returned != 1 ? (
                            <button className="btn-tv-warning" onClick={() => confirmReturn(v.id)}>
                              Return Tag
                            </button>
                          ) : null}
                          
                          {v.returned == 1 ? <span className="tv-completed-text">Completed</span> : null}
                          {v.no_show == 1 ? <span className="tv-completed-text">Cancelled</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              
              {totalPages > 1 && (
                <div className="tv-pagination">
                  <span className="tv-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, visitors.length)} of {visitors.length} entries</span>
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
            <RefreshCw size={14} color="#0F172A" /> {tagsLoading ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>
        <div className="tv-table-wrapper" style={{ minHeight: '400px' }}>
          {tagsLoading && allBleTags.length === 0 ? (
            <div className="tv-state-box">Loading tags...</div>
          ) : allBleTags.length === 0 ? (
            <div className="tv-state-box">No BLE tags registered in the system.</div>
          ) : (
            <>
              <table className="tv-table">
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th>BLE ID</th>
                    <th>Hardware Label</th>
                    <th>MAC Address</th>
                    <th>Last Used / Assigned To</th>
                    <th className="text-center">Current Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentTags.map(tag => (
                    <tr key={tag.id}>
                      <td><strong>{tag.ble_id}</strong></td>
                      <td>{tag.label || '—'}</td>
                      <td><span className="tv-mono-text">{tag.mac_address || '—'}</span></td>
                      <td>
                        {tag.inUse ? (
                          <span className="text-red-600 font-medium" style={{ fontSize: '0.85rem' }}>
                            In use by: {tag.active_first} {tag.active_last} <br/>
                            <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                              Checked in: {tag.active_arrived_at || '—'}
                            </span>
                          </span>
                        ) : tag.last_last ? (
                          <span className="text-gray-600" style={{ fontSize: '0.85rem' }}>
                            {tag.last_first} {tag.last_last} <br/>
                            <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                              Returned: {tag.last_returned_at || '—'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-gray-400" style={{ fontSize: '0.85rem' }}>Never used</span>
                        )}
                      </td>
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
              
              {totalTagsPages > 1 && (
                <div className="tv-pagination" style={{ background: 'transparent', borderTop: 'none', padding: '1.5rem 0 0 0' }}>
                  <span className="tv-page-info">Showing {(tagsCurrentPage - 1) * tagsPerPage + 1} to {Math.min(tagsCurrentPage * tagsPerPage, allBleTags.length)} of {allBleTags.length} tags</span>
                  <div className="tv-page-controls">
                    <button onClick={() => setTagsCurrentPage(p => Math.max(1, p - 1))} disabled={tagsCurrentPage === 1} className="tv-page-btn"><ChevronLeft size={16} /> Prev</button>
                    <span className="tv-page-current">{tagsCurrentPage} / {totalTagsPages}</span>
                    <button onClick={() => setTagsCurrentPage(p => Math.min(totalTagsPages, p + 1))} disabled={tagsCurrentPage === totalTagsPages} className="tv-page-btn">Next <ChevronRight size={16} /></button>
                  </div>
                </div>
              )}
            </>
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