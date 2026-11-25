import { Pool } from 'pg';

// One pool per Node process (and per dev-server reload). Pooled connection string
// is the right one for request-scoped traffic; migrations use DATABASE_URL_UNPOOLED.
const globalForDb = globalThis as unknown as { __pgPool?: Pool };

export const pool =
  globalForDb.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? undefined : { rejectUnauthorized: false },
    max: 5,
  });

globalForDb.__pgPool = pool;

export const TASK_COLUMNS = [
  'id', 'title', 'status', 'priority', 'quarter', 'wbs', 'squads', 'pms', 'assignees',
  'start_date', 'end_date', 'figma_url', 'prd_url', 'taiga_url', 'userflow_url',
  'other_docs', 'description', 'parent_id', 'attachments', 'created_at', 'updated_at',
] as const;

export type TaskColumn = (typeof TASK_COLUMNS)[number];

/** Coerce a client payload into insertable column values. Unknown keys are dropped. */
export function toRowValues(input: Record<string, unknown>) {
  const cols: TaskColumn[] = [];
  const values: unknown[] = [];
  for (const col of TASK_COLUMNS) {
    if (!(col in input) || input[col] === undefined) continue;
    cols.push(col);
    values.push(col === 'attachments' ? JSON.stringify(input[col] ?? []) : input[col]);
  }
  return { cols, values };
}
