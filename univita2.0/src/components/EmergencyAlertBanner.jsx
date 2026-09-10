import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';
import { API_BASE } from '../api';
import './EmergencyAlertBanner.css';

// Import your custom mp3 sound files
import criticalSound from '../assets/sounds/critical.mp3';
import warningSound from '../assets/sounds/warning.mp3';
import infoSound from '../assets/sounds/info.mp3';

const EmergencyAlertBanner = () => {
  const [alerts, setAlerts] = useState([]);
  const userId = localStorage.getItem('user_id');
  const prevAlertIdsRef = useRef(new Set());

  // Helper to get the correct audio file based on severity
  const getAudioForSeverity = (severity) => {
    switch (severity) {
      case 'critical': return new Audio(criticalSound);
      case 'warning': return new Audio(warningSound);
      default: return new Audio(infoSound);
    }
  };

  useEffect(() => {
    if (!userId) return;

    const fetchActiveAlerts = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await axios.get(`${API_BASE}/emergency-alerts/active`, {
          params: { userId },
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const activeAlerts = res.data || [];
        const currentIds = new Set(activeAlerts.map(a => a.id));
        
        // Find if there is any brand new alert
        const newAlerts = activeAlerts.filter(a => !prevAlertIdsRef.current.has(a.id));

        if (newAlerts.length > 0 && prevAlertIdsRef.current.size > 0) {
          // Play the sound corresponding to the highest severity of the new alerts
          const highestSeverityAlert = newAlerts.find(a => a.severity === 'critical') || 
                                       newAlerts.find(a => a.severity === 'warning') || 
                                       newAlerts[0];

          const soundToPlay = getAudioForSeverity(highestSeverityAlert.severity);
          soundToPlay.play().catch(e => {
            console.log('Audio autoplay prevented by browser policy until user interacts with page', e);
          });
        }

        prevAlertIdsRef.current = currentIds;
        setAlerts(activeAlerts);
      } catch (err) {
        console.error('Failed to fetch active alerts', err);
      }
    };

    fetchActiveAlerts();
    const interval = setInterval(fetchActiveAlerts, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const handleDismiss = async (alertId) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(`${API_BASE}/emergency-alerts/${alertId}/read`, { userId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      prevAlertIdsRef.current.delete(alertId);
    } catch (err) {
      console.error('Failed to mark alert as read', err);
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="emergency-banner-container">
      {alerts.map(alert => (
        <div key={alert.id} className={`emergency-banner ${alert.severity}`}>
          <div className="emergency-banner-content">
            {alert.severity === 'critical' ? <AlertOctagon size={18} /> : 
             alert.severity === 'warning' ? <AlertTriangle size={18} /> : <Info size={18} />}
            <div>
              <strong>{alert.title}:</strong> {alert.message}
            </div>
          </div>
          <button className="emergency-banner-dismiss" onClick={() => handleDismiss(alert.id)} title="Dismiss">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default EmergencyAlertBanner;