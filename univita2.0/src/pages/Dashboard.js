import { useAuth } from '../contexts/AuthContext';
import VisitorDashboard from './VisitorDashboard';
import HRDashboard from './HRDashboard';
import AdminDashboard from './AdminDashboard';
import SecurityDashboard from './SecurityDashboard';
import InstructorDashboard from './InstructorDashboard';

const Dashboard = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;

  switch (user.role) {
    case 'visitor': return <VisitorDashboard />;
    case 'hr': return <HRDashboard />;
    case 'admin': return <AdminDashboard />;
    case 'security': return <SecurityDashboard />;
    case 'instructor': return <InstructorDashboard />;
    default: return <div>Unauthorized</div>;
  }
};