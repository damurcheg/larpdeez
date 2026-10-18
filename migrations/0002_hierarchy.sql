-- Этап 1: иерархия Курс → Модуль → Дисциплина → Тема → Задание,
-- финальные проекты модулей, события календаря, настройки пользователя.
-- Миграция аддитивная: существующие таблицы и данные не удаляются.

CREATE TABLE IF NOT EXISTS modules (
  id           TEXT PRIMARY KEY,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  color        TEXT NOT NULL DEFAULT '',            -- '' = наследовать цвет курса
  tags         TEXT NOT NULL DEFAULT '[]',          -- JSON-массив, до 6 тегов
  position     INTEGER NOT NULL DEFAULT 0,
  final_enabled INTEGER NOT NULL DEFAULT 0,         -- включён ли финальный проект
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id, position);

CREATE TABLE IF NOT EXISTS disciplines (
  id          TEXT PRIMARY KEY,
  module_id   TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '',             -- '' = наследовать цвет модуля
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_disciplines_module ON disciplines(module_id, position);

-- Темы. content — описание/содержимое; links — JSON-массив [{url,label}].
CREATE TABLE IF NOT EXISTS topics (
  id             TEXT PRIMARY KEY,
  discipline_id  TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  content        TEXT NOT NULL DEFAULT '',
  date           TEXT NOT NULL DEFAULT '',          -- 'YYYY-MM-DD' или ''
  links          TEXT NOT NULL DEFAULT '[]',
  color          TEXT NOT NULL DEFAULT '',          -- '' = наследовать цвет дисциплины
  done           INTEGER NOT NULL DEFAULT 0,
  done_at        INTEGER,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topics_discipline ON topics(discipline_id, position);
CREATE INDEX IF NOT EXISTS idx_topics_date ON topics(date);

-- Задания при темах. grade: NULL = не оценено (не участвует в среднем балле), иначе 0..100.
CREATE TABLE IF NOT EXISTS assignments (
  id         TEXT PRIMARY KEY,
  topic_id   TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  criteria   TEXT NOT NULL DEFAULT '[]',            -- JSON-массив строк
  done       INTEGER NOT NULL DEFAULT 0,
  done_at    INTEGER,
  grade      INTEGER,
  color      TEXT NOT NULL DEFAULT '',              -- '' = наследовать цвет темы
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assignments_topic ON assignments(topic_id, position);

-- Финальный проект модуля (0..1 на модуль).
CREATE TABLE IF NOT EXISTS final_projects (
  id          TEXT PRIMARY KEY,
  module_id   TEXT NOT NULL UNIQUE REFERENCES modules(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Финальный проект',
  description TEXT NOT NULL DEFAULT '',
  due_date    TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'flag',
  criteria    TEXT NOT NULL DEFAULT '[]',           -- JSON-массив {text,done}
  links       TEXT NOT NULL DEFAULT '[]',           -- JSON-массив {url,label}
  status      TEXT NOT NULL DEFAULT 'todo',         -- todo | in_progress | done
  grade       INTEGER,                              -- NULL = не оценено
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Пользовательские события календаря (существуют отдельно от структуры курса).
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  date        TEXT NOT NULL,                        -- 'YYYY-MM-DD'
  time        TEXT NOT NULL DEFAULT '',             -- 'HH:MM' или ''
  icon        TEXT NOT NULL DEFAULT 'calendar',
  color       TEXT NOT NULL DEFAULT '#007AFF',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

-- Настройки пользователя (тема интерфейса, главный курс, скрытие завершённых тем в планере).
-- Значения хранятся как JSON.
CREATE TABLE IF NOT EXISTS user_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
