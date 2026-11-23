// src/pages/BuildingVisitorTracking.jsx
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'react-toastify';
import './BuildingVisitorTracking.css';
import useBLEPositions from '../hooks/useBLEPositions';
import { API_BASE } from '../api';
import FormalModal from '../components/FormalModal';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

// Construct popup content through text nodes; never interpolate visitor input into HTML.
const createVisitorPopup = (visitor) => {
  const element = document.createElement('div');
  const fields = [
    ['Visitor', visitor.name],
    ['BLE', visitor.bleId],
    ['Confirmed room', visitor.currentRoom],
    ['Destination', visitor.destination]
  ];
  fields.forEach(([label, value]) => {
    const line = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    line.appendChild(strong);
    line.appendChild(document.createTextNode(String(value ?? '—')));
    element.appendChild(line);
  });
  return element;
};

// 🟢 FIXED: Added the missing room arrays
const thirdFloorRooms = [
  { name: 'Classroom', xMin: 2.1, xMax: 72.2, yMin: 93.2, yMax: 243.8 },
  { name: 'AHA Room', xMin: 164.9, xMax: 164.9, yMin: 291.9, yMax: 291.9 },
  { name: 'Private Room', xMin: 188.2, xMax: 188.2, yMin: 157.5, yMax: 157.5 },
  { name: 'Delivery Room', xMin: 233.5, xMax: 275.9, yMin: 156.8, yMax: 237.4 },
  { name: 'NICU', xMin: 320.5, xMax: 321.2, yMin: 157.5, yMax: 159.0 },
  { name: 'ICU', xMin: 365.8, xMax: 365.8, yMin: 156.1, yMax: 156.1 },
  { name: 'Library', xMin: 84.9, xMax: 142.9, yMin: 42.3, yMax: 155.4 },
  { name: 'Breakout Room 1', xMin: 190.3, xMax: 190.3, yMin: 40.9, yMax: 40.9 },
  { name: 'Breakout Room 2', xMin: 189.6, xMax: 232.1, yMin: 40.9, yMax: 128.6 },
  { name: 'Breakout Room 3', xMin: 232.8, xMax: 278.8, yMin: 40.9, yMax: 130.7 },
  { name: 'Faculty Office', xMin: 321.2, xMax: 321.2, yMin: 6.9, yMax: 6.9 },
  { name: 'Main Entrance', xMin: 323.3, xMax: 397.6, yMin: 6.9, yMax: 94.6 },
];

const fifthFloorRooms = [
  { name: 'Lounge / IV Drip', xMin: 43.2, xMax: 88.4, yMin: 166.5, yMax: 234.3 },
  { name: 'Operating Room', xMin: 88.4, xMax: 135.8, yMin: 163.6, yMax: 233.6 },
  { name: 'Delivery Room', xMin: 137.3, xMax: 184.7, yMin: 165.0, yMax: 234.3 },
  { name: 'ICU', xMin: 184.7, xMax: 232.8, yMin: 160.8, yMax: 232.9 },
  { name: 'Educ. Head', xMin: 232.8, xMax: 266.7, yMin: 197.6, yMax: 231.5 },
  { name: 'Executive 1', xMin: 268.9, xMax: 303.5, yMin: 162.9, yMax: 231.5 },
  { name: 'Executive 2', xMin: 304.2, xMax: 341.7, yMin: 164.3, yMax: 232.9 },
  { name: 'Creatives', xMin: 229.9, xMax: 290.1, yMin: 119.8, yMax: 162.9 },
  { name: 'Debrief Room', xMin: 98.3, xMax: 229.2, yMin: 97.2, yMax: 149.5 },
  { name: 'Main El', xMin: 5.7, xMax: 99.8, yMin: 101.4, yMax: 162.9 },
  { name: 'ArriA Room', xMin: 77.1, xMax: 139.4, yMin: 5.9, yMax: 75.9 },
  { name: 'Classroom 1', xMin: 139.4, xMax: 208.0, yMin: 8.8, yMax: 77.4 },
  { name: 'Classroom 2', xMin: 210.1, xMax: 283.7, yMin: 4.5, yMax: 75.9 },
  { name: 'HR / Admin Finance', xMin: 285.8, xMax: 329.0, yMin: 6.6, yMax: 75.9 },
  { name: 'Pantry', xMin: 329.0, xMax: 368.6, yMin: 29.3, yMax: 75.9 },
  { name: 'Toilet', xMin: 329.0, xMax: 374.3, yMin: 7.4, yMax: 30.0 },
];

const IMAGE_WIDTH = 250;
const IMAGE_HEIGHT = 400;

const BuildingVisitorTracking = () => {
  const [currentFloor, setCurrentFloor] = useState('3');
  const [activeTab, setActiveTab] = useState('live');
  const [reviewEvents, setReviewEvents] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewEdits, setReviewEdits] = useState({});
  const [savingReviewId, setSavingReviewId] = useState(null);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('all');
  const [visitorHistory, setVisitorHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasLoaded, setHistoryHasLoaded] = useState(false);
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [editingVisitor, setEditingVisitor] = useState(null);
  const [newDestination, setNewDestination] = useState('');
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const historyRowsPerPage = 10;

  const mapRef = useRef(null);
  const markersRef = useRef({});
  const overlayRef = useRef(null);
  const mapInitializedRef = useRef(false);
  const mapBoundsRef = useRef(null);
  const prevVisitorsRef = useRef([]);
  const [disconnectedVisitors, setDisconnectedVisitors] = useState([]);

  const { visitors, setVisitorDestination } = useBLEPositions();

  const toggleMapExpand = () => setIsMapExpanded(!isMapExpanded);

  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => mapRef.current.invalidateSize(), 200);
    }
  }, [isMapExpanded]);

  useEffect(() => {
    if (mapInitializedRef.current) return;
    const container = document.getElementById('floorMapContainer');
    if (!container) return;

    const map = L.map('floorMapContainer', {
      crs: L.CRS.Simple,
      minZoom: 0.5,
      maxZoom: 3,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      zoomControl: true,
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
      trackResize: false,
    });

    const bounds = L.latLngBounds([0, 0], [IMAGE_WIDTH, IMAGE_HEIGHT]);
    mapBoundsRef.current = bounds;
    map.setView([IMAGE_HEIGHT / 2, IMAGE_WIDTH / 2], 1, { animate: false });
    map.setMaxBounds(bounds);
    map.fitBounds(bounds, { animate: false });
    mapRef.current = map;
    mapInitializedRef.current = true;

    return () => {
      if (mapRef.current) {
        mapRef.current.stop();
        mapRef.current.off();
        mapRef.current.remove();
        mapRef.current = null;
      }
      mapInitializedRef.current = false;
      Object.values(markersRef.current).forEach(marker => marker.remove());
      markersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapBoundsRef.current) return;
    const map = mapRef.current;
    const bounds = mapBoundsRef.current;
    const newImageUrl = currentFloor === '5' ? '/5th floor.png' : '/3rd floor.png';
    if (overlayRef.current) map.removeLayer(overlayRef.current);
    const newOverlay = L.imageOverlay(newImageUrl, bounds).addTo(map);
    overlayRef.current = newOverlay;
    Object.values(markersRef.current).forEach(marker => marker.setOpacity(0));
  }, [currentFloor]);

  useEffect(() => {
    if (!mapRef.current) return;
    
    const roomCounts = {};

    visitors.forEach((visitor) => {
      if (visitor.floor !== currentFloor || visitor.isDisconnected || visitor.isPendingDetection) {
        if (markersRef.current[visitor.id]) markersRef.current[visitor.id].setOpacity(0);
        return;
      }

      const roomKey = `${visitor.floor}-${visitor.currentRoom}`;
      if (!roomCounts[roomKey]) roomCounts[roomKey] = 0;
      
      // Do not turn missing coordinates into x=0 by adding a numeric offset.
      const x = visitor.x == null ? NaN : Number(visitor.x);
      const y = visitor.y == null ? NaN : Number(visitor.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        if (markersRef.current[visitor.id]) markersRef.current[visitor.id].setOpacity(0);
        return;
      }
      const lat = y;
      const lng = x + (roomCounts[roomKey] * 6);
      roomCounts[roomKey]++;

      if (markersRef.current[visitor.id]) {
        markersRef.current[visitor.id]
          .setLatLng([lat, lng])
          .setOpacity(1)
          .setPopupContent(createVisitorPopup(visitor));
      } else {
        const icon = L.divIcon({
          html: `<div style="background-color:#ef4444; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 0 0 rgba(239,68,68,0.7); animation:pulse 1.5s infinite;"></div>`,
          className: 'visitor-marker',
          iconSize: [12, 12],
          popupAnchor: [0, -8],
        });
        const marker = L.marker([lat, lng], { icon }).addTo(mapRef.current);
        marker.bindPopup(createVisitorPopup(visitor), { autoPan: false });
        markersRef.current[visitor.id] = marker;
      }
    });
    
    Object.keys(markersRef.current).forEach(id => {
      if (!visitors.some(v => v.id === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });
  }, [visitors, currentFloor]);

  const openDestinationModal = (visitor) => {
    setEditingVisitor(visitor);
    setNewDestination(visitor.destination);
    setShowDestinationModal(true);
  };

  const saveDestination = () => {
    if (!editingVisitor) return;
    setVisitorDestination(editingVisitor.id, newDestination);
    setShowDestinationModal(false);
    setEditingVisitor(null);
  };

  const fetchVisitorHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/visitor-history`, getAuthHeaders());
      setVisitorHistory(res.data);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
      setHistoryHasLoaded(true);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') fetchVisitorHistory();
  }, [activeTab]);

  const openHistoryModal = () => {
    setHistorySearchTerm('');
    setHistoryDateFilter('');
    setHistoryCurrentPage(1);
    setActiveTab('history');
  };

  const fetchReviews = async () => {
    setReviewLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/visitor-event-reviews`, getAuthHeaders());
      setReviewEvents(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Failed to load event reviews:', error);
      toast.error('Unable to load security event reviews.');
    } finally {
      setReviewLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reviews') fetchReviews();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'live' && mapRef.current) {
      const timer = setTimeout(() => mapRef.current?.invalidateSize(), 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  const saveReview = async (event) => {
    const edit = reviewEdits[event.id] || {};
    const status = edit.status ?? (event.review?.status === 'pending_review'
      ? 'under_review' : event.review?.status) ?? 'under_review';
    const notes = (edit.notes ?? event.review?.notes ?? '').trim();
    if (notes.length < 10 || notes.length > 1000) {
      toast.error('Investigation notes must be 10–1000 characters.');
      return;
    }
    setSavingReviewId(event.id);
    try {
      await axios.put(`${API_BASE}/visitor-event-reviews/${event.id}`, { status, notes }, getAuthHeaders());
      toast.success('Security review decision saved.');
      setReviewEdits(previous => { const next = { ...previous }; delete next[event.id]; return next; });
      await fetchReviews();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save review decision.');
    } finally {
      setSavingReviewId(null);
    }
  };

  const filteredReviewEvents = reviewEvents.filter(event => {
    const status = event.review?.status || 'pending_review';
    const keyword = reviewSearch.trim().toLowerCase();
    return (reviewStatusFilter === 'all' || reviewStatusFilter === status) &&
      (!keyword || [event.visitor_name, event.ble_id, event.current_room, event.event_type]
        .some(value => String(value || '').toLowerCase().includes(keyword)));
  });

  const filteredHistory = visitorHistory.filter(item => {
    const matchesSearch =
      (item.visitor_name && item.visitor_name.toLowerCase().includes(historySearchTerm.toLowerCase())) ||
      (item.ble_id && item.ble_id.toLowerCase().includes(historySearchTerm.toLowerCase())) ||
      (item.current_room && item.current_room.toLowerCase().includes(historySearchTerm.toLowerCase()));

    let matchesDate = true;
    if (historyDateFilter) {
      let safeStamp = item.timestamp;
      if (typeof safeStamp === 'string' && safeStamp.includes(' ') && !safeStamp.includes('T')) {
        safeStamp = safeStamp.replace(' ', 'T') + 'Z';
      }
      const itemDateObj = new Date(safeStamp);
      if (!isNaN(itemDateObj.getTime())) {
        const itemDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(itemDateObj);
        matchesDate = itemDateStr === historyDateFilter;
      } else {
        matchesDate = false;
      }
    }
    return matchesSearch && matchesDate;
  });

  const historyTotalPages = Math.ceil(filteredHistory.length / historyRowsPerPage) || 1;
  const historyStartIndex = (historyCurrentPage - 1) * historyRowsPerPage;
  const currentHistoryData = filteredHistory.slice(historyStartIndex, historyStartIndex + historyRowsPerPage);

  // V02: Alerts are derived from explicit backend tracking transitions.
  // A visitor disappearing from this page does NOT imply a lost BLE signal.
  useEffect(() => {
    const previous = new Map(prevVisitorsRef.current.map(v => [v.id, v]));

    for (const visitor of visitors) {
      const prior = previous.get(visitor.id);
      if (!prior) continue; // Ignore initial hydration.

      if (!prior.isDisconnected && visitor.trackingStatus === 'signal_lost') {
        toast.warning(
          `${visitor.name}: BLE signal lost. Last confirmed room: ${visitor.currentRoom}.`,
          { toastId: `signal-lost-${visitor.id}`, autoClose: 6000 }
        );
      }
      if (prior.isDisconnected && visitor.trackingStatus === 'active') {
        toast.info(`${visitor.name}: BLE signal restored.`,
          { toastId: `signal-restored-${visitor.id}`, autoClose: 5000 });
      }
      if (!prior.loiterAlertSent && visitor.loiterAlertSent &&
          visitor.trackingStatus === 'active') {
        toast.warning(
          `${visitor.name}: unexpected room stay requires review (${visitor.currentRoom}).`,
          { toastId: `room-review-${visitor.id}-${visitor.currentRoom}`, autoClose: 7000 }
        );
      }
    }

    setDisconnectedVisitors(visitors.filter(v => v.trackingStatus === 'signal_lost'));
    prevVisitorsRef.current = visitors;
  }, [visitors]);

  const currentVisitors = visitors.filter(v =>
    v.floor === currentFloor && v.trackingStatus === 'active'
  );
  
  const totalVisitors = visitors.length;
  const activeVisitors = currentVisitors.length;
  const floor3Count = visitors.filter(v => v.floor === '3').length;
  const floor5Count = visitors.filter(v => v.floor === '5').length;
  const percentage = totalVisitors ? Math.round((activeVisitors / totalVisitors) * 100) : 0;
  const awaitingVisitors = visitors.filter(v => v.trackingStatus === 'awaiting_detection').length;
  const globallyActiveVisitors = visitors.filter(v => v.trackingStatus === 'active').length;
  const pendingReviews = reviewEvents.filter(e => (e.review?.status || 'pending_review') === 'pending_review').length;
  const availableRooms = editingVisitor
    ? (editingVisitor.floor === '3' ? thirdFloorRooms : fifthFloorRooms)
    : (currentFloor === '3' ? thirdFloorRooms : fifthFloorRooms);

  return (
    <div className="visitor-tracking-container">
      <header className="tracking-header">
        <div className="tracking-heading">
          
          <p className="subtitle">Monitor visitor locations, review recorded movements, and assess security observations.</p>
        </div>
        <div className="uv-tracking-indicator" role="status"><span className="uv-tracking-dot" /> BLE tracking overview</div>
      </header>

      <nav className="v03-tabs" aria-label="Visitor tracking views">
        <button type="button" className={activeTab === 'live' ? 'selected' : ''} aria-current={activeTab === 'live' ? 'page' : undefined} onClick={() => setActiveTab('live')}> Live Tracking</button>
        <button type="button" className={activeTab === 'history' ? 'selected' : ''} aria-current={activeTab === 'history' ? 'page' : undefined} onClick={openHistoryModal}> Tracking History</button>
        <button type="button" className={activeTab === 'reviews' ? 'selected' : ''} aria-current={activeTab === 'reviews' ? 'page' : undefined} onClick={() => setActiveTab('reviews')}> Event Reviews {activeTab === 'reviews' && pendingReviews > 0 && <span className="v03-tab-count">{pendingReviews}</span>}</button>
      </nav>
      <div style={{ display: activeTab === 'live' ? undefined : 'none' }}>
      <section className="stats-row" aria-label="Tracking summary">
        <div className="stat-card"><div className="stat-meta"><span>Checked-in visitors</span></div><div className="stat-number">{totalVisitors}</div></div>
        <div className="stat-card active"><div className="stat-meta"><span>Actively detected</span></div><div className="stat-number">{globallyActiveVisitors}</div></div>
        <div className="stat-card"><div className="stat-meta"><span>Awaiting first scan</span></div><div className="stat-number">{awaitingVisitors}</div></div>
        <div className="stat-card warning"><div className="stat-meta"><span>Signal interruptions</span></div><div className="stat-number">{disconnectedVisitors.length}</div></div>
      </section>

      <div className="floor-controls">
        <div className="floor-toolbar-title"><div><strong>Facility floor plan</strong><span>Select a floor to view confirmed visitor positions</span></div></div>
        <div className="floor-toolbar-actions">
          <div className="floor-toggles" aria-label="Choose facility floor">
            <button type="button" className={`floor-btn ${currentFloor === '3' ? 'active' : ''}`} aria-pressed={currentFloor === '3'} onClick={() => setCurrentFloor('3')}>Floor 3 <span className="count-badge">{floor3Count}</span></button>
            <button type="button" className={`floor-btn ${currentFloor === '5' ? 'active' : ''}`} aria-pressed={currentFloor === '5'} onClick={() => setCurrentFloor('5')}>Floor 5 <span className="count-badge">{floor5Count}</span></button>
          </div>
          
        </div>
      </div>

      <div className="tracking-main">
        <div className={`map-panel-wrapper ${isMapExpanded ? 'expanded' : ''}`}>
          <div className="map-panel-label"> Floor {currentFloor} · Confirmed positions</div>
          <div id="floorMapContainer" className="map-panel"></div>
          <button type="button" className="fullscreen-btn" onClick={toggleMapExpand}>
            
            {isMapExpanded ? 'Close expanded view' : 'Expand floor plan'}
          </button>
        </div>

        {!isMapExpanded && (
          <div className="visitors-panel">
            <div className="visitors-header">
              <h3>Visitors on this floor</h3>
              <span className="floor-badge">Floor {currentFloor}</span>
            </div>
            <div className="visitors-stats">
              <div className="visitor-count"><strong>{activeVisitors}</strong> actively detected on Floor {currentFloor}</div>
              <div className="percentage-bar"><div className="percentage-fill" style={{ width: `${percentage}%` }}></div></div>
              <div className="percentage-label">{percentage}% of total</div>
            </div>
            <div className="visitors-list">
              {currentVisitors.length === 0 ? (
                <div className="no-visitors">
                  <p>No active visitors on this floor.</p>
                  <p className="empty-hint">Switch floors or check BLE connection.</p>
                </div>
              ) : (
                currentVisitors.map(visitor => (
                  <button type="button" key={visitor.id} className="visitor-card" onClick={() => openDestinationModal(visitor)} aria-label={`Edit destination for ${visitor.name}`}>
                    <div className="visitor-card-header">
                      <div className="visitor-avatar">{visitor.name.charAt(0).toUpperCase()}</div>
                      <div className="visitor-name">{visitor.name}</div>
                      <span className="visitor-live-tag"><span className="visitor-status live"/> Active</span>
                    </div>
                    <div className="visitor-details">
                      <div className="detail-row"><span>BLE: {visitor.bleId}</span></div>
                      <div className="detail-row">
                        {visitor.isDisconnected ? (
                          <span style={{ color: '#DC2626' }}>Last Known: <strong>{visitor.currentRoom}</strong></span>
                        ) : (
                          <span>Current: <strong>{visitor.currentRoom}</strong></span>
                        )}
                      </div>
                      <div className="detail-row"><span>Destination: <strong>{visitor.destination}</strong></span></div>
                      <div className="detail-row last-seen">
                        <span style={{ color: visitor.isDisconnected ? '#DC2626' : 'inherit', fontWeight: visitor.isDisconnected ? '500' : 'normal' }}>
                          {visitor.isPendingDetection 
                            ? 'Awaiting scanner...' 
                            : visitor.isDisconnected
                              ? `Signal Lost at: ${(typeof visitor.disconnectedAt === 'number' ? new Date(visitor.disconnectedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : visitor.disconnectedAt) || (typeof visitor.lastSeen === 'number' ? new Date(visitor.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown')}`
                              : typeof visitor.lastSeen === 'number' 
                                ? new Date(visitor.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
                                : (visitor.lastSeen || 'No scan recorded')}
                        </span>
                      </div>
                    </div>
                    <div className="edit-destination-hint">Manage destination </div>
                  </button>
                ))
              )}
            </div>

            {disconnectedVisitors.length > 0 && (
              <div className="disconnected-panel">
                <div className="visitors-header disconnected-header">
                  <h3>Disconnected</h3>
                  <span className="count-badge offline-badge">{disconnectedVisitors.length}</span>
                </div>
                <div className="visitors-list">
                  {disconnectedVisitors.map(visitor => (
                    <div key={visitor.id} className="visitor-card offline-card">
                      <div className="visitor-card-header">
                        <div className="visitor-avatar offline-avatar">{visitor.name.charAt(0).toUpperCase()}</div>
                        <div className="visitor-name offline-text">{visitor.name}</div>
                        <div className="visitor-status offline-dot"></div>
                      </div>
                      <div className="visitor-details">
                        <div className="detail-row"><span className="offline-text">BLE: {visitor.bleId}</span></div>
                        <div className="detail-row"><span className="offline-text">Last Seen: <strong>{visitor.currentRoom}</strong></span></div>
                        <div className="detail-row last-seen-red"><span>Signal lost at {typeof visitor.disconnectedAt === 'number' ? new Date(visitor.disconnectedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : (visitor.disconnectedAt || 'Unknown')}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="legend"><span className="legend-item"><span className="legend-dot live" /> Confirmed active position</span><span className="legend-item"><span className="legend-dot offline-dot" /> Signal lost</span></div>
          </div>
        )}
      </div>

      </div>

      <FormalModal
        show={showDestinationModal}
        onClose={() => setShowDestinationModal(false)}
        title="Edit Destination"
        footer={
          <>
            <button className="btn-modal-cancel" onClick={() => setShowDestinationModal(false)}>Cancel</button>
            <button className="btn-modal-submit" onClick={saveDestination}>Save Destination</button>
          </>
        }
      >
        {editingVisitor && (
          <>
            <div className="visitor-info-card">
              <div className="visitor-avatar-large">{editingVisitor.name.charAt(0).toUpperCase()}</div>
              <div>
                <p className="visitor-info-name">{editingVisitor.name}</p>
                <p className="visitor-info-floor">Floor {editingVisitor.floor === '3' ? '3rd' : '5th'} - {editingVisitor.bleId}</p>
              </div>
            </div>
            <div className="modal-form-group">
              <label className="modal-label">Select destination room:</label>
              <select value={newDestination} onChange={(e) => setNewDestination(e.target.value)} className="modal-select destination-select">
                {availableRooms.map(room => (<option key={room.name} value={room.name}>{room.name}</option>))}
              </select>
            </div>
          </>
        )}
      </FormalModal>

      {activeTab === 'history' && (
        <section className="v03-panel" aria-label="Visitor movement history">
          <div className="v03-toolbar">
            <div><div className="v03-section-kicker"> MONITORING RECORDS</div></div>
            <button type="button" className="v03-refresh" onClick={fetchVisitorHistory} disabled={historyLoading}> Refresh</button>
          </div>
        <div className="history-modal-toolbar">
          <div className="history-search-box">
            
            <input
              type="text"
              placeholder="Search visitor name, BLE tag, or room..."
              value={historySearchTerm}
              onChange={(e) => { setHistorySearchTerm(e.target.value); setHistoryCurrentPage(1); }}
            />
          </div>
          
          <div className="history-date-filter">
            <label htmlFor="visitor-history-date">Date</label>
            <input
              type="date"
              id="visitor-history-date"
              value={historyDateFilter}
              onChange={(e) => { setHistoryDateFilter(e.target.value); setHistoryCurrentPage(1); }}
            />
            {historyDateFilter && (
              <button 
                onClick={() => { setHistoryDateFilter(''); setHistoryCurrentPage(1); }}
                className="history-clear-date"
                title="Clear Date Filter"
                aria-label="Clear history date filter"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {historyLoading && !historyHasLoaded ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading history logs...</p>
          </div>
        ) : currentHistoryData.length === 0 ? (
          <div className="empty-state">
            <p>No visitor history records found matching your filters.</p>
          </div>
        ) : (
          <>
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Visitor Details</th>
                    <th>Event Action</th>
                    <th>Location / Room</th>
                  </tr>
                </thead>
                <tbody>
                  {currentHistoryData.map((record, index) => {
                    let badgeStyle = { backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' };
                    let eventLabel = record.event_type;
                    
                    if (record.event_type === 'connect' || record.event_type === 'enter') {
                      badgeStyle = { backgroundColor: '#DEF7EC', color: '#03543F', border: '1px solid #84E1BC' };
                      eventLabel = record.event_type === 'connect' ? 'Connected / Detected' : 'Entered Campus';
                    } else if (record.event_type === 'signal_lost') {
                      badgeStyle = { backgroundColor: '#FDE8E8', color: '#9B1C1C', border: '1px solid #F8B4B4' };
                      eventLabel = 'BLE Signal Lost';
                    } else if (record.event_type === 'signal_restored') {
                      badgeStyle = { backgroundColor: '#DEF7EC', color: '#03543F', border: '1px solid #84E1BC' };
                      eventLabel = 'BLE Signal Restored';
                    } else if (record.event_type === 'checkout') {
                      badgeStyle = { backgroundColor: '#E1EFFE', color: '#1E429F', border: '1px solid #A4CAFE' };
                      eventLabel = 'Visitor Checked Out / Tag Returned';
                    } else if (record.event_type === 'disconnect' || record.event_type === 'Exit / Returned') {
                      badgeStyle = { backgroundColor: '#FDE8E8', color: '#9B1C1C', border: '1px solid #F8B4B4' };
                      eventLabel = 'Disconnect (Unclassified)';
                    } else if (record.event_type === 'move') {
                      badgeStyle = { backgroundColor: '#E1EFFE', color: '#1E429F', border: '1px solid #A4CAFE' };
                      eventLabel = 'Moved Location';
                    } else if (record.event_type && record.event_type.toLowerCase().includes('loitering')) {
                      badgeStyle = { backgroundColor: '#FEECDC', color: '#8A2C0D', border: '1px solid #FDBA8C' };
                      eventLabel = 'Unexpected Room Stay — Review';
                    }

                    return (
                      <tr key={record.id}>
                        <td className="history-timestamp">
                          {String(record.timestamp || '—')}
                        </td>
                        <td>
                          <div className="history-visitor-name">{record.visitor_name}</div>
                          <div className="history-visitor-tag">TAG: {record.ble_id}</div>
                        </td>
                        <td>
                          <span className="history-event-badge" style={badgeStyle}>{eventLabel}</span>
                        </td>
                        <td>
                          <div className="history-room">{record.current_room ? record.current_room : 'Unknown Location'}</div>
                          {record.floor && <div className="history-floor">Floor {record.floor}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {historyTotalPages > 1 && (
              <div className="history-pagination">
                <span className="history-page-info">
                  Showing {historyStartIndex + 1} to {Math.min(historyStartIndex + historyRowsPerPage, filteredHistory.length)} of {filteredHistory.length} logs
                </span>
                <div className="history-page-controls">
                  <button
                    className="history-page-btn"
                    disabled={historyCurrentPage === 1}
                    aria-label="Previous history page"
                    onClick={() => setHistoryCurrentPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="history-page-current">
                    Page {historyCurrentPage} of {historyTotalPages}
                  </span>
                  <button
                    className="history-page-btn"
                    disabled={historyCurrentPage === historyTotalPages}
                    aria-label="Next history page"
                    onClick={() => setHistoryCurrentPage(p => Math.min(historyTotalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </section>
      )}

      {activeTab === 'reviews' && (
        <section className="v03-panel" aria-label="Security event review queue">
          <div className="v03-toolbar">
            <div><div className="v03-section-kicker"> SECURITY ASSESSMENT</div></div>
            <button type="button" className="v03-refresh" onClick={fetchReviews} disabled={reviewLoading}> Refresh</button>
          </div>
          <div className="v03-review-overview"><div><strong>{reviewEvents.length}</strong><span>Reviewable observations</span></div><div><strong>{pendingReviews}</strong><span>Pending assessment</span></div><div><strong>{reviewEvents.filter(e => e.review?.status === 'under_review').length}</strong><span>Under investigation</span></div></div>
          <div className="v03-filters">
            <input aria-label="Search reviews" placeholder="Search visitor, tag, or room" value={reviewSearch}
              onChange={event => setReviewSearch(event.target.value)} />
            <select aria-label="Filter review status" value={reviewStatusFilter}
              onChange={event => setReviewStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending_review">Pending review</option>
              <option value="under_review">Under review</option>
              <option value="dismissed">No confirmed incident</option>
              <option value="confirmed_incident">Confirmed incident</option>
            </select>
          </div>
          {reviewLoading ? <p>Loading review queue...</p> : filteredReviewEvents.length === 0 ? (
            <p>No matching reviewable observations found.</p>
          ) : (
            <div className="v03-review-grid">
              {filteredReviewEvents.map(event => {
                const edit = reviewEdits[event.id] || {};
                const status = edit.status ?? (event.review?.status === 'pending_review'
                  ? 'under_review' : event.review?.status) ?? 'under_review';
                const notes = edit.notes ?? event.review?.notes ?? '';
                return (
                  <article key={event.id} className="v03-review-card">
                    <div className="v03-review-heading"><div><span className="v03-review-ref">EVENT #{event.id}</span><h3>{event.visitor_name || 'Unknown visitor'}</h3></div><span className={`v03-event-type ${event.event_type === 'signal_lost' ? 'signal' : 'room'}`}>{event.event_type === 'signal_lost' ? 'Signal interruption' : 'Unexpected room stay'}</span></div>
                    <div className="v03-event-meta"><span> {event.ble_id || 'Unknown tag'}</span><span> Floor {event.floor || '—'} · {event.current_room || 'Unknown room'}</span><span> {event.timestamp || '—'} PHT</span></div>
                    <div className="v03-current-decision"><span>Current review status</span><strong className={`v03-decision-${event.review?.status || 'pending_review'}`}>{event.review?.status === 'pending_review' ? 'Pending review'
                      : event.review?.status === 'confirmed_incident' ? 'Confirmed incident'
                      : event.review?.status === 'dismissed' ? 'No confirmed incident'
                      : 'Under review'}</strong></div>
                    {event.review?.reviewedAt && (
                      <p>Last reviewed by {event.review.reviewedBy || 'Authorized user'} on {event.review.reviewedAt}</p>
                    )}
                    <div className="v03-review-form"><label htmlFor={`v03-status-${event.id}`}>Review decision</label>
                    <select id={`v03-status-${event.id}`} value={status}
                      onChange={e => setReviewEdits(previous => ({
                        ...previous, [event.id]: { ...previous[event.id], status: e.target.value }
                      }))}>
                      <option value="under_review">Under Review</option>
                      <option value="dismissed">No Confirmed Incident</option>
                      <option value="confirmed_incident">Confirmed Incident</option>
                    </select>
                    <label htmlFor={`v03-notes-${event.id}`}>Investigation notes (10–1000 characters)</label>
                    <textarea id={`v03-notes-${event.id}`} rows={3} maxLength={1000} value={notes}
                      onChange={e => setReviewEdits(previous => ({
                        ...previous, [event.id]: { ...previous[event.id], notes: e.target.value }
                      }))} placeholder="Record checks performed and findings." />
                    <div className="v03-review-actions"><span>{notes.trim().length}/1000 characters</span><button type="button" disabled={savingReviewId !== null || notes.trim().length < 10}
                      onClick={() => saveReview(event)}> {savingReviewId === event.id ? 'Saving...' : 'Save review decision'}</button></div></div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default BuildingVisitorTracking;