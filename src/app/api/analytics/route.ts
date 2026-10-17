import { NextResponse } from 'next/server';
import { StorageService } from '@/lib/db/storage';

export async function GET() {
  try {
    const analytics = await StorageService.getAnalytics();
    return NextResponse.json(analytics);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error generating analytics metrics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
