-- Schema for padi-notion-web on Neon (Lakebase Postgres).
-- Same shape as supabase/schema.sql, minus the destructive drop and minus RLS:
-- the app reaches this database only through Next.js route handlers with the
-- project's own credentials, so there is no browser-facing PostgREST surface.

create table if not exists tasks (
    id text primary key,
    title text not null,
    status text not null default 'Not started',
    priority text not null default 'Medium',
    quarter text not null default 'Q4 2026',
    wbs text default '',
    squads text[] default array[]::text[],
    pms text[] default array[]::text[],
    assignees text[] default array[]::text[],
    start_date date,
    end_date date,
    figma_url text default '',
    prd_url text default '',
    taiga_url text default '',
    userflow_url text default '',
    other_docs text default '',
    description text default '',
    parent_id text references tasks(id) on delete set null,
    attachments jsonb default '[]'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_priority on tasks(priority);
create index if not exists idx_tasks_wbs on tasks(wbs);
create index if not exists idx_tasks_parent_id on tasks(parent_id);
create index if not exists idx_tasks_assignees on tasks using gin(assignees);
create index if not exists idx_tasks_squads on tasks using gin(squads);
create index if not exists idx_tasks_created_at on tasks(created_at desc);

create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

drop trigger if exists trigger_tasks_updated_at on tasks;
create trigger trigger_tasks_updated_at
    before update on tasks
    for each row
    execute function update_updated_at_column();

-- Team members. gr8r-studio (read-only viewer) needs names and roles to map
-- assignees onto its own member records; nothing in padi's own UI reads it yet.
create table if not exists members (
    id uuid primary key default gen_random_uuid(),
    auth_id uuid,
    name text not null,
    email text,
    role text not null default 'member',
    squad text,
    created_at timestamptz default now()
);

create index if not exists idx_members_name on members(name);
