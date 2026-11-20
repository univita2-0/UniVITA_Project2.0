import React, { useState, useEffect, useMemo } from 'react';
import './Layout.css';
import {
  ArrowLeft, UserRound, Menu, X, ChevronDown, LayoutDashboard,
  Users, Calendar, Clock3, Wallet, FileText, Settings, LogOut,
  UserCheck, Building2, FileSpreadsheet, Bell, CalendarDays,
  BriefcaseBusiness, ShieldCheck
} from 'lucide-react';
import ChatPanel from './ChatPanel';
import { canAccessRoute, getUserRole } from '../permissions';

// Route identifiers intentionally match App.js and permissions.js.
const menuConfig = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, path: 'dashboard' },
  { id: 'recruitment', label: 'Recruitment', icon: BriefcaseBusiness, path: 'job-postings' },
  { id: 'employees', label: 'Employees', icon: Users, path: 'employee-management' },
  {
    id: 'attendance', label: 'Attendance', icon: Clock3,
    submenu: [
      { id: 'daily-attendance', label: 'Attendance Log', path: 'attendance' },
      { id: 'attendance-correction', label: 'Attendance Correction', path: 'attendance-correction' },
      { id: 'attendance-appeals', label: 'Attendance Appeals', path: 'attendance-appeals' },
      { id: 'overtime-requests', label: 'Overtime Requests', path: 'overtime-requests' },
      { id: 'location-tracking', label: 'Location Tracking', path: 'location-tracking' }
    ]
  },
  { id: 'salary-list', label: 'Payroll', icon: Wallet, path: 'payroll-main' },
  {
    id: 'leave-management', label: 'Leave Management', icon: FileText,
    submenu: [
      { id: 'leave-requests', label: 'Leave Requests', path: 'leave-management' },
      { id: 'leave-balance', label: 'Leave Balance', path: 'leave-balances' }
    ]
  },
  { id: 'schedule', label: 'Schedule', icon: Calendar, path: 'schedule' },
  { id: 'shared-calendar', label: 'Shared Calendar', icon: CalendarDays, path: 'shared-calendar' },
  {
    id: 'visitor', label: 'Visitor', icon: UserCheck,
    submenu: [
      { id: 'manage-request', label: 'Manage Request', path: 'manage-request' },
      { id: 'manage-reasons', label: 'Manage Visit Reasons', path: 'manage-reasons' },
      { id: 'today-visitors', label: "Today's Visitors", path: 'today-visitors' },
      { id: 'completed-visits', label: 'Completed Visits', path: 'completed-visits' },
      { id: 'track-visitor', label: 'Track Visitor', path: 'track-visitor' },
      { id: 'manage-ble', label: 'Manage BLE Tags', path: 'manage-ble' },
      { id: 'manage-scanners', label: 'Manage Scanners', path: 'manage-scanners' }
    ]
  },
  {
    id: 'facilities', label: 'Facilities', icon: Building2,
    submenu: [
      { id: 'locations', label: 'Locations', path: 'locations' },
      { id: 'programs', label: 'Programs', path: 'programs' },
      { id: 'courses', label: 'Courses', path: 'courses' }
    ]
  },
  { id: 'emergency', label: 'Emergency Alerts', icon: Bell, path: 'emergency-alerts' },
  {
    id: 'reports', label: 'Reports', icon: FileSpreadsheet,
    submenu: [
      { id: 'reports-dashboard', label: 'Reports Dashboard', path: 'reports' },
      { id: 'compliance-reports', label: 'Compliance Reports', path: 'compliance-reports' }
    ]
  },
  {
    id: 'admin', label: 'Administration', icon: ShieldCheck,
    submenu: [
      { id: 'audit-logs', label: 'Audit Logs', path: 'audit-logs' },
      { id: 'role-management', label: 'Role Management', path: 'role-management' },
      { id: 'system-config', label: 'System Config', path: 'system-config' },
      { id: 'landing-cms', label: 'Landing Page CMS', path: 'landing-cms' }
    ]
  }
];

const canSee = (path, role) => canAccessRoute(role, path);
const ROLE_LABELS = {
  admin: 'Administrator',
  hr_admin: 'HR Personnel',
  security: 'Security Personnel'
};

const isPathActive = (path, currentView) => {
  if (path === 'payroll-main' && typeof currentView === 'string' && currentView.startsWith('payroll')) return true;
  return path === currentView;
};

const Layout = ({ children, currentView, setView, title, showBack, onBack, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [dateString, setDateString] = useState('');

  const token = localStorage.getItem('auth_token');
  const userRole = getUserRole() || 'instructor';

  const filteredMenu = useMemo(() => menuConfig.reduce((visible, item) => {
    if (item.submenu) {
      const filteredSubmenu = item.submenu.filter(sub => canSee(sub.path, userRole));
      if (filteredSubmenu.length) visible.push({ ...item, filteredSubmenu });
    } else if (canSee(item.path, userRole)) {
      visible.push(item);
    }
    return visible;
  }, []), [userRole]);

  useEffect(() => {
    const formatDate = () => setDateString(new Date().toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }));
    formatDate();
    const interval = setInterval(formatDate, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
    const matchingParent = filteredMenu.find(item =>
      item.filteredSubmenu?.some(sub => isPathActive(sub.path, currentView))
    );
    if (matchingParent) {
      setExpandedMenus(prev => prev[matchingParent.id] ? prev : { ...prev, [matchingParent.id]: true });
    }
  }, [currentView, filteredMenu]);

  useEffect(() => {
    if (!sidebarOpen && !showLogoutModal) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        setShowLogoutModal(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen, showLogoutModal]);

  const handleNavClick = (path) => {
    if (!canSee(path, userRole)) return;
    setView(path);
    setSidebarOpen(false);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    onLogout();
  };

  if (userRole === 'instructor') return null;

  return (
    <div className="lay-container">
      <aside id="lay-sidebar" className={`lay-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="lay-brand">
          <div className="lay-brand-identity">
            
            <div className="lay-brand-copy">
              <span className="lay-brand-name">Uni<span>VITA</span></span>
              <span className="lay-brand-subtitle">Administration Portal</span>
            </div>
          </div>
          <button type="button" className="lay-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="lay-navigation-heading">WORKSPACE</div>
        <nav className="lay-nav-container" aria-label="Administrative modules">
          {filteredMenu.map(item => {
            const hasSubmenu = Boolean(item.filteredSubmenu?.length);
            const isExpanded = Boolean(expandedMenus[item.id]);
            const active = hasSubmenu
              ? item.filteredSubmenu.some(sub => isPathActive(sub.path, currentView))
              : isPathActive(item.path, currentView);
            const Icon = item.icon;

            return (
              <div key={item.id} className="lay-nav-group">
                <button
                  type="button"
                  className={`lay-nav-parent ${active ? 'active' : ''}`}
                  onClick={() => hasSubmenu
                    ? setExpandedMenus(prev => ({ ...prev, [item.id]: !prev[item.id] }))
                    : handleNavClick(item.path)}
                  aria-current={!hasSubmenu && active ? 'page' : undefined}
                  aria-expanded={hasSubmenu ? isExpanded : undefined}
                  aria-controls={hasSubmenu ? `lay-submenu-${item.id}` : undefined}
                >
                  <Icon className="lay-nav-icon" size={18} strokeWidth={1.9} aria-hidden="true" />
                  <span className="lay-nav-label">{item.label}</span>
                  {hasSubmenu && <ChevronDown size={15} className={`lay-nav-arrow ${isExpanded ? 'rotated' : ''}`} aria-hidden="true" />}
                </button>
                {hasSubmenu && isExpanded && (
                  <div className="lay-nav-submenu" id={`lay-submenu-${item.id}`}>
                    {item.filteredSubmenu.map(sub => (
                      <button
                        type="button"
                        key={sub.id}
                        className={`lay-nav-child ${isPathActive(sub.path, currentView) ? 'active' : ''}`}
                        aria-current={isPathActive(sub.path, currentView) ? 'page' : undefined}
                        onClick={() => handleNavClick(sub.path)}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="lay-sidebar-footer">
          {canSee('settings', userRole) && (
            <button type="button" className={`lay-nav-parent ${isPathActive('settings', currentView) ? 'active' : ''}`}
              onClick={() => handleNavClick('settings')} aria-current={currentView === 'settings' ? 'page' : undefined}>
              <Settings className="lay-nav-icon" size={18} strokeWidth={1.9} />
              <span className="lay-nav-label">Settings</span>
            </button>
          )}
          <button type="button" className="lay-nav-parent lay-nav-logout" onClick={() => setShowLogoutModal(true)}>
            <LogOut className="lay-nav-icon" size={18} strokeWidth={1.9} />
            <span className="lay-nav-label">Sign out</span>
          </button>
          <div className="lay-sidebar-account">
            <span className="lay-account-indicator" aria-hidden="true" />
            <span>{ROLE_LABELS[userRole] || 'Authorized Personnel'}</span>
          </div>
        </div>
      </aside>

      {sidebarOpen && <button type="button" className="lay-sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="Close navigation overlay" />}

      <main className="lay-main-content">
        <header className="lay-top-header">
          <div className="lay-header-left">
            <button type="button" className="lay-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open navigation" aria-controls="lay-sidebar" aria-expanded={sidebarOpen}>
              <Menu size={20} />
            </button>
            <div className="lay-header-info">
              
              <div className="lay-header-heading-row">
                {showBack && typeof onBack === 'function' && (
                  <button type="button" className="lay-back-btn" onClick={onBack} aria-label="Go back" title="Back">
                    <ArrowLeft size={18} />
                  </button>
                )}
                <h1>{title || 'Overview'}</h1>
              </div>
            </div>
          </div>
          <div className="lay-header-right">
            <div className="lay-header-date" aria-label="Current date">{dateString}</div>
            <span className="lay-header-divider" aria-hidden="true" />
            {canSee('profile', userRole) && (
              <button type="button" className={`lay-profile-trigger ${currentView === 'profile' ? 'active' : ''}`}
                onClick={() => handleNavClick('profile')} aria-label="Open profile">
                <span className="lay-avatar"><UserRound size={17} strokeWidth={2} /></span>
                <span className="lay-profile-details"><strong>My Profile</strong><small>{ROLE_LABELS[userRole] || 'Personnel'}</small></span>
                <ChevronDown size={15} className="lay-profile-chevron" aria-hidden="true" />
              </button>
            )}
          </div>
        </header>
        <div className="lay-page-wrapper">{children}</div>
      </main>

      {token && <ChatPanel token={token} />}

      {showLogoutModal && (
        <div className="lay-logout-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setShowLogoutModal(false); }}>
          <div className="lay-logout-modal" role="dialog" aria-modal="true" aria-labelledby="lay-logout-title" aria-describedby="lay-logout-description">
            <div className="lay-logout-icon-wrapper"><LogOut size={21} /></div>
            <h2 id="lay-logout-title">Sign out of UniVÍTA?</h2>
            <p id="lay-logout-description">Your current session will end. You will need to sign in again to access the administration portal.</p>
            <div className="lay-logout-actions">
              <button type="button" className="btn-logout-no" onClick={() => setShowLogoutModal(false)}>Cancel</button>
              <button type="button" className="btn-logout-yes" onClick={confirmLogout}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
