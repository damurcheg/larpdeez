// Проверка сессии: без входа ни приложение, ни API не отдаются
function getCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function loginPage(showHint) {
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>larpdeez — вход</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
background:#F5F3EC;color:#211F1A;font-family:'Inter',system-ui,sans-serif;
background-image:radial-gradient(600px 400px at 15% 10%,rgba(201,241,88,.45),transparent 70%),radial-gradient(700px 500px at 85% 85%,rgba(233,180,76,.3),transparent 70%)}
.card{width:400px;max-width:100%;background:#fff;border:1px solid #E4E0D2;border-radius:26px;padding:32px;
box-shadow:0 2px 6px rgba(35,30,15,.07),0 30px 70px -20px rgba(35,30,15,.28)}
.logo{font-family:'Unbounded';font-weight:900;font-size:26px;letter-spacing:-.02em;margin-bottom:6px}
.sub{color:#8B867A;font-size:13px;margin-bottom:24px}
label{display:block;font-family:'JetBrains Mono';font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8B867A;margin:0 0 6px 2px}
input{width:100%;height:46px;border:1px solid #E4E0D2;border-radius:12px;padding:0 14px;font:inherit;color:#211F1A;background:#FAF8F1;margin-bottom:14px}
input:focus{outline:none;border-color:#415C10;box-shadow:0 0 0 3px rgba(65,92,16,.15);background:#fff}
button{width:100%;height:48px;border:none;border-radius:12px;background:#415C10;color:#F7F6EE;font:inherit;font-weight:700;cursor:pointer;transition:.15s}
button:hover{transform:translateY(-1px);box-shadow:0 8px 22px -8px rgba(65,92,16,.6)}
button:disabled{opacity:.5;cursor:not-allowed;transform:none}
.err{display:none;background:#FAE7E8;color:#C93B45;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600;margin-bottom:14px}
.err.on{display:block}
.hint{margin-top:18px;padding-top:16px;border-top:1px solid #E4E0D2;font-size:12px;color:#8B867A;line-height:1.6}
.hint b{font-family:'JetBrains Mono';color:#415C10}
</style></head><body>
<form class="card" id="f">
  <div class="logo">larpdeez</div>
  <div class="sub">Личное учебное пространство</div>
  <div class="err" id="err"></div>
  <label>Логин</label><input id="login" autocomplete="username" placeholder="admin">
  <label>Пароль или запасной код</label><input id="pass" type="password" autocomplete="current-password" placeholder="••••••••">
  <button id="btn">Войти</button>
  ${showHint ? '<div class="hint">Первый запуск: логин <b>admin</b>, пароль <b>12345678</b>. После входа сразу смени их в редакторе курса → «Синхронизация и доступ».</div>' : '<div class="hint">Забыл пароль? Введи запасной код в поле пароля — логин можно оставить пустым.</div>'}
</form>
<script>
var f=document.getElementById('f'),e=document.getElementById('err'),b=document.getElementById('btn');
f.addEventListener('submit',function(ev){
  ev.preventDefault();e.className='err';b.disabled=true;b.textContent='Вход…';
  fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({login:document.getElementById('login').value.trim(),password:document.getElementById('pass').value})})
  .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
  .then(function(res){
    if(res.ok){location.href='/';return}
    e.textContent=res.j.error||'Ошибка входа';e.className='err on';b.disabled=false;b.textContent='Войти';
  })
  .catch(function(){e.textContent='Нет связи с сервером';e.className='err on';b.disabled=false;b.textContent='Войти'});
});
</script></body></html>`;
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const p = url.pathname;

  if (p === '/api/login' || p === '/api/logout') return next();

  const token = getCookie(request, 'ldz_session');
  const session = token ? await env.LARPDEEZ.get('session:' + token) : null;

  if (!session) {
    if (p.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { 'content-type': 'application/json' }
      });
    }
    const seeded = await env.LARPDEEZ.get('auth');
    return new Response(loginPage(!seeded), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  const res = await next();
  const h = new Headers(res.headers);
  h.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, headers: h });
}