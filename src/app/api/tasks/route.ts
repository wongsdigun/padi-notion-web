import { NextRequest, NextResponse } from 'next/server';
import { pool, toRowValues } from '@/lib/db';

export const dynamic = 'force-dynamic';

// `date` columns go out as plain YYYY-MM-DD, exactly as Supabase returned them:
// pg hands back JS Dates, and JSON.stringify would turn those into instants.
const SELECT_TASKS = `select
  id, title, status, priority, quarter, wbs, squads, pms, assignees,
  start_date::text as start_date, end_date::text as end_date,
  figma_url, prd_url, taiga_url, userflow_url, other_docs, description,
  parent_id, attachments, created_at, updated_at
from tasks order by created_at desc`;

export async function GET() {
  try {
    const { rows } = await pool.query(SELECT_TASKS);
    // Read-only and cross-origin: gr8r-studio, a static viewer, reads this list.
    return NextResponse.json(rows, { headers: { 'access-control-allow-origin': '*' } });
  } catch (error) {
    console.error('[db] list failed:', (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { cols, values } = toRowValues(body);
    if (!cols.includes('id')) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
    const { rows } = await pool.query(
      `insert into tasks (${cols.join(', ')}) values (${placeholders})
       on conflict (id) do update set ${updates}
       returning *`,
      values,
    );
    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
