import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/db/storage';
import { isAuthorizedStaff } from '@/lib/security/auth';

export async function GET(req: NextRequest) {
  if (!isAuthorizedStaff(req.headers.get('x-reviewer-secret') || req.headers.get('x-admin-key'))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  }
  try {
    const analytics = await StorageService.getAnalytics();
    return NextResponse.json(analytics, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error generating analytics metrics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
