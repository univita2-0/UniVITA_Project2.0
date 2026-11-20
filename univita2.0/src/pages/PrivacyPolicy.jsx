import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUp, ShieldCheck, LockKeyhole, MapPin, Mail, ExternalLink, List, X } from 'lucide-react';
import './PrivacyPolicy.css';

const SECTIONS = [
  { id: 'introduction', title: 'Introduction' },
  { id: 'information-we-collect', title: 'Information We Collect' },
  { id: 'how-we-use-information', title: 'How We Use Information' },
  { id: 'attendance-location', title: 'Attendance and Location Data' },
  { id: 'ble-tracking', title: 'BLE Visitor Tracking Information' },
  { id: 'mobile-data', title: 'Mobile Application Data' },
  { id: 'authentication', title: 'Authentication and Security' },
  { id: 'cookies', title: 'Cookies and Website Data' },
  { id: 'sharing', title: 'Data Sharing and Disclosure' },
  { id: 'protection', title: 'Data Protection Measures' },
  { id: 'rights', title: 'Your Privacy Rights' },
  { id: 'retention', title: 'Data Retention Policy' },
  { id: 'employee-visitor', title: 'Employee and Visitor Information' },
  { id: 'children', title: "Children's Privacy" },
  { id: 'updates', title: 'Changes to this Privacy Policy' },
  { id: 'contact', title: 'Contact Information' }
];

const NavLinks = ({ onNavigate }) => (
  <ol className="pp-toc-list">
    {SECTIONS.map((section, index) => (
      <li key={section.id}>
        <a href={`#${section.id}`} onClick={onNavigate}>
          <span className="pp-toc-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <span>{section.title}</span>
        </a>
      </li>
    ))}
  </ol>
);

function PolicySection({ number, id, title, children }) {
  return (
    <section id={id} className="pp-policy-section" aria-labelledby={`${id}-title`}>
      <div className="pp-section-heading">
        <span className="pp-section-index" aria-hidden="true">{String(number).padStart(2, '0')}</span>
        <h2 id={`${id}-title`}>{title}</h2>
      </div>
      <div className="pp-section-body">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  const [mobileContentsOpen, setMobileContentsOpen] = useState(false);

  useEffect(() => {
    // Preserve the existing route's scroll-to-top behavior on navigation.
    if (!window.location.hash) window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!mobileContentsOpen) return undefined;
    const onEscape = (event) => {
      if (event.key === 'Escape') setMobileContentsOpen(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [mobileContentsOpen]);

  const closeContents = () => setMobileContentsOpen(false);

  return (
    <div className="pp-wrapper" id="privacy-policy-top">
      <a className="pp-skip-link" href="#pp-policy-content">Skip to privacy policy content</a>

      <header className="pp-hero">
        <div className="pp-page-shell">
          <div className="pp-topline">
            <a className="pp-brand" href="/" aria-label="Return to UniVITA home">
              <span className="pp-brand-mark"><ShieldCheck size={20} aria-hidden="true" /></span>
              <span>HCT Academy <span className="pp-brand-divider">/</span> UniVITA</span>
            </a>
            <a className="pp-hero-back" href="/"><ArrowLeft size={16} aria-hidden="true" /> Back to home</a>
          </div>
          <div className="pp-hero-main">
            <span className="pp-eyebrow"><LockKeyhole size={15} aria-hidden="true" /> Privacy &amp; personal data</span>
            <h1>Privacy Policy</h1>
            <p className="pp-hero-intro">How HCT Academy and its UniVITA platform collect, use, protect, and manage personal information across academy services, visitor appointments, recruitment, and employee operations.</p>
            <div className="pp-hero-meta">
              <span><strong>Last updated:</strong> November 10, 2026</span>
              <span><strong>Applies to:</strong> Website, web portal &amp; mobile app</span>
              <span><strong>Jurisdiction:</strong> Philippines</span>
            </div>
          </div>
        </div>
      </header>

      <main className="pp-page-shell pp-main" id="pp-policy-content">
        <div className="pp-summary" aria-label="Privacy overview">
          <div className="pp-summary-icon"><ShieldCheck size={22} aria-hidden="true" /></div>
          <div>
            <h2>Privacy at a glance</h2>
            <p>We use information to manage academy inquiries, appointments, recruitment, employment, attendance, and campus safety. Access should be limited to authorized personnel based on their responsibilities. Your privacy rights under Philippine law continue to apply.</p>
          </div>
        </div>

        <button
          className="pp-mobile-toc-toggle"
          type="button"
          aria-expanded={mobileContentsOpen}
          aria-controls="pp-mobile-contents"
          onClick={() => setMobileContentsOpen((open) => !open)}
        >
          <span><List size={18} aria-hidden="true" /> On this page</span>
          {mobileContentsOpen ? <X size={18} aria-hidden="true" /> : <span className="pp-expand-label">View sections</span>}
        </button>
        <nav id="pp-mobile-contents" className={`pp-mobile-toc ${mobileContentsOpen ? 'is-open' : ''}`} aria-label="Mobile privacy policy sections" hidden={!mobileContentsOpen}>
          <NavLinks onNavigate={closeContents} />
        </nav>

        <div className="pp-layout">
          <aside className="pp-sidebar" aria-label="Privacy policy navigation">
            <nav className="pp-toc" aria-label="Privacy policy sections">
              <div className="pp-toc-title">ON THIS PAGE</div>
              <NavLinks />
            </nav>
            <div className="pp-sidebar-help">
              <Mail size={18} aria-hidden="true" />
              <div><strong>Have a privacy concern?</strong><a href="mailto:hctacademy00@gmail.com?subject=Data%20Privacy%20Inquiry">Contact HCT Academy</a></div>
            </div>
          </aside>

          <article className="pp-article" aria-label="HCT Academy and UniVITA privacy policy">
            <PolicySection number={1} id="introduction" title="Introduction">
              <p>HCT Academy respects the privacy of people who interact with its website and UniVITA information system. This notice explains the personal data that may be processed for visitors, prospective students, job applicants, employees, instructors, administrators, and security personnel.</p>
              <p>UniVITA supports appointment management, visitor safety, attendance, scheduling, leave and overtime requests, payroll administration, and related academy operations. HCT Academy is responsible for determining the purposes and means of processing information for these activities, subject to applicable arrangements with service providers.</p>
              <p>This notice is intended to explain our practices in clear language, consistent with Republic Act No. 10173 (the Philippine Data Privacy Act of 2012), its implementing rules, and applicable guidance from the National Privacy Commission. It is a privacy notice, not a waiver of your legal rights or a substitute for applicable employment or enrollment terms.</p>
            </PolicySection>

            <PolicySection number={2} id="information-we-collect" title="Information We Collect">
              <p>Information varies according to your relationship with the academy and the services you use. We aim to collect what is relevant and necessary for each purpose.</p>
              <div className="pp-info-grid">
                <div className="pp-info-card"><h3>Visitors &amp; prospective students</h3><p>Name, contact details, inquiry or appointment purpose, preferred visit date and time, companion names when provided, and visit status or entry/exit records.</p></div>
                <div className="pp-info-card"><h3>Job applicants</h3><p>Contact information, job applied for, résumé, cover letter, relevant qualifications, and professional licensing details where the position requires them.</p></div>
                <div className="pp-info-card"><h3>Employees &amp; instructors</h3><p>Identity and contact details, employee ID, employment records, schedules, attendance, leave and overtime requests, payroll and benefits information, and work-related verification records.</p></div>
                <div className="pp-info-card"><h3>System users</h3><p>Account identifiers, assigned role, authentication and security activity, system actions, and technical information needed to operate and protect the platform.</p></div>
              </div>
              <p>Some records, such as government identifiers, emergency contacts, photographs, and precise location information, may require additional safeguards because of their sensitivity or context.</p>
            </PolicySection>

            <PolicySection number={3} id="how-we-use-information" title="How We Use Information">
              <ul className="pp-list">
                <li>Respond to inquiries, arrange academy visits, and communicate appointment decisions or updates.</li>
                <li>Review employment applications and administer recruitment where an individual applies for a role.</li>
                <li>Manage employee records, teaching assignments, attendance, leave, overtime, payroll, and related administrative processes.</li>
                <li>Verify authorized campus entry and support visitor safety and security procedures.</li>
                <li>Protect accounts, investigate reported misuse, maintain relevant audit records, and support lawful operational reviews.</li>
                <li>Meet applicable contractual, employment, accounting, safety, or legal obligations.</li>
              </ul>
              <p>Depending on the activity, processing may be based on consent, a contract or employment relationship, compliance with legal obligations, or another lawful basis permitted under the Data Privacy Act. A particular lawful basis must be assessed for the specific processing activity; use of this website alone is not treated as blanket consent to every type of processing.</p>
            </PolicySection>

            <PolicySection number={4} id="attendance-location" title="Attendance and Location Data">
              <p>When employees or instructors use UniVITA attendance features, the system may process check-in and check-out times, campus geofence results, device-provided GPS coordinates, and attendance verification photographs. These help confirm whether attendance was recorded at an authorized location and support corrections or appeals.</p>
              <p>Location information can be imprecise because of device settings, connectivity, GPS drift, or building conditions. Employees may use the established attendance correction or appeal process where a record is inaccurate.</p>
              <div className="pp-inline-note"><MapPin size={20} aria-hidden="true" /><p><strong>Important:</strong> Campus verification and any active-shift location features should be explained to affected personnel before use. The precise collection interval, background-location behavior, and retention period must match the mobile app's actual configuration and authorized academy policy.</p></div>
            </PolicySection>

            <PolicySection number={5} id="ble-tracking" title="BLE Visitor Tracking Information">
              <p>For visits using a Bluetooth Low Energy (BLE) visitor tag, UniVITA may associate an issued tag identifier with a visitor's approved visit and use signals received by configured campus scanners to estimate the visitor's room or general area.</p>
              <p>This information is intended to support authorized campus safety and visit management. BLE readings are estimates and may be delayed or unavailable; they should not be described as continuous, exact-position tracking. Tag assignments and scanner detections are operational records associated with the visit.</p>
              <p>Visitors should be informed at check-in when a BLE tag is issued, its intended purpose, and the return procedure. The tag should be released when the visit is completed. Access to identifiable movement information should be limited to personnel with a relevant operational duty.</p>
            </PolicySection>

            <PolicySection number={6} id="mobile-data" title="Mobile Application Data">
              <p>The UniVITA mobile application may request access to the camera for attendance selfies, location services for campus attendance verification, local storage for temporary attendance or synchronization data, and notifications for relevant work updates. Permissions depend on which features an employee uses and the device operating system.</p>
              <p>Where offline attendance is supported, records may be stored temporarily on the device and transmitted when connectivity returns. Employees should protect their devices and report a lost or compromised device through established academy channels.</p>
              <p>Disabling a required device permission may prevent the associated feature from working. The app should explain the specific permission at the point of use rather than requesting unrelated access.</p>
            </PolicySection>

            <PolicySection number={7} id="authentication" title="Authentication and Security">
              <p>UniVITA uses user accounts and assigned roles to control access to internal functions. Authentication may include passwords, one-time verification codes, and additional access checks for sensitive operations such as payroll.</p>
              <p>System activity may be recorded to assist with account protection, troubleshooting, and accountability. Authorized users are expected to keep credentials private, avoid sharing accounts, and promptly report suspicious access. Administrative access does not mean unrestricted permission to use personal information for unrelated purposes.</p>
            </PolicySection>

            <PolicySection number={8} id="cookies" title="Cookies and Website Data">
              <p>Our website and web portal may process technical information such as browser type, device information, IP address, request time, error details, and session-related information to operate and secure the service. The platform may also use browser storage to maintain authenticated sessions and user preferences.</p>
              <p>Any optional analytics, marketing cookies, or third-party tracking technologies should be described separately if enabled. This notice does not claim that such technologies are currently active. You can manage browser cookies and site data through your browser settings, although removing necessary session data may sign you out.</p>
            </PolicySection>

            <PolicySection number={9} id="sharing" title="Data Sharing and Disclosure">
              <p>We do not describe personal data as a product for sale. Information may be accessible to authorized academy personnel based on job responsibilities, including HR, administrators, and security staff for their respective functions.</p>
              <p>We may engage service providers for infrastructure, hosting, email, notifications, or application support. Where these providers process personal data on the academy's behalf, suitable contractual and security safeguards are necessary. Information may also be disclosed when required or permitted by applicable law, including lawful regulatory or legal requests.</p>
              <p>Any transfer or access outside the Philippines must be evaluated under applicable data-protection requirements and the safeguards appropriate to the service involved.</p>
            </PolicySection>

            <PolicySection number={10} id="protection" title="Data Protection Measures">
              <p>UniVITA is designed to support role-based access, authenticated requests, controlled access to sensitive workflows, and activity records. The academy should supplement these technical controls with documented access reviews, staff confidentiality requirements, secure backups, incident-handling procedures, and appropriate service-provider oversight.</p>
              <p>No website or application can promise absolute security. If you suspect unauthorized disclosure, account compromise, or an inaccurate security record, contact the academy promptly using the details below.</p>
            </PolicySection>

            <PolicySection number={11} id="rights" title="Your Privacy Rights">
              <p>Subject to applicable legal conditions and exceptions, Philippine data subjects have rights that may include:</p>
              <ul className="pp-list">
                <li><strong>Be informed</strong> about the collection and processing of their personal data.</li>
                <li><strong>Access</strong> personal data and relevant information about its processing.</li>
                <li><strong>Rectify</strong> inaccurate or incomplete personal data.</li>
                <li><strong>Object</strong> to processing in circumstances provided by law.</li>
                <li><strong>Request erasure or blocking</strong> where legally applicable.</li>
                <li><strong>Request data portability</strong> when the applicable requirements are met.</li>
                <li><strong>Seek damages or file a complaint</strong> through lawful processes, including with the National Privacy Commission.</li>
              </ul>
              <p>To request access, correction, or another privacy-rights action, email HCT Academy using the contact information in Section 16. We may need reasonable identity verification before releasing or changing records. Requests are assessed against applicable law, including requirements to retain certain employment, payroll, or security records.</p>
              <p>For further guidance, see the <a href="https://privacy.gov.ph/data-subject-rights/" target="_blank" rel="noopener noreferrer">National Privacy Commission's data-subject rights guidance <ExternalLink size={13} aria-hidden="true" /></a>.</p>
            </PolicySection>

            <PolicySection number={12} id="retention" title="Data Retention Policy">
              <p>Personal information should be kept only for as long as necessary for the stated purpose and any applicable legal, accounting, employment, security, or dispute-resolution requirement. Different categories of records may have different retention periods.</p>
              <p>For example, appointment and BLE records may follow a campus-security retention schedule, recruitment records a hiring schedule, and attendance or payroll records applicable employment and financial-record requirements. Temporary device data and application logs should be subject to documented lifecycle controls.</p>
              <p>When a retention period expires and no lawful reason to keep the information remains, the relevant data should be securely deleted, anonymized, or otherwise disposed of according to approved procedures. Specific retention periods should be available from the academy on request and must be verified against its actual records-management schedule.</p>
            </PolicySection>

            <PolicySection number={13} id="employee-visitor" title="Employee and Visitor Information">
              <h3>Employees, instructors, and authorized staff</h3>
              <p>HR and operational records may be used for employment administration, teaching assignments, leave approvals, attendance corrections, compensation administration, and legitimate internal reviews. Employee records should only be accessed by personnel who need them for an authorized purpose.</p>
              <h3>Visitors, students, and applicants</h3>
              <p>Visitors and prospective students may provide details to request a visit or ask about academy programs. Job applicants may submit employment-related documents. These records should be used for the particular inquiry, visit, or recruitment activity and not automatically repurposed for unrelated marketing.</p>
              <h3>Administrators and security personnel</h3>
              <p>Authorized administrative and security actions may be logged for accountability. Staff members handling others' personal information are expected to follow access restrictions and protect the confidentiality of records.</p>
            </PolicySection>

            <PolicySection number={14} id="children" title="Children's Privacy">
              <p>UniVITA is primarily designed for academy visitors, applicants, and authorized personnel; it is not intended as a service directed at children. If a minor participates in an academy program or visit, personal information should be handled with appropriate care and with parent or guardian involvement where required.</p>
              <p>If you believe information about a minor was submitted without appropriate authority, please contact HCT Academy so the circumstances can be reviewed and appropriate action taken.</p>
            </PolicySection>

            <PolicySection number={15} id="updates" title="Changes to this Privacy Policy">
              <p>We may update this notice to reflect changes in academy operations, UniVITA features, legal requirements, or information-handling practices. The updated version will display a revised date on this page. For material changes that require additional notice or consent, the academy should provide it through an appropriate communication channel.</p>
            </PolicySection>

            <PolicySection number={16} id="contact" title="Contact Information">
              <p>For privacy-related questions, concerns, or requests to exercise your rights, contact HCT Academy through its published contact channel and ask that your inquiry be directed to the person responsible for data privacy.</p>
              <div className="pp-contact-card">
                <div className="pp-contact-icon"><Mail size={21} aria-hidden="true" /></div>
                <div>
                  <h3>HCT Academy — Data Privacy Inquiries</h3>
                  <p><strong>Email:</strong> <a href="mailto:hctacademy00@gmail.com?subject=Data%20Privacy%20Inquiry">hctacademy00@gmail.com</a></p>
                  <p><strong>Office:</strong> 3F &amp; 5F Westar Building, Shaw Boulevard, Pasig City, Metro Manila, Philippines</p>
                  <p className="pp-contact-help">Please include a brief description of your concern. Do not include passwords or unnecessary sensitive documents in your first message.</p>
                </div>
              </div>
              <p>For information about your rights or filing a privacy complaint, visit the <a href="https://privacy.gov.ph/" target="_blank" rel="noopener noreferrer">National Privacy Commission <ExternalLink size={13} aria-hidden="true" /></a>.</p>
            </PolicySection>
          </article>
        </div>

        <footer className="pp-footer">
          <div><strong>HCT Academy · UniVITA</strong><span>Privacy information for academy services and authorized system users.</span></div>
          <div className="pp-footer-actions">
            <a href="/" className="pp-back-btn"><ArrowLeft size={16} aria-hidden="true" /> Back to UniVITA Home</a>
            <a href="#privacy-policy-top" className="pp-to-top"><ArrowUp size={16} aria-hidden="true" /> Back to top</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
