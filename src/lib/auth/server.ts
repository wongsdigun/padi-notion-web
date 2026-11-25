import { createNeonAuth } from '@neon/auth/next/server';

// Managed Better Auth on the production branch. NEON_AUTH_BASE_URL is injected by
// `neon deploy`; NEON_AUTH_COOKIE_SECRET is app config and survives env pulls only
// if it is re-added (neon deploy rewrites .env.local).
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});
