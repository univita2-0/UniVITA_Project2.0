// src/pages/BuildingVisitorTracking.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './BuildingVisitorTracking.css';
import useBLEPositions from '../hooks/useBLEPositions';
import { API_BASE } from '../api';
import FormalModal from '../components/FormalModal';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

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

const USE_MOCK_DATA = false;
const IMAGE_WIDTH = 250;
const IMAGE_HEIGHT = 400;

const BuildingVisitorTracking = () => {
  const [currentFloor, setCurrentFloor] = useState('3');
  const [isLive, setIsLive] = useState(true);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [visitorHistory, setVisitorHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [editingVisitor, setEditingVisitor] = useState(null);
  const [newDestination, setNewDestination] = useState('');
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  const mapRef = useRef(null);
  const markersRef = useRef({});
  const overlayRef = useRef(null);
  const mapInitializedRef = useRef(false);
  const mapBoundsRef = useRef(null);
  const prevVisitorsRef = useRef([]);
  const [toastMessage, setToastMessage] = useState(null);
  const [disconnectedVisitors, setDisconnectedVisitors] = useState([]);
  const visitorRoomStatsRef = useRef({});
  

  const { getVisitors, setVisitorDestination } = useBLEPositions(USE_MOCK_DATA);
  const visitors = getVisitors();

  const toggleMapExpand = () => {
  setIsMapExpanded(!isMapExpanded);
};

// Resize map when expanded state changes
useEffect(() => {
  if (mapRef.current) {
    // Small delay to allow DOM to update
    setTimeout(() => {
      mapRef.current.invalidateSize();
    }, 200);
  }
}, [isMapExpanded]);

  // Map initialization (unchanged)
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

  // Swap floor overlay
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

  // Draw markers
  useEffect(() => {
    if (!mapRef.current) return;
    visitors.forEach((visitor, index) => {
      if (visitor.floor !== currentFloor) {
        if (markersRef.current[visitor.id]) markersRef.current[visitor.id].setOpacity(0);
        return;
      }
      const lat = visitor.y;
      const lng = visitor.x + (index * 15); // small offset to avoid overlap
      if (lat == null || lng == null) return;

      if (markersRef.current[visitor.id]) {
        markersRef.current[visitor.id].setLatLng([lat, lng]).setOpacity(1);
      } else {
        const icon = L.divIcon({
          html: `<div style="background-color:#ef4444; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 0 0 rgba(239,68,68,0.7); animation:pulse 1.5s infinite;"></div>`,
          className: 'visitor-marker',
          iconSize: [12, 12],
          popupAnchor: [0, -8],
        });
        const marker = L.marker([lat, lng], { icon }).addTo(mapRef.current);
        marker.bindPopup(`
          <b>${visitor.name}</b><br/>
          BLE: ${visitor.bleId}<br/>
          Current room: ${visitor.currentRoom}<br/>
          Destination: ${visitor.destination}
        `, { autoPan: false });
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
    }
  };

  const openHistoryModal = () => {
    fetchVisitorHistory();
    setShowHistoryModal(true);
  };

  // Disconnect & loitering detection (unchanged)
  useEffect(() => {
    const currentVisitorIds = visitors.map(v => v.id);
    const now = Date.now();
    const IDLE_LIMIT_MS = 2 * 60 * 1000;

    prevVisitorsRef.current.forEach(prevVisitor => {
      if (!currentVisitorIds.includes(prevVisitor.id)) {
        setToastMessage({ type: 'disconnect', name: prevVisitor.name, bleId: prevVisitor.bleId, room: prevVisitor.currentRoom });
        setTimeout(() => setToastMessage(null), 6000);
        setDisconnectedVisitors(prev => {
          if (prev.some(v => v.id === prevVisitor.id)) return prev;
          return [{
            ...prevVisitor,
            disconnectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }, ...prev];
        });
        delete visitorRoomStatsRef.current[prevVisitor.id];
      }
    });

    visitors.forEach(visitor => {
      const stats = visitorRoomStatsRef.current[visitor.id];
      if (!stats || stats.room !== visitor.currentRoom) {
        visitorRoomStatsRef.current[visitor.id] = { room: visitor.currentRoom, entryTime: now, alertTriggered: false };
      } else {
        const timeInRoom = now - stats.entryTime;
        if (
          visitor.destination &&
          visitor.destination !== 'Unknown' &&
          visitor.currentRoom !== 'Unknown' &&
          visitor.currentRoom !== visitor.destination &&
          timeInRoom >= IDLE_LIMIT_MS &&
          !stats.alertTriggered
        ) {
          setToastMessage({
            type: 'security',
            name: visitor.name,
            bleId: visitor.bleId,
            room: visitor.currentRoom,
            destination: visitor.destination
          });
          setTimeout(() => setToastMessage(null), 8000);
          visitorRoomStatsRef.current[visitor.id].alertTriggered = true;
        }
      }
    });

    setDisconnectedVisitors(prev => prev.filter(v => !currentVisitorIds.includes(v.id)));
    prevVisitorsRef.current = visitors;
  }, [visitors]);

 const currentVisitors = visitors.filter(v => 
  v.floor === currentFloor && 
  v.lastSeen !== 'Disconnected' 
);
  const totalVisitors = visitors.length;
  const activeVisitors = currentVisitors.length;
  const floor3Count = visitors.filter(v => v.floor === '3').length;
  const floor5Count = visitors.filter(v => v.floor === '5').length;
  const percentage = totalVisitors ? Math.round((activeVisitors / totalVisitors) * 100) : 0;
  const availableRooms = editingVisitor
    ? (editingVisitor.floor === '3' ? thirdFloorRooms : fifthFloorRooms)
    : (currentFloor === '3' ? thirdFloorRooms : fifthFloorRooms);

  return (
    <div className="visitor-tracking-container">
      <div className="tracking-header"></div>

      {/* Stats cards (unchanged) */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-number">{totalVisitors}</div>
          <div className="stat-label">TOTAL VISITORS</div>
        </div>
        <div className="stat-card active">
          <div className="stat-number">{activeVisitors}</div>
          <div className="stat-label">ACTIVE ON FLOOR {currentFloor}</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{floor3Count + floor5Count}</div>
          <div className="stat-label">CHECKED IN</div>
        </div>
      </div>

      <div className="floor-controls">
        <div className="floor-toggles">
          <button className={`floor-btn ${currentFloor === '3' ? 'active' : ''}`} onClick={() => setCurrentFloor('3')}>
            3rd Floor <span className="count-badge">{floor3Count}</span>
          </button>
          <button className={`floor-btn ${currentFloor === '5' ? 'active' : ''}`} onClick={() => setCurrentFloor('5')}>
            5th Floor <span className="count-badge">{floor5Count}</span>
          </button>
        </div>
        <div className="action-buttons">
          {/* REMOVED: Add Visitor and BLE Tags buttons */}
          <button className={`live-btn ${isLive ? 'live' : 'paused'}`} onClick={() => setIsLive(!isLive)}>
            {isLive ? 'Live' : 'Paused'}
          </button>
          <button className="history-btn" onClick={openHistoryModal}>History</button>
        </div>
      </div>

      <div className="tracking-main">
      {/* Map Panel with expand/collapse wrapper */}
      <div className={`map-panel-wrapper ${isMapExpanded ? 'expanded' : ''}`}>
        <div id="floorMapContainer" className="map-panel"></div>
        <button className="fullscreen-btn" onClick={toggleMapExpand}>
          {isMapExpanded ? 'Exit Fullscreen' : 'Expand Map'}
        </button>
      </div>

      {/* Visitors Panel – hidden when map is expanded */}
      {!isMapExpanded && (
        <div className="visitors-panel">
          <div className="visitors-header">
            <h3>Active Visitors</h3>
            <span className="floor-badge">Floor {currentFloor}</span>
          </div>
          <div className="visitors-stats">
            <div className="visitor-count">{activeVisitors} visitor{activeVisitors !== 1 ? 's' : ''} on Floor {currentFloor}</div>
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
                <div key={visitor.id} className="visitor-card" onClick={() => openDestinationModal(visitor)}>
                  <div className="visitor-card-header">
                    <div className="visitor-avatar">{visitor.name.charAt(0).toUpperCase()}</div>
                    <div className="visitor-name">{visitor.name}</div>
                    <div className="visitor-status live"></div>
                  </div>
                  <div className="visitor-details">
                    <div className="detail-row"><span>BLE: {visitor.bleId}</span></div>
                    <div className="detail-row"><span>Current: <strong>{visitor.currentRoom}</strong></span></div>
                    <div className="detail-row"><span>Destination: <strong>{visitor.destination}</strong></span></div>
                    <div className="detail-row last-seen"><span>{visitor.lastSeen || 'Just now'}</span></div>
                  </div>
                  <div className="edit-destination-hint">Click to edit destination</div>
                </div>
              ))
            )}
          </div>

          {/* Disconnected panel (unchanged) */}
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
                      <div className="detail-row last-seen-red"><span>Signal lost at {visitor.disconnectedAt}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="legend">
            <span className="legend-item"><span className="legend-dot live"></span> Live</span>
            <span className="legend-item"><span className="legend-dot selected"></span> Selected</span>
            <span className="legend-item"><span className="legend-dot pulse"></span> Moving</span>
          </div>
        </div>
        )}
      </div>

      {/* Destination Modal */}
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

      <FormalModal
  show={showHistoryModal}
  onClose={() => setShowHistoryModal(false)}
  title="Visitor Movement History"
  size="large"
  footer={
    <button className="btn-modal-submit" onClick={() => setShowHistoryModal(false)}>Close</button>
  }
>
  {historyLoading ? (
    <div className="loading-state"><div className="spinner"></div><p>Loading history...</p></div>
  ) : visitorHistory.length === 0 ? (
    <div className="empty-state"><p>No visitor history records found.</p></div>
  ) : (
    <div className="history-list">
      {visitorHistory.map(record => (
        <div key={record.id} className="history-record">
          <div className="record-header">
            <span><strong>{record.visitor_name}</strong> ({record.ble_id})</span>
            <span className={`event-badge ${record.event_type}`}>
  {record.event_type === 'enter' ? 'Entered' : 
   record.event_type === 'move' ? 'Moved' : 
   record.event_type === 'connect' ? 'Connected' : 'Disconnected'}
</span>
          </div>
          <div className="record-details">
            <span>📍 {record.current_room || 'Unknown'}</span>
            <span>Floor {record.floor}</span>
          </div>
          <div className="timestamp">{new Date(record.timestamp).toLocaleString()}</div>
        </div>
      ))}
    </div>
  )}
</FormalModal>

      {/* Toast messages */}
      {toastMessage && (
        <div className={`custom-toast ${toastMessage.type === 'security' ? 'security-toast' : 'disconnected-toast'}`}>
          <div className="toast-icon">{toastMessage.type === 'security' ? '🚨' : '⚠️'}</div>
          <div className="toast-content">
            <h4>{toastMessage.type === 'security' ? 'Security Alert: Loitering' : 'Beacon Disconnected'}</h4>
            <p><strong>{toastMessage.name}</strong> ({toastMessage.bleId})</p>
            {toastMessage.type === 'security' ? (
              <p className="toast-subtext">Has been in <strong>{toastMessage.room}</strong> for over 2 mins.<br/>Expected destination: <strong>{toastMessage.destination}</strong></p>
            ) : (
              <p className="toast-subtext">Signal lost in {toastMessage.room}. Removed from map.</p>
            )}
          </div>
          <button className="toast-close" onClick={() => setToastMessage(null)}>&times;</button>
        </div>
      )}
    </div>
  );
};

export default BuildingVisitorTracking;