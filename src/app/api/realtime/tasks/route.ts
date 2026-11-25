import { NextResponse } from 'next/server';
import { getRealtime, tasksLiveQuery } from '@/lib/realtime/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getRealtime().seal({ query: tasksLiveQuery() }));
  } catch (error) {
    console.error('[realtime] seal failed:', (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
