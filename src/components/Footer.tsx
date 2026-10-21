'use client';

import Link from 'next/link';
import { Landmark, Lock } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';
import { citizenTrackingCopy, staffAllReports } from '@/lib/i18n/messages';
import { useStaffAuth } from '@/components/StaffAuthProvider';

export function Footer() {
  const { t, language } = useLanguage();
  const { isStaff, openLoginModal } = useStaffAuth();

  return (
    <footer className="civic-footer">
      <div className="civic-container civic-footer-inner">
        <div>
          <div className="civic-footer-brand">
            <Landmark size={20} /> CivicPilot
          </div>
          <p>{t('footer')}</p>
        </div>
        <nav aria-label="Footer navigation">
          {!isStaff && <Link href="/submit">{t('reportIssue')}</Link>}
          <Link href="/complaints">{isStaff ? staffAllReports[language] : citizenTrackingCopy[language].title}</Link>
          {isStaff ? (
            <>
              <Link href="/review">{t('reviewQueue')}</Link>
              <Link href="/analytics">{t('serviceInsights')}</Link>
            </>
          ) : (
            <button
              type="button"
              onClick={openLoginModal}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
            >
              <Lock className="w-3 h-3 text-amber-400" />
              Pilot staff sign in
            </button>
          )}
        </nav>
        <small>© 2026 CivicPilot</small>
      </div>
    </footer>
  );
}
