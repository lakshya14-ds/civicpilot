'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import {
  Send,
  Sparkles,
  MapPin,
  Camera,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  Copy,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { PriorityBadge, StatusBadge } from '@/components/Badge';
import { IntakeResult } from '@/lib/triage/orchestrator';

interface SamplePreset {
  title: string;
  tag: string;
  description: string;
  location: string;
  citizenName: string;
  contact: string;
}

const SAMPLE_PRESETS: SamplePreset[] = [
  {
    title: 'Hazardous Pothole',
    tag: 'Roads & Infrastructure',
    description:
      'There is a large, deep pothole near Jayanagar 4th Block bus stand. Multiple bikes slipped yesterday during rainfall.',
    location: 'Near Jayanagar 4th Block bus stand, Bengaluru',
    citizenName: 'Devika Sharma',
    contact: '+91-9876543210',
  },
  {
    title: 'Burst Water Pipe',
    tag: 'Emergency / Water Hazard',
    description:
      'Major municipal drinking water pipeline fractured under the pavement. Massive gush of water is flooding street and entering basement shops.',
    location: 'Near Indiranagar 100 Feet Road, Bengaluru',
    citizenName: 'Rohan Mehra',
    contact: 'rohan.mehra@example.com',
  },
  {
    title: 'Ambiguous Buzzing Sound',
    tag: 'Low-Confidence Triage',
    description:
      'Something is making a loud buzzing humming noise near the pole behind the tea stall. Unsure if transformer short-circuit or huge hornet nest.',
    location: 'Near Shivajinagar bus stand, Bengaluru',
    citizenName: 'Manoj Tiwari',
    contact: '+91-9811224466',
  },
  {
    title: 'Duplicate Pothole Test',
    tag: 'Duplicate Suppression',
    description:
      'Dangerous pothole near Jayanagar 4th Block bus stand needs urgent repair before someone gets injured.',
    location: 'Near Jayanagar 4th Block bus stand, Bengaluru',
    citizenName: 'Amit Verma',
    contact: 'amit.verma@example.com',
  },
];

export default function SubmitComplaintPage() {
  const [description, setDescription] = useState('');
  const [locationText, setLocationText] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [citizenName, setCitizenName] = useState('');
  const [citizenContact, setCitizenContact] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState('en');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate unique client-side idempotency key on mount or after successful submission
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  const handleApplyPreset = (preset: SamplePreset) => {
    setDescription(preset.description);
    setLocationText(preset.location);
    setCitizenName(preset.citizenName);
    setCitizenContact(preset.contact);
    setError(null);
    setResult(null);
  };

  const handleUseCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(Number(pos.coords.latitude.toFixed(6)));
          setLongitude(Number(pos.coords.longitude.toFixed(6)));
          if (!locationText) {
            setLocationText(`GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
          }
        },
        () => setError('Location access was declined. Please enter a landmark or coordinates.'),
      );
    } else {
      setError('Location is unavailable on this device. Please enter a landmark.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 5) {
      setError('Please provide at least 5 characters describing the civic issue.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      let imageReference: string | null = null;
      if (photo) {
        const upload = new FormData();
        upload.set('file', photo);
        const uploadResponse = await fetch('/api/media', { method: 'POST', body: upload });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.reference) {
          throw new Error(uploadData.error || 'Photo upload failed.');
        }
        imageReference = uploadData.reference;
      }

      const response = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          location_text: locationText.trim(),
          latitude,
          longitude,
          citizen_name: citizenName.trim() || null,
          citizen_contact: citizenContact.trim() || null,
          image_url: imageReference,
          language,
          idempotency_key: idempotencyKey,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit complaint');
      }

      setResult(data);
      if (data.feedback_token && data.ticket?.id) {
        sessionStorage.setItem(`civicpilot:feedback:${data.ticket.id}`, data.feedback_token);
      }
      setPhoto(null);
      if (photoInput.current) photoInput.current.value = '';
      // Reset idempotency key for next submission
      setIdempotencyKey(crypto.randomUUID());
      window.dispatchEvent(new CustomEvent('civicpilot:refresh'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown submission failure');
    } finally {
      setSubmitting(false);
    }
  };

  const copyTicketNumber = () => {
    if (result?.ticket?.ticket_number) {
      navigator.clipboard.writeText(result.ticket.ticket_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fadeIn">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          Your city, your voice
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Report an issue
        </h1>
        <p className="text-sm text-slate-600 mt-2 max-w-xl mx-auto">
          Tell us what needs attention in your Bengaluru neighbourhood. Add a location and a few details so the pilot team can review it.
        </p>
      </div>

      {/* Preset Demo Buttons */}
      <details className="civic-examples bg-slate-100/80 p-4 rounded-2xl border border-slate-200 mb-8">
        <summary className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          Try an example
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
          {SAMPLE_PRESETS.map((preset) => (
            <button
              key={preset.title}
              type="button"
              onClick={() => handleApplyPreset(preset)}
              className="text-left p-3 rounded-xl bg-white border border-slate-200 hover:border-teal-400 hover:shadow-sm transition-all text-xs group"
            >
              <div className="flex items-center justify-between font-bold text-slate-900 group-hover:text-teal-700">
                <span>{preset.title}</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {preset.tag}
                </span>
              </div>
              <p className="text-slate-500 mt-1 line-clamp-1">{preset.description}</p>
            </button>
          ))}
        </div>
      </details>

      {/* Result Card (When Submitted) */}
      {result && (
        <div className="mb-8 p-6 bg-emerald-50/70 border-2 border-emerald-300 rounded-2xl shadow-md animate-fadeIn">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  Complaint Successfully Registered
                </span>
                <h2 className="text-2xl font-black font-mono text-emerald-950 flex items-center gap-2 mt-0.5">
                  {result.ticket.ticket_number}
                  <button
                    onClick={copyTicketNumber}
                    className="text-xs font-sans font-medium text-emerald-700 hover:text-emerald-900 flex items-center gap-1 px-2 py-1 bg-white/70 rounded-md border border-emerald-200"
                  >
                    <Copy className="w-3 h-3" />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </h2>
              </div>
            </div>

            <Link
              href={`/complaints/${result.ticket.id}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 text-white font-bold text-xs rounded-xl hover:bg-emerald-800 shadow-md transition-colors"
            >
              View Ticket
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Duplicate Banner */}
          {result.is_duplicate && (
            <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600 shrink-0" />
              <div>
                <span className="font-bold">Duplicate Report Detected:</span> Linked to canonical ticket{' '}
                <Link
                  href={`/complaints/${result.canonical_ticket?.id}`}
                  className="font-mono font-bold underline"
                >
                  {result.canonical_ticket?.ticket_number}
                </Link>
                . Report count incremented to boost dispatch priority.
              </div>
            </div>
          )}

          {/* AI Extraction Summary */}
          <div className="mt-4 pt-4 border-t border-emerald-200/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-emerald-700 font-medium block">Category</span>
              <span className="font-bold text-slate-900 capitalize">
                {result.ticket.category} ({result.ai_extraction.subcategory || 'general'})
              </span>
            </div>

            <div>
              <span className="text-emerald-700 font-medium block">Priority Score</span>
              <div className="mt-0.5">
                <PriorityBadge priority={result.ticket.priority_label} />
                <span className="text-[10px] text-slate-500 ml-1.5 font-mono">
                  ({result.ticket.priority_score.toFixed(2)})
                </span>
              </div>
            </div>

            <div>
              <span className="text-emerald-700 font-medium block">Initial Status</span>
              <div className="mt-0.5">
                <StatusBadge status={result.ticket.status} />
              </div>
            </div>

            <div>
              <span className="text-emerald-700 font-medium block">Department Assigned</span>
              <span className="font-bold text-slate-900">
                {result.ticket.department_name || 'Ombudsman'}
              </span>
            </div>
          </div>

          <div className="mt-3 p-3 bg-white/80 rounded-xl border border-emerald-200 text-xs text-slate-700">
            <span className="font-bold text-slate-900">AI Summary: </span>
            {result.ticket.ai_summary}
          </div>
        </div>
      )}

      {/* Main Submission Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6"
      >
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Complaint Description */}
        <div>
          <label htmlFor="description" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Complaint Description <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="Describe the issue in detail (e.g., Pothole depth, street light blackout, water pipeline burst, foul garbage accumulation)..."
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm text-slate-900 placeholder:text-slate-400"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Please avoid sharing sensitive personal information in your description.
          </p>
        </div>

        {/* Location & Coordinates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="location" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Location Landmark / Address
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
              <input
                id="location"
                type="text"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="e.g. Near Jayanagar 4th Block bus stand"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm text-slate-900"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                GPS Coordinates
              </label>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                className="text-[11px] text-teal-600 hover:text-teal-700 font-semibold"
              >
                Use My Location
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                value={latitude ?? ''}
                onChange={(e) => setLatitude(e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="Latitude (e.g. 12.9716)"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900"
              />
              <input
                type="number"
                step="any"
                value={longitude ?? ''}
                onChange={(e) => setLongitude(e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="Longitude (e.g. 77.5946)"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Private photo evidence */}
        <div>
          <label htmlFor="photo" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Photo evidence (optional)
          </label>
          <input
            id="photo"
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-teal-700"
          />
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500"><Camera className="h-3.5 w-3.5" /> JPEG, PNG or WebP, up to 5 MB. Stored privately.</p>
        </div>

        {/* Citizen Contact Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label htmlFor="citizenName" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Citizen Name (Optional)
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                id="citizenName"
                type="text"
                value={citizenName}
                onChange={(e) => setCitizenName(e.target.value)}
                placeholder="Ananya Sharma"
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="citizenContact" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Mobile or Email (Optional)
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                id="citizenContact"
                type="text"
                value={citizenContact}
                onChange={(e) => setCitizenContact(e.target.value)}
                placeholder="+91-9876543210 or email"
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="language" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Preferred Language
            </label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 bg-white"
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="kn">ಕನ್ನಡ (Kannada)</option>
            </select>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-4 flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm shadow-lg shadow-teal-600/25 transition-all disabled:opacity-50 hover:scale-[1.01]"
          >
            <Send className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
            {submitting ? 'Sending your report...' : 'Send report'}
          </button>
        </div>
      </form>
    </div>
  );
}
