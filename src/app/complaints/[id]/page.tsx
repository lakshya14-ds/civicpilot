'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  Layers,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Shield,
  Sparkles,
  RefreshCw,
  Star,
  History,
} from 'lucide-react';
import { StatusBadge, PriorityBadge } from '@/components/Badge';
import { Complaint, ComplaintEvent, AiDecision, Department } from '@/types';
import { CATEGORY_LABELS } from '@/lib/constants';
import { useLanguage } from '@/components/LanguageProvider';
import { categoryNames, detailMessages, priorityNames, statusNames, trackingMessages, type UiLanguage } from '@/lib/i18n/messages';
import { useStaffAuth } from '@/components/StaffAuthProvider';
import { findCitizenReport } from '@/lib/citizen-reports';

function TicketDetailsContent() {
  const { isStaff, authReady, staffSecret: authStaffSecret, staffUser } = useStaffAuth();
  const { language, t } = useLanguage();
  const safeLang = (language && detailMessages[language] ? language : 'en') as UiLanguage;
  const copy = detailMessages[safeLang] || detailMessages.en;
  const params = useParams();
  const ticketId = params.id as string;

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [canonicalTicket, setCanonicalTicket] = useState<Complaint | null>(null);
  const [events, setEvents] = useState<ComplaintEvent[]>([]);
  const [aiDecisions, setAiDecisions] = useState<AiDecision[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status update modal / controls
  const [updating, setUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionPhoto, setResolutionPhoto] = useState<File | null>(null);
  const [photoDisplayUrl, setPhotoDisplayUrl] = useState<string | null>(null);
  const [resolutionDisplayUrl, setResolutionDisplayUrl] = useState<string | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState('');

  // Citizen feedback widget
  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [problemPersists, setProblemPersists] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackToken, setFeedbackToken] = useState<string | null>(null);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [staffSecret, setStaffSecret] = useState(authStaffSecret || '');

  useEffect(() => {
    if (authStaffSecret && !staffSecret) {
      setStaffSecret(authStaffSecret);
    }
  }, [authStaffSecret, staffSecret]);

  const fetchTicketDetails = useCallback(async () => {
    if (!authReady) return;
    try {
      setLoading(true);
      setError(null);
      const savedStaffSecret = isStaff ? authStaffSecret : '';
      const savedCitizenReport = !isStaff ? findCitizenReport(ticketId) : undefined;
      if (!isStaff && !savedCitizenReport) throw new Error('Use your ticket number and private tracking code to open this report.');
      setStaffSecret(savedStaffSecret);
      const res = await fetch(`/api/complaints/${ticketId}`, {
        headers: savedStaffSecret
          ? { 'x-reviewer-secret': savedStaffSecret, 'x-admin-key': savedStaffSecret }
          : { 'x-tracking-token': savedCitizenReport?.trackingToken || '' },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'Private tracking code required for this report.' : 'Report unavailable.');
      const data = await res.json();

      setComplaint(data.complaint);
      setCanonicalTicket(data.canonical_ticket || null);
      setEvents(data.events || []);
      setAiDecisions(data.ai_decisions || []);
      setPhotoDisplayUrl(data.media_urls?.report || null);
      setResolutionDisplayUrl(data.media_urls?.resolution || null);
      setNewStatus(data.complaint.status);
      setSelectedDeptId(data.complaint.department_id || '');
      setTrackingToken(savedCitizenReport?.trackingToken || null);
      setFeedbackToken(sessionStorage.getItem(`civicpilot:feedback:${data.complaint.id}`) || savedCitizenReport?.feedbackToken || savedCitizenReport?.trackingToken || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching ticket details');
    } finally {
      setLoading(false);
    }
  }, [ticketId, isStaff, authStaffSecret, authReady]);

  useEffect(() => {
    if (!authReady) return;
    if (isStaff) fetch('/api/departments')
      .then((r) => r.json())
      .then((d) => setDepartments(d || []))
      .catch(console.error);
    fetchTicketDetails();
  }, [fetchTicketDetails, isStaff, authReady]);

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaint) return;

    try {
      setUpdating(true);
      let resolutionReference: string | undefined;
      if (resolutionPhoto) {
        const upload = new FormData();
        upload.set('file', resolutionPhoto);
        const uploaded = await fetch('/api/media', { method: 'POST', body: upload });
        const data = await uploaded.json();
        if (!uploaded.ok || !data.reference) throw new Error(data.error || 'Resolution photo upload failed');
        resolutionReference = data.reference;
      }
      const res = await fetch(`/api/complaints/${complaint.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-reviewer-secret': staffSecret || sessionStorage.getItem('civicpilot:staff-secret') || '',
          'x-admin-key': staffSecret || sessionStorage.getItem('civicpilot:staff-secret') || '',
        },
        body: JSON.stringify({
          status: newStatus,
          resolution_notes: resolutionNotes.trim() || undefined,
          resolution_evidence_url: resolutionReference,
          department_id: selectedDeptId || undefined,
          actor: 'CivicPilot pilot staff',
        }),
      });

      if (!res.ok) throw new Error('Failed to update ticket status');
      setResolutionPhoto(null);
      await fetchTicketDetails();
      window.dispatchEvent(new CustomEvent('civicpilot:refresh'));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error updating status');
    } finally {
      setUpdating(false);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaint) return;

    try {
      setFeedbackSubmitting(true);
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-feedback-token': feedbackToken || '',
          'x-tracking-token': trackingToken || '',
        },
        body: JSON.stringify({
          complaint_id: complaint.id,
          rating,
          feedback: feedbackText.trim(),
          problem_persists: problemPersists,
          feedback_token: feedbackToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit feedback');

      setFeedbackMessage(
        data.reopened
          ? 'Ticket reopened: Low rating and persistent complaint flag automatically alerted department.'
          : 'Thank you! Citizen satisfaction feedback recorded and closure verified.'
      );
      await fetchTicketDetails();
      window.dispatchEvent(new CustomEvent('civicpilot:refresh'));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Feedback error');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  if (!authReady || loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 flex flex-col items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mb-2" />
        <p className="text-xs text-slate-500">{copy.loading}</p>
      </div>
    );
  }

  if (error || !complaint) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-900">{error ? 'Access to this report' : copy.notFound}</h2>
        <p className="text-sm text-slate-500 mt-1">{error || 'No record exists with this ID.'}</p>
        <Link
          href="/complaints"
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          {copy.back}
        </Link>
      </div>
    );
  }

  const isOverdue =
    (complaint.status !== 'resolved' && complaint.status !== 'closed' && complaint.status !== 'rejected') &&
    (new Date(complaint.sla_due_at).getTime() < Date.now() || complaint.sla_breached);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn space-y-6">
      {/* Top Breadcrumb & Ticket Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/complaints"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {copy.back}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {complaint.ticket_number}
            </h1>
            <StatusBadge status={complaint.status} />
            {isStaff && <PriorityBadge priority={complaint.priority_label} />}
          </div>
        </div>

        {/* SLA Deadline Pill */}
        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 text-xs">
          <Clock className={`w-5 h-5 ${isOverdue ? 'text-rose-600 animate-pulse' : 'text-slate-400'}`} />
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              {copy.target}
            </div>
            <div className={`font-semibold ${isOverdue ? 'text-rose-600 font-bold' : 'text-slate-800'}`}>
              {new Date(complaint.sla_due_at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {isOverdue && ' (BREACHED)'}
            </div>
          </div>
        </div>
      </div>

      {/* Linked Duplicate Banner if applicable */}
      {complaint.duplicate_of && canonicalTicket && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-between text-xs text-purple-900">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-purple-600 shrink-0" />
            <div>
              <span className="font-bold">Suppressed Duplicate:</span> This report has been linked to canonical incident{' '}
              <Link href={`/complaints/${canonicalTicket.id}`} className="font-mono font-black underline">
                {canonicalTicket.ticket_number}
              </Link>
              . Combined citizen count: {(canonicalTicket.duplicate_count || 0) + 1} reports.
            </div>
          </div>
          <Link
            href={`/complaints/${canonicalTicket.id}`}
            className="px-3 py-1 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors"
          >
            View Canonical
          </Link>
        </div>
      )}

      {/* Main Grid: Left Column Details & Right Column Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols wide on desktop) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Complaint Description & AI Analysis Box */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                {copy.report}
              </span>
              <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap p-4 bg-slate-50 rounded-xl border border-slate-200">
                {complaint.description}
              </p>
            </div>

            {/* AI Summary and Reasoning */}
            <div className="p-4 bg-teal-50/60 rounded-xl border border-teal-200 text-xs space-y-2">
              <div className="flex items-center gap-1.5 text-teal-800 font-bold">
                <Sparkles className="w-4 h-4 text-teal-600" />
                {copy.triage}
              </div>
              <p className="text-teal-950 font-medium">
                <span className="font-bold">{copy.summary}: </span>
                {complaint.ai_summary}
              </p>
              {isStaff && aiDecisions[0]?.reasoning_summary && (
                <p className="text-slate-600 text-[11px] pt-1 border-t border-teal-200/60">
                  <span className="font-semibold text-slate-700">{copy.rationale}: </span>
                  {aiDecisions[0].reasoning_summary}
                </p>
              )}
            </div>

            {/* Meta attributes: Location, Citizen, Language */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-400 block mb-1">{t('location')}</span>
                <span className="font-medium text-slate-800 flex items-center gap-1 truncate">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {complaint.location_text || t('unspecifiedLocation')}
                </span>
                {complaint.latitude && complaint.longitude && (
                  <span className="text-[10px] text-teal-600 block mt-1 font-mono">
                    GPS: {complaint.latitude.toFixed(4)}, {complaint.longitude.toFixed(4)}
                  </span>
                )}
              </div>

              {isStaff && <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-400 block mb-1">{copy.contact}</span>
                <span className="font-medium text-slate-800 truncate block">
                  {complaint.citizen_name || copy.anonymous}
                </span>
                <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                  {complaint.citizen_contact || copy.noContact}
                </span>
              </div>}

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-400 block mb-1">{copy.queue}</span>
                <span className="font-bold text-slate-900 block truncate">
                  {complaint.department_name || 'Ombudsman'}
                </span>
                <span className="text-[10px] text-slate-500 block capitalize mt-0.5">
                  {t('category')}: {categoryNames[language][complaint.category] || CATEGORY_LABELS[complaint.category] || complaint.category}
                </span>
              </div>
            </div>

            {/* Photo evidence if URL provided */}
            {(photoDisplayUrl || (complaint.image_url && !complaint.image_url.startsWith('evidence://') ? complaint.image_url : null)) && (
              <div className="pt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  {copy.photo}
                </span>
                <div className="relative rounded-xl overflow-hidden border border-slate-200 max-h-64">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoDisplayUrl || complaint.image_url || ''}
                    alt="Citizen uploaded civic complaint evidence"
                    className="w-full object-cover max-h-64"
                  />
                </div>
              </div>
            )}
            {complaint.image_url === null && !photoDisplayUrl && (
              <p className="text-[11px] text-slate-500">{copy.privatePhoto}</p>
            )}
            {resolutionDisplayUrl && (
              <div className="pt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">{copy.completionPhoto}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolutionDisplayUrl} alt="Officer completion evidence" className="max-h-64 rounded-xl border border-slate-200 object-cover" />
              </div>
            )}
          </div>

          {/* Transparent Priority Calculation Formula Box */}
          {isStaff && <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {copy.priorityBreakdown}
                </h3>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-0.5 bg-slate-100 rounded text-slate-800">
                {copy.totalScore}: {complaint.priority_score.toFixed(2)}
              </span>
            </div>

            <p className="text-xs text-slate-500">
              {copy.formulaIntro}
            </p>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span>{copy.severity} ({complaint.severity} × 0.70):</span>
                <span className="font-bold">{(complaint.severity * 0.7).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>{copy.crowd} ({complaint.duplicate_count}):</span>
                <span className="font-bold">+{(Math.min(1.0, complaint.duplicate_count * 0.25)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>{copy.urgency} ({isOverdue ? trackingMessages[language].overdue : copy.target}):</span>
                <span className="font-bold">+{isOverdue ? '0.50' : '0.00'}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900">
                <span>{copy.finalScore}:</span>
                <span className="text-teal-700">{complaint.priority_score.toFixed(2)} ({priorityNames[language][complaint.priority_label] || complaint.priority_label})</span>
              </div>
            </div>
          </div>}

          {/* Visual Timeline of Events & Audit Trail */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-600" />
                <h3 className="text-sm font-bold text-slate-900">{copy.timeline}</h3>
              </div>
              <span className="text-xs text-slate-400">{events.length} {copy.events}</span>
            </div>

            <div className="relative pl-6 space-y-4 border-l-2 border-teal-500/30">
              {events.map((evt) => (
                <div key={evt.id} className="relative text-xs">
                  <div className="absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-teal-600" />
                  <div className="flex items-center justify-between text-slate-400 text-[11px] mb-0.5">
                    <span className="font-semibold text-slate-700">{evt.actor}</span>
                    <span>
                      {new Date(evt.created_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-slate-800 font-medium">{evt.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Municipal Operations Controls & Citizen Feedback */}
        <div className="space-y-6">
          {/* Status Update / Operational Resolution Box - Restricted to Staff */}
          {isStaff ? (
            <div className="bg-white p-6 rounded-2xl border border-teal-200 ring-1 ring-teal-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-teal-600" />
                  {copy.staff}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                  Officer: {staffUser?.officerId || 'Staff'}
                </span>
              </div>

              <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
                <span className="text-slate-600 font-mono text-[11px] truncate max-w-[200px]">
                  Passkey: ••••••••••••
                </span>
                <button
                  type="button"
                  onClick={fetchTicketDetails}
                  className="text-xs font-semibold text-teal-700 hover:underline"
                >
                  {copy.loadStaff}
                </button>
              </div>

              <form onSubmit={handleUpdateStatus} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {copy.updateStatus}
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 font-medium"
                  >
                    <option value="open">{statusNames[language].open}</option>
                    <option value="in_progress">{statusNames[language].in_progress}</option>
                    <option value="resolved">{statusNames[language].resolved}</option>
                    <option value="closed">{statusNames[language].closed}</option>
                    <option value="rejected">{statusNames[language].rejected}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {copy.reassign}
                  </label>
                  <select
                    value={selectedDeptId}
                    onChange={(e) => setSelectedDeptId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {copy.resolutionNotes}
                  </label>
                  <textarea
                    rows={3}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="e.g. Asphalt patch applied and roller compacted. Manhole cover replaced..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {copy.completionUpload}
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setResolutionPhoto(e.target.files?.[0] || null)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  disabled={updating || !staffSecret}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  {updating ? copy.saving : copy.save}
                </button>
              </form>
            </div>
          ) : null}

          {/* Citizen Verification & Feedback Box */}
          {!isStaff && <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              {copy.feedback}
            </h3>

            {complaint.citizen_rating ? (
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {copy.recorded} ({complaint.citizen_rating} / 5)
                </div>
                <p className="italic text-slate-700">
                  &ldquo;{complaint.citizen_feedback || copy.noComments}&rdquo;
                </p>
              </div>
            ) : complaint.status !== 'resolved' && complaint.status !== 'closed' ? (
              <p className="text-xs leading-relaxed text-slate-600">{copy.feedbackUnavailable}</p>
            ) : !feedbackToken ? (
              <p className="text-xs leading-relaxed text-slate-600">{copy.feedbackAccess}</p>
            ) : (
              <form onSubmit={handleSubmitFeedback} className="space-y-3 text-xs">
                {feedbackMessage && (
                  <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl font-medium">
                    {feedbackMessage}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    {copy.rating}
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className={`p-1.5 rounded-lg border ${
                          rating >= star
                            ? 'bg-amber-50 border-amber-300 text-amber-500'
                            : 'border-slate-200 text-slate-300'
                        }`}
                      >
                        <Star className="w-5 h-5 fill-current" />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-700 ml-2">{rating} / 5</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {copy.comments}
                  </label>
                  <textarea
                    rows={2}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Was the resolution satisfactory? Does the issue persist?"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="problemPersists"
                    checked={problemPersists}
                    onChange={(e) => setProblemPersists(e.target.checked)}
                    className="rounded text-rose-600"
                  />
                  <label htmlFor="problemPersists" className="text-[11px] text-slate-700 font-medium">
                    {copy.persists}
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={feedbackSubmitting}
                  className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  {feedbackSubmitting ? copy.sending : copy.sendFeedback}
                </button>
              </form>
            )}
          </div>}
        </div>
      </div>
    </div>
  );
}

export default function TicketDetailsPage() {
  const { isStaff, authReady } = useStaffAuth();
  return (
    <React.Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-20 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-2" />
          <span className="text-xs text-slate-500">Loading complaint docket...</span>
        </div>
      }
    >
      {authReady && <TicketDetailsContent key={isStaff ? 'staff' : 'citizen'} />}
    </React.Suspense>
  );
}
