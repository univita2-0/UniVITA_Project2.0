import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { 
  Phone, Mail, MapPin, Clock, BookOpen, Plus, Trash2, 
  Upload, Save, Image as ImageIcon, RotateCcw
} from 'lucide-react';
import { API_BASE } from '../api';
import './LandingPageManagement.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

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

const resolveImageSrc = (imgUrl) => {
  if (!imgUrl) return '';
  if (typeof imgUrl !== 'string') return '';
  if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://') || imgUrl.startsWith('data:') || imgUrl.startsWith('blob:')) {
    return imgUrl;
  }
  const clean = imgUrl.startsWith('/') ? imgUrl : `/${imgUrl}`;
  return `${getBackendBaseUrl()}${clean}`;
};

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
  { name: 'Simulation Lab', images: [] },
  { name: 'Classrooms', images: [] }
];

const LandingPageManagement = () => {
  const [activeTab, setActiveTab] = useState('contact');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      console.log('No previous landing content found, using initial state.');
    } finally {
      setLoading(false);
    }
  };

  // Silent parameter suppresses the redundant "Saved successfully!" toast when auto-saving
  const saveSection = async (key, data, silent = false) => {
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/admin/landing-content/${key}`, { data }, getAuthHeaders());
      if (!silent) {
        toast.success('Saved successfully!');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  // BULK UPLOAD HANDLER: Uploads multiple files at once without duplicate toasts
  const handleUploadFacilityImages = async (facilityIndex, fileList) => {
    if (!fileList || fileList.length === 0) return;

    for (let file of fileList) {
      if (!file.type.startsWith('image/')) {
        toast.error(`"${file.name}" is not a valid image file.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`"${file.name}" exceeds the 10MB limit.`);
        return;
      }
    }

    const fd = new FormData();
    fileList.forEach(file => {
      fd.append('images', file);
    });

    try {
      const res = await axios.post(`${API_BASE}/admin/landing/facilities/upload`, fd, getAuthHeaders());
      const uploadedUrls = res.data?.urls || (res.data?.url ? [res.data.url] : []);

      if (uploadedUrls.length > 0) {
        const targetFacility = facilities[facilityIndex];
        const existingImages = Array.isArray(targetFacility.images) ? [...targetFacility.images] : [];
        const updatedImages = [...existingImages, ...uploadedUrls];

        const updatedFacilities = facilities.map((fac, idx) =>
          idx === facilityIndex ? { ...fac, images: updatedImages } : fac
        );

        setFacilities(updatedFacilities);
        await saveSection('facilities_gallery', updatedFacilities, true);

        toast.success(
          uploadedUrls.length > 1
            ? `Added ${uploadedUrls.length} photos to ${targetFacility.name}.`
            : `Photo added to ${targetFacility.name}.`
        );
      }
    } catch (err) {
      console.error(err);
      toast.error('Image upload failed. Please verify server connection.');
    }
  };

  const removeFacilityImage = async (facilityIndex, imgIndex) => {
    const targetFacility = facilities[facilityIndex];
    const updatedImages = targetFacility.images.filter((_, i) => i !== imgIndex);

    const updatedFacilities = facilities.map((fac, idx) =>
      idx === facilityIndex ? { ...fac, images: updatedImages } : fac
    );

    setFacilities(updatedFacilities);
    await saveSection('facilities_gallery', updatedFacilities, true);
    toast.info('Photo removed.');
  };

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

  return (
    <div className="lpm-container">
      <div className="lpm-header">
        <div>
          
          <p>Manage the public appointment page, course directory, facility photos, and campus details.</p>
        </div>
        <button 
          className="lpm-btn-secondary" 
          onClick={() => {
            setContact(DEFAULT_CONTACT);
            setCourses(DEFAULT_COURSES);
            setFacilities(DEFAULT_FACILITIES);
            toast.info('Restored default values. Click Save to commit.');
          }}
          title="Restore baseline defaults"
        >
          <RotateCcw size={16} /> Restore Defaults
        </button>
      </div>

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

      {/* TAB 1: CONTACT DETAILS */}
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

      {/* TAB 3: FACILITY GALLERIES (BULK UPLOAD & NO FORCED HARDCODED IMAGES) */}
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
                  <Upload size={16} /> Upload Photos
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple 
                    style={{ display: 'none' }} 
                    onChange={e => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleUploadFacilityImages(idx, Array.from(e.target.files));
                        e.target.value = '';
                      }
                    }} 
                  />
                </label>
              </div>

              {/* Photos Grid */}
              <div className="lpm-facility-photos-grid">
                {(fac.images || []).length === 0 ? (
                  <div className="lpm-no-photos">
                    <p>No photos uploaded yet for {fac.name}. Click "Upload Photos" above to add images.</p>
                  </div>
                ) : (
                  (fac.images || []).map((imgUrl, imgIdx) => (
                    <div key={imgIdx} className="lpm-photo-box">
                      <img 
                        src={resolveImageSrc(imgUrl)} 
                        alt={`${fac.name} ${imgIdx + 1}`} 
                        onError={(e) => {
                          e.currentTarget.style.opacity = '0.3';
                        }}
                      />
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
                  ))
                )}
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