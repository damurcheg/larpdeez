import {
  json, err, handle, getSetting, createPasswordRecord,
  createSession, sessionCookie, csrfCookie, checkRateLimit, recordFailedAttempt, readJson,
} from '../lib/common.js';

// POST /api/setup — первоначальная настройка пароля (один раз, пока пароль не задан).
// Защита от гонки: INSERT ... ON CONFLICT DO NOTHING — первый запрос записывает хеш,
// второй не может его перезаписать. После этого проверяем, что записан именно наш хеш.
export const onRequestPost = handle(async ({ request, env }) => {
  const limited = await checkRateLimit(env, 'setup');
  if (limited) return limited;

  const body = await readJson(request);
  const password = body.password;
  const confirm = body.confirm;
  if (typeof password !== 'string' || password !== confirm) {
    return err('password-mismatch', 'Пароли в обоих полях должны совпадать.');
  }

  let record;
  try {
    record = await createPasswordRecord(password); // проверка длины внутри
  } catch (e) {
    if (e.message === 'password-too-short') return err('password-too-short', 'Пароль должен быть не короче 8 символов.');
    if (e.message === 'password-too-long') return err('password-too-long', 'Пароль слишком длинный (максимум 200 символов).');
    throw e;
  }

  // Атомарная запись: если строка с паролем уже есть — ничего не меняем.
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('password_hash', ?) ON CONFLICT(key) DO NOTHING")
    .bind(record).run();

  const stored = await getSetting(env, 'password_hash');
  if (stored !== record) {
    // Пароль уже был установлен другим запросом/устройством — не перезаписываем его.
    await recordFailedAttempt(env, 'setup');
    return err('already-configured', 'Пароль уже установлен. Повторная настройка невозможна.', 409);
  }

  // Имя профиля задаём сразу (необязательно), чтобы в кабинете было обращение.
  const name = typeof body.name === 'string' ? body.name.slice(0, 100) : '';
  if (name) {
    await env.DB.prepare('UPDATE profile SET name = ? WHERE id = 1').bind(name).run();
  }

  // Создаём сессию — пользователь сразу попадает в личный кабинет.
  const { token, expiresAt } = await createSession(env);
  return json(
    { ok: true },
    200,
    { 'Set-Cookie': [sessionCookie(token, expiresAt), csrfCookie()] }
  );
});
