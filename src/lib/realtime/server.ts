import { createRealtime, rawSql } from '@neon/realtime/server';

// Sealing happens server-side so the Realtime secret never reaches the browser.
// Built lazily: `next build` collects route config without runtime secrets.
type Realtime = ReturnType<typeof createRealtime>;

const globalForRealtime = globalThis as unknown as { __realtime?: Realtime };

export function getRealtime(): Realtime {
  if (!globalForRealtime.__realtime) {
    const url = process.env.NEON_REALTIME_URL;
    const secret = process.env.NEON_REALTIME_SECRET;
    const databaseUrl = process.env.DATABASE_URL;
    if (!url || !secret || !databaseUrl) {
      throw new Error('NEON_REALTIME_URL, NEON_REALTIME_SECRET and DATABASE_URL are required');
    }
    globalForRealtime.__realtime = createRealtime({
      url,
      secret,
      db: new URL(databaseUrl).pathname.slice(1),
    });
  }
  return globalForRealtime.__realtime;
}

/** Every task change the kanban cares about; the UI reacts by refetching rows. */
export const tasksLiveQuery = () =>
  rawSql(`select id, status, priority, updated_at from tasks order by created_at desc`, []);
