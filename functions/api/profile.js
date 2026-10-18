import { json, err, handle, requireAuth, checkCsrf, readJson } from '../lib/common.js';

// GET /api/profile — данные профиля.
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAuth(env, request);
  const p = await env.DB.prepare('SELECT name, avatar_emoji, about FROM profile WHERE id = 1').first();
  return json({
    name: (p && p.name) || '',
    avatarEmoji: (p && p.avatar_emoji) || '🎓',
    about: (p && p.about) || '',
  });
});

// PUT /api/profile — изменение профиля (имя, эмодзи аватара, описание).
export const onRequestPut = handle(async ({ request, env }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');

  const body = await readJson(request);
  const name = typeof body.name === 'string' ? body.name.slice(0, 100) : '';
  const emoji = typeof body.avatarEmoji === 'string' ? Array.from(body.avatarEmoji.trim()).slice(0, 4).join('') : '🎓';
  const about = typeof body.about === 'string' ? body.about.slice(0, 2000) : '';

  await env.DB.prepare('UPDATE profile SET name = ?, avatar_emoji = ?, about = ? WHERE id = 1')
    .bind(name, emoji || '🎓', about).run();
  return json({ ok: true });
});
