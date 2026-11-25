'use client';

import { createRealtimeClient } from '@neon/realtime/client';

// One client per browser session: subscriptions share this connection.
export const realtimeClient = createRealtimeClient({
  url: process.env.NEXT_PUBLIC_NEON_REALTIME_URL!,
});
