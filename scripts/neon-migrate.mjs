// Load the tasks schema and the repo's seed data into the linked Neon branch.
// Run: node --env-file=.env.local scripts/neon-migrate.mjs
// Idempotent: creates schema if missing, upserts rows by id.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_UNPOOLED / DATABASE_URL not set');
  process.exit(1);
}

const schemaSql = readFileSync(join(root, 'supabase/neon-schema.sql'), 'utf8');
const tasks = JSON.parse(readFileSync(join(root, 'src/data/initial-tasks.json'), 'utf8'));

const COLS = [
  'id', 'title', 'status', 'priority', 'quarter', 'wbs', 'squads', 'pms', 'assignees',
  'start_date', 'end_date', 'figma_url', 'prd_url', 'taiga_url', 'userflow_url',
  'other_docs', 'description', 'parent_id', 'attachments', 'created_at', 'updated_at',
];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(schemaSql);

// Insert parents before children, otherwise the parent_id FK fails.
const byId = new Map(tasks.map((t) => [t.id, t]));
const ordered = [];
const seen = new Set();
const visit = (t) => {
  if (seen.has(t.id)) return;
  seen.add(t.id);
  if (t.parent_id && byId.has(t.parent_id)) visit(byId.get(t.parent_id));
  ordered.push(t);
};
tasks.forEach(visit);

let written = 0;
for (const t of ordered) {
  const values = COLS.map((c) => {
    const v = t[c];
    if (c === 'attachments') return JSON.stringify(v ?? []);
    return v === undefined ? null : v;
  });
  const placeholders = COLS.map((_, i) => `$${i + 1}`).join(', ');
  const updates = COLS.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  await client.query(
    `insert into tasks (${COLS.join(', ')}) values (${placeholders})
     on conflict (id) do update set ${updates}`,
    values,
  );
  written++;
}

const { rows } = await client.query('select count(*)::int as n from tasks');
console.log(`migrated ${written} rows; tasks table now holds ${rows[0].n}`);
await client.end();
