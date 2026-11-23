import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronDown,
  Clock3,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserCheck,
  UserRound,
  Users,
  Wallet,
  X
} from 'lucide-react';

import ChatPanel from './ChatPanel';
import { canAccessRoute, getUserRole } from '../permissions';
import './Layout.css';

// -----------------------------------------------------------------------------
// Sidebar configuration
// Two levels only: module -> page. Route identifiers are intentionally unchanged.
// Visibility is controlled by canAccessRoute() in permissions.js.
// -----------------------------------------------------------------------------
const menuConfig = [
  {
    id: 'dashboard',
    label: 'Overview',
    icon: LayoutDashboard,
    path: 'dashboard'
  },
  {
    id: 'recruitment',
    label: 'Recruitment',
    icon: BriefcaseBusiness,
    path: 'job-postings'
  },
  {
    id: 'employees',
    label: 'Employees',
    icon: Users,
    submenu: [
      { id: 'employee-information', label: 'Employee Information', path: 'employee-management' },
      { id: 'account-access', label: 'Account Access', path: 'account-management' },
      { id: 'role-management', label: 'Role Management', path: 'role-management' }
    ]
  },
  {
    id: 'attendance-monitoring',
    label: 'Attendance',
    icon: Clock3,
    submenu: [
      { id: 'daily-attendance', label: 'Attendance Log', path: 'attendance' },
      { id: 'location-tracking', label: 'Location Tracking', path: 'location-tracking' }
    ]
  },
  {
    id: 'requests-management',
    label: 'Requests Management',
    icon: ClipboardCheck,
    submenu: [
      { id: 'attendance-correction', label: 'Attendance Corrections', path: 'attendance-correction' },
      { id: 'attendance-appeals', label: 'Attendance Appeals', path: 'attendance-appeals' },
      { id: 'overtime-requests', label: 'Overtime Requests', path: 'overtime-requests' },
      { id: 'leave-requests', label: 'Leave Requests', path: 'leave-management' },
      { id: 'leave-balance', label: 'Leave Balances', path: 'leave-balances' }
    ]
  },
  {
    id: 'salary-list',
    label: 'Payroll',
    icon: Wallet,
    path: 'payroll-main'
  },
  {
    id: 'scheduling-calendar',
    label: 'Schedule & Calendar',
    icon: CalendarDays,
    submenu: [
      { id: 'schedule', label: 'Instructor Schedules', path: 'schedule' },
      { id: 'shared-calendar', label: 'Shared Calendar', path: 'shared-calendar' }
    ]
  },
  {
    id: 'visitor',
    label: 'Visitor Management',
    icon: UserCheck,
    submenu: [
      { id: 'manage-request', label: 'Appointment Requests', path: 'manage-request' },
      { id: 'today-visitors', label: "Today's Visitors", path: 'today-visitors' },
      { id: 'completed-visits', label: 'Completed Visits', path: 'completed-visits' },
      { id: 'track-visitor', label: 'Visitor Tracking', path: 'track-visitor' },
      { id: 'manage-reasons', label: 'Visit Reasons', path: 'manage-reasons' },
      { id: 'manage-ble', label: 'BLE Tags', path: 'manage-ble' },
      { id: 'manage-scanners', label: 'BLE Scanners', path: 'manage-scanners' }
    ]
  },
  {
    id: 'facilities',
    label: 'Facilities',
    icon: Building2,
    submenu: [
      { id: 'locations', label: 'Locations', path: 'locations' },
      { id: 'programs', label: 'Programs', path: 'programs' },
      { id: 'courses', label: 'Courses', path: 'courses' }
    ]
  },
  {
    id: 'emergency',
    label: 'Emergency Alerts',
    icon: Bell,
    path: 'emergency-alerts'
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: FileSpreadsheet,
    path: 'reports'
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: ShieldCheck,
    submenu: [
      { id: 'audit-logs', label: 'Audit Logs', path: 'audit-logs' },
      { id: 'system-config', label: 'System Configuration', path: 'system-config' },
      { id: 'landing-cms', label: 'Website Content', path: 'landing-cms' }
    ]
  }
];

// -----------------------------------------------------------------------------
// Role labels and navigation helpers
// -----------------------------------------------------------------------------
const canSee = (path, role) => canAccessRoute(role, path);
const ROLE_LABELS = {
  admin: 'Administrator',
  hr_admin: 'HR Personnel',
  security: 'Security Personnel'
};

const isPathActive = (path, currentView) => {
  if (path === 'payroll-main' && typeof currentView === 'string' && currentView.startsWith('payroll')) {
    return true;
  }
  return path === currentView;
};

// Filter navigation at every nesting level using the central route policy.
// A parent is visible only when at least one permitted descendant remains.
const filterMenuByRole = (items, role) => items.reduce((visible, item) => {
  if (item.submenu) {
    const children = filterMenuByRole(item.submenu, role);
    if (children.length) {
      visible.push({ ...item, submenu: children });
    }
  } else if (item.path && canSee(item.path, role)) {
    visible.push(item);
  }
  return visible;
}, []);

// Used for parent highlights and for opening every ancestor of an active leaf.
const isMenuItemActive = (item, currentView) => item.submenu
  ? item.submenu.some(child => isMenuItemActive(child, currentView))
  : isPathActive(item.path, currentView);

const findActiveParentIds = (items, currentView, parents = []) => {
  for (const item of items) {
    if (item.submenu) {
      const match = findActiveParentIds(item.submenu, currentView, [...parents, item.id]);
      if (match) {
        return match;
      }
    } else if (isPathActive(item.path, currentView)) {
      return parents;
    }
  }
  return null;
};

// -----------------------------------------------------------------------------
// Reusable sidebar menu item
// -----------------------------------------------------------------------------
// Shared renderer supports the Employees submenu and all existing navigation groups.
const SidebarMenuItem = ({ item, depth = 0, currentView, expandedMenus, onToggle, onNavigate }) => {
  const hasSubmenu = Boolean(item.submenu?.length);
  const expanded = Boolean(expandedMenus[item.id]);
  const active = isMenuItemActive(item, currentView);
  const Icon = item.icon;
  const submenuId = `lay-submenu-${item.id}`;

  return (
    <div className={`lay-nav-group lay-nav-depth-${depth}`}>
      <button
        type="button"
        className={`${depth === 0 ? 'lay-nav-parent' : 'lay-nav-child'} ${hasSubmenu ? 'lay-nav-branch' : ''} ${active ? 'active' : ''}`}
        onClick={() => {
          if (hasSubmenu) {
            onToggle(item.id);
          } else {
            onNavigate(item.path);
          }
        }}
        aria-current={!hasSubmenu && active ? 'page' : undefined}
        aria-expanded={hasSubmenu ? expanded : undefined}
        aria-controls={hasSubmenu ? submenuId : undefined}
      >
        {Icon && depth === 0 && <Icon className="lay-nav-icon" size={18} strokeWidth={1.9} aria-hidden="true" />}
        <span className="lay-nav-label">{item.label}</span>
        {hasSubmenu && (
          <ChevronDown
            size={15}
            className={`lay-nav-arrow ${expanded ? 'rotated' : ''}`}
            aria-hidden="true"
          />
        )}
      </button>
      {hasSubmenu && expanded && (
        <div
          className={`lay-nav-submenu ${depth > 0 ? 'lay-nav-submenu-nested' : ''}`}
          id={submenuId}
        >
          {item.submenu.map(child => (
            <SidebarMenuItem
              key={child.id}
              item={child}
              depth={depth + 1}
              currentView={currentView}
              expandedMenus={expandedMenus}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Main application layout
// -----------------------------------------------------------------------------
const Layout = ({ children, currentView, setView, title, showBack, onBack, onLogout }) => {
  // Sidebar and dialog state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [dateString, setDateString] = useState('');


  // Authenticated user context
  const token = localStorage.getItem('auth_token');
  const userRole = getUserRole() || 'instructor';

  const filteredMenu = useMemo(() => filterMenuByRole(menuConfig, userRole), [userRole]);

  // Sync header date
  useEffect(() => {
    const formatDate = () => {
      setDateString(new Date().toLocaleDateString('en-US', {
        timeZone: 'Asia/Manila',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }));
    };
    formatDate();
    const interval = setInterval(formatDate, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Keep the active route visible within its parent menu
  useEffect(() => {
    setSidebarOpen(false);

    const parentIds = findActiveParentIds(filteredMenu, currentView);
    if (!parentIds?.length) return;

    setExpandedMenus(previous => {
      if (window.innerWidth <= 1100) {
        const next = Object.fromEntries(parentIds.map((id) => [id, true]));
        const sameKeys = Object.keys(previous).length === Object.keys(next).length;
        if (sameKeys && parentIds.every((id) => previous[id])) return previous;
        return next;
      }

      if (parentIds.every((id) => previous[id])) return previous;

      const next = { ...previous };
      parentIds.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
  }, [currentView, filteredMenu]);

  // Close sidebar and logout dialog with Escape
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

  // Navigation and account actions
  const handleNavClick = (path) => {
    if (!canSee(path, userRole)) return;
    setView(path);
    setSidebarOpen(false);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    onLogout();
  };

  if (userRole === 'instructor') {
    return null;
  }

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
          {filteredMenu.map(item => (
            <SidebarMenuItem
              key={item.id}
              item={item}
              currentView={currentView}
              expandedMenus={expandedMenus}
              onToggle={(id) => {
                setExpandedMenus((previous) => {
                  const opening = !previous[id];

                  // On smaller screens, keep only one module expanded.
                  if (window.innerWidth <= 1100) {
                    return opening ? { [id]: true } : {};
                  }

                  return { ...previous, [id]: opening };
                });
              }}
              onNavigate={handleNavClick}
            />
          ))}
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

      {sidebarOpen && (
        <button
          type="button"
          className="lay-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

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
        <div className="lay-page-wrapper">
          {children}
        </div>
      </main>

      {token && (
        <ChatPanel token={token} />
      )}

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
