'use client';

import { createRealtimeClient } from '@neon/realtime/client';

// One client per browser session: subscriptions share this connection. Created on
// first use so a build without NEXT_PUBLIC_NEON_REALTIME_URL still succeeds.
type RealtimeClient = ReturnType<typeof createRealtimeClient>;

let client: RealtimeClient | undefined;

export function getRealtimeClient(): RealtimeClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_NEON_REALTIME_URL;
    if (!url) throw new Error('NEXT_PUBLIC_NEON_REALTIME_URL is not set');
    client = createRealtimeClient({ url });
  }
  return client;
}
