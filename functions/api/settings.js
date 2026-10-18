// GET /api/settings — настройки пользователя (тема интерфейса, главный курс, планер).
import { json, handle, requireAuth } from '../lib/common.js';

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAuth(env, request);
  const rows = await env.DB.prepare('SELECT key, value FROM user_settings').all();
  const out = { theme: 'system', primaryCourseId: '', plannerHideDone: false };
  for (const r of rows.results || []) {
    if (!(r.key in out)) continue;
    let v;
    try { v = JSON.parse(r.value); } catch (e) { continue; }
    if (r.key === 'primaryCourseId' && !uuidRe.test(String(v || ''))) v = '';
    out[r.key] = v;
  }
  return json(out);
});
