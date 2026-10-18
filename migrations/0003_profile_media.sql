-- Этап 2: профиль — аватар (эмодзи или изображение data-URL) и баннер.
-- Колонки добавляются аддитивно; старые данные сохраняются.

ALTER TABLE profile ADD COLUMN avatar_image TEXT NOT NULL DEFAULT ''; -- data:image/... или ''
ALTER TABLE profile ADD COLUMN banner TEXT NOT NULL DEFAULT 'gradient-1'; -- preset или data:image/...
