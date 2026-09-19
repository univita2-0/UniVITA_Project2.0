// src/pages/PayrollHistoryModal.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { ShieldCheck, History } from 'lucide-react';
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
      <p className="pm-modal-desc">
        This log securely tracks all successful PIN entries and unlocks of the payroll module for auditing purposes.
      </p>

      <div className="pm-table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
        {loading ? (
          <div className="pm-empty-state" style={{ padding: '3rem' }}>
            <ShieldCheck size={32} className="pm-empty-icon animate-pulse" />
            <p>Fetching secure access records...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="pm-empty-state" style={{ padding: '3rem' }}>
            <History size={32} className="pm-empty-icon" />
            <p>No access records found in the audit trail.</p>
          </div>
        ) : (
          <table className="pm-table">
            <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: '#F8FAFC' }}>
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
                  <td className="text-right">
                    <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                      {new Date(log.accessed_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit', hour12: true
                      })}
                    </span>
                  </td>
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