import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { login, requestPasswordReset, resetPassword, API_BASE } from '../api';
import { ArrowLeft, ShieldCheck, Mail, Lock, KeyRound } from 'lucide-react';
import './Login.css';

const Login = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState('login'); // 'login' | 'otp' | 'forgot-password' | 'reset-password'
  const [otp, setOtp] = useState('');
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
        toast.error(result?.message || 'Incorrect email or password. Please try again.');
      }
    } catch (err) {
      console.error(err);
      // Ensure backend errors (like 401 Invalid Credentials) show the correct toast
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Incorrect email or password. Please try again.');
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

    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();

      if (data && data.success) {
        if (data.user.role === 'instructor') {
          toast.error('Instructor accounts cannot log in to the web portal. Please use the UniVITA mobile app.');
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
        toast.error(data?.message || 'Invalid or expired OTP code.');
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Connection error during verification.');
    }
  };

  const handleResendOtp = async () => {
    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
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
    if (!email.trim()) {
      toast.error('Please enter your account email address.');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await requestPasswordReset(email.trim());
      if (res && res.success) {
        toast.success(res.message || 'Reset code sent to your email.');
        setStep('reset-password');
        startResendTimer();
      } else {
        toast.error(res?.message || 'No account found with this email address.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Connection error. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!otp || otp.length < 6 || !newPassword || newPassword.length < 6) {
      toast.error('Please provide a valid 6-digit code and a new password (min. 6 characters).');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await resetPassword({ email, otp, newPassword });
      if (res && res.success) {
        toast.success('Password reset successfully. You can now log in.');
        setStep('login');
        setOtp('');
        setNewPassword('');
        setPassword('');
      } else {
        toast.error(res?.message || 'Failed to reset password.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Connection error during password reset.');
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="modern-login-wrapper">
      {/* Animated Background Blobs */}
      <div className="login-ambient-bg">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      <button className="btn-glass-back" onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>

      <div className="glass-login-card">
        {/* Brand Header: Strictly rendered ONLY on initial login step */}
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
              
              <div className="gl-input-group gl-stagger-3">
                <Lock size={18} className="gl-input-icon" />
                <input
                  type="password"
                  className="gl-input"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
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
              <button type="submit" className="btn-gl-primary gl-stagger-4" disabled={otp.length < 6}>
                Verify & Proceed
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

        {/* Step: Forgot Password */}
        {step === 'forgot-password' && (
          <div className="gl-auth-container gl-fade-in-up">
            <div className="gl-instruction gl-stagger-2">
              <h4>Reset Password</h4>
              <p>Enter your registered email address to receive a secure reset code.</p>
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

        {/* Step: Reset Password */}
        {step === 'reset-password' && (
          <div className="gl-auth-container gl-fade-in-up">
            <div className="gl-instruction gl-stagger-2">
              <h4>Create New Password</h4>
              <p>Enter the reset code sent to <strong>{email}</strong> and your new password.</p>
            </div>

            <form onSubmit={handleResetPasswordSubmit}>
              <div className="gl-input-group gl-stagger-3">
                <KeyRound size={18} className="gl-input-icon" />
                <input
                  type="text"
                  className="gl-input"
                  placeholder="6-Digit Reset Code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  maxLength={6}
                  required
                />
              </div>
              <div className="gl-input-group gl-stagger-4">
                <Lock size={18} className="gl-input-icon" />
                <input
                  type="password"
                  className="gl-input"
                  placeholder="New Password (min. 6 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <button type="submit" className="btn-gl-primary gl-stagger-5" disabled={otpLoading || otp.length < 6 || newPassword.length < 6}>
                {otpLoading ? 'Updating System...' : 'Update Password'}
              </button>
            </form>

            <button className="btn-gl-secondary mt-3 gl-stagger-6" onClick={() => { setStep('login'); setOtp(''); setNewPassword(''); }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;