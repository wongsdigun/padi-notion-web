import { readFileSync } from 'node:fs';
import pg from 'pg';
const live = JSON.parse(readFileSync('/tmp/supabase-tasks.json', 'utf8'));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows: neon } = await client.query('select *, start_date::text as sd, end_date::text as ed from tasks');
const byId = new Map(neon.map((r) => [r.id, r]));
const norm = (v) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : v);
let missing = 0, mismatched = 0; const examples = [];
const FIELDS = ['title','status','priority','quarter','wbs','other_docs','description','parent_id','figma_url','prd_url','taiga_url','userflow_url'];
const ARR = ['squads','pms','assignees'];
for (const src of live) {
  const t = byId.get(src.id);
  if (!t) { missing++; continue; }
  for (const f of FIELDS) if ((norm(src[f]) ?? '') !== (norm(t[f]) ?? '')) { mismatched++; if (examples.length<3) examples.push(`${src.id}.${f}: ${JSON.stringify(src[f])} != ${JSON.stringify(t[f])}`); }
  for (const f of ARR) if (JSON.stringify(src[f] ?? []) !== JSON.stringify(t[f] ?? [])) { mismatched++; if (examples.length<3) examples.push(`${src.id}.${f}`); }
  if (String(src.start_date ?? '') !== (t.sd ?? '')) { mismatched++; if (examples.length<3) examples.push(`${src.id}.start_date ${src.start_date} != ${t.sd}`); }
  if (String(src.end_date ?? '') !== (t.ed ?? '')) { mismatched++; if (examples.length<3) examples.push(`${src.id}.end_date ${src.end_date} != ${t.ed}`); }
  const oldUrls = (src.attachments||[]).map(a=>a.url).filter(Boolean);
  const newUrls = (t.attachments||[]).map(a=>a.url).filter(Boolean);
  if (oldUrls.length !== newUrls.length) { mismatched++; if (examples.length<3) examples.push(`${src.id}.attachments ${oldUrls.length} != ${newUrls.length}`); }
}
console.log('neon rows', neon.length, '| supabase rows', live.length, '| missing', missing, '| field mismatches', mismatched);
examples.forEach((e) => console.log('  ', e));
const sample = neon.find((r) => (r.attachments||[]).length > 0);
console.log('sample attachment url:', sample?.attachments?.[0]?.url);
await client.end();
