import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import {
  Mail, Phone, MapPin, Clock, Calendar, User,
  Award, Users, Plus, Trash2, ShieldCheck, X,
  Stethoscope, GraduationCap, Building2, Check, ArrowRight,
  Briefcase, FileText, Upload, Camera, BookOpen, DollarSign, Menu, 
  AlertCircle, Download, ChevronLeft, ChevronRight, Sparkles, ExternalLink,
  Search, HeartHandshake, Zap
} from 'lucide-react';
import { API_BASE } from '../api';
import './AppointmentPage.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s()]{7,15}$/;

const getLocalTodayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getBackendBaseUrl = () => {
  if (API_BASE && (API_BASE.startsWith('http://') || API_BASE.startsWith('https://'))) {
    return API_BASE.replace(/\/api\/?$/, '');
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:5000';
    }
  }
  return 'https://api.univitahct.tech';
};

const resolveMediaUrl = (img) => {
  if (!img) return '';
  if (typeof img !== 'string') return '';
  if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:') || img.startsWith('blob:')) {
    return img;
  }
  const clean = img.startsWith('/') ? img : `/${img}`;
  return `${getBackendBaseUrl()}${clean}`;
};

const checkAdmissionsStatus = () => {
  try {
    const phDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const day = phDate.getDay();
    const timeNum = phDate.getHours() + phDate.getMinutes() / 60;

    if (day === 0) {
      return { 
        isOpen: false, 
        text: 'Admissions Closed', 
        note: 'Closed on Sundays • Opens Monday 8:00 AM' 
      };
    }
    if (day >= 1 && day <= 5) {
      if (timeNum >= 8 && timeNum < 17) {
        return { 
          isOpen: true, 
          text: 'Admissions Open', 
          note: 'Walk-ins & scheduled visits active today' 
        };
      }
      return { 
        isOpen: false, 
        text: 'Admissions Closed', 
        note: timeNum < 8 ? 'Opens today at 8:00 AM' : 'Closed for the day • Opens 8:00 AM tomorrow' 
      };
    }
    if (day === 6) {
      if (timeNum >= 8 && timeNum < 12) {
        return { 
          isOpen: true, 
          text: 'Admissions Open', 
          note: 'Saturday session until 12:00 PM' 
        };
      }
      return { 
        isOpen: false, 
        text: 'Admissions Closed', 
        note: 'Weekend hours concluded • Opens Monday 8:00 AM' 
      };
    }
    return { isOpen: false, text: 'Admissions Closed', note: 'Security registration is required at arrival.' };
  } catch (e) {
    return { isOpen: false, text: 'Admissions Closed', note: 'Security registration is required at arrival.' };
  }
};

const DEFAULT_COURSES = [
  {
    title: "Enhancement Courses (E-Learning)",
    badge: "Flexible Self-Paced",
    subtitle: "Self-paced digital modules designed for healthcare professionals.",
    description: "Enhance clinical expertise with interactive case studies, evidence-based practices, and flexible digital modules.",
    courses: [
      "Nursing", "Disease Epidemiology", "Sexual and Reproductive Health Education",
      "Statistics and Data Analysis Simplified", "Emergency Preparedness and Response",
      "Mental Health and Stress Management", "Sports Medicine", "Telemedicine",
      "Mindfulness for well-being", "Food as Medicine"
    ]
  },
  {
    title: "AHA BLS & ACLS Training",
    badge: "AHA Certified",
    subtitle: "American Heart Association certified life support programs.",
    description: "Master life-saving resuscitation techniques with hands-on high-fidelity simulation and AHA certification upon completion.",
    courses: [
      "AHA HeartCode Basic Life Support (BLS)",
      "AHA Traditional Advanced Cardiovascular Life Support (ACLS)",
      "AHA Combined HeartCode BLS & Traditional ACLS"
    ]
  },
  {
    title: "AHA Heartsaver | First Aid Training",
    badge: "Emergency Certification",
    subtitle: "Emergency response and life-saving first aid certification.",
    description: "Equip yourself or your team with essential first aid, CPR, and AED response skills certified by the American Heart Association.",
    courses: [
      "AHA Heartsaver First Aid & CPR with AED (HS-CPRFA)",
      "AHA Heartsaver Basic Life Support (HS-BLS)",
      "AHA Heartsaver First Aid (HS-FA)"
    ]
  },
  {
    title: "PRC - CPD Courses",
    badge: "PRC Accredited",
    subtitle: "Continuing professional development for licensed medical practitioners.",
    description: "Fulfill regulatory commission requirements with accredited CPD units and advanced clinical seminars.",
    courses: [
      "Early Recognition of Patient Deterioration",
      "Patient Safety Systems & Error Prevention in Acute Care",
      "Advanced Nursing Assessment & Rapid Clinical Decision-Making"
    ]
  }
];

const DEFAULT_FACILITIES = [
  { name: 'Simulation Lab', images: [] },
  { name: 'Classrooms', images: [] }
];

const DEFAULT_CONTACT = {
  address: '3F & 5F Westar Building, Shaw Boulevard\nPasig City, Metro Manila',
  phone_primary: '+63 (2) 1234 5678',
  phone_secondary: '+63 912 345 6789',
  email_admissions: 'admissions@hct.ph',
  email_general: 'info@hct.ph',
  hours_weekday: 'Mon - Fri: 8:00 AM – 5:00 PM',
  hours_weekend: 'Saturday: 8:00 AM – 12:00 PM',
  hours_sunday: 'Sunday: CLOSED'
};

const AppointmentPage = ({ onAdminLogin }) => {
  const [activePage, setActivePage] = useState('home');
  const [activeNav, setActiveNav] = useState('home');

  const [courseCategories, setCourseCategories] = useState(DEFAULT_COURSES);
  const [facilities, setFacilities] = useState(DEFAULT_FACILITIES);
  const [contactInfo, setContactInfo] = useState(DEFAULT_CONTACT);
  const [admissionsStatus, setAdmissionsStatus] = useState(checkAdmissionsStatus());

  useEffect(() => {
    const timer = setInterval(() => {
      setAdmissionsStatus(checkAdmissionsStatus());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activePage !== 'home') {
      setActiveNav('careers');
      return;
    }

    const handleScroll = () => {
      const sections = ['home', 'about', 'courses', 'facilities', 'contact'];
      const scrollPosition = window.scrollY + 120;

      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i]);
        if (el && scrollPosition >= el.offsetTop) {
          setActiveNav(sections[i]);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activePage]);

  const [currentCourseIndex, setCurrentCourseIndex] = useState(0);
  const [selectedCourseModal, setSelectedCourseModal] = useState(null);

  const [selectedFacility, setSelectedFacility] = useState(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', date: '', time: '', message: '' });

  // 3-Column Dropdown Time Picker State
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedPeriod, setSelectedPeriod] = useState('AM');
  const timePickerRef = useRef(null);

  const [isMultipleVisitors, setIsMultipleVisitors] = useState(false);
  const [additionalVisitors, setAdditionalVisitors] = useState([]);
  const [visitReasons, setVisitReasons] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [jobs, setJobs] = useState([]);
  const [jobSearchTerm, setJobSearchTerm] = useState('');
  const [jobDepartmentFilter, setJobDepartmentFilter] = useState('All');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showJobDetailsModal, setShowJobDetailsModal] = useState(false);
  const [selectedJobDetails, setSelectedJobDetails] = useState(null);
  const [applicationForm, setApplicationForm] = useState({ full_name: '', email: '', phone: '', cover_letter: '', resume: null });
  const [submittingApplication, setSubmittingApplication] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (timePickerRef.current && !timePickerRef.current.contains(event.target)) {
        setShowTimeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const applyTimeSelection = (h12, min, period) => {
    let h = parseInt(h12, 10);
    if (isNaN(h)) h = 9;
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const time24 = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    setFormData(prev => ({ ...prev, time: time24 }));
  };

  const handleHourClick = (h) => {
    setSelectedHour(h);
    applyTimeSelection(h, selectedMinute, selectedPeriod);
  };

  const handleMinuteClick = (m) => {
    setSelectedMinute(m);
    applyTimeSelection(selectedHour, m, selectedPeriod);
  };

  const handlePeriodClick = (p) => {
    setSelectedPeriod(p);
    applyTimeSelection(selectedHour, selectedMinute, p);
  };

  const handleCompanionCheckboxToggle = (e) => {
    const checked = e.target.checked;
    setIsMultipleVisitors(checked);
    if (checked && additionalVisitors.length === 0) {
      setAdditionalVisitors([{ name: '' }]);
    } else if (!checked) {
      setAdditionalVisitors([]);
    }
  };

  // Purely dynamic facility images loaded from CMS
  useEffect(() => {
    axios.get(`${API_BASE}/public/landing-content`)
      .then(res => {
        if (res.data) {
          if (Array.isArray(res.data.courses_catalog) && res.data.courses_catalog.length > 0) {
            setCourseCategories(res.data.courses_catalog);
          }
          if (Array.isArray(res.data.facilities_gallery) && res.data.facilities_gallery.length > 0) {
            const mapped = res.data.facilities_gallery.map(fac => {
              const formattedImages = (fac.images || []).map(img => resolveMediaUrl(img));
              return {
                name: fac.name,
                thumbnail: formattedImages[0] || '',
                images: formattedImages
              };
            });
            setFacilities(mapped);
          }
          if (res.data.contact_details) {
            setContactInfo(prev => ({ ...prev, ...res.data.contact_details }));
          }
        }
      })
      .catch(err => {
        console.warn('Using default landing content fallback', err);
      });
  }, []);

  useEffect(() => {
    axios.get(`${API_BASE}/visit-reasons`)
      .then(res => setVisitReasons(res.data))
      .catch(console.error);

    axios.get(`${API_BASE}/appointments/history`)
      .then(res => {
        const approved = (res.data || []).filter(item => item.status === 'APPROVED');
        setBookedSlots(approved);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    axios.get(`${API_BASE}/public/jobs`)
      .then(res => setJobs(res.data || []))
      .catch(console.error);
  }, []);

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchesSearch = 
        job.title?.toLowerCase().includes(jobSearchTerm.toLowerCase()) ||
        job.description?.toLowerCase().includes(jobSearchTerm.toLowerCase()) ||
        job.department?.toLowerCase().includes(jobSearchTerm.toLowerCase()) ||
        job.location?.toLowerCase().includes(jobSearchTerm.toLowerCase());
      
      const matchesDept = jobDepartmentFilter === 'All' || 
        (job.department || 'General').toLowerCase() === jobDepartmentFilter.toLowerCase();

      return matchesSearch && matchesDept;
    });
  }, [jobs, jobSearchTerm, jobDepartmentFilter]);

  const uniqueDepartments = useMemo(() => {
    const depts = new Set(jobs.map(j => j.department || 'General'));
    return ['All', ...Array.from(depts)];
  }, [jobs]);

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const scrollToSection = (id) => {
    setActiveNav(id);
    if (activePage !== 'home') {
      setActivePage('home');
      setTimeout(() => {
        const element = document.getElementById(id);
        if (element) {
          const headerOffset = 75; 
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
        }
      }, 120);
    } else {
      const element = document.getElementById(id);
      if (element) {
        const headerOffset = 75; 
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
      }
    }
    setMobileMenuOpen(false);
  };

  const navigateToCareers = () => {
    setActivePage('careers');
    setActiveNav('careers');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  const nextCourse = () => {
    if (courseCategories.length === 0) return;
    setCurrentCourseIndex(prev => (prev + 1) % courseCategories.length);
  };

  const prevCourse = () => {
    if (courseCategories.length === 0) return;
    setCurrentCourseIndex(prev => (prev - 1 + courseCategories.length) % courseCategories.length);
  };

  const addVisitorRow = () => {
    if (additionalVisitors.length >= 5) {
      showToast('Maximum of 5 companions allowed manually. For more than 5, please download the template and upload your CSV list.', true);
      return;
    }
    setAdditionalVisitors([...additionalVisitors, { name: '' }]);
  };

  const removeVisitorRow = (index) => {
    setAdditionalVisitors(additionalVisitors.filter((_, i) => i !== index));
  };

  const updateVisitorField = (index, field, value) => {
    const updated = [...additionalVisitors];
    updated[index][field] = value;
    setAdditionalVisitors(updated);
  };

  const downloadCompanionTemplate = () => {
    const content = "Companion Full Name\nJuan Dela Cruz\nMaria Santos\n";
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Companion_Template.csv");
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link);
  };

  const handleCompanionCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split(/\r?\n/).filter(row => row.trim());
      const newCompanions = [];
      
      let startIndex = 0;
      if (rows[0].toLowerCase().includes('name')) startIndex = 1;
      for (let i = startIndex; i < rows.length; i++) {
        const cols = rows[i].split(',');
        if (cols[0] && cols[0].trim()) {
          newCompanions.push({ name: cols[0].trim() });
        }
      }
      
      if (newCompanions.length > 0) {
        setAdditionalVisitors(newCompanions);
        showToast(`Successfully added ${newCompanions.length} companions from CSV.`);
      } else {
        showToast(`No valid companions found in CSV.`, true);
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  // STRICT VALIDATION
  const handleSubmit = async (e) => {
    e.preventDefault();
    const { name, email, phone, date, time, message } = formData;

    if (!name.trim() || !email.trim() || !phone.trim() || !date || !time || !message) {
      showToast('Please fill out all required appointment fields.', true);
      return;
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      showToast('Please provide a valid email address.', true);
      return;
    }

    if (!PHONE_REGEX.test(phone.trim())) {
      showToast('Please provide a valid phone number.', true);
      return;
    }

    const localToday = getLocalTodayString();
    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();
    const currentTimeStr = `${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`;

    if (date < localToday) {
      showToast('You cannot book an appointment for a past date.', true);
      return;
    }

    if (date === localToday && time <= currentTimeStr) {
      showToast('You cannot select a time that has already passed earlier today.', true);
      return;
    }

    const isConflict = bookedSlots.some(slot => {
      const slotDate = slot.visit_date ? slot.visit_date.split('T')[0] : '';
      const slotTime = slot.visit_time ? slot.visit_time.substring(0, 5) : '';
      return slotDate === date && slotTime === time;
    });

    if (isConflict) {
      showToast('This date and time slot is already booked. Please choose another time.', true);
      return;
    }

    if (isMultipleVisitors) {
      if (additionalVisitors.length === 0) {
        showToast('Please add at least one companion name or uncheck the companion option.', true);
        return;
      }
      if (additionalVisitors.some(v => !v.name.trim())) {
        showToast('Please provide names for all accompanying visitors.', true);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      const payload = {
        firstName, lastName,
        email: email.trim().toLowerCase(), 
        phone: phone.trim(),
        date, 
        time,
        reason: message, 
        additionalVisitors: isMultipleVisitors ? additionalVisitors.filter(v => v.name.trim()) : []
      };
      
      await axios.post(`${API_BASE}/appointments/book`, payload);
      showToast('Appointment request submitted successfully! Check your email for confirmation.');
      setFormData({ name: '', email: '', phone: '', date: '', time: '', message: '' });
      setIsMultipleVisitors(false);
      setAdditionalVisitors([]);
      setShowAppointmentModal(false);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Submission failed. Please try again later.', true);
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
      if (file.size > 5 * 1024 * 1024) {
        showToast('File size must be under 5MB.', true);
        e.target.value = '';
        return;
      }
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
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
    const { full_name, email, phone, resume } = applicationForm;

    if (!full_name.trim() || !email.trim() || !phone.trim() || !resume) {
      showToast('Please fill in all required fields and attach your resume.', true);
      return;
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      showToast('Please provide a valid email address.', true);
      return;
    }

    if (!PHONE_REGEX.test(phone.trim())) {
      showToast('Please provide a valid phone number.', true);
      return;
    }

    setSubmittingApplication(true);
    try {
      const fd = new FormData();
      fd.append('job_id', selectedJob.id);
      fd.append('full_name', full_name.trim());
      fd.append('email', email.trim().toLowerCase());
      fd.append('phone', phone.trim());
      fd.append('cover_letter', applicationForm.cover_letter ? applicationForm.cover_letter.trim() : '');
      fd.append('resume', resume);

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

  const activeCourse = courseCategories[currentCourseIndex] || courseCategories[0] || null;

  return (
    <div className="ap-landing">
      {/* HEADER */}
      <header className="ap-header">
        <div className="ap-header-container">
          <div className="ap-brand" onClick={() => scrollToSection('home')}>
            <div className="ap-brand-icon-wrapper">
              <Stethoscope size={24} />
            </div>
            <span className="ap-brand-name">HCT Academy</span>
          </div>
          
          <nav className="ap-nav-desktop">
            <a 
              className={`ap-nav-link ${activePage === 'home' && activeNav === 'home' ? 'active' : ''}`} 
              onClick={() => scrollToSection('home')}
            >
              Home
            </a>
            <a 
              className={`ap-nav-link ${activePage === 'home' && activeNav === 'about' ? 'active' : ''}`} 
              onClick={() => scrollToSection('about')}
            >
              About
            </a>
            <a 
              className={`ap-nav-link ${activePage === 'home' && activeNav === 'courses' ? 'active' : ''}`} 
              onClick={() => scrollToSection('courses')}
            >
              Courses
            </a>
            <a 
              className={`ap-nav-link ${activePage === 'home' && activeNav === 'facilities' ? 'active' : ''}`} 
              onClick={() => scrollToSection('facilities')}
            >
              Facilities
            </a>
            <a 
              className={`ap-nav-link ${activePage === 'careers' || activeNav === 'careers' ? 'active' : ''}`} 
              onClick={navigateToCareers}
            >
              Careers
            </a>
          </nav>
          
          <div className="ap-header-actions">
            <div className="ap-header-actions-desktop">
              <button className="btn-ap-nav-primary" onClick={() => setShowAppointmentModal(true)}>Book Visit</button>
              <button className="btn-ap-nav-icon" onClick={onAdminLogin} title="Admin Portal">
                <User size={18} />
              </button>
            </div>
            <button className="ap-mobile-toggle" onClick={() => setMobileMenuOpen(true)}>
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE MENU */}
      <div className={`ap-mobile-menu ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)}>
        <nav className="ap-mobile-nav" onClick={(e) => e.stopPropagation()}>
          <div className="ap-nav-header">
            <h3 className="ap-mobile-brand">Menu</h3>
            <button className="ap-nav-close" onClick={() => setMobileMenuOpen(false)}>
              <X size={22} />
            </button>
          </div>
          
          <div className="ap-nav-body">
            <div className="ap-nav-list">
              <a className={`ap-mobile-nav-link ${activePage === 'home' && activeNav === 'home' ? 'active' : ''}`} onClick={() => scrollToSection('home')}>Home</a>
              <a className={`ap-mobile-nav-link ${activePage === 'home' && activeNav === 'about' ? 'active' : ''}`} onClick={() => scrollToSection('about')}>About</a>
              <a className={`ap-mobile-nav-link ${activePage === 'home' && activeNav === 'courses' ? 'active' : ''}`} onClick={() => scrollToSection('courses')}>Courses</a>
              <a className={`ap-mobile-nav-link ${activePage === 'home' && activeNav === 'facilities' ? 'active' : ''}`} onClick={() => scrollToSection('facilities')}>Facilities</a>
              <a className={`ap-mobile-nav-link ${activePage === 'careers' ? 'active' : ''}`} onClick={navigateToCareers}>Careers</a>
            </div>
            <div className="ap-nav-divider"></div>
            <div className="ap-nav-actions-mobile">
              <button className="btn-ap-primary-mobile" onClick={() => { setShowAppointmentModal(true); setMobileMenuOpen(false); }}>Book Visit</button>
              <button className="btn-ap-outline-mobile" onClick={onAdminLogin} title="Admin Portal">
                <User size={18} /> Admin Portal
              </button>
            </div>
          </div>
        </nav>
      </div>

      {/* HOME PAGE */}
      {activePage === 'home' && (
        <>
          {/* HERO SECTION - PROMINENT 100vh FULL VIEWPORT */}
          <section id="home" className="ap-hero-section">
            <div className="ap-hero-grid">
              <div className="ap-hero-text">
                <span className="ap-hero-badge">
                  <Sparkles size={16} /> Philippines' Premier Healthcare Academy
                </span>
                <h1 className="ap-hero-title">
                  <span className="text-white">Shaping Tomorrow's</span><br />
                  <span className="text-accent">Healthcare Heroes</span>
                </h1>
                <p className="ap-hero-subtitle">
                  Experience world-class clinical simulation-based training, renowned medical instructors, and a curriculum engineered to produce competent, compassionate healthcare leaders.
                </p>
                <div className="ap-hero-actions">
                  <button className="btn-ap-primary-large" onClick={() => setShowAppointmentModal(true)}>
                    <Calendar size={20} /> Schedule a Visit
                  </button>
                  <button className="btn-ap-secondary-large" onClick={() => scrollToSection('about')}>
                    Learn More <ArrowRight size={20} />
                  </button>
                </div>
              </div>

              <div className="ap-hero-visual">
                <div className="ap-floating-panel">
                  <div className="ap-floating-item float-1">
                    <div className="ap-float-icon"><ShieldCheck size={30} /></div>
                    <div><h4>Safe & Monitored Campus</h4><p>BLE-powered visitor positioning & security</p></div>
                  </div>
                  <div className="ap-floating-item float-2">
                    <div className="ap-float-icon"><Users size={30} /></div>
                    <div><h4>Expert Medical Faculty</h4><p>Actively practicing physicians & nurse clinicians</p></div>
                  </div>
                  <div className="ap-floating-item float-3">
                    <div className="ap-float-icon"><GraduationCap size={30} /></div>
                    <div><h4>Accredited Simulation Training</h4><p>High-fidelity patient simulation laboratories</p></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ABOUT */}
          <section id="about" className="ap-section ap-bg-white">
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
                  <p>CHED-recognized curricula meticulously aligned with global healthcare standards and best practices.</p>
                </div>
                <div className="ap-feature-card stagger-2">
                  <div className="ap-feature-icon"><Users size={24} /></div>
                  <h4>Expert Instructors</h4>
                  <p>Learn directly from actively practicing doctors and nurses bringing decades of real-world experience.</p>
                </div>
                <div className="ap-feature-card stagger-3">
                  <div className="ap-feature-icon"><Building2 size={24} /></div>
                  <h4>Modern Facilities</h4>
                  <p>Immersive learning through state-of-the-art simulation labs, smart classrooms, and clinical equipment.</p>
                </div>
              </div>
            </div>
          </section>

          {/* COURSES DIRECTORY */}
          <section id="courses" className="ap-section ap-bg-gray">
            <div className="ap-container">
              <div className="ap-section-header">
                <span className="ap-tag">Educational Programs</span>
                <h2>Clinical Education & Certification Programs</h2>
                <p>Explore accredited clinical certifications, life support programs, and continuing professional development modules.</p>
              </div>

              <div className="ap-clean-track-tabs">
                {courseCategories.map((cat, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`ap-track-tab-btn ${idx === currentCourseIndex ? 'active' : ''}`}
                    onClick={() => setCurrentCourseIndex(idx)}
                  >
                    <span>{cat.title.split('(')[0].trim()}</span>
                    <span className="ap-track-badge">{(cat.courses || []).length}</span>
                  </button>
                ))}
              </div>

              {courseCategories.length > 0 && activeCourse && (
                <div className="ap-clean-showcase-wrap">
                  <button className="ap-arrow-ctrl prev" onClick={prevCourse} aria-label="Previous Program">
                    <ChevronLeft size={22} />
                  </button>

                  <div className="ap-clean-course-card">
                    <div className="ap-clean-card-meta">
                      <span className="ap-clean-card-badge">{activeCourse.badge || 'Accredited Track'}</span>
                      <span className="ap-clean-card-count">{(activeCourse.courses || []).length} Modules</span>
                    </div>

                    <h3 className="ap-clean-card-title">{activeCourse.title}</h3>
                    <p className="ap-clean-card-sub">{activeCourse.subtitle}</p>
                    <p className="ap-clean-card-desc">{activeCourse.description}</p>

                    <div className="ap-clean-modules-preview">
                      <span className="ap-clean-preview-heading">Featured Topics & Syllabi</span>
                      <div className="ap-clean-chip-row">
                        {(activeCourse.courses || []).slice(0, 4).map((cName, cIdx) => (
                          <span key={cIdx} className="ap-clean-module-chip">
                            <Check size={13} className="chip-check" /> {cName}
                          </span>
                        ))}
                        {(activeCourse.courses || []).length > 4 && (
                          <span className="ap-clean-more-chip">
                            +{(activeCourse.courses.length - 4)} more
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="ap-clean-card-footer">
                      <button 
                        type="button" 
                        className="btn-ap-clean-curriculum"
                        onClick={() => setSelectedCourseModal(activeCourse)}
                      >
                        <BookOpen size={16} /> View Complete Curriculum
                      </button>
                    </div>
                  </div>

                  <button className="ap-arrow-ctrl next" onClick={nextCourse} aria-label="Next Program">
                    <ChevronRight size={22} />
                  </button>
                </div>
              )}

              {courseCategories.length > 1 && (
                <div className="ap-carousel-dots">
                  {courseCategories.map((_, idx) => (
                    <button 
                      key={idx} 
                      className={`ap-dot ${idx === currentCourseIndex ? 'active' : ''}`}
                      onClick={() => setCurrentCourseIndex(idx)}
                      aria-label={`Slide ${idx + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* FACILITIES - CENTERED, LARGER CARDS (100% DRIVEN BY CMS) */}
          <section id="facilities" className="ap-section ap-bg-white">
            <div className="ap-container">
              <div className="ap-section-header">
                <span className="ap-tag">Campus</span>
                <h2>World-Class Facilities</h2>
                <p>Explore our modern learning environments specifically designed for hands-on healthcare education.</p>
              </div>

              <div className="ap-facilities-grid">
                {facilities.map((fac, idx) => {
                  const hasImages = Array.isArray(fac.images) && fac.images.length > 0;
                  const thumbnailSrc = fac.thumbnail || (hasImages ? fac.images[0] : '');
                  const totalCount = hasImages ? fac.images.length : 0;

                  return (
                    <div key={idx} className={`ap-facility-card stagger-${idx + 1}`} onClick={() => setSelectedFacility(fac)}>
                      <div className="ap-facility-img-wrapper">
                        {thumbnailSrc ? (
                          <img 
                            src={thumbnailSrc} 
                            alt={fac.name} 
                            className="ap-facility-img" 
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="ap-facility-placeholder">
                            <Camera size={36} />
                            <span>No Photo Uploaded</span>
                          </div>
                        )}
                        <div className="ap-facility-overlay">
                          <Camera size={26} color="white" />
                          <span>{totalCount > 0 ? `View ${totalCount} Photo${totalCount === 1 ? '' : 's'}` : 'View Gallery'}</span>
                        </div>
                      </div>
                      <div className="ap-facility-name">
                        <span>{fac.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* CONTACT SECTION */}
          <section id="contact" className="ap-section ap-bg-gray">
            <div className="ap-container">
              <div className="ap-section-header">
                <span className="ap-tag">Contact</span>
                <h2>Get in Touch</h2>
                <p>Have questions about training schedules or admissions? Reach out to our team directly.</p>
              </div>

              <div className="ap-modern-contact-grid">
                <div className="ap-modern-contact-card">
                  <div className="ap-card-icon-bubble"><MapPin size={20} /></div>
                  <h3 className="ap-card-contact-title">Campus Location</h3>
                  <p className="ap-card-contact-desc">
                    HCT Academy Pasig City<br />
                    3F & 5F Westar Building, Shaw Boulevard<br />
                    Pasig City, Metro Manila
                  </p>
                  <a href={`https://maps.google.com/?q=${encodeURIComponent('HCT Academy, 3F & 5F Westar Building, Shaw Boulevard, Pasig City')}`} target="_blank" rel="noreferrer" className="ap-card-action-link">
                    <span>Get directions</span> <ExternalLink size={13} />
                  </a>
                </div>

                <div className="ap-modern-contact-card">
                  <div className="ap-card-icon-bubble"><Phone size={20} /></div>
                  <h3 className="ap-card-contact-title">Phone</h3>
                  <p className="ap-card-contact-desc">
                    {contactInfo.phone_primary}<br />
                    {contactInfo.phone_secondary}
                  </p>
                  <a href={`tel:${contactInfo.phone_primary.replace(/[^0-9+]/g, '')}`} className="ap-card-action-link">
                    <span>Call hotline</span> <ArrowRight size={13} />
                  </a>
                </div>

                <div className="ap-modern-contact-card">
                  <div className="ap-card-icon-bubble"><Mail size={20} /></div>
                  <h3 className="ap-card-contact-title">Email</h3>
                  <p className="ap-card-contact-desc">
                    {contactInfo.email_admissions}<br />
                    {contactInfo.email_general}
                  </p>
                  <a href={`mailto:${contactInfo.email_admissions}`} className="ap-card-action-link">
                    <span>Send message</span> <ArrowRight size={13} />
                  </a>
                </div>

                <div className="ap-modern-contact-card">
                  <div className="ap-card-icon-bubble"><Clock size={20} /></div>
                  <div className={admissionsStatus.isOpen ? "ap-status-pill-open" : "ap-status-pill-closed"}>
                    <span className={admissionsStatus.isOpen ? "status-ping" : "status-ping-closed"} />
                    <span>{admissionsStatus.text}</span>
                  </div>
                  <h3 className="ap-card-contact-title">Hours</h3>
                  <p className="ap-card-contact-desc">
                    {contactInfo.hours_weekday}<br />
                    {contactInfo.hours_weekend}<br />
                    Sunday: Closed
                  </p>
                  <span className="ap-hours-subtext">{admissionsStatus.note}</span>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* CAREERS PAGE */}
      {activePage === 'careers' && (
        <div className="ap-careers-page-wrapper">
          <section className="ap-careers-hero-clean">
            <div className="ap-container">
              <div className="ap-careers-header-box">
                <span className="ap-tag">Careers at HCT Academy</span>
                <h1>Join Our Faculty & Clinical Team</h1>
                <p>Help educate and inspire the next generation of healthcare professionals with modern clinical simulation tools and institutional growth opportunities.</p>
              </div>

              <div className="ap-clean-perks-bar">
                <div className="ap-clean-perk">
                  <Award size={18} className="perk-icon" />
                  <span>CPD Medical Units Provided</span>
                </div>
                <div className="ap-clean-perk">
                  <Zap size={18} className="perk-icon" />
                  <span>Advanced Simulation Labs</span>
                </div>
                <div className="ap-clean-perk">
                  <HeartHandshake size={18} className="perk-icon" />
                  <span>Statutory Benefits & Overtime</span>
                </div>
              </div>
            </div>
          </section>

          <section className="ap-section ap-bg-gray" style={{ paddingTop: '2.5rem' }}>
            <div className="ap-container">
              <div className="ap-clean-filter-bar">
                <div className="ap-clean-search-input">
                  <Search size={16} className="search-icon" />
                  <input 
                    type="text" 
                    placeholder="Search roles, skills, or departments..."
                    value={jobSearchTerm}
                    onChange={(e) => setJobSearchTerm(e.target.value)}
                  />
                  {jobSearchTerm && (
                    <button className="clear-btn" onClick={() => setJobSearchTerm('')} aria-label="Clear Search">
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="ap-clean-dept-pills">
                  {uniqueDepartments.map(dept => (
                    <button
                      key={dept}
                      type="button"
                      className={`ap-dept-chip ${jobDepartmentFilter === dept ? 'active' : ''}`}
                      onClick={() => setJobDepartmentFilter(dept)}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ap-clean-count-label">
                <span>{filteredJobs.length} available position{filteredJobs.length === 1 ? '' : 's'}</span>
              </div>

              <div className="ap-clean-jobs-grid">
                {filteredJobs.length === 0 ? (
                  <div className="ap-clean-empty-state">
                    <Briefcase size={44} className="empty-icon" />
                    <h4>No Openings Found</h4>
                    <p>There are currently no job postings matching your selected filters.</p>
                    <button 
                      className="btn-ap-secondary"
                      onClick={() => { setJobSearchTerm(''); setJobDepartmentFilter('All'); }}
                    >
                      Clear Search Filters
                    </button>
                  </div>
                ) : (
                  filteredJobs.map((job) => (
                    <div key={job.id} className="ap-clean-job-card">
                      <div className="ap-job-card-top">
                        <span className="ap-job-dept-tag">{job.department || 'General'}</span>
                        <span className="ap-job-worktype-tag">{job.employment_type || 'Full-time'}</span>
                      </div>

                      <h3 className="ap-clean-job-title">{job.title}</h3>

                      <div className="ap-clean-job-details-row">
                        <span className="ap-clean-meta-item">
                          <MapPin size={13} /> {job.location_type || 'On-site'} • {job.location || 'Pasig City'}
                        </span>
                        {(job.salary_min || job.salary_max) && (
                          <span className="ap-clean-meta-item salary">
                            <DollarSign size={13} /> 
                            ₱{Number(job.salary_min || 0).toLocaleString()}
                            {job.salary_max ? ` - ₱${Number(job.salary_max).toLocaleString()}` : ''} / mo
                          </span>
                        )}
                      </div>

                      <p className="ap-clean-job-desc">
                        {job.description?.length > 130 ? `${job.description.substring(0, 130)}...` : job.description}
                      </p>

                      <div className="ap-clean-job-actions">
                        <button 
                          type="button" 
                          className="btn-ap-clean-overview"
                          onClick={() => { setSelectedJobDetails(job); setShowJobDetailsModal(true); }}
                        >
                          View Details
                        </button>
                        <button 
                          type="button" 
                          className="btn-ap-clean-apply"
                          onClick={() => openApplyModal(job)}
                        >
                          Apply Now
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

            </div>
          </section>
        </div>
      )}

      {/* FOOTER */}
      <footer className="ap-footer">
        <div className="ap-footer-grid">
          <div className="ap-footer-brand">
            <div className="ap-footer-logo">
              <Stethoscope size={28} />
              <h3>HCT Academy</h3>
            </div>
            <p>Healthcare simulation and training academy providing accredited professional certifications and life-support education.</p>
          </div>
          <div className="ap-footer-links">
            <h4>Quick Links</h4>
            <a onClick={() => scrollToSection('home')}>Home</a>
            <a onClick={() => scrollToSection('about')}>About</a>
            <a onClick={() => scrollToSection('courses')}>Courses</a>
            <a onClick={() => scrollToSection('facilities')}>Facilities</a>
          </div>
          <div className="ap-footer-links">
            <h4>Portal & Info</h4>
            <a onClick={() => setShowAppointmentModal(true)}>Book Appointment</a>
            <a onClick={navigateToCareers}>Careers</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
          <div className="ap-footer-contact">
            <h4>Connect With Us</h4>
            <p><Mail size={15}/> {contactInfo.email_general}</p>
            <p><Phone size={15}/> {contactInfo.phone_primary}</p>
          </div>
        </div>
        <div className="ap-footer-bottom">
          <p>© {new Date().getFullYear()} HCT Academy. All rights reserved.</p>
        </div>
      </footer>

      {/* COURSE SUB-COURSES MODAL */}
      {selectedCourseModal && (
        <div className="ap-modal-overlay" onClick={() => setSelectedCourseModal(null)}>
          <div className="ap-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <div>
                <h2>{selectedCourseModal.title}</h2>
                <span className="ap-modal-badge">{selectedCourseModal.badge || 'Accredited Curriculum'}</span>
              </div>
              <button className="ap-btn-close" onClick={() => setSelectedCourseModal(null)}><X size={20} /></button>
            </div>
            <p className="ap-time-modal-subtitle">{selectedCourseModal.description}</p>
            
            <div className="ap-modal-section-title">Course Modules:</div>
            <div className="ap-subcourses-list">
              {(selectedCourseModal.courses || []).map((course, i) => (
                <div key={i} className="ap-subcourse-item">
                  <div className="ap-subcourse-item-left">
                    <BookOpen size={16} className="ap-subcourse-icon" />
                    <span>{course}</span>
                  </div>
                  <span className="ap-subcourse-tag">Active</span>
                </div>
              ))}
            </div>
            <div className="ap-modal-footer" style={{ marginTop: '2rem' }}>
              <button type="button" className="btn-ap-primary" onClick={() => { setSelectedCourseModal(null); setShowAppointmentModal(true); }}>
                Inquire & Book Visit
              </button>
              <button type="button" className="btn-ap-cancel" onClick={() => setSelectedCourseModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* APPOINTMENT BOOKING MODAL */}
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
                  <input type="text" name="name" placeholder="e.g. Juan Dela Cruz" value={formData.name} onChange={handleChange} required />
                </div>
                <div className="ap-form-group">
                  <label>Email Address <span className="text-danger">*</span></label>
                  <input type="email" name="email" placeholder="e.g. juan@example.com" value={formData.email} onChange={handleChange} required />
                </div>
              </div>
              <div className="ap-form-row">
                <div className="ap-form-group">
                  <label>Phone Number <span className="text-danger">*</span></label>
                  <input type="tel" name="phone" placeholder="e.g. +63 912 345 6789" value={formData.phone} onChange={handleChange} required />
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

              {/* DATE AND UNRESTRICTED 3-COLUMN TIME DROPDOWN */}
              <div className="ap-form-row">
                <div className="ap-form-group">
                  <label>Preferred Date <span className="text-danger">*</span></label>
                  <input 
                    type="date" 
                    name="date" 
                    value={formData.date} 
                    onChange={e => { handleChange(e); setFormData(prev => ({ ...prev, time: '' })); }} 
                    min={getLocalTodayString()} 
                    required 
                  />
                </div>

                {/* 3-COLUMN DROPDOWN PICKER */}
                <div className="ap-form-group" ref={timePickerRef}>
                  <label>Preferred Time <span className="text-danger">*</span></label>
                  <div className="ap-chrome-time-wrapper">
                    <div 
                      className={`ap-chrome-time-input ${showTimeDropdown ? 'focused' : ''} ${!formData.date ? 'disabled' : ''}`}
                      onClick={() => {
                        if (!formData.date) {
                          showToast('Please select a visit date first.', true);
                          return;
                        }
                        setShowTimeDropdown(!showTimeDropdown);
                      }}
                    >
                      <div className="ap-chrome-time-display">
                        {formData.time ? (
                          <>
                            <span className="ap-time-active-chunk">{selectedHour}</span>
                            <span className="ap-time-sep">:</span>
                            <span className="ap-time-active-chunk">{selectedMinute}</span>
                            <span className="ap-time-period-txt">{selectedPeriod}</span>
                          </>
                        ) : (
                          <span className="ap-time-placeholder">-- : --  --</span>
                        )}
                      </div>
                      <Clock size={18} className="ap-chrome-clock-icon" />
                    </div>

                    {showTimeDropdown && (
                      <div className="ap-chrome-time-dropdown-popover">
                        <div className="ap-time-col">
                          {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((h) => (
                            <button
                              key={h}
                              type="button"
                              className={`ap-time-item ${selectedHour === h ? 'selected' : ''}`}
                              onClick={() => handleHourClick(h)}
                            >
                              {h}
                            </button>
                          ))}
                        </div>

                        <div className="ap-time-col">
                          {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                            <button
                              key={m}
                              type="button"
                              className={`ap-time-item ${selectedMinute === m ? 'selected' : ''}`}
                              onClick={() => handleMinuteClick(m)}
                            >
                              {m}
                            </button>
                          ))}
                        </div>

                        <div className="ap-time-col period-col">
                          {['PM', 'AM'].map((p) => (
                            <button
                              key={p}
                              type="button"
                              className={`ap-time-item ${selectedPeriod === p ? 'selected' : ''}`}
                              onClick={() => handlePeriodClick(p)}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="ap-input-hint">Any time can be chosen. Times earlier today are strictly blocked.</span>
                </div>
              </div>
              
              <div className="ap-checkbox-field">
                <label>
                  <input 
                    type="checkbox" 
                    checked={isMultipleVisitors} 
                    onChange={handleCompanionCheckboxToggle} 
                  /> 
                  I will be accompanied by other visitors
                </label>
              </div>
              
              {/* COMPANIONS BOX: VISIBLE INPUTS, TEMPLATE & UPLOAD BUTTONS */}
              {isMultipleVisitors && (
                <div className="ap-companions-box">
                  <div className="ap-companions-header">
                    <div>
                      <h4 className="ap-companions-title">Accompanying Visitors Clearance</h4>
                      <p className="ap-companions-subtitle">
                        Register companions manually below. <strong>If more than 5 visitors</strong>, please download our template and upload your companion list.
                      </p>
                    </div>
                    <div className="ap-companions-actions">
                      <button 
                        type="button" 
                        className="btn-ap-companion-action" 
                        onClick={downloadCompanionTemplate} 
                        title="Download CSV Template"
                      >
                        <Download size={14} /> Template
                      </button>
                      <label 
                        className="btn-ap-companion-action upload" 
                        title="Upload Companion CSV"
                      >
                        <Upload size={14} /> Upload CSV
                        <input 
                          type="file" 
                          accept=".csv" 
                          onChange={handleCompanionCSVUpload} 
                          style={{ display: 'none' }} 
                        />
                      </label>
                    </div>
                  </div>

                  <div className="ap-companions-list">
                    {additionalVisitors.map((v, idx) => (
                      <div key={idx} className="ap-companion-row">
                        <span className="ap-companion-index">#{idx + 1}</span>
                        <input 
                          type="text" 
                          placeholder="Companion Full Name (e.g. Maria Santos)" 
                          value={v.name} 
                          onChange={e => updateVisitorField(idx, 'name', e.target.value)} 
                          required 
                        />
                        {additionalVisitors.length > 1 && (
                          <button 
                            type="button" 
                            className="btn-ap-companion-delete" 
                            onClick={() => removeVisitorRow(idx)} 
                            title="Remove Companion"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {additionalVisitors.length < 5 && (
                    <button 
                      type="button" 
                      className="btn-ap-add-companion" 
                      onClick={addVisitorRow}
                    >
                      <Plus size={15} /> Add Companion ({additionalVisitors.length}/5)
                    </button>
                  )}

                  {additionalVisitors.length >= 5 && (
                    <div className="ap-companion-limit-notice">
                      <AlertCircle size={16} className="limit-icon" />
                      <span>
                        Maximum of 5 companions added manually. If your party has more than 5 visitors, please download the template above and upload your CSV list.
                      </span>
                    </div>
                  )}
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

      {/* JOB DETAILS MODAL */}
      {showJobDetailsModal && selectedJobDetails && (
        <div className="ap-modal-overlay" onClick={() => setShowJobDetailsModal(false)}>
          <div className="ap-job-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ap-job-modal-header">
              <div className="ap-job-header-text">
                <h2>{selectedJobDetails.title}</h2>
                <div className="ap-job-meta-light">
                  <span><Building2 size={15}/> {selectedJobDetails.department || 'General'}</span>
                  <span><Clock size={15}/> {selectedJobDetails.employment_type}</span>
                </div>
              </div>
              <button className="ap-btn-close-light" onClick={() => setShowJobDetailsModal(false)}><X size={22} /></button>
            </div>

            <div className="ap-job-modal-body">
              <div className="ap-job-stats-grid">
                <div className="ap-stat-box">
                  <span className="ap-stat-label">Work Arrangement</span>
                  <span className="ap-stat-val"><MapPin size={16} /> {selectedJobDetails.location_type || 'On-site'}</span>
                </div>
                {selectedJobDetails.location && (
                  <div className="ap-stat-box">
                    <span className="ap-stat-label">Campus</span>
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
                    ) : 'Competitive'}
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

            <div className="ap-job-modal-footer">
              <button type="button" className="btn-ap-cancel" onClick={() => setShowJobDetailsModal(false)}>Close</button>
              <button type="button" className="btn-ap-primary" onClick={() => { setShowJobDetailsModal(false); openApplyModal(selectedJobDetails); }}>
                <FileText size={16} /> Apply for this Position
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JOB APPLICATION MODAL */}
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
                  <label>Phone Number <span className="text-danger">*</span></label>
                  <input type="tel" name="phone" value={applicationForm.phone} onChange={handleApplicationChange} placeholder="e.g. +63 912 345 6789" required />
                </div>
              </div>

              <div className="ap-form-group">
                <label>Cover Letter (Optional)</label>
                <textarea name="cover_letter" rows="4" value={applicationForm.cover_letter} onChange={handleApplicationChange} placeholder="Introduce yourself and your clinical or instructional experience..." />
              </div>

              <div className="ap-form-group">
                <label>Resume / CV <span className="text-danger">*</span></label>
                <div className="ap-file-upload-box">
                  <input type="file" id="resume-upload" accept=".pdf,.doc,.docx" onChange={handleResumeChange} required className="ap-file-input-hidden" />
                  <label htmlFor="resume-upload" className="ap-file-upload-label">
                    <div className="ap-file-icon">
                      <Upload size={28} />
                    </div>
                    <div className="ap-file-text">
                      {applicationForm.resume ? (
                        <span className="ap-file-name-success"><Check size={16}/> {applicationForm.resume.name}</span>
                      ) : (
                        <span><span className="text-accent font-semibold">Click to attach file</span> or drag and drop</span>
                      )}
                    </div>
                    <span className="ap-input-hint">Max size: 5MB (PDF, DOC, DOCX).</span>
                  </label>
                </div>
              </div>

              <div className="ap-modal-footer">
                <button type="button" className="btn-ap-cancel" onClick={() => setShowApplyModal(false)}>Cancel</button>
                <button type="submit" className="btn-ap-primary" disabled={submittingApplication}>
                  {submittingApplication ? 'Submitting Application...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SOLID WHITE CARD MODAL FOR ALL FACILITY IMAGES */}
      {selectedFacility && (
        <div className="ap-modal-overlay" onClick={() => setSelectedFacility(null)}>
          <div className="ap-gallery-modal" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2>{selectedFacility.name} Gallery</h2>
              <button className="ap-btn-close" onClick={() => setSelectedFacility(null)}><X size={20} /></button>
            </div>
            <div className="ap-gallery-grid">
              {(selectedFacility.images && selectedFacility.images.length > 0) ? (
                selectedFacility.images.map((img, idx) => (
                  <div key={idx} className="ap-gallery-img-box">
                    <img 
                      src={img} 
                      alt={`${selectedFacility.name} ${idx + 1}`} 
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                ))
              ) : (
                <div className="ap-gallery-empty">
                  <Camera size={44} className="text-gray" />
                  <p>No photos uploaded yet for {selectedFacility.name}.</p>
                </div>
              )}
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