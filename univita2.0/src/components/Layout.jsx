// src/components/Layout.js
import React, { useState, useEffect } from 'react';
import './Layout.css';
import {
  ArrowLeft, User, Menu, X, ChevronDown, LayoutDashboard,
  Users, Calendar, Clock, Wallet, FileText, Settings, LogOut,
  UserCheck, Building, FileSpreadsheet, Bell, CalendarDays, Briefcase, Shield
} from 'lucide-react';
import ChatPanel from './ChatPanel';

// Menu configuration (roles: admin, hr_admin, security)
const menuConfig = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={20} />,
    path: 'dashboard',
    roles: ['admin', 'hr_admin', 'security']
  },
   {
    id: 'recruitment',
    label: 'Recruitment',
    icon: <Briefcase size={20} />,
    path: 'job-postings',
    roles: ['hr_admin']
  },
 {
    id: 'employees',
    label: 'Employees',
    icon: <Users size={20} />,
    path: 'employee-management',
    roles: ['admin', 'hr_admin']
  },
  {
    id: 'attendance',
    label: 'Attendance',
    icon: <Clock size={20} />,
    submenu: [
      { id: 'daily-attendance', label: 'Daily Attendance', path: 'attendance', roles: ['admin', 'hr_admin'] },
      { id: 'attendance-correction', label: 'Attendance Correction', path: 'attendance-correction', roles: ['admin', 'hr_admin'] },
      { id: 'attendance-appeals', label: 'Attendance Appeals', path: 'attendance-appeals', roles: ['admin', 'hr_admin'] },
      { id: 'location-tracking', label: 'Location Tracking', path: 'location-tracking', roles: ['admin', 'hr_admin'] }
    ],
    roles: ['admin', 'hr_admin']
  },
 
  {
    id: 'salary-list',
    label: 'Payroll',
    icon: <Wallet size={20} />,
    path: 'payroll-main',
    roles: ['hr_admin']
  },
  {
    id: 'leave-management',
    label: 'Leave Management',
    icon: <FileText size={20} />,
    submenu: [
      { id: 'leave-requests', label: 'Leave Requests', path: 'leave-management', roles: ['admin', 'hr_admin'] },
      { id: 'leave-balance', label: 'Leave Balance', path: 'leave-balances', roles: ['admin', 'hr_admin'] },
    ],
    roles: ['admin', 'hr_admin']
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: <Calendar size={20} />,
    path: 'schedule',
    roles: ['admin', 'hr_admin']
  },
  {
    id: 'shared-calendar',
    label: 'Shared Calendar',
    icon: <CalendarDays size={20} />,
    path: 'shared-calendar',
    roles: ['admin', 'hr_admin']
  },
  {
  id: 'visitor',
  label: 'Visitor',
  icon: <UserCheck size={20} />,
  submenu: [
    { id: 'manage-request', label: 'Manage Request', path: 'manage-request', roles: ['admin'] },
      { id: 'history', label: 'Visitor History', path: 'history', roles: ['admin'] },
      { id: 'manage-reasons', label: 'Manage Visit Reasons', path: 'manage-reasons', roles: ['admin'] },
    
    { id: 'today-visitors', label: "Today's Visitors", path: 'today-visitors', roles: ['security'] }, // NEW
    { id: 'completed-visits', label: "Completed Visits", path: 'completed-visits', roles: ['admin', 'security'] },
    { id: 'track-visitor', label: 'Track Visitor', path: 'track-visitor', roles: ['security'] },
    { id: 'manage-ble', label: 'Manage BLE Tags', path: 'manage-ble', roles: [ 'admin'] }
  ],
  roles: ['admin', 'security']
},
  {
    id: 'facilities',
    label: 'Facilities',
    icon: <Building size={20} />,
    submenu: [
      { id: 'locations', label: 'Locations', path: 'locations', roles: ['admin'] },
      { id: 'courses', label: 'Courses', path: 'courses', roles: ['admin'] }
    ],
    roles: ['admin']
  },
  {
    id: 'emergency',
    label: 'Emergency Alerts',
    icon: <Bell size={20} />,
    path: 'emergency-alerts',
    roles: ['admin', 'hr_admin']
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: <FileSpreadsheet size={20} />,
    submenu: [
      { id: 'reports-dashboard', label: 'Reports Dashboard', path: 'reports', roles: ['admin', 'hr_admin'] },
      { id: 'compliance-reports', label: 'Compliance Reports', path: 'compliance-reports', roles: ['admin', 'hr_admin'] }
    ],
    roles: ['admin', 'hr_admin']
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: <Shield size={20} />,
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
        <div key={item.id} className="nav-item-wrapper">
          <div
            className={`nav-parent ${isItemActive ? 'active' : ''}`}
            onClick={() => hasSubmenu ? toggleMenu(item.id) : handleNavClick(item.path)}
          >
            <div className="nav-icon">{item.icon}</div>
            <span className="nav-label">{item.label}</span>
            {hasSubmenu && (
              <ChevronDown
                size={16}
                className={`nav-arrow ${isExpanded ? 'rotated' : ''}`}
              />
            )}
          </div>
          {hasSubmenu && isExpanded && (
            <div className="nav-submenu">
              {item.filteredSubmenu.map(sub => (
                <div
                  key={sub.id}
                  className={`nav-child ${isActive(sub.path) ? 'active' : ''}`}
                  onClick={() => handleNavClick(sub.path)}
                >
                  <span className="nav-child-label">{sub.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  // If user is instructor, show nothing (they use mobile app)
  if (userRole === 'instructor') return null;

  return (
    <div className="layout-container">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>
          <X size={24} />
        </button>
        <div className="brand">
          <h1>UniVITA</h1>
        </div>
        <nav className="nav-container">
          {renderMenuItems()}
        </nav>
        <div className="sidebar-footer">
          <div className="nav-item-wrapper" onClick={() => handleNavClick('settings')}>
            <div className={`nav-parent ${isActive('settings') ? 'active' : ''}`}>
              <div className="nav-icon"><Settings size={20} /></div>
              <span className="nav-label">Settings</span>
            </div>
          </div>
          <div className="nav-item-wrapper" onClick={onLogout}>
            <div className="nav-parent">
              <div className="nav-icon"><LogOut size={20} /></div>
              <span className="nav-label">Logout</span>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="top-header">
          <div className="header-left">
            <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            {showBack && (
              <button className="back-btn" onClick={onBack}>
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="header-info">
              <h2>{title}</h2>
              <p>{dateString}</p>
            </div>
          </div>
          <div className="header-right">
            <div className="admin-profile-trigger" onClick={() => handleNavClick('profile')}>
              <div className="avatar-circle">
                <User size={18} color="white" />
              </div>
              <span>Profile</span>
            </div>
          </div>
        </header>
        <div className="page-content-wrapper">
          {children}
        </div>
      </main>

      {token && <ChatPanel token={token} />}
    </div>
  );
};

export default Layout;