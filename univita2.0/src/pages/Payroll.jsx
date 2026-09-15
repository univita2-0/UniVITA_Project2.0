// src/pages/Payroll.jsx
import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import './Payroll.css';
import { Lock, ShieldAlert } from 'lucide-react';
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
    if (code.length < 4) {
      toast.warning('PIN must be at least 4 digits.');
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
        <div className="pr-icon-wrapper">
          <Lock size={32} color="white" strokeWidth={2} />
        </div>
        <h2 className="pr-title">Payroll Access Restricted</h2>
        <p className="pr-subtitle">
          This module contains sensitive financial information and compensation data. Please enter your authorized security PIN to proceed.
        </p>
        
        <div className="pr-form-group">
          <label className="pr-label">Security PIN</label>
          <input
            ref={inputRef}
            type="password"
            className={`pr-input ${locked ? 'locked' : ''}`}
            value={code}
            maxLength={6}
            disabled={locked || loading}
            placeholder={locked ? 'Locked out. Please wait 15 mins.' : 'Enter 4-6 digit PIN'}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} // Validation: Digits only
            onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
          />
          {locked && (
            <div className="pr-alert-danger">
              <ShieldAlert size={14} />
              <span>Too many failed attempts. Access suspended.</span>
            </div>
          )}
        </div>
        
        <button 
          className="btn-pr-unlock" 
          onClick={handleUnlock} 
          disabled={loading || locked || code.length < 4}
        >
          {loading ? 'Verifying Identity...' : 'Unlock Payroll System'}
        </button>
      </div>
    </div>
  );
};

export default Payroll;