// src/hooks/useBLEPositions.js
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return { headers: { Authorization: `Bearer ${token}` } };
};

const thirdFloorRooms = [
  { name: 'Classroom', xMin: 2.1, xMax: 72.2, yMin: 93.2, yMax: 243.8 },
  { name: 'AHA Room', xMin: 72.2, xMax: 142.9, yMin: 155.4, yMax: 243.8 },
  { name: 'Private Room', xMin: 142.9, xMax: 188.2, yMin: 155.4, yMax: 243.8 },
  { name: 'Operating Room', xMin: 188.2, xMax: 233.5, yMin: 155.4, yMax: 243.8 },
  { name: 'Delivery Room', xMin: 233.5, xMax: 275.9, yMin: 156.8, yMax: 237.4 },
  { name: 'NICU', xMin: 275.9, xMax: 320.5, yMin: 156.8, yMax: 237.4 },
  { name: 'ICU', xMin: 320.5, xMax: 365.8, yMin: 156.1, yMax: 237.4 },
  { name: 'Library', xMin: 84.9, xMax: 142.9, yMin: 42.3, yMax: 155.4 },
  { name: 'Breakout Room 1', xMin: 142.9, xMax: 189.6, yMin: 40.9, yMax: 130.7 },
  { name: 'Breakout Room 2', xMin: 189.6, xMax: 232.8, yMin: 40.9, yMax: 130.7 },
  { name: 'Breakout Room 3', xMin: 232.8, xMax: 278.8, yMin: 40.9, yMax: 130.7 },
  { name: 'Faculty Room', xMin: 278.8, xMax: 323.3, yMin: 6.9, yMax: 94.6 },
  { name: 'Faculty Office', xMin: 278.8, xMax: 323.3, yMin: 6.9, yMax: 94.6 },
  { name: 'Main Entrance', xMin: 323.3, xMax: 397.6, yMin: 6.9, yMax: 94.6 },
];

const fifthFloorRooms = [
  { name: 'Lounge / IV Drip', xMin: 43.2, xMax: 88.4, yMin: 166.5, yMax: 234.3 },
  { name: 'Operating Room', xMin: 88.4, xMax: 135.8, yMin: 163.6, yMax: 233.6 },
  { name: 'Delivery Room', xMin: 137.3, xMax: 184.7, yMin: 165.0, yMax: 234.3 },
  { name: 'ICU', xMin: 184.7, xMax: 232.8, yMin: 160.8, yMax: 232.9 },
  { name: 'Educ Head', xMin: 232.8, xMax: 268.9, yMin: 197.6, yMax: 231.5 },
  { name: 'Educ. Head', xMin: 232.8, xMax: 268.9, yMin: 197.6, yMax: 231.5 },
  { name: 'Executive', xMin: 268.9, xMax: 341.7, yMin: 162.9, yMax: 231.5 },
  { name: 'Executive 1', xMin: 268.9, xMax: 303.5, yMin: 162.9, yMax: 231.5 },
  { name: 'Executive 2', xMin: 304.2, xMax: 341.7, yMin: 164.3, yMax: 232.9 },
  { name: 'Conference', xMin: 348.0, xMax: 385.0, yMin: 90.0, yMax: 162.9 },
  { name: 'Creatives', xMin: 229.9, xMax: 290.1, yMin: 97.2, yMax: 162.9 },
  { name: 'Debrief Room', xMin: 98.3, xMax: 229.2, yMin: 97.2, yMax: 149.5 },
  { name: 'Lobby', xMin: 5.7, xMax: 99.8, yMin: 97.2, yMax: 162.9 },
  { name: 'Entrance', xMin: 5.7, xMax: 80.0, yMin: 30.0, yMax: 97.2 },
  { name: 'AHA Room', xMin: 77.1, xMax: 139.4, yMin: 5.9, yMax: 75.9 },
  { name: 'ArriA Room', xMin: 77.1, xMax: 139.4, yMin: 5.9, yMax: 75.9 },
  { name: 'Classroom 1', xMin: 139.4, xMax: 208.0, yMin: 8.8, yMax: 77.4 },
  { name: 'Classroom 2', xMin: 210.1, xMax: 283.7, yMin: 4.5, yMax: 75.9 },
  { name: 'HR / Admin', xMin: 285.8, xMax: 329.0, yMin: 6.6, yMax: 75.9 },
  { name: 'HR / Admin Finance', xMin: 285.8, xMax: 329.0, yMin: 6.6, yMax: 75.9 },
  { name: 'Pantry', xMin: 329.0, xMax: 368.6, yMin: 29.3, yMax: 75.9 },
  { name: 'Toilet', xMin: 329.0, xMax: 374.3, yMin: 7.4, yMax: 30.0 },
];

const getRoomByName = (name, floor) => {
  if (!name) return null;
  const clean = String(name).trim().toLowerCase();
  const rooms = String(floor) === '3' ? thirdFloorRooms : fifthFloorRooms;
  return rooms.find(r => r.name.toLowerCase() === clean || r.name.toLowerCase().includes(clean));
};

const getRoomCenter = (room) => {
  if (!room) return { x: 200, y: 125 };
  return { x: (room.xMin + room.xMax) / 2, y: (room.yMin + room.yMax) / 2 };
};

export default function useBLEPositions() {
  const [positions, setPositions] = useState({});
  const [visitorMeta, setVisitorMeta] = useState({});
  const httpIntervalRef = useRef(null);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/positions`);
      const data = await res.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        setPositions({});
        setVisitorMeta({});
        return;
      }

      const nextPositions = {};
      const nextMeta = {};

      data.forEach(v => {
        const id = String(v.id || v.bleId);
        const roomObj = getRoomByName(v.currentRoom, v.floor);
        const center = getRoomCenter(roomObj);
        
        const posX = typeof v.x === 'number' && v.x > 0 ? v.x : center.x;
        const posY = typeof v.y === 'number' && v.y > 0 ? v.y : center.y;

        nextPositions[id] = { x: posX, y: posY };
        nextMeta[id] = {
          id,
          name: v.name || 'Visitor',
          floor: String(v.floor || '3'),
          bleId: v.bleId || id,
          currentRoom: v.currentRoom || 'Unknown',
          destination: v.destination || v.currentRoom || 'Unknown',
          lastSeen: v.lastSeen ? new Date(v.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now'
        };
      });

      setPositions(nextPositions);
      setVisitorMeta(nextMeta);

    } catch (err) {
      console.error('BLE polling error:', err);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
    httpIntervalRef.current = setInterval(fetchPositions, 2000);
    return () => clearInterval(httpIntervalRef.current);
  }, [fetchPositions]);

  // Synchronize destination edits to backend API
  const setVisitorDestination = useCallback(async (visitorId, newDest) => {
    try {
      setVisitorMeta(prev => {
        if (!prev[visitorId]) return prev;
        return { ...prev, [visitorId]: { ...prev[visitorId], destination: newDest } };
      });

      await axios.put(
        `${API_BASE}/visitor-requests/${visitorId}/destination`,
        { destination: newDest, ble_id: visitorId },
        getAuthHeaders()
      );
    } catch (err) {
      console.error('Failed to update visitor destination:', err);
    }
  }, []);

  const visitors = useMemo(() => {
    return Object.keys(visitorMeta).map(id => ({
      ...visitorMeta[id],
      x: positions[id]?.x || 0,
      y: positions[id]?.y || 0,
    }));
  }, [visitorMeta, positions]);

  return { visitors, setVisitorDestination };
}