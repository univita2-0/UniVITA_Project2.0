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
      
      const posX = v.x != null && Number.isFinite(Number(v.x)) && Number(v.x) >= 0 ? Number(v.x) : null;
      const posY = v.y != null && Number.isFinite(Number(v.y)) && Number(v.y) >= 0 ? Number(v.y) : null;

      if (posX !== null && posY !== null) {
        nextPositions[id] = {
  x: posX,
  y: posY,
  visitorRequestId: v.visitorRequestId ?? null
};
      }

      // Keep machine-readable time for freshness and never substitute "Just now".
      const lastSeenMs = typeof v.lastSeen === 'number'
        ? v.lastSeen
        : v.lastSeen ? new Date(v.lastSeen).getTime() : null;

      nextMeta[id] = {
        id,
        visitorRequestId: v.visitorRequestId ?? null,
        name: v.name || 'Visitor',
        floor: v.floor == null ? '' : String(v.floor),
        bleId: v.bleId || id,
        currentRoom: v.currentRoom || 'Waiting for Scanner...',
        destination: v.destination || 'Unknown',
        lastSeen: Number.isFinite(lastSeenMs) ? lastSeenMs : null,
        isDisconnected: v.isDisconnected || false,
        disconnectedAt: v.disconnectedAt || null,
        isPendingDetection: Boolean(v.isPendingDetection),
        trackingStatus: v.trackingStatus || (v.isPendingDetection ? 'awaiting_detection' : v.isDisconnected ? 'signal_lost' : 'active'),
        loiterAlertSent: Boolean(v.loiterAlertSent)
      };
    });

    setPositions(nextPositions);
    setVisitorMeta(nextMeta);
  }, []);

  // Initial Load via HTTP
  const fetchInitialPositions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/positions`, getAuthHeaders());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      processVisitorData(data);
    } catch (err) {
      console.error('Initial BLE fetch error:', err);
    }
  }, [processVisitorData]);

  useEffect(() => {
    fetchInitialPositions();

    let disposed = false;
    const connectWebSocket = () => {
      if (disposed) return;
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const apiUrl = new URL(API_BASE);
const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${apiUrl.host}/ws?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('🟢 Live Tracking WebSocket connected.');
        fetchInitialPositions();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'location_update') {
            // Update coordinates and metadata separately, with no nested state setter.
            const v = message.visitor;
            if (!v || !v.id && !v.bleId) return;
            const id = String(v.id || v.bleId);
            const x = Number(v.x);
            const y = Number(v.y);
            if (v.x != null && v.y != null &&
                Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0) {
              setPositions(prev => ({
  ...prev,
  [id]: {
    x,
    y,
    visitorRequestId: v.visitorRequestId ?? null
  }
}));
            }
            setVisitorMeta(prev => ({
            ...prev,
            [id]: {
            ...prev[id],
             id,
             visitorRequestId:
             v.visitorRequestId ?? prev[id]?.visitorRequestId ?? null,
             name: v.name || prev[id]?.name || 'Visitor',
                floor: String(v.floor || prev[id]?.floor || ''),
                bleId: v.bleId || id,
                currentRoom: v.currentRoom || prev[id]?.currentRoom || 'Waiting for Scanner...',
                destination: v.destination || prev[id]?.destination || 'Unknown',
                lastSeen: v.lastSeen == null
  ? null
  : Number.isFinite(Number(v.lastSeen))
    ? Number(v.lastSeen)
    : Number.isFinite(Date.parse(v.lastSeen))
      ? Date.parse(v.lastSeen)
      : null,
                isDisconnected: Boolean(v.isDisconnected),
                disconnectedAt: v.disconnectedAt || null,
                isPendingDetection: Boolean(v.isPendingDetection),
                trackingStatus: v.trackingStatus || (v.isPendingDetection ? 'awaiting_detection' : v.isDisconnected ? 'signal_lost' : 'active'),
                loiterAlertSent: Boolean(v.loiterAlertSent)
              }
            }));
          
} else if (message.type === 'visitor_checkout' && message.bleId) {
  const id = String(message.bleId);
  const requestId = message.visitorRequestId;

  if (requestId == null) return;

  setVisitorMeta(prev => {
    const current = prev[id];

    if (
      !current ||
      current.visitorRequestId == null ||
      String(current.visitorRequestId) !== String(requestId)
    ) {
      return prev;
    }

    const next = { ...prev };
    delete next[id];
    return next;
  });
}

        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        console.log('🔴 Live Tracking WebSocket disconnected. Reconnecting...');
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connectWebSocket();
        }, 5000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      disposed = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [fetchInitialPositions]);

  const setVisitorDestination = useCallback(async (visitorId, newDest) => {
    try {
      await axios.put(
        `${API_BASE}/visitor-requests/${visitorId}/destination`,
        { destination: newDest, ble_id: visitorId },
        getAuthHeaders()
      );
      setVisitorMeta(prev => {
        if (!prev[visitorId]) return prev;
        return { ...prev, [visitorId]: { ...prev[visitorId], destination: newDest } };
      });
      return true;
    } catch (err) {
      console.error('Failed to update visitor destination:', err);
      return false;
    }
  }, []);

  
const visitors = useMemo(() => {
  return Object.keys(visitorMeta).map(id => {
    const visitor = visitorMeta[id];
    const position = positions[id];

    const sameVisit =
      visitor.visitorRequestId != null &&
      position?.visitorRequestId != null &&
      String(visitor.visitorRequestId) ===
        String(position.visitorRequestId);

    const showPosition =
      sameVisit &&
      !visitor.isPendingDetection &&
      visitor.trackingStatus !== 'awaiting_detection';

    return {
      ...visitor,
      x: showPosition ? position.x : null,
      y: showPosition ? position.y : null
    };
  });
}, [visitorMeta, positions]);


  return { visitors, setVisitorDestination };
}