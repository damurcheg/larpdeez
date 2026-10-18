// Логика страницы входа и первоначальной настройки пароля (login.html).

(async function () {
  const setupView = document.getElementById('setup-view');
  const loginView = document.getElementById('login-view');
  const loadingView = document.getElementById('loading-view');

  let configured = true;
  try {
    const res = await fetch('/api/setup-status');
    const data = await res.json();
    configured = !!data.configured;
  } catch (e) {
    Larpdeez.showNotice('auth-notice', 'Сервер недоступен. Проверьте интернет и обновите страницу.', 'error');
    loadingView.classList.add('hidden');
    return;
  }
  loadingView.classList.add('hidden');

  // Если пароль ещё не задан — показываем первоначальную настройку.
  if (!configured) {
    setupView.classList.remove('hidden');
  } else {
    loginView.classList.remove('hidden');
    document.getElementById('login-password').focus();
  }

  // ---------- Первоначальная настройка ----------
  document.getElementById('setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const password = f.get('password');
    const confirm = f.get('confirm');
    if (password.length < 8) {
      return Larpdeez.showNotice('auth-notice', 'Пароль должен быть не короче 8 символов.', 'error');
    }
    if (password !== confirm) {
      return Larpdeez.showNotice('auth-notice', 'Пароли не совпадают.', 'error');
    }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password, confirm, name: f.get('name') || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        btn.disabled = false;
        if (data.error === 'already-configured') {
          Larpdeez.showNotice('auth-notice', 'Похоже, пароль уже был установлен с другого устройства. Войдите с ним.', 'info');
          setupView.classList.add('hidden');
          loginView.classList.remove('hidden');
        } else {
          Larpdeez.showNotice('auth-notice', data.message || 'Не удалось сохранить пароль.', 'error');
        }
        return;
      }
      location.href = '/index.html';
    } catch (err) {
      btn.disabled = false;
      Larpdeez.showNotice('auth-notice', 'Сервер недоступен. Попробуйте ещё раз.', 'error');
    }
  });

  // ---------- Обычный вход ----------
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('login-password').value;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    Larpdeez.hideNotice('auth-notice');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        btn.disabled = false;
        if (data.error === 'bad-password') {
          Larpdeez.showNotice('auth-notice', 'Неверный пароль. Попробуйте ещё раз.', 'error');
        } else if (data.error === 'not-configured') {
          // Пароль сбросили через D1 — снова доступна первоначальная настройка.
          location.reload();
        } else {
          Larpdeez.showNotice('auth-notice', data.message || 'Не удалось войти.', 'error');
        }
        return;
      }
      location.href = '/index.html';
    } catch (err) {
      btn.disabled = false;
      Larpdeez.showNotice('auth-notice', 'Сервер недоступен. Попробуйте ещё раз.', 'error');
    }
  });

  // Ссылка «Забыли пароль?» — просто показывает подсказку (реальный сброс — через D1, см. README).
  const forgot = document.getElementById('forgot-link');
  if (forgot) {
    forgot.addEventListener('click', (e) => {
      e.preventDefault();
      Larpdeez.showNotice('auth-notice',
        'Если вы забыли пароль, его можно сбросить только вручную через базу данных Cloudflare D1 — так устроена защита. Порядок действий описан в README.md, раздел «Как восстановить доступ при потере пароля».',
        'info');
    });
  }
})();
