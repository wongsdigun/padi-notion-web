// Merge a Notion CSV export into public.tasks (Neon). Idempotent and additive:
// rows that match by WBS code, else by title, are updated in place; the rest are
// inserted. Nothing is ever deleted, and attachments/parent links on untouched
// rows survive.
//
//   node scripts/import-notion-csv.mjs "<file.csv>" --dry
//   node scripts/import-notion-csv.mjs "<file.csv>"
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const file = args.find((a) => !a.startsWith('--'));
if (!file) throw new Error('usage: node scripts/import-notion-csv.mjs <file.csv> [--dry]');

const QUARTER = 'Q4 2026';
const YEAR = 2026;
/* CSV assignee spelling -> members.name */
const PERSON_ALIAS = {
  'herbanu maharindro': 'Banu',
  'frans firmansyah': 'Frans',
  'widy baswara': 'Widy',
  'sigit saptari': 'Sigit',
  'dian gunawan': 'Dian',
};

/* ---- CSV ---- */
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else if (c !== '\r') cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
};

const table = parseCsv(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const head = table.shift().map((h) => h.trim());
const col = (name) => head.indexOf(name);
const records = table
  .filter((r) => r.some((x) => x.trim()))
  .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));

/* ---- mapping ---- */
let PERSON_NAMES = []; // filled from members below
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

const isoDate = (token) => {
  const m = /^([A-Za-z]{3})\w*\s+(\d{1,2})$/.exec(token.trim());
  if (!m || !MONTHS[m[1]]) return null;
  return `${YEAR}-${String(MONTHS[m[1]]).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
};
const parseRange = (value) => {
  const [a, b] = String(value).split('→').map((s) => s.trim());
  return { start: isoDate(a || ''), end: isoDate(b || a || '') };
};
const splitList = (value) =>
  String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const stripNotionSuffix = (value) => String(value).replace(/\s*\(Q4%202026\/.*\)\s*$/, '').trim();

const person = (token) => {
  const key = token.trim().toLowerCase();
  if (PERSON_ALIAS[key]) return PERSON_ALIAS[key];
  const first = key.split(/\s+/)[0];
  return PERSON_NAMES.find((n) => n.toLowerCase() === first) || token.trim();
};

const rowOf = (r) => {
  const ranges = parseRange(r['Date'] || '');
  const figma2 = r['URL Figma 2'] || '';
  const otherDocs = [r['Other docs'], figma2 ? `Figma 2: ${figma2}` : ''].filter(Boolean).join('\n');
  return {
    title: r['Name'] || '',
    wbs: r['Backlog WBS Code'] || '',
    status: r['Status'] || '',
    priority: r['Priority'] || '',
    quarter: QUARTER,
    squads: splitList(r['Squad / Funnel']),
    pms: r['PM'] ? splitList(r['PM']).map(person) : [],
    assignees: r['Assigned To'] ? splitList(r['Assigned To']).map(person) : [],
    start_date: ranges.start,
    end_date: ranges.end,
    figma_url: r['URL Figma'] || '',
    prd_url: r['URL PRD'] || '',
    taiga_url: r['URL Taiga'] || '',
    userflow_url: r['User flow'] || '',
    other_docs: otherDocs,
    parentTitle: stripNotionSuffix(r['Parent item'] || ''),
  };
};

/* ---- db ---- */
const readEnv = (path) => {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env.local: fall back to the process env */
  }
  return out;
};
const env = readEnv(new URL('../.env.local', import.meta.url).pathname);
const databaseUrl = process.env.DATABASE_URL_UNPOOLED || env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL_UNPOOLED missing');

const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: memberRows } = await client.query('select name from members order by name');
PERSON_NAMES = memberRows.map((m) => m.name);

const { rows: existing } = await client.query(
  'select id, title, wbs, status, parent_id, attachments from tasks',
);
const byTitle = new Map(existing.map((r) => [r.title.trim().toLowerCase(), r]));
/* WBS codes are not unique in the database (DSC#2 appears 10 times), so a code is
   only usable when it identifies exactly one row on both sides. */
const countBy = (list, key) => {
  const m = new Map();
  for (const r of list) {
    const k = (r[key] || '').trim();
    if (k) m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
};

const rows = records.map(rowOf).filter((r) => r.title);
const skipped = records.length - rows.length;
const wbsInCsv = countBy(rows, 'wbs');
const wbsInDb = countBy(existing, 'wbs');
const uniqueWbs = new Map(
  existing.filter((r) => r.wbs && wbsInDb.get(r.wbs.trim()) === 1 && wbsInCsv.get(r.wbs.trim()) === 1).map((r) => [r.wbs.trim(), r]),
);

const used = new Set();
const plan = rows.map((r) => {
  let match = byTitle.get(r.title.toLowerCase()) || null;
  if (!match && r.wbs) match = uniqueWbs.get(r.wbs) || null;
  if (match && used.has(match.id)) match = null; // one database row answers one csv row
  if (match) used.add(match.id);
  return { row: r, match };
});

const updates = plan.filter((p) => p.match);
const inserts = plan.filter((p) => !p.match);
const statusChanges = updates.filter((p) => p.match.status !== p.row.status);

console.log(
  `csv rows ${records.length} | skipped (no name) ${skipped} | update ${updates.length} | insert ${inserts.length}`,
);
console.log(`status changes on matched rows: ${statusChanges.length}`);
for (const p of statusChanges) console.log(`  ${p.match.status} -> ${p.row.status}  ${p.row.title.slice(0, 60)}`);

/* parent titles must resolve to a csv row's final id */
const idByTitle = new Map();
for (const p of plan) idByTitle.set(p.row.title.trim().toLowerCase(), p.match ? p.match.id : randomUUID());

const unresolvedParents = [
  ...new Set(plan.map((p) => p.row.parentTitle).filter((t) => t && !idByTitle.has(t.toLowerCase()))),
];
if (unresolvedParents.length) {
  console.log('parents not in this csv (left untouched):');
  for (const t of unresolvedParents) console.log(`  ${t}`);
}

if (dry) {
  console.log('dry run: nothing written');
  await client.end();
  process.exit(0);
}

const COLUMNS = [
  'wbs', 'status', 'priority', 'quarter', 'squads', 'pms', 'assignees',
  'start_date', 'end_date', 'figma_url', 'prd_url', 'taiga_url', 'userflow_url', 'other_docs',
];
const valueOf = (row, col) => (Array.isArray(row[col]) ? row[col] : row[col] || null);

await client.query('begin');
let updated = 0;
for (const { row, match } of updates) {
  const sets = [];
  const values = [];
  for (const c of COLUMNS) {
    const v = valueOf(row, c);
    if (v === null || v === '') continue; // an empty cell in Notion means "not set here"
    values.push(v);
    sets.push(`${c} = $${values.length}`);
  }
  const parentId = row.parentTitle ? idByTitle.get(row.parentTitle.toLowerCase()) : null;
  if (parentId && parentId !== match.id) {
    values.push(parentId);
    sets.push(`parent_id = $${values.length}`);
  }
  if (!sets.length) continue;
  values.push(match.id);
  await client.query(`update tasks set ${sets.join(', ')} where id = $${values.length}`, values);
  updated++;
}

let inserted = 0;
const INSERT_DEFAULTS = { priority: 'Medium', status: 'Not started' };
for (const { row } of inserts) {
  const id = idByTitle.get(row.title.trim().toLowerCase());
  const values = [id, row.title, ...COLUMNS.map((c) => valueOf(row, c) ?? INSERT_DEFAULTS[c] ?? null)];
  const parentId = row.parentTitle ? idByTitle.get(row.parentTitle.toLowerCase()) : null;
  values.push(parentId === id ? null : parentId);
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(
    `insert into tasks (id, title, ${COLUMNS.join(', ')}, parent_id) values (${placeholders})`,
    values,
  );
  inserted++;
}

/* second pass: parents that were themselves inserted need the link after ids exist */
for (const { row, match } of updates) {
  if (row.parentTitle) {
    const parentId = idByTitle.get(row.parentTitle.toLowerCase());
    if (parentId && parentId !== match.id && match.parent_id !== parentId) {
      await client.query('update tasks set parent_id = $1 where id = $2', [parentId, match.id]);
    }
  }
}

await client.query('commit');
const { rows: after } = await client.query('select count(*)::int as n from tasks');
console.log(`updated ${updated} | inserted ${inserted} | tasks table now holds ${after[0].n}`);
await client.end();
