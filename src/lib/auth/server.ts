import { createNeonAuth } from '@neon/auth/next/server';

// Managed Better Auth on the production branch. Built lazily: `next build` collects
// route config in an environment without runtime secrets, and createNeonAuth
// rejects a missing cookie secret at creation time.
type NeonAuth = ReturnType<typeof createNeonAuth>;

let cached: NeonAuth | null = null;

export function getAuth(): NeonAuth {
  if (!cached) {
    const secret = process.env.NEON_AUTH_COOKIE_SECRET;
    if (!secret) throw new Error('NEON_AUTH_COOKIE_SECRET is not set');
    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    if (!baseUrl) throw new Error('NEON_AUTH_BASE_URL is not set');
    cached = createNeonAuth({ baseUrl, cookies: { secret } });
  }
  return cached;
}
