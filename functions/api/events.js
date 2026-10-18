// API календаря: пользовательские события + даты тем и финальных проектов.
import { json, err, handle, requireAuth, checkCsrf, readJson } from '../lib/common.js';

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateRe = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const hexColorRe = /^#[0-9a-fA-F]{6}$/;
const ICONS = new Set(['calendar', 'flag', 'star', 'book', 'target', 'trophy', 'code', 'palette', 'music', 'pen', 'flask', 'clipboard', 'clock', 'bell']);

function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAuth(env, request);

  const events = await env.DB.prepare(
    'SELECT id, title, description, date, time, icon, color FROM events ORDER BY date ASC, time ASC'
  ).all();

  // Даты тем автоматически попадают в календарь из редакторов тем.
  const topics = await env.DB.prepare(`
    SELECT t.id, t.title, t.done, t.date,
           c.id AS course_id, c.title AS course_title, c.color AS course_color,
           m.id AS module_id, m.title AS module_title,
           d.id AS discipline_id, d.title AS discipline_title
    FROM topics t
    JOIN disciplines d ON d.id = t.discipline_id
    JOIN modules m ON m.id = d.module_id
    JOIN courses c ON c.id = m.course_id
    WHERE t.date != ''
    ORDER BY t.date ASC
  `).all();

  // Сроки сдачи финальных проектов.
  const finals = await env.DB.prepare(`
    SELECT fp.id, fp.title, fp.status, fp.due_date AS date, fp.grade,
           m.id AS module_id, m.title AS module_title,
           c.id AS course_id, c.title AS course_title, c.color AS course_color
    FROM final_projects fp
    JOIN modules m ON m.id = fp.module_id
    JOIN courses c ON c.id = m.course_id
    WHERE fp.due_date != '' AND m.final_enabled = 1
    ORDER BY fp.due_date ASC
  `).all();

  return json({
    events: (events.results || []).map((e) => ({
      id: e.id, title: e.title, description: e.description || '', date: e.date,
      time: e.time || '', icon: e.icon || 'calendar', color: e.color || '#007AFF',
    })),
    topics: (topics.results || []).map((t) => ({
      id: t.id, title: t.title, done: !!Number(t.done), date: t.date,
      courseId: t.course_id, courseTitle: t.course_title, courseColor: t.course_color,
      moduleId: t.module_id, moduleTitle: t.module_title,
      disciplineId: t.discipline_id, disciplineTitle: t.discipline_title,
    })),
    finals: (finals.results || []).map((f) => ({
      id: f.id, title: f.title, status: f.status, date: f.date,
      grade: f.grade == null ? null : Number(f.grade),
      courseId: f.course_id, courseTitle: f.course_title, courseColor: f.course_color,
      moduleId: f.module_id, moduleTitle: f.module_title,
    })),
  });
});

// POST — создать событие. PUT — изменить. DELETE /api/events?id= — удалить.
export const onRequestPost = handle(async ({ request, env }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');
  const body = await readJson(request);
  const title = str(body.title, 200).trim();
  if (!title) return err('bad-request', 'Название события обязательно.');
  const date = str(body.date, 10).trim();
  if (!dateRe.test(date)) return err('bad-request', 'Некорректная дата события.');
  const time = str(body.time, 5).trim();
  const color = str(body.color, 32).toLowerCase();
  const icon = ICONS.has(str(body.icon, 20)) ? str(body.icon, 20) : 'calendar';
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO events (id, title, description, date, time, icon, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, title, str(body.description, 2000), date, timeRe.test(time) ? time : '',
    icon, hexColorRe.test(color) ? color : '#007aff', now, now).run();
  return json({ ok: true, id });
});

export const onRequestPut = handle(async ({ request, env }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');
  const body = await readJson(request);
  const id = str(body.id, 64);
  if (!uuidRe.test(id)) return err('bad-request', 'Некорректный id.');
  const title = str(body.title, 200).trim();
  if (!title) return err('bad-request', 'Название события обязательно.');
  const date = str(body.date, 10).trim();
  if (!dateRe.test(date)) return err('bad-request', 'Некорректная дата события.');
  const time = str(body.time, 5).trim();
  const color = str(body.color, 32).toLowerCase();
  const icon = ICONS.has(str(body.icon, 20)) ? str(body.icon, 20) : 'calendar';
  const res = await env.DB.prepare(
    'UPDATE events SET title=?, description=?, date=?, time=?, icon=?, color=?, updated_at=? WHERE id=?'
  ).bind(title, str(body.description, 2000), date, timeRe.test(time) ? time : '',
    icon, hexColorRe.test(color) ? color : '#007aff', Date.now(), id).run();
  if (!((res && res.meta) || {}).changes) {
    const exists = await env.DB.prepare('SELECT id FROM events WHERE id=?').bind(id).first();
    if (!exists) return err('not-found', 'Событие не найдено.', 404);
  }
  return json({ ok: true });
});

export const onRequestDelete = handle(async ({ request, env }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!uuidRe.test(id)) return err('bad-request', 'Некорректный id.');
  const res = await env.DB.prepare('DELETE FROM events WHERE id=?').bind(id).run();
  if (!((res && res.meta) || {}).changes) return err('not-found', 'Событие не найдено.', 404);
  return json({ ok: true });
});
