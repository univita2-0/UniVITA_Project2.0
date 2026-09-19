// src/pages/Payroll.jsx
import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import './Payroll.css';
import { LockKeyhole, ShieldAlert, Fingerprint } from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../api';

const Payroll = ({ onUnlock, adminEmail }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current && !locked) {
      inputRef.current.focus();
    }
  }, [locked]);

  const handleUnlock = async () => {
    if (!code.trim()) {
      toast.warning('Please enter your security PIN.');
      return;
    }
    if (code.length < 4 || code.length > 6) {
      toast.warning('PIN must be 4-6 digits.');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/payroll/unlock`, {
        email: adminEmail,
        pin: code
      });
      if (res.data.success) {
        onUnlock(res.data.token);
      } else {
        toast.error(res.data.message);
        if (res.data.message.includes('Too many failed attempts')) {
          setLocked(true);
          setCode('');
          setTimeout(() => setLocked(false), 15 * 60 * 1000);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Connection error while verifying PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pr-container">
      <div className="pr-auth-card">
        <div className="pr-brand-badge">
          <LockKeyhole size={28} color="#0D9488" strokeWidth={2.5} />
        </div>
        
        <h2 className="pr-title">Secure Payroll Access</h2>
        <p className="pr-subtitle">
          This module contains highly sensitive compensation data. Enter your authorized security PIN to unlock the dashboard.
        </p>
        
        <div className="pr-form-group">
          <label className="pr-label">Administrator PIN</label>
          <div className="pr-input-wrapper">
            <Fingerprint size={20} className="pr-input-icon" />
            <input
              ref={inputRef}
              type="password"
              className={`pr-input ${locked ? 'locked' : ''}`}
              value={code}
              maxLength={6}
              disabled={locked || loading}
              placeholder={locked ? 'Access Suspended (15m)' : '• • • • • •'}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} // Validation: Strict digits only
              onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
            />
          </div>
          {locked && (
            <div className="pr-alert-danger">
              <ShieldAlert size={14} />
              <span>Too many failed attempts. Device locked.</span>
            </div>
          )}
        </div>
        
        <button 
          className="btn-pr-unlock" 
          onClick={handleUnlock} 
          disabled={loading || locked || code.length < 4}
        >
          {loading ? 'Authenticating...' : 'Unlock System'}
        </button>
      </div>
    </div>
  );
};

export default Payroll;