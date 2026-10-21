import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/db/storage';
import { publicEvent } from '@/lib/security/public-view';
import { isAuthorizedStaff } from '@/lib/security/auth';

export async function GET(req: NextRequest) {
  if (!isAuthorizedStaff(req.headers.get('x-reviewer-secret') || req.headers.get('x-admin-key'))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  }
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100', 10);
    const events = await StorageService.getAllEvents(limit);
    const safeEvents = events.map(publicEvent);
    return NextResponse.json({ events: safeEvents, total: safeEvents.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error fetching audit logs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
