'use client';

import React, { useState } from 'react';
import { ShieldCheck, Lock, X, Eye, EyeOff, Loader2, Building, KeyRound, AlertCircle } from 'lucide-react';
import { useStaffAuth } from '@/components/StaffAuthProvider';

export function StaffLoginModal() {
  const { isLoginModalOpen, closeLoginModal, login } = useStaffAuth();
  const [officerId, setOfficerId] = useState('officer-1');
  const [secret, setSecret] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoginModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret.trim()) {
      setError('Please enter your authorization passkey.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await login(secret.trim(), officerId.trim() || 'officer-1');
      if (!res.success) {
        setError(res.error || 'Authentication rejected. Verify your staff secret passkey.');
      } else {
        setSecret('');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="staff-login-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="staff-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
      }}
      className="animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeLoginModal();
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '28rem',
          backgroundColor: '#ffffff',
          borderRadius: '1rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
        }}
      >
        {/* Header decoration strip */}
        <div className="h-2 bg-gradient-to-r from-teal-600 via-teal-500 to-amber-500" />

        {/* Close Button */}
        <button
          id="close-staff-modal-btn"
          type="button"
          onClick={closeLoginModal}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-7">
          {/* Badge & Title */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="inline-block text-[10px] font-extrabold uppercase tracking-widest text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 mb-0.5">
                CivicPilot staff workspace
              </span>
              <h2 id="staff-modal-title" className="text-lg font-bold text-slate-900">
                Staff sign in
              </h2>
            </div>
          </div>

          <p className="text-xs text-slate-600 mb-5 leading-relaxed">
            For authorized CivicPilot pilot reviewers. Residents can submit and privately track their own reports.
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 flex-none mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="staff-officer-id-input"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1"
              >
                Staff display name
              </label>
              <div className="relative">
                <Building className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  id="staff-officer-id-input"
                  type="text"
                  value={officerId}
                  onChange={(e) => setOfficerId(e.target.value)}
                  placeholder="e.g. officer-1, roads-crew"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="staff-passkey-input"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1"
              >
                Staff access key
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  id="staff-passkey-input"
                  type={showPassword ? 'text' : 'password'}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Enter your staff access key"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide passkey' : 'Show passkey'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={closeLoginModal}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                id="staff-login-submit-btn"
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Authenticate & Enter Portal</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
