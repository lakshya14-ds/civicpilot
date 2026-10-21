import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/db/storage';
import { isAuthorizedStaff } from '@/lib/security/auth';

export async function GET(req: NextRequest) {
  if (!isAuthorizedStaff(req.headers.get('x-reviewer-secret') || req.headers.get('x-admin-key'))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    const status = searchParams.get('status') || undefined;
    const category = searchParams.get('category') || undefined;
    const priority = searchParams.get('priority') || undefined;
    const department_id = searchParams.get('department_id') || undefined;
    const search = searchParams.get('search') || undefined;
    const requires_human_review =
      searchParams.get('requires_human_review') === 'true'
        ? true
        : searchParams.get('requires_human_review') === 'false'
        ? false
        : undefined;
    const is_duplicate =
      searchParams.get('is_duplicate') === 'true'
        ? true
        : searchParams.get('is_duplicate') === 'false'
        ? false
        : undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await StorageService.getComplaints({
      status,
      category,
      priority,
      department_id,
      search,
      requires_human_review,
      is_duplicate,
      page,
      limit,
    });

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error fetching complaints';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
