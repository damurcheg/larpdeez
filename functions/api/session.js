import { json, handle, getSessionUser } from '../lib/common.js';

// GET /api/session — проверяет, вошёл ли пользователь (по cookie сессии).
export const onRequestGet = handle(async ({ request, env }) => {
  const session = await getSessionUser(env, request);
  return json({ authenticated: !!session });
});
