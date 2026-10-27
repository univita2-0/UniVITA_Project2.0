import React, { useEffect } from 'react';
import './PrivacyPolicy.css';

export default function PrivacyPolicy() {
  // Scroll to top when the page loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="privacy-wrapper">
      <main className="privacy-container">
        <header className="privacy-header">
          <h1>Privacy Policy & Terms of Service</h1>
          <p className="last-updated">Effective Date: October 27, 2026 | Last Updated: October 27, 2026</p>
        </header>

        <section className="privacy-section">
          <h2>1. Introduction</h2>
          <p>
            Welcome to <strong>UniVITA</strong>, an Information Security Management System operated by <strong>HCT Academy</strong>. 
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and web portal. 
            By accessing or using UniVITA, you consent to the data practices described in this policy.
          </p>
        </section>

        <section className="privacy-section">
          <h2>2. Information We Collect</h2>
          <p>To provide accurate timekeeping, payroll, and campus security services, we collect the following types of information:</p>
          <ul>
            <li><strong>Personal Identity Data:</strong> Full name, employee ID, email address, phone number, and profile picture.</li>
            <li><strong>Location Data (GPS):</strong> We collect precise geolocation data when you clock in, clock out, and during your active shifts to verify your presence within the campus geofence.</li>
            <li><strong>Biometric/Image Data:</strong> Selfies taken during clock-in and clock-out processes strictly for identity verification.</li>
            <li><strong>Employment Data:</strong> Schedules, attendance records, leave requests, overtime filings, and payroll information.</li>
            <li><strong>Visitor Data (Web Portal):</strong> For campus visitors, we collect names, contact details, and BLE tag assignments for real-time 2D mapping and safety tracking.</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>3. How We Use Your Information</h2>
          <p>We use the collected information for institutional operations, including but not limited to:</p>
          <ul>
            <li>Verifying attendance and enforcing shift schedules (Geofencing).</li>
            <li>Calculating payroll, overtime, and statutory deductions.</li>
            <li>Ensuring campus safety and tracking visitor movements via BLE technology.</li>
            <li>Managing HR requests, leave balances, and attendance corrections.</li>
            <li>Sending automated OTPs for secure login and emergency alerts.</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>4. Background Location Tracking</h2>
          <p>
            UniVITA requires background location access to monitor instructor compliance with shift geofencing. 
            <strong> Location tracking is automatically disabled when you clock out, when your shift ends, or when the app is explicitly closed.</strong> 
            We do not track your location outside of your scheduled working hours.
          </p>
        </section>

        <section className="privacy-section">
          <h2>5. Data Sharing and Disclosure</h2>
          <p>
            We <strong>do not sell, trade, or rent</strong> your personal information to third parties. Your data is only accessible to authorized HCT Academy administrators, HR personnel, and security staff for the purposes outlined above. We may disclose information if required by law or to protect the safety of campus occupants.
          </p>
        </section>

        <section className="privacy-section">
          <h2>6. Data Privacy Act of 2012 (RA 10173) Compliance</h2>
          <p>In strict compliance with the Philippine Data Privacy Act, you possess the following rights:</p>
          <ul>
            <li><strong>Right to be Informed:</strong> You have the right to know how your data is collected and processed.</li>
            <li><strong>Right to Access:</strong> You can request a copy of the personal data we hold about you.</li>
            <li><strong>Right to Object:</strong> You may object to the processing of your data, subject to institutional policies.</li>
            <li><strong>Right to Erasure or Blocking:</strong> You may request the suspension or deletion of your data when it is no longer necessary for the institution's legal obligations.</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>7. Data Retention and Security</h2>
          <p>
            We implement robust administrative, technical, and physical security measures to protect your data against unauthorized access. 
            Attendance, payroll, and security logs are retained in accordance with HCT Academy's records-management policies and legal statutory requirements.
          </p>
        </section>

        <section className="privacy-section">
          <h2>8. Contact Us</h2>
          <p>If you have questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact:</p>
          <div className="contact-box">
            <p><strong>HCT Academy - Data Privacy Officer</strong></p>
            <p>Email: <a href="mailto:support@univitahct.tech">support@univitahct.tech</a></p>
            <p>Address: 3F & 5F Westar Building, Shaw Boulevard, Pasig City, Metro Manila</p>
          </div>
        </section>

        <footer className="privacy-footer">
          <a href="/" className="back-link">&larr; Back to UniVITA Home</a>
        </footer>
      </main>
    </div>
  );
}