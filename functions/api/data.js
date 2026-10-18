import { json, err, handle, requireAuth, checkCsrf, readJson } from '../lib/common.js';

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/data — экспорт всех данных пользователя.
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAuth(env, request);

  const profile = await env.DB.prepare('SELECT name, avatar_emoji, about, avatar_image, banner FROM profile WHERE id = 1').first();
  const courses = await env.DB.prepare('SELECT id, title, description, color, emoji, created_at, updated_at FROM courses ORDER BY created_at DESC').all();
  const materials = await env.DB.prepare('SELECT id, course_id, kind, title, content, position FROM materials ORDER BY course_id, position').all();
  const progress = await env.DB.prepare('SELECT material_id, done, done_at FROM progress').all();
  const modules = await env.DB.prepare('SELECT * FROM modules ORDER BY course_id, position').all();
  const disciplines = await env.DB.prepare('SELECT * FROM disciplines ORDER BY module_id, position').all();
  const topics = await env.DB.prepare('SELECT * FROM topics ORDER BY discipline_id, position').all();
  const assignments = await env.DB.prepare('SELECT * FROM assignments ORDER BY topic_id, position').all();
  const finals = await env.DB.prepare('SELECT * FROM final_projects').all();
  const events = await env.DB.prepare('SELECT * FROM events ORDER BY date').all();
  const settings = await env.DB.prepare('SELECT key, value FROM user_settings').all();

  const outSettings = {};
  for (const s of settings.results || []) { try { outSettings[s.key] = JSON.parse(s.value); } catch (e) {} }

  return json({
    app: 'larpdeez',
    version: 2,
    exportedAt: new Date().toISOString(),
    profile: {
      name: (profile && profile.name) || '',
      avatarEmoji: (profile && profile.avatar_emoji) || '🎓',
      about: (profile && profile.about) || '',
      avatarImage: (profile && profile.avatar_image) || '',
      banner: (profile && profile.banner) || 'gradient-1',
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
    modules: (modules.results || []).map((m) => ({
      id: m.id, courseId: m.course_id, title: m.title, description: m.description, color: m.color,
      tags: safeParse(m.tags, []), position: Number(m.position), finalEnabled: !!Number(m.final_enabled),
      createdAt: Number(m.created_at), updatedAt: Number(m.updated_at),
    })),
    disciplines: (disciplines.results || []).map((d) => ({
      id: d.id, moduleId: d.module_id, title: d.title, description: d.description, color: d.color, position: Number(d.position),
    })),
    topics: (topics.results || []).map((t) => ({
      id: t.id, disciplineId: t.discipline_id, title: t.title, content: t.content, date: t.date,
      links: safeParse(t.links, []), color: t.color, done: !!Number(t.done),
      doneAt: t.done_at == null ? null : Number(t.done_at), position: Number(t.position),
    })),
    assignments: (assignments.results || []).map((a) => ({
      id: a.id, topicId: a.topic_id, title: a.title, description: a.description,
      criteria: safeParse(a.criteria, []), done: !!Number(a.done), grade: a.grade == null ? null : Number(a.grade),
      color: a.color, position: Number(a.position),
    })),
    finalProjects: (finals.results || []).map((f) => ({
      id: f.id, moduleId: f.module_id, title: f.title, description: f.description, dueDate: f.due_date,
      icon: f.icon, criteria: safeParse(f.criteria, []), links: safeParse(f.links, []), status: f.status,
      grade: f.grade == null ? null : Number(f.grade),
    })),
    events: (events.results || []).map((e) => ({
      id: e.id, title: e.title, description: e.description, date: e.date, time: e.time, icon: e.icon, color: e.color,
    })),
    settings: outSettings,
  });
});

function safeParse(text, fallback) { try { const v = JSON.parse(text); return v == null ? fallback : v; } catch (e) { return fallback; } }

// POST /api/data — импорт данных из файла экспорта (версии 1 и 2).
// Полностью заменяет курсы и связанный контент; пароль и сессии НЕ трогает.
export const onRequestPost = handle(async ({ request, env }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');

  const body = await readJson(request);
  if (!body || body.app !== 'larpdeez' || !Array.isArray(body.courses)) {
    return err('bad-file', 'Файл не похож на экспорт Larpdeez. Используйте файл, полученный через «Экспорт данных».');
  }

  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.floor(v) : 0);
  const arr = (v) => (Array.isArray(v) ? JSON.stringify(v).slice(0, 200000) : '[]');
  const okId = (v) => (typeof v === 'string' && uuidRe.test(v));

  const courses = [];
  for (const c of body.courses.slice(0, 500)) {
    const title = str(c.title, 200).trim();
    if (!title) continue;
    courses.push({
      id: okId(c.id) ? c.id : crypto.randomUUID(),
      title, description: str(c.description, 2000), color: str(c.color, 32) || '#007AFF',
      emoji: str(c.emoji, 8) || 'book', createdAt: num(c.createdAt) || Date.now(), updatedAt: num(c.updatedAt) || Date.now(),
    });
  }
  const courseIds = new Set(courses.map((c) => c.id));

  const materials = [];
  for (const m of (Array.isArray(body.materials) ? body.materials : []).slice(0, 5000)) {
    if (!courseIds.has(m.courseId)) continue;
    const title = str(m.title, 300).trim();
    if (!title) continue;
    materials.push({
      id: okId(m.id) ? m.id : crypto.randomUUID(),
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

  // Новая иерархия (version 2)
  const modules = [];
  for (const m of (Array.isArray(body.modules) ? body.modules : []).slice(0, 2000)) {
    const title = str(m.title, 200).trim();
    if (!title || !courseIds.has(m.courseId)) continue;
    modules.push({
      id: okId(m.id) ? m.id : crypto.randomUUID(), courseId: m.courseId, title,
      description: str(m.description, 2000), color: str(m.color, 32), tags: arr(m.tags),
      position: num(m.position), finalEnabled: m.finalEnabled ? 1 : 0,
      createdAt: num(m.createdAt) || Date.now(), updatedAt: num(m.updatedAt) || Date.now(),
    });
  }
  const moduleIds = new Set(modules.map((x) => x.id));

  const disciplines = [];
  for (const d of (Array.isArray(body.disciplines) ? body.disciplines : []).slice(0, 5000)) {
    const title = str(d.title, 200).trim();
    if (!title || !moduleIds.has(d.moduleId)) continue;
    disciplines.push({
      id: okId(d.id) ? d.id : crypto.randomUUID(), moduleId: d.moduleId, title,
      description: str(d.description, 2000), color: str(d.color, 32), position: num(d.position),
      createdAt: Date.now(), updatedAt: Date.now(),
    });
  }
  const discIds = new Set(disciplines.map((x) => x.id));

  const topics = [];
  for (const t of (Array.isArray(body.topics) ? body.topics : []).slice(0, 10000)) {
    const title = str(t.title, 300).trim();
    if (!title || !discIds.has(t.disciplineId)) continue;
    topics.push({
      id: okId(t.id) ? t.id : crypto.randomUUID(), disciplineId: t.disciplineId, title,
      content: str(t.content, 100000), date: /^\d{4}-\d{2}-\d{2}$/.test(String(t.date || '')) ? t.date : '',
      links: arr(t.links), color: str(t.color, 32), done: t.done ? 1 : 0,
      doneAt: num(t.doneAt) || null, position: num(t.position), createdAt: Date.now(), updatedAt: Date.now(),
    });
  }
  const topicIds = new Set(topics.map((x) => x.id));

  const assignments = [];
  for (const a of (Array.isArray(body.assignments) ? body.assignments : []).slice(0, 10000)) {
    const title = str(a.title, 300).trim();
    if (!title || !topicIds.has(a.topicId)) continue;
    let grade = null;
    if (a.grade != null && a.grade !== '') { const g = Math.round(Number(a.grade)); if (g >= 0 && g <= 100) grade = g; }
    assignments.push({
      id: okId(a.id) ? a.id : crypto.randomUUID(), topicId: a.topicId, title,
      description: str(a.description, 5000), criteria: arr(a.criteria), done: a.done ? 1 : 0,
      grade, color: str(a.color, 32), position: num(a.position), createdAt: Date.now(), updatedAt: Date.now(),
    });
  }

  const finals = [];
  for (const f of (Array.isArray(body.finalProjects) ? body.finalProjects : []).slice(0, 2000)) {
    if (!moduleIds.has(f.moduleId)) continue;
    let grade = null;
    if (f.grade != null && f.grade !== '') { const g = Math.round(Number(f.grade)); if (g >= 0 && g <= 100) grade = g; }
    finals.push({
      id: okId(f.id) ? f.id : crypto.randomUUID(), moduleId: f.moduleId,
      title: str(f.title, 200).trim() || 'Финальный проект', description: str(f.description, 5000),
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(f.dueDate || '')) ? f.dueDate : '',
      icon: str(f.icon, 20) || 'flag', criteria: arr(f.criteria), links: arr(f.links),
      status: ['todo', 'in_progress', 'done'].includes(f.status) ? f.status : 'todo', grade,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
  }

  const events = [];
  for (const e of (Array.isArray(body.events) ? body.events : []).slice(0, 2000)) {
    const title = str(e.title, 200).trim();
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ''))) continue;
    events.push({
      id: okId(e.id) ? e.id : crypto.randomUUID(), title, description: str(e.description, 2000),
      date: e.date, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(e.time || '')) ? e.time : '',
      icon: str(e.icon, 20) || 'calendar', color: str(e.color, 32) || '#007AFF',
      createdAt: Date.now(), updatedAt: Date.now(),
    });
  }

  // Атомарная замена всех данных (одна batch-транзакция).
  const stmts = [
    env.DB.prepare('DELETE FROM assignments'),
    env.DB.prepare('DELETE FROM topics'),
    env.DB.prepare('DELETE FROM disciplines'),
    env.DB.prepare('DELETE FROM final_projects'),
    env.DB.prepare('DELETE FROM modules'),
    env.DB.prepare('DELETE FROM progress'),
    env.DB.prepare('DELETE FROM materials'),
    env.DB.prepare('DELETE FROM courses'),
    env.DB.prepare('DELETE FROM events'),
  ];
  for (const c of courses) stmts.push(env.DB.prepare(
    'INSERT INTO courses (id, title, description, color, emoji, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(c.id, c.title, c.description, c.color, c.emoji, c.createdAt, c.updatedAt));
  for (const m of materials) stmts.push(env.DB.prepare(
    'INSERT INTO materials (id, course_id, kind, title, content, position) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(m.id, m.courseId, m.kind, m.title, m.content, m.position));
  for (const p of progress) if (p.done) stmts.push(env.DB.prepare(
    'INSERT INTO progress (material_id, done, done_at) VALUES (?, 1, ?)').bind(p.materialId, p.doneAt || Date.now()));
  for (const m of modules) stmts.push(env.DB.prepare(
    `INSERT INTO modules (id, course_id, title, description, color, tags, position, final_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(m.id, m.courseId, m.title, m.description, m.color, m.tags, m.position, m.finalEnabled, m.createdAt, m.updatedAt));
  for (const d of disciplines) stmts.push(env.DB.prepare(
    'INSERT INTO disciplines (id, module_id, title, description, color, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(d.id, d.moduleId, d.title, d.description, d.color, d.position, d.createdAt, d.updatedAt));
  for (const t of topics) stmts.push(env.DB.prepare(
    `INSERT INTO topics (id, discipline_id, title, content, date, links, color, done, done_at, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(t.id, t.disciplineId, t.title, t.content, t.date, t.links, t.color, t.done, t.doneAt, t.position, t.createdAt, t.updatedAt));
  for (const a of assignments) stmts.push(env.DB.prepare(
    `INSERT INTO assignments (id, topic_id, title, description, criteria, done, done_at, grade, color, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(a.id, a.topicId, a.title, a.description, a.criteria, a.done, a.done ? Date.now() : null, a.grade, a.color, a.position, a.createdAt, a.updatedAt));
  for (const f of finals) stmts.push(env.DB.prepare(
    `INSERT INTO final_projects (id, module_id, title, description, due_date, icon, criteria, links, status, grade, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(f.id, f.moduleId, f.title, f.description, f.dueDate, f.icon, f.criteria, f.links, f.status, f.grade, f.createdAt, f.updatedAt));
  for (const e of events) stmts.push(env.DB.prepare(
    'INSERT INTO events (id, title, description, date, time, icon, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(e.id, e.title, e.description, e.date, e.time, e.icon, e.color, e.createdAt, e.updatedAt));

  const pr = body.profile || {};
  const name = str(pr.name, 100);
  const emoji = str(pr.avatarEmoji, 8) || '🎓';
  const about = str(pr.about, 2000);
  const avatarImage = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(String(pr.avatarImage || '')) && String(pr.avatarImage).length < 700000 ? pr.avatarImage : '';
  const banner = str(pr.banner, 800000) || 'gradient-1';

  stmts.push(env.DB.prepare('UPDATE profile SET name = ?, avatar_emoji = ?, about = ?, avatar_image = ?, banner = ? WHERE id = 1')
    .bind(name, emoji, about, avatarImage, banner));

  await env.DB.batch(stmts);
  return json({ ok: true, courses: courses.length, materials: materials.length, modules: modules.length, topics: topics.length, events: events.length });
});
