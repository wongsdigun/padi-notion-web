import { createRealtime, rawSql } from '@neon/realtime/server';

// Sealing happens server-side so the Realtime secret never reaches the browser.
// One connection per process; subscriptions multiplex over it.
const globalForRealtime = globalThis as unknown as { __realtime?: ReturnType<typeof createRealtime> };

export const realtime =
  globalForRealtime.__realtime ??
  createRealtime({
    url: process.env.NEON_REALTIME_URL!,
    secret: process.env.NEON_REALTIME_SECRET!,
    db: new URL(process.env.DATABASE_URL!).pathname.slice(1),
  });

globalForRealtime.__realtime = realtime;

/** Every task change the kanban cares about; the UI reacts by refetching rows. */
export const tasksLiveQuery = () =>
  rawSql(
    `select id, status, priority, updated_at from tasks order by created_at desc`,
    [],
  );
