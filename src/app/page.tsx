'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CheckCircle2, Clock3, FileText, MapPin, Plus, ScanEye } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { StatusBadge } from '@/components/Badge';
import { Complaint } from '@/types';
import { categoryNames } from '@/lib/i18n/messages';
import { useLanguage } from '@/components/LanguageProvider';

interface AnalyticsData {
  summary: { total: number; open: number; inProgress: number; pendingReview: number; resolved: number; resolutionRate: number };
  categoryCounts: Record<string, number>;
  trends: { day: string; submitted: number; resolved: number }[];
}

export default function DashboardPage() {
  const { t, language } = useLanguage();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [a, c] = await Promise.all([fetch('/api/analytics'), fetch('/api/complaints?limit=5')]);
      if (!a.ok || !c.ok) throw new Error(t('loadError'));
      const [analytics, tickets] = await Promise.all([a.json(), c.json()]);
      setData(analytics);
      setComplaints(tickets.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load city updates.');
    } finally { setLoading(false); }
  }, [t]);
  useEffect(() => {
    refresh();
    window.addEventListener('civicpilot:refresh', refresh);
    return () => window.removeEventListener('civicpilot:refresh', refresh);
  }, [refresh]);

  const summary = data?.summary;
  const metrics = [
    { label: t('totalReports'), value: summary?.total ?? '—', detail: t('sharedResidents'), icon: FileText },
    { label: t('beingWorked'), value: summary?.inProgress ?? '—', detail: t('pilotProgress'), icon: Clock3 },
    { label: t('resolved'), value: summary?.resolved ?? '—', detail: `${summary?.resolutionRate ?? 0}%`, icon: CheckCircle2 },
    { label: t('awaitingReview'), value: summary?.pendingReview ?? '—', detail: t('needCloserLook'), icon: ScanEye },
  ];
  const categories = data ? Object.entries(data.categoryCounts).sort((a,b) => b[1] - a[1]).slice(0,4) : [];

  return <div className="civic-dashboard">
    <section className="civic-hero civic-container">
      <div className="civic-hero-copy">
        <h1>{t('heroTitle')}</h1>
        <p>{t('heroText')}</p>
        <div className="civic-hero-actions">
          <Link className="civic-button civic-button-primary" href="/submit"><Plus size={18}/> {t('reportIssue')} <ArrowRight size={17}/></Link>
          <Link className="civic-button civic-button-outline" href="/complaints">{t('trackComplaints')} <ArrowUpRight size={17}/></Link>
        </div>
      </div>
      <div className="civic-hero-art" aria-hidden="true"><div className="civic-sun"/><div className="civic-building civic-building-small"><i/><i/><i/></div><div className="civic-building civic-building-main"><span className="civic-roof"/><i/><i/><i/><b/></div><div className="civic-building civic-building-side"><i/><i/><i/></div><div className="civic-tree civic-tree-one"/><div className="civic-tree civic-tree-two"/><div className="civic-ground"/></div>
    </section>
    <div className="civic-container civic-dashboard-content">
      {error && <div className="civic-error" role="alert">{error} <button onClick={refresh}>{t('tryAgain')}</button></div>}
      <section className="civic-metrics" aria-label="City service overview">
        {metrics.map(({ label, value, detail, icon: Icon }) => <div className="civic-metric" key={label}><div className="civic-metric-icon"><Icon size={20} strokeWidth={1.8}/></div><div><strong>{loading && !data ? '—' : value}</strong><span>{label}</span><small>{detail}</small></div></div>)}
      </section>
      <div className="civic-dashboard-grid">
        <section className="civic-panel civic-recent">
          <div className="civic-panel-heading"><div><h2>{t('recentComplaints')}</h2><p>{t('recentDescription')}</p></div><Link href="/complaints">{t('viewAll')} <ArrowRight size={16}/></Link></div>
          {loading && !data ? <p className="civic-empty">…</p> : complaints.length === 0 ? <div className="civic-empty"><p>{t('noReports')}</p><Link href="/submit">{t('firstReport')} <ArrowRight size={15}/></Link></div> :
            <div className="civic-table-wrap"><table className="civic-table"><thead><tr><th>{t('reportIssue')}</th><th>{t('location')}</th><th>{t('status')}</th><th>{t('view')}</th></tr></thead><tbody>{complaints.map(item => <tr key={item.id}><td><Link className="civic-ticket-title" href={`/complaints/${item.id}`}>{item.ai_summary || item.description}</Link><span className="civic-ticket-meta">{item.ticket_number} · {categoryNames[language][item.category] || item.category}</span></td><td><span className="civic-location"><MapPin size={14}/>{item.location_text || t('unspecifiedLocation')}</span></td><td><StatusBadge status={item.status}/></td><td><Link className="civic-row-arrow" aria-label={`${t('view')} ${item.ticket_number}`} href={`/complaints/${item.id}`}><ArrowUpRight size={18}/></Link></td></tr>)}</tbody></table></div>}
        </section>
        <section className="civic-panel civic-activity"><div className="civic-panel-heading"><div><h2>{t('serviceActivity')}</h2><p>{t('activityDescription')}</p></div></div>
          <div className="civic-chart">{data && data.trends.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.trends} margin={{top:8,right:0,left:-25,bottom:0}} barGap={3}><CartesianGrid vertical={false} stroke="#e8ecec"/><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{fill:'#68777b',fontSize:11}}/><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{fill:'#68777b',fontSize:11}}/><Tooltip contentStyle={{border:'1px solid #dce5e4',borderRadius:6,fontSize:12}}/><Bar dataKey="submitted" name="Received" fill="#173a4d" radius={[3,3,0,0]}/><Bar dataKey="resolved" name="Resolved" fill="#2c9c91" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer> : <p className="civic-empty">Activity will appear as reports come in.</p>}</div>
          <div className="civic-chart-legend"><span><i className="civic-dot received"/>{t('received')}</span><span><i className="civic-dot resolved"/>{t('resolved')}</span></div>
        </section>
      </div>
      <div className="civic-dashboard-bottom"><section className="civic-panel civic-categories"><div className="civic-panel-heading"><div><h2>{t('categories')}</h2><p>{t('categoriesDescription')}</p></div></div><div className="civic-category-list">{categories.length ? categories.map(([key,count]) => <div key={key}><span>{categoryNames[language][key] || key}</span><div className="civic-category-track"><i style={{width:`${summary?.total ? Math.max(4,count/summary.total*100) : 0}%`}}/></div><strong>{count}</strong></div>) : <p className="civic-empty">—</p>}</div></section><aside className="civic-community"><div className="civic-community-mark">↗</div><h2>{t('communityTitle')}</h2><p>{t('communityText')}</p><Link href="/submit">{t('reportIssue')} <ArrowRight size={17}/></Link></aside></div>
    </div>
  </div>;
}
