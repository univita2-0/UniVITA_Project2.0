import React, { useState } from 'react';
import Reports from './Reports';
import ComplianceReports from './ComplianceReports';
import IncidentReports from './IncidentReports';
import { getUserRole } from '../permissions';
import './ReportsWorkspace.css';

const ReportsWorkspace = ({ initialTab = 'analytics' }) => {
  const role = getUserRole();
  const permitted = ['admin', 'hr_admin', 'security'].includes(role);
  const [activeTab, setActiveTab] = useState(initialTab === 'formal' ? 'formal' : 'analytics');
  const [formalSection, setFormalSection] = useState('incidents');

  if (!permitted) {
    return <main className="rw-page"><p role="alert">You do not have access to reports.</p></main>;
  }

  return (
    <main className="rw-page">
      <nav className="rw-tabs" role="tablist" aria-label="Reports workspace">
        <button type="button" role="tab" aria-selected={activeTab === 'analytics'}
          className={`rw-tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}>Overview &amp; Analytics</button>
        <button type="button" role="tab" aria-selected={activeTab === 'formal'}
          className={`rw-tab ${activeTab === 'formal' ? 'active' : ''}`}
          onClick={() => setActiveTab('formal')}>Formal Reports</button>
      </nav>
      <section className="rw-content" role="tabpanel">
        {activeTab === 'analytics' ? <Reports /> : (
          <>
            {(role === 'hr_admin' || role === 'admin') && (
              <div className="rw-formal-subnav" aria-label="Formal report types">
                <button type="button" className={formalSection === 'incidents' ? 'active' : ''}
                  aria-pressed={formalSection === 'incidents'} onClick={() => setFormalSection('incidents')}>Location Incident Reports</button>
                <button type="button" className={formalSection === 'compliance' ? 'active' : ''}
                  aria-pressed={formalSection === 'compliance'} onClick={() => setFormalSection('compliance')}>Attendance Compliance</button>
              </div>
            )}
            {(role === 'hr_admin' || role === 'admin') && formalSection === 'compliance'
              ? <ComplianceReports />
              : <IncidentReports role={role} />}
          </>
        )}
      </section>
    </main>
  );
};

export default ReportsWorkspace;
