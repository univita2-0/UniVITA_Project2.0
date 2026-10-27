import React, { useEffect } from 'react';
import './PrivacyPolicy.css';

export default function PrivacyPolicy() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="privacy-wrapper">
      <main className="privacy-container">
        
        <header className="privacy-header">
          <h1>Privacy Policy & Terms</h1>
          <p>Last Updated: October 27, 2026</p>
        </header>

        <section className="privacy-section">
          <h2>1. Overview</h2>
          <p>
            Welcome to <strong>UniVITA</strong>, operated by <strong>HCT Academy</strong>. 
            By using our mobile app and web portal, you agree to these terms. This policy explains what data we collect, why we need it, and how we protect it.
          </p>
        </section>

        <section className="privacy-section">
          <h2>2. Information We Collect</h2>
          
          <h3>For Instructors and Staff</h3>
          <ul>
            <li>
              <strong>Personal Info:</strong> Full name, Employee ID, email, phone number, date of birth, gender, home address, and emergency contact details. We also collect Government IDs (SSS, PhilHealth, Pag-IBIG, TIN) strictly for payroll and statutory compliance.
            </li>
            <li>
              <strong>Work Data:</strong> Shift schedules, Attendance logs, leave requests, overtime filings, and complete payroll details (salary, allowances, and deductions).
            </li>
            <li>
              <strong>Location Data:</strong> GPS coordinates when you clock in, clock out, and during active shifts to verify campus presence.
            </li>
            <li>
              <strong>Camera/Selfies:</strong> Photos taken during clock-in/out strictly for identity verification.
            </li>
          </ul>

          <h3>For Campus Visitors</h3>
          <ul>
            <li><strong>Personal Info:</strong> Full name, email, and phone number.</li>
            <li><strong>Visit Details:</strong> Purpose of visit, scheduled date, time, and check-in/out timestamps.</li>
            <li><strong>Tracking Data:</strong> Indoor location mapping coordinates for campus safety and security.</li>
          </ul>
        </section>

        <section className="privacy-section highlight-box">
          <h2>3. Location and Camera Use</h2>
          <p>
            <strong>Location:</strong> We use GPS to ensure you are within the campus during your shift. Background tracking stops automatically when you clock out.
          </p>
          <p>
            <strong>Camera:</strong> Selfies are required to verify your identity and prevent proxy attendance. We do not use this for facial recognition profiling.
          </p>
        </section>

        <section className="privacy-section">
          <h2>4. Data Sharing</h2>
          <p>
            We <strong>do not sell</strong> your personal data. Only authorized HCT Academy staff (HR, Admin, Security) can access your information. We use trusted third-party services for cloud hosting and push notifications.
          </p>
        </section>

        <section className="privacy-section">
          <h2>5. Your Privacy Rights</h2>
          <p>
            Under the Philippine Data Privacy Act (RA 10173), you have the right to access, correct, or request the deletion of your data. To exercise these rights, please contact HR.
          </p>
        </section>

        <section className="privacy-section">
          <h2>6. Terms of Use</h2>
          <p>
            This app is for authorized HCT Academy personnel only. You are responsible for keeping your login secure. Attempting to spoof GPS, bypass geofencing, or use another person's account is strictly prohibited and may result in disciplinary action.
          </p>
        </section>

        <section className="privacy-section">
          <h2>7. Contact Us</h2>
          <p>For questions or data privacy concerns, please reach out to us:</p>
          <div className="contact-box">
            <p><strong>HCT Academy - Data Privacy Officer</strong></p>
            <p>Email: <a href="mailto:hctacademy00@gmail.com">hctacademy00@gmail.com</a></p>
            <p>Address: 3F & 5F Westar Building, Shaw Boulevard, Pasig City</p>
          </div>
        </section>

        <footer className="privacy-footer">
          <a href="/" className="back-link">&larr; Back to UniVITA Home</a>
        </footer>

      </main>
    </div>
  );
}