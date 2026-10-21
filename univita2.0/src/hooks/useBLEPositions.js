// src/hooks/useBLEPositions.js
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return { headers: { Authorization: `Bearer ${token}` } };
};

export default function useBLEPositions() {
  const [positions, setPositions] = useState({});
  const [visitorMeta, setVisitorMeta] = useState({});
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const processVisitorData = useCallback((data) => {
    if (!Array.isArray(data)) return;

    const nextPositions = {};
    const nextMeta = {};

    data.forEach(v => {
      const id = String(v.id || v.bleId);
      
      const posX = typeof v.x === 'number' && v.x > 0 ? v.x : null;
      const posY = typeof v.y === 'number' && v.y > 0 ? v.y : null;

      if (posX !== null && posY !== null) {
        nextPositions[id] = { x: posX, y: posY };
      }

      let formattedTime = 'Just now';
      if (typeof v.lastSeen === 'number') {
        formattedTime = new Date(v.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } else if (typeof v.lastSeen === 'string') {
        formattedTime = v.lastSeen;
      }

      nextMeta[id] = {
        id,
        name: v.name || 'Visitor',
        floor: String(v.floor || '5'),
        bleId: v.bleId || id,
        currentRoom: v.currentRoom || 'Waiting for Scanner...',
        destination: v.destination || 'Unknown',
        lastSeen: formattedTime,
        isDisconnected: v.isDisconnected || false,
        disconnectedAt: v.disconnectedAt || null,
        isPendingDetection: v.isPendingDetection || false
      };
    });

    setPositions(nextPositions);
    setVisitorMeta(nextMeta);
  }, []);

  // Initial Load via HTTP
  const fetchInitialPositions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/positions`, getAuthHeaders());
      const data = await res.json();
      processVisitorData(data);
    } catch (err) {
      console.error('Initial BLE fetch error:', err);
    }
  }, [processVisitorData]);

  useEffect(() => {
    fetchInitialPositions();

    const connectWebSocket = () => {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      // Determine WS/WSS based on current protocol
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = API_BASE.replace(/^https?:\/\//, '').replace('/api', '');
      const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${token}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('🟢 Live Tracking WebSocket connected.');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'location_update') {
            // Merge the single updated visitor into current state
            setVisitorMeta(prev => {
              const updated = { ...prev };
              const v = message.visitor;
              const id = String(v.id || v.bleId);
              
              if (v.x && v.y) {
                setPositions(p => ({ ...p, [id]: { x: v.x, y: v.y } }));
              }

              updated[id] = {
                id,
                name: v.name,
                floor: String(v.floor),
                bleId: v.bleId,
                currentRoom: v.currentRoom,
                destination: v.destination,
                lastSeen: new Date(v.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                isDisconnected: v.isDisconnected,
                disconnectedAt: v.disconnectedAt,
                isPendingDetection: v.isPendingDetection
              };
              return updated;
            });
          }
        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      };

      ws.onclose = () => {
        console.log('🔴 Live Tracking WebSocket disconnected. Reconnecting...');
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [fetchInitialPositions]);

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
      x: positions[id]?.x || null,
      y: positions[id]?.y || null,
    }));
  }, [visitorMeta, positions]);

  return { visitors, setVisitorDestination };
}