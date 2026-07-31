import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../api';

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

const getRoomByName = (name, floor) => {
  const rooms = floor === '3' ? thirdFloorRooms : fifthFloorRooms;
  return rooms.find(r => r.name === name);
};

const getRoomCenter = (room) => {
  if (!room) return { x: 50, y: 50 };
  return { x: (room.xMin + room.xMax) / 2, y: (room.yMin + room.yMax) / 2 };
};

export default function useBLEPositions() {
  const [positions, setPositions] = useState({});
  const [visitorMeta, setVisitorMeta] = useState({});
  const httpIntervalRef = useRef(null);

  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const res = await fetch(`${API_BASE}/positions`);
        const visitors = await res.json();
        
        // Fix: If no data returned, explicitly clear the states
        if (!visitors || visitors.length === 0) {
          setPositions({});
          setVisitorMeta({});
          return;
        }

        const nextPositions = {};
        const nextMeta = {};

        visitors.forEach(data => {
          const id = String(data.id);
          const roomObj = getRoomByName(data.currentRoom, data.floor);
          const center = getRoomCenter(roomObj);
          
          nextPositions[id] = { x: center.x, y: center.y };
          nextMeta[id] = {
            id,
            name: data.name || 'Visitor',
            floor: data.floor,
            bleId: data.bleId || '',
            currentRoom: data.currentRoom || 'Unknown',
            destination: data.destination || data.currentRoom || '',
            lastSeen: 'Just now'
          };
        });

        // Fix: Replace state entirely instead of merging
        setPositions(nextPositions);
        setVisitorMeta(nextMeta);

      } catch (err) {
        console.error('HTTP polling error:', err);
      }
    };

    httpIntervalRef.current = setInterval(fetchPositions, 2000);
    fetchPositions();

    return () => clearInterval(httpIntervalRef.current);
  }, []);

  const setVisitorDestination = useCallback((visitorId, newDest) => {
    setVisitorMeta(prev => {
      if (!prev[visitorId]) return prev;
      return { ...prev, [visitorId]: { ...prev[visitorId], destination: newDest } };
    });
  }, []);

  const getVisitors = useCallback(() => {
    return Object.keys(visitorMeta).map(id => ({
      ...visitorMeta[id],
      x: positions[id]?.x || 0,
      y: positions[id]?.y || 0,
    }));
  }, [visitorMeta, positions]);

  return { positions, visitorMeta, getVisitors, setVisitorDestination };
}