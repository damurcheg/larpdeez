import { json, err, handle, requireAuth, checkCsrf, readJson } from '../../../../../lib/common.js';

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findMaterial(env, courseId, materialId) {
  return env.DB.prepare('SELECT id, course_id FROM materials WHERE id = ? AND course_id = ?')
    .bind(materialId, courseId).first();
}

// PUT — изменить название/тип/содержимое материала.
export const onRequestPut = handle(async ({ request, env, params }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');
  const { courseId, materialId } = params;
  if (!uuidRe.test(courseId) || !uuidRe.test(materialId)) return err('bad-request', 'Некорректный id.');
  const material = await findMaterial(env, courseId, materialId);
  if (!material) return err('not-found', 'Материал не найден.', 404);

  const body = await readJson(request);
  const title = typeof body.title === 'string' ? body.title.slice(0, 300).trim() : '';
  if (!title) return err('bad-request', 'Название не может быть пустым.');
  const kind = body.kind === 'task' ? 'task' : 'lesson';
  const content = typeof body.content === 'string' ? body.content.slice(0, 100000) : '';

  await env.DB.prepare('UPDATE materials SET title = ?, kind = ?, content = ? WHERE id = ?')
    .bind(title, kind, content, materialId).run();
  await env.DB.prepare('UPDATE courses SET updated_at = ? WHERE id = ?').bind(Date.now(), courseId).run();
  return json({ ok: true });
});

// DELETE — удалить материал и его прогресс (атомарно).
export const onRequestDelete = handle(async ({ request, env, params }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');
  const { courseId, materialId } = params;
  if (!uuidRe.test(courseId) || !uuidRe.test(materialId)) return err('bad-request', 'Некорректный id.');
  const material = await findMaterial(env, courseId, materialId);
  if (!material) return err('not-found', 'Материал не найден.', 404);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM progress WHERE material_id = ?').bind(materialId),
    env.DB.prepare('DELETE FROM materials WHERE id = ?').bind(materialId),
    env.DB.prepare('UPDATE courses SET updated_at = ? WHERE id = ?').bind(Date.now(), courseId),
  ]);
  return json({ ok: true });
});
