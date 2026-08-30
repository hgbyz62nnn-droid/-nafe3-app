const app = document.getElementById('app');
let state = { user: null, coaches: [], currentCoach: null, mySubs: [], activeChat: null, chatTimer: null };

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'حصل خطأ');
  return data;
}

function render(html) { app.innerHTML = html; }
function on(id, evt, fn) { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }

async function boot() {
  const { user } = await api('/auth/me');
  state.user = user;
  if (!user) return renderAuth();
  if (user.role === 'admin') return renderAdmin();
  if (user.role === 'coach') return renderCoachDashboard();
  return renderTraineeHome();
}

function renderAuth() {
  render(`
    <div class="tabs">
      <div class="tab active" id="tabLogin">دخول</div>
      <div class="tab" id="tabRegister">حساب جديد</div>
    </div>
    <div class="card" id="authCard"></div>
  `);
  document.getElementById('tabLogin').onclick = renderLoginForm;
  document.getElementById('tabRegister').onclick = renderRegisterForm;
  renderLoginForm();
}

function renderLoginForm() {
  document.getElementById('tabLogin').classList.add('active');
  document.getElementById('tabRegister').classList.remove('active');
  document.getElementById('authCard').innerHTML = `
    <h2>تسجيل الدخول</h2>
    <div class="error hidden" id="authErr"></div>
    <input id="email" type="email" placeholder="الإيميل">
    <input id="password" type="password" placeholder="الباسورد">
    <button id="doLogin">دخول</button>
  `;
  on('doLogin', 'click', async () => {
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      })});
      boot();
    } catch (e) { showAuthErr(e.message); }
  });
}

function renderRegisterForm() {
  document.getElementById('tabRegister').classList.add('active');
  document.getElementById('tabLogin').classList.remove('active');
  document.getElementById('authCard').innerHTML = `
    <h2>حساب جديد</h2>
    <div class="error hidden" id="authErr"></div>
    <input id="name" placeholder="الاسم">
    <input id="email" type="email" placeholder="الإيميل">
    <input id="password" type="password" placeholder="الباسورد">
    <select id="role">
      <option value="trainee">متدرب - عاوز أشترك مع مدرب</option>
      <option value="coach">مدرب - عاوز أعرض نفسي</option>
    </select>
    <button id="doRegister">إنشاء الحساب</button>
  `;
  on('doRegister', 'click', async () => {
    try {
      await api('/auth/register', { method: 'POST', body: JSON.stringify({
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
        role: document.getElementById('role').value,
      })});
      boot();
    } catch (e) { showAuthErr(e.message); }
  });
}

function showAuthErr(msg) {
  const el = document.getElementById('authErr');
  el.textContent = msg; el.classList.remove('hidden');
}

function logoutBtn() {
  return `<button class="secondary" id="logoutBtn" style="margin-top:14px;">تسجيل خروج</button>`;
}
function wireLogout() {
  on('logoutBtn', 'click', async () => { await api('/auth/logout', { method: 'POST' }); boot(); });
}

async function renderTraineeHome() {
  const { coaches } = await api('/coaches');
  state.coaches = coaches;
  const { subscriptions } = await api('/subscriptions/mine');
  state.mySubs = subscriptions;

  const activeSubs = subscriptions.filter(s => s.status === 'active');

  render(`
    <div class="card">
      <h2>أهلاً ${state.user.name} 👋</h2>
      <p class="small">دوّر على مدربك في الإسماعيلية وابدأ اشتراكك بأمان.</p>
    </div>
    ${activeSubs.length ? `
      <div class="card">
        <h2>اشتراكاتي</h2>
        ${activeSubs.map(s => `
          <div class="coach-row" data-open-chat="${s.id}">
            <div>${s.other_party_name}<div class="small">باقة ${s.package} · <span class="pill">مفعّل</span></div></div>
            <div class="small">💬 الشات</div>
          </div>
        `).join('')}
      </div>` : ''}
    <div class="card">
      <h2>المدربين المتاحين</h2>
      ${coaches.length === 0 ? '<p class="small">مفيش مدربين معتمدين لسه.</p>' : coaches.map(c => `
        <div class="coach-row" data-open-coach="${c.id}">
          <div>${c.name}<div class="small">${c.specialty || 'مدرب عام'}</div></div>
          <div class="small">${c.price_1m} ج / شهر</div>
        </div>
      `).join('')}
    </div>
    ${logoutBtn()}
  `);

  document.querySelectorAll('[data-open-coach]').forEach(el => {
    el.onclick = () => renderCoachProfile(el.dataset.openCoach);
  });
  document.querySelectorAll('[data-open-chat]').forEach(el => {
    el.onclick = () => renderChat(el.dataset.openChat);
  });
  wireLogout();
}

async function renderCoachProfile(coachId) {
  const { coach } = await api('/coaches/' + coachId);
  render(`
    <button class="secondary" id="back">← رجوع</button>
    <div class="card">
      <h2>${coach.name}</h2>
      <p class="small">${coach.specialty || ''}</p>
      <p style="font-size:13px; line-height:1.8; margin-top:10px;">${coach.bio || 'مفيش نبذة لسه'}</p>
      <p class="small" style="margin-top:8px;">🎓 ${coach.certification || '-'}</p>
    </div>
    <div class="card">
      <h2>الباقات</h2>
      <div class="coach-row"><div>شهر واحد</div><div>${coach.price_1m} ج</div></div>
      <div class="coach-row"><div>3 شهور</div><div>${coach.price_3m} ج</div></div>
      <div class="coach-row"><div>6 شهور</div><div>${coach.price_6m} ج</div></div>
    </div>
    <div class="card">
      <select id="pkg">
        <option value="1m">شهر واحد - ${coach.price_1m} ج</option>
        <option value="3m">3 شهور - ${coach.price_3m} ج</option>
        <option value="6m">6 شهور - ${coach.price_6m} ج</option>
      </select>
      <button id="subscribeBtn">اشترك دلوقتي
