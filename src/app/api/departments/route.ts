import { NextResponse } from 'next/server';
import { StorageService } from '@/lib/db/storage';

export async function GET() {
  try {
    const departments = await StorageService.getDepartments();
    return NextResponse.json(departments);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error fetching departments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
