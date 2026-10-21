'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, LockKeyhole, Search } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';
import { StatusBadge } from '@/components/Badge';
import { citizenTrackingCopy } from '@/lib/i18n/messages';
import { forgetCitizenReport, getSavedCitizenReports, saveCitizenReport, type SavedCitizenReport } from '@/lib/citizen-reports';
import type { Complaint } from '@/types';

export function CitizenTracking() {
  const { language } = useLanguage();
  const copy = citizenTrackingCopy[language];
  const [saved, setSaved] = useState<SavedCitizenReport[]>([]);
  const [details, setDetails] = useState<Record<string, Complaint>>({});
  const [ticketNumber, setTicketNumber] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const reports = getSavedCitizenReports();
    setSaved(reports);
    const results = await Promise.all(reports.map(async (report) => {
      try {
        const res = await fetch(`/api/complaints/${encodeURIComponent(report.id)}`, {
          headers: { 'x-tracking-token': report.trackingToken }, cache: 'no-store',
        });
        if (!res.ok) return null;
        const body = await res.json();
        return body.complaint as Complaint;
      } catch { return null; }
    }));
    setDetails(Object.fromEntries(results.filter((item): item is Complaint => Boolean(item)).map((item) => [item.id, item])));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('civicpilot:my-reports-changed', refresh);
    return () => window.removeEventListener('civicpilot:my-reports-changed', refresh);
  }, [refresh]);

  const addReport = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const code = trackingCode.trim();
    if (!/^[a-f0-9]{64}$/i.test(code)) { setError(copy.invalid); return; }
    setAdding(true);
    try {
      const res = await fetch(`/api/complaints/${encodeURIComponent(ticketNumber.trim().toUpperCase())}`, {
        headers: { 'x-tracking-token': code }, cache: 'no-store',
      });
      if (!res.ok) throw new Error(copy.invalid);
      const body = await res.json();
      const report = body.complaint as Complaint;
      saveCitizenReport({ id: report.id, ticketNumber: report.ticket_number, trackingToken: code });
      setTicketNumber('');
      setTrackingCode('');
    } catch { setError(copy.invalid); }
    finally { setAdding(false); }
  };

  return <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
    <div>
      <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800"><LockKeyhole size={13} /> {copy.myReports}</span>
      <h1 className="mt-3 text-3xl font-extrabold text-slate-900">{copy.title}</h1>
      <p className="mt-2 text-sm text-slate-600">{copy.intro}</p>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-900">{copy.myReports}</h2>
      {loading ? <p className="mt-4 text-sm text-slate-500">{copy.loading}</p> : saved.length === 0 ?
        <div className="mt-4 rounded-xl bg-slate-50 p-6 text-sm text-slate-600"><p>{copy.empty}</p><Link href="/submit" className="mt-3 inline-flex items-center gap-1 font-bold text-teal-700">{copy.reportIssue} <ArrowRight size={15}/></Link></div> :
        <div className="mt-4 space-y-3">{saved.map((report) => {
          const detail = details[report.id];
          return <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
            <div><p className="font-mono text-sm font-bold text-slate-900">{report.ticketNumber}</p>
              {detail && <><p className="mt-1 max-w-lg truncate text-xs text-slate-600">{detail.ai_summary || detail.description}</p><div className="mt-2"><StatusBadge status={detail.status}/></div></>}
            </div>
            <div className="flex items-center gap-3"><Link href={`/complaints/${report.id}`} className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white">{copy.open}</Link><button type="button" onClick={() => forgetCitizenReport(report.id)} className="text-xs font-semibold text-slate-500 underline">{copy.forget}</button></div>
          </div>;
        })}</div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-bold text-slate-900"><Search size={17}/>{copy.add}</h2>
      <p className="mt-1 text-xs text-slate-600">{copy.privateNote}</p>
      <form onSubmit={addReport} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
        <label className="text-xs font-semibold text-slate-700">{copy.ticket}<input required value={ticketNumber} onChange={(event) => setTicketNumber(event.target.value)} placeholder="CP-2026-01001" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label>
        <label className="text-xs font-semibold text-slate-700">{copy.code}<input required value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label>
        <button type="submit" disabled={adding} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{copy.add}</button>
      </form>
      {error && <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{error}</p>}
    </section>
  </div>;
}
