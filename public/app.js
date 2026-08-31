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
    <input id="password" type="password" placeholder="الباسورد (8 حروف على الأقل)">
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
      <button id="subscribeBtn">اشترك دلوقتي</button>
    </div>
  `);
  document.getElementById('back').onclick = renderTraineeHome;
  on('subscribeBtn', 'click', async () => {
    const pkg = document.getElementById('pkg').value;
    try {
      const result = await api('/subscriptions', { method: 'POST', body: JSON.stringify({ coachId, package: pkg }) });
      if (result.mock) {
        renderMockCheckout(result.subscriptionId);
      } else {
        window.location.href = result.checkoutUrl;
      }
    } catch (e) { alert(e.message); }
  });
}

function renderMockCheckout(subscriptionId) {
  render(`
    <div class="card">
      <h2>وضع الدفع التجريبي 🧪</h2>
      <p class="small" style="line-height:1.8;">
        Paymob لسه مش متوصل. ده تفعيل تجريبي بس عشان تكمل تجربة باقي التطبيق (الشات، الاشتراك، إلخ).
      </p>
      <button id="confirmMock">تفعيل الاشتراك (تجريبي)</button>
    </div>
  `);
  on('confirmMock', 'click', async () => {
    await api(`/subscriptions/${subscriptionId}/mock-confirm`, { method: 'POST' });
    renderChat(subscriptionId);
  });
}

async function renderChat(subscriptionId) {
  clearInterval(state.chatTimer);
  state.activeChat = subscriptionId;

  render(`
    <button class="secondary" id="back">← رجوع</button>
    <div class="notice">🛡️ للحفاظ على خصوصيتك وأمان الدفع، مش هينفع تتبادل أرقام موبايل أو حسابات سوشيال ميديا جوه الشات.</div>
    <div class="card" id="chatBox" style="min-height:300px; display:flex; flex-direction:column;">
      <div id="msgs" style="flex:1; overflow-y:auto; margin-bottom:10px;"></div>
    </div>
    <div class="card" style="display:flex; gap:8px;">
      <input id="msgInput" placeholder="اكتب رسالتك..." style="margin:0;">
      <button id="sendBtn" style="width:90px;">إرسال</button>
    </div>
  `);
  document.getElementById('back').onclick = () => { clearInterval(state.chatTimer); boot(); };

  async function loadMsgs() {
    try {
      const { messages } = await api('/chat/' + subscriptionId);
      const box = document.getElementById('msgs');
      if (!box) return;
      box.innerHTML = messages.map(m => `
        <div class="msg ${m.flagged ? 'blocked' : (m.sender_id === state.user.id ? 'me' : 'them')}">
          ${m.flagged ? '🚫 رسالة اتمنعت (محتوى تواصل خارجي)' : m.content}
        </div>
      `).join('');
      box.scrollTop = box.scrollHeight;
    } catch (e) { }
  }
  await loadMsgs();
  state.chatTimer = setInterval(loadMsgs, 3000);

  on('sendBtn', 'click', async () => {
    const input = document.getElementById('msgInput');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    try {
      await api('/chat/' + subscriptionId, { method: 'POST', body: JSON.stringify({ content }) });
    } catch (e) { }
    loadMsgs();
  });
}

async function renderCoachDashboard() {
  const { profile } = await api('/coaches/me/profile');
  const { subscriptions } = await api('/subscriptions/mine');
  const activeSubs = subscriptions.filter(s => s.status === 'active');

  const statusLabel = { pending: 'قيد المراجعة', approved: 'معتمد ✓', rejected: 'مرفوض' }[profile.status];

  render(`
    <div class="card">
      <h2>لوحة المدرب</h2>
      <p class="small">حالة الحساب: <span class="pill">${statusLabel}</span></p>
    </div>
    <div class="card">
      <h2>بروفايلي</h2>
      <input id="specialty" placeholder="التخصص" value="${profile.specialty || ''}">
      <textarea id="bio" placeholder="نبذة عنك" rows="3">${profile.bio || ''}</textarea>
      <input id="certification" placeholder="الشهادة" value="${profile.certification || ''}">
      <input id="price_1m" type="number" placeholder="سعر الشهر" value="${profile.price_1m || ''}">
      <input id="price_3m" type="number" placeholder="سعر 3 شهور" value="${profile.price_3m || ''}">
      <input id="price_6m" type="number" placeholder="سعر 6 شهور" value="${profile.price_6m || ''}">
      <button id="saveProfile">حفظ البروفايل</button>
      <p class="small" style="margin-top:8px;">أي تعديل بيرجع الحساب "قيد المراجعة" لحد ما الأدمن يوافق تاني.</p>
    </div>
    ${activeSubs.length ? `
      <div class="card">
        <h2>متدربيني</h2>
        ${activeSubs.map(s => `
          <div class="coach-row" data-open-chat="${s.id}">
            <div>${s.other_party_name}<div class="small">باقة ${s.package}</div></div>
            <div class="small">💬 الشات</div>
          </div>
        `).join('')}
      </div>` : ''}
    ${logoutBtn()}
  `);

  on('saveProfile', 'click', async () => {
    try {
      await api('/coaches/me/profile', { method: 'PUT', body: JSON.stringify({
        specialty: document.getElementById('specialty').value,
        bio: document.getElementById('bio').value,
        certification: document.getElementById('certification').value,
        price_1m: Number(document.getElementById('price_1m').value) || 0,
        price_3m: Number(document.getElementById('price_3m').value) || 0,
        price_6m: Number(document.getElementById('price_6m').value) || 0,
      })});
      renderCoachDashboard();
    } catch (e) { alert(e.message); }
  });
  document.querySelectorAll('[data-open-chat]').forEach(el => {
    el.onclick = () => renderChat(el.dataset.openChat);
  });
  wireLogout();
}

async function renderAdmin() {
  const { pending } = await api('/coaches/admin/pending');
  const { users } = await api('/auth/admin/users');

  render(`
    <div class="tabs">
      <div class="tab active" id="tabPending">طلبات المدربين</div>
      <div class="tab" id="tabUsers">كل المستخدمين</div>
    </div>
    <div id="adminContent"></div>
    ${logoutBtn()}
  `);

  function showPending() {
    document.getElementById('tabPending').classList.add('active');
    document.getElementById('tabUsers').classList.remove('active');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>مراجعة طلبات المدربين</h2>
        ${pending.length === 0 ? '<p class="small">مفيش طلبات جديدة.</p>' : pending.map(p => `
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
    document.querySelectorAll('[data-approve]').forEach(el => {
      el.onclick = async () => { await api(`/coaches/admin/${el.dataset.approve}/approve`, { method: 'POST' }); renderAdmin(); };
    });
    document.querySelectorAll('[data-reject]').forEach(el => {
      el.onclick = async () => { await api(`/coaches/admin/${el.dataset.reject}/reject`, { method: 'POST' }); renderAdmin(); };
    });
  }

  function showUsers() {
    document.getElementById('tabUsers').classList.add('active');
    document.getElementById('tabPending').classList.remove('active');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>كل المستخدمين</h2>
        ${users.length === 0 ? '<p class="small">مفيش مستخدمين.</p>' : users.map(u => `
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
        `).join('')}
      </div>
    `;
    document.querySelectorAll('[data-ban]').forEach(el => {
      el.onclick = async () => { await api(`/auth/admin/${el.dataset.ban}/ban`, { method: 'POST' }); renderAdmin(); };
    });
    document.querySelectorAll('[data-unban]').forEach(el => {
      el.onclick = async () => { await api(`/auth/admin/${el.dataset.unban}/unban`, { method: 'POST' }); renderAdmin(); };
    });
    document.querySelectorAll('[data-delete]').forEach(el => {
      el.onclick = async () => {
        if (!confirm('متأكد من الحذف النهائي؟ الإجراء ده مش هينفع يترجع')) return;
        await api(`/auth/admin/${el.dataset.delete}`, { method: 'DELETE' });
        renderAdmin();
      };
    });
  }

  document.getElementById('tabPending').onclick = showPending;
  document.getElementById('tabUsers').onclick = showUsers;
  showPending();
  wireLogout();
}

boot();
