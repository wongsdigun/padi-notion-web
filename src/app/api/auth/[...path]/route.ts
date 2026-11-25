import { getAuth } from '@/lib/auth/server';

// Every method shares the SDK's proxy handler; built on first request so the
// build never needs the cookie secret.
type AuthHandler = ReturnType<ReturnType<typeof getAuth>['handler']>;
type RouteContext = { params: Promise<{ path: string[] }> };

let handler: AuthHandler | undefined;

function auth(): AuthHandler {
  if (!handler) handler = getAuth().handler();
  return handler;
}

async function forward(req: Request, ctx: RouteContext) {
  return auth().GET(req, ctx);
}

export { forward as GET, forward as POST, forward as PUT, forward as DELETE, forward as PATCH };
