import { json, err, handle } from '../lib/common.js';

// GET /api/setup-status — можно ли ещё выполнить первоначальную настройку пароля.
// Ответ публичный: только true/false, никаких секретов.
export const onRequestGet = handle(async ({ env }) => {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'password_hash'").first();
  const configured = !!(row && row.value);
  return json({ configured });
});
