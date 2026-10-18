// ============================================================
// Larpdeez UI — каркас приложения и переиспользуемые компоненты.
// Зависимости: window.LD (icons.js), window.Larpdeez (app.js).
// ============================================================
(function () {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // ---------- Палитра акцентов ----------
  const PALETTE = [
    { key: 'blue', hex: '#007AFF', name: 'Синий' },
    { key: 'lime', hex: '#A3E635', name: 'Лаймовый' },
    { key: 'orange', hex: '#FF9500', name: 'Оранжевый' },
    { key: 'yellow', hex: '#FFD60A', name: 'Жёлтый' },
    { key: 'purple', hex: '#BF5AF2', name: 'Фиолетовый' },
    { key: 'turquoise', hex: '#40C8E0', name: 'Бирюзовый' },
    { key: 'pink', hex: '#FF2D92', name: 'Розовый' },
    { key: 'skyblue', hex: '#64D2FF', name: 'Голубой' },
    { key: 'gray', hex: '#8E8E93', name: 'Серый' },
    { key: 'coral', hex: '#FF6B6B', name: 'Коралловый' },
    { key: 'red', hex: '#FF3B30', name: 'Красный' },
  ];
  const HEX_TO_TINT = {};
  PALETTE.forEach((p) => { HEX_TO_TINT[p.hex.toLowerCase()] = 'tint-' + p.key; });

  function tintForHex(hex) {
    if (!hex) return '';
    return HEX_TO_TINT[String(hex).toLowerCase()] || '';
  }
  // Стабильный «природный» tint для произвольного hex (для курсов со случайным цветом)
  const TINT_KEYS = PALETTE.map((p) => 'tint-' + p.key);
  function tintHash(hex) {
    let h = 0;
    const s = String(hex || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return TINT_KEYS[h % TINT_KEYS.length];
  }
  // Класс цвета для узла дерева: '' = наследовать родителя
  function nodeTint(color, parentTint) {
    if (!color) return parentTint || 'tint-blue';
    return tintForHex(color) || tintHash(color);
  }

  // Иконки материалов/курсов: API хранит короткое имя ('book', 'star', ...)
  const ICON_ALIASES = {
    pen: 'pen-line', clipboard: 'clipboard-list', flask: 'flask-conical',
  };
  function iconName(name) { return ICON_ALIASES[name] || name || 'book'; }

  // ---------- Тема ----------
  // Настройка theme живёт на сервере (user_settings), localStorage — кэш,
  // чтобы тема применялась до загрузки данных.
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : theme === 'system' ? 'system' : 'light');
  }
  function cachedTheme() {
    try { return localStorage.getItem('larpdeez-theme') || 'system'; } catch (e) { return 'system'; }
  }
  applyTheme(cachedTheme());

  // ---------- Каркас: сайдбар + топбар ----------
  const NAV = [
    { id: 'home', href: '/index.html', icon: 'layout-dashboard', label: 'Главная' },
    { id: 'courses', href: '/courses.html', icon: 'book-open', label: 'Мои курсы' },
    { id: 'calendar', href: '/calendar.html', icon: 'calendar', label: 'Календарь' },
    { id: 'planner', href: '/planner.html', icon: 'list-checks', label: 'Планировщик' },
    { id: 'progress', href: '/progress.html', icon: 'trending-up', label: 'Прогресс' },
    { id: 'favorites', href: '/favorites.html', icon: 'star', label: 'Избранное' },
    { id: 'settings', href: '/settings.html', icon: 'settings', label: 'Настройки' },
  ];

  let shellState = { active: 'home', crumbs: [], profile: null, settings: null, courses: [] };

  // Единый каркас для всех страниц. Содержимое страницы берётся из
  // <main class="container"> (обычные страницы) или <main class="editor-layout"> (редактор).
  function renderShell(active, opts) {
    opts = opts || {};
    shellState.active = active;
    shellState.crumbs = opts.crumbs || [];
    if (document.getElementById('sidebar')) {
      // Каркас уже построен (повторный вызов) — обновляем только содержимое.
      if (opts.contentEl) {
        const holder = document.getElementById('page-holder');
        if (holder) { holder.innerHTML = ''; holder.appendChild(opts.contentEl); }
      }
      if (opts.narrow !== undefined) {
        const page = document.getElementById('page-content');
        if (page) page.classList.toggle('page-narrow', !!opts.narrow);
      }
      paintSidebar();
      paintTopbar(shellState.crumbs);
      return;
    }
    const isEditor = active === 'editor' || !!opts.editor ||
      !!(document.querySelector('main') && document.querySelector('main').classList.contains('editor-layout'));
    const oldMain = document.querySelector('main');
    const content = document.createElement('div');
    content.className = isEditor ? 'editor-layout' : ('page' + (opts.narrow ? ' page-narrow' : ''));
    content.id = 'page-content';
    if (oldMain) {
      if (isEditor) {
        // Редактор: переносим <main> целиком (внутри него aside + section),
        // иначе ломаются flex-раскладка и все ссылки на #tree-pane/#workspace.
        content.appendChild(oldMain.cloneNode(true));
        oldMain.replaceWith(content);
      } else {
        while (oldMain.firstChild) content.appendChild(oldMain.firstChild);
        oldMain.replaceWith(content);
      }
    }
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<aside class="sidebar" id="sidebar"></aside>' +
      '<div class="main-area">' +
        '<header class="topbar" id="topbar"></header>' +
        '<div id="page-holder"></div>' +
      '</div>';
    document.body.prepend(wrap);
    document.body.classList.add('has-sidebar');
    document.getElementById('page-holder').appendChild(content);
    initSidebar(document.getElementById('sidebar'));
    initTopbar(document.getElementById('topbar'));
    paintSidebar();
    paintTopbar(shellState.crumbs);
  }

  function collapsed() {
    try { return localStorage.getItem('larpdeez-sidebar-collapsed') === '1'; } catch (e) { return false; }
  }
  function setCollapsed(v) {
    try { localStorage.setItem('larpdeez-sidebar-collapsed', v ? '1' : '0'); } catch (e) {}
    paintSidebar();
  }

  function initSidebar(el) {
    el.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-nav]');
      if (link) closeMobileSidebar();
      if (e.target.closest('#sidebar-collapse')) { setCollapsed(!collapsed()); }
      if (e.target.closest('#sidebar-expand')) { setCollapsed(false); }
    });
  }

  function paintSidebar() {
    const el = document.getElementById('sidebar');
    if (!el) return;
    const isCollapsed = collapsed();
    el.classList.toggle('collapsed', isCollapsed);
    const navHtml = NAV.map((n) =>
      `<a href="${n.href}" data-nav class="${shellState.active === n.id ? 'active' : ''}" title="${esc(n.label)}">` +
      LD.icon(n.icon, 17) + `<span class="nav-label">${n.label}</span></a>`
    ).join('');
    const prof = shellState.profile || {};
    const avatar = prof.avatarImage
      ? `<img src="${esc(prof.avatarImage)}" alt="">`
      : esc(prof.avatarEmoji || '🎓');
    el.innerHTML =
      `<a class="sidebar-brand" href="/" title="Larpdeez">` +
        `<span class="brand-mark">${LD.icon('graduation-cap', 14)}</span>` +
        `<span class="nav-label">Larpdeez</span>` +
        (isCollapsed ? '' : `<button class="icon-btn small sidebar-toggle" id="sidebar-collapse" title="Свернуть панель" type="button">${LD.icon('panel-left-close', 16)}</button>`) +
      `</a>` +
      `<nav class="sidebar-nav">${navHtml}</nav>` +
      `<div class="sidebar-foot">` +
        `<a class="sidebar-user" href="/settings.html#profile" title="Профиль">` +
          `<span class="avatar-chip">${avatar}</span>` +
          `<span class="nav-label"><b>${esc(prof.name || 'Студент')}</b><em>Профиль и настройки</em></span>` +
        `</a>` +
        (isCollapsed ? `<button class="icon-btn small sidebar-expand" id="sidebar-expand" title="Развернуть панель" type="button">${LD.icon('panel-left-open', 16)}</button>` : '') +
      `</div>`;
  }

  function initTopbar(el) {
    el.addEventListener('click', (e) => {
      if (e.target.closest('#mobile-menu-btn')) {
        const sb = document.getElementById('sidebar');
        if (!sb.classList.contains('open')) {
          sb.classList.add('open');
          const scrim = document.createElement('div');
          scrim.className = 'scrim';
          scrim.addEventListener('click', closeMobileSidebar);
          document.body.appendChild(scrim);
        }
      }
      if (e.target.closest('#theme-cycle')) cycleTheme();
      if (e.target.closest('#profile-menu-btn')) openProfileMenu(e.target.closest('#profile-menu-btn'));
      if (e.target.closest('#global-search')) openCommandPalette();
      if (e.target.closest('[data-quick]')) quickAction(e.target.closest('[data-quick]').dataset.quick);
    });
    el.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommandPalette(); }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (!document.getElementById('cmd-palette')) { e.preventDefault(); openCommandPalette(); }
      }
    });
  }

  function closeMobileSidebar() {
    const sb = document.getElementById('sidebar');
    if (sb) sb.classList.remove('open');
    const scrim = document.querySelector('.scrim');
    if (scrim) scrim.remove();
  }

  function paintTopbar(crumbs) {
    const el = document.getElementById('topbar');
    if (!el) return;
    const crumbHtml = crumbs.length
      ? crumbs.map((c, i) =>
          (i === crumbs.length - 1
            ? `<b>${esc(c.label)}</b>`
            : `<a href="${c.href || '#'}">${esc(c.label)}</a><span class="crumb-sep">${LD.icon('chevron-right', 13)}</span>`)
        ).join('')
      : `<b>${esc((NAV.find((n) => n.id === shellState.active) || {}).label || 'Larpdeez')}</b>`;
    const prof = shellState.profile || {};
    const avatar = prof.avatarImage
      ? `<img src="${esc(prof.avatarImage)}" alt="">`
      : esc(prof.avatarEmoji || '🎓');
    el.innerHTML =
      `<button class="icon-btn menu-btn" id="mobile-menu-btn" title="Меню" type="button">${LD.icon('menu', 18)}</button>` +
      `<nav class="crumbs" aria-label="Навигационная цепочка">${crumbHtml}</nav>` +
      `<div class="spacer"></div>` +
      `<button class="search-trigger" id="global-search" type="button" title="Поиск по платформе (Ctrl+K)">` +
        LD.icon('search', 14) + `<span>Поиск…</span><kbd>⌘K</kbd>` +
      `</button>` +
      `<button class="btn secondary small" data-quick="course" type="button" title="Создать курс">${LD.icon('plus', 14)}<span class="hide-sm">Курс</span></button>` +
      `<button class="btn secondary small" data-quick="event" type="button" title="Создать событие">${LD.icon('calendar', 14)}<span class="hide-sm">Событие</span></button>` +
      `<button class="icon-btn" id="theme-cycle" title="Переключить тему" type="button">${themeIcon()}</button>` +
      `<button class="icon-btn avatar-btn" id="profile-menu-btn" title="Профиль" type="button"><span class="avatar-chip sm">${avatar}</span></button>`;
  }

  function themeIcon() {
    const t = effectiveThemePref();
    return LD.icon(t === 'dark' ? 'moon' : t === 'system' ? 'monitor' : 'sun', 16);
  }
  function themeLabel(t) { return t === 'dark' ? 'Тёмная' : t === 'system' ? 'Системная' : 'Светлая'; }

  function effectiveThemePref() {
    return (shellState.settings && shellState.settings.theme) || cachedTheme();
  }

  async function cycleTheme() {
    const order = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(effectiveThemePref()) + 1) % 3];
    await setSetting('theme', next);
    toast('Тема: ' + themeLabel(next));
    refreshThemeIcons();
  }
  function refreshThemeIcons() {
    const b = document.getElementById('theme-cycle');
    if (b) b.innerHTML = themeIcon();
    document.querySelectorAll('[data-theme-option]').forEach((el) => {
      el.classList.toggle('selected', el.dataset.themeOption === effectiveThemePref());
    });
  }

  function openProfileMenu(anchor) {
    const prof = shellState.profile || {};
    openPopover(anchor, `
      <div class="popover-profile-head">
        <span class="avatar-chip lg">${prof.avatarImage ? `<img src="${esc(prof.avatarImage)}" alt="">` : esc(prof.avatarEmoji || '🎓')}</span>
        <div><b>${esc(prof.name || 'Студент')}</b><em>Личный кабинет</em></div>
      </div>
      <div class="sep"></div>
      <a class="menu-item" href="/settings.html#profile">${LD.icon('user', 15)} Профиль</a>
      <a class="menu-item" href="/settings.html#appearance">${LD.icon('palette', 15)} Оформление</a>
      <a class="menu-item" href="/settings.html#security">${LD.icon('lock', 15)} Безопасность</a>
      <a class="menu-item" href="/settings.html#data">${LD.icon('download', 15)} Данные</a>
      <div class="sep"></div>
      <button data-action="logout" class="danger">${LD.icon('log-out', 15)} Выйти</button>
    `, (e) => {
      if (e.target.closest('[data-action="logout"]')) { Larpdeez.logout(); }
    });
  }

  // ---------- Быстрые действия ----------
  async function quickAction(kind) {
    if (kind === 'course') {
      const created = await newCourseDialog();
      if (created) location.href = '/editor.html?course=' + encodeURIComponent(created);
    } else if (kind === 'event') {
      const created = await newEventDialog();
      if (created) toast('Событие создано', 'success');
    } else if (kind === 'task') {
      const created = await newAssignmentDialog();
      if (created) toast('Задание создано', 'success');
    }
  }

  // ---------- Данные сессии ----------
  async function loadSession() {
    if (sessionPromise) return sessionPromise;
    sessionPromise = (async () => {
      const profile = await Larpdeez.api('profile');
      let settings = { theme: 'system', primaryCourseId: '', plannerHideDone: false };
      try { settings = await Larpdeez.api('settings'); } catch (e) { /* нет таблицы настроек — дефолт */ }
      applyTheme(settings.theme || 'system');
      try { localStorage.setItem('larpdeez-theme', settings.theme || 'system'); } catch (e) {}
      let courses = [];
      try { courses = (await Larpdeez.api('courses')).courses; } catch (e) { courses = []; }
      shellState.profile = profile;
      shellState.settings = settings;
      shellState.courses = courses;
      paintSidebar();
      paintTopbar(shellState.crumbs || []);
      refreshThemeIcons();
      return { profile, settings, courses };
    })().catch((e) => { sessionPromise = null; throw e; });
    return sessionPromise;
  }
  let sessionPromise = null;

  function getProfile() { return shellState.profile; }
  function getSettings() { return shellState.settings || { theme: 'system', primaryCourseId: '', plannerHideDone: false }; }
  function getCourses() { return shellState.courses || []; }
  function refreshCourses() { courseListPromise = null; return loadCourses(); }
  let courseListPromise = null;
  async function loadCourses(force) {
    if (force) courseListPromise = null;
    if (!courseListPromise) {
      courseListPromise = Larpdeez.api('courses').then((d) => {
        shellState.courses = d.courses;
        return d.courses;
      }).catch(() => shellState.courses || []);
    }
    return courseListPromise;
  }

  async function setSetting(key, value) {
    await Larpdeez.api('tree', {
      method: 'PATCH',
      body: { ops: [{ op: 'settings.set', key, value }] },
    });
    shellState.settings = Object.assign({}, shellState.settings, { [key]: value });
    if (key === 'theme') {
      applyTheme(value);
      try { localStorage.setItem('larpdeez-theme', value); } catch (e) {}
    }
    if (key === 'primaryCourseId') await loadCourses(true);
    return true;
  }

  // ---------- Операции над деревом ----------
  async function treeOps(ops, courseId) {
    const body = { ops };
    if (courseId) body.courseId = courseId;
    const res = await Larpdeez.api('tree', { method: 'PATCH', body });
    loadCourses(true); // обновлённые курсы (updated_at / прогресс) — без блокировки UI
    return res;
  }
  const uid = () => crypto.randomUUID();

  async function loadTree(courseId) {
    return Larpdeez.api('tree?course=' + encodeURIComponent(courseId));
  }

  // ---------- Диалоги ----------
  // UI.dialog({title, fields(html), onOk(values)->Promise, okLabel, wide, danger})
  // onOk возвращает ошибку через throw — она покажется внутри диалога.
  function dialog(opts) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'dialog-backdrop';
      backdrop.innerHTML =
        `<div class="dialog${opts.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.title)}">
          <div class="dialog-head"><h2 class="dialog-title">${esc(opts.title)}</h2>
            <button class="icon-btn" data-close type="button" title="Закрыть">${LD.icon('x', 16)}</button></div>
          <form id="ld-dialog-form">
            <div class="dialog-body">
              <div class="notice hidden" id="ld-dialog-notice"></div>
              ${opts.fields || ''}
            </div>
            <div class="dialog-foot">
              ${opts.cancelLabel === null ? '' : `<button type="button" class="btn secondary" data-close>${esc(opts.cancelLabel || 'Отмена')}</button>`}
              <button type="submit" class="btn${opts.danger ? ' danger' : ''}">${esc(opts.okLabel || 'Сохранить')}</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(backdrop);
      const form = backdrop.querySelector('form');
      const close = (result) => { backdrop.remove(); document.removeEventListener('keydown', onKey); resolve(result); };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onKey);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.closest('[data-close]')) close(null); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!opts.onOk) { close(collect(form)); return; }
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        const notice = backdrop.querySelector('#ld-dialog-notice');
        notice.classList.add('hidden');
        try {
          const r = await opts.onOk(collect(form));
          close(r === undefined ? collect(form) : r);
        } catch (err) {
          notice.textContent = err.message || 'Не удалось сохранить.';
          notice.className = 'notice show error';
          btn.disabled = false;
          notice.scrollIntoView({ block: 'nearest' });
        }
      });
      if (opts.onMount) { try { opts.onMount(backdrop); } catch (e) {} }
      setTimeout(() => {
        const first = form.querySelector('input:not([type="hidden"]), textarea, select, button[type="submit"]');
        if (first) first.focus();
      }, 30);
    });
  }
  function collect(form) {
    const fd = new FormData(form);
    const out = {};
    for (const [k, v] of fd.entries()) {
      if (out[k] !== undefined) { out[k] = [].concat(out[k], v); }
      else out[k] = v;
    }
    form.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (!out.hasOwnProperty(cb.name)) out[cb.name] = cb.checked; });
    return out;
  }

  function confirmDialog(title, message, okLabel) {
    return dialog({
      title,
      fields: `<p style="margin:0;color:var(--text-secondary)">${message}</p>`,
      okLabel: okLabel || 'Удалить',
      danger: true,
      onOk: async () => true,
    }).then((r) => r === true);
  }

  // ---------- Popover ----------
  function openPopover(anchor, html, onClick, opts) {
    closePopover();
    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.id = 'ld-popover';
    pop.innerHTML = html;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = (opts && opts.align === 'left') ? r.left : r.right - pw;
    left = Math.max(8, Math.min(left, innerWidth - pw - 8));
    let top = r.bottom + 6;
    if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    if (onClick) pop.addEventListener('click', onClick);
    const outside = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopover(); };
    const escH = (e) => { if (e.key === 'Escape') closePopover(); };
    setTimeout(() => {
      document.addEventListener('mousedown', outside);
      document.addEventListener('keydown', escH);
    }, 0);
    pop._cleanup = () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escH); };
    return pop;
  }
  function closePopover() {
    const p = document.getElementById('ld-popover');
    if (p) { if (p._cleanup) p._cleanup(); p.remove(); }
  }

  function rowMenu(anchor, items) {
    // items: [{label, icon, action, danger}]
    const html = items.map((it) =>
      it.sep ? '<div class="sep"></div>'
        : `<button data-mi="${esc(it.id)}" class="${it.danger ? 'danger' : ''}">${LD.icon(it.icon || 'more-horizontal', 15)} ${esc(it.label)}</button>`
    ).join('');
    openPopover(anchor, html, (e) => {
      const b = e.target.closest('button[data-mi]');
      if (!b) return;
      const it = items.find((x) => x.id === b.dataset.mi);
      closePopover();
      if (it && it.action) it.action();
    });
  }

  // ---------- Toast ----------
  function toast(text, type) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) { stack = document.createElement('div'); stack.className = 'toast-stack'; document.body.appendChild(stack); }
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    const ic = type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle' : 'info';
    t.innerHTML = LD.icon(ic, 15) + `<span>${esc(text)}</span>`;
    stack.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .2s'; setTimeout(() => t.remove(), 220); }, 2600);
  }

  // ---------- Color picker (инлайн-виджет внутри форм) ----------
  // UI.inlineColor(container, value, { allowEmpty, emptyLabel, onChange }) -> { get(), set(v) }
  function inlineColor(container, value, opts) {
    opts = opts || {};
    let cur = value ? String(value).toLowerCase() : '';
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'color-row';
    function paint() {
      row.innerHTML =
        `<span class="cr-preview${cur ? '' : ' empty'}"${cur ? ` style="--sw:${cur}"` : ''}>${cur ? '' : LD.icon('layers', 13)}</span>` +
        `<span class="cr-text">${cur ? esc(cur.toUpperCase()) : esc(opts.emptyLabel || 'Без цвета')}</span>` +
        LD.icon('chevron-down', 13);
      row.title = cur || (opts.emptyLabel || 'Без цвета');
    }
    paint();
    row.addEventListener('click', () => {
      const sel = cur;
      const swatches = PALETTE.map((p) =>
        `<button type="button" class="color-swatch${sel === p.hex.toLowerCase() ? ' selected' : ''}" data-hex="${p.hex}" style="--sw:${p.hex}" title="${p.name}">${sel === p.hex.toLowerCase() ? LD.icon('check', 14) : ''}</button>`
      ).join('');
      const pop = openPopover(row,
        `<div class="color-pop-body">
          <div class="color-swatches">${(opts.allowEmpty ? `<button type="button" class="color-swatch inherit${sel === '' ? ' selected' : ''}" data-hex="" title="${esc(opts.emptyLabel || 'Без цвета')}">${LD.icon('layers', 14)}</button>` : '') + swatches}</div>
          <div class="color-picker-hex">
            <input class="input" id="cp-hex-inp" value="${esc(sel)}" placeholder="#007aff" maxlength="7">
            <button type="button" class="btn secondary small" data-cp-apply>Ок</button>
          </div>
          <div class="field-error hidden" id="cp-err"></div>
        </div>`, (e) => {
          const sw = e.target.closest('.color-swatch');
          if (sw) {
            const hex = sw.dataset.hex;
            pop.querySelectorAll('.color-swatch').forEach((s) => { s.classList.remove('selected'); s.innerHTML = ''; });
            sw.classList.add('selected');
            if (hex) sw.innerHTML = LD.icon('check', 14);
            pop.querySelector('#cp-hex-inp').value = hex;
            return;
          }
          if (e.target.closest('[data-cp-apply]')) {
            const hex = String(pop.querySelector('#cp-hex-inp').value || '').trim().toLowerCase();
            const errEl = pop.querySelector('#cp-err');
            if (!hex) {
              if (opts.allowEmpty) { pick(''); } else { errEl.textContent = 'Выберите образец или введите цвет.'; errEl.classList.remove('hidden'); }
              return;
            }
            if (!/^#[0-9a-f]{6}$/.test(hex)) { errEl.textContent = 'Нужен формат #RRGGBB.'; errEl.classList.remove('hidden'); return; }
            pick(hex);
          }
        }, { align: 'left' });
      pop.classList.add('color-pop');
      function pick(hex) {
        cur = hex;
        paint();
        closePopover();
        if (opts.onChange) opts.onChange(cur);
      }
    });
    container.appendChild(row);
    return { get: () => cur, set: (v) => { cur = v ? String(v).toLowerCase() : ''; paint(); } };
  }

  // ---------- Date field (инлайн-поле с нативным календарём + кнопка «Сегодня») ----------
  function dateField(container, value, opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'date-field';
    wrap.innerHTML = `<input class="input" type="date"><button type="button" class="btn secondary small df-today">Сегодня</button>`;
    const inp = wrap.querySelector('input');
    inp.value = value || '';
    if (opts.name) inp.name = opts.name;
    if (opts.required) inp.required = true;
    wrap.querySelector('.df-today').addEventListener('click', () => { inp.value = todayISO(); if (opts.onChange) opts.onChange(inp.value); });
    inp.addEventListener('change', () => { if (opts.onChange) opts.onChange(inp.value); });
    container.appendChild(wrap);
    return { get: () => inp.value, set: (v) => { inp.value = v || ''; }, input: inp };
  }

  // ---------- Select popover (иконки/прочие списки) ----------
  function optionPicker(anchor, options, current, onPick) {
    const html = options.map((o) =>
      `<button data-val="${esc(o.value)}" class="${String(o.value) === String(current) ? 'picked' : ''}">${o.icon ? LD.icon(o.icon, 15) : ''}<span>${esc(o.label)}</span>${String(o.value) === String(current) ? LD.icon('check', 14) : ''}</button>`
    ).join('');
    openPopover(anchor, html, (e) => {
      const b = e.target.closest('button[data-val]');
      if (!b) return;
      closePopover();
      onPick(b.dataset.val);
    }, { align: 'left' });
  }

  // ---------- Формы верхнего уровня ----------
  const COURSE_ICONS = ['book', 'code', 'pen', 'flask', 'music', 'palette', 'star', 'trophy', 'target', 'flag', 'clipboard', 'calendar'];

  // Иконки узлов дерева: ключ API ('pen','clipboard','flask') -> имя иконки в LD.
  const NODE_ICON_ALIASES = { pen: 'pen-line', clipboard: 'clipboard-list', flask: 'flask-conical' };
  const MODULE_ICONS = ['layers', 'book', 'target', 'flag', 'star', 'trophy', 'code', 'palette', 'music', 'pen', 'flask', 'clipboard', 'calendar', 'hash'];
  const TOPIC_ICONS = ['file-text', 'book', 'star', 'flag', 'target', 'code', 'palette', 'music', 'pen', 'flask', 'clipboard', 'calendar', 'hash'];
  const ASSIGNMENT_ICONS = ['clipboard-list', 'check', 'flag', 'target', 'award', 'pen', 'book', 'code', 'star', 'hash'];
  function nodeIconName(name) { return NODE_ICON_ALIASES[name] || name; }

  // Слоты для иконок узлов: значение хранится в hidden-поле формы.
  function iconGridHtml(name, list, current) {
    return `<div class="icon-grid" data-icon-grid="${esc(name)}">${list.map((ic) =>
      `<button type="button" class="icon-choice${(current || '') === ic ? ' selected' : ''}" data-ic="${ic}" title="${ic}">${LD.icon(nodeIconName(ic), 16)}</button>`).join('')}</div>
      <input type="hidden" name="${esc(name)}" value="${esc(current || list[0])}">`;
  }
  function mountIconGrids(root) {
    (root || document).querySelectorAll('[data-icon-grid]').forEach((grid) => {
      grid.addEventListener('click', (e) => {
        const b = e.target.closest('.icon-choice');
        if (!b) return;
        grid.querySelectorAll('.icon-choice').forEach((s) => s.classList.remove('selected'));
        b.classList.add('selected');
        grid.nextElementSibling.value = b.dataset.ic;
      });
    });
  }

  // Единый «слот цвета» для инлайн-виджетов: значение читается из слота при отправке формы.
  function colorSlotHtml(name, value, emptyLabel) {
    return `<div class="color-slot" data-color-slot="${name || 'ld-color'}" data-color-value="${esc(value || '')}" data-color-empty="${esc(emptyLabel || 'Без цвета')}"></div>`;
  }
  function mountColors(root) {
    (root || document).querySelectorAll('[data-color-slot]').forEach((slot) => {
      UI.inlineColor(slot, slot.dataset.colorValue || '', {
        allowEmpty: true,
        emptyLabel: slot.dataset.colorEmpty || 'Без цвета',
      });
    });
  }
  function slotColor(root, name) {
    const w = root.querySelector(`[data-color-slot="${name}"] .color-row`);
    if (!w) return '';
    const t = String(w.title || '');
    return /^#[0-9a-f]{6}$/i.test(t) ? t.toLowerCase() : '';
  }

  function courseFields(c) {
    c = c || { title: '', description: '', color: '#007AFF', emoji: 'book' };
    const cc = String(c.color || '#007AFF').toLowerCase();
    return `
      <div class="field">
        <label for="cf-title">Название *</label>
        <input class="input" id="cf-title" name="title" maxlength="200" required value="${esc(c.title)}" placeholder="Например, Испанский с нуля">
      </div>
      <div class="field">
        <label for="cf-desc">Описание</label>
        <textarea class="textarea" id="cf-desc" name="description" maxlength="2000" placeholder="О чём этот курс?">${esc(c.description)}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Акцентный цвет</label>
          <div class="color-swatches compact" id="cf-colors">
            ${PALETTE.filter((p) => p.key !== 'red').map((p) => `<button type="button" class="color-swatch${cc === p.hex.toLowerCase() ? ' selected' : ''}" data-hex="${p.hex}" style="--sw:${p.hex}" title="${p.name}">${cc === p.hex.toLowerCase() ? LD.icon('check', 13) : ''}</button>`).join('')}
          </div>
          <input type="hidden" name="color" id="cf-color" value="${esc(cc)}">
        </div>
        <div class="field">
          <label>Иконка</label>
          <div class="icon-grid" id="cf-icons">
            ${COURSE_ICONS.map((ic) => `<button type="button" class="icon-choice${c.emoji === ic ? ' selected' : ''}" data-ic="${ic}" title="${ic}">${LD.icon(iconName(ic), 17)}</button>`).join('')}
          </div>
          <input type="hidden" name="emoji" id="cf-icon" value="${esc(c.emoji || 'book')}">
        </div>
      </div>`;
  }
  function wireSwatchGrid(root, gridSel, inputSel) {
    const grid = root.querySelector(gridSel);
    if (!grid) return;
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.color-swatch');
      if (!b) return;
      grid.querySelectorAll('.color-swatch').forEach((s) => { s.classList.remove('selected'); s.innerHTML = ''; });
      b.classList.add('selected');
      b.innerHTML = LD.icon('check', 13);
      root.querySelector(inputSel).value = b.dataset.hex;
    });
    const ig = root.querySelector('#cf-icons');
    if (ig) ig.addEventListener('click', (e) => {
      const b = e.target.closest('.icon-choice');
      if (!b) return;
      ig.querySelectorAll('.icon-choice').forEach((s) => s.classList.remove('selected'));
      b.classList.add('selected');
      root.querySelector('#cf-icon').value = b.dataset.ic;
    });
  }

  async function newCourseDialog() {
    let result;
    await new Promise((res) => {
      const d = dialog({
        title: 'Новый курс',
        okLabel: 'Создать',
        fields: courseFields(null),
        onOk: async (v) => {
          const title = String(v.title || '').trim();
          if (!title) throw new Error('Название курса обязательно.');
          const r = await Larpdeez.api('courses', { method: 'POST', body: { title, description: v.description, color: v.color, emoji: v.emoji } });
          result = r.id;
          return true;
        },
      });
      wireSwatchGrid(document.querySelector('.dialog-backdrop'), '#cf-colors', '#cf-color');
      d.finally(res);
    });
    if (result) { await loadCourses(true); }
    return result;
  }

  function editCourseDialog(course) {
    return new Promise((res) => {
      const d = dialog({
        title: 'Настройки курса',
        fields: courseFields(course),
        onOk: async (v) => {
          const title = String(v.title || '').trim();
          if (!title) throw new Error('Название курса обязательно.');
          await Larpdeez.api('courses/' + encodeURIComponent(course.id), {
            method: 'PUT',
            body: { title, description: v.description, color: v.color, emoji: v.emoji },
          });
          await loadCourses(true);
          toast('Курс обновлён', 'success');
          return true;
        },
      });
      wireSwatchGrid(document.querySelector('.dialog-backdrop'), '#cf-colors', '#cf-color');
      d.then((r) => res(r)).catch(() => res(null));
    });
  }

  const EVENT_ICONS = ['calendar', 'clock', 'bell', 'star', 'flag', 'target', 'book', 'trophy', 'code', 'palette', 'music', 'flask', 'pen', 'clipboard'];

  function eventFields(ev) {
    ev = ev || { title: '', description: '', date: todayISO(), time: '', icon: 'calendar', color: '#007AFF' };
    const ec = String(ev.color || '#007AFF').toLowerCase();
    return `
      <div class="field">
        <label for="ef-title">Название *</label>
        <input class="input" id="ef-title" name="title" maxlength="200" required value="${esc(ev.title)}" placeholder="Например, Консультация">
      </div>
      <div class="field-row">
        <div class="field"><label for="ef-date">Дата *</label>
          <input class="input" id="ef-date" name="date" type="date" required value="${esc(ev.date)}"></div>
        <div class="field"><label for="ef-time">Время</label>
          <input class="input" id="ef-time" name="time" type="time" value="${esc(ev.time)}"></div>
      </div>
      <div class="field">
        <label for="ef-desc">Описание</label>
        <textarea class="textarea" id="ef-desc" name="description" maxlength="2000" style="min-height:60px">${esc(ev.description)}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Цвет</label>
          <div class="color-swatches compact" id="ef-colors">
            ${PALETTE.map((p) => `<button type="button" class="color-swatch${ec === p.hex.toLowerCase() ? ' selected' : ''}" data-hex="${p.hex}" style="--sw:${p.hex}" title="${p.name}">${ec === p.hex.toLowerCase() ? LD.icon('check', 13) : ''}</button>`).join('')}
          </div>
          <input type="hidden" name="color" id="ef-color" value="${esc(ec)}">
        </div>
        <div class="field">
          <label>Иконка</label>
          <div class="icon-grid" id="ef-icons">
            ${EVENT_ICONS.map((ic) => `<button type="button" class="icon-choice${ev.icon === ic ? ' selected' : ''}" data-ic="${ic}">${LD.icon(iconName(ic), 16)}</button>`).join('')}
          </div>
          <input type="hidden" name="icon" id="ef-icon" value="${esc(ev.icon || 'calendar')}">
        </div>
      </div>`;
  }
  function wireEventPickers(root) {
    const grid = root.querySelector('#ef-colors');
    if (grid) grid.addEventListener('click', (e) => {
      const b = e.target.closest('.color-swatch'); if (!b) return;
      grid.querySelectorAll('.color-swatch').forEach((s) => { s.classList.remove('selected'); s.innerHTML = ''; });
      b.classList.add('selected'); b.innerHTML = LD.icon('check', 13);
      root.querySelector('#ef-color').value = b.dataset.hex;
    });
    const ig = root.querySelector('#ef-icons');
    if (ig) ig.addEventListener('click', (e) => {
      const b = e.target.closest('.icon-choice'); if (!b) return;
      ig.querySelectorAll('.icon-choice').forEach((s) => s.classList.remove('selected'));
      b.classList.add('selected');
      root.querySelector('#ef-icon').value = b.dataset.ic;
    });
  }

  async function newEventDialog(presetDate) {
    let result;
    const ev = { title: '', description: '', date: presetDate || todayISO(), time: '', icon: 'calendar', color: '#007AFF' };
    await new Promise((res) => {
      const d = dialog({
        title: 'Новое событие',
        okLabel: 'Создать',
        fields: eventFields(ev),
        onOk: async (v) => {
          const title = String(v.title || '').trim();
          if (!title) throw new Error('Название события обязательно.');
          if (!v.date) throw new Error('Укажите дату.');
          const r = await Larpdeez.api('events', { method: 'POST', body: { title, description: v.description, date: v.date, time: v.time, icon: v.icon, color: v.color } });
          result = r.id;
          return true;
        },
      });
      wireEventPickers(document.querySelector('.dialog-backdrop'));
      d.finally(res);
    });
    return result;
  }

  function editEventDialog(ev) {
    return new Promise((res) => {
      const d = dialog({
        title: 'Событие',
        fields: eventFields(ev),
        okLabel: 'Сохранить',
        onOk: async (v) => {
          const title = String(v.title || '').trim();
          if (!title) throw new Error('Название события обязательно.');
          if (!v.date) throw new Error('Укажите дату.');
          await Larpdeez.api('events', { method: 'PUT', body: { id: ev.id, title, description: v.description, date: v.date, time: v.time, icon: v.icon, color: v.color } });
          toast('Событие сохранено', 'success');
          return true;
        },
      });
      wireEventPickers(document.querySelector('.dialog-backdrop'));
      d.then((r) => res(r)).catch(() => res(null));
    });
  }

  // Быстрое задание: выбор темы из загруженных курсов требует дерева —
  // просим выбрать курс, подгружаем его дерево, показываем темы.
  async function newAssignmentDialog(presetTopicId) {
    const courses = getCourses();
    if (!courses.length) { toast('Сначала создайте курс', 'error'); return null; }
    let pickedTopic = null;
    const topicSelect = await new Promise((res) => {
      const d = dialog({
        title: 'Новое задание',
        okLabel: 'Далее',
        fields: `
          <div class="field">
            <label for="aa-course">Курс</label>
            <select class="input" id="aa-course" name="courseId">
              ${courses.map((c) => `<option value="${c.id}" ${c.isPrimary ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Тема задания</label>
            <div class="topic-load-zone" id="aa-topics"><span class="muted small">Загрузка тем…</span></div>
          </div>`,
        onOk: () => {
          if (!pickedTopic) throw new Error('Выберите тему.');
          return pickedTopic;
        },
      });
      const root = document.querySelector('.dialog-backdrop');
      const zone = root.querySelector('#aa-topics');
      const loadTopics = async () => {
        const cid = root.querySelector('#aa-course').value;
        try {
          const tree = await loadTree(cid);
          const topics = [];
          for (const m of tree.modules) for (const dd of m.disciplines) for (const t of dd.topics) {
            topics.push({ id: t.id, label: `${m.title} → ${dd.title} → ${t.title}` });
          }
          if (!topics.length) { zone.innerHTML = '<span class="muted small">В курсе пока нет тем. Создайте их в редакторе курса.</span>'; return; }
          zone.innerHTML = topics.map((tp) =>
            `<label class="radio topic-opt"><input type="radio" name="topic" value="${tp.id}" ${presetTopicId === tp.id ? 'checked' : ''}><span class="box">${LD.icon('check', 12)}</span><span class="small">${esc(tp.label)}</span></label>`
          ).join('');
          zone.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => { pickedTopic = inp.value; }));
          const first = zone.querySelector('input');
          if (first && !pickedTopic) { first.checked = true; pickedTopic = first.value; }
        } catch (e) { zone.innerHTML = '<span class="muted small">Не удалось загрузить темы.</span>'; }
      };
      root.querySelector('#aa-course').addEventListener('change', () => { pickedTopic = null; loadTopics(); });
      loadTopics();
      d.then((r) => res(r)).catch(() => res(null));
    });
    if (!topicSelect) return null;
    let created;
    await dialog({
      title: 'Новое задание',
      okLabel: 'Создать',
      fields: `
        <div class="field"><label for="na-title">Название *</label><input class="input" id="na-title" name="title" maxlength="300" required placeholder="Что нужно сделать"></div>
        <div class="field"><label for="na-desc">Описание</label><textarea class="textarea" id="na-desc" name="description" maxlength="5000" style="min-height:70px"></textarea></div>
        <div class="field"><label for="na-crit">Критерии оценки <span class="muted small">(по одному в строке)</span></label><textarea class="textarea" id="na-crit" name="criteria" style="min-height:56px"></textarea></div>`,
      onOk: async (v) => {
        const title = String(v.title || '').trim();
        if (!title) throw new Error('Название обязательно.');
        await treeOps([{ op: 'assignment.create', id: uid(), topicId: topicSelect, title, description: v.description, criteria: String(v.criteria || '').split('\n').map((x) => x.trim()).filter(Boolean) }]);
        created = true;
        return true;
      },
    });
    return created || null;
  }

  // ---------- Командная палитра (поиск по платформе) ----------
  async function openCommandPalette() {
    if (document.getElementById('cmd-palette')) return;
    const palette = document.createElement('div');
    palette.className = 'dialog-backdrop';
    palette.id = 'cmd-palette';
    palette.innerHTML = `
      <div class="dialog cmd">
        <div class="cmd-input-wrap">${LD.icon('search', 16)}
          <input id="cmd-input" placeholder="Поиск курсов, тем, заданий, событий…" autocomplete="off">
          <kbd>Esc</kbd>
        </div>
        <div class="cmd-results" id="cmd-results"></div>
      </div>`;
    document.body.appendChild(palette);
    const input = palette.querySelector('#cmd-input');
    const results = palette.querySelector('#cmd-results');
    let all = [];
    const close = () => { palette.remove(); };
    palette.addEventListener('click', (e) => { if (e.target === palette) close(); });
    const onKey = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(); } };
    document.addEventListener('keydown', onKey);

    // Разделы
    const sections = [
      ...NAV.map((n) => ({ kind: 'nav', title: n.label, sub: 'Раздел', href: n.href })),
      { kind: 'nav', title: 'Сменить тему', sub: 'Настройки оформления', action: () => cycleTheme() },
      { kind: 'nav', title: 'Создать курс', sub: 'Быстрое действие', action: () => quickAction('course') },
      { kind: 'nav', title: 'Создать событие', sub: 'Быстрое действие', action: () => quickAction('event') },
    ];
    const courses = getCourses().map((c) => ({ kind: 'course', title: c.title, sub: 'Курс · ' + (c.progressPercent || 0) + '%', href: '/editor.html?course=' + c.id }));
    all = sections.concat(courses);

    let treesLoaded = false;
    async function ensureDeepData() {
      if (treesLoaded) return;
      treesLoaded = true;
      const cs = getCourses().slice(0, 12);
      const parts = await Promise.all(cs.map(async (c) => {
        try {
          const tree = await loadTree(c.id);
          const items = [];
          for (const m of tree.modules) {
            items.push({ kind: 'node', title: m.title, sub: 'Модуль · ' + c.title, href: `/editor.html?course=${c.id}&node=${m.id}` });
            for (const d of m.disciplines) {
              items.push({ kind: 'node', title: d.title, sub: 'Дисциплина · ' + m.title, href: `/editor.html?course=${c.id}&node=${d.id}` });
              for (const t of d.topics) {
                items.push({ kind: 'node', title: t.title, sub: 'Тема · ' + d.title, href: `/editor.html?course=${c.id}&node=${t.id}` });
                for (const a of t.assignments) items.push({ kind: 'node', title: a.title, sub: 'Задание · ' + t.title, href: `/editor.html?course=${c.id}&node=${a.id}` });
              }
            }
          }
          return items;
        } catch (e) { return []; }
      }));
      all = all.concat(parts.flat());
      try {
        const cal = await Larpdeez.api('events');
        all = all.concat((cal.events || []).map((e) => ({ kind: 'event', title: e.title, sub: 'Событие · ' + fmtDateRu(e.date), href: '/calendar.html?focus=' + e.date })));
      } catch (e) {}
      filter();
    }

    function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
    function filter() {
      const q = norm(input.value.trim());
      let list = !q ? sections.slice(0, 7) : all.filter((x) => norm(x.title).includes(q) || norm(x.sub).includes(q)).slice(0, 40);
      if (q && q.length >= 2) ensureDeepData();
      results.innerHTML = list.length ? list.map((x, i) =>
        `<button data-i="${i}" class="${i === 0 ? 'active' : ''}">${LD.icon(x.kind === 'event' ? 'calendar' : x.kind === 'course' ? 'book-open' : x.kind === 'node' ? 'layers' : 'sparkles', 15)}<span class="grow">${esc(x.title)}</span><em>${esc(x.sub)}</em></button>`
      ).join('') : `<div class="cmd-empty">${LD.icon('search', 16)}<span>Ничего не найдено</span></div>`;
      results._list = list;
    }
    function go(item) {
      if (!item) return;
      close();
      if (item.action) item.action();
      else if (item.href) location.href = item.href;
    }
    input.addEventListener('input', filter);
    results.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) go(results._list[Number(b.dataset.i)]);
    });
    input.addEventListener('keydown', (e) => {
      const btns = [...results.querySelectorAll('button[data-i]')];
      const idx = btns.findIndex((b) => b.classList.contains('active'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!btns.length) return;
        const ni = e.key === 'ArrowDown' ? Math.min(idx + 1, btns.length - 1) : Math.max(idx - 1, 0);
        btns.forEach((b) => b.classList.remove('active'));
        btns[ni].classList.add('active');
        btns[ni].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        go(results._list[idx >= 0 ? idx : 0]);
      }
    });
    filter();
    setTimeout(() => { input.focus(); ensureDeepData(); }, 30);
  }

  // ---------- Мини-календарь для боковой панели главной ----------
  function miniCalendar(container, opts) {
    opts = opts || {};
    let view = opts.date ? new Date(opts.date + 'T00:00:00') : new Date();
    let eventsByDate = opts.eventsByDate || {};
    function draw() {
      const y = view.getFullYear(), m = view.getMonth();
      const first = new Date(y, m, 1);
      let startDow = (first.getDay() + 6) % 7; // пн=0
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let html = `<div class="mc-head">
        <button class="icon-btn small" data-mc="-1" type="button">${LD.icon('chevron-left', 14)}</button>
        <span class="mc-title">${monthName(m)} ${y}</span>
        <button class="icon-btn small" data-mc="1" type="button">${LD.icon('chevron-right', 14)}</button></div>
        <table><thead><tr>${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => `<th>${d}</th>`).join('')}</tr></thead><tbody><tr>`;
      for (let i = 0; i < startDow; i++) html += '<td></td>';
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dt = new Date(y, m, d);
        const cls = (dt.getTime() === today.getTime() ? 'today' : '') + (eventsByDate[iso] ? ' has-event' : '');
        html += `<td><button class="${cls}" data-date="${iso}" type="button">${d}</button></td>`;
        if ((startDow + d) % 7 === 0 && d !== daysInMonth) html += '</tr><tr>';
      }
      html += '</tr></tbody></table>';
      container.innerHTML = html;
      container.querySelectorAll('[data-mc]').forEach((b) => b.addEventListener('click', () => {
        view = new Date(view.getFullYear(), view.getMonth() + Number(b.dataset.mc), 1); draw();
      }));
      if (opts.onSelect) container.querySelectorAll('[data-date]').forEach((b) => b.addEventListener('click', () => opts.onSelect(b.dataset.date)));
    }
    draw();
    return { draw, setEvents: (e) => { eventsByDate = e; draw(); } };
  }

  // ---------- Даты ----------
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function addDaysISO(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  function monthName(m) { return MONTHS[m]; }
  function fmtDateRu(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1]} ${y}`;
  }
  function dayOfWeekRu(iso) {
    const d = new Date(iso + 'T00:00:00');
    return ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'][d.getDay()];
  }
  function relativeDay(iso) {
    const today = todayISO();
    if (iso === today) return 'Сегодня';
    if (iso === addDaysISO(today, 1)) return 'Завтра';
    if (iso === addDaysISO(today, -1)) return 'Вчера';
    const diff = Math.round((new Date(iso + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    if (diff > 1 && diff < 7) return dayOfWeekRu(iso).replace(/^./, (c) => c.toUpperCase());
    return fmtDateRu(iso);
  }
  function fmtDateTime(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]}`;
  }

  // ---------- Прочее ----------
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms || 200); };
  }

  // Чип иконки курса (emoji-имя -> svg)
  function courseChip(c, size) {
    return `<span class="cc-icon ${tintForHex(c.color) || tintHash(c.color)}">${LD.icon(iconName(c.emoji), size || 16)}</span>`;
  }

  window.UI = {
    PALETTE, tintForHex, tintHash, nodeTint, iconName,
    MODULE_ICONS, TOPIC_ICONS, ASSIGNMENT_ICONS, nodeIconName, iconGridHtml, mountIconGrids,
    colorSlotHtml, mountColors, slotColor,
    renderShell, loadSession, getProfile, getSettings, setSetting,
    getCourses, loadCourses, refreshCourses,
    treeOps, uid, loadTree,
    dialog, confirmDialog, openPopover, closePopover, rowMenu, optionPicker,
    toast, inlineColor,
    newCourseDialog, editCourseDialog, newEventDialog, editEventDialog, newAssignmentDialog,
    openCommandPalette, quickAction,
    miniCalendar, dateField,
    todayISO, addDaysISO, fmtDateRu, dayOfWeekRu, relativeDay, fmtDateTime, monthName,
    debounce, esc, courseChip,
    applyTheme,
  };
})();
