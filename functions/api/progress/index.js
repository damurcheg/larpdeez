import { json, err, handle, requireAuth, checkCsrf, readJson } from '../../../lib/common.js';

// POST /api/progress — отметить материал пройденным или снять отметку.
export const onRequestPost = handle(async ({ request, env }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');

  const body = await readJson(request);
  const materialId = typeof body.materialId === 'string' ? body.materialId : '';
  const done = !!body.done;
  if (!materialId) return err('bad-request', 'Не передан materialId.');

  const m = await env.DB.prepare('SELECT id FROM materials WHERE id = ?').bind(materialId).first();
  if (!m) return err('not-found', 'Материал не найден.', 404);

  if (done) {
    await env.DB.prepare(
      'INSERT INTO progress (material_id, done, done_at) VALUES (?, 1, ?) ON CONFLICT(material_id) DO UPDATE SET done = 1, done_at = excluded.done_at'
    ).bind(materialId, Date.now()).run();
  } else {
    await env.DB.prepare('UPDATE progress SET done = 0, done_at = NULL WHERE material_id = ?').bind(materialId).run();
  }
  return json({ ok: true });
});
