import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Login from './pages/Login';
import AppointmentPage from './pages/AppointmentPage';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import HRDashboard from './pages/HRDashboard';
import SecurityDashboard from './pages/SecurityDashboard';
import ManageRequest from './pages/ManageRequest';
import History from './pages/History';
import BuildingVisitorTracking from './pages/BuildingVisitorTracking';
import VisitorHistory from './pages/VisitorHistory';
import Attendance from './pages/Attendance';
import Schedule from './pages/Schedule';
import SharedCalendar from './pages/SharedCalendar';
import Payroll from './pages/Payroll';
import PayrollMain from './pages/PayrollMain';
import PayrollHistory from './pages/PayrollHistory';
import PayrollSummary from './pages/PayrollSummary';
import Reports from './pages/Reports';
import EmployeeManagement from './pages/EmployeeManagement';
import LocationsManagement from './pages/LocationsManagement';
import CoursesManagement from './pages/CoursesManagement';
import LeaveManagement from './pages/LeaveManagement';
import LeaveBalancesManagement from './pages/LeaveBalancesManagement';
import EmergencyAlerts from './pages/EmergencyAlerts';
import ComplianceReports from './pages/ComplianceReports';
import AttendanceAppeals from './pages/AttendanceAppeals';
import AttendanceCorrection from './pages/AttendanceCorrection';
import Documents from './pages/Documents';
import PinChangeModal from './pages/PinChangeModal';
import PayrollHistoryModal from './pages/PayrollHistoryModal';
import useInactivityTimer from './hooks/useInactivityTimer';
import JobPostings from './pages/JobPostings';
import PerformanceEvaluation from './pages/PerformanceEvaluation';
import ToastNotification from './components/ToastNotification';
import { NotificationProvider } from './contexts/NotificationContext';
import Policies from './pages/Policies';
import Settings from './pages/Settings';
import AuditLogs from './pages/AuditLogs';
import RoleManagement from './pages/RoleManagement';
import SystemConfig from './pages/SystemConfig';
import 'leaflet/dist/leaflet.css';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import TodayVisitors from './pages/TodayVisitors';
import LocationTracking from './pages/LocationTracking';
import ManageReasons from './pages/ManageReasons';
import ManageBLETags from './pages/ManageBLETags';
import CompletedVisits from './pages/CompletedVisits';
import OvertimeRequests from './pages/OvertimeRequests';
import './App.css'; // Global Enterprise Styles

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentView, setCurrentView] = useState('appointment');
  const [showHistoryDetail, setShowHistoryDetail] = useState(false);

  const [payrollToken, setPayrollToken] = useState(null);
  const [payrollLocked, setPayrollLocked] = useState(true);

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinAdminEmail, setPinAdminEmail] = useState('');
  const [showPayrollHistoryModal, setShowPayrollHistoryModal] = useState(false);

  const adminEmail = localStorage.getItem('user_email') || '';

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const role = localStorage.getItem('user_role');

    if (token && role) {
      if (role === 'instructor') {
        localStorage.clear();
        return;
      }
      setIsAuthenticated(true);
      setCurrentView('dashboard');
    } else {
      localStorage.clear();
    }

    const savedPayrollToken = localStorage.getItem('payroll_token');
    if (savedPayrollToken) {
      setPayrollToken(savedPayrollToken);
      setPayrollLocked(false);
    }
  }, []);

  useInactivityTimer(
    15 * 60 * 1000,
    () => {
      setPayrollToken(null);
      setPayrollLocked(true);
      localStorage.removeItem('payroll_token');
      if (currentView === 'payroll-main' || currentView === 'payroll-history') {
        setCurrentView('payroll');
      }
    },
    !payrollLocked
  );

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    setIsLoggingIn(false);
    setCurrentView('appointment');
    setPayrollToken(null);
    setPayrollLocked(true);
  };

  const handleSetView = (view) => {
    if (view === 'payroll-main' || view === 'payroll-history') {
      if (!payrollToken) {
        setCurrentView('payroll');
        return;
      }
    }
    setCurrentView(view);
    setShowHistoryDetail(false);
  };

  const handlePayrollUnlock = (token) => {
    setPayrollToken(token);
    localStorage.setItem('payroll_token', token);
    setPayrollLocked(false);
    setCurrentView('payroll-main');
  };

  const openPinModalForAdmin = (email) => {
    setPinAdminEmail(email);
    setShowPinModal(true);
  };

  const openPayrollHistory = () => setShowPayrollHistoryModal(true);

  const getHeaderTitle = () => {
    if (showHistoryDetail) return { title: 'Visitor History' };
    switch (currentView) {
      case 'dashboard': return { title: 'Dashboard' };
      case 'manage-request': return { title: 'Manage Request' };
      case 'history': return { title: 'History' };
      case 'track-visitor': return { title: 'Building Visitor Tracking' };
      case 'attendance': return { title: 'Attendance' };
      case 'attendance-appeals': return { title: 'Attendance Appeals' };
      case 'schedule': return { title: 'Schedule' };
      case 'shared-calendar': return { title: 'Calendar' };
      case 'payroll': return { title: 'Payroll Security' };
      case 'payroll-main': return { title: 'Payroll Main' };
      case 'payroll-history': return { title: 'Payroll History' };
      case 'payroll-summary': return { title: 'Payroll Summary' };
      case 'reports': return { title: 'Reports Dashboard' };
      case 'compliance-reports': return { title: 'Compliance Reports' };
      case 'employee-management': return { title: 'Employee Management' };
      case 'locations': return { title: 'Manage Locations' };
      case 'courses': return { title: 'Manage Courses' };
      case 'leave-balances': return { title: 'Leave Balances' };
      case 'emergency-alerts': return { title: 'Emergency Alerts' };
      case 'profile': return { title: 'Admin Profile' };
      case 'job-postings': return { title: 'Job Postings' };
      case 'performance': return { title: 'Performance Evaluation' };
      case 'policies': return { title: 'HR Policies' };
      case 'settings': return { title: 'Settings' };
      case 'audit-logs': return { title: 'Audit Logs' };
      case 'role-management': return { title: 'Role Management' };
      case 'system-config': return { title: 'System Configuration' };
      case 'today-visitors': return { title: 'Today\'s Visitors' };
      case 'location-tracking': return { title: 'Location Tracking' };
      case 'manage-reasons': return { title: 'Manage Visit Reasons' };
      case 'manage-ble': return { title: 'Manage BLE Tags' };
      case 'completed-visits': return { title: 'Completed Visits' };
      case 'overtime-requests': return { title: 'Overtime Requests' };
      default: return { title: 'Dashboard' };
    }
  };

  const renderContent = () => {
    if (showHistoryDetail) return <VisitorHistory />;
    switch (currentView) {
      case 'dashboard': {
        const role = localStorage.getItem('user_role');
        if (role === 'admin') return <AdminDashboard setView={handleSetView} onShowPayrollHistory={openPayrollHistory} />;
        if (role === 'hr_admin') return <HRDashboard setView={handleSetView} />;
        if (role === 'security') return <SecurityDashboard setView={handleSetView} />;
        return <AdminDashboard setView={handleSetView} onShowPayrollHistory={openPayrollHistory} />;
      }
      case 'manage-request': return <ManageRequest />;
      case 'history': return <History />;
      case 'track-visitor': return <BuildingVisitorTracking />;
      case 'attendance': return <Attendance />;
      case 'schedule': return <Schedule />;
      case 'attendance-correction': return <AttendanceCorrection />;
      case 'attendance-appeals': return <AttendanceAppeals />;
      case 'overtime-requests': return <OvertimeRequests />;
      case 'leave-management': return <LeaveManagement />;
      case 'shared-calendar': return <SharedCalendar />;
      case 'job-postings': return <JobPostings />;
      case 'manage-ble': return <ManageBLETags />;
      case 'completed-visits': return <CompletedVisits />;
      case 'performance': return <PerformanceEvaluation />;
      case 'location-tracking': return <LocationTracking />;
      case 'policies': return <Policies />;
      case 'documents': return <Documents />;
      case 'audit-logs': return <AuditLogs />;
      case 'role-management': return <RoleManagement />;
      case 'manage-reasons': return <ManageReasons />;
      case 'system-config': return <SystemConfig />;
      case 'today-visitors': return <TodayVisitors />;
      case 'payroll': return <Payroll onUnlock={handlePayrollUnlock} adminEmail={adminEmail} />;
      case 'payroll-main':
        return (
          <PayrollMain
            setView={handleSetView}
            onChangePin={() => openPinModalForAdmin(adminEmail)}
            onShowHistory={openPayrollHistory}
          />
        );
      case 'payroll-history': return <PayrollHistory />;
      case 'payroll-summary': return <PayrollSummary />;
      case 'reports': return <Reports />;
      case 'compliance-reports': return <ComplianceReports />;
      case 'employee-management': return <EmployeeManagement onOpenPinChange={openPinModalForAdmin} />;
      case 'locations': return <LocationsManagement />;
      case 'courses': return <CoursesManagement />;
      case 'leave-balances': return <LeaveBalancesManagement />;
      case 'emergency-alerts': return <EmergencyAlerts />;
      case 'profile': return <Profile />;
      case 'settings': return <Settings />;
      default:
        return (
          <div style={{ textAlign: 'center', padding: '4rem', background: '#fff', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
            <h3 style={{ color: '#111827' }}>Page Not Found</h3>
            <p style={{ color: '#6B7280' }}>The module you are looking for does not exist or has been moved.</p>
          </div>
        );
    }
  };

  const { title } = getHeaderTitle();

  if (!isAuthenticated && !isLoggingIn) {
    return <AppointmentPage onAdminLogin={() => setIsLoggingIn(true)} />;
  }

  if (isLoggingIn && !isAuthenticated) {
    return <Login onBack={() => setIsLoggingIn(false)} />;
  }

  return (
    <NotificationProvider>
      <Layout
        currentView={currentView}
        setView={handleSetView}
        title={title}
        showBack={
          showHistoryDetail ||
          ['payroll-main', 'profile', 'payroll-history', 'settings', 'payroll-summary'].includes(currentView)
        }
        onBack={() => {
          if (showHistoryDetail) setShowHistoryDetail(false);
          else if (currentView === 'payroll-main') setCurrentView('payroll');
          else if (currentView === 'payroll-history') setCurrentView('payroll-main');
          else setCurrentView('dashboard');
        }}
        onLogout={handleLogout}
      >
        {renderContent()}
      </Layout>

      <ToastNotification />

      {showPinModal && (
        <PinChangeModal
          show={showPinModal}
          onClose={() => setShowPinModal(false)}
          adminEmail={pinAdminEmail}
        />
      )}
      
      {showPayrollHistoryModal && (
        <PayrollHistoryModal
          show={showPayrollHistoryModal}
          onClose={() => setShowPayrollHistoryModal(false)}
        />
      )}

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </NotificationProvider>
  );
}

export default App;