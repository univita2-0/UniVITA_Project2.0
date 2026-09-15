// src/pages/PayrollHistoryModal.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { API_BASE } from '../api';
import FormalModal from '../components/FormalModal';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const PayrollHistoryModal = ({ show, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!show) return;
    setLoading(true);
    axios.get(`${API_BASE}/payroll/access-logs`, getAuthHeaders())
      .then(res => setLogs(res.data))
      .catch(err => {
        console.error(err);
        toast.error('Failed to load access logs');
      })
      .finally(() => setLoading(false));
  }, [show]);

  if (!show) return null;

  return (
    <FormalModal
      show={show}
      onClose={onClose}
      title="Payroll Access Audit Log"
      wide
      footer={<button className="btn-pm-cancel" onClick={onClose}>Close</button>}
    >
      <div className="pm-table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {loading ? (
          <div className="pm-empty-state">Loading access records...</div>
        ) : logs.length === 0 ? (
          <div className="pm-empty-state">No access records found in the audit trail.</div>
        ) : (
          <table className="pm-table">
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th>Administrator Name</th>
                <th>Account Email</th>
                <th className="text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, index) => (
                <tr key={`${log.accessed_at}-${index}`}>
                  <td><strong>{log.full_name}</strong></td>
                  <td><span className="pm-mono-text">{log.email}</span></td>
                  <td className="text-right">{new Date(log.accessed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </FormalModal>
  );
};

export default PayrollHistoryModal;