-- Начальная схема базы данных Larpdeez.
-- Применять командой: npx wrangler d1 migrations apply larpdeez-data --remote

-- Настройки платформы (одна строка): состояние первоначальной настройки и хеш пароля.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Профиль пользователя (платформа личная, пользователь один).
CREATE TABLE IF NOT EXISTS profile (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  name       TEXT NOT NULL DEFAULT '',
  avatar_emoji TEXT NOT NULL DEFAULT '🎓',
  about      TEXT NOT NULL DEFAULT ''
);

-- Курсы.
CREATE TABLE IF NOT EXISTS courses (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '#6c5ce7',
  emoji       TEXT NOT NULL DEFAULT '📘',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Учебные материалы внутри курса.
-- kind: 'lesson' (урок) или 'task' (задание).
-- content — текст материала; для задания может содержать чек-лист в виде markdown-строк "- [ ] ...".
CREATE TABLE IF NOT EXISTS materials (
  id        TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL DEFAULT 'lesson',
  title     TEXT NOT NULL,
  content   TEXT NOT NULL DEFAULT '',
  position  INTEGER NOT NULL DEFAULT 0
);

-- Прогресс по материалам: отмечен ли материал пройденным.
CREATE TABLE IF NOT EXISTS progress (
  material_id TEXT PRIMARY KEY REFERENCES materials(id) ON DELETE CASCADE,
  done        INTEGER NOT NULL DEFAULT 0,
  done_at     INTEGER
);

-- Сессии входа. Хранится только случайный id; подпись токена сервер проверяет через HMAC.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  expires_at INTEGER NOT NULL
);

-- Неудачные попытки входа (для ограничения частоты).
CREATE TABLE IF NOT EXISTS rate_limits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  action       TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);

-- Строка профиля существует всегда (приложение рассчитывает на неё).
INSERT OR IGNORE INTO profile (id, name) VALUES (1, '');
