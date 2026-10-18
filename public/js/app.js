// Общая клиентская логика: запросы к API, тема, шапка, сообщения, простые модалки.
// Этот файл подключён на всех страницах личного кабинета.

const Larpdeez = {
  // ---------- Запросы к API ----------
  getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)larpdeez_csrf=([^;]+)/);
    return m ? m[1] : '';
  },

  async api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (options.method && options.method !== 'GET') {
      headers['X-CSRF-Token'] = this.getCsrfToken();
    }
    let res;
    try {
      res = await fetch('/api/' + path, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        credentials: 'same-origin',
      });
    } catch (e) {
      const netErr = new Error('Не удалось связаться с сервером. Проверьте интернет и обновите страницу.');
      netErr.code = 'network';
      throw netErr;
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* пустой ответ */ }
    if (res.status === 401 && !options.allow401) {
      location.href = '/login.html';
      throw new Error('unauthorized');
    }
    if (!res.ok) {
      const e = new Error(data.message || 'Ошибка сервера (' + res.status + ').');
      e.code = data.error || 'server-error';
      e.status = res.status;
      throw e;
    }
    return data;
  },

  // ---------- Сообщения ----------
  showNotice(elId, text, type) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text;
    el.className = 'notice show ' + (type || 'info');
  },
  hideNotice(elId) {
    const el = document.getElementById(elId);
    if (el) el.className = 'notice';
  },

  // ---------- Тема оформления (согласовано с ui.js / настройкой на сервере) ----------
  applyTheme() {
    let theme = 'system';
    try { theme = localStorage.getItem('larpdeez-theme') || 'system'; } catch (e) {}
    const attr = theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'system';
    document.documentElement.setAttribute('data-theme', attr);
  },
  toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('larpdeez-theme', next); } catch (e) {}
    this.applyTheme();
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
    // Если подключён ui.js — синхронизируем настройку с сервером.
    if (window.UI && UI.setSetting) UI.setSetting('theme', next).catch(() => {});
  },

  // ---------- Шапка (legacy: используется только старым course.html) ----------
  renderTopbar(active) {
    // Новая дизайн-система рисует собственный topbar (ui.js) — не мешаем ей.
    if (document.querySelector('.main-area .topbar')) return;
    const el = document.getElementById('topbar');
    if (!el) return;
    el.className = 'topbar';
    el.innerHTML = `
      <a class="logo" href="/index.html">🎓 Larpdeez</a>
      <nav>
        <a href="/index.html" class="${active === 'home' ? 'active' : ''}">Главная</a>
        <a href="/index.html#courses" class="${active === 'courses' ? 'active' : ''}">Курсы</a>
        <a href="/profile.html" class="${active === 'profile' ? 'active' : ''}">Профиль</a>
      </nav>
      <div class="user-chip"><span id="topbar-avatar"></span><span id="topbar-name"></span></div>
      <button id="theme-toggle" class="btn secondary small" title="Сменить тему">🌙</button>
      <button id="logout-btn" class="btn secondary small">Выйти</button>
    `;
    document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
    document.getElementById('logout-btn').addEventListener('click', () => this.logout());
    document.getElementById('theme-toggle').textContent =
      document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
  },

  setTopbarUser(profile) {
    const nameEl = document.getElementById('topbar-name');
    const avEl = document.getElementById('topbar-avatar');
    if (nameEl) nameEl.textContent = profile.name || 'Студент';
    if (avEl) avEl.textContent = profile.avatarEmoji || '🎓';
  },

  async logout() {
    try { await this.api('logout', { method: 'POST' }); } catch (e) { /* выходим в любом случае */ }
    location.href = '/login.html';
  },

  // ---------- Проверка входа перед показом страницы ----------
  // Возвращает профиль, если пользователь вошёл; иначе редиректит на /login.html.
  async requirePageAuth() {
    let session;
    try {
      session = await this.api('session', { allow401: true });
    } catch (e) {
      location.href = '/login.html';
      throw e;
    }
    if (!session.authenticated) {
      location.href = '/login.html';
      throw new Error('unauthorized');
    }
    const profile = await this.api('profile');
    return profile;
  },

  // ---------- Простая модальная форма ----------
  openModal(title, fieldsHtml, onSubmit, submitLabel) {
    let backdrop = document.getElementById('app-modal');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'app-modal';
      backdrop.className = 'modal-backdrop';
      document.body.appendChild(backdrop);
    }
    backdrop.innerHTML = `
      <div class="modal card">
        <h2>${title}</h2>
        <div class="notice" id="modal-notice"></div>
        <form id="modal-form">${fieldsHtml}
          <div class="modal-actions">
            <button type="button" class="btn secondary" id="modal-cancel">Отмена</button>
            <button type="submit" class="btn">${submitLabel || 'Сохранить'}</button>
          </div>
        </form>
      </div>`;
    backdrop.classList.add('show');
    const close = () => backdrop.classList.remove('show');
    document.getElementById('modal-cancel').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.getElementById('modal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await onSubmit(new FormData(e.target));
        close();
      } catch (err) {
        this.showNotice('modal-notice', err.message || 'Не получилось.', 'error');
        btn.disabled = false;
      }
    });
    this.closeModal = close;
    return backdrop;
  },

  escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  progressPercent(done, total) {
    if (!total) return 0;
    return Math.round((done / total) * 100);
  },
};

// Тема применяется сразу, до отрисовки содержимого.
Larpdeez.applyTheme();
