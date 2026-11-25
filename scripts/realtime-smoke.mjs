import { createRealtimeClient } from '@neon/realtime/client';

const sealed = await (await fetch('http://127.0.0.1:3101/api/realtime/tasks')).json();
const client = createRealtimeClient({ url: process.env.NEXT_PUBLIC_NEON_REALTIME_URL, logLevel: 'error' });
const sub = client.subscribe(sealed);
sub.onChange((c) => {
  console.log('CHANGE RECEIVED:', JSON.stringify(c).slice(0, 240));
  process.exit(0);
});
setTimeout(async () => {
  const r = await fetch('http://127.0.0.1:3101/api/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'rt-smoke-1', title: 'Realtime smoke', status: 'Not started', quarter: 'Q4 2026' }),
  });
  console.log('write status', r.status);
}, 3000);
setTimeout(() => { console.log('NO CHANGE EVENT (timeout)'); process.exit(1); }, 20000);
