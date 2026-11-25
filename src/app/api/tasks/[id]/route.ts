import { NextRequest, NextResponse } from 'next/server';
import { pool, toRowValues } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { cols, values } = toRowValues({ ...body, id });
    const updates = cols.filter((c) => c !== 'id').map((c, i) => `${c} = $${i + 2}`);
    if (updates.length === 0) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
    }
    const { rows } = await pool.query(
      `update tasks set ${updates.join(', ')} where id = $1 returning *`,
      [id, ...values.slice(1)],
    );
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await pool.query('delete from tasks where id = $1', [id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
