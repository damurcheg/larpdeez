// Общие серверные функции для Larpdeez (Cloudflare Pages Functions).
// Этот файл НЕ доступен из браузера — он лежит вне папки public.
// Здесь: хеширование пароля (PBKDF2), сессии, CSRF, проверка доступа, ответы JSON.

// ---------- JSON-ответы ----------
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}
export function err(code, message, status = 400) {
  return json({ error: code, message }, status);
}

// ---------- Базовые запросы к D1 ----------
export async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

// ---------- Пароль: PBKDF2-SHA256 + случайная соль ----------
const PBKDF2_ITERATIONS = 210000;

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function hexToBuf(hex) {
  const u = new Uint8Array(hex.length / 2);
  for (let i = 0; i < u.length; i++) u[i] = parseInt(hex.substr(i * 2, 2), 16);
  return u.buffer;
}

export async function hashPassword(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  // Cloudflare Workerd принимает формат 'raw'. В Node.js (локальные тесты) для PBKDF2
  // нужен DER-ключ PKCS#8 — собираем его детерминированно из пароля. Оба варианта дают
  // одинаковый результат PBKDF2 при одинаковых соли и итерациях.
  let key;
  try {
    key = await crypto.subtle.importKey('raw', enc.encode(password), 'pbkdf2', false, ['deriveBits']);
  } catch (e) {
    if (e && e.name === 'DataError') {
      const pw = enc.encode(password);
      const prefix = new Uint8Array([0x30, 0x81, 0xC4, 0x30, 0x81, 0xC1, 0x02, 0x01, 0x00, 0x30, 0x0D,
        0x06, 0x09, 0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x05, 0x0B, 0x05, 0x00, 0x04, 0x81, 0xAB]);
      const inner = new Uint8Array([0x02, 0x01, 0x20, 0x04, pw.length, ...pw]);
      const der = new Uint8Array(prefix.length + inner.length);
      der.set(prefix, 0); der.set(inner, prefix.length);
      key = await crypto.subtle.importKey('pkcs8', der, 'pbkdf2', false, ['deriveBits']);
    } else {
      throw e;
    }
  }
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBuf(saltHex), iterations, hash: 'SHA-256' },
    key,
    256
  );
  return bufToHex(bits);
}

export async function createPasswordRecord(password) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('password-too-short');
  if (password.length > 200) throw new Error('password-too-long');
  const salt = bufToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPassword(password, salt);
  return JSON.stringify({ algo: 'pbkdf2-sha256', iterations: PBKDF2_ITERATIONS, salt, hash });
}

// Сравнение без зависимости от времени, чтобы нельзя было угадать хеш по длительности ответа.
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, recordJson) {
  let rec;
  try { rec = JSON.parse(recordJson); } catch (e) { return false; }
  if (!rec || rec.algo !== 'pbkdf2-sha256' || !rec.salt || !rec.hash) return false;
  const hash = await hashPassword(password, rec.salt, rec.iterations || PBKDF2_ITERATIONS);
  return safeEqualHex(hash, rec.hash);
}

// ---------- Сессии ----------
// Формат cookie: "случайный_id.подпись" (HMAC-SHA256). Без подписи подделать cookie нельзя.
// В D1 хранится только id сессии (не токен целиком) — это позволяет выйти и аннулировать сессию.

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bufToHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export async function createSession(env) {
  const id = bufToHex(crypto.getRandomValues(new Uint8Array(32)));
  const secret = await getOrCreateSessionSecret(env);
  const sig = await hmac(secret, id);
  const token = id + '.' + sig;
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 дней
  await env.DB.prepare('INSERT INTO sessions (id, expires_at) VALUES (?, ?)').bind(id, expiresAt).run();
  return { token, expiresAt };
}

export function sessionCookie(token, expiresAt) {
  return `larpdeez_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))}`;
}
export function clearSessionCookie() {
  return 'larpdeez_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

export async function getSessionUser(env, request) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token = cookies['larpdeez_session'];
  if (!token || token.indexOf('.') === -1) return null;
  const [id, sig] = token.split('.', 2);
  if (!/^[0-9a-f]{64}$/.test(id) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const secret = await getSetting(env, 'session_secret');
  if (!secret) return null;
  const expected = await hmac(secret, id);
  if (!safeEqualHex(sig, expected)) return null;
  const row = await env.DB.prepare('SELECT id, expires_at FROM sessions WHERE id = ?').bind(id).first();
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return null;
  }
  return { id };
}

export async function requireAuth(env, request) {
  const user = await getSessionUser(env, request);
  if (!user) throw Object.assign(new Error('unauthorized'), { status: 401 });
  return user;
}

export async function destroySession(env, request) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token = cookies['larpdeez_session'] || '';
  const id = token.split('.')[0];
  if (/^[0-9a-f]{64}$/.test(id)) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
  }
}

// Секрет для подписи сессий генерируется один раз при первом входе и хранится в D1.
// Его не нужно нигде задавать вручную.
async function getOrCreateSessionSecret(env) {
  let secret = await getSetting(env, 'session_secret');
  if (!secret) {
    secret = bufToHex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING')
      .bind('session_secret', secret).run();
    secret = await getSetting(env, 'session_secret');
  }
  return secret;
}

// ---------- CSRF ----------
// Двойная проверка токена: токен хранится в НЕ-httpOnly cookie и обязан прийти в заголовке X-CSRF-Token.
// С стороннего сайта такой заголовок послать нельзя.
export function csrfCookie() {
  const token = bufToHex(crypto.getRandomValues(new Uint8Array(32)));
  return `larpdeez_csrf=${token}; Path=/; SameSite=Lax; Secure`;
}
export function checkCsrf(request, session) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const fromCookie = cookies['larpdeez_csrf'] || '';
  const fromHeader = request.headers.get('X-CSRF-Token') || '';
  if (!fromCookie || !session) return false;
  return fromCookie === fromHeader;
}

// ---------- Ограничение частоты попыток входа ----------
// Простой подсчёт неудачных попыток за последние 15 минут.
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_ATTEMPTS = 10;

export async function checkRateLimit(env, action) {
  await env.DB.prepare('DELETE FROM rate_limits WHERE attempted_at < ?').bind(Date.now() - RATE_WINDOW_MS).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM rate_limits WHERE action = ? AND attempted_at > ?')
    .bind(action, Date.now() - RATE_WINDOW_MS).first();
  if (row && Number(row.c) >= RATE_MAX_ATTEMPTS) {
    return err('rate-limited', 'Слишком много попыток. Подождите 15 минут и попробуйте снова.', 429);
  }
  return null;
}
export async function recordFailedAttempt(env, action) {
  await env.DB.prepare('INSERT INTO rate_limits (action, attempted_at) VALUES (?, ?)').bind(action, Date.now()).run();
}
export async function clearFailedAttempts(env, action) {
  await env.DB.prepare('DELETE FROM rate_limits WHERE action = ?').bind(action).run();
}

// ---------- Разбор тела запроса и cookie ----------
export async function readJson(request) {
  try { return await request.json(); } catch (e) { return {}; }
}
export function parseCookies(header) {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ---------- Общая обработка ошибок ----------
export function handle(fn) {
  return async function (context) {
    try {
      return await fn(context);
    } catch (e) {
      if (e && e.status === 401) return err('unauthorized', 'Нужно войти в систему.', 401);
      if (e && e.message === 'csrf') return err('csrf', 'Ошибка защиты от CSRF. Обновите страницу.', 403);
      console.error(e);
      return err('server-error', 'Внутренняя ошибка сервера. Подробности — в логах Functions.', 500);
    }
  };
}
