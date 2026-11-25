import { NextRequest, NextResponse } from 'next/server';
import { pool, toRowValues } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { rows } = await pool.query('select * from tasks order by created_at desc');
    return NextResponse.json(rows);
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
