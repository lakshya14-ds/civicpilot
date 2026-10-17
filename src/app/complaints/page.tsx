'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Layers,
  ClockAlert,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Eye,
  X,
} from 'lucide-react';
import { StatusBadge, PriorityBadge } from '@/components/Badge';
import { Complaint, Department } from '@/types';
import { CATEGORY_LABELS, STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  // Quick slide-over drawer preview
  const [selectedTicket, setSelectedTicket] = useState<Complaint | null>(null);

  const fetchComplaints = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (status) params.append('status', status);
      if (priority) params.append('priority', priority);
      if (category) params.append('category', category);
      if (departmentId) params.append('department_id', departmentId);
      params.append('page', page.toString());
      params.append('limit', '15');

      const res = await fetch(`/api/complaints?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch complaints');
      const data = await res.json();

      setComplaints(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, status, priority, category, departmentId, search]);

  useEffect(() => {
    fetch('/api/departments')
      .then((res) => res.json())
      .then((data) => setDepartments(data || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchComplaints();
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatus('');
    setPriority('');
    setCategory('');
    setDepartmentId('');
    setPage(1);
  };

  const isOverdue = (ticket: Complaint) => {
    if (ticket.status === 'resolved' || ticket.status === 'closed' || ticket.status === 'rejected') {
      return false;
    }
    return new Date(ticket.sla_due_at).getTime() < Date.now() || ticket.sla_breached;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Track complaints
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Find a report and follow its progress, from first review to resolution.
          </p>
        </div>

        <Link
          href="/submit"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
        >
          + Report an issue
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ticket ID (CP-...), description, location, or citizen..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs sm:text-sm text-slate-900"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors"
          >
            Search
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100 text-xs">
          {/* Status filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 bg-white"
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* Priority filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 bg-white"
            >
              <option value="">All Priorities</option>
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* Category filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 bg-white"
            >
              <option value="">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* Department filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Department
            </label>
            <select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 bg-white"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters button */}
          <div className="flex items-end">
            <button
              onClick={handleClearFilters}
              className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs rounded-lg transition-colors"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Complaints Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mb-2" />
            <span className="text-xs font-medium">Filtering complaint records...</span>
          </div>
        ) : complaints.length === 0 ? (
          <div className="py-20 text-center text-slate-500">
            <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">No complaints match your query</h3>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or search keywords</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Ticket ID</th>
                  <th className="px-5 py-3.5 font-semibold">Summary & Location</th>
                  <th className="px-5 py-3.5 font-semibold">Category</th>
                  <th className="px-5 py-3.5 font-semibold">Priority</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 font-semibold">Department</th>
                  <th className="px-5 py-3.5 font-semibold">SLA Status</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {complaints.map((item) => {
                  const overdue = isOverdue(item);
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        overdue ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      {/* Ticket Number & Duplicate Tag */}
                      <td className="px-5 py-4 font-mono font-bold text-xs text-teal-700 whitespace-nowrap">
                        <Link href={`/complaints/${item.id}`} className="hover:underline">
                          {item.ticket_number}
                        </Link>
                        {item.duplicate_of && (
                          <div className="flex items-center gap-1 text-[10px] text-purple-600 font-sans font-medium mt-0.5">
                            <Layers className="w-3 h-3" />
                            Duplicate ({item.duplicate_count})
                          </div>
                        )}
                        {item.requires_human_review && (
                          <div className="text-[10px] text-purple-700 font-sans font-semibold mt-0.5">
                            ★ Review Needed
                          </div>
                        )}
                      </td>

                      {/* Summary and Location */}
                      <td className="px-5 py-4 max-w-xs">
                        <div className="font-semibold text-slate-900 text-xs truncate">
                          {item.ai_summary || item.description}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          📍 {item.location_text || 'Location unspecified'}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-5 py-4 text-xs font-medium text-slate-800 whitespace-nowrap">
                        {CATEGORY_LABELS[item.category] || item.category}
                      </td>

                      {/* Priority */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <PriorityBadge priority={item.priority_label} />
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <StatusBadge status={item.status} />
                      </td>

                      {/* Department */}
                      <td className="px-5 py-4 text-xs text-slate-700 whitespace-nowrap">
                        {item.department_name || 'Ombudsman'}
                      </td>

                      {/* SLA Deadline */}
                      <td className="px-5 py-4 text-xs whitespace-nowrap">
                        {overdue ? (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                            <ClockAlert className="w-3 h-3" />
                            Overdue
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">
                            {new Date(item.sla_due_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedTicket(item)}
                            title="Quick View Drawer"
                            className="p-1.5 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <Link
                            href={`/complaints/${item.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition-colors"
                          >
                            Details
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div>
            Showing <span className="font-bold">{complaints.length}</span> of{' '}
            <span className="font-bold">{total}</span> complaints
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded-md bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded-md bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Quick Slide-Over Drawer for Instant Ticket Inspection */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/40 backdrop-blur-xs flex justify-end animate-fadeIn">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <span className="text-xs font-mono font-bold text-teal-600">
                  {selectedTicket.ticket_number}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">Quick Inspection</h3>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <span className="font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Full Citizen Description
                </span>
                <p className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 leading-relaxed">
                  {selectedTicket.description}
                </p>
              </div>

              <div>
                <span className="font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  AI Summary
                </span>
                <p className="p-3 bg-teal-50/50 rounded-xl border border-teal-200 text-teal-900 font-medium">
                  {selectedTicket.ai_summary}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block mb-1">Priority</span>
                  <PriorityBadge priority={selectedTicket.priority_label} />
                  <span className="text-[10px] text-slate-400 block mt-1 font-mono">
                    Score: {selectedTicket.priority_score.toFixed(2)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block mb-1">Status</span>
                  <StatusBadge status={selectedTicket.status} />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1">Assigned Department</span>
                <span className="font-bold text-slate-900">
                  {selectedTicket.department_name || 'Ombudsman'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1">Location Details</span>
                <span className="font-medium text-slate-900">
                  📍 {selectedTicket.location_text || 'No location specified'}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setSelectedTicket(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Close Drawer
              </button>
              <Link
                href={`/complaints/${selectedTicket.id}`}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow"
              >
                Open Full Ticket View
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
