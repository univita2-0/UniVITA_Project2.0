// src/pages/Login.js
import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { login, requestPasswordReset, resetPassword, API_BASE } from '../api';
import { ArrowLeft, ShieldCheck, Mail, Lock, KeyRound, Eye, EyeOff } from 'lucide-react';
import './Login.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Login = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // New Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  // Steps: 'login' | 'otp' | 'forgot-password' | 'reset-otp' | 'reset-new-password'
  const [step, setStep] = useState('login'); 
  const [otp, setOtp] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const startResendTimer = () => setResendTimer(60);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Please enter both email and password.');
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      toast.error('Please enter a valid email address.');
      return;
    }

    setOtpLoading(true);

    try {
      const result = await login({ email: email.trim(), password });

      if (result && result.success) {
        if (result.requiresPasswordReset) {
          toast.error('Your password has expired. Please use the mobile app to reset it.');
          setOtpLoading(false);
          return;
        }

        const otpRes = await fetch(`${API_BASE}/auth/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        });
        const otpData = await otpRes.json();

        if (otpData && otpData.success) {
          setStep('otp');
          startResendTimer();
          toast.success('Security verification code sent to your email.');
        } else {
          toast.error(otpData?.message || 'Failed to send OTP verification code.');
        }
      } else {
        const serverMsg = result?.message || '';
        if (serverMsg.includes("does not have access")) {
          toast.error("This account does not have access.");
        } else if (serverMsg.toLowerCase().includes('password') || serverMsg === 'Invalid credentials.') {
          toast.error('Incorrect password.');
        } else if (serverMsg.toLowerCase().includes('email') || serverMsg.toLowerCase().includes('not found')) {
          toast.error('Email invalid or account not found.');
        } else {
          toast.error(serverMsg || 'Incorrect email or password. Please try again.');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Connection error. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.length < 6) {
      toast.error('Please enter a valid 6-digit OTP code.');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp }),
      });
      const data = await res.json();

      if (data && data.success) {
        if (data.user.role === 'instructor') {
          toast.error('This account does not have access.');
          setStep('login');
          setOtp('');
          return;
        }

        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_id', data.user.id);
        localStorage.setItem('user_name', data.user.full_name);
        localStorage.setItem('user_role', data.user.role);
        localStorage.setItem('user_email', data.user.email);
        localStorage.setItem('employee_id', data.user.employee_id);

        toast.success('Authentication successful. Redirecting...');
        setTimeout(() => {
          window.location.href = '/';
        }, 800);
      } else {
        toast.error(data?.message || 'Invalid OTP');
      }
    } catch (err) {
      console.error(err);
      toast.error('Invalid OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      toast.error('Valid email is required to resend code.');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data && data.success) {
        startResendTimer();
        toast.success('A new verification code has been sent.');
      } else {
        toast.error(data?.message || 'Failed to resend OTP.');
      }
    } catch (err) {
      toast.error('Connection error while resending code.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      toast.error('Please enter a valid account email address.');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await requestPasswordReset(email.trim());
      if (res && res.success) {
        toast.success(res.message || 'Reset code sent to your email.');
        setStep('reset-otp'); 
        startResendTimer();
      } else {
        const serverMsg = res?.message || '';
        if (serverMsg.includes("does not have access")) {
          toast.error("This account does not have access.");
        } else {
          toast.error(serverMsg || 'No active account found with this email address.');
        }
      }
    } catch (err) {
      toast.error('Connection error. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyResetOtp = async (e) => {
    e.preventDefault();
    if (!resetOtp || resetOtp.length < 6) {
      toast.error('Please enter a valid 6-digit reset code.');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp: resetOtp }),
      });
      const data = await res.json();

      if (data && data.success) {
        toast.success('OTP verified successfully.');
        setStep('reset-new-password'); 
      } else {
        toast.error(data?.message || 'Invalid OTP code.');
      }
    } catch (err) {
      toast.error('Invalid OTP code.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    
    if (
      !newPassword || 
      newPassword.length < 8 || 
      !/[A-Z]/.test(newPassword) || 
      !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)
    ) {
      toast.error('Your password must be at least 8 chars long, contain 1 uppercase, and 1 special character.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await resetPassword({ email: email.trim(), otp: resetOtp, newPassword });
      if (res && res.success) {
        toast.success('Password reset successfully. You can now log in.');
        setStep('login');
        setResetOtp('');
        setNewPassword('');
        setConfirmPassword('');
        setPassword('');
      } else {
        toast.error(res?.message || 'Failed to reset password.');
      }
    } catch (err) {
      toast.error('Connection error during password reset.');
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="modern-login-wrapper">
      <div className="login-ambient-bg">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      <button className="btn-glass-back" onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>

      <div className="glass-login-card">
        {step === 'login' && (
          <div className="gl-brand-header gl-stagger-1">
            <div className="gl-brand-icon">
              <ShieldCheck size={28} strokeWidth={2} />
            </div>
            <h1 className="gl-brand-title">Welcome back!</h1>
          </div>
        )}

        {/* Step: Login */}
        {step === 'login' && (
          <div className="gl-auth-container gl-fade-in-up">
            <form onSubmit={handleLogin}>
              <div className="gl-input-group gl-stagger-2">
                <Mail size={18} className="gl-input-icon" />
                <input
                  type="email"
                  className="gl-input"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              
              <div className="gl-input-group gl-stagger-3" style={{ position: 'relative' }}>
                <Lock size={18} className="gl-input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  className="gl-input"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9CA3AF',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="gl-options gl-stagger-4">
                <button type="button" className="gl-text-link" onClick={() => setStep('forgot-password')}>
                  Forgot Password?
                </button>
              </div>

              <button type="submit" className="btn-gl-primary gl-stagger-5" disabled={otpLoading}>
                {otpLoading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          </div>
        )}

        {/* Step: OTP */}
        {step === 'otp' && (
          <div className="gl-auth-container gl-fade-in-up">
            <div className="gl-instruction gl-stagger-2">
              <h4>Two-Factor Authentication</h4>
              <p>Enter the 6-digit security code sent to <strong>{email}</strong>.</p>
            </div>

            <form onSubmit={handleVerifyOtp}>
              <div className="gl-input-group otp-group gl-stagger-3">
                <input
                  type="text"
                  className="gl-input gl-otp-input"
                  placeholder="0 0 0 0 0 0"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-gl-primary gl-stagger-4" disabled={otp.length < 6 || otpLoading}>
                {otpLoading ? 'Verifying...' : 'Verify & Proceed'}
              </button>
            </form>

            <div className="gl-resend-timer gl-stagger-5">
              {resendTimer > 0 ? (
                <span>Resend code in {resendTimer}s</span>
              ) : (
                <button onClick={handleResendOtp} disabled={otpLoading} className="gl-text-link">
                  {otpLoading ? 'Sending...' : 'Resend Code'}
                </button>
              )}
            </div>

            <button className="btn-gl-secondary mt-3 gl-stagger-6" onClick={() => { setStep('login'); setOtp(''); }}>
              Cancel
            </button>
          </div>
        )}

        {/* Step: Forgot Password (Email Input) */}
        {step === 'forgot-password' && (
          <div className="gl-auth-container gl-fade-in-up">
            <div className="gl-instruction gl-stagger-2">
              <h4>Reset Password</h4>
              <p>Enter your registered admin/HR email to receive a secure reset code.</p>
            </div>

            <form onSubmit={handleForgotPasswordSubmit}>
              <div className="gl-input-group gl-stagger-3">
                <Mail size={18} className="gl-input-icon" />
                <input
                  type="email"
                  className="gl-input"
                  placeholder="Account Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-gl-primary gl-stagger-4" disabled={otpLoading}>
                {otpLoading ? 'Sending Request...' : 'Send Reset Code'}
              </button>
            </form>

            <button className="btn-gl-secondary mt-3 gl-stagger-5" onClick={() => setStep('login')}>
              Return to Login
            </button>
          </div>
        )}

        {/* Step: Reset OTP Input Modal */}
        {step === 'reset-otp' && (
          <div className="gl-auth-container gl-fade-in-up">
            <div className="gl-instruction gl-stagger-2">
              <h4>Enter Reset Code</h4>
              <p>Enter the 6-digit code sent to <strong>{email}</strong>.</p>
            </div>

            <form onSubmit={handleVerifyResetOtp}>
              <div className="gl-input-group otp-group gl-stagger-3">
                <input
                  type="text"
                  className="gl-input gl-otp-input"
                  placeholder="0 0 0 0 0 0"
                  value={resetOtp}
                  onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-gl-primary gl-stagger-4" disabled={resetOtp.length < 6 || otpLoading}>
                {otpLoading ? 'Validating...' : 'Verify Code'}
              </button>
            </form>

            <div className="gl-resend-timer gl-stagger-5">
              {resendTimer > 0 ? (
                <span>Resend in {resendTimer}s</span>
              ) : (
                <button onClick={handleForgotPasswordSubmit} disabled={otpLoading} className="gl-text-link">
                  Resend Code
                </button>
              )}
            </div>

            <button className="btn-gl-secondary mt-3 gl-stagger-6" onClick={() => { setStep('login'); setResetOtp(''); }}>
              Cancel
            </button>
          </div>
        )}

        {/* Step: Reset New Password & Confirmation Modal */}
        {step === 'reset-new-password' && (
          <div className="gl-auth-container gl-fade-in-up">
            <div className="gl-instruction gl-stagger-2">
              <h4>Create New Password</h4>
              <p>Enter and confirm your new secure password below.</p>
            </div>

            <form onSubmit={handleResetPasswordSubmit}>
              <div className="gl-input-group gl-stagger-3" style={{ position: 'relative' }}>
                <Lock size={18} className="gl-input-icon" />
                <input
                  type={showNewPassword ? "text" : "password"}
                  className="gl-input"
                  placeholder="New Password (min 8 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9CA3AF',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="gl-input-group gl-stagger-4" style={{ position: 'relative' }}>
                <KeyRound size={18} className="gl-input-icon" />
                <input
                  type={showNewPassword ? "text" : "password"}
                  className="gl-input"
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>

              <button type="submit" className="btn-gl-primary gl-stagger-5" disabled={otpLoading || newPassword.length < 8 || confirmPassword.length < 8}>
                {otpLoading ? 'Updating System...' : 'Update Password'}
              </button>
            </form>

            <button className="btn-gl-secondary mt-3 gl-stagger-6" onClick={() => { setStep('login'); setResetOtp(''); setNewPassword(''); setConfirmPassword(''); }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;