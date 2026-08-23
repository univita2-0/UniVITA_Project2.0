// src/pages/EmergencyAlerts.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { 
  Send, RefreshCw, Search, ShieldAlert, AlertTriangle, 
  Info, AlertOctagon, History, Calendar 
} from 'lucide-react';
import './EmergencyAlerts.css';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';

const EmergencyAlerts = () => {
  // Form state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('info');
  const [targetRoles, setTargetRoles] = useState(['instructor', 'admin', 'security', 'hr_admin']);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // History state
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // Filters
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Get auth token from localStorage
  const getAuthHeaders = () => {
    const token = localStorage.getItem('auth_token');
    return { Authorization: `Bearer ${token}` };
  };

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/emergency-alerts`, {
        headers: getAuthHeaders()
      });
      setAlerts(res.data);
    } catch (err) {
      console.error('Failed to fetch alerts', err);
      if (err.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
      } else {
        toast.error('Failed to load alert history');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.warning('Title and message are required.');
      return;
    }
    setSendError('');
    setSending(true);
    try {
      await axios.post(
        `${API_BASE}/emergency-alerts`,
        {
          title: title.trim(),
          message: message.trim(),
          severity,
          target_roles: targetRoles,
        },
        { headers: getAuthHeaders() }
      );
      toast.success('Alert sent successfully.');
      setTitle('');
      setMessage('');
      setSeverity('info');
      setTargetRoles(['instructor', 'admin', 'security', 'hr_admin']);
      fetchAlerts();
    } catch (err) {
      if (err.response?.status === 401) {
        toast.error('Unauthorized – please log in as Admin or HR.');
      } else {
        toast.error(err.response?.data?.error || 'Failed to send alert.');
      }
    } finally {
      setSending(false);
    }
  };

  const toggleRole = (role) => {
    if (targetRoles.includes(role)) {
      setTargetRoles(targetRoles.filter(r => r !== role));
    } else {
      setTargetRoles([...targetRoles, role]);
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    if (filterSeverity !== 'all' && alert.severity !== filterSeverity) return false;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!alert.title.toLowerCase().includes(q) && !alert.message.toLowerCase().includes(q)) {
        return false;
      }
    }

    if (startDate || endDate) {
      const alertDate = new Date(alert.sent_at).toISOString().split('T')[0];
      if (startDate && alertDate < startDate) return false;
      if (endDate && alertDate > endDate) return false;
    }

    return true;
  });

  const getSeverityIcon = (sev) => {
    switch (sev) {
      case 'critical': return <AlertOctagon size={14} />;
      case 'warning': return <AlertTriangle size={14} />;
      default: return <Info size={14} />;
    }
  };

  const formatRoles = (roles) => {
    try {
      let arr = typeof roles === 'string' ? JSON.parse(roles) : roles;
      if (!Array.isArray(arr)) arr = [arr];
      return arr.map(r => {
        if (r === 'hr_admin') return 'HR';
        return r.charAt(0).toUpperCase() + r.slice(1);
      }).join(', ');
    } catch { return roles; }
  };

  const openHistoryModal = () => {
    fetchAlerts();
    setShowHistoryModal(true);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilterSeverity('all');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="ea-container">
      <div className="ea-header">
        <div>
         
          <p className="ea-subtitle">Broadcast critical information across the organization.</p>
        </div>
        <button className="btn-view-history" onClick={openHistoryModal}>
          <History size={16} /> 
          <span>View Alert History</span>
        </button>
      </div>

      {/* New alert form */}
      <div className="ea-card">
        <div className="ea-card-header">
          
          <h3>Create New Alert</h3>
        </div>
        
        <div className="ea-form-grid">
          <div className="ea-form-group">
            <label>Alert Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              placeholder="e.g., Campus Lockdown, Severe Weather Warning" 
              className="ea-input"
            />
          </div>
          
          <div className="ea-form-group">
            <label>Severity Level</label>
            <select 
              value={severity} 
              onChange={e => setSeverity(e.target.value)}
              className="ea-select"
            >
              <option value="info">Info (General Updates)</option>
              <option value="warning">Warning (Important Notices)</option>
              <option value="critical">Critical (Immediate Action Required)</option>
            </select>
          </div>
          
          <div className="ea-form-group ea-full-width">
            <label>Detailed Message</label>
            <textarea 
              rows="3" 
              value={message} 
              onChange={e => setMessage(e.target.value)} 
              placeholder="Provide detailed instructions or information for the recipients..." 
              className="ea-textarea"
            />
          </div>
          
          <div className="ea-form-group ea-full-width">
            <label>Target Roles</label>
            <div className="ea-role-toggles">
              {[
                { value: 'instructor', label: 'Instructors' },
                { value: 'admin', label: 'Administrators' },
                { value: 'security', label: 'Security Personnel' },
                { value: 'hr_admin', label: 'HR Department' }
              ].map(role => (
                <button
                  key={role.value}
                  className={`ea-role-btn ${targetRoles.includes(role.value) ? 'active' : ''}`}
                  onClick={() => toggleRole(role.value)}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>
          
          {sendError && <div className="ea-error-message">{sendError}</div>}
          
          <div className="ea-form-actions">
            <button className={`btn-send-alert ${severity}`} onClick={handleSend} disabled={sending}>
              <Send size={16} />
              <span>{sending ? 'Broadcasting...' : 'Broadcast Alert'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* History Modal */}
      <FormalModal
        show={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="Alert History Log"
        wide
        footer={<button className="btn-modal-cancel" onClick={() => setShowHistoryModal(false)}>Close Window</button>}
      >
        <div className="ea-history-controls-wrapper">
          <div className="ea-history-filters">
            <div className="ea-search-wrapper">
              <Search size={16} className="ea-search-icon" />
              <input 
                type="text" 
                placeholder="Search alerts..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                className="ea-input-search"
              />
            </div>
            
            <select 
              value={filterSeverity} 
              onChange={e => setFilterSeverity(e.target.value)}
              className="ea-select-filter"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
          
          <div className="ea-history-filters mt-3">
            <div className="ea-date-group">
              <label>Start Date</label>
              <input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
                className="ea-date-input"
              />
            </div>
            <div className="ea-date-group">
              <label>End Date</label>
              <input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)} 
                className="ea-date-input"
              />
            </div>
            <div className="ea-filter-actions">
              <button className="btn-clear-filters" onClick={clearFilters} title="Clear Filters">
                Clear
              </button>
              <button className="btn-refresh" onClick={fetchAlerts} title="Refresh History">
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="ea-state-message">Loading alert history...</div>
        ) : filteredAlerts.length === 0 ? (
          <div className="ea-state-message">
            <Calendar size={40} className="empty-icon" />
            <p>No alerts found matching your criteria.</p>
          </div>
        ) : (
          <div className="ea-table-wrapper">
            <table className="ea-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Title</th>
                  <th>Message</th>
                  <th>Severity</th>
                  <th>Target Roles</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map(alert => (
                  <tr key={alert.id}>
                    <td className="ea-date-cell">{new Date(alert.sent_at).toLocaleString()}</td>
                    <td className="ea-title-cell">{alert.title}</td>
                    <td className="ea-message-cell">{alert.message}</td>
                    <td>
                      <span className={`ea-severity-badge ${alert.severity}`}>
                        {getSeverityIcon(alert.severity)}
                        <span>{alert.severity}</span>
                      </span>
                    </td>
                    <td className="ea-roles-cell">{formatRoles(alert.target_roles)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormalModal>
    </div>
  );
};

export default EmergencyAlerts;