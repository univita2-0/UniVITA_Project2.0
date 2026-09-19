import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../api'; // 👈 FIX: Import API_BASE
import FormalModal from '../components/FormalModal';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const PinChangeModal = ({ show, onClose, adminEmail }) => {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    
    if (!currentPin || !newPin || !confirmPin) {
      return setError('All fields are required.');
    }
    if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      return setError('New PIN must be exactly 4-6 numeric digits.');
    }
    if (currentPin === newPin) {
      return setError('New PIN must be different from your current PIN.');
    }
    if (newPin !== confirmPin) {
      return setError('New PIN and confirmation do not match.');
    }

    setLoading(true);
    try {
     
      const res = await axios.put(`${API_BASE}/users/update-pin`, {
        email: adminEmail,
        currentPin,
        newPin
      }, getAuthHeaders());
      
      if (res.data.success) {
        alert('PIN updated successfully.');
        onClose();
      } else {
        setError(res.data.message || 'Failed to update PIN.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Network error.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <FormalModal
      show={show}
      onClose={onClose}
      title="Change Payroll PIN"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
          <button className="btn-modal-cancel" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn-modal-submit" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Updating…' : 'Update PIN'}
          </button>
        </div>
      }
    >
      {error && (
        <div className="error-box" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      <div className="modal-form-group">
        <label className="modal-label">Current PIN</label>
        <input
          type="password"
          className="modal-input"
          value={currentPin}
          onChange={(e) => setCurrentPin(e.target.value)}
          maxLength={6}
          autoFocus
        />
      </div>
      <div className="modal-form-group">
        <label className="modal-label">New PIN (4–6 digits)</label>
        <input
          type="password"
          className="modal-input"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value)}
          maxLength={6}
        />
      </div>
      <div className="modal-form-group">
        <label className="modal-label">Confirm New PIN</label>
        <input
          type="password"
          className="modal-input"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          maxLength={6}
        />
      </div>
    </FormalModal>
  );
};

export default PinChangeModal;