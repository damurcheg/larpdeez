import { json, err, handle, requireAuth, checkCsrf, readJson } from '../../lib/common.js';

// Курсы + прогресс по ним. Прогресс считается по материалам курса:
// doneMaterials / totalMaterials.

async function coursesWithProgress(env) {
  const rows = await env.DB.prepare(`
    SELECT c.id, c.title, c.description, c.color, c.emoji, c.created_at, c.updated_at,
           COUNT(m.id) AS total_materials,
           SUM(CASE WHEN p.done = 1 THEN 1 ELSE 0 END) AS done_materials
    FROM courses c
    LEFT JOIN materials m ON m.course_id = c.id
    LEFT JOIN progress p ON p.material_id = m.id
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `).all();
  return (rows.results || []).map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description || '',
    color: c.color || '#6c5ce7',
    emoji: c.emoji || '📘',
    createdAt: Number(c.created_at),
    updatedAt: Number(c.updated_at),
    totalMaterials: Number(c.total_materials) || 0,
    doneMaterials: Number(c.done_materials) || 0,
  }));
}

function cleanString(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

// GET /api/courses — список курсов с прогрессом.
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAuth(env, request);
  return json({ courses: await coursesWithProgress(env) });
});

// POST /api/courses — создать курс.
export const onRequestPost = handle(async ({ request, env }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');
  const body = await readJson(request);
  const title = cleanString(body.title, 200).trim();
  if (!title) return err('bad-request', 'Название курса не может быть пустым.');

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO courses (id, title, description, color, emoji, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    title,
    cleanString(body.description, 2000),
    cleanString(body.color, 32) || '#6c5ce7',
    cleanString(body.emoji, 8) || '📘',
    now,
    now
  ).run();

  return json({ ok: true, id });
});
