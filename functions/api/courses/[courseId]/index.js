import { json, err, handle, requireAuth, checkCsrf, readJson } from '../../../lib/common.js';

const hexColorRe = /^#[0-9a-fA-F]{6}$/;
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanString(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
function cleanColor(v, fallback) {
  const s = cleanString(v, 32).trim().toLowerCase();
  return hexColorRe.test(s) ? s : fallback;
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
      color: cleanColor(course.color, '#007AFF'),
      emoji: course.emoji || 'book',
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

// PUT /api/courses/:id — изменить название/описание/цвет курса.
// body.setPrimary === true — сделать курс главным; === false — снять статус главного.
export const onRequestPut = handle(async ({ request, env, params }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');
  if (!uuidRe.test(params.courseId)) return err('bad-request', 'Некорректный id курса.');
  const body = await readJson(request);
  const title = cleanString(body.title, 200).trim();
  if (!title) return err('bad-request', 'Название курса не может быть пустым.');

  const stmts = [env.DB.prepare(
    'UPDATE courses SET title = ?, description = ?, color = ?, emoji = ?, updated_at = ? WHERE id = ?'
  ).bind(
    title,
    cleanString(body.description, 2000),
    cleanColor(body.color, '#007AFF'),
    cleanString(body.emoji, 8) || 'book',
    Date.now(),
    params.courseId
  )];

  if (body.setPrimary === true) {
    stmts.push(env.DB.prepare(
      "INSERT INTO user_settings (key, value) VALUES ('primaryCourseId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).bind(JSON.stringify(params.courseId)));
  } else if (body.setPrimary === false) {
    stmts.push(env.DB.prepare(
      "DELETE FROM user_settings WHERE key = 'primaryCourseId'"
    ));
  }

  const results = await env.DB.batch(stmts);
  const meta = (results[0] && results[0].meta) || {};
  if (!meta.changes) {
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

// DELETE /api/courses/:id — удалить курс и всё его содержимое.
// Удаляются и старые материалы, и новая иерархия (модули каскадно тянут
// дисциплины → темы → задания, плюс финальные проекты). Если удалённый курс
// был главным — настройка сбрасывается.
export const onRequestDelete = handle(async ({ request, env, params }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');
  if (!uuidRe.test(params.courseId)) return err('bad-request', 'Некорректный id курса.');

  const stmts = [
    // Явная очистка на случай, если PRAGMA foreign_keys выключен (D1 по умолчанию).
    env.DB.prepare(`DELETE FROM assignments WHERE topic_id IN (
        SELECT t.id FROM topics t JOIN disciplines d ON d.id = t.discipline_id
        JOIN modules mo ON mo.id = d.module_id WHERE mo.course_id = ?)`).bind(params.courseId),
    env.DB.prepare(`DELETE FROM topics WHERE discipline_id IN (
        SELECT d.id FROM disciplines d JOIN modules mo ON mo.id = d.module_id WHERE mo.course_id = ?)`).bind(params.courseId),
    env.DB.prepare(`DELETE FROM final_projects WHERE module_id IN (
        SELECT id FROM modules WHERE course_id = ?)`).bind(params.courseId),
    env.DB.prepare(`DELETE FROM disciplines WHERE module_id IN (
        SELECT id FROM modules WHERE course_id = ?)`).bind(params.courseId),
    env.DB.prepare('DELETE FROM modules WHERE course_id = ?').bind(params.courseId),
    env.DB.prepare('DELETE FROM progress WHERE material_id IN (SELECT id FROM materials WHERE course_id = ?)').bind(params.courseId),
    env.DB.prepare('DELETE FROM materials WHERE course_id = ?').bind(params.courseId),
    env.DB.prepare('DELETE FROM courses WHERE id = ?').bind(params.courseId),
    env.DB.prepare("DELETE FROM user_settings WHERE key = 'primaryCourseId' AND value = ?").bind(JSON.stringify(params.courseId)),
  ];
  const results = await env.DB.batch(stmts);
  const delMeta = (results[7] && results[7].meta) || {};
  if (!delMeta.changes) return err('not-found', 'Курс не найден.', 404);
  return json({ ok: true });
});
