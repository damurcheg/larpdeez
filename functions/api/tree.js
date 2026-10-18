// Единый серверный API иерархии: Курс → Модуль → Дисциплина → Тема → Задание,
// финальные проекты модулей и настройки пользователя (главный курс, тема интерфейса).
// Все данные — в D1. Клиент никогда не считает прогресс и оценки сам.

import { json, err, handle, requireAuth, checkCsrf, readJson } from '../lib/common.js';
import { computeCourseStats, normalizeGrade } from '../lib/stats.js';

// ---------- Валидация ----------
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hexColorRe = /^#[0-9a-fA-F]{6}$/;
const dateRe = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
function color(v) {
  const s = str(v, 32).trim();
  if (!s) return ''; // '' = наследовать цвет родителя
  return hexColorRe.test(s) ? s.toLowerCase() : '';
}
function isoDate(v) { const s = str(v, 10).trim(); return dateRe.test(s) ? s : ''; }
function isoTime(v) { const s = str(v, 5).trim(); return timeRe.test(s) ? s : ''; }

// JSON-массив строк (критерии, теги)
function strArray(v, maxItems, maxLen) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.trim()).slice(0, maxItems).map((x) => x.trim().slice(0, maxLen));
}
// JSON-массив ссылок [{url,label}]
function linkArray(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const l of v.slice(0, 30)) {
    if (!l || typeof l !== 'object') continue;
    const url = str(l.url, 2000).trim();
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ url, label: str(l.label, 200).trim() });
  }
  return out;
}
// Критерии финального проекта [{text,done}]
function critArray(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const c of v.slice(0, 50)) {
    if (typeof c === 'string' && c.trim()) out.push({ text: c.trim().slice(0, 500), done: false });
    else if (c && typeof c === 'object' && typeof c.text === 'string' && c.text.trim()) {
      out.push({ text: c.text.trim().slice(0, 500), done: !!c.done });
    }
  }
  return out;
}
const ICONS = new Set(['flag', 'star', 'book', 'target', 'trophy', 'code', 'palette', 'music', 'pen', 'flask', 'calendar', 'clipboard']);
function icon(v, def) { const s = str(v, 20).trim(); return ICONS.has(s) ? s : def; }
const PROJECT_STATUSES = new Set(['todo', 'in_progress', 'done']);

function parseJson(text, fallback) { try { const v = JSON.parse(text); return v == null ? fallback : v; } catch (e) { return fallback; } }

// Проверка CSRF для всех изменяющих запросов + авторизация.
async function guard(request, env) {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');
  return session;
}

// ---------- GET /api/tree?course=ID — всё дерево курса со статистикой ----------
export async function loadCourseTree(env, courseId) {
  const course = await env.DB.prepare(
    'SELECT id, title, description, color, emoji FROM courses WHERE id = ?'
  ).bind(courseId).first();
  if (!course) return null;

  const modules = await env.DB.prepare(
    'SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC, rowid ASC'
  ).bind(courseId).all();
  const moduleIds = (modules.results || []).map((m) => m.id);

  let disciplines = { results: [] }, finals = { results: [] };
  if (moduleIds.length) {
    const ph = moduleIds.map(() => '?').join(',');
    disciplines = await env.DB.prepare(
      `SELECT * FROM disciplines WHERE module_id IN (${ph}) ORDER BY position ASC, rowid ASC`
    ).bind(...moduleIds).all();
    finals = await env.DB.prepare(
      `SELECT * FROM final_projects WHERE module_id IN (${ph})`
    ).bind(...moduleIds).all();
  }
  const discIds = (disciplines.results || []).map((d) => d.id);
  let topics = { results: [] };
  if (discIds.length) {
    const ph = discIds.map(() => '?').join(',');
    topics = await env.DB.prepare(
      `SELECT * FROM topics WHERE discipline_id IN (${ph}) ORDER BY position ASC, rowid ASC`
    ).bind(...discIds).all();
  }
  const topicIds = (topics.results || []).map((t) => t.id);
  let assignments = { results: [] };
  if (topicIds.length) {
    const ph = topicIds.map(() => '?').join(',');
    assignments = await env.DB.prepare(
      `SELECT * FROM assignments WHERE topic_id IN (${ph}) ORDER BY position ASC, rowid ASC`
    ).bind(...topicIds).all();
  }

  const byParent = (rows, fk) => {
    const map = {};
    for (const r of rows || []) (map[r[fk]] = map[r[fk]] || []).push(r);
    return map;
  };
  const dMap = byParent(disciplines.results, 'module_id');
  const tMap = byParent(topics.results, 'discipline_id');
  const aMap = byParent(assignments.results, 'topic_id');
  const fMap = {};
  for (const f of finals.results || []) fMap[f.module_id] = f;

  const tree = {
    course: {
      id: course.id, title: course.title, description: course.description || '',
      color: course.color || '#007AFF', emoji: course.emoji || 'book',
    },
    modules: (modules.results || []).map((m) => ({
      id: m.id, title: m.title, description: m.description || '', color: m.color || '',
      tags: parseJson(m.tags, []), position: Number(m.position),
      finalEnabled: !!Number(m.final_enabled),
      createdAt: Number(m.created_at), updatedAt: Number(m.updated_at),
      finalProject: fMap[m.id] ? {
        id: fMap[m.id].id, title: fMap[m.id].title, description: fMap[m.id].description || '',
        dueDate: fMap[m.id].due_date || '', icon: fMap[m.id].icon || 'flag',
        criteria: parseJson(fMap[m.id].criteria, []), links: parseJson(fMap[m.id].links, []),
        status: fMap[m.id].status || 'todo',
        grade: fMap[m.id].grade == null ? null : Number(fMap[m.id].grade),
      } : null,
      disciplines: (dMap[m.id] || []).map((d) => ({
        id: d.id, title: d.title, description: d.description || '', color: d.color || '',
        position: Number(d.position),
        topics: (tMap[d.id] || []).map((t) => ({
          id: t.id, title: t.title, content: t.content || '', date: t.date || '',
          links: parseJson(t.links, []), color: t.color || '',
          done: !!Number(t.done), doneAt: t.done_at == null ? null : Number(t.done_at),
          position: Number(t.position),
          assignments: (aMap[t.id] || []).map((a) => ({
            id: a.id, title: a.title, description: a.description || '',
            criteria: parseJson(a.criteria, []),
            done: !!Number(a.done), doneAt: a.done_at == null ? null : Number(a.done_at),
            grade: a.grade == null ? null : Number(a.grade),
            color: a.color || '', position: Number(a.position),
          })),
        })),
      })),
    })),
  };
  tree.stats = computeCourseStats(tree);
  return tree;
}

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAuth(env, request);
  const courseId = new URL(request.url).searchParams.get('course') || '';
  if (!uuidRe.test(courseId)) return err('bad-request', 'Некорректный id курса.');
  const tree = await loadCourseTree(env, courseId);
  if (!tree) return err('not-found', 'Курс не найден.', 404);
  return json(tree);
});

// ---------- PATCH /api/tree — пакетные операции над узлами ----------
// Тело: { ops: [ {op, ...data}, ... ] }. Выполняется через D1 batch (атомарно).
// Поддерживаемые op:
//  module.create/update/delete/reorder, discipline.*, topic.*, assignment.*,
//  final.set/final.enable, settings.set
export const onRequestPatch = handle(async ({ request, env }) => {
  await guard(request, env);
  const body = await readJson(request);
  const ops = Array.isArray(body.ops) ? body.ops.slice(0, 200) : null;
  if (!ops || !ops.length) return err('bad-request', 'Нет операций.');

  const stmts = [];
  const now = Date.now();
  const touchedCourses = new Set();
  let courseIdForTouch = str(body.courseId, 64);
  if (uuidRe.test(courseIdForTouch)) touchedCourses.add(courseIdForTouch);

  const needCourse = (id) => { if (uuidRe.test(id)) touchedCourses.add(id); };

  for (const op of ops) {
    const kind = str(op.op, 30);
    const id = str(op.id, 64);
    if (!['settings.set', 'reorder'].includes(kind) && !uuidRe.test(id)) {
      return err('bad-request', 'Некорректный id: ' + id);
    }

    switch (kind) {
      // ----- Модули -----
      case 'module.create': {
        const title = str(op.title, 200).trim();
        if (!title) return err('bad-request', 'Название модуля обязательно.');
        const cid = str(op.courseId, 64);
        if (!uuidRe.test(cid)) return err('bad-request', 'Некорректный курс.');
        const pos = Number(op.position);
        stmts.push(env.DB.prepare(
          `INSERT INTO modules (id, course_id, title, description, color, tags, position, final_enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, cid, title, str(op.description, 2000), color(op.color),
          JSON.stringify(strArray(op.tags, 6, 40)),
          Number.isFinite(pos) ? pos : 9999, op.finalEnabled ? 1 : 0, now, now));
        needCourse(cid);
        break;
      }
      case 'module.update': {
        const title = str(op.title, 200).trim();
        if (!title) return err('bad-request', 'Название модуля обязательно.');
        stmts.push(env.DB.prepare(
          `UPDATE modules SET title=?, description=?, color=?, tags=?, final_enabled=?, updated_at=? WHERE id=?`
        ).bind(title, str(op.description, 2000), color(op.color),
          JSON.stringify(strArray(op.tags, 6, 40)), op.finalEnabled ? 1 : 0, now, id));
        break;
      }
      case 'module.delete':
        stmts.push(env.DB.prepare('DELETE FROM modules WHERE id=?').bind(id));
        break;

      // ----- Дисциплины -----
      case 'discipline.create': {
        const title = str(op.title, 200).trim();
        if (!title) return err('bad-request', 'Название дисциплины обязательно.');
        const mid = str(op.moduleId, 64);
        if (!uuidRe.test(mid)) return err('bad-request', 'Некорректный модуль.');
        const pos = Number(op.position);
        stmts.push(env.DB.prepare(
          `INSERT INTO disciplines (id, module_id, title, description, color, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, mid, title, str(op.description, 2000), color(op.color),
          Number.isFinite(pos) ? pos : 9999, now, now));
        break;
      }
      case 'discipline.update': {
        const title = str(op.title, 200).trim();
        if (!title) return err('bad-request', 'Название дисциплины обязательно.');
        stmts.push(env.DB.prepare(
          `UPDATE disciplines SET title=?, description=?, color=?, updated_at=? WHERE id=?`
        ).bind(title, str(op.description, 2000), color(op.color), now, id));
        break;
      }
      case 'discipline.delete':
        stmts.push(env.DB.prepare('DELETE FROM disciplines WHERE id=?').bind(id));
        break;

      // ----- Темы -----
      case 'topic.create': {
        const title = str(op.title, 300).trim();
        if (!title) return err('bad-request', 'Название темы обязательно.');
        const did = str(op.disciplineId, 64);
        if (!uuidRe.test(did)) return err('bad-request', 'Некорректная дисциплина.');
        const pos = Number(op.position);
        stmts.push(env.DB.prepare(
          `INSERT INTO topics (id, discipline_id, title, content, date, links, color, done, done_at, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`
        ).bind(id, did, title, str(op.content, 100000), isoDate(op.date),
          JSON.stringify(linkArray(op.links)), color(op.color),
          Number.isFinite(pos) ? pos : 9999, now, now));
        break;
      }
      case 'topic.update': {
        const title = str(op.title, 300).trim();
        if (!title) return err('bad-request', 'Название темы обязательно.');
        stmts.push(env.DB.prepare(
          `UPDATE topics SET title=?, content=?, date=?, links=?, color=?, updated_at=? WHERE id=?`
        ).bind(title, str(op.content, 100000), isoDate(op.date),
          JSON.stringify(linkArray(op.links)), color(op.color), now, id));
        break;
      }
      case 'topic.status': {
        const done = op.done ? 1 : 0;
        stmts.push(env.DB.prepare('UPDATE topics SET done=?, done_at=? WHERE id=?')
          .bind(done, done ? now : null, id));
        break;
      }
      case 'topic.delete':
        stmts.push(env.DB.prepare('DELETE FROM topics WHERE id=?').bind(id));
        break;

      // ----- Задания -----
      case 'assignment.create': {
        const title = str(op.title, 300).trim();
        if (!title) return err('bad-request', 'Название задания обязательно.');
        const tid = str(op.topicId, 64);
        if (!uuidRe.test(tid)) return err('bad-request', 'Некорректная тема.');
        const pos = Number(op.position);
        const g = normalizeGrade(op.grade);
        stmts.push(env.DB.prepare(
          `INSERT INTO assignments (id, topic_id, title, description, criteria, done, done_at, grade, color, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, tid, title, str(op.description, 5000), JSON.stringify(strArray(op.criteria, 50, 500)),
          op.done ? 1 : 0, op.done ? now : null, g, color(op.color),
          Number.isFinite(pos) ? pos : 9999, now, now));
        break;
      }
      case 'assignment.update': {
        const title = str(op.title, 300).trim();
        if (!title) return err('bad-request', 'Название задания обязательно.');
        const g = normalizeGrade(op.grade);
        stmts.push(env.DB.prepare(
          `UPDATE assignments SET title=?, description=?, criteria=?, grade=?, color=?, updated_at=? WHERE id=?`
        ).bind(title, str(op.description, 5000), JSON.stringify(strArray(op.criteria, 50, 500)),
          g, color(op.color), now, id));
        break;
      }
      case 'assignment.status': {
        const done = op.done ? 1 : 0;
        stmts.push(env.DB.prepare('UPDATE assignments SET done=?, done_at=?, updated_at=? WHERE id=?')
          .bind(done, done ? now : null, now, id));
        break;
      }
      case 'assignment.delete':
        stmts.push(env.DB.prepare('DELETE FROM assignments WHERE id=?').bind(id));
        break;

      // ----- Финальный проект -----
      case 'final.enable': {
        const on = op.enabled ? 1 : 0;
        stmts.push(env.DB.prepare('UPDATE modules SET final_enabled=?, updated_at=? WHERE id=?').bind(on, now, id));
        if (on) {
          stmts.push(env.DB.prepare(
            `INSERT INTO final_projects (id, module_id, title, description, due_date, icon, criteria, links, status, grade, created_at, updated_at)
             VALUES (?, ?, 'Финальный проект', '', '', 'flag', '[]', '[]', 'todo', NULL, ?, ?)
             ON CONFLICT(module_id) DO NOTHING`
          ).bind(crypto.randomUUID(), id, now, now));
        }
        break;
      }
      case 'final.update': {
        const status = PROJECT_STATUSES.has(str(op.status, 20)) ? str(op.status, 20) : 'todo';
        const g = normalizeGrade(op.grade);
        stmts.push(env.DB.prepare(
          `UPDATE final_projects SET title=?, description=?, due_date=?, icon=?, criteria=?, links=?, status=?, grade=?, updated_at=?
           WHERE module_id=?`
        ).bind(str(op.title, 200).trim() || 'Финальный проект', str(op.description, 5000),
          isoDate(op.dueDate), icon(op.icon, 'flag'),
          JSON.stringify(critArray(op.criteria)), JSON.stringify(linkArray(op.links)),
          status, g, now, id));
        break;
      }

      // ----- Порядок элементов (drag & drop) -----
      // op: {op:'reorder', table:'modules'|'disciplines'|'topics'|'assignments', ids:[...]}
      case 'reorder': {
        const table = str(op.table, 20);
        const allowed = { modules: 1, disciplines: 1, topics: 1, assignments: 1 };
        if (!allowed[table]) return err('bad-request', 'Неизвестная таблица для сортировки.');
        const ids = Array.isArray(op.ids) ? op.ids.slice(0, 2000) : [];
        ids.forEach((x, i) => {
          if (!uuidRe.test(String(x))) return;
          stmts.push(env.DB.prepare(`UPDATE ${table} SET position=? WHERE id=?`).bind(i + 1, String(x)));
        });
        break;
      }

      // ----- Настройки пользователя -----
      case 'settings.set': {
        const key = str(op.key, 50);
        const allowedKeys = { theme: 1, primaryCourseId: 1, plannerHideDone: 1 };
        if (!allowedKeys[key]) return err('bad-request', 'Неизвестная настройка.');
        let value = op.value;
        if (key === 'theme') value = ['light', 'dark', 'system'].includes(value) ? value : 'system';
        if (key === 'primaryCourseId') value = uuidRe.test(String(value || '')) ? value : '';
        if (key === 'plannerHideDone') value = !!value;
        stmts.push(env.DB.prepare(
          'INSERT INTO user_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        ).bind(key, JSON.stringify(value)));
        break;
      }

      default:
        return err('bad-request', 'Неизвестная операция: ' + kind);
    }
  }

  // Обновляем updated_at затронутых курсов, чтобы список сортировался по активности.
  for (const cid of touchedCourses) {
    stmts.push(env.DB.prepare('UPDATE courses SET updated_at=? WHERE id=?').bind(Date.now(), cid));
  }

  await env.DB.batch(stmts);
  return json({ ok: true, count: stmts.length });
});

// (настройки пользователя читаются в functions/api/settings.js)
