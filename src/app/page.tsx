'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CheckCircle2, Clock3, FileText, MapPin, Plus, ScanEye } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { StatusBadge } from '@/components/Badge';
import { Complaint } from '@/types';
import { CATEGORY_LABELS } from '@/lib/constants';

interface AnalyticsData {
  summary: { total: number; open: number; inProgress: number; pendingReview: number; resolved: number; resolutionRate: number };
  categoryCounts: Record<string, number>;
  trends: { day: string; submitted: number; resolved: number }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [a, c] = await Promise.all([fetch('/api/analytics'), fetch('/api/complaints?limit=5')]);
      if (!a.ok || !c.ok) throw new Error('We could not load the latest city updates.');
      const [analytics, tickets] = await Promise.all([a.json(), c.json()]);
      setData(analytics);
      setComplaints(tickets.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load city updates.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener('civicpilot:refresh', refresh);
    return () => window.removeEventListener('civicpilot:refresh', refresh);
  }, [refresh]);

  const summary = data?.summary;
  const metrics = [
    { label: 'Total reports', value: summary?.total ?? '—', detail: 'Shared by residents', icon: FileText },
    { label: 'Being worked on', value: summary?.inProgress ?? '—', detail: 'Pilot work in progress', icon: Clock3 },
    { label: 'Resolved', value: summary?.resolved ?? '—', detail: `${summary?.resolutionRate ?? 0}% of all reports`, icon: CheckCircle2 },
    { label: 'Awaiting review', value: summary?.pendingReview ?? '—', detail: 'Need a closer look', icon: ScanEye },
  ];
  const categories = data ? Object.entries(data.categoryCounts).sort((a,b) => b[1] - a[1]).slice(0,4) : [];

  return <div className="civic-dashboard">
    <section className="civic-hero civic-container">
      <div className="civic-hero-copy">
        <h1>A better way to care for Bengaluru.</h1>
        <p>Report a local issue, follow its progress, and see how your neighbourhood is improving.</p>
        <div className="civic-hero-actions">
          <Link className="civic-button civic-button-primary" href="/submit"><Plus size={18}/> Report an issue <ArrowRight size={17}/></Link>
          <Link className="civic-button civic-button-outline" href="/complaints">Track complaints <ArrowUpRight size={17}/></Link>
        </div>
      </div>
      <div className="civic-hero-art" aria-hidden="true"><div className="civic-sun"/><div className="civic-building civic-building-small"><i/><i/><i/></div><div className="civic-building civic-building-main"><span className="civic-roof"/><i/><i/><i/><b/></div><div className="civic-building civic-building-side"><i/><i/><i/></div><div className="civic-tree civic-tree-one"/><div className="civic-tree civic-tree-two"/><div className="civic-ground"/></div>
    </section>
    <div className="civic-container civic-dashboard-content">
      {error && <div className="civic-error" role="alert">{error} <button onClick={refresh}>Try again</button></div>}
      <section className="civic-metrics" aria-label="City service overview">
        {metrics.map(({ label, value, detail, icon: Icon }) => <div className="civic-metric" key={label}><div className="civic-metric-icon"><Icon size={20} strokeWidth={1.8}/></div><div><strong>{loading && !data ? '—' : value}</strong><span>{label}</span><small>{detail}</small></div></div>)}
      </section>
      <div className="civic-dashboard-grid">
        <section className="civic-panel civic-recent">
          <div className="civic-panel-heading"><div><h2>Recent complaints</h2><p>Follow the issues our communities are reporting.</p></div><Link href="/complaints">View all <ArrowRight size={16}/></Link></div>
          {loading && !data ? <p className="civic-empty">Loading recent reports…</p> : complaints.length === 0 ? <div className="civic-empty"><p>No complaints have been reported yet.</p><Link href="/submit">Report the first issue <ArrowRight size={15}/></Link></div> :
            <div className="civic-table-wrap"><table className="civic-table"><thead><tr><th>Report</th><th>Location</th><th>Status</th><th>View</th></tr></thead><tbody>{complaints.map(item => <tr key={item.id}><td><Link className="civic-ticket-title" href={`/complaints/${item.id}`}>{item.ai_summary || item.description}</Link><span className="civic-ticket-meta">{item.ticket_number} · {CATEGORY_LABELS[item.category] || item.category}</span></td><td><span className="civic-location"><MapPin size={14}/>{item.location_text || 'Location not specified'}</span></td><td><StatusBadge status={item.status}/></td><td><Link className="civic-row-arrow" aria-label={`View ${item.ticket_number}`} href={`/complaints/${item.id}`}><ArrowUpRight size={18}/></Link></td></tr>)}</tbody></table></div>}
        </section>
        <section className="civic-panel civic-activity"><div className="civic-panel-heading"><div><h2>Service activity</h2><p>Reports received and resolved over seven days.</p></div></div>
          <div className="civic-chart">{data && data.trends.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.trends} margin={{top:8,right:0,left:-25,bottom:0}} barGap={3}><CartesianGrid vertical={false} stroke="#e8ecec"/><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{fill:'#68777b',fontSize:11}}/><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{fill:'#68777b',fontSize:11}}/><Tooltip contentStyle={{border:'1px solid #dce5e4',borderRadius:6,fontSize:12}}/><Bar dataKey="submitted" name="Received" fill="#173a4d" radius={[3,3,0,0]}/><Bar dataKey="resolved" name="Resolved" fill="#2c9c91" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer> : <p className="civic-empty">Activity will appear as reports come in.</p>}</div>
          <div className="civic-chart-legend"><span><i className="civic-dot received"/>Received</span><span><i className="civic-dot resolved"/>Resolved</span></div>
        </section>
      </div>
      <div className="civic-dashboard-bottom"><section className="civic-panel civic-categories"><div className="civic-panel-heading"><div><h2>What residents are reporting</h2><p>A clearer view of the issues affecting the city.</p></div></div><div className="civic-category-list">{categories.length ? categories.map(([key,count]) => <div key={key}><span>{CATEGORY_LABELS[key] || key}</span><div className="civic-category-track"><i style={{width:`${summary?.total ? Math.max(4,count/summary.total*100) : 0}%`}}/></div><strong>{count}</strong></div>) : <p className="civic-empty">Category data will appear here.</p>}</div></section><aside className="civic-community"><div className="civic-community-mark">↗</div><h2>Every report helps make a difference.</h2><p>Tell us what needs attention in your neighbourhood. Your report helps the pilot team review local issues.</p><Link href="/submit">Report an issue <ArrowRight size={17}/></Link></aside></div>
    </div>
  </div>;
}
