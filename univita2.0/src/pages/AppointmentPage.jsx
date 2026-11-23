// src/pages/AppointmentPage.jsx
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
const OTHER_VISIT_REASON = '__other_visit_reason__';
const MAX_CUSTOM_REASON_LENGTH = 200;

const getLocalTodayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPHBookingNow = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value || '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
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

const sortCourseModules = (cats) => {
  return (cats || []).map(cat => ({
    ...cat,
    courses: Array.isArray(cat.courses)
      ? [...cat.courses].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'accent', numeric: true }))
      : []
  }));
};

const checkAdmissionsStatus = () => {
  try {
    const phDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const day = phDate.getDay();
    const timeNum = phDate.getHours() + phDate.getMinutes() / 60;

    if (day === 0) {
      return { isOpen: false, text: 'Office Closed', note: 'Closed on Sundays • Opens Monday 9:00 AM' };
    }
    if (day >= 1 && day <= 5) {
      if (timeNum >= 9 && timeNum < 17) {
        return { isOpen: true, text: 'Office Open', note: 'Office is currently within its posted weekday hours' };
      }
      return { isOpen: false, text: 'Office Closed', note: timeNum < 9 ? 'Opens at 9:00 AM' : 'Contact us during weekday office hours' };
    }
    if (day === 6) return { isOpen: false, text: 'Office Closed', note: 'Office reopens Monday at 9:00 AM' };
    return { isOpen: false, text: 'Office Closed', note: 'Security registration is required at arrival.' };
  } catch (e) {
    return { isOpen: false, text: 'Office Closed', note: 'Security registration is required at arrival.' };
  }
};

const DEFAULT_COURSES = sortCourseModules([
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
    badge: "AHA Programs",
    subtitle: "American Heart Association certified life support programs.",
    description: "Master life-saving resuscitation techniques with hands-on high-fidelity simulation and course completion credentials, according to program.",
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
    description: "Equip yourself or your team with essential first aid, CPR, and AED response skills covering American Heart Association training topics.",
    courses: [
      "AHA Heartsaver First Aid & CPR with AED (HS-CPRFA)",
      "AHA Heartsaver Basic Life Support (HS-BLS)",
      "AHA Heartsaver First Aid (HS-FA)"
    ]
  },
  {
    title: "PRC - CPD Courses",
    badge: "PRC-CPD Programs",
    subtitle: "Continuing professional development for licensed medical practitioners.",
    description: "Fulfill regulatory commission requirements with accredited CPD units and advanced clinical seminars.",
    courses: [
      "Early Recognition of Patient Deterioration",
      "Patient Safety Systems & Error Prevention in Acute Care",
      "Advanced Nursing Assessment & Rapid Clinical Decision-Making"
    ]
  }
]);

const DEFAULT_FACILITIES = [
  { name: 'Simulation Lab', images: [] },
  { name: 'Classrooms', images: [] }
];

const DEFAULT_CONTACT = {
  address: '3rd and 5th Floors, Westar Building, 611 Shaw Boulevard, Pasig City, Metro Manila',
  phone_secondary: '+63 917 106 4106',
  email_admissions: 'inquiries@hct.edu.ph',
  hours_weekday: 'Monday–Friday: 9:00 AM–5:00 PM',
  hours_weekend: 'Saturday: Closed',
  hours_sunday: 'Sunday: Closed',
  hero_eyebrow: 'Healthcare education and simulation-based training',
  hero_line1: 'Shaping Tomorrow’s',
  hero_line2: 'Healthcare Professionals',
  hero_description: 'Explore hands-on training, professional development, and healthcare learning opportunities at HCT Academy.',
  about_title: 'Practical Training for Healthcare Professionals',
  about_description: 'Founded in 2007 as Healthcare Advantage Institute, HCT Academy supports healthcare professionals through simulation-based training, life-support education, and continuing professional development.',
  privacy_url: '/privacy'
};

// Accepts both 0/1 (from MySQL) and true/false (from JS)
const jobRequiresPrc = (job) => !!(job && (job.requires_prc === 1 || job.requires_prc === true || job.requires_prc === '1'));

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
  const [customVisitReason, setCustomVisitReason] = useState('');
  const [visitConfirmation, setVisitConfirmation] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', date: '', time: '', message: '' });

  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedPeriod, setSelectedPeriod] = useState('AM');
  const timePickerRef = useRef(null);

  const [isMultipleVisitors, setIsMultipleVisitors] = useState(false);
  const [additionalVisitors, setAdditionalVisitors] = useState([]);
  const [visitReasons, setVisitReasons] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  useEffect(() => {
    if (!showAppointmentModal) return;
    axios.get(`${API_BASE}/appointments/booked-slots`, { params: formData.date ? { date: formData.date } : {} })
      .then(res => setBookedSlots(Array.isArray(res.data) ? res.data : []))
      .catch(() => setBookedSlots([]));
  }, [showAppointmentModal, formData.date]);
  const [toastMessage, setToastMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [applicationError, setApplicationError] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [jobs, setJobs] = useState([]);
  const [jobSearchTerm, setJobSearchTerm] = useState('');
  const [jobDepartmentFilter, setJobDepartmentFilter] = useState('All');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showJobDetailsModal, setShowJobDetailsModal] = useState(false);
  const [selectedJobDetails, setSelectedJobDetails] = useState(null);

  // Removed TOR from state
  const [applicationForm, setApplicationForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    cover_letter: '',
    prc_license_no: '',
    resume: null
  });
  const [submittingApplication, setSubmittingApplication] = useState(false);
  const [applicationConfirmation, setApplicationConfirmation] = useState(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

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

  useEffect(() => {
    axios.get(`${API_BASE}/public/landing-content`)
      .then(res => {
        if (res.data) {
          if (Array.isArray(res.data.courses_catalog)) {
            setCourseCategories(sortCourseModules(res.data.courses_catalog));
          }
          if (Array.isArray(res.data.facilities_gallery)) {
            const mapped = res.data.facilities_gallery.map(fac => {
              const formattedImages = (fac.images || []).map(img => resolveMediaUrl(img));
              return {
                name: fac.name,
                description: fac.description || '',
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

    // Public availability exposes date/time only, never visitor records.
    axios.get(`${API_BASE}/appointments/booked-slots`)
      .then(res => setBookedSlots(Array.isArray(res.data) ? res.data : []))
      .catch(() => setBookedSlots([]));
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
    setBookingError('');
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const scrollToSection = (id) => {
    setActiveNav(id);
    if (activePage !== 'home') {
      setActivePage('home');
      setTimeout(() => {
        const element = document.getElementById(id);
        if (element) {
          const headerOffset = 90;
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
        }
      }, 120);
    } else {
      const element = document.getElementById(id);
      if (element) {
        const headerOffset = 90;
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
    if (file.size > 100 * 1024) { showToast('Companion CSV must not exceed 100 KB.', true); e.target.value = ''; return; }
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

      if (newCompanions.length > 50) { showToast('Maximum of 50 companions per visit. Please shorten the CSV.', true); e.target.value = ''; return; }
      const normalizedCompanions = newCompanions.map(c => c.name.trim().toLowerCase());
      if (new Set(normalizedCompanions).size !== normalizedCompanions.length) { showToast('The CSV contains duplicate companion names.', true); e.target.value = ''; return; }
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBookingError('');
    const { name, email, phone, date, time, message } = formData;

    if (!name.trim() || !email.trim() || !phone.trim() || !date || !time || !message) {
      setBookingError('Please fill out all required appointment fields.');
      showToast('Please fill out all required appointment fields.', true);
      return;
    }

    if (message === OTHER_VISIT_REASON) {
      const customReason = customVisitReason.trim().replace(/\s+/g, ' ');
      if (customReason.length < 5 || customReason.length > MAX_CUSTOM_REASON_LENGTH) {
        setBookingError('Specify your visit purpose in 5–200 characters.');
        showToast('Specify your visit purpose in 5–200 characters.', true);
        return;
      }
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      setBookingError('Please provide a valid email address.');
      showToast('Please provide a valid email address.', true);
      return;
    }

    if (!PHONE_REGEX.test(phone.trim())) {
      setBookingError('Please provide a valid phone number.');
      showToast('Please provide a valid phone number.', true);
      return;
    }

    const { date: localToday, time: currentTimeStr } = getPHBookingNow();

    if (date < localToday) {
      setBookingError('You cannot book an appointment for a past date.');
      showToast('You cannot book an appointment for a past date.', true);
      return;
    }

    if (date === localToday && time <= currentTimeStr) {
      setBookingError('You cannot select a time that has already passed earlier today.');
      showToast('You cannot select a time that has already passed earlier today.', true);
      return;
    }

    // Align public form with the backend's HCT Academy appointment schedule.
    const [yy, mm, dd] = date.split('-').map(Number);
    const weekday = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
    const mins = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    if (weekday === 0 || mins < 480 || (weekday === 6 ? mins >= 720 : mins >= 1020)) {
      const scheduleMessage = weekday === 0 ? 'Appointments are not available on Sundays.' :
        weekday === 6 ? 'Saturday appointments: 8:00 AM–11:59 AM.' :
          'Weekday appointments: 8:00 AM–4:59 PM.';
      setBookingError(scheduleMessage);
      showToast(scheduleMessage, true);
      return;
    }

    const isConflict = bookedSlots.some(slot => {
      const slotDate = slot.visit_date ? slot.visit_date.split('T')[0] : '';
      const slotTime = slot.visit_time ? slot.visit_time.substring(0, 5) : '';
      return slotDate === date && slotTime === time;
    });

    if (isConflict) {
      setBookingError('This date and time slot is already booked. Please choose another time.');
      showToast('This date and time slot is already booked. Please choose another time.', true);
      return;
    }

    if (name.trim().split(/\s+/).length < 2) {
      setBookingError('Please enter your first and last name.');
      showToast('Please enter your first and last name.', true);
      return;
    }
    if (isMultipleVisitors) {
      const normalizedNames = [name, ...additionalVisitors.map(v => v.name || '')]
        .map(v => v.trim().replace(/\s+/g, ' ').toLowerCase());
      if (new Set(normalizedNames).size !== normalizedNames.length) {
        setBookingError('Each visitor must have a unique full name.');
      showToast('Each visitor must have a unique full name.', true);
        return;
      }
      if (additionalVisitors.length > 50) {
        setBookingError('Maximum of 50 companions per appointment.');
      showToast('Maximum of 50 companions per appointment.', true);
        return;
      }
      if (additionalVisitors.length === 0) {
        setBookingError('Please add at least one companion name or uncheck the companion option.');
      showToast('Please add at least one companion name or uncheck the companion option.', true);
        return;
      }
      if (additionalVisitors.some(v => !v.name.trim())) {
        setBookingError('Please provide names for all accompanying visitors.');
      showToast('Please provide names for all accompanying visitors.', true);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const isCustomReason = message === OTHER_VISIT_REASON;
      const reasonText = isCustomReason
        ? `Other: ${customVisitReason.trim().replace(/\s+/g, ' ')}`
        : message;

      const payload = {
        firstName, lastName,
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        date,
        time,
        reason: reasonText,
        reason_type: isCustomReason ? 'other' : 'predefined',
        custom_reason: isCustomReason ? customVisitReason.trim().replace(/\s+/g, ' ') : null,
        additionalVisitors: isMultipleVisitors ? additionalVisitors.filter(v => v.name.trim()) : []
      };

      const response = await axios.post(`${API_BASE}/appointments/book`, payload);
      setVisitConfirmation({ id: response.data?.appointmentId || null, name, date, time, reason: reasonText });
      showToast('Visit request received and awaiting staff approval.');
      setFormData({ name: '', email: '', phone: '', date: '', time: '', message: '' });
      setCustomVisitReason('');
      setIsMultipleVisitors(false);
      setAdditionalVisitors([]);
      setShowAppointmentModal(false);
    } catch (err) {
      console.error(err);
      setBookingError(err.response?.data?.message || 'Submission failed. Please try again later.');
      showToast(err.response?.data?.message || 'Submission failed. Please try again later.', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================
  // JOB APPLICATION HANDLERS (PRC aware, TOR removed)
  // ============================================================
  const openApplyModal = (job) => {
    setSelectedJob(job);
    setPrivacyAccepted(false);
    setApplicationError('');
    setApplicationForm({
      full_name: '',
      email: '',
      phone: '',
      cover_letter: '',
      prc_license_no: '',
      resume: null
    });
    setShowApplyModal(true);
  };

  const handleApplicationChange = (e) => {
    setApplicationError('');
    setApplicationForm({ ...applicationForm, [e.target.name]: e.target.value });
  };

  const handleResumeChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('File size must be under 5MB.', true);
      e.target.value = '';
      return;
    }
    const allowedTypes = [
      'application/pdf'
    ];
    if (!allowedTypes.includes(file.type)) {
      showToast('Please upload a PDF resume.', true);
      e.target.value = '';
      return;
    }
    setApplicationForm(prev => ({ ...prev, resume: file }));
  };

  const submitApplication = async (e) => {
    e.preventDefault();
    setApplicationError('');
    const { full_name, email, phone, resume, prc_license_no } = applicationForm;
    const prcRequired = jobRequiresPrc(selectedJob);

    if (!full_name.trim() || !email.trim() || !phone.trim() || !resume) {
      setApplicationError('Please fill in all required fields and attach your resume.');
      showToast('Please fill in all required fields and attach your resume.', true);
      return;
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      setApplicationError('Please provide a valid email address.');
      showToast('Please provide a valid email address.', true);
      return;
    }

    if (!PHONE_REGEX.test(phone.trim())) {
      setApplicationError('Please provide a valid phone number.');
      showToast('Please provide a valid phone number.', true);
      return;
    }

    if (!privacyAccepted) {
      setApplicationError('Please acknowledge the applicant privacy notice.');
      showToast('Please acknowledge the applicant privacy notice.', true);
      return;
    }

    if (prcRequired && !prc_license_no.trim()) {
      setApplicationError('This position requires a PRC License Number. Please provide it.');
      showToast('This position requires a PRC License Number. Please provide it.', true);
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
      if (prc_license_no && prc_license_no.trim()) {
        fd.append('prc_license_no', prc_license_no.trim());
      }
      fd.append('resume', resume);

      const res = await axios.post(`${API_BASE}/jobs/apply`, fd);
      if (res.data.success) {
        setApplicationConfirmation({ position: selectedJob.title, reference: res.data?.id || res.data?.applicationId || null });
        showToast('Application received for HR screening.');
        setShowApplyModal(false);
        setApplicationForm({
          full_name: '',
          email: '',
          phone: '',
          cover_letter: '',
          prc_license_no: '',
          resume: null
        });
      } else {
        setApplicationError(res.data.message || res.data.error || 'Failed to submit application.');
        showToast(res.data.message || res.data.error || 'Failed to submit application.', true);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Network error';
      setApplicationError(msg);
      showToast(`Submission failed: ${msg}`, true);
    } finally {
      setSubmittingApplication(false);
    }
  };

  const activeCourse = courseCategories[currentCourseIndex] || courseCategories[0] || null;
  const applyRequiresPrc = jobRequiresPrc(selectedJob);

  return (
    <div className="ap-landing">
      {/* MODERN FLOATING HEADER */}
      <header className="ap-header">
        <div className="ap-header-container">
          <div className="ap-brand" onClick={() => scrollToSection('home')}>
            <div className="ap-brand-icon-wrapper">
              <Stethoscope size={22} />
            </div>
            <span className="ap-brand-name">HCT Academy</span>
          </div>

          <nav className="ap-nav-desktop">
            <a
              href="#home"
              className={`ap-nav-link ${activePage === 'home' && activeNav === 'home' ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); scrollToSection('home'); }}
            >
              Home
            </a>
            <a
              href="#about"
              className={`ap-nav-link ${activePage === 'home' && activeNav === 'about' ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); scrollToSection('about'); }}
            >
              About
            </a>
            <a
              href="#courses"
              className={`ap-nav-link ${activePage === 'home' && activeNav === 'courses' ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); scrollToSection('courses'); }}
            >
              Courses
            </a>
            <a
              href="#facilities"
              className={`ap-nav-link ${activePage === 'home' && activeNav === 'facilities' ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); scrollToSection('facilities'); }}
            >
              Facilities
            </a>
            <a
              href="#careers"
              className={`ap-nav-link ${activePage === 'careers' || activeNav === 'careers' ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); navigateToCareers(); }}
            >
              Careers
            </a>
          </nav>

          <div className="ap-header-actions">
            <div className="ap-header-actions-desktop">
              <button className="btn-ap-nav-primary" onClick={() => setShowAppointmentModal(true)}>Book Visit</button>
              <button className="btn-ap-nav-icon" onClick={onAdminLogin} title="Admin Portal" aria-label="Admin Portal">
                <User size={18} />
              </button>
            </div>
            <button className="ap-mobile-toggle" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
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
            <button className="ap-nav-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
              <X size={22} />
            </button>
          </div>

          <div className="ap-nav-body">
            <div className="ap-nav-list">
              <a href="#home" className={`ap-mobile-nav-link ${activePage === 'home' && activeNav === 'home' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); scrollToSection('home'); }}>Home</a>
              <a href="#about" className={`ap-mobile-nav-link ${activePage === 'home' && activeNav === 'about' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); scrollToSection('about'); }}>About</a>
              <a href="#courses" className={`ap-mobile-nav-link ${activePage === 'home' && activeNav === 'courses' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); scrollToSection('courses'); }}>Courses</a>
              <a href="#facilities" className={`ap-mobile-nav-link ${activePage === 'home' && activeNav === 'facilities' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); scrollToSection('facilities'); }}>Facilities</a>
              <a href="#careers" className={`ap-mobile-nav-link ${activePage === 'careers' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); navigateToCareers(); }}>Careers</a>
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

      <main>
        {/* HOME PAGE */}
        {activePage === 'home' && (
          <>
            {/* HERO SECTION */}
            <section id="home" className="ap-hero-section">
              <div className="ap-hero-grid">
                <div className="ap-hero-text">
                  <span className="ap-hero-badge">
                    <Sparkles size={16} /> {contactInfo.hero_eyebrow || DEFAULT_CONTACT.hero_eyebrow}
                  </span>
                  <h1 className="ap-hero-title">
                    <span className="text-white">{contactInfo.hero_line1 || DEFAULT_CONTACT.hero_line1}</span><br />
                    <span className="text-accent">{contactInfo.hero_line2 || DEFAULT_CONTACT.hero_line2}</span>
                  </h1>
                  <p className="ap-hero-subtitle">
                    {contactInfo.hero_description || DEFAULT_CONTACT.hero_description}
                  </p>
                  <div className="ap-hero-actions">
                    
                    <button className="btn-ap-secondary-large" onClick={() => scrollToSection('about')}>
                      Learn More <ArrowRight size={20} />
                    </button>
                  </div>
                </div>

                <div className="ap-hero-visual">
                  <div className="ap-floating-panel">
                    <div className="ap-floating-item float-1">
                      <div className="ap-float-icon"><ShieldCheck size={30} /></div>
                      <div>
                        <h2>Campus Visit Management</h2>
                        <p>Visitor requests, registration, and monitored facility access</p>
                      </div>
                    </div>
                    <div className="ap-floating-item float-2">
                      <div className="ap-float-icon"><Users size={30} /></div>
                      <div>
                        <h2>Healthcare-Focused Programs</h2>
                        <p>Life-support training and continuing professional education</p>
                      </div>
                    </div>
                    <div className="ap-floating-item float-3">
                      <div className="ap-float-icon"><GraduationCap size={30} /></div>
                      <div>
                        <h2>Simulation-Based Learning</h2>
                        <p>Skills-focused instruction and practical training facilities</p>
                      </div>
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
                  <h2>{contactInfo.about_title || DEFAULT_CONTACT.about_title}</h2>
                  <p>{contactInfo.about_description || DEFAULT_CONTACT.about_description}</p>
                </div>
                <div className="ap-features-grid">
                  <div className="ap-feature-card stagger-1">
                    <div className="ap-feature-icon"><Award size={24} /></div>
                    <h3>Healthcare Training Programs</h3>
                    <p>Life support, continuing professional development, enhancement courses, and related learning pathways.</p>
                  </div>
                  <div className="ap-feature-card stagger-2">
                    <div className="ap-feature-icon"><Users size={24} /></div>
                    <h3>Professional Development</h3>
                    <p>Learning options for nurses, healthcare practitioners, and organizations seeking skills development.</p>
                  </div>
                  <div className="ap-feature-card stagger-3">
                    <div className="ap-feature-icon"><Building2 size={24} /></div>
                    <h3>Modern Facilities</h3>
                    <p>Simulation-based and practical learning, including healthcare training laboratories and educational technology.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* COURSES DIRECTORY */}
            <section id="courses" className="ap-section ap-bg-gray">
              <div className="ap-container">
                <div className="ap-section-header">
                  <span className="ap-tag">Educational Programs</span>
                  <h2>Clinical Education & Certification</h2>
                  <p>Explore accredited clinical certifications, life support programs, and continuing professional development modules.</p>
                </div>

                <div className="ap-course-track-tabs" role="tablist" aria-label="Training programs">
                  {courseCategories.map((category, index) => (
                    <button key={index} type="button" role="tab" aria-selected={currentCourseIndex === index} className={`ap-course-track-tab ${currentCourseIndex === index ? 'active' : ''}`} onClick={() => setCurrentCourseIndex(index)}>{category.title}</button>
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
                        <span className="ap-clean-card-count">{(activeCourse.courses || []).length} Courses / Modules</span>
                      </div>

                      <div className="ap-clean-card-body">
                        <h3 className="ap-clean-card-title">{activeCourse.title}</h3>
                        <p className="ap-clean-card-sub">{activeCourse.subtitle}</p>
                        <p className="ap-clean-card-desc">{activeCourse.description}</p>
                      </div>

                      <div className="ap-clean-card-footer">
                        <button
                          type="button"
                          className="btn-ap-clean-curriculum"
                          onClick={() => setSelectedCourseModal(activeCourse)}
                        >
                          View
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

            {/* FACILITIES */}
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
                      <div key={idx} className={`ap-facility-card stagger-${idx + 1}`} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedFacility(fac); } }} onClick={() => setSelectedFacility(fac)}>
                        <div className="ap-facility-img-wrapper">
                          {thumbnailSrc ? (
                            <img
                              src={thumbnailSrc}
                              alt={fac.name}
                              className="ap-facility-img"
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement?.classList.add('ap-image-failed');
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
                          <span>{fac.name}</span>{fac.description && <small>{fac.description}</small>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

{/* EXCLUSIVE INSTRUCTOR MOBILE APP DOWNLOAD SECTION */}
            <section className="ap-section ap-bg-white" style={{ padding: '4rem 0' }}>
              <div className="ap-container">
                <div style={{
                  background: '#0F172A',
                  borderRadius: '20px',
                  padding: '3rem 2.5rem',
                  color: '#FFFFFF',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '2rem',
                  border: '1px solid #1E293B',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                }}>
                  <div style={{ maxWidth: '600px' }}>
                    <span style={{
                      background: 'rgba(13, 148, 136, 0.2)',
                      color: '#2DD4BF',
                      padding: '0.4rem 1rem',
                      borderRadius: '99px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      border: '1px solid rgba(45, 212, 191, 0.3)'
                    }}>
                      Authorized Faculty Only
                    </span>
                    <h2 style={{ fontSize: '1.85rem', fontWeight: 800, margin: '1rem 0 0.5rem 0', color: '#FFFFFF' }}>
                      Mobile Application
                    </h2>
                    <p style={{ color: '#94A3B8', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>
                      The UniVITA instructor app supports Android and iOS. The APK below is for Android only; iOS users should obtain installation guidance through HCT Academy. Institutional credentials are required.
                    </p>
                  </div>
                  <div>
                    <a
                      href="https://github.com/univita2-0/UniVITA_Project2.0/releases/latest/download/UniVITA_Instructor_App_v1.2.0.apk"
                      download="UniVITA_Instructor_App_v1.2.0.apk"
                      style={{
                        background: '#0F766E',
                        color: '#FFFFFF',
                        padding: '1rem 2rem',
                        borderRadius: '12px',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        textDecoration: 'none',
                        boxShadow: '0 8px 20px rgba(13, 148, 136, 0.3)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Download size={18} /> Download APK
                    </a>
                  </div>
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
                      {contactInfo.address || 'Address not configured in CMS.'}
                    </p>
                    {contactInfo.address && (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(contactInfo.address)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ap-card-action-link"
                      >
                        <span>Get directions</span> <ExternalLink size={13} />
                      </a>
                    )}
                  </div>

                  <div className="ap-modern-contact-card">
                    <div className="ap-card-icon-bubble"><Phone size={20} /></div>
                    <h3 className="ap-card-contact-title">Contact Number</h3>
                    <p className="ap-card-contact-desc">
                      {contactInfo.phone_secondary || 'Contact number not set'}
                    </p>
                    {contactInfo.phone_secondary && (
                      <a
                        href={`tel:${contactInfo.phone_secondary.replace(/[^0-9+]/g, '')}`}
                        className="ap-card-action-link"
                      >
                        <span>Call mobile</span> <ArrowRight size={13} />
                      </a>
                    )}
                  </div>

                  <div className="ap-modern-contact-card">
                    <div className="ap-card-icon-bubble"><Mail size={20} /></div>
                    <h3 className="ap-card-contact-title">Admissions Email</h3>
                    <p className="ap-card-contact-desc">
                      {contactInfo.email_admissions || 'Email not set'}
                    </p>
                    {contactInfo.email_admissions && (
                      <a
                        href={`mailto:${contactInfo.email_admissions}`}
                        className="ap-card-action-link"
                      >
                        <span>Send message</span> <ArrowRight size={13} />
                      </a>
                    )}
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
                      {contactInfo.hours_sunday || 'Sunday: Closed'}
                    </p>
                    <span className="ap-hours-subtext">{admissionsStatus.note}</span>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* CAREERS — focused recruitment workspace */}
        {activePage === 'careers' && (
          <div className="ap-careers-redesign">
            <section className="ap-careers-banner">
              <div className="ap-container ap-careers-banner-grid">
                <div className="ap-careers-banner-copy">
                  <span className="ap-careers-kicker"><Briefcase size={15}/> CAREERS AT HCT ACADEMY</span>
                  <h1>{contactInfo.careers_title || 'Find Your Place in Healthcare Education'}</h1>
                  <p>{contactInfo.careers_description || 'Explore career opportunities across our clinical, instructional, administrative, and support teams.'}</p>
                  <button type="button" className="ap-careers-explore" onClick={() => document.getElementById('ap-open-positions')?.scrollIntoView({behavior:'smooth',block:'start'})}>
                    Explore openings <ArrowRight size={17}/>
                  </button>
                </div>
                <div className="ap-careers-banner-side" aria-label="Recruitment information">
                  <div className="ap-careers-side-icon"><Users size={23}/></div>
                  <strong>Join our team</strong>
                  <p>Review open positions, check the qualifications, and apply directly through UniVITA.</p>
                  <div className="ap-careers-banner-stat"><span>Currently accepting applications</span><strong>{jobs.length} {jobs.length === 1 ? 'opening' : 'openings'}</strong></div>
                </div>
              </div>
            </section>

            <section id="ap-open-positions" className="ap-careers-main-section">
              <div className="ap-container">
                <div className="ap-careers-section-heading">
                  <div><span className="ap-careers-section-eyebrow">OPPORTUNITIES</span><h2>Open Positions</h2><p>Browse current vacancies and review the qualifications before applying.</p></div>
                  <span className="ap-careers-count"><Briefcase size={16}/>{filteredJobs.length} {filteredJobs.length === 1 ? 'position' : 'positions'}</span>
                </div>
                <div className="ap-careers-board">
                  <div className="ap-careers-toolbar">
                    <div className="ap-careers-search">
                      <Search size={18}/>
                      <input aria-label="Search job postings" type="search" placeholder="Search job title, skills, or location" value={jobSearchTerm} onChange={e => setJobSearchTerm(e.target.value)}/>
                    </div>
                    <div className="ap-careers-filter-label"><span>Department</span><select aria-label="Filter by department" value={jobDepartmentFilter} onChange={e => setJobDepartmentFilter(e.target.value)}>{uniqueDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}</select></div>
                  </div>
                  <div className="ap-careers-list">
                    {filteredJobs.length === 0 ? (
                      <div className="ap-careers-no-results"><Briefcase size={28}/><h3>No positions found</h3><p>{jobs.length ? 'Try another search or department.' : 'There are no published openings at the moment.'}</p><button type="button" onClick={() => {setJobSearchTerm('');setJobDepartmentFilter('All');}}>Clear filters</button></div>
                    ) : filteredJobs.map(job => (
                      <article key={job.id} className="ap-careers-position">
                        <div className="ap-careers-position-content">
                          <div className="ap-careers-position-top"><span className="ap-careers-department">{job.department || 'General'}</span><span className="ap-careers-open-status"><span/>Accepting applications</span></div>
                          <h3>{job.title}</h3>
                          <div className="ap-careers-position-meta"><span><Briefcase size={15}/>{job.employment_type || 'Full-time'}</span><span><MapPin size={15}/>{job.location_type || 'On-site'}{job.location ? ` · ${job.location}` : ''}</span>{jobRequiresPrc(job) && <span><ShieldCheck size={15}/>PRC required</span>}</div>
                          <p className="ap-careers-position-description">{job.description?.length > 190 ? `${job.description.slice(0,190).trim()}…` : job.description}</p>
                          {job.requirements && <div className="ap-careers-qualification"><strong>Key qualifications</strong><span>{job.requirements.length > 165 ? `${job.requirements.slice(0,165).trim()}…` : job.requirements}</span></div>}
                        </div>
                        <div className="ap-careers-position-aside">
                          <div className="ap-careers-salary"><small>Monthly salary</small><strong>{job.salary_min != null && job.salary_max != null ? `₱${Number(job.salary_min).toLocaleString()} – ₱${Number(job.salary_max).toLocaleString()}` : 'Not specified'}</strong></div>
                          <button type="button" className="ap-careers-apply-btn" onClick={() => openApplyModal(job)}>Apply for Position <ArrowRight size={16}/></button>
                          <button type="button" className="ap-careers-details-btn" onClick={() => {setSelectedJobDetails(job);setShowJobDetailsModal(true);}}>View position details</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="ap-careers-process">
                  <div className="ap-careers-process-heading"><span className="ap-careers-section-eyebrow">APPLICATION GUIDE</span><h2>What happens after you apply?</h2><p>Our recruitment team reviews applications against the requirements of each position.</p></div>
                  <div className="ap-careers-process-grid">
                    {[['01','Submit your application','Complete the form and upload your resume.'],['02','Application screening','HR reviews the documents and qualifications.'],['03','Shortlisting and interview','Selected candidates are contacted for the next stage.'],['04','Hiring decision','The recruitment team records the outcome.']].map(([number,title,desc]) => <div className="ap-careers-process-item" key={number}><span>{number}</span><strong>{title}</strong><p>{desc}</p></div>)}
                  </div>
                  <p className="ap-careers-process-note"><AlertCircle size={16}/> Submission does not guarantee an interview or job offer. Please ensure your contact information is accurate.</p>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="ap-footer">
        <div className="ap-footer-grid">
          <div className="ap-footer-brand">
            <div className="ap-footer-logo">
              <Stethoscope size={28} />
              <h3>HCT Academy</h3>
            </div>
            <p>Healthcare education, simulation-based training, and professional skills development.</p>
          </div>
          <div className="ap-footer-links">
            <h3>Quick Links</h3>
            <a href="#home" onClick={(e) => { e.preventDefault(); scrollToSection('home'); }}>Home</a>
            <a href="#about" onClick={(e) => { e.preventDefault(); scrollToSection('about'); }}>About</a>
            <a href="#courses" onClick={(e) => { e.preventDefault(); scrollToSection('courses'); }}>Courses</a>
            <a href="#facilities" onClick={(e) => { e.preventDefault(); scrollToSection('facilities'); }}>Facilities</a>
          </div>
          <div className="ap-footer-links">
            <h3>Portal & Info</h3>
            <a href="#book" onClick={(e) => { e.preventDefault(); setShowAppointmentModal(true); }}>Book Appointment</a>
            <a href="#careers" onClick={(e) => { e.preventDefault(); navigateToCareers(); }}>Careers</a>
            <a href="/privacy">Privacy Policy &amp; Terms</a>
          </div>
          <div className="ap-footer-contact">
            <h3>Connect With Us</h3>
            <p><Mail size={15} /> {contactInfo.email_admissions || DEFAULT_CONTACT.email_admissions}</p>
            <p><Phone size={15} /> {contactInfo.phone_secondary || DEFAULT_CONTACT.phone_secondary}</p>
          </div>
        </div>
        <div className="ap-footer-bottom">
          <p>© {new Date().getFullYear()} HCT Academy. All rights reserved.</p>
          <a href="/privacy" style={{ color: '#94A3B8', textDecoration: 'underline', marginTop: '10px', display: 'inline-block' }}>
            Privacy Policy & Terms
          </a>
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
              <button className="ap-btn-close" onClick={() => setSelectedCourseModal(null)} aria-label="Close modal">
                <X size={20} />
              </button>
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
          <div className="ap-modal-content ap-booking-modal" role="dialog" aria-modal="true" aria-labelledby="ap-booking-title" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header ap-booking-modal-header">
              <div className="ap-booking-heading"><div><p>Provide your details and preferred visit schedule.</p></div></div>
              <button className="ap-btn-close" onClick={() => setShowAppointmentModal(false)} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            <div className="ap-booking-notice"><ShieldCheck size={17}/><span>Your preferred schedule is subject to staff approval.</span></div>
            {bookingError && <div className="ap-form-error" role="alert"><AlertCircle size={16}/>{bookingError}</div>}
            <form className="ap-form" onSubmit={handleSubmit}>
              <div className="ap-booking-section-heading"><strong>Visitor details</strong></div>
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
                  <select
                    name="message"
                    value={formData.message}
                    onChange={e => {
                      handleChange(e);
                      setBookingError('');
                      if (e.target.value !== OTHER_VISIT_REASON) setCustomVisitReason('');
                    }}
                    required
                  >
                    <option value="">Select a reason...</option>
                    {visitReasons.filter(r => r && r.reason_text && r.reason_text.trim().toLowerCase() !== 'other (please specify)').map(r => (
                      <option key={r.id} value={r.reason_text}>{r.reason_text}</option>
                    ))}
                    <option value={OTHER_VISIT_REASON}>Other (Please Specify)</option>
                  </select>
                </div>
              </div>

              {formData.message === OTHER_VISIT_REASON && (
                <div className="ap-custom-visit-reason">
                  <label htmlFor="ap-custom-visit-reason">Specify Your Reason <span className="text-danger">*</span></label>
                  <textarea
                    id="ap-custom-visit-reason"
                    rows="3"
                    value={customVisitReason}
                    onChange={e => { setCustomVisitReason(e.target.value); setBookingError(''); }}
                    placeholder="Briefly describe the purpose of your visit..."
                    maxLength={MAX_CUSTOM_REASON_LENGTH}
                    aria-describedby="ap-custom-visit-reason-hint"
                    required
                  />
                  <div className="ap-custom-visit-reason-footer" id="ap-custom-visit-reason-hint">
                    <span>5–200 characters. Provide a clear, brief description.</span>
                    <span>{customVisitReason.length}/{MAX_CUSTOM_REASON_LENGTH}</span>
                  </div>
                </div>
              )}

              <div className="ap-booking-section-heading"><strong>Preferred schedule</strong></div>
              <div className="ap-form-row">
                <div className="ap-form-group">
                  <label>Preferred Date <span className="text-danger">*</span></label>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={e => { handleChange(e); setFormData(prev => ({ ...prev, time: '' })); setBookingError(''); }}
                    min={getPHBookingNow().date}
                    required
                  />
                </div>

                <div className="ap-form-group" ref={timePickerRef}>
                  <label>Preferred Time <span className="text-danger">*</span></label>
                  <div className="ap-chrome-time-wrapper">
                    <div
                      role="button" tabIndex={0} aria-expanded={showTimeDropdown} aria-label="Choose visit time"
                      className={`ap-chrome-time-input ${showTimeDropdown ? 'focused' : ''} ${!formData.date ? 'disabled' : ''}`}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (formData.date) setShowTimeDropdown(v => !v); } }}
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
                      <div className="ap-chrome-time-dropdown-popover" role="group" aria-label="Select hour, minute and AM or PM">
                        <div className="ap-time-picker-header"><strong>Choose preferred time</strong><span>Philippine Time (PHT)</span></div>
                        <div className="ap-time-picker-columns">
                        <div className="ap-time-col"><span className="ap-time-column-label">Hour</span>
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

                        <div className="ap-time-col"><span className="ap-time-column-label">Minute</span>
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

                        <div className="ap-time-col period-col"><span className="ap-time-column-label">Period</span>
                          {['AM', 'PM'].map((p) => (
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
                        <button type="button" className="ap-time-picker-done" onClick={() => setShowTimeDropdown(false)}>Done <Check size={15}/></button>
                      </div>
                    )}
                  </div>
                  <span className="ap-input-hint">Booking hours: Monday–Friday 8:00 AM–4:59 PM; Saturday 8:00–11:59 AM. No Sunday bookings.</span>
                </div>
              </div>

              <div className="ap-booking-section-heading"><strong>Additional visitors <em>Optional</em></strong></div>
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
                        <span className="ap-companion-index">{idx + 1}</span>
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
                            aria-label="Remove Companion"
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

              <p className="ap-form-privacy-note">Your details are used to process this visit request and security registration. <a href="/privacy">Privacy and data handling policy</a>.</p>
              <div className="ap-modal-footer">
                <button type="button" className="btn-ap-cancel" onClick={() => setShowAppointmentModal(false)}>Cancel</button>
                <button type="submit" className="btn-ap-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting Request...' : 'Submit Visit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* JOB DETAILS MODAL - FORMAL DESIGN */}
      {showJobDetailsModal && selectedJobDetails && (
        <div className="ap-modal-overlay" onClick={() => setShowJobDetailsModal(false)}>
          <div className="ap-job-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ap-job-modal-header-formal">
              <div className="ap-job-header-text">
                <h2>{selectedJobDetails.title}</h2>
                <div className="ap-job-meta-light">
                  <span><Building2 size={15} /> {selectedJobDetails.department || 'General'}</span>
                  <span><Clock size={15} /> {selectedJobDetails.employment_type}</span>
                  {jobRequiresPrc(selectedJobDetails) && (
                    <span className="ap-job-prc-badge">
                      <ShieldCheck size={15} /> PRC Required
                    </span>
                  )}
                </div>
              </div>
              <button className="ap-btn-close" onClick={() => setShowJobDetailsModal(false)} aria-label="Close modal">
                <X size={20} />
              </button>
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

              {jobRequiresPrc(selectedJobDetails) && (
                <div className="ap-job-prc-inline-notice">
                  <ShieldCheck size={18} />
                  <span>
                    <strong>Notice:</strong> This position requires a valid PRC License. You will be asked to provide your PRC License Number during the application process.
                  </span>
                </div>
              )}

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

      {/* JOB APPLICATION FORM MODAL - TOR REMOVED */}
      {showApplyModal && selectedJob && (
        <div className="ap-modal-overlay" onClick={() => setShowApplyModal(false)}>
          <div className="ap-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <div>
                <h2>Apply: {selectedJob.title}</h2>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#64748B' }}>Please fill out the form below.</p>
              </div>
              <button className="ap-btn-close" onClick={() => setShowApplyModal(false)} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            {applicationError && <div className="ap-form-error" role="alert"><AlertCircle size={16}/>{applicationError}</div>}
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

              {/* PRC License Number — only when the job requires it */}
              {applyRequiresPrc && (
                <div className="ap-form-group">
                  <label>PRC License Number <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    name="prc_license_no"
                    value={applicationForm.prc_license_no}
                    onChange={handleApplicationChange}
                    placeholder="e.g. 0012345"
                    required={applyRequiresPrc}
                  />
                  <span className="ap-input-hint" style={{ color: '#0F766E', fontWeight: 500 }}>
                    This position requires a valid PRC License.
                  </span>
                </div>
              )}

              <div className="ap-form-group">
                <label>Cover Letter (Optional)</label>
                <textarea name="cover_letter" rows="3" value={applicationForm.cover_letter} onChange={handleApplicationChange} placeholder="Introduce yourself and your clinical or instructional experience..." />
              </div>

              <div className="ap-form-group">
                <label>Resume / CV <span className="text-danger">*</span></label>
                <div className="ap-file-upload-box">
                  <input type="file" id="resume-upload" accept=".pdf,application/pdf" onChange={handleResumeChange} required className="ap-file-input-hidden" />
                  <label htmlFor="resume-upload" className="ap-file-upload-label">
                    <div className="ap-file-icon">
                      <Upload size={24} />
                    </div>
                    <div className="ap-file-text">
                      {applicationForm.resume ? (
                        <span className="ap-file-name-success"><Check size={16} /> {applicationForm.resume.name}</span>
                      ) : (
                        <span><span className="text-accent font-semibold">Click to attach file</span> from your device</span>
                      )}
                    </div>
                    <span className="ap-input-hint">Maximum size: 5 MB. PDF only.</span>
                  </label>
                </div>
              </div>

              <label className="ap-applicant-consent"><input type="checkbox" checked={privacyAccepted} onChange={e => setPrivacyAccepted(e.target.checked)} required /> I have read the <a href="/privacy" onClick={e => e.stopPropagation()}>privacy and data handling policy</a> and understand that my application will be reviewed by HCT Academy HR.</label>
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
              <button className="ap-btn-close" onClick={() => setSelectedFacility(null)} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            <div className="ap-gallery-grid">
              {(selectedFacility.images && selectedFacility.images.length > 0) ? (
                selectedFacility.images.map((img, idx) => (
                  <div key={idx} className="ap-gallery-img-box">
                    <img
                      src={img}
                      alt={`${selectedFacility.name} ${idx + 1}`}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement?.classList.add('ap-image-failed');
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

       {visitConfirmation && (
         <div className="ap-modal-overlay" role="presentation" onClick={() => setVisitConfirmation(null)}>
           <div className="ap-modal-content ap-result-modal" role="dialog" aria-modal="true" aria-label="Visit request received" onClick={e => e.stopPropagation()}>
             <Check size={36} className="ap-result-icon" />
             <h2>Visit Request Received</h2>
             <p>Your preferred campus visit has been submitted for staff review. This is <strong>not yet an approved appointment</strong>.</p>
             {visitConfirmation.id && <div className="ap-result-row"><span>Request ID</span><strong>#{visitConfirmation.id}</strong></div>}
             <div className="ap-result-row"><span>Visitor</span><strong>{visitConfirmation.name}</strong></div>
             <div className="ap-result-row"><span>Requested date and time</span><strong>{visitConfirmation.date} · {visitConfirmation.time} PHT</strong></div>
             <p className="ap-result-footnote">Please await confirmation from HCT Academy. Email delivery may be delayed or unavailable.</p>
             <button type="button" className="btn-ap-primary" onClick={() => setVisitConfirmation(null)}>Done</button>
           </div>
         </div>
       )}
       {applicationConfirmation && (
         <div className="ap-modal-overlay" role="presentation" onClick={() => setApplicationConfirmation(null)}>
           <div className="ap-modal-content ap-result-modal" role="dialog" aria-modal="true" aria-label="Application received" onClick={e => e.stopPropagation()}>
             <Check size={36} className="ap-result-icon" />
             <h2>Application Received</h2>
             <p>Your application for <strong>{applicationConfirmation.position}</strong> has been received for HR screening.</p>
             {applicationConfirmation.reference && <div className="ap-result-row"><span>Application reference</span><strong>#{applicationConfirmation.reference}</strong></div>}
             <p className="ap-result-footnote">Qualified candidates may be contacted by HR. Submission does not guarantee an interview.</p>
             <button type="button" className="btn-ap-primary" onClick={() => setApplicationConfirmation(null)}>Done</button>
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