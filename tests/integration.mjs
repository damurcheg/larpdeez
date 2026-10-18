// ╨ÿ╨╜╤é╨╡╨│╤Ç╨░╤å╨╕╨╛╨╜╨╜╤ï╨╣ ╤é╨╡╤ü╤é Larpdeez.
// 1) ╨í╨╛╨▒╨╕╤Ç╨░╨╡╤é Pages Functions ╨║╨╛╨╝╨░╨╜╨┤╨╛╨╣ `wrangler pages functions build` (╨║╨░╨║ ╤ì╤é╨╛ ╨┤╨╡╨╗╨░╨╡╤é Cloudflare ╨┐╤Ç╨╕ ╨┤╨╡╨┐╨╗╨╛╨╡).
// 2) ╨ù╨░╨┐╤â╤ü╨║╨░╨╡╤é ╤ü╨╛╨▒╤Ç╨░╨╜╨╜╤ï╨╣ _worker.js ╨▓ Node (crypto.subtle ╨╡╤ü╤é╤î ╨▓ Node 18+), ╤ì╨╝╤â╨╗╨╕╤Ç╤â╤Å env.DB ╤ç╨╡╤Ç╨╡╨╖ ╨╗╨╛╨║╨░╨╗╤î╨╜╤ï╨╣ SQLite.
// 3) ╨ƒ╤Ç╨╛╨│╨╛╨╜╤Å╨╡╤é ╤ü╤å╨╡╨╜╨░╤Ç╨╕╨╕: ╨┐╨╡╤Ç╨▓╨╛╨╜╨░╤ç╨░╨╗╤î╨╜╨░╤Å ╨╜╨░╤ü╤é╤Ç╨╛╨╣╨║╨░ ╨┐╨░╤Ç╨╛╨╗╤Å, ╨╛╤é╨║╨░╨╖ ╨┐╨╛╨▓╤é╨╛╤Ç╨╜╨╛╨╣ ╨╜╨░╤ü╤é╤Ç╨╛╨╣╨║╨╕, ╨▓╤à╨╛╨┤, ╨╖╨░╤ë╨╕╤é╨░ API, CSRF,
//    ╨║╤â╤Ç╤ü╤ï/╨╝╨░╤é╨╡╤Ç╨╕╨░╨╗╤ï/╨┐╤Ç╨╛╨│╤Ç╨╡╤ü╤ü, ╤ü╨╝╨╡╨╜╨░ ╨┐╨░╤Ç╨╛╨╗╤Å, ╨▓╤ï╤à╨╛╨┤.
//
// ╨ù╨░╨┐╤â╤ü╨║: npm test   (╨╜╤â╨╢╨╡╨╜ ╤â╤ü╤é╨░╨╜╨╛╨▓╨╗╨╡╨╜╨╜╤ï╨╣ wrangler: npm install). ╨¡╨╝╤â╨╗╤Å╤å╨╕╤Å D1 ΓÇö better-sqlite3 (dev-╨╖╨░╨▓╨╕╤ü╨╕╨╝╨╛╤ü╤é╤î ╤é╨╛╨╗╤î╨║╨╛ ╨┤╨╗╤Å ╤é╨╡╤ü╤é╨╛╨▓).

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

let passed = 0;
function ok(name) { passed++; console.log('  Γ£ö', name); }

async function main() {
  const outdir = mkdtempSync(join(tmpdir(), 'larpdeez-fn-'));
  console.log('╨¡╤é╨░╨┐ 1: ╤ü╨▒╨╛╤Ç╨║╨░ Pages Functions (╨░╨╜╨░╨╗╨╛╨│╨╕╤ç╨╜╨╛ Cloudflare Pages)...');
  execSync(`npx wrangler pages functions build --outdir ${outdir}`, { stdio: 'inherit' });
  ok('╨í╨▒╨╛╤Ç╨║╨░ Functions: OK');

  // ╨ƒ╤Ç╨╛╨▓╨╡╤Ç╨╕╨╝, ╤ç╤é╨╛ ╨▓╤ü╨╡ ╨╝╨░╤Ç╤ê╤Ç╤â╤é╤ï ╨┐╨╛╨┐╨░╨╗╨╕ ╨▓ ╨▒╨░╨╜╨┤╨╗
  const files = readdirSync(outdir);
  assert.ok(files.length > 0, '╨▒╨░╨╜╨┤╨╗ ╤ü╨╛╨╖╨┤╨░╨╜');
  ok('╨æ╨░╨╜╨┤╨╗ ╤ä╤â╨╜╨║╤å╨╕╨╣ ╤ü╨╛╨╖╨┤╨░╨╜');

  let Database;
  try {
    Database = createRequire(import.meta.url)('better-sqlite3');
  } catch {
    console.log('  ΓÜá better-sqlite3 ╨╜╨╡ ╤â╤ü╤é╨░╨╜╨╛╨▓╨╗╨╡╨╜ ΓÇö ╨┐╤Ç╨╛╨▓╨╡╤Ç╤Å╨╡╤é╤ü╤Å ╤é╨╛╨╗╤î╨║╨╛ ╤ü╨▒╨╛╤Ç╨║╨░. ╨ƒ╨╛╨╗╨╜╤ï╨╣ ╤é╨╡╤ü╤é: npm install');
    console.log(`\n╨ÿ╤é╨╛╨│: ${passed} ╨┐╤Ç╨╛╨▓╨╡╤Ç╨╛╨║ ╨┐╤Ç╨╛╨╣╨┤╨╡╨╜╨╛.`);
    return;
  }

  // --- ╨¡╨╝╤â╨╗╤Å╤å╨╕╤Å D1 ╨┐╨╛╨▓╨╡╤Ç╤à SQLite ---
  const sqlite = new Database(':memory:');
  const schema = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
  sqlite.exec(schema);
  ok('╨£╨╕╨│╤Ç╨░╤å╨╕╤Å 0001_init.sql ╨┐╤Ç╨╕╨╝╨╡╨╜╨╡╨╜╨░ ╨║ ╤ç╨╕╤ü╤é╨╛╨╣ ╨▒╨░╨╖╨╡');

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

  // --- ╨ù╨░╨│╤Ç╤â╨╢╨░╨╡╨╝ ╤ü╨╛╨▒╤Ç╨░╨╜╨╜╤ï╨╣ worker ---
  const entry = files.includes('_worker.js') ? '_worker.js' : 'index.js';
  const mod = await import(join(outdir, entry));
  const worker = mod.default || mod;
  assert.ok(worker.fetch, 'worker.fetch ╤ü╤â╤ë╨╡╤ü╤é╨▓╤â╨╡╤é');
  ok('╨í╨╛╨▒╤Ç╨░╨╜╨╜╤ï╨╣ worker ╨╖╨░╨│╤Ç╤â╨╢╨░╨╡╤é╤ü╤Å ╨▓ Node');

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

  console.log('\n╨¡╤é╨░╨┐ 2: ╤ü╤å╨╡╨╜╨░╤Ç╨╕╨╕ API');

  // setup-status ╨╜╨░ ╨┐╤â╤ü╤é╨╛╨╣ ╨▒╨░╨╖╨╡
  let r = await call('GET', '/api/setup-status');
  assert.equal(r.status, 200); assert.equal(r.data.configured, false);
  ok('setup-status: ╨┐╨░╤Ç╨╛╨╗╤î ╨╡╤ë╤æ ╨╜╨╡ ╨╖╨░╨┤╨░╨╜ (configured=false)');

  // ╨ƒ╤Ç╨╕╨▓╨░╤é╨╜╤ï╨╡ API ╨▒╨╡╨╖ ╤ü╨╡╤ü╤ü╨╕╨╕
  for (const p of ['/api/courses', '/api/profile', '/api/data']) {
    const g = await call('GET', p);
    assert.equal(g.status, 401, p);
  }
  {
    const g = await call('POST', '/api/progress', { materialId: 'x', done: true });
    assert.equal(g.status, 401, '/api/progress POST');
  }
  ok('╨ƒ╤Ç╨╕╨▓╨░╤é╨╜╤ï╨╡ API ╨▒╨╡╨╖ ╤ü╨╡╤ü╤ü╨╕╨╕ ╨▓╨╛╨╖╨▓╤Ç╨░╤ë╨░╤Ä╤é 401 unauthorized');

  // ╨¥╨░╤ü╤é╤Ç╨╛╨╣╨║╨░ ╨┐╨░╤Ç╨╛╨╗╤Å
  r = await call('POST', '/api/setup', { password: 'super-test-1', confirm: 'super-test-1', name: '╨ó╨╡╤ü╤é' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.ok);
  assert.ok(cookies['larpdeez_session'], 'session cookie ╤â╤ü╤é╨░╨╜╨╛╨▓╨╗╨╡╨╜');
  assert.ok(cookies['larpdeez_csrf'], 'csrf cookie ╤â╤ü╤é╨░╨╜╨╛╨▓╨╗╨╡╨╜');
  ok('╨ƒ╨╡╤Ç╨▓╨╛╨╜╨░╤ç╨░╨╗╤î╨╜╨░╤Å ╨╜╨░╤ü╤é╤Ç╨╛╨╣╨║╨░ ╨┐╨░╤Ç╨╛╨╗╤Å: ╤â╤ü╨┐╨╡╤à, ╤ü╨╛╨╖╨┤╨░╨╜╨░ ╤ü╨╡╤ü╤ü╨╕╤Å');

  // ╨ƒ╨╛╨▓╤é╨╛╤Ç╨╜╨░╤Å ╨╜╨░╤ü╤é╤Ç╨╛╨╣╨║╨░ ╨╜╨╡╨▓╨╛╨╖╨╝╨╛╨╢╨╜╨░
  r = await call('POST', '/api/setup', { password: 'another-pass', confirm: 'another-pass' }, { withCookies: false });
  assert.equal(r.status, 409); assert.equal(r.data.error, 'already-configured');
  ok('╨ƒ╨╛╨▓╤é╨╛╤Ç╨╜╨░╤Å ╨╜╨░╤ü╤é╤Ç╨╛╨╣╨║╨░ ╨┐╨░╤Ç╨╛╨╗╤Å ╨╛╤é╨║╨╗╨╛╨╜╨╡╨╜╨░ (409 already-configured)');

  // ╨Æ ╤à╤Ç╨░╨╜╨╕╨╗╨╕╤ë╨╡ ΓÇö ╤é╨╛╨╗╤î╨║╨╛ ╤à╨╡╤ê, ╨╜╨╡ ╨┐╨░╤Ç╨╛╨╗╤î
  const stored = sqlite.prepare("SELECT value FROM settings WHERE key='password_hash'").get();
  assert.ok(stored.value.includes('pbkdf2-sha256'));
  assert.ok(!stored.value.includes('super-test-1'));
  ok('╨Æ ╨▒╨░╨╖╨╡ ╤à╤Ç╨░╨╜╨╕╤é╤ü╤Å PBKDF2-╤à╨╡╤ê, ╨░ ╨╜╨╡ ╨┐╨░╤Ç╨╛╨╗╤î');

  // setup-status ╤é╨╡╨┐╨╡╤Ç╤î true
  r = await call('GET', '/api/setup-status');
  assert.equal(r.data.configured, true);
  ok('setup-status ╨┐╨╛╤ü╨╗╨╡ ╨╜╨░╤ü╤é╤Ç╨╛╨╣╨║╨╕: configured=true');

  // ╨Æ╤à╨╛╨┤: ╨╜╨╡╨▓╨╡╤Ç╨╜╤ï╨╣ ╨┐╨░╤Ç╨╛╨╗╤î
  r = await call('POST', '/api/login', { password: 'wrong-password' }, { withCookies: false });
  assert.equal(r.status, 401); assert.equal(r.data.error, 'bad-password');
  ok('╨Æ╤à╨╛╨┤ ╤ü ╨╜╨╡╨▓╨╡╤Ç╨╜╤ï╨╝ ╨┐╨░╤Ç╨╛╨╗╨╡╨╝ ╨╛╤é╨║╨╗╨╛╨╜╤æ╨╜ (bad-password)');

  // ╨Æ╤à╨╛╨┤: ╨▓╨╡╤Ç╨╜╤ï╨╣ ╨┐╨░╤Ç╨╛╨╗╤î
  r = await call('POST', '/api/login', { password: 'super-test-1' }, { withCookies: false });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  ok('╨Æ╤à╨╛╨┤ ╤ü ╨▓╨╡╤Ç╨╜╤ï╨╝ ╨┐╨░╤Ç╨╛╨╗╨╡╨╝ ╤â╤ü╨┐╨╡╤ê╨╡╨╜');

  // ╨í╨╡╤ü╤ü╨╕╤Å
  r = await call('GET', '/api/session');
  assert.equal(r.data.authenticated, true);
  ok('GET /api/session ╨┐╨╛╨┤╤é╨▓╨╡╤Ç╨╢╨┤╨░╨╡╤é ╤ü╨╡╤ü╤ü╨╕╤Ä');

  // CSRF: POST ╨▒╨╡╨╖ ╤é╨╛╨║╨╡╨╜╨░ ╨╖╨░╨┐╤Ç╨╡╤ë╤æ╨╜
  r = await call('POST', '/api/courses', { title: '╨Ü╤â╤Ç╤ü ╨▒╨╡╨╖ CSRF' });
  assert.equal(r.status, 403); assert.equal(r.data.error, 'csrf');
  ok('╨ù╨░╨┐╤Ç╨╛╤ü ╨╜╨░ ╨╕╨╖╨╝╨╡╨╜╨╡╨╜╨╕╨╡ ╨┤╨░╨╜╨╜╤ï╤à ╨▒╨╡╨╖ CSRF-╤é╨╛╨║╨╡╨╜╨░ ╨╛╤é╨║╨╗╨╛╨╜╤æ╨╜ (403)');

  // ╨í╨╛╨╖╨┤╨░╨╜╨╕╨╡ ╨║╤â╤Ç╤ü╨░
  r = await call('POST', '/api/courses', { title: '╨£╨░╤é╨╡╨╝╨░╤é╨╕╨║╨░', description: '╨₧╤ü╨╜╨╛╨▓╤ï', color: '#007AFF' }, { csrf: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const courseId = r.data.id;
  ok('╨í╨╛╨╖╨┤╨░╨╜╨╕╨╡ ╨║╤â╤Ç╤ü╨░: OK');

  // ╨£╨░╤é╨╡╤Ç╨╕╨░╨╗╤ï
  r = await call('POST', `/api/courses/${courseId}/materials`, { title: '╨ú╤Ç╨╛╨║ 1', kind: 'lesson', content: '╨ó╨╡╨║╤ü╤é ╤â╤Ç╨╛╨║╨░' }, { csrf: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const lessonId = r.data.id;
  r = await call('POST', `/api/courses/${courseId}/materials`, { title: '╨ù╨░╨┤╨░╨╜╨╕╨╡ 1', kind: 'task' }, { csrf: true });
  assert.equal(r.status, 200);
  const taskId = r.data.id;
  ok('╨ö╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╕╨╡ ╨╝╨░╤é╨╡╤Ç╨╕╨░╨╗╨╛╨▓ (╤â╤Ç╨╛╨║ + ╨╖╨░╨┤╨░╨╜╨╕╨╡): OK');

  // GET ╨║╤â╤Ç╤ü╨░
  r = await call('GET', `/api/courses/${courseId}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.materials.length, 2);
  ok('GET /api/courses/:id ╨▓╨╛╨╖╨▓╤Ç╨░╤ë╨░╨╡╤é ╨║╤â╤Ç╤ü ╤ü ╨╝╨░╤é╨╡╤Ç╨╕╨░╨╗╨░╨╝╨╕');

  // ╨ƒ╤Ç╨╛╨│╤Ç╨╡╤ü╤ü
  r = await call('POST', '/api/progress', { materialId: lessonId, done: true }, { csrf: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('GET', `/api/courses/${courseId}`);
  const lesson = r.data.materials.find((m) => m.id === lessonId);
  assert.equal(lesson.done, true);
  ok('╨₧╤é╨╝╨╡╤é╨║╨░ ╨┐╤Ç╨╛╨│╤Ç╨╡╤ü╤ü╨░ ╤ü╨╛╤à╤Ç╨░╨╜╤Å╨╡╤é╤ü╤Å ╨╕ ╤ç╨╕╤é╨░╨╡╤é╤ü╤Å');

  r = await call('GET', '/api/courses');
  const course = r.data.courses.find((c) => c.id === courseId);
  assert.equal(course.totalMaterials, 2);
  assert.equal(course.doneMaterials, 1);
  ok('╨ƒ╤Ç╨╛╨│╤Ç╨╡╤ü╤ü ╨║╤â╤Ç╤ü╨░ ╤ü╤ç╨╕╤é╨░╨╡╤é╤ü╤Å ╨┐╨╛ ╨╝╨░╤é╨╡╤Ç╨╕╨░╨╗╨░╨╝ (1/2)');

  // ╨₧╨▒╨╜╨╛╨▓╨╗╨╡╨╜╨╕╨╡ ╨║╤â╤Ç╤ü╨░
  r = await call('PUT', `/api/courses/${courseId}`, { title: '╨£╨░╤é╨╡╨╝╨░╤é╨╕╨║╨░ 2', description: '', color: '#FF9500', emoji: '≡ƒôÉ' }, { csrf: true });
  assert.equal(r.status, 200);
  ok('╨₧╨▒╨╜╨╛╨▓╨╗╨╡╨╜╨╕╨╡ ╨║╤â╤Ç╤ü╨░: OK');

  // ╨ú╨┤╨░╨╗╨╡╨╜╨╕╨╡ ╨╝╨░╤é╨╡╤Ç╨╕╨░╨╗╨░
  r = await call('DELETE', `/api/courses/${courseId}/materials/${taskId}`, {}, { csrf: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('GET', `/api/courses/${courseId}`);
  assert.equal(r.data.materials.length, 1);
  ok('╨ú╨┤╨░╨╗╨╡╨╜╨╕╨╡ ╨╝╨░╤é╨╡╤Ç╨╕╨░╨╗╨░: OK');

  // ╨ƒ╤Ç╨╛╤ä╨╕╨╗╤î: ╤ç╤é╨╡╨╜╨╕╨╡ ╨╕ ╨╖╨░╨┐╨╕╤ü╤î
  r = await call('GET', '/api/profile');
  assert.equal(r.status, 200);
  r = await call('PUT', '/api/profile', { name: '╨¢╨░╤Ç╨┐╨┤╨╕', avatarEmoji: '≡ƒÜÇ', about: '╨ú╤ç╤â╤ü╤î' }, { csrf: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('GET', '/api/profile');
  assert.equal(r.data.name, '╨¢╨░╤Ç╨┐╨┤╨╕');
  assert.equal(r.data.avatarEmoji, '≡ƒÜÇ');
  ok('╨ƒ╤Ç╨╛╤ä╨╕╨╗╤î ╤ü╨╛╤à╤Ç╨░╨╜╤Å╨╡╤é╤ü╤Å ╨╕ ╨┐╨╡╤Ç╨╡╤ç╨╕╤é╤ï╨▓╨░╨╡╤é╤ü╤Å');

  // ╨¡╨║╤ü╨┐╨╛╤Ç╤é ╨┤╨░╨╜╨╜╤ï╤à
  r = await call('GET', '/api/data');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data.courses));
  ok('╨¡╨║╤ü╨┐╨╛╤Ç╤é ╨┤╨░╨╜╨╜╤ï╤à (/api/data) ╤Ç╨░╨▒╨╛╤é╨░╨╡╤é');

  // ╨í╨╝╨╡╨╜╨░ ╨┐╨░╤Ç╨╛╨╗╤Å: ╨▒╨╡╨╖ ╤é╨╡╨║╤â╤ë╨╡╨│╨╛ ΓÇö ╨╛╤ê╨╕╨▒╨║╨░; ╤ü ╤é╨╡╨║╤â╤ë╨╕╨╝ ΓÇö ╤â╤ü╨┐╨╡╤à
  r = await call('POST', '/api/password', { currentPassword: 'nope', newPassword: 'brand-new-9', confirmPassword: 'brand-new-9' }, { csrf: true });
  assert.equal(r.status, 401, JSON.stringify(r.data));
  ok('╨í╨╝╨╡╨╜╨░ ╨┐╨░╤Ç╨╛╨╗╤Å ╤ü ╨╜╨╡╨▓╨╡╤Ç╨╜╤ï╨╝ ╤é╨╡╨║╤â╤ë╨╕╨╝ ╨╛╤é╨║╨╗╨╛╨╜╨╡╨╜╨░');

  r = await call('POST', '/api/password', { currentPassword: 'super-test-1', newPassword: 'brand-new-9', confirmPassword: 'brand-new-9' }, { csrf: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  ok('╨í╨╝╨╡╨╜╨░ ╨┐╨░╤Ç╨╛╨╗╤Å ╤ü ╨▓╨╡╤Ç╨╜╤ï╨╝ ╤é╨╡╨║╤â╤ë╨╕╨╝: OK');

  // ╨í╤é╨░╤Ç╤ï╨╣ ╨┐╨░╤Ç╨╛╨╗╤î ╨▒╨╛╨╗╤î╤ê╨╡ ╨╜╨╡ ╨┐╨╛╨┤╤à╨╛╨┤╨╕╤é, ╨╜╨╛╨▓╤ï╨╣ ╨┐╨╛╨┤╤à╨╛╨┤╨╕╤é
  r = await call('POST', '/api/login', { password: 'super-test-1' }, { withCookies: false });
  assert.equal(r.status, 401);
  r = await call('POST', '/api/login', { password: 'brand-new-9' }, { withCookies: false });
  assert.equal(r.status, 200);
  ok('╨ƒ╨╛╤ü╨╗╨╡ ╤ü╨╝╨╡╨╜╤ï ╨┐╨░╤Ç╨╛╨╗╤Å ╤ü╤é╨░╤Ç╤ï╨╣ ╨╜╨╡ ╤Ç╨░╨▒╨╛╤é╨░╨╡╤é, ╨╜╨╛╨▓╤ï╨╣ ╤Ç╨░╨▒╨╛╤é╨░╨╡╤é');

  // ╨Æ╤ï╤à╨╛╨┤
  r = await call('POST', '/api/logout', {}, { csrf: true });
  assert.equal(r.status, 200);
  r = await call('GET', '/api/session');
  assert.equal(r.data.authenticated, false);
  r = await call('GET', '/api/courses');
  assert.equal(r.status, 401);
  ok('╨Æ╤ï╤à╨╛╨┤ ╨░╨╜╨╜╤â╨╗╨╕╤Ç╤â╨╡╤é ╤ü╨╡╤ü╤ü╨╕╤Ä, API ╤ü╨╜╨╛╨▓╨░ ╨╖╨░╨║╤Ç╤ï╤é');

  // ╨ö╨░╨╜╨╜╤ï╨╡ ╨╛╤ü╤é╨░╨╗╨╕╤ü╤î ╨▓ ╨▒╨░╨╖╨╡ (╤ü╨╕╨╝╤â╨╗╤Å╤å╨╕╤Å ┬½╨┤╤Ç╤â╨│╨╛╨│╨╛ ╤â╤ü╤é╤Ç╨╛╨╣╤ü╤é╨▓╨░┬╗ ΓÇö ╨╜╨╛╨▓╨░╤Å ╤ü╨╡╤ü╤ü╨╕╤Å ╤ç╨╡╤Ç╨╡╨╖ login)
  r = await call('POST', '/api/login', { password: 'brand-new-9' }, { withCookies: false });
  assert.equal(r.status, 200);
  r = await call('GET', '/api/courses');
  assert.equal(r.data.courses.length, 1);
  assert.equal(r.data.courses[0].title, '╨£╨░╤é╨╡╨╝╨░╤é╨╕╨║╨░ 2');
  ok('╨Ü╤â╤Ç╤ü╤ï ╨╕ ╨┐╤Ç╨╛╨│╤Ç╨╡╤ü╤ü ╤ü╨╛╤à╤Ç╨░╨╜╤Å╤Ä╤é╤ü╤Å ╨╝╨╡╨╢╨┤╤â ╤ü╨╡╤ü╤ü╨╕╤Å╨╝╨╕ (╨┤╨░╨╜╨╜╤ï╨╡ ╨▓ D1)');

  console.log(`\n╨ÿ╤é╨╛╨│: ${passed} ╨┐╤Ç╨╛╨▓╨╡╤Ç╨╛╨║ ╨┐╤Ç╨╛╨╣╨┤╨╡╨╜╨╛ Γ£à`);
}

main().catch((e) => { console.error('\nΓ¥î ╨ó╨ò╨í╨ó ╨ƒ╨á╨₧╨Æ╨É╨¢╨ÿ╨¢╨í╨»:', e); process.exit(1); });
