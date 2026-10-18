import {
  json, err, handle, getSetting, verifyPassword, createSession, sessionCookie, csrfCookie,
  checkRateLimit, recordFailedAttempt, clearFailedAttempts, readJson,
} from '../lib/common.js';

// POST /api/login — вход по паролю.
export const onRequestPost = handle(async ({ request, env }) => {
  const limited = await checkRateLimit(env, 'login');
  if (limited) return limited;

  const body = await readJson(request);
  const password = body.password;
  if (typeof password !== 'string' || !password) {
    return err('bad-request', 'Не передан пароль.');
  }

  const stored = await getSetting(env, 'password_hash');
  if (!stored) {
    return err('not-configured', 'Пароль ещё не установлен. Откройте страницу входа для первоначальной настройки.', 409);
  }

  const ok = await verifyPassword(password, stored);
  if (!ok) {
    await recordFailedAttempt(env, 'login');
    return err('bad-password', 'Неверный пароль.', 401);
  }

  await clearFailedAttempts(env, 'login');
  const { token, expiresAt } = await createSession(env);
  return json(
    { ok: true },
    200,
    { 'Set-Cookie': [sessionCookie(token, expiresAt), csrfCookie()] }
  );
});
