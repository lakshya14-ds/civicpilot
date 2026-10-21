'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Landmark, Menu, X, Shield, LogOut } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';
import { useStaffAuth } from '@/components/StaffAuthProvider';
import { StaffLoginModal } from '@/components/StaffLoginModal';
import { citizenTrackingCopy, staffAllReports, staffSignOut, type MessageKey, type UiLanguage } from '@/lib/i18n/messages';

const citizenLinks: { href: string; label: MessageKey }[] = [
  { href: '/', label: 'dashboard' },
  { href: '/submit', label: 'reportIssue' },
  { href: '/complaints', label: 'trackComplaints' },
];

const staffLinks: { href: string; label: MessageKey; showBadge?: boolean }[] = [
  { href: '/', label: 'dashboard' },
  { href: '/complaints', label: 'trackComplaints' },
  { href: '/review', label: 'reviewQueue', showBadge: true },
  { href: '/analytics', label: 'analytics' },
];

export function Navbar() {
  const { language, setLanguage, t } = useLanguage();
  const { isStaff, staffUser, staffSecret, logout, openLoginModal, pendingReviewCount } = useStaffAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const links: { href: string; label: MessageKey; showBadge?: boolean }[] = isStaff ? staffLinks : citizenLinks;
  const roleCopy = citizenTrackingCopy[language];

  const runSlaCheck = async () => {
    try {
      setBusy(true);
      const secretToUse = staffSecret || sessionStorage.getItem('civicpilot:staff-secret') || '';
      const res = await fetch('/api/escalate', {
        method: 'POST',
        headers: {
          'x-reviewer-secret': secretToUse,
          'x-admin-key': secretToUse,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SLA check failed');
      setMessage(`Checked ${data.checked_count} reports; ${data.escalated_count} escalated.`);
      window.dispatchEvent(new CustomEvent('civicpilot:refresh'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'SLA check failed');
    } finally {
      setBusy(false);
    }
  };

  const resetDemo = async () => {
    if (!window.confirm('Reset the demo to its sample reports?')) return;
    try {
      setBusy(true);
      const res = await fetch('/api/seed', {
        method: 'POST',
        headers: { 'x-admin-key': staffSecret },
      });
      if (!res.ok) throw new Error('Could not reset sample reports');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Reset failed');
      setBusy(false);
    }
  };

  return (
    <>
      <header className="civic-header">
        <div className="civic-header-inner civic-container">
          <Link href="/" className="civic-brand" onClick={() => setOpen(false)}>
            <span className="civic-brand-mark">
              <Landmark size={24} strokeWidth={1.8} />
            </span>
            <span className="flex items-center gap-2">
              CivicPilot
              {isStaff && (
                <span className="text-[10px] font-sans font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Staff
                </span>
              )}
            </span>
          </Link>

          <nav className={`civic-nav ${open ? 'is-open' : ''}`} aria-label="Main navigation">
            {links.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href === '/complaints' && pathname.startsWith('/complaints/'));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`inline-flex items-center gap-1.5 ${isActive ? 'active' : ''}`}
                >
                  <span>{link.href === '/complaints' ? (isStaff ? staffAllReports[language] : roleCopy.title) : t(link.label)}</span>
                  {link.showBadge && pendingReviewCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold leading-none">
                      {pendingReviewCount}
                    </span>
                  )}
                </Link>
              );
            })}
            {isStaff && <div className="civic-mobile-staff-actions">
              <button type="button" disabled={busy} onClick={runSlaCheck}>{t('runSla')}</button>
              {staffUser?.role === 'admin' && <button type="button" disabled={busy} onClick={resetDemo}>{t('resetDemo')}</button>}
              <button type="button" onClick={() => { logout(); setOpen(false); }}><LogOut size={15} /> {staffSignOut[language]}</button>
              {message && <p role="status">{message}</p>}
            </div>}
          </nav>

          <label className="civic-language">
            <span className="sr-only">{t('language')}</span>
            <select
              aria-label={t('language')}
              value={language}
              onChange={(event) => setLanguage(event.target.value as UiLanguage)}
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
              <option value="kn">ಕನ್ನಡ</option>
            </select>
          </label>

          {/* Conditional: Staff Profile & Tools vs Citizen Staff Login Button */}
          {isStaff ? (
            <div className="civic-header-auth">
              <details className="civic-staff-tools">
                <summary className="civic-staff-tools-trigger font-semibold text-emerald-300 hover:text-white">
                  <span>{t('staffTools')}</span>
                </summary>
                <div>
                  <button type="button" disabled={busy} onClick={runSlaCheck}>
                    {t('runSla')}
                  </button>
                  {staffUser?.role === 'admin' && <button type="button" disabled={busy} onClick={resetDemo}>
                    {t('resetDemo')}
                  </button>}
                  {message && <p role="status">{message}</p>}
                </div>
              </details>

              <div className="civic-staff-profile hidden sm:inline-flex items-center gap-2 rounded-lg bg-slate-800/90 border border-slate-700/80 text-xs">
                <span className="text-emerald-300 font-mono font-semibold text-[11px] truncate max-w-[100px]">
                  {staffUser?.officerId || 'officer'}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors"
                  title="Sign out of staff portal"
                  aria-label="Sign out of staff portal"
                >
                  <LogOut size={13} />
                </button>
              </div>
            </div>
          ) : (
            <button
              id="topbar-staff-login-btn"
              type="button"
              onClick={openLoginModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-400/40 bg-teal-950/30 hover:bg-teal-900/60 text-teal-200 text-xs font-bold transition-all shadow-sm"
              title="CivicPilot pilot staff sign in"
            >
              <Shield size={13} className="text-teal-400" />
              <span>Staff sign in</span>
            </button>
          )}

          {!isStaff && <Link href="/submit" className="civic-header-action">
            {t('makeReport')} <ArrowRight size={16} />
          </Link>}

          <button
            className="civic-menu-toggle"
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        <div className="civic-demo-strip">{t('demoNotice')}</div>
      </header>

      {/* Global Staff Login Modal */}
      <StaffLoginModal />
    </>
  );
}
