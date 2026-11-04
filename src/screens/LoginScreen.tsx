import React, { useState } from 'react';
import {
  LogIn,
  Key,
  User,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Mic,
  BookOpen,
  Clock,
  Sparkles,
  BarChart3,
  Accessibility
} from 'lucide-react';
import { useAccessibility } from '../context/AccessibilityContext.tsx';
import { AudioToolbar } from '../components/AudioToolbar.tsx';

export function LoginScreen() {
  const { navigateTo, loginUser, announce } = useAccessibility();

  const [identifier, setIdentifier] = useState('SSC-2026-MTS-01');
  const [password, setPassword] = useState('candidate123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loginInstructions =
    'Candidate Authentication & Portal Landing Screen. Enter your Roll Number or Registered Email ID and Password or PIN to sign in. New candidates may enroll via the Registration link below.';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed. Please verify credentials.');
      }

      // Persist session via AccessibilityContext
      loginUser(data.user, data.settings);

      announce(`Login successful. Welcome ${data.user.name}.`, 'polite');
      // Direct authenticated user straight to the Candidate Dashboard
      navigateTo('dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check network connection.');
      announce(`Login error: ${err.message}`, 'assertive');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role: 'candidate' | 'admin') => {
    setError(null);
    if (role === 'candidate') {
      setIdentifier('SSC-2026-MTS-01');
      setPassword('candidate123');
      announce('Filled Candidate Demo credentials', 'polite');
    } else {
      setIdentifier('evaluator@ssc.gov.in');
      setPassword('admin123');
      announce('Filled Academic Reviewer / Admin credentials', 'polite');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10" id="main-content">
      {/* 1. Header with Audio Read-Aloud */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D9E1EF]">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#EEF4FF] text-[#1749E8] text-xs font-bold border border-[#D9E1EF] mb-2">
            <span>SSC MTS 2026 Examination Portal</span>
            <span>·</span>
            <span>Screen 2 of 16</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#172033] tracking-tight">
            Candidate Authentication &amp; Portal Access
          </h1>
          <p className="text-sm sm:text-base text-[#53627A] mt-1.5 max-w-2xl">
            Sign in to access your customized preparation syllabus, mock examination sessions, and adaptive revision schedules.
          </p>
        </div>

        <div className="shrink-0">
          <AudioToolbar textToRead={loginInstructions} label="Listen to login instructions" />
        </div>
      </div>

      {/* 2. Main Two-Column Landing Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Platform Capabilities Showcase */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-gradient-to-br from-[#EEF4FF] to-[#F3F0FF] p-6 sm:p-8 rounded-2xl border border-[#D9E1EF] space-y-6">
            <div>
              <span className="text-xs font-bold text-[#6241C8] uppercase tracking-wider">
                Purpose-Built Accessible Architecture
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-[#172033] mt-1">
                Empowering Aspirants with Assistive Preparation Tools
              </h2>
              <p className="text-xs sm:text-sm text-[#53627A] mt-2 leading-relaxed">
                ACCESSPREP-X provides a compliant, high-reliability examination environment designed for candidates with visual impairments, low vision, and assistive technology requirements.
              </p>
            </div>

            {/* Feature Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-white rounded-xl border border-[#D9E1EF] shadow-xs space-y-1.5">
                <div className="w-8 h-8 rounded-lg bg-[#EEF4FF] text-[#1749E8] flex items-center justify-center mb-2">
                  <Mic className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#172033]">Voice Practice</h3>
                <p className="text-xs text-[#53627A] leading-relaxed">
                  Speech recognition with confirmation modal, persistent feedback, and continuous TTS read-aloud.
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-[#D9E1EF] shadow-xs space-y-1.5">
                <div className="w-8 h-8 rounded-lg bg-[#F3F0FF] text-[#6241C8] flex items-center justify-center mb-2">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#172033]">Compensatory Time</h3>
                <p className="text-xs text-[#53627A] leading-relaxed">
                  Enforces 60 minutes per 45-minute session for PwD candidates strictly following DoPT norms.
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-[#D9E1EF] shadow-xs space-y-1.5">
                <div className="w-8 h-8 rounded-lg bg-[#EEF4FF] text-[#123BB8] flex items-center justify-center mb-2">
                  <BookOpen className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#172033]">Curated Questions</h3>
                <p className="text-xs text-[#53627A] leading-relaxed">
                  400 verified questions balanced across Math, Reasoning, General Awareness, and English.
                </p>
              </div>

              <div className="p-4 bg-white rounded-xl border border-[#D9E1EF] shadow-xs space-y-1.5">
                <div className="w-8 h-8 rounded-lg bg-[#F3F0FF] text-[#4C2FA8] flex items-center justify-center mb-2">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#172033]">BKT &amp; SM-2 Analytics</h3>
                <p className="text-xs text-[#53627A] leading-relaxed">
                  Bayesian Knowledge Tracing skill modeling and SuperMemo spaced repetition daily revision.
                </p>
              </div>
            </div>

            {/* Registration Callout Banner */}
            <div className="p-4 bg-white rounded-xl border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#172033]">Not registered yet?</p>
                <p className="text-xs text-[#53627A]">
                  Enroll as a new SSC MTS candidate with your PwD category &amp; scribe preferences.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigateTo('register')}
                className="shrink-0 px-4 py-2 text-xs font-bold text-[#1749E8] bg-[#EEF4FF] hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors inline-flex items-center gap-1.5 focus:ring-2 focus:ring-[#6241C8]"
              >
                <span>Register Application</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Authentication Card */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 sm:p-8 bg-white border-2 border-[#D9E1EF] rounded-2xl shadow-sm space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-xl font-bold text-[#172033] flex items-center gap-2">
                <LogIn className="w-5 h-5 text-[#1749E8]" />
                Sign In to Candidate Account
              </h2>
              <p className="text-xs text-[#53627A] mt-1">
                Enter your Roll Number or Registered Email ID to proceed.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="p-4 bg-red-50 border-l-4 border-red-600 rounded-r-lg text-red-900 text-xs sm:text-sm flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Authentication Failure</p>
                  <p>{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="identifier" className="block text-xs font-bold text-[#172033] mb-1.5">
                  Roll Number or Email ID <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <input
                    id="identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. SSC-2026-MTS-01"
                    className="w-full px-3.5 py-2.5 pl-10 text-sm bg-white border-2 border-[#D9E1EF] rounded-lg text-[#172033] font-medium focus:border-[#1749E8] focus:ring-2 focus:ring-[#6241C8] focus:outline-none transition-all"
                  />
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-xs font-bold text-[#172033]">
                    Password or PIN <span className="text-red-600">*</span>
                  </label>
                  <span className="text-[11px] text-[#53627A]">Numeric PIN or alphanumeric</span>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password or PIN"
                    className="w-full px-3.5 py-2.5 pl-10 text-sm bg-white border-2 border-[#D9E1EF] rounded-lg text-[#172033] font-medium focus:border-[#1749E8] focus:ring-2 focus:ring-[#6241C8] focus:outline-none transition-all"
                  />
                  <Key className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-5 text-sm font-bold text-white bg-gradient-to-r from-[#1749E8] to-[#6241C8] hover:from-[#123BB8] hover:to-[#4C2FA8] rounded-lg shadow-md inline-flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50 focus:ring-2 focus:ring-[#6241C8]"
              >
                <LogIn className="w-4 h-4" />
                <span>{loading ? 'Authenticating Candidate...' : 'Sign In to Portal'}</span>
              </button>
            </form>

            {/* Quick Demo Credentials */}
            <div className="pt-4 border-t border-slate-200">
              <p className="text-[11px] font-bold text-[#53627A] uppercase tracking-wider mb-2.5">
                One-Click Quick Test Accounts
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => fillDemo('candidate')}
                  className="p-2.5 text-left border border-blue-200 bg-[#EEF4FF] hover:bg-blue-100 rounded-lg transition-colors flex items-center justify-between focus:ring-2 focus:ring-[#6241C8]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-blue-950 truncate">Candidate Demo</p>
                    <p className="text-[10px] text-blue-800 font-mono">SSC-2026-MTS-01</p>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-[#1749E8] shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => fillDemo('admin')}
                  className="p-2.5 text-left border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors flex items-center justify-between focus:ring-2 focus:ring-emerald-600"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-emerald-950 truncate">Reviewer / Admin</p>
                    <p className="text-[10px] text-emerald-800 font-mono">Dr. Meera Iyer</p>
                  </div>
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                </button>
              </div>
            </div>

            {/* Bottom Register Prompt */}
            <div className="text-center pt-2">
              <p className="text-xs text-[#53627A]">
                Need to create a new registration?{' '}
                <button
                  type="button"
                  onClick={() => navigateTo('register')}
                  className="font-bold text-[#1749E8] hover:text-[#123BB8] hover:underline inline-flex items-center gap-1 focus:ring-2 focus:ring-[#6241C8] rounded"
                >
                  <span>Register Application</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
