import { json, handle, requireAuth, destroySession, clearSessionCookie } from '../../lib/common.js';

// POST /api/logout — выход и аннулирование текущей сессии.
export const onRequestPost = handle(async ({ request, env }) => {
  await requireAuth(env, request); // без сессии выходить не из чего — 401
  await destroySession(env, request);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
});
