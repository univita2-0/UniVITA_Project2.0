import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';
import { API_BASE } from '../api';
import './EmergencyAlertBanner.css';

const EmergencyAlertBanner = () => {
  const [alerts, setAlerts] = useState([]);
  const userId = localStorage.getItem('user_id');

  useEffect(() => {
    if (!userId) return;

    const fetchActiveAlerts = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await axios.get(`${API_BASE}/emergency-alerts/active`, {
          params: { userId },
          headers: { Authorization: `Bearer ${token}` }
        });
        setAlerts(res.data || []);
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