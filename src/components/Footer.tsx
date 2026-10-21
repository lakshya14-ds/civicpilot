'use client';

import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';

export function Footer() {
  const { t } = useLanguage();
  return <footer className="civic-footer"><div className="civic-container civic-footer-inner"><div><div className="civic-footer-brand"><Landmark size={20}/> CivicPilot</div><p>{t('footer')}</p></div><nav aria-label="Footer navigation"><Link href="/submit">{t('reportIssue')}</Link><Link href="/complaints">{t('trackComplaints')}</Link><Link href="/analytics">{t('serviceInsights')}</Link></nav><small>© 2026 CivicPilot</small></div></footer>;
}
