import { json, err, handle, requireAuth, checkCsrf, readJson } from '../../../lib/common.js';

// Курсы + прогресс по ним. Прогресс считается сервером:
// - если у курса есть модули (новая иерархия) — по темам и правилам Этапа 7;
// - иначе — по старым материалам (обратная совместимость со schema v1).

const hexColorRe = /^#[0-9a-fA-F]{6}$/;
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanString(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
function cleanColor(v, fallback) {
  const s = cleanString(v, 32).trim().toLowerCase();
  return hexColorRe.test(s) ? s : fallback;
}

async function legacyProgress(env) {
  const r = await env.DB.prepare(`
    SELECT c.id AS id,
           COUNT(m.id) AS total_materials,
           SUM(CASE WHEN p.done = 1 THEN 1 ELSE 0 END) AS done_materials
    FROM courses c
    LEFT JOIN materials m ON m.course_id = c.id
    LEFT JOIN progress p ON p.material_id = m.id
    GROUP BY c.id
  `).all();
  const map = {};
  for (const row of r.results || []) map[row.id] = row;
  return map;
}

async function hierarchicalStats(env) {
  // Таблица modules появляется в миграции 0002; на старой БД молча возвращаем пусто.
  try {
    await env.DB.prepare('SELECT 1 FROM modules LIMIT 0').first();
  } catch (e) {
    return {};
  }
  // Один проход по всем курсам: темы, задания, финальные проекты через JOIN.
  const all = await env.DB.prepare(`
    SELECT c.id AS course_id,
           COUNT(t.id) AS total_topics,
           SUM(CASE WHEN t.done = 1 THEN 1 ELSE 0 END) AS done_topics,
           SUM(CASE WHEN a.grade IS NOT NULL THEN 1 ELSE 0 END) AS graded_count,
           SUM(COALESCE(a.grade, 0)) AS grade_sum,
           SUM(CASE WHEN mo.final_enabled = 1 AND fp.status = 'done' THEN 1 ELSE 0 END) AS finals_done,
           SUM(CASE WHEN mo.final_enabled = 1 AND fp.id IS NOT NULL THEN 1 ELSE 0 END) AS finals_active,
           SUM(CASE WHEN mo.final_enabled = 1 AND fp.grade IS NOT NULL THEN 1 ELSE 0 END) AS finals_graded,
           SUM(CASE WHEN mo.final_enabled = 1 THEN COALESCE(fp.grade, 0) ELSE 0 END) AS finals_grade_sum,
           COUNT(DISTINCT mo.id) AS module_count
    FROM courses c
    LEFT JOIN modules mo ON mo.course_id = c.id
    LEFT JOIN final_projects fp ON fp.module_id = mo.id
    LEFT JOIN disciplines d ON d.module_id = mo.id
    LEFT JOIN topics t ON t.discipline_id = d.id
    LEFT JOIN assignments a ON a.topic_id = t.id
    GROUP BY c.id
  `).all();
  const map = {};
  for (const row of all.results || []) {
    let total = Number(row.total_topics) || 0;
    let done = Number(row.done_topics) || 0;
    // Финальные проекты — дополнительные единицы прогресса (Этап 6/7),
    // завершённые при статусе done.
    total += Number(row.finals_active) || 0;
    done += Number(row.finals_done) || 0;
    let graded = Number(row.graded_count) || 0;
    let sum = Number(row.grade_sum) || 0;
    // Оценка финального проекта учитывается ровно один раз и только при наличии балла.
    graded += Number(row.finals_graded) || 0;
    sum += Number(row.finals_grade_sum) || 0;
    map[row.course_id] = {
      totalTopics: total,
      doneTopics: done,
      averageGrade: graded ? Math.round((sum / graded) * 10) / 10 : null,
      gradedCount: graded,
      moduleCount: Number(row.module_count) || 0,
    };
  }
  return map;
}

async function coursesWithProgress(env) {
  // Настройки читаются отдельно: на старой БД (без миграции 0002) таблицы может не быть.
  let primaryId = '';
  try {
    const srow = await env.DB.prepare("SELECT value FROM user_settings WHERE key = 'primaryCourseId'").first();
    const parsed = JSON.parse((srow && srow.value) || '""');
    if (uuidRe.test(String(parsed))) primaryId = String(parsed);
  } catch (e) { /* нет таблицы/значения — главного курса нет */ }

  const rows = await env.DB.prepare(`
    SELECT c.id, c.title, c.description, c.color, c.emoji, c.created_at, c.updated_at
    FROM courses c
    ORDER BY c.updated_at DESC
  `).all();

  const legacy = await legacyProgress(env);
  const hier = await hierarchicalStats(env);

  return (rows.results || []).map((c) => {
    const h = hier[c.id];
    const l = legacy[c.id] || { total_materials: 0, done_materials: 0 };
    const hasModules = !!(h && h.moduleCount > 0);
    const out = {
      id: c.id,
      title: c.title,
      description: c.description || '',
      color: cleanColor(c.color, '#007AFF'),
      emoji: c.emoji || 'book',
      createdAt: Number(c.created_at),
      updatedAt: Number(c.updated_at),
      isPrimary: c.id === primaryId,
      hierarchical: hasModules,
      // Совместимость со старыми данными:
      totalMaterials: Number(l.total_materials) || 0,
      doneMaterials: Number(l.done_materials) || 0,
    };
    if (hasModules) {
      out.totalTopics = h.totalTopics;
      out.doneTopics = h.doneTopics;
      out.progressPercent = h.totalTopics ? Math.round((h.doneTopics / h.totalTopics) * 100) : 0;
      out.averageGrade = h.averageGrade;
      out.gradedCount = h.gradedCount;
    } else {
      out.totalTopics = out.totalMaterials;
      out.doneTopics = out.doneMaterials;
      out.progressPercent = out.totalMaterials ? Math.round((out.doneMaterials / out.totalMaterials) * 100) : 0;
      out.averageGrade = null;
      out.gradedCount = 0;
    }
    return out;
  });
}

// GET /api/courses — список курсов с прогрессом.
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAuth(env, request);
  return json({ courses: await coursesWithProgress(env) });
});

// POST /api/courses — создать курс.
// body.setPrimary === true — сразу сделать курс главным.
export const onRequestPost = handle(async ({ request, env }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');
  const body = await readJson(request);
  const title = cleanString(body.title, 200).trim();
  if (!title) return err('bad-request', 'Название курса не может быть пустым.');

  const id = crypto.randomUUID();
  const now = Date.now();
  const stmts = [env.DB.prepare(
    'INSERT INTO courses (id, title, description, color, emoji, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    title,
    cleanString(body.description, 2000),
    cleanColor(body.color, '#007AFF'),
    cleanString(body.emoji, 8) || 'book',
    now,
    now
  )];
  if (body.setPrimary === true) {
    stmts.push(env.DB.prepare(
      "INSERT INTO user_settings (key, value) VALUES ('primaryCourseId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).bind(JSON.stringify(id)));
  }
  await env.DB.batch(stmts);
  return json({ ok: true, id });
});
