import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { 
  Phone, Mail, MapPin, Clock, BookOpen, Plus, Trash2, 
  Upload, Save, Image as ImageIcon, Sparkles, RotateCcw, Building2
} from 'lucide-react';
import { API_BASE } from '../api';
import './LandingPageManagement.css';

// Default assets matching AppointmentPage.jsx
import simulation1 from '../assets/images/simulation1.png';
import simulation2 from '../assets/images/simulation2.png';
import simulation3 from '../assets/images/simulation3.png';
import simulation4 from '../assets/images/simulation4.png';
import classroom1 from '../assets/images/classroom1.png';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

// Exact live baseline from AppointmentPage.jsx
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

const DEFAULT_COURSES = [
  {
    title: "Enhancement Courses (E-Learning)",
    badge: "Flexible Self-Paced",
    subtitle: "Self-paced digital modules designed for modern healthcare professionals.",
    description: "Enhance your clinical expertise with comprehensive online lectures, interactive case studies, and evidence-based practice guidelines.",
    courses: [
      "Nursing", "Disease Epidemiology", "Sexual and Reproductive Health Education",
      "Statistics and Data Analysis Simplified", "Emergency Preparedness and Response",
      "Mental Health and Stress Management", "Sports Medicine", "Telemedicine",
      "Mindfulness for well-being", "Food as Medicine"
    ]
  },
  {
    title: "AHA BLS & ACLS Training",
    badge: "Official AHA Certified",
    subtitle: "American Heart Association certified life support programs.",
    description: "Master life-saving resuscitation techniques with hands-on high-fidelity simulation and official AHA certification upon completion.",
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
    badge: "PRC Accredited Units",
    subtitle: "Continuing professional development for licensed medical practitioners.",
    description: "Fulfill your professional regulatory commission requirements with accredited CPD units and advanced clinical seminars.",
    courses: [
      "Early Recognition of Patient Deterioration",
      "Patient Safety Systems & Error Prevention in Acute Care",
      "Advanced Nursing Assessment & Rapid Clinical Decision-Making"
    ]
  }
];

const DEFAULT_FACILITIES = [
  { 
    name: 'Simulation Lab', 
    images: [simulation1, simulation2, simulation3, simulation4] 
  },
  { 
    name: 'Classrooms', 
    images: [classroom1] 
  }
];

const LandingPageManagement = () => {
  const [activeTab, setActiveTab] = useState('contact');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // States initialized with AppointmentPage baseline
  const [contact, setContact] = useState(DEFAULT_CONTACT);
  const [courses, setCourses] = useState(DEFAULT_COURSES);
  const [facilities, setFacilities] = useState(DEFAULT_FACILITIES);

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/public/landing-content`);
      if (res.data) {
        if (res.data.contact_details && Object.keys(res.data.contact_details).length > 0) {
          setContact(prev => ({ ...prev, ...res.data.contact_details }));
        }
        if (Array.isArray(res.data.courses_catalog) && res.data.courses_catalog.length > 0) {
          setCourses(res.data.courses_catalog);
        }
        if (Array.isArray(res.data.facilities_gallery) && res.data.facilities_gallery.length > 0) {
          setFacilities(res.data.facilities_gallery);
        }
      }
    } catch (err) {
      console.log('Using default AppointmentPage display as fallback baseline');
    } finally {
      setLoading(false);
    }
  };

  const saveSection = async (key, data) => {
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/admin/landing-content/${key}`, { data }, getAuthHeaders());
      toast.success('Landing page updated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save changes to database.');
    } finally {
      setSaving(false);
    }
  };

  // Facility Image Upload
  const handleUploadFacilityImage = async (facilityIndex, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await axios.post(`${API_BASE}/admin/landing/facilities/upload`, fd, getAuthHeaders());
      const updated = [...facilities];
      updated[facilityIndex].images.push(res.data.url);
      setFacilities(updated);
      await saveSection('facilities_gallery', updated);
    } catch (err) {
      toast.error('Image upload failed.');
    }
  };

  const removeFacilityImage = (facilityIndex, imgIndex) => {
    const updated = [...facilities];
    updated[facilityIndex].images = updated[facilityIndex].images.filter((_, i) => i !== imgIndex);
    setFacilities(updated);
  };

  // Course Helpers
  const addCourseCategory = () => {
    setCourses([
      ...courses, 
      { 
        title: 'New Program Track', 
        badge: 'Accredited Curriculum',
        subtitle: 'Specialized healthcare certification.', 
        description: 'Comprehensive clinical modules and training seminars.', 
        courses: ['Module 1: Foundations'] 
      }
    ]);
  };

  const addSubCourse = (catIndex, name) => {
    if (!name.trim()) return;
    const updated = [...courses];
    updated[catIndex].courses.push(name.trim());
    setCourses(updated);
  };

  const removeSubCourse = (catIndex, subIndex) => {
    const updated = [...courses];
    updated[catIndex].courses = updated[catIndex].courses.filter((_, i) => i !== subIndex);
    setCourses(updated);
  };

  const resolveImageSrc = (imgUrl) => {
    if (!imgUrl) return simulation1;
    if (typeof imgUrl === 'string' && imgUrl.startsWith('/uploads')) {
      return `${API_BASE.replace('/api', '')}${imgUrl}`;
    }
    return imgUrl;
  };

  return (
    <div className="lpm-container">
      {/* Header */}
      <div className="lpm-header">
        <div>
          
          <p>Manage the public appointment page, course directory, facility photos, and Pasig City campus details.</p>
        </div>
        <button 
          className="lpm-btn-secondary" 
          onClick={() => {
            setContact(DEFAULT_CONTACT);
            setCourses(DEFAULT_COURSES);
            setFacilities(DEFAULT_FACILITIES);
            toast.info('Restored default values from AppointmentPage. Click Save to commit.');
          }}
          title="Restore baseline defaults"
        >
          <RotateCcw size={16} /> Restore Defaults
        </button>
      </div>

      {/* Tabs */}
      <div className="lpm-tabs-bar">
        <button className={`lpm-tab-btn ${activeTab === 'contact' ? 'active' : ''}`} onClick={() => setActiveTab('contact')}>
           Contact Details & Hours
        </button>
        <button className={`lpm-tab-btn ${activeTab === 'courses' ? 'active' : ''}`} onClick={() => setActiveTab('courses')}>
           Course Management ({courses.length})
        </button>
        <button className={`lpm-tab-btn ${activeTab === 'facilities' ? 'active' : ''}`} onClick={() => setActiveTab('facilities')}>
           Facility Galleries ({facilities.length})
        </button>
      </div>

      {/* TAB 1: CONTACT DETAILS & HOURS */}
      {activeTab === 'contact' && (
        <div className="lpm-card">
          <div className="lpm-card-header">
            <h3>Campus Location & Operating Hours</h3>
            <span className="lpm-tag">Live Public Section</span>
          </div>

          <div className="lpm-form-grid">
            <div className="lpm-form-group full-width">
              <label>Campus Physical Address</label>
              <textarea 
                rows="2" 
                value={contact.address} 
                onChange={e => setContact({ ...contact, address: e.target.value })} 
                placeholder="Building, street, and city..."
              />
              <span className="lpm-hint">Displayed on public landing page and embedded Google Maps link.</span>
            </div>

            <div className="lpm-form-group">
              <label>Admissions Email</label>
              <input 
                value={contact.email_admissions} 
                onChange={e => setContact({ ...contact, email_admissions: e.target.value })} 
                placeholder="admissions@hct.ph"
              />
            </div>

            <div className="lpm-form-group">
              <label>General Inquiry Email</label>
              <input 
                value={contact.email_general} 
                onChange={e => setContact({ ...contact, email_general: e.target.value })} 
                placeholder="info@hct.ph"
              />
            </div>

            <div className="lpm-form-group">
              <label>Primary Landline Hotline</label>
              <input 
                value={contact.phone_primary} 
                onChange={e => setContact({ ...contact, phone_primary: e.target.value })} 
                placeholder="+63 (2) 1234 5678"
              />
            </div>

            <div className="lpm-form-group">
              <label>Mobile Contact Number</label>
              <input 
                value={contact.phone_secondary} 
                onChange={e => setContact({ ...contact, phone_secondary: e.target.value })} 
                placeholder="+63 912 345 6789"
              />
            </div>

            <div className="lpm-form-group">
              <label>Weekday Hours (Mon – Fri)</label>
              <input 
                value={contact.hours_weekday} 
                onChange={e => setContact({ ...contact, hours_weekday: e.target.value })} 
                placeholder="Mon - Fri: 8:00 AM – 5:00 PM"
              />
            </div>

            <div className="lpm-form-group">
              <label>Saturday Hours</label>
              <input 
                value={contact.hours_weekend} 
                onChange={e => setContact({ ...contact, hours_weekend: e.target.value })} 
                placeholder="Saturday: 8:00 AM – 12:00 PM"
              />
            </div>

            <div className="lpm-form-group full-width">
              <label>Sunday Schedule</label>
              <input 
                value={contact.hours_sunday} 
                onChange={e => setContact({ ...contact, hours_sunday: e.target.value })} 
                placeholder="Sunday: CLOSED"
              />
            </div>
          </div>

          <div className="lpm-card-actions">
            <button className="lpm-btn-primary" onClick={() => saveSection('contact_details', contact)} disabled={saving}>
              <Save size={16} /> {saving ? 'Saving Changes...' : 'Save Contact Information'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: COURSE MANAGEMENT */}
      {activeTab === 'courses' && (
        <div className="lpm-courses-stack">
          {courses.map((cat, idx) => (
            <div key={idx} className="lpm-card">
              <div className="lpm-card-header">
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#0F172A' }}>
                    Track #{idx + 1}: {cat.title}
                  </h4>
                  <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    {(cat.courses || []).length} modules configured
                  </span>
                </div>
                <button 
                  className="lpm-btn-danger-icon" 
                  onClick={() => setCourses(courses.filter((_, i) => i !== idx))}
                  title="Delete category"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="lpm-form-grid" style={{ marginTop: '1rem' }}>
                <div className="lpm-form-group">
                  <label>Track Title</label>
                  <input 
                    value={cat.title} 
                    onChange={e => {
                      const updated = [...courses];
                      updated[idx].title = e.target.value;
                      setCourses(updated);
                    }} 
                  />
                </div>

                <div className="lpm-form-group">
                  <label>Curriculum Badge / Accreditation</label>
                  <input 
                    value={cat.badge || ''} 
                    placeholder="e.g. Official AHA Certified"
                    onChange={e => {
                      const updated = [...courses];
                      updated[idx].badge = e.target.value;
                      setCourses(updated);
                    }} 
                  />
                </div>

                <div className="lpm-form-group full-width">
                  <label>Short Subtitle</label>
                  <input 
                    value={cat.subtitle} 
                    onChange={e => {
                      const updated = [...courses];
                      updated[idx].subtitle = e.target.value;
                      setCourses(updated);
                    }} 
                  />
                </div>

                <div className="lpm-form-group full-width">
                  <label>Description & Learning Scope</label>
                  <textarea 
                    rows="2" 
                    value={cat.description} 
                    onChange={e => {
                      const updated = [...courses];
                      updated[idx].description = e.target.value;
                      setCourses(updated);
                    }} 
                  />
                </div>
              </div>

              {/* Sub-Courses Chips */}
              <div className="lpm-subcourses-box">
                <label className="lpm-subcourses-title">Included Modules / Syllabi:</label>
                <div className="lpm-chips-list">
                  {(cat.courses || []).map((cName, cIdx) => (
                    <span key={cIdx} className="lpm-course-chip">
                      <span>{cName}</span>
                      <button 
                        type="button" 
                        onClick={() => removeSubCourse(idx, cIdx)} 
                        title="Remove course"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                <div className="lpm-add-chip-row">
                  <input 
                    id={`new-sub-${idx}`} 
                    placeholder="Add module (e.g. Advanced Nursing Assessment)..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSubCourse(idx, e.target.value);
                        e.target.value = '';
                      }
                    }}
                  />
                  <button 
                    type="button" 
                    className="lpm-btn-secondary"
                    onClick={() => {
                      const el = document.getElementById(`new-sub-${idx}`);
                      addSubCourse(idx, el.value);
                      el.value = '';
                    }}
                  >
                    <Plus size={14} /> Add Module
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="lpm-bottom-actions">
            <button className="lpm-btn-secondary" onClick={addCourseCategory}>
              <Plus size={16} /> Add Program Category
            </button>
            <button className="lpm-btn-primary" onClick={() => saveSection('courses_catalog', courses)} disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save All Course Changes'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: FACILITY GALLERIES */}
      {activeTab === 'facilities' && (
        <div className="lpm-facilities-stack">
          {facilities.map((fac, idx) => (
            <div key={idx} className="lpm-card">
              <div className="lpm-card-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{fac.name}</h3>
                  <span style={{ fontSize: '0.85rem', color: '#64748B' }}>
                    {(fac.images || []).length} photos in gallery
                  </span>
                </div>
                <label className="lpm-btn-secondary" style={{ cursor: 'pointer' }}>
                  <Upload size={16} /> Upload New Photo
                  <input 
                    type="file" 
                    accept="image/*" 
                    style={{ display: 'none' }} 
                    onChange={e => handleUploadFacilityImage(idx, e.target.files[0])} 
                  />
                </label>
              </div>

              {/* Photos Grid */}
              <div className="lpm-facility-photos-grid">
                {(fac.images || []).map((imgUrl, imgIdx) => (
                  <div key={imgIdx} className="lpm-photo-box">
                    <img src={resolveImageSrc(imgUrl)} alt={`${fac.name} ${imgIdx + 1}`} />
                    <button 
                      type="button" 
                      className="lpm-photo-del-btn" 
                      onClick={() => removeFacilityImage(idx, imgIdx)}
                      title="Remove Photo"
                    >
                      <Trash2 size={14} />
                    </button>
                    {imgIdx === 0 && <span className="lpm-cover-badge">Thumbnail</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="lpm-bottom-actions">
            <button className="lpm-btn-primary" onClick={() => saveSection('facilities_gallery', facilities)} disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save Gallery Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPageManagement;