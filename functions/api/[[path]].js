const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = s => new Uint8Array(s.match(/.{2}/g).map(h => parseInt(h, 16)));
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra }
});
const cookie = (t, max = 2592000) =>
  'ldz_session=' + t + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + max;

async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 20000, hash: 'SHA-256' }, key, 256));
}
async function makeHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: hex(salt), hash: await pbkdf2(password, salt) };
}
async function checkHash(password, salt, hash) {
  const h = await pbkdf2(password, unhex(salt));
  return h === hash;
}
function newRecovery() {
  return 'LDZ-' + rand(3).toUpperCase() + '-' + rand(3).toUpperCase();
}
async function ensureAuth(env) {
  let a = await env.LARPDEEZ.get('auth', 'json');
  if (!a) {
    const m = await makeHash('12345678');
    a = { login: 'admin', salt: m.salt, hash: m.hash, recoveryCode: newRecovery(), createdAt: Date.now() };
    await env.LARPDEEZ.put('auth', JSON.stringify(a));
  }
  return a;
}
function tokenOf(req) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(/(?:^|;\s*)ldz_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function login(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Некорректный запрос' }, 400); }
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const rlKey = 'rl:' + ip;
  const tries = Number(await env.LARPDEEZ.get(rlKey) || 0);
  if (tries >= 8) return json({ error: 'Слишком много попыток. Подожди 15 минут.' }, 429);

  const a = await ensureAuth(env);
  const pass = String(body.password || '');
  const byMain = String(body.login || '').trim() === a.login && await checkHash(pass, a.salt, a.hash);
  const byRecovery = pass && pass === a.recoveryCode;

  if (!byMain && !byRecovery) {
    await env.LARPDEEZ.put(rlKey, String(tries + 1), { expirationTtl: 900 });
    return json({ error: 'Неверный логин или пароль' }, 401);
  }
  await env.LARPDEEZ.delete(rlKey);
  const t = rand(32);
  await env.LARPDEEZ.put('session:' + t, JSON.stringify({ at: Date.now(), by: byRecovery ? 'recovery' : 'password' }), { expirationTtl: 2592000 });
  return json({ ok: true }, 200, { 'set-cookie': cookie(t) });
}

async function logout(request, env) {
  const t = tokenOf(request);
  if (t) await env.LARPDEEZ.delete('session:' + t);
  return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) });
}

async function getState(env) {
  const rec = await env.LARPDEEZ.get('state', 'json');
  return json(rec || { data: null, updatedAt: 0 });
}

async function putState(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Некорректный JSON' }, 400); }
  const d = body && body.data;
  if (!d || typeof d !== 'object' || Array.isArray(d) || (!Array.isArray(d.modules) && !d.course)) {
    return json({ error: 'Данные не похожи на состояние larpdeez' }, 400);
  }
  const payload = JSON.stringify({ data: d, updatedAt: Number(body.updatedAt) || Date.now() });
  if (payload.length > 20 * 1024 * 1024) return json({ error: 'Данные слишком большие для KV' }, 413);
  await env.LARPDEEZ.put('state', payload);
  return json({ ok: true, updatedAt: JSON.parse(payload).updatedAt });
}

async function getAccount(env) {
  const a = await ensureAuth(env);
  return json({ login: a.login, recoveryCode: a.recoveryCode });
}

async function setAccount(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Некорректный запрос' }, 400); }
  const a = await ensureAuth(env);
  const cur = String(body.currentPassword || '');
  const allowed = await checkHash(cur, a.salt, a.hash) || cur === a.recoveryCode;
  if (!allowed) return json({ error: 'Текущий пароль неверный' }, 403);

  if (body.regenerateRecovery) a.recoveryCode = newRecovery();
  if (body.password) {
    if (String(body.password).length < 8) return json({ error: 'Пароль минимум 8 символов' }, 400);
    const m = await makeHash(String(body.password));
    a.salt = m.salt; a.hash = m.hash;
  }
  if (body.login && String(body.login).trim()) a.login = String(body.login).trim();
  await env.LARPDEEZ.put('auth', JSON.stringify(a));

  // завершаем все чужие сессии, текущую оставляем
  const keep = tokenOf(request);
  const list = await env.LARPDEEZ.list({ prefix: 'session:' });
  await Promise.all(list.keys.filter(k => k.name !== 'session:' + keep).map(k => env.LARPDEEZ.delete(k.name)));

  return json({ ok: true, login: a.login, recoveryCode: a.recoveryCode });
}

export async function onRequest({ request, env }) {
  const path = new URL(request.url).pathname.replace(/^\/api\/?/, '');
  const m = request.method;
  if (path === 'login' && m === 'POST') return login(request, env);
  if (path === 'logout') return logout(request, env);
  if (path === 'state' && m === 'GET') return getState(env);
  if (path === 'state' && (m === 'PUT' || m === 'POST')) return putState(request, env);
  if (path === 'account' && m === 'GET') return getAccount(env);
  if (path === 'account' && m === 'POST') return setAccount(request, env);
  return json({ error: 'not found' }, 404);
}