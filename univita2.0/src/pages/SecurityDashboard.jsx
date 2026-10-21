import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  UserCheck, ShieldCheck, CheckCircle, AlertCircle,
  ChevronRight, ChevronLeft, X, Radio, Bell,
  PieChart, Activity, RefreshCw, UserX
} from 'lucide-react';
import { API_BASE, fetchRecentActivity } from '../api';
import './Dashboard.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const isToday = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
         d.getMonth() === today.getMonth() &&
         d.getDate() === today.getDate();
};

// 🟢 NEW: Visitor-specific Pie Chart
const VisitorPieChart = ({ active, pending, completed, noShow, total }) => {
  const sum = active + pending + completed + noShow;

  if (!total || total === 0 || sum === 0) {
    return (
      <div className="expert-empty-chart">
        <PieChart size={32} className="text-muted" />
        <p>No visitors scheduled today</p>
      </div>
    );
  }

  const aPct = Math.round((active / sum) * 100);
  const pPct = Math.round((pending / sum) * 100);
  const cPct = Math.round((completed / sum) * 100);
  const nPct = Math.max(0, 100 - aPct - pPct - cPct);

  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  const activeStroke = (active / sum) * circumference;
  const pendingStroke = (pending / sum) * circumference;
  const completedStroke = (completed / sum) * circumference;
  const noShowStroke = (noShow / sum) * circumference;

  const activeOffset = 0;
  const pendingOffset = -activeStroke;
  const completedOffset = -(activeStroke + pendingStroke);
  const noShowOffset = -(activeStroke + pendingStroke + completedStroke);

  return (
    <div className="expert-pie-container">
      <div className="expert-pie-graphic">
        <svg viewBox="0 0 100 100" className="expert-donut-svg">
          <circle cx="50" cy="50" r={radius} className="donut-bg" />
          {active > 0 && (
            <circle cx="50" cy="50" r={radius} className="donut-segment donut-present"
              strokeDasharray={`${activeStroke} ${circumference}`} strokeDashoffset={activeOffset} />
          )}
          {pending > 0 && (
            <circle cx="50" cy="50" r={radius} className="donut-segment donut-late"
              strokeDasharray={`${pendingStroke} ${circumference}`} strokeDashoffset={pendingOffset} />
          )}
          {completed > 0 && (
            <circle cx="50" cy="50" r={radius} className="donut-segment" stroke="#3B82F6"
              strokeDasharray={`${completedStroke} ${circumference}`} strokeDashoffset={completedOffset} />
          )}
          {noShow > 0 && (
            <circle cx="50" cy="50" r={radius} className="donut-segment donut-absent"
              strokeDasharray={`${noShowStroke} ${circumference}`} strokeDashoffset={noShowOffset} />
          )}
        </svg>
        <div className="expert-donut-center">
          <span className="expert-donut-total">{total}</span>
          <span className="expert-donut-sub">Total</span>
        </div>
      </div>

      <div className="expert-pie-legend">
        <div className="legend-item">
          <div className="legend-indicator bg-present" />
          <div className="legend-label">
            <span className="legend-title">Active on Campus</span>
            <span className="legend-val">{active} ({aPct}%)</span>
          </div>
        </div>
        <div className="legend-item">
          <div className="legend-indicator bg-late" />
          <div className="legend-label">
            <span className="legend-title">Pending Approval</span>
            <span className="legend-val">{pending} ({pPct}%)</span>
          </div>
        </div>
        <div className="legend-item">
          <div className="legend-indicator" style={{ backgroundColor: '#3B82F6' }} />
          <div className="legend-label">
            <span className="legend-title">Completed Visits</span>
            <span className="legend-val">{completed} ({cPct}%)</span>
          </div>
        </div>
        <div className="legend-item">
          <div className="legend-indicator bg-absent" />
          <div className="legend-label">
            <span className="legend-title">No Show / Rejected</span>
            <span className="legend-val">{noShow} ({nPct}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const SecurityDashboard = ({ setView }) => {
  const [stats, setStats] = useState({
    approvedToday: 0,
    totalVisitorsToday: 0,
    activeBleTags: 0
  });
  
  // 🟢 NEW: Visitor Pie Chart State
  const [visitorStats, setVisitorStats] = useState({
    active: 0, pending: 0, completed: 0, noShow: 0, total: 0
  });

  const [todayVisitors, setTodayVisitors] = useState([]);
  const [systemAlerts, setSystemAlerts] = useState([]);
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());
  const [activeTab, setActiveTab] = useState('visitors');
  
  const [recentActivities, setRecentActivities] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    setError(null);
    try {
      const [res, tagsRes, scannersRes, activityRes] = await Promise.all([
        // 🟢 FIX: Fetch ALL visitor requests for today (not just approved) to populate the pie chart
        axios.get(`${API_BASE}/visitor-requests`, {
          params: { date: today },
          ...getAuthHeaders()
        }),
        axios.get(`${API_BASE}/ble-tags`, getAuthHeaders()),
        axios.get(`${API_BASE}/scanners`, getAuthHeaders()),
        fetchRecentActivity(50)
      ]);

      const allRequests = res.data || [];
      
      // Calculate Pie Chart Data
      let activeCount = 0;
      let pendingCount = 0;
      let completedCount = 0;
      let noShowCount = 0;

      const currentVisitors = allRequests.filter(v => {
        const isActive = v.arrived === 1 && v.returned !== 1 && v.no_show !== 1;
        const isPending = v.status === 'PENDING';
        const isCompleted = v.returned === 1;
        const isNoShow = v.no_show === 1 || v.status === 'REJECTED';

        if (isActive) activeCount++;
        else if (isPending) pendingCount++;
        else if (isCompleted) completedCount++;
        else if (isNoShow) noShowCount++;

        return isActive;
      });

      setTodayVisitors(currentVisitors);
      
      setVisitorStats({
        active: activeCount,
        pending: pendingCount,
        completed: completedCount,
        noShow: noShowCount,
        total: allRequests.length
      });

      const activeBleTags = (tagsRes.data || []).filter(t => t.current_status === 'IN USE').length;

      setStats({
        approvedToday: allRequests.filter(v => v.status === 'APPROVED').length, 
        totalVisitorsToday: allRequests.length,
        activeBleTags
      });

      // Process Alerts
      const newAlerts = [];
      const now = new Date();

      (tagsRes.data || []).forEach(tag => {
        if (tag.battery_level > 0 && tag.battery_level < 2600) {
          newAlerts.push({
            id: `batt_${tag.ble_id}`,
            type: 'battery',
            title: `Low Battery: ${tag.label || tag.ble_id}`,
            message: `Tag battery is critically low (${tag.battery_level}mV). Replace CR2032 cell.`
          });
        }
      });

      (scannersRes.data || []).forEach(scanner => {
        if (scanner.last_ping) {
          const lastPing = new Date(scanner.last_ping);
          const diffMinutes = (now - lastPing) / 60000;
          if (diffMinutes > 5) {
            newAlerts.push({
              id: `scan_${scanner.scanner_id}`,
              type: 'offline',
              title: `Scanner Offline: ${scanner.assigned_room || scanner.location}`,
              message: `Scanner ${scanner.scanner_id} lost heartbeat ${Math.round(diffMinutes)} mins ago.`
            });
          }
        }
      });
      setSystemAlerts(newAlerts);

      // Process Activities (Filter for VISITOR actions only)
      let activities = [];
      if (activityRes.status === 'fulfilled' && activityRes.value?.success && Array.isArray(activityRes.value?.data)) {
        activities = activityRes.value.data;
      }
      
      const visitorKeywords = ['VISITOR', 'APPOINTMENT', 'VISIT_REASON'];
      activities = activities.filter(act => {
        const typeStr = (act.type || act.action || act.title || '').toUpperCase();
        return visitorKeywords.some(kw => typeStr.includes(kw));
      });
      
      setRecentActivities(activities);
      setCurrentPage(1);

    } catch (err) {
      console.error('Security Dashboard error:', err);
      setError('Failed to load security monitoring data.');
    } finally {
      setLoading(false);
    }
  };

  const dismissAlert = (alertId) => {
    setDismissedAlerts(prev => {
      const newSet = new Set(prev);
      newSet.add(alertId);
      return newSet;
    });
  };

  const handleNavigate = (view) => {
    if (setView) setView(view);
  };

  const formatActionText = (act) => {
    if (act.type) return act.type.replace(/_/g, ' ').toUpperCase();
    if (act.title) return act.title.toUpperCase();
    return 'ACTION RECORDED';
  };

  const todayActivities = recentActivities.filter(act => isToday(act.occurred_at || act.created_at || act.timestamp));
  const totalPages = Math.ceil(todayActivities.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const displayedActivities = todayActivities.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (loading && todayVisitors.length === 0) {
    return (
      <div className="expert-loading">
        <ShieldCheck size={44} className="text-muted" style={{ marginBottom: '1rem', animation: 'pulse 2s infinite' }} />
        <p>Loading Security Monitoring Data...</p>
      </div>
    );
  }

  const visibleAlerts = systemAlerts.filter(alert => !dismissedAlerts.has(alert.id));

  return (
    <div className="expert-container">
      <section className="expert-banner">
        <div className="expert-banner-item">
          <ShieldCheck size={16} color="#0D9488" />
          <span>Security Protocol: <strong>Active</strong></span>
        </div>
        <div className="expert-banner-item">
          <Radio size={16} color="#0EA5E9" />
          <span>Active BLE Tags: <strong>{stats.activeBleTags}</strong></span>
        </div>
        <div className="expert-banner-item">
          <UserCheck size={16} className="text-muted" />
          <span>Total Daily Visitors: <strong>{stats.totalVisitorsToday}</strong></span>
        </div>
      </section>

      <section className="expert-stats-grid grid-3">
        <div className="expert-stat-card" onClick={() => handleNavigate('manage-request')}>
          <div className="expert-stat-header">
            <UserCheck size={18} className="text-muted" />
            <span className="expert-stat-label">Scheduled Today</span>
          </div>
          <div className="expert-stat-value">{stats.approvedToday}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('completed-visits')}>
          <div className="expert-stat-header">
            <ShieldCheck size={18} className="text-muted" />
            <span className="expert-stat-label">Total Visitors</span>
          </div>
          <div className="expert-stat-value">{stats.totalVisitorsToday}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('manage-ble')}>
          <div className="expert-stat-header">
            <Radio size={18} className="text-muted" />
            <span className="expert-stat-label">Active BLE Tags</span>
          </div>
          <div className="expert-stat-value">{stats.activeBleTags}</div>
        </div>
      </section>

      <section className="expert-dashboard-panels">
        <div className="expert-panel flex-2">
          <div className="expert-panel-header" style={{ padding: 0 }}>
            <div className="expert-sec-tabs">
              <button 
                onClick={() => setActiveTab('visitors')}
                className={`expert-sec-tab ${activeTab === 'visitors' ? 'active' : ''}`}
              >
                <UserCheck size={16} /> Current Visitors
              </button>
              <button 
                onClick={() => setActiveTab('alerts')}
                className={`expert-sec-tab ${activeTab === 'alerts' ? 'active-alert' : ''}`}
              >
                <Bell size={16} /> System Alerts 
                {visibleAlerts.length > 0 && (
                  <span className="expert-alert-badge">{visibleAlerts.length}</span>
                )}
              </button>
            </div>
          </div>

          <div className="expert-task-list">
            {activeTab === 'visitors' ? (
              todayVisitors.length === 0 ? (
                <div className="expert-empty-state">
                  <CheckCircle size={28} className="text-muted" />
                  <p>No active visitors currently on campus.</p>
                </div>
              ) : (
                todayVisitors.map(visitor => (
                  <div key={visitor.id} className="expert-task-item">
                    <div className="expert-task-info">
                      <UserCheck size={18} className="text-muted" />
                      <div>
                        <p className="expert-task-text">
                          <strong>{visitor.first_name} {visitor.last_name}</strong>
                        </p>
                        <p className="expert-task-subtext">
                          {visitor.visit_time ? visitor.visit_time.substring(0,5) : 'No time'}
                          {visitor.reason && ` · ${visitor.reason.substring(0,40)}${visitor.reason.length > 40 ? '…' : ''}`}
                        </p>
                      </div>
                    </div>
                    <button className="expert-btn-outline-small" onClick={() => handleNavigate('track-visitor')}>Track</button>
                  </div>
                ))
              )
            ) : (
              visibleAlerts.length === 0 ? (
                <div className="expert-empty-state">
                  <CheckCircle size={28} color="#0D9488" />
                  <p>All hardware scanners are online and tag batteries are healthy.</p>
                </div>
              ) : (
                visibleAlerts.map(alert => (
                  <div key={alert.id} className="expert-task-item alert-item">
                    <div className="expert-task-info">
                      <AlertCircle size={18} color="#DC2626" />
                      <div>
                        <p className="expert-task-text" style={{ color: '#991B1B' }}>
                          <strong>{alert.title}</strong>
                        </p>
                        <p className="expert-task-subtext" style={{ color: '#B91C1C' }}>{alert.message}</p>
                      </div>
                    </div>
                    <button onClick={() => dismissAlert(alert.id)} className="expert-btn-dismiss">
                      <X size={14} /> Dismiss
                    </button>
                  </div>
                ))
              )
            )}
          </div>
        </div>

        {/* 🟢 NEW: Visitor Pie Chart Panel */}
        <div className="expert-panel flex-1">
          <div className="expert-panel-header">
            <div className="expert-ph-title">
              <PieChart size={18} />
              <span>Today's Visitor Breakdown</span>
            </div>
          </div>
          <div className="expert-panel-body expert-att-body">
            <VisitorPieChart
              active={visitorStats.active}
              pending={visitorStats.pending}
              completed={visitorStats.completed}
              noShow={visitorStats.noShow}
              total={visitorStats.total}
            />
          </div>
        </div>
      </section>

      <section className="expert-panel full-width" style={{ marginTop: '1rem' }}>
        <div className="expert-panel-header">
          <div className="expert-ph-title">
            <Activity size={18} />
            <span>Recent Visitor Activity</span>
          </div>
          <button className="expert-btn-text" onClick={loadDashboardData}>
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
        <div className="expert-activity-list">
          {displayedActivities.length === 0 ? (
            <div className="expert-empty-state">
              <Activity size={28} className="text-muted" />
              <p>No visitor activity recorded today.</p>
            </div>
          ) : (
            displayedActivities.map((act, index) => {
              const actionLabel = formatActionText(act);
              return (
                <div key={act.id || act._id || index} className="expert-activity-item">
                  <div className="expert-act-avatar">
                    {(act.actor || act.user_name || act.employee_name || 'V').charAt(0).toUpperCase()}
                  </div>
                  <div className="expert-act-details">
                    <div className="expert-act-top">
                      <span className="expert-act-actor">{act.actor || act.user_name || act.employee_name || 'Visitor'}</span>
                      {act.description && <span className="expert-act-desc" style={{ marginLeft: '8px', opacity: 0.8 }}>- {act.description}</span>}
                    </div>
                    <div className="expert-act-time">
                      {act.occurred_at || act.created_at || act.timestamp ? new Date(act.occurred_at || act.created_at || act.timestamp).toLocaleTimeString('en-US', {
                        hour: '2-digit', minute: '2-digit'
                      }) : 'Recently'}
                    </div>
                  </div>
                  <span className="expert-act-simple-text">{actionLabel}</span>
                </div>
              );
            })
          )}
        </div>

        {todayActivities.length > ITEMS_PER_PAGE && (
          <div className="expert-pagination">
            <button
              className="expert-btn-outline-small"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            >
              <ChevronLeft size={14} style={{ marginRight: '2px' }} /> Previous
            </button>
            <span className="expert-pagination-info">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="expert-btn-outline-small"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            >
              Next <ChevronRight size={14} style={{ marginLeft: '2px' }} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

export default SecurityDashboard;