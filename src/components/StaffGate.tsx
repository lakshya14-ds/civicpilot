'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, Lock, ArrowLeft, ArrowRight, Building2 } from 'lucide-react';
import { useStaffAuth } from '@/components/StaffAuthProvider';

interface StaffGateProps {
  title?: string;
  description?: string;
}

export function StaffGate({
  title = 'Pilot staff access required',
  description = 'This workspace is for authorized CivicPilot reviewers. Residents can submit a report and privately track their own request.',
}: StaffGateProps) {
  const { openLoginModal } = useStaffAuth();

  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center animate-fadeIn">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 mb-6 shadow-sm">
        <ShieldAlert className="w-8 h-8" />
      </div>

      <span className="inline-block text-[11px] font-extrabold uppercase tracking-widest text-amber-800 bg-amber-100/80 px-3 py-1 rounded-full border border-amber-300 mb-3">
        CivicPilot staff workspace
      </span>

      <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
        {title}
      </h1>

      <p className="text-sm text-slate-600 leading-relaxed max-w-xl mx-auto mb-8">
        {description}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/complaints"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Track your report
        </Link>

        <button
          id="gate-staff-login-btn"
          type="button"
          onClick={openLoginModal}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors shadow-md"
        >
          <Lock className="w-4 h-4 text-amber-400" />
          Sign in as staff
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-12 p-4 max-w-md mx-auto bg-slate-50 rounded-xl border border-slate-200 text-left text-xs text-slate-600">
        <div className="font-bold text-slate-800 flex items-center gap-1.5 mb-1">
          <Building2 className="w-4 h-4 text-teal-600" />
          Staff access
        </div>
        <p className="text-[11px] text-slate-500 leading-normal">
          Pilot reviewers use the staff key provided by the project owner to access the review queue, service metrics, and operational controls.
        </p>
      </div>
    </div>
  );
}
