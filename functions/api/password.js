import {
  json, err, handle, requireAuth, getSetting, verifyPassword, createPasswordRecord, readJson,
} from '../lib/common.js';

// POST /api/password — смена пароля. Требует текущий пароль и новый пароль.
export const onRequestPost = handle(async ({ request, env }) => {
  const session = await requireAuth(env, request); // только для вошедших
  const body = await readJson(request);
  const current = body.currentPassword;
  const next = body.newPassword;
  const confirm = body.confirmPassword;

  if (typeof current !== 'string' || typeof next !== 'string') {
    return err('bad-request', 'Заполните все поля.');
  }
  if (next !== confirm) {
    return err('password-mismatch', 'Новый пароль и подтверждение не совпадают.');
  }

  const stored = await getSetting(env, 'password_hash');
  if (!stored) return err('not-configured', 'Пароль ещё не установлен.', 409);

  const ok = await verifyPassword(current, stored);
  if (!ok) return err('bad-password', 'Текущий пароль неверен.', 401);

  let record;
  try {
    record = await createPasswordRecord(next);
  } catch (e) {
    if (e.message === 'password-too-short') return err('password-too-short', 'Новый пароль должен быть не короче 8 символов.');
    if (e.message === 'password-too-long') return err('password-too-long', 'Новый пароль слишком длинный (максимум 200 символов).');
    throw e;
  }

  await env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'password_hash'").bind(record).run();
  return json({ ok: true });
});
