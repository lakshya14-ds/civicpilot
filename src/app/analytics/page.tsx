'use client';

import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  History,
  Sparkles,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { ComplaintEvent } from '@/types';

interface AnalyticsData {
  summary: {
    total: number;
    open: number;
    inProgress: number;
    pendingReview: number;
    resolved: number;
    critical: number;
    overdue: number;
    avgFirstResponseMinutes: number | null;
    resolutionRate: number;
    duplicateCount: number;
    escalationCount: number;
  };
  priorityDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  categoryCounts: Record<string, number>;
  departmentWorkload: Record<string, { total: number; open: number; in_progress: number; resolved: number }>;
  confidenceBands: {
    high: number;
    moderate: number;
    low_needs_review: number;
  };
  trends: { day: string; submitted: number; resolved: number }[];
}

export default function AnalyticsAuditPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [auditEvents, setAuditEvents] = useState<ComplaintEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditSearch, setAuditSearch] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [loadError, setLoadError] = useState('');

  const fetchAnalyticsAndAudit = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const [analyticsRes, auditRes] = await Promise.all([
        fetch('/api/analytics'),
        fetch('/api/audit?limit=100'),
      ]);

      if (!analyticsRes.ok || !auditRes.ok) {
        throw new Error('City service insights could not be loaded. Please try again.');
      }

      const analyticsData = await analyticsRes.json();
      const auditData = await auditRes.json();

      setData(analyticsData);
      setAuditEvents(auditData.events || []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'City service insights could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsAndAudit();
  }, []);

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 flex flex-col items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mb-2" />
        <span className="text-xs text-slate-500">Compiling civic analytics and audit trail...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="max-w-7xl mx-auto px-4 py-16 text-rose-800">
        <p>{loadError}</p>
        <button type="button" onClick={fetchAnalyticsAndAudit} className="mt-3 font-semibold underline">Try again</button>
      </div>
    );
  }

  if (!data) return null;

  const { summary } = data;

  const filteredEvents = auditEvents.filter((evt) => {
    if (eventTypeFilter && evt.event_type !== eventTypeFilter) return false;
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase().trim();
      return (
        evt.actor.toLowerCase().includes(q) ||
        evt.description.toLowerCase().includes(q) ||
        evt.event_type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const confidenceChartData = [
    { name: 'High Confidence (≥85%)', value: data.confidenceBands.high, color: '#10b981' },
    { name: 'Moderate (70-84%)', value: data.confidenceBands.moderate, color: '#f59e0b' },
    { name: 'Review Queue (<70%)', value: data.confidenceBands.low_needs_review, color: '#8b5cf6' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn space-y-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            City service insights
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Explore how reports move through city services and see a record of recent activity.
          </p>
        </div>

        <button
          onClick={fetchAnalyticsAndAudit}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Stats
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Resolution Rate
          </span>
          <div className="text-2xl font-black text-emerald-700">{summary.resolutionRate}%</div>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {summary.resolved} closed out of {summary.total} total
          </span>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Avg First Response
          </span>
          <div className="text-2xl font-black text-slate-900">{summary.avgFirstResponseMinutes == null ? '—' : `${summary.avgFirstResponseMinutes}m`}</div>
          <span className="text-[10px] text-slate-500 block mt-0.5">Time to department assignment</span>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Duplicate Suppression
          </span>
          <div className="text-2xl font-black text-purple-700">{summary.duplicateCount}</div>
          <span className="text-[10px] text-slate-500 block mt-0.5">Reports merged via similarity check</span>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            SLA Escalations
          </span>
          <div className="text-2xl font-black text-rose-700">{summary.escalationCount}</div>
          <span className="text-[10px] text-slate-500 block mt-0.5">Breached tickets escalated</span>
        </div>
      </div>

      {/* Visual Charts: AI Confidence Distribution & Resolution Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Confidence Distribution */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-teal-600" />
              <h2 className="text-base font-bold text-slate-900">
                AI Classification Confidence
              </h2>
            </div>
            <span className="text-xs text-slate-400">Score segmentation</span>
          </div>

          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={confidenceChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {confidenceChartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val, name) => [`${val} complaints`, name]}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center text-xs">
            {confidenceChartData.map((c) => (
              <div key={c.name}>
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full mr-1.5"
                  style={{ backgroundColor: c.color }}
                />
                <span className="text-slate-600">{c.name.split(' ')[0]}:</span>{' '}
                <span className="font-bold text-slate-900">{c.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 7-Day Resolution & Intake Curve */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">Throughput Curve</h2>
            </div>
            <span className="text-xs text-slate-400">Intake vs Resolution</span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trends} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Line
                  type="monotone"
                  dataKey="submitted"
                  name="New Reports"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  name="Resolved"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Immutable Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-slate-700" />
              System Audit Trail & Automation Decisions
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chronological log of intake, AI classifications, human review overrides, and escalations
            </p>
          </div>

          {/* Search & filter */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search audit events..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-800 bg-white"
            >
              <option value="">All Event Types</option>
              <option value="intake">Intake</option>
              <option value="assignment">Assignment</option>
              <option value="review_action">Review Action</option>
              <option value="escalation">Escalation</option>
              <option value="duplicate_merged">Duplicate Merged</option>
              <option value="resolution">Resolution</option>
              <option value="feedback">Feedback</option>
            </select>
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No audit events found matching query.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3 font-semibold">Timestamp</th>
                  <th className="px-6 py-3 font-semibold">Event Type</th>
                  <th className="px-6 py-3 font-semibold">Actor</th>
                  <th className="px-6 py-3 font-semibold">Description</th>
                  <th className="px-6 py-3 font-semibold">Complaint Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                      {new Date(evt.created_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold uppercase bg-slate-100 text-slate-700">
                        {evt.event_type}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-semibold text-slate-800 whitespace-nowrap">
                      {evt.actor}
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {evt.description}
                    </td>
                    <td className="px-6 py-3 font-mono text-teal-600">
                      {evt.complaint_id.slice(0, 8)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
