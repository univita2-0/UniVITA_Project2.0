import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { API_BASE } from '../api';
import './Payroll.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const Payroll = ({ onUnlock, adminEmail }) => {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUnlock = async (e) => {
    e.preventDefault();
    setError('');

    // 🟢 Validation: Check if session exists
    if (!adminEmail) {
      return setError('Session expired. Please log out and log in again.');
    }
    if (!pin) {
      return setError('Please enter your administrative PIN.');
    }
    if (pin.length < 4) {
      return setError('PIN must be at least 4 digits.');
    }

    setLoading(true);
    
    try {
      const res = await axios.post(`${API_BASE}/payroll/unlock`, 
        { email: adminEmail, pin }, 
        getAuthHeaders()
      );
      
        if (res.data.success) {
        
        setTimeout(() => {
          onUnlock(res.data.token);
        }, 100);
      }
    

    } catch (err) {
      console.error(err);
      
      
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log out and log back in.');
      } 
      
      else if (err.response?.status === 400 || err.response?.status === 403) {
        setError(err.response?.data?.message || 'Incorrect PIN. Please try again.');
      } 
     
      else if (err.response?.status === 429) {
        setError('Too many failed attempts. Please wait 15 minutes.');
      } 
     
      else {
        setError(err.response?.data?.message || 'Connection error while verifying PIN.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    // 🟢 FIXED: Using classes that actually exist in Payroll.css (pr-*)
    <div className="pr-container">
      <div className="pr-auth-card">
        <div className="pr-icon-wrapper">
          <ShieldCheck size={32} color="#0D9488" />
        </div>
        
        <h2 className="pr-title">Security Clearance</h2>
        <p className="pr-subtitle">
          Payroll data is restricted.<br />
          Enter your administrative PIN.
        </p>

        <form onSubmit={handleUnlock} className="pr-form">
          <div className="pr-input-container">
            <Lock size={18} className="pr-input-icon" />
            <input
              type="password"
              className={`pr-input ${error ? 'locked' : ''}`}
              placeholder="••••"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                if (error) setError('');
              }}
              maxLength={6}
              autoFocus
              disabled={loading}
            />
          </div>

          {error && (
            <div className="pr-alert-danger">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button 
            type="submit" 
            className="pr-btn-unlock" 
            disabled={loading || !pin}
          >
            {loading ? 'Verifying...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Payroll;