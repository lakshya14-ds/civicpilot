'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Edit3,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { PriorityBadge } from '@/components/Badge';
import { Complaint, Department, PriorityLabel } from '@/types';
import { CATEGORY_LABELS } from '@/lib/constants';

export default function HumanReviewPage() {
  const [pendingTickets, setPendingTickets] = useState<Complaint[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Complaint | null>(null);

  // Review Form state
  const [categoryOverride, setCategoryOverride] = useState('');
  const [deptOverride, setDeptOverride] = useState('');
  const [priorityOverride, setPriorityOverride] = useState<PriorityLabel>('medium');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [reviewerId, setReviewerId] = useState('officer-1');
  const [reviewerSecret, setReviewerSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const selectTicketForReview = (ticket: Complaint) => {
    setSelectedTicket(ticket);
    setCategoryOverride(ticket.category);
    setDeptOverride(ticket.department_id || '');
    setPriorityOverride(ticket.priority_label);
    setReviewerNotes('');
    setStatusMessage(null);
  };

  const fetchReviewQueue = useCallback(async () => {
    try {
      setLoading(true);
      const [ticketsRes, deptsRes] = await Promise.all([
        fetch('/api/complaints?requires_human_review=true&limit=50'),
        fetch('/api/departments'),
      ]);

      const ticketsData = await ticketsRes.json();
      const deptsData = await deptsRes.json();

      const items = (ticketsData.data || []).filter(
        (t: Complaint) => t.status === 'pending_review' || t.requires_human_review
      );

      setPendingTickets(items);
      setDepartments(deptsData || []);

      setSelectedTicket((prev) => {
        if (items.length === 0) {
          return null;
        }
        if (!prev || !items.some((i: Complaint) => i.id === prev.id)) {
          const first = items[0];
          setCategoryOverride(first.category);
          setDeptOverride(first.department_id || '');
          setPriorityOverride(first.priority_label);
          setReviewerNotes('');
          setStatusMessage(null);
          return first;
        }
        return prev;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviewQueue();
  }, [fetchReviewQueue]);

  const handleReviewAction = async (action: 'approved' | 'rejected' | 'modified') => {
    if (!selectedTicket) return;

    try {
      setSubmitting(true);
      setStatusMessage(null);

      const res = await fetch('/api/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-reviewer-secret': reviewerSecret,
        },
        body: JSON.stringify({
          complaint_id: selectedTicket.id,
          action,
          reviewer_id: reviewerId,
          reviewer_secret: reviewerSecret,
          reviewer_notes: reviewerNotes.trim(),
          updated_values: {
            category: categoryOverride,
            department_id: deptOverride,
            priority_label: priorityOverride,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Review submission failed');
      }

      setStatusMessage({
        type: 'success',
        text: `Action successfully recorded: ${action.toUpperCase()} for ${selectedTicket.ticket_number}`,
      });

      window.dispatchEvent(new CustomEvent('civicpilot:refresh'));
      await fetchReviewQueue();
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Review action failed',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 mb-2">
            <UserCheck className="w-3.5 h-3.5" />
            For city teams
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Review queue
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Check reports that need a person to confirm the details before assigning them to a team.
          </p>
        </div>

        <button
          onClick={fetchReviewQueue}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Queue
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-purple-600 mb-2" />
          <span className="text-xs font-medium">Scanning review candidates...</span>
        </div>
      ) : pendingTickets.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-sm">
          <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900">Queue Clear: All Tickets Processed</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            No complaints currently pending human review. Autonomous triage rules successfully routed incoming civic requests.
          </p>
          <Link
            href="/submit"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
          >
            Submit Ambiguous Complaint
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: List of Pending Review Tickets */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
              Pending Evaluation ({pendingTickets.length})
            </div>

            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {pendingTickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTicketForReview(t)}
                  className={`w-full text-left p-4 rounded-xl border transition-all text-xs ${
                    selectedTicket?.id === t.id
                      ? 'bg-purple-50/70 border-purple-300 shadow-sm ring-1 ring-purple-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono font-bold text-purple-950 mb-1">
                    <span>{t.ticket_number}</span>
                    <span className="text-[10px] font-sans px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                      Conf: {(t.confidence_score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="font-semibold text-slate-800 line-clamp-1">{t.ai_summary || t.description}</p>
                  <div className="flex items-center justify-between text-slate-500 mt-2 text-[11px]">
                    <span className="capitalize">{CATEGORY_LABELS[t.category] || t.category}</span>
                    <PriorityBadge priority={t.priority_label} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Review & Override Workstation */}
          {selectedTicket && (
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
              {statusMessage && (
                <div
                  className={`p-4 rounded-xl text-xs flex items-center gap-2 ${
                    statusMessage.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  {statusMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  )}
                  <span>{statusMessage.text}</span>
                </div>
              )}

              {/* Ticket Top bar */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                <div>
                  <span className="text-xs font-mono font-bold text-purple-700">
                    {selectedTicket.ticket_number}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                    Human Review Workstation
                  </h2>
                </div>
                <Link
                  href={`/complaints/${selectedTicket.id}`}
                  className="text-xs text-teal-600 font-bold hover:underline flex items-center gap-1"
                >
                  Inspect Full Record
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Complaint Description & AI Extracted Reasoning */}
              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Citizen Complaint Statement
                  </span>
                  <p className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 leading-relaxed">
                    {selectedTicket.description}
                  </p>
                </div>

                <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-200 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-purple-900">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      AI Recommendation
                    </span>
                    <span className="font-mono text-purple-700">
                      Confidence: {(selectedTicket.confidence_score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-purple-950 font-medium">
                    Proposed Summary: {selectedTicket.ai_summary}
                  </p>
                  <p className="text-slate-500 text-[11px] pt-1 border-t border-purple-200/50">
                    Review Reason: Low classification confidence or ambiguous civic issue description.
                  </p>
                </div>
              </div>

              {/* Officer Overrides Form */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 text-xs">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-slate-600" />
                  Officer Adjustments & Overrides
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Category
                    </label>
                    <select
                      value={categoryOverride}
                      onChange={(e) => setCategoryOverride(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-800"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Assigned Department
                    </label>
                    <select
                      value={deptOverride}
                      onChange={(e) => setDeptOverride(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-800"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Priority Level
                    </label>
                    <select
                      value={priorityOverride}
                      onChange={(e) => setPriorityOverride(e.target.value as PriorityLabel)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 font-semibold"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Officer Review Notes / Rationale
                  </label>
                  <textarea
                    rows={2}
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    placeholder="Provide justification for routing approval or classification override..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800 bg-white"
                  />
                </div>

                {/* Reviewer Passkey / ID auth fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Officer ID
                    </label>
                    <input
                      type="text"
                      value={reviewerId}
                      onChange={(e) => setReviewerId(e.target.value)}
                      placeholder="officer-1"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Authorization Secret Passkey
                    </label>
                    <input
                      type="password"
                      value={reviewerSecret}
                      onChange={(e) => {
                        setReviewerSecret(e.target.value);
                        sessionStorage.setItem('civicpilot:staff-secret', e.target.value);
                      }}
                      placeholder="Enter your staff access key"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleReviewAction('rejected')}
                  className="px-4 py-2.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4 text-rose-600" />
                  Reject Complaint
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleReviewAction('modified')}
                  className="px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Edit3 className="w-4 h-4 text-amber-600" />
                  Apply Overrides & Release
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleReviewAction('approved')}
                  className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  Approve Proposed Triage
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
