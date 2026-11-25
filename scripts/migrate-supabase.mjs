// Copy a Supabase tasks dump into Neon: rows into Postgres, attachment files into
// the object-storage bucket, and rewrite each attachment URL to /api/files/<key>.
//
// Dump first (read-only against Supabase), then:
//   node --env-file=.env.local scripts/migrate-supabase.mjs /tmp/supabase-tasks.json
//
// Idempotent: rows upsert by id, files overwrite the same key.

import { readFileSync } from 'node:fs';
import pg from 'pg';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const dumpPath = process.argv[2];
if (!dumpPath) {
  console.error('usage: node --env-file=.env.local scripts/migrate-supabase.mjs <dump.json>');
  process.exit(1);
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const BUCKET = 'uploads';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const rows = JSON.parse(readFileSync(dumpPath, 'utf8'));

const COLS = [
  'id', 'title', 'status', 'priority', 'quarter', 'wbs', 'squads', 'pms', 'assignees',
  'start_date', 'end_date', 'figma_url', 'prd_url', 'taiga_url', 'userflow_url',
  'other_docs', 'description', 'parent_id', 'attachments', 'created_at', 'updated_at',
];

// Copy one Supabase-hosted attachment into the Neon bucket; returns the new URL.
async function copyFile(taskId, attachment) {
  const source = attachment.url;
  if (!source || !source.includes('/storage/v1/object/public/')) {
    return { ...attachment, migrated: false };
  }
  const path = decodeURIComponent(source.split('/storage/v1/object/public/')[1] || '');
  const name = path.split('/').pop() || 'file';
  const key = `${taskId}/${name}`;

  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { ...attachment, url: `/api/files/${key}`, migrated: true };
  } catch {
    // not copied yet, fall through to download
  }

  const res = await fetch(source);
  if (!res.ok) {
    console.warn(`  ! copy failed ${res.status} for ${name}`);
    return { ...attachment, migrated: false };
  }
  const body = Buffer.from(await res.arrayBuffer());
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: res.headers.get('content-type') || 'application/octet-stream',
    }),
  );
  return { ...attachment, url: `/api/files/${key}`, migrated: true };
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

// Parents before children so the parent_id FK holds.
const byId = new Map(rows.map((r) => [r.id, r]));
const ordered = [];
const seen = new Set();
const visit = (row) => {
  if (seen.has(row.id)) return;
  seen.add(row.id);
  if (row.parent_id && byId.has(row.parent_id)) visit(byId.get(row.parent_id));
  ordered.push(row);
};
rows.forEach(visit);

let fileCount = 0;
let failedFiles = 0;

for (const row of ordered) {
  const attachments = [];
  for (const attachment of row.attachments || []) {
    const copied = await copyFile(row.id, attachment);
    if (copied.migrated) fileCount++;
    else if (attachment.url) failedFiles++;
    const { migrated, ...rest } = copied;
    attachments.push(rest);
  }

  const record = { ...row, attachments };
  const values = COLS.map((c) => {
    const v = record[c];
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
}

const { rows: total } = await client.query('select count(*)::int as n from tasks');
console.log(`upserted ${ordered.length} rows | files copied ${fileCount}, not copied ${failedFiles}`);
console.log(`tasks table now holds ${total[0].n}`);
await client.end();
