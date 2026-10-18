import { json, err, handle, requireAuth, checkCsrf, readJson } from '../lib/common.js';

// Профиль: имя, аватар (эмодзи или изображение data-URL), баннер, «о себе».
// Данные хранятся в D1 и видны со всех устройств.

const PRESET_BANNERS = new Set([
  'gradient-1', 'gradient-2', 'gradient-3', 'gradient-4', 'gradient-5', 'gradient-6',
  'mesh-blue', 'mesh-lime', 'mesh-purple', 'solid-gray',
]);
const MAX_DATA_URL = 700 * 1024; // ~700 КБ на строку — безопасно для D1

function cleanDataImage(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s) return '';
  if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return null;
  if (s.length > MAX_DATA_URL) return null;
  return s;
}

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAuth(env, request);
  const p = await env.DB.prepare(
    'SELECT name, avatar_emoji, about, avatar_image, banner FROM profile WHERE id = 1'
  ).first();
  return json({
    name: (p && p.name) || '',
    avatarEmoji: (p && p.avatar_emoji) || '🎓',
    about: (p && p.about) || '',
    avatarImage: (p && p.avatar_image) || '',
    banner: (p && p.banner) || 'gradient-1',
  });
});

export const onRequestPut = handle(async ({ request, env }) => {
  const session = await requireAuth(env, request);
  if (!checkCsrf(request, session)) throw new Error('csrf');

  const body = await readJson(request);
  const name = typeof body.name === 'string' ? body.name.slice(0, 100).trim() : '';
  const emoji = typeof body.avatarEmoji === 'string' ? Array.from(body.avatarEmoji.trim()).slice(0, 4).join('') : '🎓';
  const about = typeof body.about === 'string' ? body.about.slice(0, 2000) : '';

  let avatarImage;
  if (body.avatarImage === '' || body.avatarImage == null) avatarImage = '';
  else {
    const cleaned = cleanDataImage(body.avatarImage);
    if (cleaned === null) return err('bad-image', 'Изображение аватара некорректно или слишком большое (до ~500 КБ, png/jpg/webp).');
    avatarImage = cleaned;
  }

  let banner;
  if (typeof body.banner === 'string' && body.banner.trim()) {
    const b = body.banner.trim();
    if (PRESET_BANNERS.has(b)) banner = b;
    else {
      const cleaned = cleanDataImage(b);
      if (cleaned === null) return err('bad-banner', 'Баннер некорректен: выберите готовый вариант или загрузите изображение до ~500 КБ.');
      banner = cleaned;
    }
  } else {
    banner = 'gradient-1';
  }

  await env.DB.prepare('UPDATE profile SET name = ?, avatar_emoji = ?, about = ?, avatar_image = ?, banner = ? WHERE id = 1')
    .bind(name, emoji || '🎓', about, avatarImage, banner).run();
  return json({ ok: true });
});
