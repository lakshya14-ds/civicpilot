export interface SavedCitizenReport {
  id: string;
  ticketNumber: string;
  trackingToken: string;
  feedbackToken?: string;
}

const STORAGE_KEY = 'civicpilot:my-reports:v1';

export function getSavedCitizenReports(): SavedCitizenReport[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedCitizenReport =>
      typeof item?.id === 'string' &&
      typeof item?.ticketNumber === 'string' &&
      typeof item?.trackingToken === 'string' &&
      /^[a-f0-9]{64}$/i.test(item.trackingToken)
    );
  } catch {
    return [];
  }
}

export function saveCitizenReport(report: SavedCitizenReport): void {
  const current = getSavedCitizenReports();
  const existing = current.find((item) => item.id === report.id);
  const merged = { ...report, feedbackToken: report.feedbackToken || existing?.feedbackToken };
  const reports = current.filter((item) => item.id !== report.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([merged, ...reports].slice(0, 50)));
  if (merged.feedbackToken) {
    sessionStorage.setItem(`civicpilot:feedback:${report.id}`, merged.feedbackToken);
  }
  window.dispatchEvent(new Event('civicpilot:my-reports-changed'));
}

export function forgetCitizenReport(id: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getSavedCitizenReports().filter((item) => item.id !== id)));
  sessionStorage.removeItem(`civicpilot:feedback:${id}`);
  window.dispatchEvent(new Event('civicpilot:my-reports-changed'));
}

export function findCitizenReport(idOrTicket: string): SavedCitizenReport | undefined {
  return getSavedCitizenReports().find((item) => item.id === idOrTicket || item.ticketNumber === idOrTicket);
}
