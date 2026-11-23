
import React, { useState } from 'react';
import Reports from './Reports';
import ComplianceReports from './ComplianceReports';
import { getUserRole } from '../permissions';
import './ReportsWorkspace.css';

const ReportsWorkspace = ({ initialTab = 'analytics' }) => {
  const role = getUserRole();
  const canViewFormal = role === 'admin' || role === 'hr_admin';
  const [activeTab, setActiveTab] = useState(
    initialTab === 'formal' && canViewFormal ? 'formal' : 'analytics'
  );

  return (
    <main className="rw-page">
      <header className="rw-header">
        
      </header>

      <nav className="rw-tabs" role="tablist" aria-label="Report workspace">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'analytics'}
          className={`rw-tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Overview &amp; Analytics
        </button>
        {canViewFormal && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'formal'}
            className={`rw-tab ${activeTab === 'formal' ? 'active' : ''}`}
            onClick={() => setActiveTab('formal')}
          >
            Formal Reports
          </button>
        )}
      </nav>

      <section className="rw-content" role="tabpanel">
        {activeTab === 'formal' && canViewFormal
          ? <ComplianceReports />
          : <Reports />}
      </section>
    </main>
  );
};

export default ReportsWorkspace;
