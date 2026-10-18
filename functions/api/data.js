import { json, err, handle, requireAuth, checkCsrf, readJson } from '../lib/common.js';

// GET /api/data — экспорт всех данных пользователя (курсы, материалы, прогресс, профиль).
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAuth(env, request);

  const profile = await env.DB.prepare('SELECT name, avatar_emoji, about FROM profile WHERE id = 1').first();
  const courses = await env.DB.prepare('SELECT id, title, description, color, emoji, created_at, updated_at FROM courses ORDER BY created_at DESC').all();
  const materials = await env.DB.prepare('SELECT id, course_id, kind, title, content, position FROM materials ORDER BY course_id, position').all();
  const progress = await env.DB.prepare('SELECT material_id, done, done_at FROM progress').all();

  return json({
    app: 'larpdeez',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: {
      name: (profile && profile.name) || '',
      avatarEmoji: (profile && profile.avatar_emoji) || '🎓',
      about: (profile && profile.about) || '',
    },
    courses: (courses.results || []).map((c) => ({
      id: c.id, title: c.title, description: c.description, color: c.color, emoji: c.emoji,
      createdAt: Number(c.created_at), updatedAt: Number(c.updated_at),
    })),
    materials: (materials.results || []).map((m) => ({
      id: m.id, courseId: m.course_id, kind: m.kind, title: m.title, content: m.content, position: Number(m.position),
    })),
    progress: (progress.results || []).map((p) => ({
      materialId: p.material_id, done: !!Number(p.done), doneAt: p.done_at == null ? null : Number(p.done_at),
    })),
  });
});

// POST /api/data — импорт данных из файла экспорта.
// Полностью заменяет курсы/материалы/прогресс; пароль и сессии НЕ трогает.
export const onRequestPost = handle(async ({ request, env }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');

  const body = await readJson(request);
  if (!body || body.app !== 'larpdeez' || !Array.isArray(body.courses)) {
    return err('bad-file', 'Файл не похож на экспорт Larpdeez. Используйте файл, полученный через «Экспорт данных».');
  }

  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.floor(v) : 0);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Записи с неизвестным id генерируем сами, чтобы не тащить чужие строки в первичные ключи.
  const courses = [];
  for (const c of body.courses.slice(0, 500)) {
    const title = str(c.title, 200).trim();
    if (!title) continue;
    courses.push({
      id: (typeof c.id === 'string' && uuidRe.test(c.id)) ? c.id : crypto.randomUUID(),
      title, description: str(c.description, 2000), color: str(c.color, 32) || '#6c5ce7',
      emoji: str(c.emoji, 8) || '📘', createdAt: num(c.createdAt) || Date.now(), updatedAt: num(c.updatedAt) || Date.now(),
    });
  }
  const courseIds = new Set(courses.map((c) => c.id));

  const materials = [];
  for (const m of (Array.isArray(body.materials) ? body.materials : []).slice(0, 5000)) {
    if (!courseIds.has(m.courseId)) continue;
    const title = str(m.title, 300).trim();
    if (!title) continue;
    materials.push({
      id: (typeof m.id === 'string' && uuidRe.test(m.id)) ? m.id : crypto.randomUUID(),
      courseId: m.courseId, kind: m.kind === 'task' ? 'task' : 'lesson',
      title, content: str(m.content, 100000), position: num(m.position),
    });
  }
  const materialIds = new Set(materials.map((m) => m.id));

  const progress = [];
  for (const p of (Array.isArray(body.progress) ? body.progress : []).slice(0, 5000)) {
    if (!materialIds.has(p.materialId)) continue;
    progress.push({ materialId: p.materialId, done: !!p.done, doneAt: num(p.doneAt) || null });
  }

  // Заменяем данные курсами из файла (в одной батч-транзакции — атомарно).
  const stmts = [
    env.DB.prepare('DELETE FROM progress'),
    env.DB.prepare('DELETE FROM materials'),
    env.DB.prepare('DELETE FROM courses'),
  ];
  for (const c of courses) {
    stmts.push(env.DB.prepare('INSERT INTO courses (id, title, description, color, emoji, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(c.id, c.title, c.description, c.color, c.emoji, c.createdAt, c.updatedAt));
  }
  for (const m of materials) {
    stmts.push(env.DB.prepare('INSERT INTO materials (id, course_id, kind, title, content, position) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(m.id, m.courseId, m.kind, m.title, m.content, m.position));
  }
  for (const p of progress) {
    if (p.done) {
      stmts.push(env.DB.prepare('INSERT INTO progress (material_id, done, done_at) VALUES (?, 1, ?)').bind(p.materialId, p.doneAt || Date.now()));
    }
  }
  if (stmts.length > 3) {
    await env.DB.batch(stmts);
  } else {
    await env.DB.batch(stmts); // пустой импорт: просто очищаем данные
  }

  const pr = body.profile || {};
  const name = str(pr.name, 100);
  const emoji = str(pr.avatarEmoji, 8) || '🎓';
  const about = str(pr.about, 2000);
  await env.DB.prepare('UPDATE profile SET name = ?, avatar_emoji = ?, about = ? WHERE id = 1').bind(name, emoji, about).run();

  return json({ ok: true, courses: courses.length, materials: materials.length });
});
