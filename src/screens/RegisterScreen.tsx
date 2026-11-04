import React, { useState } from 'react';
import { UserPlus, Shield, CheckCircle, AlertCircle, ArrowLeft, Check } from 'lucide-react';
import { useAccessibility } from '../context/AccessibilityContext.tsx';
import { AudioToolbar } from '../components/AudioToolbar.tsx';

export function RegisterScreen() {
  const { navigateTo, setUser, updateSettings, announce } = useAccessibility();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    pwdCategory: 'Visually Impaired',
    needScribe: true,
    examRegion: 'Northern Region (NR)',
    examLanguage: 'English',
    password: ''
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [registeredRollNumber, setRegisteredRollNumber] = useState<string | null>(null);

  const instructions =
    'Candidate Registration Form for Staff Selection Commission MTS 2026. Please provide your full name, email, PwD disability details, scribe requirements, and preferred examination regional center.';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim() || !formData.email.trim()) {
      setError('Full Name and Email address are required fields.');
      announce('Registration error: Full Name and Email are required.', 'assertive');
      return;
    }

    setLoading(true);
    try {
      const isBlind = formData.pwdCategory === 'Visually Impaired' || Boolean(formData.needScribe);
      const payload = {
        ...formData,
        isBlindMode: isBlind,
        autoReadAloud: isBlind
      };

      if (isBlind) {
        try {
          localStorage.setItem('accessprep_blind_mode', 'true');
        } catch {}
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Registration failed.');
      }

      const rollNumber: string = data.user.rollNumber;
      setRegisteredRollNumber(rollNumber);
      const msg = `Registration successful! Your Roll Number is ${rollNumber}. Please login with your credentials.`;
      setSuccessMsg(msg);
      announce(msg, 'assertive');

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigateTo('login');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
      announce(`Registration error: ${err.message}`, 'assertive');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6" id="main-content">
      {/* 1. Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-300">
        <div>
          <button
            type="button"
            onClick={() => navigateTo('login')}
            className="text-xs font-semibold text-blue-700 hover:underline inline-flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Login</span>
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Candidate Registration · Screen 3 of 16
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Official Staff Selection Commission (MTS) Examination Application &amp; PwD Enrolment
          </p>
        </div>

        <div className="shrink-0">
          <AudioToolbar textToRead={instructions} label="Read registration instructions" />
        </div>
      </div>

      {/* 2. Registration Form Container */}
      <div className="p-6 sm:p-8 bg-white border-2 border-slate-300 rounded-2xl shadow-sm space-y-6">
        {error && (
          <div
            role="alert"
            className="p-4 bg-red-50 border-l-4 border-red-600 rounded-r-lg text-red-900 text-sm flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Validation Incomplete</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section: Candidate Credentials */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-200">
              1. Candidate Identity &amp; Contact
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-xs font-bold text-slate-900 mb-1">
                  Full Name (As per Matriculation Certificate) <span className="text-red-600">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Aarav Sharma"
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg text-slate-900 focus:border-blue-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-xs font-bold text-slate-900 mb-1">
                  Email Address (For Admit Card &amp; Notifications) <span className="text-red-600">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g. candidate@example.com"
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg text-slate-900 focus:border-blue-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-xs font-bold text-slate-900 mb-1">
                  Mobile Number (10 Digits)
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg text-slate-900 focus:border-blue-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-bold text-slate-900 mb-1">
                  Create Accessibility PIN / Password <span className="text-red-600">*</span>
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Minimum 6 characters or PIN"
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg text-slate-900 focus:border-blue-700 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section: Assistive & PwD Details */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-200">
              2. Assistive Technology &amp; PwD Accommodations
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pwdCategory" className="block text-xs font-bold text-slate-900 mb-1">
                  Benchmarked Disability Category (RPwD Act)
                </label>
                <select
                  id="pwdCategory"
                  value={formData.pwdCategory}
                  onChange={(e) => setFormData({ ...formData, pwdCategory: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg bg-white text-slate-900 focus:border-blue-700 focus:outline-hidden"
                >
                  <option value="Visually Impaired">Visually Impaired (Blindness)</option>
                  <option value="Low Vision">Low Vision (Photophobia / Partial)</option>
                  <option value="Locomotor">Locomotor / Cerebral Palsy</option>
                  <option value="None">None (General Candidate)</option>
                </select>
              </div>

              <div>
                <label htmlFor="examRegion" className="block text-xs font-bold text-slate-900 mb-1">
                  Examination Region Center
                </label>
                <select
                  id="examRegion"
                  value={formData.examRegion}
                  onChange={(e) => setFormData({ ...formData, examRegion: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-slate-300 rounded-lg bg-white text-slate-900 focus:border-blue-700 focus:outline-hidden"
                >
                  <option value="Northern Region (NR)">Northern Region (Delhi, Rajasthan, Uttarakhand)</option>
                  <option value="Central Region (CR)">Central Region (Uttar Pradesh, Bihar)</option>
                  <option value="Eastern Region (ER)">Eastern Region (West Bengal, Odisha, Jharkhand)</option>
                  <option value="Western Region (WR)">Western Region (Maharashtra, Gujarat, Goa)</option>
                  <option value="Southern Region (SR)">Southern Region (Tamil Nadu, Andhra Pradesh)</option>
                </select>
              </div>
            </div>

            {/* Scribe & Compensatory Time Notice */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.needScribe}
                  onChange={(e) => setFormData({ ...formData, needScribe: e.target.checked })}
                  className="w-5 h-5 mt-0.5 rounded text-blue-700 border-2 border-slate-400 focus:ring-blue-600"
                />
                <div>
                  <span className="text-sm font-bold text-blue-950">
                    Scribe Facility &amp; Compensatory Time Requested
                  </span>
                  <p className="text-xs text-blue-800 mt-0.5">
                    Eligible candidates are allocated compensatory time of 20 minutes per hour (60 minutes per 45-minute examination session) and scribe assistance.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => navigateTo('login')}
              className="px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              aria-label="Confirm Registration and Enroll"
              className="px-6 sm:px-8 py-3 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#1749E8] to-[#6241C8] hover:from-[#123BB8] hover:to-[#4C2FA8] rounded-lg shadow-md inline-flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 max-w-full text-center whitespace-normal focus:ring-2 focus:ring-[#6241C8]"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{loading ? 'Submitting Registration...' : 'Confirm Registration and Enroll'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
