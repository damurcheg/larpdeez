import { json, err, handle, requireAuth, checkCsrf, readJson } from '../../../lib/common.js';

function cleanString(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

// GET /api/courses/:id — курс вместе со списком материалов и прогрессом.
export const onRequestGet = handle(async ({ request, env, params }) => {
  await requireAuth(env, request);
  const courseId = params.courseId;

  const course = await env.DB.prepare(
    'SELECT id, title, description, color, emoji FROM courses WHERE id = ?'
  ).bind(courseId).first();
  if (!course) return err('not-found', 'Курс не найден.', 404);

  const materials = await env.DB.prepare(`
    SELECT m.id, m.kind, m.title, m.content, m.position,
           COALESCE(p.done, 0) AS done, p.done_at
    FROM materials m
    LEFT JOIN progress p ON p.material_id = m.id
    WHERE m.course_id = ?
    ORDER BY m.position ASC, m.rowid ASC
  `).bind(courseId).all();

  return json({
    course: {
      id: course.id,
      title: course.title,
      description: course.description || '',
      color: course.color || '#6c5ce7',
      emoji: course.emoji || '📘',
    },
    materials: (materials.results || []).map((m) => ({
      id: m.id,
      kind: m.kind,
      title: m.title,
      content: m.content || '',
      position: Number(m.position),
      done: !!Number(m.done),
    })),
  });
});

// PUT /api/courses/:id — изменить название/описание/цвет/эмодзи курса.
export const onRequestPut = handle(async ({ request, env, params }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');
  const body = await readJson(request);
  const title = cleanString(body.title, 200).trim();
  if (!title) return err('bad-request', 'Название курса не может быть пустым.');

  const res = await env.DB.prepare(
    'UPDATE courses SET title = ?, description = ?, color = ?, emoji = ?, updated_at = ? WHERE id = ?'
  ).bind(
    title,
    cleanString(body.description, 2000),
    cleanString(body.color, 32) || '#6c5ce7',
    cleanString(body.emoji, 8) || '📘',
    Date.now(),
    params.courseId
  ).run();

  const meta = (res && res.meta) || {};
  if (!meta.changes) {
    // Проверим, существует ли курс вообще (changes=0 бывает и при таких же значениях).
    const exists = await env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(params.courseId).first();
    if (!exists) return err('not-found', 'Курс не найден.', 404);
  }
  return json({ ok: true });
});

// POST /api/courses/:id/materials — добавить материал (урок или задание) в курс.
export const onRequestPost = handle(async ({ request, env, params }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');
  const body = await readJson(request);
  const title = cleanString(body.title, 300).trim();
  if (!title) return err('bad-request', 'Название материала не может быть пустым.');
  const kind = body.kind === 'task' ? 'task' : 'lesson';

  const course = await env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(params.courseId).first();
  if (!course) return err('not-found', 'Курс не найден.', 404);

  const id = crypto.randomUUID();
  const posRow = await env.DB.prepare('SELECT COALESCE(MAX(position), 0) AS maxpos FROM materials WHERE course_id = ?')
    .bind(params.courseId).first();
  const position = Number(posRow && posRow.maxpos || 0) + 1;

  await env.DB.prepare(
    'INSERT INTO materials (id, course_id, kind, title, content, position) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, params.courseId, kind, title, cleanString(body.content, 100000), position).run();

  await env.DB.prepare('UPDATE courses SET updated_at = ? WHERE id = ?').bind(Date.now(), params.courseId).run();
  return json({ ok: true, id });
});

// DELETE /api/courses/:id — удалить курс и всё его содержимое (материалы, прогресс — через ON DELETE CASCADE).
export const onRequestDelete = handle(async ({ request, env, params }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');

  await env.DB.prepare('DELETE FROM progress WHERE material_id IN (SELECT id FROM materials WHERE course_id = ?)')
    .bind(params.courseId).run();
  await env.DB.prepare('DELETE FROM materials WHERE course_id = ?').bind(params.courseId).run();
  const res = await env.DB.prepare('DELETE FROM courses WHERE id = ?').bind(params.courseId).run();

  const meta = (res && res.meta) || {};
  if (!meta.changes) return err('not-found', 'Курс не найден.', 404);
  return json({ ok: true });
});
