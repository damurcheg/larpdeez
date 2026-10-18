// Страница «Мои курсы» (courses.html) — дизайн-система Larpdeez.
// Данные: GET /api/courses (реальные, без фиктивных значений).
(function () {
  const esc = UI.esc;
  let courses = [];
  let query = '';
  let sort = 'updated';
  let view = localStorage.getItem('larpdeez-courses-view') || 'grid';

  const gridEl = document.getElementById('course-grid');
  const emptyEl = document.getElementById('empty-courses');
  const searchEl = document.getElementById('course-search');

  document.getElementById('search-lead').innerHTML = LD.icon('search', 14);
  document.getElementById('new-course-btn').innerHTML = LD.icon('plus', 15) + ' Создать курс';
  document.getElementById('view-grid').innerHTML = LD.icon('layout-dashboard', 14) + '<span class="nav-label">Сетка</span>';
  document.getElementById('view-list').innerHTML = LD.icon('list-checks', 14) + '<span class="nav-label">Список</span>';
  document.getElementById('empty-ic').innerHTML = LD.icon('book-open', 28);

  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }

  function filtered() {
    let list = courses.slice();
    if (query) {
      const q = norm(query);
      list = list.filter((c) => norm(c.title).includes(q) || norm(c.description).includes(q));
    }
    switch (sort) {
      case 'created': list.sort((a, b) => b.createdAt - a.createdAt); break;
      case 'alpha': list.sort((a, b) => a.title.localeCompare(b.title, 'ru')); break;
      case 'progress': list.sort((a, b) => (b.progressPercent || 0) - (a.progressPercent || 0)); break;
      default: list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return list;
  }

  function menuFor(c, anchor) {
    UI.rowMenu(anchor, [
      { id: 'open', label: 'Открыть в редакторе', icon: 'external-link', action: () => { location.href = '/editor.html?course=' + c.id; } },
      { id: 'primary', label: c.isPrimary ? 'Убрать главный курс' : 'Сделать главным курсом', icon: 'star', action: async () => {
          try {
            await UI.setSetting('primaryCourseId', c.isPrimary ? '' : c.id);
            await UI.loadCourses(true);
            UI.toast(c.isPrimary ? 'Главный курс убран' : 'Курс стал главным', 'success');
            render();
          } catch (e) { UI.toast(e.message || 'Не удалось изменить настройку', 'error'); }
        } },
      { id: 'edit', label: 'Настройки курса', icon: 'settings', action: async () => {
          const r = await UI.editCourseDialog(c);
          if (r) { await UI.loadCourses(true); render(); }
        } },
      { sep: true },
      { id: 'del', label: 'Удалить курс', icon: 'trash-2', danger: true, action: async () => {
          const ok = await UI.confirmDialog('Удалить курс «' + c.title + '»?',
            'Будут удалены все модули, темы, задания и прогресс курса. Действие необратимо.', 'Удалить');
          if (!ok) return;
          try {
            await Larpdeez.api('courses/' + encodeURIComponent(c.id), { method: 'DELETE' });
            await UI.loadCourses(true);
            UI.toast('Курс удалён', 'success');
            render();
          } catch (e) { UI.toast(e.message || 'Не удалось удалить курс', 'error'); }
        } },
    ]);
  }

  function cardHtml(c) {
    const pct = c.progressPercent || 0;
    const tint = UI.tintForHex(c.color) || UI.tintHash(c.color);
    const doneTxt = c.hierarchical
      ? `${c.doneTopics} из ${c.totalTopics} тем`
      : `${c.doneMaterials} из ${c.totalMaterials} материалов`;
    const grade = c.averageGrade != null ? `<span class="grade-chip">${LD.icon('award', 12)} ${c.averageGrade}</span>` : '';
    if (view === 'list') {
      return `<div class="course-card" data-id="${c.id}">
        <span class="cc-icon ${tint}">${LD.icon(UI.iconName(c.emoji), 16)}</span>
        <div class="cc-main">
          <h3 class="cc-title truncate">${esc(c.title)}${c.isPrimary ? `<span class="chip primary" style="margin-left:8px">${LD.icon('star', 11)} Главный</span>` : ''}</h3>
          <span class="cc-desc muted small">${esc(c.description) || '&nbsp;'}</span>
        </div>
        <div class="cc-side">
          <div class="progress-bar"><div style="width:${pct}%"></div></div>
          <div class="progress-label">${doneTxt} · ${pct}%</div>
        </div>
        ${grade}
        <button class="icon-btn" data-menu="${c.id}" type="button" title="Действия">${LD.icon('more-horizontal', 16)}</button>
      </div>`;
    }
    return `<article class="course-card" data-id="${c.id}">
      <div class="cc-top">
        <span class="cc-icon ${tint}">${LD.icon(UI.iconName(c.emoji), 16)}</span>
        <h3 class="cc-title">${esc(c.title)}</h3>
        ${c.isPrimary ? `<span class="chip primary">${LD.icon('star', 11)} Главный</span>` : ''}
        <button class="icon-btn cc-menu" data-menu="${c.id}" type="button" title="Действия">${LD.icon('more-horizontal', 16)}</button>
      </div>
      <p class="cc-desc">${esc(c.description) || '<span class="muted">Без описания</span>'}</p>
      <div class="cc-progress">
        <div class="progress-bar"><div style="width:${pct}%"></div></div>
        <div class="progress-label">${doneTxt} · ${pct}%</div>
      </div>
      <div class="cc-foot">
        ${grade || `<span class="small muted">Оценок пока нет</span>`}
        <span class="small muted">${LD.icon('clock', 12)} изменён ${UI.fmtDateTime(c.updatedAt) || '—'}</span>
      </div>
    </article>`;
  }

  function render() {
    const list = filtered();
    gridEl.className = view === 'list' ? 'course-list' : 'course-grid';
    gridEl.innerHTML = list.map(cardHtml).join('');
    emptyEl.classList.toggle('hidden', list.length > 0);
    if (!courses.length) {
      document.getElementById('empty-text').textContent = 'Курсов пока нет. Создайте первый — например, «Испанский с нуля» или «Основы программирования».';
    } else {
      document.getElementById('empty-text').textContent = 'По запросу «' + query + '» ничего не найдено.';
    }
    document.getElementById('courses-sub').textContent = courses.length
      ? `Всего курсов: ${courses.length}. Нажмите на карточку, чтобы открыть редактор.`
      : 'Здесь хранятся ваши курсы, материалы и прогресс обучения. Всё сохраняется в облаке (Cloudflare D1).';
    updateSeg();
  }

  function updateSeg() {
    document.querySelectorAll('.seg [data-view]').forEach((b) => {
      b.classList.toggle('selected', b.dataset.view === view);
    });
  }

  gridEl.addEventListener('click', (e) => {
    const menuBtn = e.target.closest('[data-menu]');
    if (menuBtn) {
      e.stopPropagation();
      const c = courses.find((x) => x.id === menuBtn.dataset.menu);
      if (c) menuFor(c, menuBtn);
      return;
    }
    const card = e.target.closest('.course-card');
    if (card) location.href = '/editor.html?course=' + card.dataset.id;
  });
  gridEl.style.cursor = 'default';
  gridEl.addEventListener('mouseover', (e) => {
    const card = e.target.closest('.course-card');
    gridEl.style.cursor = card ? 'pointer' : 'default';
  });

  searchEl.addEventListener('input', UI.debounce(() => { query = searchEl.value.trim(); render(); }, 150));
  document.getElementById('course-sort').addEventListener('change', (e) => { sort = e.target.value; render(); });
  document.querySelectorAll('.seg [data-view]').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view;
    localStorage.setItem('larpdeez-courses-view', view);
    render();
  }));

  async function createCourse() {
    const id = await UI.newCourseDialog();
    if (id) location.href = '/editor.html?course=' + encodeURIComponent(id);
  }
  document.getElementById('new-course-btn').addEventListener('click', createCourse);
  document.getElementById('empty-create-btn').addEventListener('click', createCourse);

  (async function init() {
    UI.renderShell('courses', { crumbs: [{ label: 'Курсы' }] });
    try {
      await UI.loadSession();
    } catch (e) { return; } // не авторизованы — app.js уведёт на /login.html
    courses = UI.getCourses();
    render();
    // Обновляем список, если данные догрузились позже.
    const fresh = await UI.loadCourses(true).catch(() => courses);
    courses = fresh;
    render();
  })();
})();
