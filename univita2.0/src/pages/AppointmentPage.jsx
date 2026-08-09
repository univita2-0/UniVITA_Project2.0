import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Mail, Phone, MapPin, Clock, Calendar, User, MessageSquare,
  Award, Users, Plus, Trash2, ShieldCheck, X,
  Stethoscope, GraduationCap, Building2, Check, ArrowRight,
  Briefcase, FileText, Upload, Camera, BookOpen, DollarSign, Menu, AlertCircle
} from 'lucide-react';
import { API_BASE } from '../api';
import './AppointmentPage.css';
import simulation1 from '../assets/images/simulation1.png';
import simulation2 from '../assets/images/simulation2.png';
import simulation3 from '../assets/images/simulation3.png';
import simulation4 from '../assets/images/simulation4.png';
import classroom1 from '../assets/images/classroom1.png';

const AppointmentPage = ({ onAdminLogin }) => {
  const [activePage, setActivePage] = useState('home');

  // ---- Appointment booking state ----
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', date: '', time: '', message: '' });
  const [isMultipleVisitors, setIsMultipleVisitors] = useState(false);
  const [additionalVisitors, setAdditionalVisitors] = useState([]);
  const [visitReasons, setVisitReasons] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ---- Careers state ----
  const [jobs, setJobs] = useState([]);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  
  // ---- Job Details Modal state ----
  const [showJobDetailsModal, setShowJobDetailsModal] = useState(false);
  const [selectedJobDetails, setSelectedJobDetails] = useState(null);

  const [applicationForm, setApplicationForm] = useState({ full_name: '', email: '', phone: '', cover_letter: '', resume: null });
  const [submittingApplication, setSubmittingApplication] = useState(false);

  // ---- Fetch Fixed Visit Reasons (public) ----
  useEffect(() => {
    axios.get(`${API_BASE}/visit-reasons`)
      .then(res => setVisitReasons(res.data))
      .catch(console.error);
  }, []);

  // ---- Fetch open jobs (public) ----
  useEffect(() => {
    axios.get(`${API_BASE}/public/jobs`)
      .then(res => setJobs(res.data || []))
      .catch(console.error);
  }, []);

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const scrollToSection = (id) => {
    setActivePage('home');
    setTimeout(() => {
      const element = document.getElementById(id);
      if (element) {
        const headerOffset = 72; // Header height
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
      }
    }, 100);
    setMobileMenuOpen(false);
  };

  const addVisitorRow = () => setAdditionalVisitors([...additionalVisitors, { name: '' }]);
  const removeVisitorRow = (index) => setAdditionalVisitors(additionalVisitors.filter((_, i) => i !== index));
  const updateVisitorField = (index, field, value) => {
    const updated = [...additionalVisitors];
    updated[index][field] = value;
    setAdditionalVisitors(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.date || !formData.time || !formData.message) {
      showToast('Please fill in all required fields.', true);
      return;
    }

    // Validation: Office Hours Check (8 AM to 5 PM)
    const hour = parseInt(formData.time.split(':')[0], 10);
    if (hour < 8 || hour > 17) {
      showToast('Please select a time within office hours (8:00 AM - 5:00 PM).', true);
      return;
    }

    // Validation: Companions Check
    if (isMultipleVisitors && additionalVisitors.some(v => !v.name.trim())) {
      showToast('Please provide names for all additional companions.', true);
      return;
    }

    setIsSubmitting(true);
    try {
      const nameParts = formData.name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      const payload = {
        firstName, lastName,
        email: formData.email.trim(), phone: formData.phone.trim(),
        date: formData.date, time: formData.time,
        reason: formData.message, 
        additionalVisitors: isMultipleVisitors ? additionalVisitors.filter(v => v.name.trim()) : []
      };
      
      await axios.post(`${API_BASE}/appointments/book`, payload);
      showToast('Appointment request submitted! Check your email for confirmation.');
      setFormData({ name: '', email: '', phone: '', date: '', time: '', message: '' });
      setIsMultipleVisitors(false);
      setAdditionalVisitors([]);
      setShowAppointmentModal(false);
    } catch (err) {
      console.error(err);
      showToast('Submission failed. Please try again later.', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openApplyModal = (job) => {
    setSelectedJob(job);
    setApplicationForm({ full_name: '', email: '', phone: '', cover_letter: '', resume: null });
    setShowApplyModal(true);
  };

  const handleApplicationChange = (e) => {
    setApplicationForm({ ...applicationForm, [e.target.name]: e.target.value });
  };

  const handleResumeChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validation: 5MB size limit
      if (file.size > 5 * 1024 * 1024) {
        showToast('File size must be under 5MB.', true);
        e.target.value = '';
        return;
      }
      // Validation: Allowed types
      const allowedTypes = [
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      if (!allowedTypes.includes(file.type)) {
        showToast('Only PDF, DOC, or DOCX files are allowed.', true);
        e.target.value = '';
        return;
      }
      setApplicationForm({ ...applicationForm, resume: file });
    }
  };

  const submitApplication = async (e) => {
    e.preventDefault();
    if (!applicationForm.full_name.trim() || !applicationForm.email.trim() || !applicationForm.resume) {
      showToast('Please fill all required fields and attach a resume.', true);
      return;
    }
    setSubmittingApplication(true);
    try {
      const fd = new FormData();
      fd.append('job_id', selectedJob.id);
      fd.append('full_name', applicationForm.full_name.trim());
      fd.append('email', applicationForm.email.trim());
      fd.append('phone', applicationForm.phone.trim());
      fd.append('cover_letter', applicationForm.cover_letter.trim());
      fd.append('resume', applicationForm.resume);

      const res = await axios.post(`${API_BASE}/jobs/apply`, fd);

      if (res.data.success) {
        showToast('Application submitted successfully!');
        setShowApplyModal(false);
        setApplicationForm({ full_name: '', email: '', phone: '', cover_letter: '', resume: null });
      } else {
        showToast(res.data.error || 'Failed to submit application.', true);
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Network error';
      showToast(`Submission failed: ${msg}`, true);
    } finally {
      setSubmittingApplication(false);
    }
  };

  const courseCategories = [
    {
      title: "Enhancement Courses (E-Learning)",
      courses: [
        "Nursing", "Disease Epidemiology", "Sexual and Reproductive Health Education",
        "Statistics and Data Analysis Simplified", "Emergency Preparedness and Response",
        "Mental Health and Stress Management", "Sports Medicine", "Telemedicine",
        "Mindfulness for well-being", "Food as Medicine"
      ]
    },
    {
      title: "AHA BLS & ACLS Training (Medical Professionals)",
      courses: [
        "AHA HeartCode Basic Life Support (BLS)",
        "AHA Traditional Advanced Cardiovascular Life Support (ACLS)",
        "AHA Combined HeartCode BLS & Traditional ACLS"
      ]
    },
    {
      title: "AHA Heartsaver | First Aid Training (Non-Medical)",
      courses: [
        "AHA Heartsaver First Aid & CPR with AED (HS-CPRFA)",
        "AHA Heartsaver Basic Life Support (HS-BLS)",
        "AHA Heartsaver First Aid (HS-FA)"
      ]
    },
    {
      title: "PRC - CPD Courses",
      courses: [
        "Early Recognition of Patient Deterioration",
        "Patient Safety Systems & Error Prevention in Acute Care",
        "Advanced Nursing Assessment & Rapid Clinical Decision-Making"
      ]
    }
  ];

  const facilities = [
    { name: 'Simulation Lab', thumbnail: simulation1, images: [simulation1, simulation2, simulation3, simulation4] },
    { name: 'Classrooms', thumbnail: classroom1, images: [classroom1] }
  ];

  return (
    <div className="ap-landing">
      {/* HEADER */}
      <header className="ap-header">
        <div className="ap-header-container">
          <div className="ap-brand">
            <div className="ap-brand-icon-wrapper">
              <Stethoscope size={24} />
            </div>
            <span className="ap-brand-name">HCT Academy</span>
          </div>
          <nav className={`ap-nav ${mobileMenuOpen ? 'open' : ''}`}>
            <button className="ap-nav-close" onClick={() => setMobileMenuOpen(false)}><X size={24} /></button>
            <a className="ap-nav-link" onClick={() => { setActivePage('home'); setMobileMenuOpen(false); }}>Home</a>
            <a className="ap-nav-link" onClick={() => scrollToSection('about')}>About</a>
            <a className="ap-nav-link" onClick={() => { setActivePage('home'); scrollToSection('courses'); }}>Courses</a>
            <a className="ap-nav-link" onClick={() => { setActivePage('home'); scrollToSection('facilities'); }}>Facilities</a>
            <a className="ap-nav-link" onClick={() => setActivePage('careers')}>Careers</a>
            <button className="btn-ap-nav-primary" onClick={() => setShowAppointmentModal(true)}>Book Visit</button>
            <button className="btn-ap-nav-outline" onClick={onAdminLogin}>Admin Portal</button>
          </nav>
          <button className="ap-mobile-toggle" onClick={() => setMobileMenuOpen(true)}><Menu size={24} /></button>
        </div>
      </header>

      {/* HOME */}
      {activePage === 'home' && (
        <>
          {/* HERO */}
          <section id="home" className="ap-hero-section">
            <div className="ap-hero-grid">
              <div className="ap-hero-text">
                <span className="ap-hero-badge">Philippines' Premier Healthcare Academy</span>
                <h1 className="ap-hero-title">
                  <span className="text-white">Shaping Tomorrow's</span><br />
                  <span className="text-accent">Healthcare Heroes</span>
                </h1>
                <p>Experience world-class simulation-based training, expert instructors, and a curriculum designed to produce compassionate, competent professionals.</p>
                <div className="ap-hero-actions">
                  <button className="btn-ap-primary" onClick={() => setShowAppointmentModal(true)}>
                    <Calendar size={18} /> Schedule a Visit
                  </button>
                  <button className="btn-ap-secondary" onClick={() => scrollToSection('about')}>
                    Learn More <ArrowRight size={16} />
                  </button>
                </div>
              </div>
              <div className="ap-hero-visual">
                <div className="ap-floating-panel">
                  <div className="ap-floating-item float-1">
                    <div className="ap-float-icon"><ShieldCheck size={20} /></div>
                    <div><h4>Safe Campus</h4><p>BLE-powered visitor monitoring</p></div>
                  </div>
                  <div className="ap-floating-item float-2">
                    <div className="ap-float-icon"><Users size={20} /></div>
                    <div><h4>Industry Experts</h4><p>Professional healthcare instructors</p></div>
                  </div>
                  <div className="ap-floating-item float-3">
                    <div className="ap-float-icon"><GraduationCap size={20} /></div>
                    <div><h4>Career Ready</h4><p>Simulation-based healthcare training</p></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ABOUT */}
          <section id="about" className="ap-section bg-white">
            <div className="ap-container">
              <div className="ap-section-header">
                <span className="ap-tag">Why HCT Academy</span>
                <h2>Building Careers in Healthcare</h2>
                <p>Our approach combines cutting-edge simulation labs, experienced medical educators, and strong industry ties.</p>
              </div>
              <div className="ap-features-grid">
                <div className="ap-feature-card stagger-1">
                  <div className="ap-feature-icon"><Award size={24} /></div>
                  <h4>Accredited Programs</h4>
                  <p>CHED-recognized curricula aligned with global healthcare standards.</p>
                </div>
                <div className="ap-feature-card stagger-2">
                  <div className="ap-feature-icon"><Users size={24} /></div>
                  <h4>Expert Instructors</h4>
                  <p>Learn from practicing doctors and nurses with decades of experience.</p>
                </div>
                <div className="ap-feature-card stagger-3">
                  <div className="ap-feature-icon"><Building2 size={24} /></div>
                  <h4>Modern Facilities</h4>
                  <p>State-of-the-art simulation labs and smart classrooms.</p>
                </div>
              </div>
            </div>
          </section>

          {/* COURSES */}
          <section id="courses" className="ap-section bg-gray">
            <div className="ap-container">
              <div className="ap-section-header">
                <span className="ap-tag">Our Programs</span>
                <h2>Healthcare Courses</h2>
                <p>We offer a wide range of accredited programs designed to prepare you for a successful career in the healthcare industry.</p>
              </div>
              
              <div className="ap-course-wrapper">
                {courseCategories.map((category, idx) => (
                  <div key={idx} className={`ap-course-group stagger-${(idx % 3) + 1}`}>
                    <h3 className="ap-category-title">{category.title}</h3>
                    <div className="ap-course-list">
                      {category.courses.map((course, cIdx) => (
                        <div key={cIdx} className="ap-course-item">
                          <BookOpen size={16} className="ap-course-icon" />
                          <span>{course}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* FACILITIES */}
          <section id="facilities" className="ap-section bg-white">
            <div className="ap-container">
              <div className="ap-section-header">
                <span className="ap-tag">Campus</span>
                <h2>Our Facilities</h2>
                <p>Explore our modern learning environments designed for healthcare education.</p>
              </div>
              <div className="ap-facilities-grid">
                {facilities.map((fac, idx) => (
                  <div key={idx} className={`ap-facility-card stagger-${idx + 1}`} onClick={() => setSelectedFacility(fac)}>
                    <div className="ap-facility-img-wrapper">
                      <img src={fac.thumbnail} alt={fac.name} className="ap-facility-img" />
                      <div className="ap-facility-overlay">
                        <Camera size={24} color="white" />
                        <span>View Gallery</span>
                      </div>
                    </div>
                    <div className="ap-facility-name">
                      <span>{fac.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* CONTACT */}
          <section id="contact" className="ap-section bg-gray">
            <div className="ap-container">
              <div className="ap-section-header">
                <span className="ap-tag">Get In Touch</span>
                <h2>Contact Us</h2>
                <p>Have questions? Reach out to our team and we'll get back to you promptly.</p>
              </div>
              <div className="ap-contact-grid">
                <div className="ap-contact-card stagger-1">
                  <div className="ap-contact-icon"><MapPin size={24} /></div>
                  <h3>Visit Our Campus</h3>
                  <p>123 Healthcare Avenue<br />Pasay City, Metro Manila</p>
                </div>
                <div className="ap-contact-card stagger-2">
                  <div className="ap-contact-icon"><Phone size={24} /></div>
                  <h3>Call Us</h3>
                  <p>+63 (2) 1234 5678<br />+63 912 345 6789</p>
                </div>
                <div className="ap-contact-card stagger-3">
                  <div className="ap-contact-icon"><Mail size={24} /></div>
                  <h3>Email Us</h3>
                  <p>admissions@hct.ph<br />info@hct.ph</p>
                </div>
                <div className="ap-contact-card stagger-4">
                  <div className="ap-contact-icon"><Clock size={24} /></div>
                  <h3>Office Hours</h3>
                  <p>Mon - Fri: 8AM – 5PM<br />Saturday: 8AM – 12PM</p>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* CAREERS PAGE */}
      {activePage === 'careers' && (
        <section id="careers" className="ap-section bg-white min-h-screen pt-40">
          <div className="ap-container">
            <div className="ap-section-header">
              <span className="ap-tag">Join Our Team</span>
              <h2>Careers at HCT Academy</h2>
              <p>Explore open positions and become part of a leading healthcare education institution.</p>
            </div>
            <div className="ap-job-listings">
              {jobs.length === 0 ? (
                <div className="ap-empty-state">
                  <Briefcase size={48} className="ap-empty-icon" />
                  <p>No open positions at the moment.</p>
                  <span>Please check back later for new opportunities.</span>
                </div>
              ) : (
                <div className="ap-jobs-grid">
                  {jobs.map((job, idx) => (
                    <div key={job.id} className={`ap-job-card stagger-${(idx % 3) + 1}`}>
                      <div className="ap-job-header">
                        <div className="ap-job-icon"><Briefcase size={20} /></div>
                        <h3>{job.title}</h3>
                      </div>
                      
                      <div className="ap-job-meta">
                        <span><Building2 size={14} /> {job.department || 'General'}</span>
                        <span><Clock size={14} /> {job.employment_type}</span>
                      </div>
                      
                      <p className="ap-job-desc">
                        {job.description?.length > 120 ? `${job.description.substring(0, 120)}...` : job.description}
                      </p>
                      
                      <div className="ap-job-actions">
                        <button className="btn-ap-outline-sm" onClick={() => { setSelectedJobDetails(job); setShowJobDetailsModal(true); }}>
                          See Details
                        </button>
                        <button className="btn-ap-primary-sm" onClick={() => openApplyModal(job)}>
                          Apply Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="ap-footer">
        <div className="ap-footer-grid">
          <div className="ap-footer-brand">
            <div className="ap-footer-logo">
              <Stethoscope size={24} />
              <h3>HCT Academy</h3>
            </div>
            <p>Leading healthcare education provider committed to excellence and innovation.</p>
          </div>
          <div className="ap-footer-links">
            <h4>Quick Links</h4>
            <a onClick={() => { setActivePage('home'); setTimeout(() => scrollToSection('home'), 100); }}>Home</a>
            <a onClick={() => { setActivePage('home'); setTimeout(() => scrollToSection('about'), 100); }}>About</a>
            <a onClick={() => { setActivePage('home'); setTimeout(() => scrollToSection('courses'), 100); }}>Courses</a>
            <a onClick={() => { setActivePage('home'); setTimeout(() => scrollToSection('facilities'), 100); }}>Facilities</a>
          </div>
          <div className="ap-footer-links">
            <h4>Portal & Info</h4>
            <a onClick={() => setShowAppointmentModal(true)}>Book Appointment</a>
            <a onClick={() => setActivePage('careers')}>Careers</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
          <div className="ap-footer-contact">
            <h4>Connect</h4>
            <p><Mail size={14}/> info@hct.ph</p>
            <p><Phone size={14}/> +63 (2) 1234 5678</p>
          </div>
        </div>
        <div className="ap-footer-bottom">
          <p>© {new Date().getFullYear()} HCT Academy. All rights reserved.</p>
        </div>
      </footer>

      {/* APPOINTMENT MODAL */}
      {showAppointmentModal && (
        <div className="ap-modal-overlay" onClick={() => setShowAppointmentModal(false)}>
          <div className="ap-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2>Book a Campus Visit</h2>
              <button className="ap-btn-close" onClick={() => setShowAppointmentModal(false)}><X size={20} /></button>
            </div>
            <form className="ap-form" onSubmit={handleSubmit}>
              <div className="ap-form-row">
                <div className="ap-form-group">
                  <label>Full Name <span className="text-danger">*</span></label>
                  <input type="text" name="name" placeholder="Juan Dela Cruz" value={formData.name} onChange={handleChange} required />
                </div>
                <div className="ap-form-group">
                  <label>Email Address <span className="text-danger">*</span></label>
                  <input type="email" name="email" placeholder="juan@example.com" value={formData.email} onChange={handleChange} required />
                </div>
              </div>
              <div className="ap-form-row">
                <div className="ap-form-group">
                  <label>Phone Number</label>
                  <input type="tel" name="phone" placeholder="+63 912 345 6789" value={formData.phone} onChange={handleChange} />
                </div>
                <div className="ap-form-group">
                  <label>Reason for Visit <span className="text-danger">*</span></label>
                  <select name="message" value={formData.message} onChange={handleChange} required>
                    <option value="">Select a reason...</option>
                    {visitReasons.map(r => (
                      <option key={r.id} value={r.reason_text}>{r.reason_text}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="ap-form-row">
                <div className="ap-form-group">
                  <label>Preferred Date <span className="text-danger">*</span></label>
                  <input type="date" name="date" value={formData.date} onChange={handleChange} min={new Date().toISOString().split('T')[0]} required />
                </div>
                <div className="ap-form-group">
                  <label>Preferred Time <span className="text-danger">*</span></label>
                  <input type="time" name="time" value={formData.time} onChange={handleChange} required />
                  <span className="ap-input-hint">Office hours: 8:00 AM - 5:00 PM</span>
                </div>
              </div>
              
              <div className="ap-checkbox-field">
                <label>
                  <input type="checkbox" checked={isMultipleVisitors} onChange={e => setIsMultipleVisitors(e.target.checked)} /> 
                  I will be accompanied by other visitors
                </label>
              </div>
              
              {isMultipleVisitors && (
                <div className="ap-companions-box">
                  <p className="ap-companions-info">Please register all accompanying visitors for campus security clearance.</p>
                  {additionalVisitors.map((v, idx) => (
                    <div key={idx} className="ap-companion-row">
                      <input type="text" placeholder="Companion Full Name" value={v.name} onChange={e => updateVisitorField(idx, 'name', e.target.value)} required />
                      <button type="button" onClick={() => removeVisitorRow(idx)} title="Remove Companion"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  <button type="button" className="btn-ap-outline-sm" onClick={addVisitorRow}>
                    <Plus size={14} /> Add Companion
                  </button>
                </div>
              )}
              
              <div className="ap-modal-footer">
                <button type="button" className="btn-ap-cancel" onClick={() => setShowAppointmentModal(false)}>Cancel</button>
                <button type="submit" className="btn-ap-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting Request...' : 'Confirm Appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* JOB DETAILS MODAL (REDESIGNED FOOTER & LAYOUT) */}
      {showJobDetailsModal && selectedJobDetails && (
        <div className="ap-modal-overlay" onClick={() => setShowJobDetailsModal(false)}>
          <div className="ap-job-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ap-job-modal-header">
              <div className="ap-job-header-text">
                <h2>{selectedJobDetails.title}</h2>
                <div className="ap-job-meta-light">
                  <span><Building2 size={14}/> {selectedJobDetails.department || 'General'}</span>
                  <span><Clock size={14}/> {selectedJobDetails.employment_type}</span>
                </div>
              </div>
              <button className="ap-btn-close-light" onClick={() => setShowJobDetailsModal(false)}><X size={24} /></button>
            </div>

            <div className="ap-job-modal-body">
              <div className="ap-job-stats-grid">
                <div className="ap-stat-box">
                  <span className="ap-stat-label">Location Type</span>
                  <span className="ap-stat-val"><MapPin size={16} /> {selectedJobDetails.location_type || 'On-site'}</span>
                </div>
                {selectedJobDetails.location && (
                  <div className="ap-stat-box">
                    <span className="ap-stat-label">Specific Location</span>
                    <span className="ap-stat-val"><Building2 size={16} /> {selectedJobDetails.location}</span>
                  </div>
                )}
                <div className="ap-stat-box">
                  <span className="ap-stat-label">Monthly Salary</span>
                  <span className="ap-stat-val">
                    <DollarSign size={16} /> 
                    {(selectedJobDetails.salary_min || selectedJobDetails.salary_max) ? (
                      <>
                        {selectedJobDetails.salary_min ? `₱${Number(selectedJobDetails.salary_min).toLocaleString()}` : ''}
                        {selectedJobDetails.salary_min && selectedJobDetails.salary_max ? ' - ' : ''}
                        {selectedJobDetails.salary_max ? `₱${Number(selectedJobDetails.salary_max).toLocaleString()}` : ''}
                      </>
                    ) : 'Not specified'}
                  </span>
                </div>
              </div>

              <div className="ap-job-section">
                <h4>Role Description</h4>
                <p>{selectedJobDetails.description}</p>
              </div>

              {selectedJobDetails.requirements && (
                <div className="ap-job-section">
                  <h4>Requirements & Qualifications</h4>
                  <p>{selectedJobDetails.requirements}</p>
                </div>
              )}
            </div>

            {/* Redesigned Job Details Footer with Proper Padding */}
            <div className="ap-job-modal-footer">
              <button type="button" className="btn-ap-cancel" onClick={() => setShowJobDetailsModal(false)}>Close</button>
              <button type="button" className="btn-ap-primary" onClick={() => { setShowJobDetailsModal(false); openApplyModal(selectedJobDetails); }}>
                <FileText size={16} /> Apply Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPLY MODAL (REDESIGNED SPACING & FILE UPLOAD) */}
      {showApplyModal && selectedJob && (
        <div className="ap-modal-overlay" onClick={() => setShowApplyModal(false)}>
          <div className="ap-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2>Apply: {selectedJob.title}</h2>
              <button className="ap-btn-close" onClick={() => setShowApplyModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={submitApplication} className="ap-form">
              
              <div className="ap-form-group">
                <label>Full Name <span className="text-danger">*</span></label>
                <input type="text" name="full_name" value={applicationForm.full_name} onChange={handleApplicationChange} placeholder="e.g. Maria Santos" required />
              </div>

              <div className="ap-form-row">
                <div className="ap-form-group">
                  <label>Email Address <span className="text-danger">*</span></label>
                  <input type="email" name="email" value={applicationForm.email} onChange={handleApplicationChange} placeholder="e.g. maria@email.com" required />
                </div>
                <div className="ap-form-group">
                  <label>Phone Number</label>
                  {/* Pattern to allow standard mobile formats */}
                  <input type="tel" name="phone" pattern="[0-9+\-\s()]+" value={applicationForm.phone} onChange={handleApplicationChange} placeholder="e.g. +63 912 345 6789" />
                </div>
              </div>

              <div className="ap-form-group">
                <label>Cover Letter (Optional)</label>
                <textarea name="cover_letter" rows="4" value={applicationForm.cover_letter} onChange={handleApplicationChange} placeholder="Tell us why you're a great fit..." />
              </div>

              <div className="ap-form-group">
                <label>Resume / CV <span className="text-danger">*</span></label>
                
                {/* Redesigned File Upload Box */}
                <div className="ap-file-upload-box">
                  <input type="file" id="resume-upload" accept=".pdf,.doc,.docx" onChange={handleResumeChange} required className="ap-file-input-hidden" />
                  
                  <div className="ap-file-upload-content">
                    <div className="ap-file-icon">
                      <Upload size={24} />
                    </div>
                    <div className="ap-file-text">
                      {applicationForm.resume ? (
                        <span className="ap-file-name-success"><Check size={16}/> {applicationForm.resume.name}</span>
                      ) : (
                        <span><label htmlFor="resume-upload" className="ap-file-browse-link">Click to upload</label> or drag and drop</span>
                      )}
                    </div>
                    <span className="ap-input-hint">Max size: 5MB. Formats: PDF, DOC, DOCX.</span>
                  </div>
                  
                  {/* Absolute label layer to make whole box clickable easily */}
                  <label htmlFor="resume-upload" className="ap-file-upload-overlay"></label>
                </div>
              </div>

              <div className="ap-modal-footer">
                <button type="button" className="btn-ap-cancel" onClick={() => setShowApplyModal(false)}>Cancel</button>
                <button type="submit" className="btn-ap-primary" disabled={submittingApplication}>
                  {submittingApplication ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FACILITY GALLERY MODAL */}
      {selectedFacility && (
        <div className="ap-modal-overlay" onClick={() => setSelectedFacility(null)}>
          <div className="ap-gallery-modal" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2>{selectedFacility.name} Gallery</h2>
              <button className="ap-btn-close" onClick={() => setSelectedFacility(null)}><X size={24} /></button>
            </div>
            <div className="ap-gallery-grid">
              {selectedFacility.images.map((img, idx) => (
                <div key={idx} className="ap-gallery-img-box">
                  <img src={img} alt={`${selectedFacility.name} ${idx + 1}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className={`ap-toast fade-in-up ${toastMessage.isError ? 'error' : 'success'}`}>
          {toastMessage.isError ? <AlertCircle size={18} /> : <Check size={18} />}
          <span>{toastMessage.message}</span>
        </div>
      )}
    </div>
  );
};

export default AppointmentPage;