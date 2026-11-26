// Copy public.members from the retired Supabase project into Neon.
// Reads Supabase with the anon key gr8r-studio already ships, writes Neon with
// padi's DATABASE_URL_UNPOOLED. Idempotent: upsert on id.
//
//   node scripts/migrate-members.mjs [--dry]
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const readEnv = (file) => {
  const out = {};
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
  return out;
};

const padi = readEnv('/Users/wongsdigun/Projects/padi-notion-web/.env.local');
const gr8r = readEnv('/Users/wongsdigun/Projects/gr8r-studio/.env.local');
const supabaseUrl = gr8r.VITE_SUPABASE_URL;
const supabaseKey = gr8r.VITE_SUPABASE_ANON_KEY;
const databaseUrl = padi.DATABASE_URL_UNPOOLED || padi.DATABASE_URL;
const dry = process.argv.includes('--dry');

if (!supabaseUrl || !supabaseKey) throw new Error('Supabase URL/key missing from gr8r .env.local');
if (!databaseUrl) throw new Error('DATABASE_URL missing from padi .env.local');

const res = await fetch(`${supabaseUrl}/rest/v1/members?select=*&order=name.asc`, {
  headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
});
if (!res.ok) throw new Error(`supabase members: HTTP ${res.status} ${await res.text()}`);
const members = await res.json();
console.log(`fetched ${members.length} members from supabase`);

if (dry) {
  console.log('dry run, nothing written');
  process.exit(0);
}

const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(readFileSync(new URL('../supabase/neon-schema.sql', import.meta.url), 'utf8'));

for (const m of members) {
  await client.query(
    `insert into members (id, auth_id, name, email, role, squad, created_at)
     values ($1, $2, $3, $4, $5, $6, coalesce($7, now()))
     on conflict (id) do update
       set auth_id = excluded.auth_id, name = excluded.name, email = excluded.email,
           role = excluded.role, squad = excluded.squad`,
    [m.id, m.auth_id, m.name, m.email, m.role, m.squad, m.created_at],
  );
}

const { rows } = await client.query('select count(*)::int as n, count(name)::int as named from members');
console.log(`members table now holds ${rows[0].n} (${rows[0].named} named)`);
await client.end();
