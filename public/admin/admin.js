const app = document.getElementById('app');

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'حصل خطأ');
    err.status = res.status;
    throw err;
  }
  return data;
}

function render(html) { app.innerHTML = html; }
function on(id, evt, fn) { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }

async function boot() {
  const { admin } = await api('/admin/me');
  if (!admin) return renderLogin();
  return renderDashboard(admin);
}

function renderLogin() {
  render(`
    <div class="card">
      <h2>تسجيل دخول الأدمن</h2>
      <div class="error hidden" id="loginErr"></div>
      <input id="username" placeholder="اليوزرنيم" autocomplete="username">
      <input id="password" type="password" placeholder="الباسورد" autocomplete="current-password">
      <button id="doLogin">دخول</button>
    </div>
  `);
  on('doLogin', 'click', async () => {
    try {
      await api('/admin/login', { method: 'POST', body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
      })});
      boot();
    } catch (e) {
      const el = document.getElementById('loginErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  });
  document.getElementById('password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('doLogin').click();
  });
}

function logoutBtn() {
  return `<button class="secondary" id="logoutBtn" style="margin-top:14px;">تسجيل خروج</button>`;
}
function wireLogout() {
  on('logoutBtn', 'click', async () => { await api('/admin/logout', { method: 'POST' }); boot(); });
}

async function renderDashboard(admin) {
  let stats = { users: 0, activeSubscriptions: 0, totalCommission: 0 };
  try { stats = await api('/admin/stats'); } catch (e) {}

  render(`
    <div class="stat-row">
      <div class="stat-tile"><div class="num">${stats.users}</div><div class="label">يوزر</div></div>
      <div class="stat-tile"><div class="num">${stats.activeSubscriptions}</div><div class="label">اشتراك نشط</div></div>
      <div class="stat-tile"><div class="num">${stats.totalCommission}</div><div class="label">إجمالي العمولة (ج)</div></div>
    </div>
    <div class="tabs">
      <div class="tab active" id="tabPending">طلبات المدربين</div>
      <div class="tab" id="tabFlagged">محاولات التحايل</div>
      <div class="tab" id="tabUsers">المستخدمين</div>
      <div class="tab" id="tabSettings">الإعدادات</div>
    </div>
    <div id="adminContent"></div>
    ${logoutBtn()}
  `);

  function activateTab(id) {
    ['tabPending', 'tabFlagged', 'tabUsers', 'tabSettings'].forEach((t) => {
      document.getElementById(t).classList.toggle('active', t === id);
    });
  }

  async function showPending() {
    activateTab('tabPending');
    const { pending } = await api('/coaches/admin/pending');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>مراجعة طلبات المدربين</h2>
        ${pending.length === 0 ? '<p class="small">مفيش طلبات جديدة.</p>' : pending.map((p) => `
          <div class="card" style="background:var(--surface-2);">
            <b>${p.name}</b> <span class="small">(${p.email})</span>
            <p class="small">${p.specialty || '-'} — ${p.certification || '-'}</p>
            <p style="font-size:12.5px;">${p.bio || ''}</p>
            <div style="display:flex; gap:8px;">
              <button data-approve="${p.id}">✅ موافقة</button>
              <button class="danger" data-reject="${p.id}">❌ رفض</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    document.querySelectorAll('[data-approve]').forEach((el) => {
      el.onclick = async () => { await api(`/coaches/admin/${el.dataset.approve}/approve`, { method: 'POST' }); showPending(); };
    });
    document.querySelectorAll('[data-reject]').forEach((el) => {
      el.onclick = async () => { await api(`/coaches/admin/${el.dataset.reject}/reject`, { method: 'POST' }); showPending(); };
    });
  }

  const REASON_LABELS = {
    phone_number: 'رقم موبايل', phone_number_split: 'رقم مقسّم', email: 'إيميل شخصي', exit_intent: 'نية خروج',
    'social:whatsapp': 'واتساب', 'social:telegram': 'تيليجرام', 'social:instagram': 'إنستجرام',
    'social:facebook': 'فيسبوك', 'social:tiktok': 'تيك توك', 'social:snapchat': 'سناب شات', 'social:handle': 'يوزرنيم',
  };

  async function showFlagged() {
    activateTab('tabFlagged');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>محاولات التحايل في الشات</h2>
        <div class="filters">
          <select id="fReason">
            <option value="">كل الأنواع</option>
            <option value="phone_number">أرقام موبايل</option>
            <option value="email">إيميلات</option>
            <option value="social">سوشيال ميديا</option>
            <option value="exit_intent">نية خروج</option>
          </select>
          <select id="fBlocked">
            <option value="">اتمنعت ولا لأ</option>
            <option value="1">اتمنعت</option>
            <option value="0">للمراجعة بس</option>
          </select>
          <input id="fEmail" placeholder="بحث بالإيميل">
          <button id="fApply" style="width:auto; padding:8px 16px;">فلترة</button>
        </div>
        <div id="attemptsList"><p class="small">بيحمّل...</p></div>
      </div>
    `;
    async function load() {
      const params = new URLSearchParams();
      const reason = document.getElementById('fReason').value;
      const blocked = document.getElementById('fBlocked').value;
      const email = document.getElementById('fEmail').value;
      if (reason) params.set('reason', reason);
      if (blocked !== '') params.set('blocked', blocked);
      if (email) params.set('email', email);
      const { attempts } = await api('/auth/admin/flagged-attempts?' + params.toString());
      document.getElementById('attemptsList').innerHTML = attempts.length === 0
        ? '<p class="small">مفيش نتايج.</p>'
        : attempts.map((a) => `
          <div class="attempt-row">
            <div><b>${a.user_name}</b> <span class="small">(${a.user_email})</span> · <span class="small">${a.created_at}</span></div>
            <div>
              ${a.blocked ? '<span class="badge blocked">اتمنعت</span>' : '<span class="badge review">للمراجعة</span>'}
              ${a.reasons.split(',').map((r) => `<span class="badge blocked" style="background:var(--surface-2); color:var(--text-dim);">${REASON_LABELS[r] || r}</span>`).join('')}
            </div>
            <div class="msg-text">${a.message}</div>
          </div>
        `).join('');
    }
    on('fApply', 'click', load);
    load();
  }

  async function showUsers() {
    activateTab('tabUsers');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>كل المستخدمين</h2>
        <div class="filters">
          <input id="uSearch" placeholder="بحث بالإيميل">
          <button id="uApply" style="width:auto; padding:8px 16px;">بحث</button>
        </div>
        <div id="usersList"><p class="small">بيحمّل...</p></div>
      </div>
    `;
    async function load() {
      const q = document.getElementById('uSearch').value;
      const params = q ? '?q=' + encodeURIComponent(q) : '';
      const { users } = await api('/auth/admin/users' + params);
      document.getElementById('usersList').innerHTML = users.length === 0
        ? '<p class="small">مفيش نتايج.</p>'
        : users.map((u) => `
          <div class="card" style="background:var(--surface-2);">
            <b>${u.name}</b> <span class="small">(${u.email})</span>
            <p class="small">${u.role === 'coach' ? 'مدرب' : 'متدرب'} ${u.banned ? '· <span style="color:var(--danger)">محظور</span>' : ''}</p>
            <div style="display:flex; gap:8px;">
              ${u.banned
                ? `<button data-unban="${u.id}">✅ إلغاء الحظر</button>`
                : `<button class="danger" data-ban="${u.id}">🚫 حظر</button>`}
              <button class="danger" data-delete="${u.id}">🗑️ حذف نهائي</button>
            </div>
          </div>
        `).join('');
      document.querySelectorAll('[data-ban]').forEach((el) => {
        el.onclick = async () => { await api(`/auth/admin/${el.dataset.ban}/ban`, { method: 'POST' }); load(); };
      });
      document.querySelectorAll('[data-unban]').forEach((el) => {
        el.onclick = async () => { await api(`/auth/admin/${el.dataset.unban}/unban`, { method: 'POST' }); load(); };
      });
      document.querySelectorAll('[data-delete]').forEach((el) => {
        el.onclick = async () => {
          if (!confirm('متأكد من الحذف النهائي؟ الإجراء ده مش هينفع يترجع')) return;
          await api(`/auth/admin/${el.dataset.delete}`, { method: 'DELETE' });
          load();
        };
      });
    }
    on('uApply', 'click', load);
    load();
  }

  function showSettings() {
    activateTab('tabSettings');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>تغيير الباسورد</h2>
        <p class="small">مسجل دخول بحساب: <b>${admin.username}</b></p>
        <div class="error hidden" id="pwErr"></div>
        <div class="small hidden" id="pwOk" style="color:var(--success); margin-bottom:10px;">✅ اتغيّر الباسورد</div>
        <input id="currentPassword" type="password" placeholder="الباسورد الحالي">
        <input id="newPassword" type="password" placeholder="الباسورد الجديد (10 حروف على الأقل)">
        <button id="changePw">حفظ</button>
      </div>
    `;
    on('changePw', 'click', async () => {
      const errEl = document.getElementById('pwErr');
      const okEl = document.getElementById('pwOk');
      errEl.classList.add('hidden'); okEl.classList.add('hidden');
      try {
        await api('/admin/change-password', { method: 'POST', body: JSON.stringify({
          currentPassword: document.getElementById('currentPassword').value,
          newPassword: document.getElementById('newPassword').value,
        })});
        okEl.classList.remove('hidden');
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
      } catch (e) {
        errEl.textContent = e.message; errEl.classList.remove('hidden');
      }
    });
  }

  document.getElementById('tabPending').onclick = showPending;
  document.getElementById('tabFlagged').onclick = showFlagged;
  document.getElementById('tabUsers').onclick = showUsers;
  document.getElementById('tabSettings').onclick = showSettings;
  showPending();
  wireLogout();
}

boot();
