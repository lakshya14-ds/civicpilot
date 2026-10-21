'use client';

import React from 'react';
import { useLanguage } from '@/components/LanguageProvider';
import { priorityNames, statusNames } from '@/lib/i18n/messages';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'default', size = 'sm', className = '' }: BadgeProps) {
  const baseClasses = 'inline-flex items-center font-medium rounded-full';
  const sizeClasses = size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  const variantClasses = {
    default: 'bg-slate-100 text-slate-700 border border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200',
    info: 'bg-sky-50 text-sky-700 border border-sky-200',
    purple: 'bg-purple-50 text-purple-700 border border-purple-200',
  }[variant];

  return <span className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const { language } = useLanguage();
  const norm = (status || '').toLowerCase();
  const label = statusNames[language][norm] || status;
  switch (norm) {
    case 'open':
      return <Badge variant="info">{label}</Badge>;
    case 'in_progress':
      return <Badge variant="warning">{label}</Badge>;
    case 'pending_review':
      return <Badge variant="purple">{label}</Badge>;
    case 'escalated':
      return <Badge variant="danger">{label}</Badge>;
    case 'resolved':
      return <Badge variant="success">{label}</Badge>;
    case 'closed':
      return <Badge variant="default">{label}</Badge>;
    case 'rejected':
      return <Badge variant="danger">{label}</Badge>;
    default:
      return <Badge variant="default">{status}</Badge>;
  }
}

export function PriorityBadge({ priority }: { priority: string }) {
  const { language } = useLanguage();
  const norm = (priority || '').toLowerCase();
  const label = priorityNames[language][norm] || priority;
  switch (norm) {
    case 'critical':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
          {label}
        </span>
      );
    case 'high':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
          {label}
        </span>
      );
    case 'medium':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          {label}
        </span>
      );
    case 'low':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
          {label}
        </span>
      );
    default:
      return <Badge variant="default">{priority}</Badge>;
  }
}
