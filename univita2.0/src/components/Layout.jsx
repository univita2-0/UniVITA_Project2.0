// src/components/Layout.js
import React, { useState, useEffect } from 'react';
import './Layout.css';
import {
  ArrowLeft, User, Menu, X, ChevronDown, LayoutDashboard,
  Users, Calendar, Clock, Wallet, FileText, Settings, LogOut,
  UserCheck, Building, FileSpreadsheet, Bell, CalendarDays, Briefcase, Shield
} from 'lucide-react';
import ChatPanel from './ChatPanel';

// Menu configuration
const menuConfig = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, path: 'dashboard', roles: ['admin', 'hr_admin', 'security'] },
  { id: 'recruitment', label: 'Recruitment', icon: <Briefcase size={18} />, path: 'job-postings', roles: ['hr_admin'] },
  { id: 'employees', label: 'Employees', icon: <Users size={18} />, path: 'employee-management', roles: ['admin', 'hr_admin'] },
  {
    id: 'attendance', label: 'Attendance', icon: <Clock size={18} />,
    submenu: [
      { id: 'daily-attendance', label: 'Daily Attendance', path: 'attendance', roles: ['admin', 'hr_admin'] },
      { id: 'attendance-correction', label: 'Attendance Correction', path: 'attendance-correction', roles: ['admin', 'hr_admin'] },
      { id: 'attendance-appeals', label: 'Attendance Appeals', path: 'attendance-appeals', roles: ['admin', 'hr_admin'] },
      { id: 'overtime-requests', label: 'Overtime Requests', path: 'overtime-requests', roles: ['admin', 'hr_admin'] },
      { id: 'location-tracking', label: 'Location Tracking', path: 'location-tracking', roles: ['admin', 'hr_admin'] }
    ],
    roles: ['admin', 'hr_admin']
  },
  { id: 'salary-list', label: 'Payroll', icon: <Wallet size={18} />, path: 'payroll-main', roles: ['hr_admin'] },
  {
    id: 'leave-management', label: 'Leave Management', icon: <FileText size={18} />,
    submenu: [
      { id: 'leave-requests', label: 'Leave Requests', path: 'leave-management', roles: ['admin', 'hr_admin'] },
      { id: 'leave-balance', label: 'Leave Balance', path: 'leave-balances', roles: ['admin', 'hr_admin'] },
    ],
    roles: ['admin', 'hr_admin']
  },
  { id: 'schedule', label: 'Schedule', icon: <Calendar size={18} />, path: 'schedule', roles: ['admin', 'hr_admin'] },
  { id: 'shared-calendar', label: 'Shared Calendar', icon: <CalendarDays size={18} />, path: 'shared-calendar', roles: ['admin', 'hr_admin'] },
  {
    id: 'visitor', label: 'Visitor', icon: <UserCheck size={18} />,
    submenu: [
      { id: 'manage-request', label: 'Manage Request', path: 'manage-request', roles: ['admin'] },
      { id: 'manage-reasons', label: 'Manage Visit Reasons', path: 'manage-reasons', roles: ['admin'] },
      { id: 'today-visitors', label: "Today's Visitors", path: 'today-visitors', roles: ['security'] },
      { id: 'completed-visits', label: "Completed Visits", path: 'completed-visits', roles: ['admin', 'security'] },
      { id: 'track-visitor', label: 'Track Visitor', path: 'track-visitor', roles: ['security'] },
      { id: 'manage-ble', label: 'Manage BLE Tags', path: 'manage-ble', roles: ['admin'] },
      { id: 'manage-scanners', label: 'Manage Scanners', path: 'manage-scanners', roles: ['admin'] }
    ],
    roles: ['admin', 'security']
  },
  {
    id: 'facilities', label: 'Facilities', icon: <Building size={18} />,
    submenu: [
      { id: 'locations', label: 'Locations', path: 'locations', roles: ['admin'] },
      { id: 'courses', label: 'Courses', path: 'courses', roles: ['admin'] }
    ],
    roles: ['admin']
  },
  { id: 'emergency', label: 'Emergency Alerts', icon: <Bell size={18} />, path: 'emergency-alerts', roles: ['admin', 'hr_admin'] },
  {
    id: 'reports', label: 'Reports', icon: <FileSpreadsheet size={18} />,
    submenu: [
      { id: 'reports-dashboard', label: 'Reports Dashboard', path: 'reports', roles: ['admin', 'hr_admin'] },
      { id: 'compliance-reports', label: 'Compliance Reports', path: 'compliance-reports', roles: ['admin', 'hr_admin'] }
    ],
    roles: ['admin', 'hr_admin']
  },
  {
    id: 'admin', label: 'Administration', icon: <Shield size={18} />,
    submenu: [
      { id: 'audit-logs', label: 'Audit Logs', path: 'audit-logs', roles: ['admin'] },
      { id: 'role-management', label: 'Role Management', path: 'role-management', roles: ['admin'] },
      { id: 'system-config', label: 'System Config', path: 'system-config', roles: ['admin'] },
    ],
    roles: ['admin']
  }
];

const Layout = ({ children, currentView, setView, title, showBack, onBack, onLogout }) => {
  const [dateString, setDateString] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  
  const token = localStorage.getItem('auth_token');
  const userRole = localStorage.getItem('user_role') || 'instructor';

  useEffect(() => {
    const date = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    setDateString(date.toLocaleDateString('en-US', options));
  }, []);

  const toggleMenu = (menuId) => {
    setExpandedMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  const isActive = (path) => currentView === path;

  const handleNavClick = (path) => {
    setView(path);
    setSidebarOpen(false);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    onLogout();
  };

  const getFilteredMenu = () => {
    return menuConfig.filter(item => {
      if (!item.roles.includes(userRole)) return false;
      if (item.submenu) {
        const filteredSub = item.submenu.filter(sub => sub.roles.includes(userRole));
        if (filteredSub.length === 0) return false;
        item.filteredSubmenu = filteredSub;
      }
      return true;
    });
  };

  const renderMenuItems = () => {
    const menu = getFilteredMenu();
    return menu.map(item => {
      const hasSubmenu = item.filteredSubmenu && item.filteredSubmenu.length > 0;
      const isExpanded = expandedMenus[item.id];
      const isItemActive = hasSubmenu
        ? item.filteredSubmenu.some(sub => isActive(sub.path))
        : isActive(item.path);

      return (
        <div key={item.id} className="lay-nav-group">
          <div
            className={`lay-nav-parent ${isItemActive ? 'active' : ''}`}
            onClick={() => hasSubmenu ? toggleMenu(item.id) : handleNavClick(item.path)}
          >
            <div className="lay-nav-icon">{item.icon}</div>
            <span className="lay-nav-label">{item.label}</span>
            {hasSubmenu && (
              <ChevronDown size={14} className={`lay-nav-arrow ${isExpanded ? 'rotated' : ''}`} />
            )}
          </div>
          {hasSubmenu && isExpanded && (
            <div className="lay-nav-submenu">
              {item.filteredSubmenu.map(sub => (
                <div
                  key={sub.id}
                  className={`lay-nav-child ${isActive(sub.path) ? 'active' : ''}`}
                  onClick={() => handleNavClick(sub.path)}
                >
                  <span className="lay-nav-child-label">{sub.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  if (userRole === 'instructor') return null;

  return (
    <div className="lay-container">
      <aside className={`lay-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <button className="lay-sidebar-close" onClick={() => setSidebarOpen(false)}>
          <X size={20} />
        </button>
        
        <div className="lay-brand">
          <h1>UniVITA</h1>
        </div>
        
        <nav className="lay-nav-container">
          {renderMenuItems()}
        </nav>
        
        <div className="lay-sidebar-footer">
          <div className="lay-nav-group" onClick={() => handleNavClick('settings')}>
            <div className={`lay-nav-parent ${isActive('settings') ? 'active' : ''}`}>
              <div className="lay-nav-icon"><Settings size={18} /></div>
              <span className="lay-nav-label">Settings</span>
            </div>
          </div>
          <div className="lay-nav-group" onClick={() => setShowLogoutModal(true)}>
            <div className="lay-nav-parent logout">
              <div className="lay-nav-icon"><LogOut size={18} /></div>
              <span className="lay-nav-label">Logout</span>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className="lay-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <main className="lay-main-content">
        <header className="lay-top-header">
          <div className="lay-header-left">
            <button className="lay-hamburger" onClick={() => setSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            {showBack && (
              <button className="lay-back-btn" onClick={onBack}>
                <ArrowLeft size={16} /> <span>Back</span>
              </button>
            )}
            <div className="lay-header-info">
              <h2>{title}</h2>
              <p>{dateString}</p>
            </div>
          </div>
          <div className="lay-header-right">
            <div className="lay-profile-trigger" onClick={() => handleNavClick('profile')}>
              <div className="lay-avatar">
                <User size={16} color="white" />
              </div>
              <span>Administrator</span>
            </div>
          </div>
        </header>
        
        <div className="lay-page-wrapper">
          {children}
        </div>
      </main>

      {token && <ChatPanel token={token} />}

      {showLogoutModal && (
        <div className="lay-logout-overlay" onClick={() => setShowLogoutModal(false)}>
          <div className="lay-logout-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lay-logout-icon-wrapper">
              <LogOut size={24} />
            </div>
            <h3>Confirm Logout</h3>
            <p>Are you sure you want to logout?</p>
            <div className="lay-logout-actions">
              <button className="btn-logout-no" onClick={() => setShowLogoutModal(false)}>No</button>
              <button className="btn-logout-yes" onClick={confirmLogout}>Yes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;