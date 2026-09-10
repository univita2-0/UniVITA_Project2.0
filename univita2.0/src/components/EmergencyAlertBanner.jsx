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

  // Pre-load audio elements
  const audioMap = useRef({
    critical: new Audio(criticalSound),
    warning: new Audio(warningSound),
    info: new Audio(infoSound)
  });

  const isAudioUnlocked = useRef(false);


  useEffect(() => {
    const unlockAudio = () => {
      if (isAudioUnlocked.current) return;
      Object.values(audioMap.current).forEach(audio => {
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
        }).catch(() => {});
      });
      isAudioUnlocked.current = true;
      window.removeEventListener('click', unlockAudio);
    };

    window.addEventListener('click', unlockAudio);
    return () => window.removeEventListener('click', unlockAudio);
  }, []);

  const playSeveritySound = (severity) => {
    const sound = audioMap.current[severity] || audioMap.current.info;
    sound.currentTime = 0;
    sound.play().catch(err => {
      console.warn('Audio play blocked: Click anywhere on the dashboard to enable alert sounds.', err);
    });
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
        setAlerts(activeAlerts);

        // Retrieve already-heard alerts from this session
        const heardAlerts = JSON.parse(sessionStorage.getItem('heard_alerts') || '[]');

        // Check if there is any unread alert that hasn't made a sound yet
        const unplayed = activeAlerts.filter(a => !heardAlerts.includes(a.id));

        if (unplayed.length > 0) {
          // Play the sound of the most critical alert
          const highest = unplayed.find(a => a.severity === 'critical') ||
                          unplayed.find(a => a.severity === 'warning') ||
                          unplayed[0];

          playSeveritySound(highest.severity);

          // Mark all current active alerts as heard in sessionStorage
          const updatedHeard = [...new Set([...heardAlerts, ...unplayed.map(a => a.id)])];
          sessionStorage.setItem('heard_alerts', JSON.stringify(updatedHeard));
        }
      } catch (err) {
        console.error('Failed to fetch active alerts', err);
      }
    };

    fetchActiveAlerts();
    
    // Poll every 5 seconds for near real-time emergency responsiveness
    const interval = setInterval(fetchActiveAlerts, 5000);
    return () => clearInterval(interval);
  }, [userId]);

  const handleDismiss = async (alertId) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(`${API_BASE}/emergency-alerts/${alertId}/read`, { userId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Remove immediately from UI
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