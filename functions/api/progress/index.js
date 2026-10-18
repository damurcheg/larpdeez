import { json, err, handle, requireAuth, checkCsrf, readJson } from '../../../lib/common.js';

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/progress — отметить материал выполненным или нет.
// Тело: { materialId, done }. Сохраняется в D1 (источник истины).
export const onRequestPost = handle(async ({ request, env }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');

  const body = await readJson(request);
  const id = body.materialId;
  if (typeof id !== 'string' || !uuidRe.test(id)) return err('bad-request', 'Некорректный id материала.');
  const done = !!body.done;

  const material = await env.DB.prepare('SELECT id FROM materials WHERE id = ?').bind(id).first();
  if (!material) return err('not-found', 'Материал не найден.', 404);

  if (done) {
    await env.DB.prepare(
      'INSERT INTO progress (material_id, done, done_at) VALUES (?, 1, ?) ON CONFLICT(material_id) DO UPDATE SET done = 1, done_at = excluded.done_at'
    ).bind(id, Date.now()).run();
  } else {
    await env.DB.prepare('DELETE FROM progress WHERE material_id = ?').bind(id).run();
  }
  return json({ ok: true, done });
});
