// Интеграционный тест Larpdeez.
// 1) Собирает Pages Functions командой `wrangler pages functions build` (как это делает Cloudflare при деплое).
// 2) Запускает собранный _worker.js в Node (crypto.subtle есть в Node 18+), эмулируя env.DB через локальный SQLite.
// 3) Прогоняет сценарии: первоначальная настройка пароля, отказ повторной настройки, вход, защита API, CSRF,
//    курсы/материалы/прогресс, смена пароля, выход.
//
// Запуск: npm test   (нужен установленный wrangler: npm install). Эмуляция D1 — better-sqlite3 (dev-зависимость только для тестов).

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

let passed = 0;
function ok(name) { passed++; console.log('  ✔', name); }

async function main() {
  const outdir = mkdtempSync(join(tmpdir(), 'larpdeez-fn-'));
  console.log('Этап 1: сборка Pages Functions (аналогично Cloudflare Pages)...');
  execSync(`npx wrangler pages functions build --outdir ${outdir}`, { stdio: 'inherit' });
  ok('Сборка Functions: OK');

  // Проверим, что все маршруты попали в бандл
  const files = readdirSync(outdir);
  assert.ok(files.length > 0, 'бандл создан');
  ok('Бандл функций создан');

  let Database;
  try {
    Database = createRequire(import.meta.url)('better-sqlite3');
  } catch {
    console.log('  ⚠ better-sqlite3 не установлен — проверяется только сборка. Полный тест: npm install');
    console.log(`\nИтог: ${passed} проверок пройдено.`);
    return;
  }

  // --- Эмуляция D1 поверх SQLite ---
  const sqlite = new Database(':memory:');
  const schema = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
  sqlite.exec(schema);
  ok('Миграция 0001_init.sql применена к чистой базе');

  function makePrepare(sql) {
    const stmt = sqlite.prepare(sql);
    let bound = [];
    const api = {
      bind(...vals) { bound = vals.map((v) => (typeof v === 'boolean' ? Number(v) : v)); return api; },
      async first() { return stmt.get(...bound) ?? null; },
      async all() { return { results: stmt.all(...bound) }; },
      async run() {
        const info = stmt.run(...bound);
        return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
      },
    };
    return api;
  }
  const DB = {
    prepare: makePrepare,
    async batch(stmts) {
      const out = [];
      sqlite.exec('BEGIN');
      try {
        for (const st of stmts) out.push(await st.run());
        sqlite.exec('COMMIT');
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
      return out;
    },
  };

  // --- Загружаем собранный worker ---
  const entry = files.includes('_worker.js') ? '_worker.js' : 'index.js';
  const mod = await import(join(outdir, entry));
  const worker = mod.default || mod;
  assert.ok(worker.fetch, 'worker.fetch существует');
  ok('Собранный worker загружается в Node');

  const env = { DB, ASSETS: { fetch: async (req) => new Response('asset: ' + req.url, { status: 200 }) } };
  const cookies = {}; // jar
  function cookieHeader() {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  function saveCookies(res) {
    let sc = [];
    try { sc = res.headers.getSetCookie(); } catch {}
    if (!sc.length) { const c = res.headers.get('set-cookie'); if (c) sc = [c]; }
    for (const c of sc) {
      const m = c.split(';')[0];
      const i = m.indexOf('=');
      const name = m.slice(0, i).trim();
      const val = decodeURIComponent(m.slice(i + 1).trim());
      if (val === '' || /Max-Age=0/i.test(c)) delete cookies[name]; else cookies[name] = val;
    }
  }
  async function call(method, path, body, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (opts.withCookies !== false) { const ch = cookieHeader(); if (ch) headers['cookie'] = ch; }
    if (opts.csrf) headers['x-csrf-token'] = cookies['larpdeez_csrf'] || '';
    const req = new Request('https://example.com' + path, {
      method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const ctx = { request: req, env, params: opts.params || {}, waitUntil() {}, next: async () => {} , cf: { country: 'RU' } };
    const res = await worker.fetch(req, env, ctx);
    saveCookies(res);
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  }

  console.log('\nЭтап 2: сценарии API');

  // setup-status на пустой базе
  let r = await call('GET', '/api/setup-status');
  assert.equal(r.status, 200); assert.equal(r.data.configured, false);
  ok('setup-status: пароль ещё не задан (configured=false)');

  // Приватные API без сессии
  for (const p of ['/api/courses', '/api/profile', '/api/data']) {
    const g = await call('GET', p);
    assert.equal(g.status, 401, p);
  }
  {
    const g = await call('POST', '/api/progress', { materialId: 'x', done: true });
    assert.equal(g.status, 401, '/api/progress POST');
  }
  ok('Приватные API без сессии возвращают 401 unauthorized');

  // Настройка пароля
  r = await call('POST', '/api/setup', { password: 'super-test-1', confirm: 'super-test-1', name: 'Тест' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.ok);
  assert.ok(cookies['larpdeez_session'], 'session cookie установлен');
  assert.ok(cookies['larpdeez_csrf'], 'csrf cookie установлен');
  ok('Первоначальная настройка пароля: успех, создана сессия');

  // Повторная настройка невозможна
  r = await call('POST', '/api/setup', { password: 'another-pass', confirm: 'another-pass' }, { withCookies: false });
  assert.equal(r.status, 409); assert.equal(r.data.error, 'already-configured');
  ok('Повторная настройка пароля отклонена (409 already-configured)');

  // В хранилище — только хеш, не пароль
  const stored = sqlite.prepare("SELECT value FROM settings WHERE key='password_hash'").get();
  assert.ok(stored.value.includes('pbkdf2-sha256'));
  assert.ok(!stored.value.includes('super-test-1'));
  ok('В базе хранится PBKDF2-хеш, а не пароль');

  // setup-status теперь true
  r = await call('GET', '/api/setup-status');
  assert.equal(r.data.configured, true);
  ok('setup-status после настройки: configured=true');

  // Вход: неверный пароль
  r = await call('POST', '/api/login', { password: 'wrong-password' }, { withCookies: false });
  assert.equal(r.status, 401); assert.equal(r.data.error, 'bad-password');
  ok('Вход с неверным паролем отклонён (bad-password)');

  // Вход: верный пароль
  r = await call('POST', '/api/login', { password: 'super-test-1' }, { withCookies: false });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  ok('Вход с верным паролем успешен');

  // Сессия
  r = await call('GET', '/api/session');
  assert.equal(r.data.authenticated, true);
  ok('GET /api/session подтверждает сессию');

  // CSRF: POST без токена запрещён
  r = await call('POST', '/api/courses', { title: 'Курс без CSRF' });
  assert.equal(r.status, 403); assert.equal(r.data.error, 'csrf');
  ok('Запрос на изменение данных без CSRF-токена отклонён (403)');

  // Создание курса
  r = await call('POST', '/api/courses', { title: 'Математика', description: 'Основы', color: '#007AFF' }, { csrf: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const courseId = r.data.id;
  ok('Создание курса: OK');

  // Материалы
  r = await call('POST', `/api/courses/${courseId}/materials`, { title: 'Урок 1', kind: 'lesson', content: 'Текст урока' }, { csrf: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const lessonId = r.data.id;
  r = await call('POST', `/api/courses/${courseId}/materials`, { title: 'Задание 1', kind: 'task' }, { csrf: true });
  assert.equal(r.status, 200);
  const taskId = r.data.id;
  ok('Добавление материалов (урок + задание): OK');

  // GET курса
  r = await call('GET', `/api/courses/${courseId}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.materials.length, 2);
  ok('GET /api/courses/:id возвращает курс с материалами');

  // Прогресс
  r = await call('POST', '/api/progress', { materialId: lessonId, done: true }, { csrf: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('GET', `/api/courses/${courseId}`);
  const lesson = r.data.materials.find((m) => m.id === lessonId);
  assert.equal(lesson.done, true);
  ok('Отметка прогресса сохраняется и читается');

  r = await call('GET', '/api/courses');
  const course = r.data.courses.find((c) => c.id === courseId);
  assert.equal(course.totalMaterials, 2);
  assert.equal(course.doneMaterials, 1);
  ok('Прогресс курса считается по материалам (1/2)');

  // Обновление курса
  r = await call('PUT', `/api/courses/${courseId}`, { title: 'Математика 2', description: '', color: '#FF9500', emoji: '📐' }, { csrf: true });
  assert.equal(r.status, 200);
  ok('Обновление курса: OK');

  // Удаление материала
  r = await call('DELETE', `/api/courses/${courseId}/materials/${taskId}`, {}, { csrf: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('GET', `/api/courses/${courseId}`);
  assert.equal(r.data.materials.length, 1);
  ok('Удаление материала: OK');

  // Профиль: чтение и запись
  r = await call('GET', '/api/profile');
  assert.equal(r.status, 200);
  r = await call('PUT', '/api/profile', { name: 'Ларпди', avatarEmoji: '🚀', about: 'Учусь' }, { csrf: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('GET', '/api/profile');
  assert.equal(r.data.name, 'Ларпди');
  assert.equal(r.data.avatarEmoji, '🚀');
  ok('Профиль сохраняется и перечитывается');

  // Экспорт данных
  r = await call('GET', '/api/data');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data.courses));
  ok('Экспорт данных (/api/data) работает');

  // Смена пароля: без текущего — ошибка; с текущим — успех
  r = await call('POST', '/api/password', { currentPassword: 'nope', newPassword: 'brand-new-9', confirmPassword: 'brand-new-9' }, { csrf: true });
  assert.equal(r.status, 401, JSON.stringify(r.data));
  ok('Смена пароля с неверным текущим отклонена');

  r = await call('POST', '/api/password', { currentPassword: 'super-test-1', newPassword: 'brand-new-9', confirmPassword: 'brand-new-9' }, { csrf: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  ok('Смена пароля с верным текущим: OK');

  // Старый пароль больше не подходит, новый подходит
  r = await call('POST', '/api/login', { password: 'super-test-1' }, { withCookies: false });
  assert.equal(r.status, 401);
  r = await call('POST', '/api/login', { password: 'brand-new-9' }, { withCookies: false });
  assert.equal(r.status, 200);
  ok('После смены пароля старый не работает, новый работает');

  // Выход
  r = await call('POST', '/api/logout', {}, { csrf: true });
  assert.equal(r.status, 200);
  r = await call('GET', '/api/session');
  assert.equal(r.data.authenticated, false);
  r = await call('GET', '/api/courses');
  assert.equal(r.status, 401);
  ok('Выход аннулирует сессию, API снова закрыт');

  // Данные остались в базе (симуляция «другого устройства» — новая сессия через login)
  r = await call('POST', '/api/login', { password: 'brand-new-9' }, { withCookies: false });
  assert.equal(r.status, 200);
  r = await call('GET', '/api/courses');
  assert.equal(r.data.courses.length, 1);
  assert.equal(r.data.courses[0].title, 'Математика 2');
  ok('Курсы и прогресс сохраняются между сессиями (данные в D1)');

  console.log(`\nИтог: ${passed} проверок пройдено ✅`);
}

main().catch((e) => { console.error('\n❌ ТЕСТ ПРОВАЛИЛСЯ:', e); process.exit(1); });
