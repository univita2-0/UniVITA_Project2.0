// src/pages/JobPostings.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  Plus, Edit3, Trash2, Calendar as CalendarIcon,
  Users, CheckCircle, XCircle, Power,
  MapPin, Search, ChevronLeft, ChevronRight, RefreshCw,
  Briefcase, ShieldAlert, AlertTriangle,
  ShieldCheck, FileText, Stethoscope
} from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';
import { useRole } from '../permissions';
import './JobPostings.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const staticBase = API_BASE.replace(/\/api$/, '');

const formatDateTime = (dateStr) => {
  if (!dateStr) return 'Not available';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
};

const NEXT_APPLICANT_STATUS = {
  new: ['reviewed', 'rejected'],
  reviewed: ['shortlisted', 'rejected'],
  shortlisted: ['hired', 'rejected'],
  rejected: [],
  hired: []
};

const getRecruitmentError = (err, fallback) =>
  err.response?.data?.message || err.response?.data?.error || fallback;

const needsOnboardingDocs = (app) =>
  app?.status === 'hired' &&
  !(app.nbi_verified && app.csc_form_verified && app.medical_verified);

const JobPostings = () => {
  const { can, isAdmin } = useRole();

  const [jobs, setJobs] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [jobForm, setJobForm] = useState({
    title: '', department: '', employment_type: 'Full-time',
    location_type: 'On-site', location: '', salary_min: '', salary_max: '',
    description: '', requirements: '', status: 'open', requires_prc: false
  });

  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [jobToToggle, setJobToToggle] = useState(null);

  const [showApplicantsModal, setShowApplicantsModal] = useState(false);
  const [currentJobForApplicants, setCurrentJobForApplicants] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [applicantTab, setApplicantTab] = useState('all');
  const [applicantSearch, setApplicantSearch] = useState('');
  const [applicantsPage, setApplicantsPage] = useState(1);
  const applicantsPerPage = 7;

  const [showApplicantDetailsModal, setShowApplicantDetailsModal] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [savingOnboarding, setSavingOnboarding] = useState(false);

  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [interviewApplicant, setInterviewApplicant] = useState(null);
  const [interviewForm, setInterviewForm] = useState({ date: '', time: '', notes: '' });
  const [interviewRecord, setInterviewRecord] = useState(null);
  const [loadingInterview, setLoadingInterview] = useState(false);
  const [showInterviewResultModal, setShowInterviewResultModal] = useState(false);
  const [interviewOutcome, setInterviewOutcome] = useState('passed');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [showCandidateDecision, setShowCandidateDecision] = useState(false);
  const [candidateDecisionStatus, setCandidateDecisionStatus] = useState('');
  const [candidateDecisionReason, setCandidateDecisionReason] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/jobs`, getAuthHeaders());
      setJobs(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const filteredJobs = jobs.filter(job => {
    if (activeTab === 'active' && job.status !== 'open') return false;
    if (activeTab === 'closed' && job.status !== 'closed') return false;
    if (searchTerm && !String(job.title || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const activeCount = jobs.filter(j => j.status === 'open').length;
  const closedCount = jobs.filter(j => j.status === 'closed').length;
  const applicantCount = jobs.reduce((total, job) => total + (Number(job.applicant_count) || 0), 0);

  const openJobForm = (job = null) => {
    if (job ? !can('jobs:edit') : !can('jobs:create')) {
      toast.error('You do not have permission to modify job postings.');
      return;
    }
    if (job) {
      setEditingJob(job);
      setJobForm({
        title: job.title,
        department: job.department || '',
        employment_type: job.employment_type || 'Full-time',
        location_type: job.location_type || 'On-site',
        location: job.location || '',
        salary_min: job.salary_min ?? '',
        salary_max: job.salary_max ?? '',
        description: job.description || '',
        requirements: job.requirements || '',
        status: job.status,
        requires_prc: !!job.requires_prc
      });
    } else {
      setEditingJob(null);
      setJobForm({
        title: '', department: '', employment_type: 'Full-time',
        location_type: 'On-site', location: '', salary_min: '', salary_max: '',
        description: '', requirements: '', status: 'open', requires_prc: false
      });
    }
    setShowJobModal(true);
  };

  const handleSaveJob = async () => {
    if (editingJob ? !can('jobs:edit') : !can('jobs:create')) return;

    if (!jobForm.title || !jobForm.description) {
      return toast.warning('Title and description are required.');
    }
    if (jobForm.salary_min === '' || jobForm.salary_max === '') {
      return toast.warning('Salary minimum and maximum are required.');
    }
    const salaryMin = Number(jobForm.salary_min);
    const salaryMax = Number(jobForm.salary_max);
    if (!Number.isFinite(salaryMin) || !Number.isFinite(salaryMax) || salaryMin < 0 || salaryMax < 0 ||
        !/^\d+(?:\.\d{1,2})?$/.test(String(jobForm.salary_min)) ||
        !/^\d+(?:\.\d{1,2})?$/.test(String(jobForm.salary_max))) {
      return toast.warning('Enter valid non-negative salaries (up to two decimal places).');
    }
    if (salaryMax < salaryMin) {
      return toast.warning('Maximum salary must be greater than or equal to minimum salary.');
    }

    setSaving(true);
    try {
      const payload = {
        ...jobForm,
        salary_min: Number(jobForm.salary_min),
        salary_max: Number(jobForm.salary_max),
        requires_prc: jobForm.requires_prc ? 1 : 0
      };

      if (editingJob) {
        await axios.put(`${API_BASE}/jobs/${editingJob.id}`, payload, getAuthHeaders());
        toast.success('Job posting updated successfully.');
      } else {
        await axios.post(`${API_BASE}/jobs`, payload, getAuthHeaders());
        toast.success('Job posting published successfully.');
      }
      setShowJobModal(false);
      fetchJobs();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to process request.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleClick = (job) => {
    if (!can('jobs:edit')) return;
    setJobToToggle(job);
    setShowStatusConfirm(true);
  };

  const confirmToggleStatus = async () => {
    if (!can('jobs:edit') || !jobToToggle) return;
    setSaving(true);
    const newStatus = jobToToggle.status === 'open' ? 'closed' : 'open';
    try {
      await axios.put(`${API_BASE}/jobs/${jobToToggle.id}`, {
        ...jobToToggle,
        status: newStatus,
        requires_prc: jobToToggle.requires_prc ? 1 : 0
      }, getAuthHeaders());
      toast.success(`Job ${newStatus === 'open' ? 'opened' : 'closed'} successfully.`);
      fetchJobs();
    } catch (err) {
      toast.error('Failed to update status.');
    } finally {
      setSaving(false);
      setShowStatusConfirm(false);
      setJobToToggle(null);
    }
  };

  const viewApplicants = async (job) => {
    setCurrentJobForApplicants(job);
    setApplicantsPage(1);
    setApplicantTab('all');
    setApplicantSearch('');
    try {
      const res = await axios.get(`${API_BASE}/jobs/${job.id}/applicants`, getAuthHeaders());
      setApplicants(res.data);
      setShowApplicantsModal(true);
    } catch (err) {
      toast.error('Failed to retrieve applicants.');
    }
  };

  const loadApplicantInterview = async (applicantId) => {
    setLoadingInterview(true);
    setInterviewRecord(null);
    try {
      const response = await axios.get(`${API_BASE}/recruitment/interviews/applicant/${applicantId}`, getAuthHeaders());
      setInterviewRecord(response.data?.interview || null);
    } catch (error) {
      // The applicant can still be reviewed when interview history is unavailable.
      toast.error(getRecruitmentError(error, 'Unable to retrieve interview details.'));
    } finally {
      setLoadingInterview(false);
    }
  };

  const openApplicantDetails = async (applicant) => {
    // Opening an application must never change its screening status.
    setSelectedApplicant(applicant);
    setShowApplicantDetailsModal(true);
    await loadApplicantInterview(applicant.id);
  };

  const refreshApplicant = async (applicantId) => {
    const res = await axios.get(`${API_BASE}/jobs/${currentJobForApplicants.id}/applicants`, getAuthHeaders());
    setApplicants(res.data);
    const latest = res.data.find(a => Number(a.id) === Number(applicantId));
    if (latest) setSelectedApplicant(latest);
    await fetchJobs();
    return latest;
  };

  const updateApplicantStatus = async (applicantId, newStatus, reason = '') => {
    if (!can('applicants:update') || saving) return;
    const current = applicants.find(a => Number(a.id) === Number(applicantId));
    if (!current || !(NEXT_APPLICANT_STATUS[current.status] || []).includes(newStatus)) {
      toast.error('This candidate status change is not permitted.');
      return;
    }
    if (newStatus === 'rejected' && reason.trim().length < 5) {
      toast.warning('Provide a brief internal reason for rejection (at least 5 characters).');
      return;
    }
    if (newStatus === 'hired' && (interviewRecord?.outcome !== 'passed' || Number(interviewRecord?.applicant_id) !== Number(applicantId))) {
      toast.warning('Record a passed interview before confirming a hire.');
      return;
    }
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/applicants/${applicantId}`,
        { status: newStatus, decision_reason: reason.trim() || null }, getAuthHeaders());
      await refreshApplicant(applicantId);
      setShowCandidateDecision(false);
      setCandidateDecisionReason('');
      toast.success(`Candidate status updated to ${newStatus}.`);
    } catch (err) {
      toast.error(getRecruitmentError(err, 'Failed to update candidate status.'));
    } finally {
      setSaving(false);
    }
  };

  const requestStatusChange = (newStatus) => {
    if (!selectedApplicant || newStatus === selectedApplicant.status) return;
    if (!(NEXT_APPLICANT_STATUS[selectedApplicant.status] || []).includes(newStatus)) return;
    if (newStatus === 'rejected' || newStatus === 'hired') {
      setCandidateDecisionStatus(newStatus);
      setCandidateDecisionReason('');
      setShowCandidateDecision(true);
      return;
    }
    updateApplicantStatus(selectedApplicant.id, newStatus);
  };

  const handleOnboardingToggle = async (field, value) => {
    if (!can('applicants:update') || savingOnboarding || !selectedApplicant || selectedApplicant.status !== 'hired') return;
    const previous = selectedApplicant;
    const updated = { ...selectedApplicant, [field]: value ? 1 : 0 };
    setSelectedApplicant(updated);
    setApplicants(prev => prev.map(a => a.id === updated.id ? { ...a, [field]: value ? 1 : 0 } : a));
    setSavingOnboarding(true);
    try {
      await axios.put(`${API_BASE}/applicants/${updated.id}/onboarding`, {
        nbi_verified: updated.nbi_verified,
        csc_form_verified: updated.csc_form_verified,
        medical_verified: updated.medical_verified
      }, getAuthHeaders());
      toast.success('Onboarding checklist updated.');
    } catch (err) {
      setSelectedApplicant(previous);
      setApplicants(prev => prev.map(a => a.id === previous.id ? previous : a));
      toast.error(getRecruitmentError(err, 'Failed to update onboarding checklist.'));
    } finally {
      setSavingOnboarding(false);
    }
  };

  const openScheduleInterview = (applicant) => {
    if (!can('applicants:update') || applicant.status !== 'shortlisted') return;
    setInterviewApplicant(applicant);
    setInterviewForm({ date: '', time: '', notes: '' });
    setShowInterviewModal(true);
  };

  const scheduleInterview = async () => {
    if (!can('applicants:update') || !interviewApplicant || saving) return;
    if (!interviewForm.date || !interviewForm.time) return toast.warning('Date and time are required.');
    if (new Date(`${interviewForm.date}T${interviewForm.time}`).getTime() <= Date.now()) {
      return toast.warning('Choose a future interview date and time.');
    }
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/recruitment/interviews`, {
        applicant_id: interviewApplicant.id,
        date: interviewForm.date,
        time: interviewForm.time,
        notes: interviewForm.notes.trim()
      }, getAuthHeaders());
      toast.success('Interview scheduled and saved.');
      setShowInterviewModal(false);
      await loadApplicantInterview(interviewApplicant.id);
    } catch (err) {
      toast.error(getRecruitmentError(err, 'Unable to schedule interview.'));
    } finally {
      setSaving(false);
    }
  };

  const recordInterviewOutcome = async () => {
    if (!can('applicants:update') || !interviewRecord || saving) return;
    if (interviewNotes.trim().length < 5) return toast.warning('Add an interview assessment of at least 5 characters.');
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/recruitment/interviews/${interviewRecord.id}/outcome`,
        { outcome: interviewOutcome, notes: interviewNotes.trim() }, getAuthHeaders());
      setShowInterviewResultModal(false);
      setInterviewNotes('');
      await loadApplicantInterview(interviewRecord.applicant_id);
      toast.success('Interview outcome recorded.');
    } catch (err) {
      toast.error(getRecruitmentError(err, 'Unable to save interview assessment.'));
    } finally {
      setSaving(false);
    }
  };

  const filteredApplicants = applicants.filter(a => {
    if (applicantTab !== 'all' && a.status !== applicantTab) return false;
    if (applicantSearch
      && !String(a.full_name || '').toLowerCase().includes(applicantSearch.toLowerCase())
      && !String(a.email || '').toLowerCase().includes(applicantSearch.toLowerCase())) return false;
    return true;
  });

  const totalApplicantPages = Math.ceil(filteredApplicants.length / applicantsPerPage);
  const paginatedApplicants = filteredApplicants.slice(
    (applicantsPage - 1) * applicantsPerPage,
    applicantsPage * applicantsPerPage
  );

  const allDocsVerified = selectedApplicant
    ? !!(selectedApplicant.nbi_verified && selectedApplicant.csc_form_verified && selectedApplicant.medical_verified)
    : false;

  return (
    <div className="jp-wrapper">
      {isAdmin && (
        <p className="jp-readonly-banner">View-only access</p>
      )}

      <header className="jp-header">
        <div className="jp-heading-block">
          
         
        </div>
        <div className="jp-header-actions">
          {can('jobs:create') && (
            <button type="button" className="jp-btn-primary" onClick={() => openJobForm()}>
              <Plus size={16} /> Create Job Post
            </button>
          )}
        </div>
      </header>

      <section className="jp-metric-grid" aria-label="Recruitment summary">
        <div className="jp-metric-card">
          <div className="jp-metric-heading"><span>All job postings</span></div>
          <strong>{jobs.length}</strong>
        </div>
        <div className="jp-metric-card">
          <div className="jp-metric-heading"><span>Active openings</span></div>
          <strong>{activeCount}</strong>
        </div>
        <div className="jp-metric-card">
          <div className="jp-metric-heading"><span>Closed postings</span></div>
          <strong>{closedCount}</strong>
        </div>
        <div className="jp-metric-card">
          <div className="jp-metric-heading"><span>Total applicants</span></div>
          <strong>{applicantCount}</strong>
        </div>
      </section>

      <div className="jp-main-card">
        <div className="jp-workspace-header">
          <div><p>Review positions and manage candidates from a single workspace.</p></div>
          <span className="jp-record-label">{filteredJobs.length} matching records</span>
        </div>
        <div className="jp-toolbar">
          <div className="jp-tabs">
            <button className={`jp-tab ${activeTab === 'active' ? 'active' : ''}`} onClick={() => { setActiveTab('active'); setCurrentPage(1); }}>
              Active Posts <span className="tab-count">{activeCount}</span>
            </button>
            <button className={`jp-tab ${activeTab === 'closed' ? 'active' : ''}`} onClick={() => { setActiveTab('closed'); setCurrentPage(1); }}>
              Closed <span className="tab-count">{closedCount}</span>
            </button>
          </div>

          <div className="jp-search">
            <Search size={16} className="text-muted" />
            <input
              type="text"
              aria-label="Search job postings by title"
              placeholder="Search job titles..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </div>

        <div className="jp-table-container">
          {loading ? (
            <div className="jp-loading">Loading job postings...</div>
          ) : (
            <table className="jp-table">
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Applicants</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedJobs.length === 0 ? (
                  <tr>
                    <td colSpan="5">
                      <div className="jp-empty">
                        
                        <p>No job postings found.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedJobs.map(job => (
                    <tr key={job.id}>
                      <td>
                        <div className="jp-cell-title">{job.title}</div>
                        <div className="jp-cell-sub">{job.department || 'General'}</div>
                      </td>
                      <td>
                        <div className="jp-cell-tags">
                          <span className="jp-tag">{job.employment_type}</span>
                          <span className="jp-tag">{job.location_type}</span>
                          {!!job.requires_prc && (
                            <span className="jp-tag prc">
                              PRC Required
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`jp-status ${job.status}`}>
                          {job.status === 'open' ? 'Open' : 'Closed'}
                        </span>
                      </td>
                      <td>
                        <div className="jp-applicant-count">
                                                    <strong>{Number(job.applicant_count) || 0}</strong>
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="jp-actions">
                          <button className="jp-btn-view" onClick={() => viewApplicants(job)}>
                            View Applicants
                          </button>

                          {can('jobs:edit') && (
                            <button className="jp-btn-icon" onClick={() => openJobForm(job)} title="Edit Job">Edit</button>
                          )}

                          {can('jobs:edit') && (
                            <button className={`jp-btn-icon ${job.status === 'open' ? 'warning' : 'success'}`} onClick={() => handleToggleClick(job)} title={job.status === 'open' ? 'Close job and retain applicants' : 'Reopen job posting'}>{job.status === 'open' ? 'Close' : 'Reopen'}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="jp-pagination">
            <span className="jp-page-text">Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredJobs.length)} of {filteredJobs.length} records</span>
            <div className="jp-page-controls">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={16} /> Prev</button>
              <span className="jp-page-num">{currentPage} / {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next <ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {/* --- CREATE / EDIT JOB MODAL --- */}
      <FormalModal
        show={showJobModal}
        onClose={() => setShowJobModal(false)}
        title={editingJob ? 'Edit Job Posting' : 'Create New Job Post'}
        wide
        footer={
          <>
            <button className="jp-btn-cancel" onClick={() => setShowJobModal(false)}>Cancel</button>
            <button className="jp-btn-primary" onClick={handleSaveJob} disabled={saving}>
              {saving ? 'Saving...' : editingJob ? 'Save Changes' : 'Publish Job'}
            </button>
          </>
        }
      >
        <div className="jp-form">
          <div className="jp-form-group">
            <label>Job Title <span className="text-danger">*</span></label>
            <input type="text" className="jp-input" value={jobForm.title} onChange={e => setJobForm({ ...jobForm, title: e.target.value })} placeholder="e.g. Senior Instructor" />
          </div>

          <div className="jp-form-row">
            <div className="jp-form-group">
              <label>Department</label>
              <input type="text" className="jp-input" value={jobForm.department} onChange={e => setJobForm({ ...jobForm, department: e.target.value })} placeholder="e.g. Academics" />
            </div>
            <div className="jp-form-group">
              <label>Employment Type</label>
              <select className="jp-input select" value={jobForm.employment_type} onChange={e => setJobForm({ ...jobForm, employment_type: e.target.value })}>
                <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option>
              </select>
            </div>
          </div>

          <div className="jp-form-row">
            <div className="jp-form-group">
              <label>Location Type</label>
              <select className="jp-input select" value={jobForm.location_type} onChange={e => setJobForm({ ...jobForm, location_type: e.target.value })}>
                <option>On-site</option><option>Remote</option><option>Hybrid</option>
              </select>
            </div>
            <div className="jp-form-group">
              <label>Specific Location</label>
              <input type="text" className="jp-input" value={jobForm.location} onChange={e => setJobForm({ ...jobForm, location: e.target.value })} placeholder="e.g. Main Campus" />
            </div>
          </div>

          <div className="jp-form-row">
            <div className="jp-form-group">
              <label>Min Salary (₱) <span className="text-danger">*</span></label>
              <input type="number" className="jp-input" value={jobForm.salary_min} onChange={e => setJobForm({ ...jobForm, salary_min: e.target.value })} placeholder="0.00" required />
            </div>
            <div className="jp-form-group">
              <label>Max Salary (₱) <span className="text-danger">*</span></label>
              <input type="number" className="jp-input" value={jobForm.salary_max} onChange={e => setJobForm({ ...jobForm, salary_max: e.target.value })} placeholder="0.00" required />
            </div>
          </div>

          <div className="jp-form-group">
            <label className="jp-checkbox-label">
              <input
                type="checkbox"
                checked={!!jobForm.requires_prc}
                onChange={e => setJobForm({ ...jobForm, requires_prc: e.target.checked })}
              />
              <span>Requires PRC License</span>
            </label>
            <span className="jp-field-hint">
              When enabled, the public form will request the applicant&apos;s PRC License Number.
            </span>
          </div>

          <div className="jp-form-group">
            <label>Job Description <span className="text-danger">*</span></label>
            <textarea className="jp-input jp-textarea" rows="4" value={jobForm.description} onChange={e => setJobForm({ ...jobForm, description: e.target.value })} placeholder="Detail the core responsibilities..." />
          </div>
          <div className="jp-form-group">
            <label>Requirements & Qualifications</label>
            <textarea className="jp-input jp-textarea" rows="3" value={jobForm.requirements} onChange={e => setJobForm({ ...jobForm, requirements: e.target.value })} placeholder="Detail required skills and experience..." />
          </div>
        </div>
      </FormalModal>

      {/* --- APPLICANTS PIPELINE MODAL --- */}
      <FormalModal
        show={showApplicantsModal}
        onClose={() => setShowApplicantsModal(false)}
        title={`Applicants for ${currentJobForApplicants?.title}`}
        footer={<button className="jp-btn-cancel" onClick={() => setShowApplicantsModal(false)}>Close</button>}
      >
        <div className="jp-ats-wrapper">
          <div className="jp-ats-toolbar">
            <div className="jp-ats-tabs">
              {['all', 'new', 'reviewed', 'shortlisted', 'rejected', 'hired'].map(tab => (
                <button
                  key={tab}
                  className={`jp-ats-tab ${applicantTab === tab ? 'active' : ''}`}
                  onClick={() => { setApplicantTab(tab); setApplicantsPage(1); }}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="jp-search full-width">
              <Search size={14} />
              <input type="text" aria-label="Search candidates by name or email" placeholder="Search candidates by name or email..." value={applicantSearch} onChange={e => { setApplicantSearch(e.target.value); setApplicantsPage(1); }} />
            </div>
          </div>

          <div className="jp-ats-list">
            {paginatedApplicants.length === 0 ? (
              <div className="jp-empty small">No candidates match the current filters.</div>
            ) : (
              paginatedApplicants.map(app => (
                <div className="jp-ats-row" key={app.id}>
                  <div className="jp-ats-user">
                    <div className="jp-ats-avatar">{app.full_name.charAt(0).toUpperCase()}</div>
                    <div className="jp-ats-info">
                      <div className="jp-ats-name">
                        <span className="jp-ats-name-text">{app.full_name}</span>
                        {needsOnboardingDocs(app) && (
                          <span title="Hired but onboarding documents are incomplete">
                          </span>
                        )}
                      </div>
                      <div className="jp-ats-email">{app.email}</div>
                    </div>
                  </div>
                  <div className="jp-ats-status">
                    <span className={`jp-app-badge ${app.status}`}>{app.status.toUpperCase()}</span>
                  </div>
                  <button className="jp-ats-action" onClick={() => openApplicantDetails(app)}>
                    Review <ChevronRight size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {totalApplicantPages > 1 && (
            <div className="jp-pagination small">
              <span className="jp-page-text">Page {applicantsPage} of {totalApplicantPages}</span>
              <div className="jp-page-controls">
                <button onClick={() => setApplicantsPage(p => Math.max(1, p - 1))} disabled={applicantsPage === 1}><ChevronLeft size={14} /></button>
                <button onClick={() => setApplicantsPage(p => Math.min(totalApplicantPages, p + 1))} disabled={applicantsPage === totalApplicantPages}><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>
      </FormalModal>

      {/* --- FORMAL CANDIDATE PROFILE MODAL --- */}
      <FormalModal
        show={showApplicantDetailsModal}
        onClose={() => setShowApplicantDetailsModal(false)}
        title="Candidate Profile"
        footer={
          <>
            <button className="jp-btn-cancel" onClick={() => setShowApplicantDetailsModal(false)}>Close</button>
            {can('applicants:update') && selectedApplicant?.status === 'shortlisted' && !interviewRecord?.id && !loadingInterview && (
              <button
                className="jp-btn-primary"
                onClick={() => { setShowApplicantDetailsModal(false); openScheduleInterview(selectedApplicant); }}
              >
                <CalendarIcon size={14} /> Schedule Interview
              </button>
            )}
          </>
        }
      >
        {selectedApplicant && (
          <div className="candidate-formal-layout">
            <div className="cf-section-label">Section 1 — Applicant Information</div>

            <div className="cf-row">
              <div className="cf-label">Name</div>
              <div className="cf-value">{selectedApplicant.full_name}</div>
            </div>

            <div className="cf-row">
              <div className="cf-label">Email Address</div>
              <div className="cf-value">{selectedApplicant.email}</div>
            </div>

            <div className="cf-row">
              <div className="cf-label">Phone Number</div>
              <div className="cf-value">{selectedApplicant.phone || '—'}</div>
            </div>

            <div className="cf-row">
              <div className="cf-label">PRC License No.</div>
              <div className="cf-value">
                {selectedApplicant.prc_license_no
                  ? <strong>{selectedApplicant.prc_license_no}</strong>
                  : <span className="text-muted">Not provided</span>}
              </div>
            </div>

            <div className="cf-row">
              <div className="cf-label">Resume / CV</div>
              <div className="cf-value">
                {selectedApplicant.resume_path ? (
                  <a className="cf-link" href={`${staticBase}${selectedApplicant.resume_path}`} target="_blank" rel="noreferrer">
                    View Document
                  </a>
                ) : <span className="text-muted">Not provided</span>}
              </div>
            </div>

            <div className="cf-row">
              <div className="cf-label">Transcript of Records (TOR)</div>
              <div className="cf-value">
                {selectedApplicant.tor_path ? (
                  <a className="cf-link" href={`${staticBase}${selectedApplicant.tor_path}`} target="_blank" rel="noreferrer">
                    View Document
                  </a>
                ) : <span className="text-muted">Not provided</span>}
              </div>
            </div>

            <div className="cf-row">
              <div className="cf-label">Date Applied</div>
              <div className="cf-value">{formatDateTime(selectedApplicant.applied_at)}</div>
            </div>

            {selectedApplicant.cover_letter && (
              <div className="cf-row vertical">
                <div className="cf-label">Cover Letter / Notes</div>
                <div className="cf-value cf-letter-text">
                  {selectedApplicant.cover_letter}
                </div>
              </div>
            )}

            <div className="cf-section-label">Section 2 — Application Status</div>

            <div className="cf-row">
              <div className="cf-label">Status</div>
              <div className="cf-value">
                {can('applicants:update') && (NEXT_APPLICANT_STATUS[selectedApplicant.status] || []).length > 0 ? (
                  <select
                    aria-label="Update candidate status"
                    className={`jp-input select small ${selectedApplicant.status}`}
                    value={selectedApplicant.status}
                    disabled={saving}
                    onChange={e => requestStatusChange(e.target.value)}
                  >
                    <option value={selectedApplicant.status}>{selectedApplicant.status.charAt(0).toUpperCase() + selectedApplicant.status.slice(1)}</option>
                    {(NEXT_APPLICANT_STATUS[selectedApplicant.status] || []).map(next => (
                      <option key={next} value={next}>{next.charAt(0).toUpperCase() + next.slice(1)}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`jp-badge-status ${selectedApplicant.status}`}>
                    {selectedApplicant.status.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <div className="cf-section-label">Interview Record</div>
            <div className="cf-row">
              <div className="cf-label">Interview Status</div>
              <div className="cf-value">
                {loadingInterview ? 'Loading…' : interviewRecord ?
                  `${interviewRecord.status === 'completed' ? 'Completed' : 'Scheduled'} — ${interviewRecord.outcome || 'Awaiting assessment'}` :
                  'No interview scheduled'}
              </div>
            </div>
            {interviewRecord && (
              <>
                <div className="cf-row">
                  <div className="cf-label">Schedule</div>
                  <div className="cf-value">{interviewRecord.interview_date} · {String(interviewRecord.interview_time).slice(0,5)}</div>
                </div>
                {interviewRecord.assessment_notes && <div className="cf-row vertical"><div className="cf-label">Interview Assessment</div><div className="cf-value">{interviewRecord.assessment_notes}</div></div>}
                {can('applicants:update') && selectedApplicant.status === 'shortlisted' && interviewRecord.status === 'scheduled' && (
                  <div className="cf-row">
                    <div className="cf-label">HR Decision</div>
                    <div className="cf-value"><button type="button" className="jp-btn-cancel" onClick={() => { setInterviewOutcome('passed'); setInterviewNotes(''); setShowInterviewResultModal(true); }}>Record Interview Outcome</button></div>
                  </div>
                )}
              </>
            )}

            {selectedApplicant.status === 'hired' && (
              <>
                <div className="cf-section-label">
                  Section 3 — Onboarding Checklist (201 File)
                </div>

                {!allDocsVerified && (
                  <div className="cf-onboard-alert">
                    <span>
                      Onboarding documents are <strong>incomplete</strong>. All three government
                      documents must be received and verified before the employee&apos;s 201 file
                      is considered complete.
                    </span>
                  </div>
                )}

                {allDocsVerified && (
                  <div className="cf-onboard-success">
                    <span>All onboarding documents verified. 201 file is complete.</span>
                  </div>
                )}

                <div className="cf-onboard-row">
                  <div className="cf-onboard-label"> NBI Clearance Received
                  </div>
                  <label className="cf-toggle">
                    <input
                      type="checkbox"
                      checked={!!selectedApplicant.nbi_verified}
                      onChange={(e) => handleOnboardingToggle('nbi_verified', e.target.checked)}
                      disabled={!can('applicants:update') || savingOnboarding}
                    />
                    <span className="cf-toggle-slider"></span>
                  </label>
                </div>

                <div className="cf-onboard-row">
                  <div className="cf-onboard-label"> CSC Form 212 Received
                  </div>
                  <label className="cf-toggle">
                    <input
                      type="checkbox"
                      checked={!!selectedApplicant.csc_form_verified}
                      onChange={(e) => handleOnboardingToggle('csc_form_verified', e.target.checked)}
                      disabled={!can('applicants:update') || savingOnboarding}
                    />
                    <span className="cf-toggle-slider"></span>
                  </label>
                </div>

                <div className="cf-onboard-row">
                  <div className="cf-onboard-label"> Medical Certificate Received
                  </div>
                  <label className="cf-toggle">
                    <input
                      type="checkbox"
                      checked={!!selectedApplicant.medical_verified}
                      onChange={(e) => handleOnboardingToggle('medical_verified', e.target.checked)}
                      disabled={!can('applicants:update') || savingOnboarding}
                    />
                    <span className="cf-toggle-slider"></span>
                  </label>
                </div>
              </>
            )}
          </div>
        )}
      </FormalModal>

      {/* --- INTERVIEW MODAL --- */}
      <FormalModal
        show={showInterviewModal}
        onClose={() => setShowInterviewModal(false)}
        title="Schedule Interview"
        footer={
          <>
            <button className="jp-btn-cancel" onClick={() => setShowInterviewModal(false)}>Cancel</button>
            <button className="jp-btn-primary" onClick={scheduleInterview} disabled={saving}>
              {saving ? 'Sending...' : 'Send Invite'}
            </button>
          </>
        }
      >
        <div className="jp-form">
          <div className="jp-form-row">
            <div className="jp-form-group">
              <label>Date <span className="text-danger">*</span></label>
              <input type="date" className="jp-input" value={interviewForm.date} onChange={e => setInterviewForm({ ...interviewForm, date: e.target.value })} min={new Date().toISOString().split('T')[0]} required />
            </div>
            <div className="jp-form-group">
              <label>Time <span className="text-danger">*</span></label>
              <input type="time" className="jp-input" value={interviewForm.time} onChange={e => setInterviewForm({ ...interviewForm, time: e.target.value })} required />
            </div>
          </div>
          <div className="jp-form-group">
            <label>Notes / Meeting Link</label>
            <input type="text" className="jp-input" value={interviewForm.notes} onChange={e => setInterviewForm({ ...interviewForm, notes: e.target.value })} placeholder="e.g. Zoom link or meeting room" />
          </div>
          <div className="jp-alert info">
            <span>Scheduling records the interview in Recruitment. Confirm the invitation with the applicant through your approved communication channel.</span>
          </div>
        </div>
      </FormalModal>

      <FormalModal
        show={showCandidateDecision}
        onClose={() => !saving && setShowCandidateDecision(false)}
        title={candidateDecisionStatus === 'hired' ? 'Confirm Hiring Decision' : 'Confirm Applicant Rejection'}
        footer={<>
          <button type="button" className="jp-btn-cancel" onClick={() => setShowCandidateDecision(false)} disabled={saving}>Cancel</button>
          <button type="button" className={`jp-btn-primary ${candidateDecisionStatus === 'rejected' ? 'danger' : ''}`}
            onClick={() => updateApplicantStatus(selectedApplicant.id, candidateDecisionStatus, candidateDecisionReason)} disabled={saving}>
            {saving ? 'Saving…' : candidateDecisionStatus === 'hired' ? 'Confirm Hire' : 'Confirm Rejection'}
          </button>
        </>}
      >
        <div className="jp-form">
          <p className="jp-decision-intro">{candidateDecisionStatus === 'hired' ?
            'Confirm the final hiring decision. The applicant must have a passed interview on record.' :
            'Record the internal reason for rejecting this application.'}</p>
          <div className="jp-form-group">
            <label htmlFor="candidate-decision-reason">Internal Decision Notes {candidateDecisionStatus === 'rejected' ? '*' : '(optional)'}</label>
            <textarea id="candidate-decision-reason" className="jp-input jp-textarea" maxLength={500} rows={3}
              value={candidateDecisionReason} onChange={e => setCandidateDecisionReason(e.target.value)} />
          </div>
        </div>
      </FormalModal>

      <FormalModal
        show={showInterviewResultModal}
        onClose={() => !saving && setShowInterviewResultModal(false)}
        title="Record Interview Assessment"
        footer={<>
          <button type="button" className="jp-btn-cancel" disabled={saving} onClick={() => setShowInterviewResultModal(false)}>Cancel</button>
          <button type="button" className="jp-btn-primary" disabled={saving} onClick={recordInterviewOutcome}>{saving ? 'Saving…' : 'Save Assessment'}</button>
        </>}
      >
        <div className="jp-form">
          <div className="jp-form-group">
            <label htmlFor="interview-outcome">Interview Outcome</label>
            <select id="interview-outcome" className="jp-input select" value={interviewOutcome} onChange={e => setInterviewOutcome(e.target.value)}>
              <option value="passed">Passed</option><option value="failed">Did Not Pass</option>
            </select>
          </div>
          <div className="jp-form-group">
            <label htmlFor="interview-assessment">Assessment / Remarks *</label>
            <textarea id="interview-assessment" className="jp-input jp-textarea" rows={4} maxLength={2000}
              value={interviewNotes} onChange={e => setInterviewNotes(e.target.value)} />
          </div>
        </div>
      </FormalModal>

      {/* --- STATUS CONFIRM MODAL --- */}
      <FormalModal show={showStatusConfirm} onClose={() => setShowStatusConfirm(false)} title="Confirm Status Change" footer={
        <>
          <button className="jp-btn-cancel" onClick={() => setShowStatusConfirm(false)}>Cancel</button>
          <button className="jp-btn-primary" onClick={confirmToggleStatus} disabled={saving}>
            {saving ? 'Processing...' : jobToToggle?.status === 'open' ? 'Close Job' : 'Reopen Job'}
          </button>
        </>
      }>
        <p style={{ margin: 0 }}>Are you sure you want to {jobToToggle?.status === 'open' ? 'close' : 'reopen'} the posting for <strong>{jobToToggle?.title}</strong>? Closed jobs remain available to HR with their applicant history preserved.</p>
      </FormalModal>
    </div>
  );
};

export default JobPostings;