import {
  changePasswordRequestSchema,
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  type AuthSessionResponse,
  type MeResponse,
} from '@vitruv/contracts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { AppError, errorBody } from '../../lib/errors';
import type { ClientIpResolver } from '../../lib/client-ip';
import { validate } from '../../lib/validation';
import type { AppEnv } from '../../types';
import {
  changePassword,
  currentUser,
  login,
  logout,
  logoutAll,
  refresh,
  type AuthServiceDeps,
} from './auth.service';

/** Authenticated endpoints: a verified principal is required, no specific permission. */
function principalOf(c: Context<AppEnv>) {
  const principal = c.get('principal');
  if (!principal) throw AppError.unauthenticated();
  return principal;
}

/**
 * /v1/auth — shared by the web server (Admin/Coach) and the future Flutter app.
 * Credentials travel only in JSON bodies and the Authorization header; responses are no-store
 * (set for the whole /v1/auth tree in app.ts) and never contain hashes or session internals.
 */
export function authRoutes(deps: AuthServiceDeps & { clientIp: ClientIpResolver }) {
  const routes = new Hono<AppEnv>();
  // Small bodies only: bounds Argon2 input and parsing work.
  routes.use(
    '*',
    bodyLimit({
      maxSize: 8 * 1024,
      onError: (c) =>
        c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body too large.', c.get('requestId')), 413),
    }),
  );

  // Authentication is checked before body validation (401 before 400).
  const authenticated = createMiddleware<AppEnv>(async (c, next) => {
    principalOf(c);
    await next();
  });
  for (const path of ['/me', '/logout-all', '/password']) routes.use(path, authenticated);

  routes.post('/login', validate('json', loginRequestSchema), async (c) => {
    const body: AuthSessionResponse = await login(deps, c.req.valid('json'), {
      ip: deps.clientIp(c),
    });
    return c.json(body, 200);
  });

  routes.post('/refresh', validate('json', refreshRequestSchema), async (c) => {
    const body: AuthSessionResponse = await refresh(deps, c.req.valid('json').refreshToken);
    return c.json(body, 200);
  });

  routes.post('/logout', validate('json', logoutRequestSchema), async (c) => {
    await logout(deps, {
      principal: c.get('principal'),
      refreshToken: c.req.valid('json').refreshToken,
    });
    return c.body(null, 204);
  });

  routes.post('/logout-all', async (c) => {
    await logoutAll(deps, principalOf(c));
    return c.body(null, 204);
  });

  routes.get('/me', async (c) => {
    const body: MeResponse = { user: await currentUser(deps, principalOf(c)) };
    return c.json(body, 200);
  });

  routes.post('/password', validate('json', changePasswordRequestSchema), async (c) => {
    const body: AuthSessionResponse = await changePassword(
      deps,
      principalOf(c),
      c.req.valid('json'),
    );
    return c.json(body, 200);
  });

  return routes;
}
