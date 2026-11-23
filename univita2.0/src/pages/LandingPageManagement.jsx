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

const sortCourseModules = (cats) => {
  return (cats || []).map(cat => ({
    ...cat,
    courses: Array.isArray(cat.courses)
      ? [...cat.courses].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'accent', numeric: true }))
      : []
  }));
};

const DEFAULT_COURSES = sortCourseModules([
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
    badge: "AHA Programs",
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
    badge: "PRC-CPD Programs",
    subtitle: "Continuing professional development for licensed medical practitioners.",
    description: "Fulfill your professional regulatory commission requirements with accredited CPD units and advanced clinical seminars.",
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
  careers_title: 'Find Your Place in Healthcare Education',
  careers_description: 'Explore career opportunities across our clinical, instructional, administrative, and support teams.'
};

const LandingPageManagement = () => {
  const [activeTab, setActiveTab] = useState('overview');
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
        if (Array.isArray(res.data.courses_catalog)) {
          setCourses(sortCourseModules(res.data.courses_catalog));
        }
        if (Array.isArray(res.data.facilities_gallery)) {
          setFacilities(res.data.facilities_gallery);
        }
      }
    } catch (err) {
      console.log('No previous landing content found, using initial state.');
    } finally {
      setLoading(false);
    }
  };

  const saveSection = async (key, data, silent = false) => {
    if (key === 'contact_details') {
      if (data.email_admissions && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email_admissions)) {
        toast.error('Please provide a valid admissions email address.'); return false;
      }
      if (data.address && data.address.length > 500) {
        toast.error('Campus address is too long (maximum 500 characters).'); return false;
      }
    }

    if (key === 'courses_catalog' && (!Array.isArray(data) || data.some(c => !c.title?.trim()))) {
      toast.error('Every program category requires a title.'); return false;
    }
    if (key === 'facilities_gallery' && (!Array.isArray(data) || data.some(f => !f.name?.trim()))) {
      toast.error('Every facility requires a name.'); return false;
    }
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/admin/landing-content/${key}`, { data: key === 'contact_details' ? (({ privacy_url, ...rest }) => rest)(data) : data }, getAuthHeaders());
      if (!silent) toast.success('Saved and published to the landing page.');
      return true;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save changes.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleUploadFacilityImages = async (facilityIndex, fileList) => {
    if (!fileList || fileList.length === 0) return;
    if (fileList.length > 20) { toast.error('Upload a maximum of 20 photos at once.'); return; }

    for (let file of fileList) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast.error(`"${file.name}" must be JPEG, PNG, or WebP.`);
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

        const saved = await saveSection('facilities_gallery', updatedFacilities, true);
        if (!saved) return;
        setFacilities(updatedFacilities);
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

    const saved = await saveSection('facilities_gallery', updatedFacilities, true);
    if (saved) { setFacilities(updatedFacilities); toast.info('Photo removed from public gallery.'); }
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
    if (!updated[catIndex].courses) {
      updated[catIndex].courses = [];
    }
    updated[catIndex].courses.push(name.trim());
    updated[catIndex].courses.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'accent', numeric: true }));
    setCourses(sortCourseModules(updated));
  };

  const removeSubCourse = (catIndex, subIndex) => {
    const updated = [...courses];
    updated[catIndex].courses = updated[catIndex].courses.filter((_, i) => i !== subIndex);
    setCourses(updated);
  };

  return (
    <div className="lpm-container">
      <div className="lpm-header">
        <div className="lpm-heading">
          
          <p>Manage homepage and Careers messaging, campus information, training programs, and facility galleries.</p>
        </div>
        <button
          className="lpm-btn-secondary"
          onClick={() => {
            if (!window.confirm('Replace all unsaved landing page edits with default content? This does not publish changes until you save each section.')) return;
            setContact(DEFAULT_CONTACT);
            setCourses(DEFAULT_COURSES);
            setFacilities(DEFAULT_FACILITIES);
            toast.info('Defaults loaded into the editor. Save each section to publish.');
          }}
          title="Restore baseline defaults"
        >
          <RotateCcw size={16} /> Restore Defaults
        </button>
      </div>

      <div className="lpm-publish-hint"><span><strong>Publishing:</strong> Changes appear on the public landing page after saving and refreshing it. Booking and Careers records remain managed in their respective modules.</span><button className="lpm-btn-secondary" onClick={() => window.open(window.location.origin, '_blank', 'noopener,noreferrer')}>Preview Public Site</button></div>
      <div className="lpm-overview" aria-label="Landing page content summary">
        <div className="lpm-overview-item"><span>CONTENT SECTIONS</span><strong>04</strong><small>Homepage & Careers, contact, courses, facilities</small></div>
        <div className="lpm-overview-item"><span>COURSE CATEGORIES</span><strong>{courses.length}</strong><small>Editable training tracks</small></div>
        <div className="lpm-overview-item"><span>FACILITY GROUPS</span><strong>{facilities.length}</strong><small>Published photo collections</small></div>
      </div>

      <div className="lpm-tabs-bar" role="tablist" aria-label="Landing content sections">
        <button className={`lpm-tab-btn ${activeTab === 'overview' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Homepage & Careers</button>
        <button className={`lpm-tab-btn ${activeTab === 'contact' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'contact'} onClick={() => setActiveTab('contact')}>
          Contact Details & Hours
        </button>
        <button className={`lpm-tab-btn ${activeTab === 'courses' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'courses'} onClick={() => setActiveTab('courses')}>
          Course Management ({courses.length})
        </button>
        <button className={`lpm-tab-btn ${activeTab === 'facilities' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'facilities'} onClick={() => setActiveTab('facilities')}>
          Facility Galleries ({facilities.length})
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="lpm-card">
          <div className="lpm-card-header"><h3>Public Homepage and Careers — Introduction Content</h3><span className="lpm-tag">Synced to Public Page</span></div>
          <p className="lpm-section-help">These fields are published through the existing contact_details CMS record, so no database schema change is required.</p>
          <div className="lpm-form-grid">
            {[
              ['hero_eyebrow', 'Hero Eyebrow'], ['hero_line1', 'Hero Title — First Line'],
              ['hero_line2', 'Hero Title — Accent Line'], ['hero_description', 'Hero Description'],
              ['about_title', 'About Section Heading'], ['about_description', 'About Section Description'],
              ['careers_title', 'Careers Page Heading'], ['careers_description', 'Careers Page Introduction']
            ].map(([key, label]) => (
              <div className={`lpm-form-group ${['hero_description', 'about_description', 'careers_description'].includes(key) ? 'full-width' : ''}`} key={key}>
                <label htmlFor={`lpm-${key}`}>{label}</label>
                {['hero_description', 'about_description', 'careers_description'].includes(key) ?
                  <textarea id={`lpm-${key}`} rows="3" value={contact[key] || ''} onChange={e => setContact(prev => ({ ...prev, [key]: e.target.value }))} maxLength={800}/> :
                  <input id={`lpm-${key}`} value={contact[key] || ''} onChange={e => setContact(prev => ({ ...prev, [key]: e.target.value }))} maxLength={200}/>
                }
              </div>
            ))}
          </div>
          <div className="lpm-card-actions"><button className="lpm-btn-primary" onClick={() => saveSection('contact_details', contact)} disabled={saving}>{saving ? 'Publishing...' : 'Save & Publish Homepage'}</button></div>
        </div>
      )}

      {/* TAB 1: CONTACT DETAILS */}
      {activeTab === 'contact' && (
        <div className="lpm-card">
          <div className="lpm-card-header">
            <h3>Campus Location & Operating Hours</h3>
            <span className="lpm-tag">Live Public Section</span>
          </div>

          <div className="lpm-official-contact-action"><span>Use preset campus contact details when appropriate. Existing saved information is not automatically overwritten.</span><button type="button" className="lpm-btn-secondary" onClick={() => setContact(prev => ({ ...prev, address: DEFAULT_CONTACT.address, phone_secondary: DEFAULT_CONTACT.phone_secondary, email_admissions: DEFAULT_CONTACT.email_admissions, hours_weekday: DEFAULT_CONTACT.hours_weekday, hours_weekend: DEFAULT_CONTACT.hours_weekend, hours_sunday: DEFAULT_CONTACT.hours_sunday }))}>Load Contact Preset</button></div>
          <div className="lpm-form-grid">
            <div className="lpm-form-group full-width">
              <label>Campus Physical Address</label>
              <textarea
                rows="2"
                value={contact.address || ''}
                onChange={e => setContact({ ...contact, address: e.target.value })}
                placeholder="Building, street, and city..."
                maxLength={500}
              />
              <span className="lpm-hint">Displayed on public landing page and embedded Google Maps link.</span>
            </div>

            <div className="lpm-form-group">
              <label>Admissions Email</label>
              <input
                value={contact.email_admissions || ''}
                onChange={e => setContact({ ...contact, email_admissions: e.target.value })}
                placeholder="admissions@hct.ph"
              />
            </div>

            <div className="lpm-form-group">
              <label>Mobile Contact Number</label>
              <input
                value={contact.phone_secondary || ''}
                onChange={e => setContact({ ...contact, phone_secondary: e.target.value })}
                placeholder="+63 912 345 6789"
              />
            </div>

            <div className="lpm-form-group">
              <label>Weekday Hours (Mon – Fri)</label>
              <input
                value={contact.hours_weekday || ''}
                onChange={e => setContact({ ...contact, hours_weekday: e.target.value })}
                placeholder="Mon - Fri: 8:00 AM – 5:00 PM"
              />
            </div>

            <div className="lpm-form-group">
              <label>Saturday Hours</label>
              <input
                value={contact.hours_weekend || ''}
                onChange={e => setContact({ ...contact, hours_weekend: e.target.value })}
                placeholder="Saturday: 8:00 AM – 12:00 PM"
              />
            </div>

            <div className="lpm-form-group full-width">
              <label>Sunday Schedule</label>
              <input
                value={contact.hours_sunday || ''}
                onChange={e => setContact({ ...contact, hours_sunday: e.target.value })}
                placeholder="Sunday: CLOSED"
              />
            </div>
          </div>

          <div className="lpm-card-actions">
            <button className="lpm-btn-primary" onClick={() => saveSection('contact_details', contact)} disabled={saving}>
               {saving ? 'Saving Changes...' : 'Save Changes'}
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
                  <h4 className="lpm-track-title">Track #{idx + 1}: {cat.title}</h4>
                  <span className="lpm-track-subtitle">
                    {(cat.courses || []).length} modules configured (Alphabetically Sorted)
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
                    placeholder="e.g. AHA Programs"
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
                <label className="lpm-subcourses-title">Included Modules / Syllabi (Sorted A–Z):</label>
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
                    placeholder="Add module (automatically placed alphabetically)..."
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
               {saving ? 'Saving...' : 'Save Changes'}
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
                  <h3 className="lpm-facility-title">{fac.name}</h3>
                  <span className="lpm-facility-subtitle">
                    {(fac.images || []).length} photos in gallery
                  </span>
                </div>
                <div className="lpm-facility-actions">
                <button type="button" className="lpm-btn-danger-icon" title="Remove facility group" aria-label={`Remove ${fac.name}`} onClick={() => { if (window.confirm(`Remove ${fac.name} from the public gallery after saving?`)) setFacilities(prev => prev.filter((_, i) => i !== idx)); }}><Trash2 size={16}/></button>
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
                </label></div>
              </div>

              <div className="lpm-form-grid lpm-facility-fields">
                <div className="lpm-form-group"><label>Facility Name</label><input value={fac.name || ''} maxLength={100} onChange={e => setFacilities(prev => prev.map((item, i) => i === idx ? { ...item, name: e.target.value } : item))}/></div>
                <div className="lpm-form-group"><label>Public Gallery Description</label><input value={fac.description || ''} maxLength={250} placeholder="Short description of this learning space" onChange={e => setFacilities(prev => prev.map((item, i) => i === idx ? { ...item, description: e.target.value } : item))}/></div>
              </div>
              <div className="lpm-facility-photos-grid">
                {(fac.images || []).length === 0 ? (
                  <div className="lpm-no-photos">
                    <ImageIcon size={40} className="text-muted" />
                    <p>No photos uploaded yet for {fac.name}. Click "Upload Photos" above to add images.</p>
                  </div>
                ) : (
                  (fac.images || []).map((imgUrl, imgIdx) => (
                    <div key={imgIdx} className="lpm-photo-box">
                      <img
                        src={resolveImageSrc(imgUrl)}
                        alt={`${fac.name} ${imgIdx + 1}`}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.parentElement?.classList.add('lpm-image-failed');
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
            <button className="lpm-btn-secondary" type="button" onClick={() => setFacilities(prev => [...prev, { name: 'New Facility', description: '', images: [] }])}><Plus size={16}/> Add Facility Group</button>
            <button className="lpm-btn-primary" onClick={() => saveSection('facilities_gallery', facilities)} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPageManagement;