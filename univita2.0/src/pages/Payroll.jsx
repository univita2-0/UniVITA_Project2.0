// src/pages/Payroll.jsx
import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import './Payroll.css';
import { ShieldCheck, ShieldAlert, Lock } from 'lucide-react';
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

  const handleUnlock = async (e) => {
    if (e) e.preventDefault();
    
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
        
        <div className="pr-icon-wrapper">
          <ShieldCheck size={28} strokeWidth={2.5} />
        </div>
        
        <h2 className="pr-title">Security Clearance</h2>
        <p className="pr-subtitle">
          Payroll data is restricted. Enter your administrative PIN to authenticate as <strong>{adminEmail}</strong>.
        </p>

        <form onSubmit={handleUnlock} className="pr-form">
          <div className="pr-input-container">
            <Lock size={18} className="pr-input-icon" />
            <input
              ref={inputRef}
              type="password"
              className={`pr-input ${locked ? 'locked' : ''}`}
              value={code}
              maxLength={6}
              disabled={locked || loading}
              placeholder={locked ? "Suspended" : "Enter PIN"}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          {locked && (
            <div className="pr-alert-danger">
              <ShieldAlert size={14} />
              <span>Access temporarily suspended (15m).</span>
            </div>
          )}

          <button 
            type="submit" 
            className="pr-btn-unlock" 
            disabled={loading || locked || code.length < 4}
          >
            {loading ? 'Verifying Credentials...' : 'Unlock '}
          </button>
        </form>

      </div>
    </div>
  );
};

export default Payroll;