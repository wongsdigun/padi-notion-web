import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Read-only, and cross-origin: gr8r-studio (a static viewer) reads the same team
// roster from the browser. Names and roles only, no emails.
const CORS = { 'access-control-allow-origin': '*' };

export async function GET() {
  try {
    const { rows } = await pool.query(
      'select id, name, role, squad, created_at from members order by name asc',
    );
    return NextResponse.json(rows, { headers: CORS });
  } catch (error) {
    console.error('[db] members failed:', (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
