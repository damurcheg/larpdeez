// Логика страницы курса (course.html): загрузка курса, материалы, прогресс, редактирование.

(async function () {
  const courseId = new URLSearchParams(location.search).get('id');
  const titleEl = document.getElementById('course-title');
  const descEl = document.getElementById('course-desc');
  const listEl = document.getElementById('material-list');
  const progressTextEl = document.getElementById('course-progress-text');
  const progressBarEl = document.getElementById('course-progress-bar');

  if (!courseId) {
    location.href = '/index.html';
    return;
  }

  // Проверка входа делает app.js: при отсутствии сессии редиректит на /login.html.
  let profile;
  try {
    profile = await Larpdeez.requirePageAuth();
  } catch (e) { return; }

  Larpdeez.renderTopbar('courses');
  Larpdeez.setTopbarUser(profile);

  let courseData = null;

  function render() {
    const c = courseData.course;
    document.title = c.title + ' — Larpdeez';
    titleEl.textContent = (c.emoji || '📘') + ' ' + c.title;
    descEl.textContent = c.description || '';

    const total = courseData.materials.length;
    const done = courseData.materials.filter((m) => m.done).length;
    const pct = Larpdeez.progressPercent(done, total);
    progressTextEl.textContent = total
      ? `Пройдено ${done} из ${total} (${pct}%)`
      : 'Материалов пока нет — добавьте первый урок или задание.';
    progressBarEl.style.width = pct + '%';

    listEl.innerHTML = '';
    if (!courseData.materials.length) {
      listEl.innerHTML = '<div class="empty"><div class="big">📭</div><p>Здесь пока пусто.</p></div>';
      return;
    }
    for (const m of courseData.materials) {
      const li = document.createElement('li');
      li.className = 'material-item card' + (m.done ? ' done' : '');

      const check = document.createElement('button');
      check.className = 'check';
      check.type = 'button';
      check.title = m.done ? 'Снять отметку' : 'Отметить пройденным';
      check.textContent = m.done ? '✓' : '';
      check.addEventListener('click', () => toggleDone(m));

      const body = document.createElement('div');
      body.className = 'm-body';

      const h = document.createElement('h3');
      h.className = 'm-title';
      h.textContent = m.title;
      const badge = document.createElement('span');
      badge.className = 'kind-badge';
      badge.textContent = m.kind === 'task' ? 'Задание' : 'Урок';
      h.appendChild(badge);
      body.appendChild(h);

      if (m.content) {
        const p = document.createElement('p');
        p.className = 'm-content';
        p.textContent = m.content;
        body.appendChild(p);
      }

      const actions = document.createElement('div');
      actions.style.marginTop = '8px';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn secondary small';
      editBtn.textContent = '✏️ Изменить';
      editBtn.addEventListener('click', () => openMaterialModal(m));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn danger small';
      delBtn.style.marginLeft = '8px';
      delBtn.textContent = '🗑 Удалить';
      delBtn.addEventListener('click', () => deleteMaterial(m));
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      body.appendChild(actions);

      li.appendChild(check);
      li.appendChild(body);
      listEl.appendChild(li);
    }
  }

  async function load() {
    try {
      courseData = await Larpdeez.api('courses/' + encodeURIComponent(courseId));
      render();
    } catch (e) {
      if (e.code === 'unauthorized') return; // уже редиректим
      Larpdeez.showNotice('course-notice', e.message || 'Не удалось загрузить курс.', 'error');
      if (e.code === 'not-found') {
        setTimeout(() => { location.href = '/index.html'; }, 1500);
      }
    }
  }

  async function toggleDone(m) {
    // Сначала меняем интерфейс, потом подтверждаем сервером; при ошибке откатываем.
    m.done = !m.done;
    render();
    try {
      await Larpdeez.api('progress', { method: 'POST', body: { materialId: m.id, done: m.done } });
    } catch (e) {
      m.done = !m.done;
      render();
      Larpdeez.showNotice('course-notice', 'Прогресс не сохранился: ' + (e.message || 'ошибка сети'), 'error');
    }
  }

  function materialFieldsHtml(m) {
    m = m || { title: '', kind: 'lesson', content: '' };
    return `
      <label>Тип
        <select name="kind">
          <option value="lesson" ${m.kind === 'lesson' ? 'selected' : ''}>Урок</option>
          <option value="task" ${m.kind === 'task' ? 'selected' : ''}>Задание</option>
        </select>
      </label>
      <label>Название
        <input type="text" name="title" maxlength="300" required value="${Larpdeez.escapeHtml(m.title)}">
      </label>
      <label>Содержание
        <textarea name="content" placeholder="Текст урока или условия задания">${Larpdeez.escapeHtml(m.content)}</textarea>
      </label>`;
  }

  function openMaterialModal(existing) {
    Larpdeez.openModal(
      existing ? 'Изменить материал' : 'Новый материал',
      materialFieldsHtml(existing),
      async (fd) => {
        const payload = {
          kind: fd.get('kind'),
          title: fd.get('title'),
          content: fd.get('content'),
        };
        if (existing) {
          await Larpdeez.api(`courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(existing.id)}`,
            { method: 'PUT', body: payload });
        } else {
          await Larpdeez.api(`courses/${encodeURIComponent(courseId)}/materials`,
            { method: 'POST', body: payload });
        }
        await load();
      },
      'Сохранить'
    );
  }

  async function deleteMaterial(m) {
    if (!confirm(`Удалить «${m.title}» вместе с прогрессом?`)) return;
    try {
      await Larpdeez.api(`courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(m.id)}`,
        { method: 'DELETE' });
      await load();
    } catch (e) {
      Larpdeez.showNotice('course-notice', 'Не удалось удалить: ' + (e.message || ''), 'error');
    }
  }

  // Кнопки страницы
  document.getElementById('add-material-btn').addEventListener('click', () => openMaterialModal(null));
  document.getElementById('edit-course-btn').addEventListener('click', () => {
    const c = courseData.course;
    Larpdeez.openModal('Настройки курса', `
      <label>Название
        <input type="text" name="title" maxlength="200" required value="${Larpdeez.escapeHtml(c.title)}">
      </label>
      <label>Описание
        <textarea name="description" style="min-height:70px">${Larpdeez.escapeHtml(c.description)}</textarea>
      </label>
      <label>Цвет карточки
        <input type="color" name="color" value="${Larpdeez.escapeHtml(c.color || '#6c5ce7')}">
      </label>
      <label>Эмодзи
        <input type="text" name="emoji" maxlength="4" value="${Larpdeez.escapeHtml(c.emoji || '📘')}">
      </label>`,
      async (fd) => {
        await Larpdeez.api('courses/' + encodeURIComponent(courseId), {
          method: 'PUT',
          body: {
            title: fd.get('title'),
            description: fd.get('description'),
            color: fd.get('color'),
            emoji: fd.get('emoji'),
          },
        });
        await load();
      }, 'Сохранить');
  });
  document.getElementById('delete-course-btn').addEventListener('click', async () => {
    if (!confirm('Удалить этот курс, все его материалы и прогресс? Это действие необратимо.')) return;
    try {
      await Larpdeez.api('courses/' + encodeURIComponent(courseId), { method: 'DELETE' });
      location.href = '/index.html';
    } catch (e) {
      Larpdeez.showNotice('course-notice', 'Не удалось удалить курс: ' + (e.message || ''), 'error');
    }
  });

  await load();
})();
