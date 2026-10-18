import { json, err, handle, requireAuth, checkCsrf, readJson } from '../../../../../lib/common.js';

function cleanString(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

async function findMaterial(env, courseId, materialId) {
  return env.DB.prepare('SELECT id, course_id FROM materials WHERE id = ? AND course_id = ?')
    .bind(materialId, courseId).first();
}

// PUT /api/courses/:cid/materials/:mid — изменить материал (заголовок, тип, текст).
export const onRequestPut = handle(async ({ request, env, params }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');

  const m = await findMaterial(env, params.courseId, params.materialId);
  if (!m) return err('not-found', 'Материал не найден.', 404);

  const body = await readJson(request);
  const title = cleanString(body.title, 300).trim();
  if (!title) return err('bad-request', 'Название материала не может быть пустым.');
  const kind = body.kind === 'task' ? 'task' : 'lesson';

  await env.DB.prepare('UPDATE materials SET title = ?, kind = ?, content = ? WHERE id = ?')
    .bind(title, kind, cleanString(body.content, 100000), params.materialId).run();
  await env.DB.prepare('UPDATE courses SET updated_at = ? WHERE id = ?').bind(Date.now(), params.courseId).run();
  return json({ ok: true });
});

// DELETE /api/courses/:cid/materials/:mid — удалить материал и его прогресс.
export const onRequestDelete = handle(async ({ request, env, params }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');

  const m = await findMaterial(env, params.courseId, params.materialId);
  if (!m) return err('not-found', 'Материал не найден.', 404);

  await env.DB.prepare('DELETE FROM progress WHERE material_id = ?').bind(params.materialId).run();
  await env.DB.prepare('DELETE FROM materials WHERE id = ?').bind(params.materialId).run();
  await env.DB.prepare('UPDATE courses SET updated_at = ? WHERE id = ?').bind(Date.now(), params.courseId).run();
  return json({ ok: true });
});
