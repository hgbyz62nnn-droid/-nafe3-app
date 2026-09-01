const app = document.getElementById('app');
let state = { user: null, coaches: [], currentCoach: null, mySubs: [], activeChat: null, chatTimer: null, pendingEmail: null };

applyLangAttrs(getLang());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

function wireLangToggle() {
  const btn = document.getElementById('langToggle');
  function updateLabel() { btn.textContent = getLang() === 'ar' ? 'EN' : 'عربي'; }
  updateLabel();
  btn.addEventListener('click', () => {
    setLang(getLang() === 'ar' ? 'en' : 'ar');
    updateLabel();
    boot();
  });
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || t('genericError'));
    err.data = data;
    throw err;
  }
  return data;
}

// زي api() بالظبط بس من غير Content-Type: json، عشان الرفع بيبقى
// multipart/form-data والمتصفح لازم يحدد الـ boundary بنفسه.
async function apiUpload(path, formData) {
  const res = await fetch('/api' + path, { credentials: 'include', method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || t('genericError'));
    err.data = data;
    throw err;
  }
  return data;
}

function render(html) { app.innerHTML = html; }
function on(id, evt, fn) { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }

// Escapes any value coming from the server (names, bios, chat messages...)
// before it's dropped into an HTML template string, so stored data can
// never inject markup/script when rendered back.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function boot() {
  const { user } = await api('/auth/me');
  state.user = user;
  if (!user) { renderBottomNav(null); return renderAuth(); }
  if (user.role === 'coach') { renderBottomNav('dashboard'); return renderCoachDashboard(); }
  renderBottomNav('home');
  return renderTraineeHome();
}

function renderAuth() {
  render(`
    <div class="tabs">
      <div class="tab active" id="tabLogin">${t('tabLogin')}</div>
      <div class="tab" id="tabRegister">${t('tabRegister')}</div>
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
    <h2>${t('loginTitle')}</h2>
    <div class="error hidden" id="authErr"></div>
    <input id="email" type="email" placeholder="${t('emailPlaceholder')}">
    <input id="password" type="password" placeholder="${t('passwordPlaceholder')}">
    <button id="doLogin">${t('loginBtn')}</button>
  `;
  on('doLogin', 'click', async () => {
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      })});
      boot();
    } catch (e) {
      if (e.data && e.data.needsVerification) {
        state.pendingEmail = e.data.email;
        renderVerifyForm();
      } else {
        showAuthErr(e.message);
      }
    }
  });
}

function renderRegisterForm() {
  document.getElementById('tabRegister').classList.add('active');
  document.getElementById('tabLogin').classList.remove('active');
  document.getElementById('authCard').innerHTML = `
    <h2>${t('registerTitle')}</h2>
    <div class="error hidden" id="authErr"></div>
    <input id="name" placeholder="${t('namePlaceholder')}">
    <input id="email" type="email" placeholder="${t('emailPlaceholder')}">
    <input id="password" type="password" placeholder="${t('passwordHintPlaceholder')}">
    <select id="role">
      <option value="trainee">${t('roleTrainee')}</option>
      <option value="coach">${t('roleCoach')}</option>
    </select>
    <button id="doRegister">${t('createAccountBtn')}</button>
  `;
  on('doRegister', 'click', async () => {
    try {
      const email = document.getElementById('email').value;
      await api('/auth/register', { method: 'POST', body: JSON.stringify({
        name: document.getElementById('name').value,
        email,
        password: document.getElementById('password').value,
        role: document.getElementById('role').value,
      })});
      state.pendingEmail = email;
      renderVerifyForm();
    } catch (e) { showAuthErr(e.message); }
  });
}

function renderVerifyForm() {
  render(`
    <div class="card">
      <h2>${t('verifyTitle')}</h2>
      <p class="small" style="line-height:1.8; margin-bottom:14px;">
        ${t('verifyBody', { email: state.pendingEmail })}
      </p>
      <div class="error hidden" id="verifyErr"></div>
      <input id="code" placeholder="${t('codePlaceholder')}" maxlength="6" style="text-align:center; font-size:20px; letter-spacing:6px;">
      <button id="doVerify">${t('confirmBtn')}</button>
      <button class="secondary" id="resendCode" style="margin-top:10px;">${t('resendCodeBtn')}</button>
    </div>
  `);
  on('doVerify', 'click', async () => {
    try {
      await api('/auth/verify', { method: 'POST', body: JSON.stringify({
        email: state.pendingEmail,
        code: document.getElementById('code').value,
      })});
      boot();
    } catch (e) {
      const el = document.getElementById('verifyErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  });
  on('resendCode', 'click', async () => {
    try {
      await api('/auth/resend-code', { method: 'POST', body: JSON.stringify({ email: state.pendingEmail }) });
      alert(t('codeResentAlert'));
    } catch (e) { alert(e.message); }
  });
}

function showAuthErr(msg) {
  const el = document.getElementById('authErr');
  el.textContent = msg; el.classList.remove('hidden');
}

function logoutBtn() {
  return `<button class="secondary" id="logoutBtn" style="margin-top:14px;">${t('logoutBtn')}</button>`;
}
function wireLogout() {
  on('logoutBtn', 'click', async () => { await api('/auth/logout', { method: 'POST' }); boot(); });
}

async function renderTraineeHome() {
  renderBottomNav('home');
  const { coaches } = await api('/coaches');
  state.coaches = coaches;
  const { subscriptions } = await api('/subscriptions/mine');
  state.mySubs = subscriptions;

  const activeSubs = subscriptions.filter(s => s.status === 'active');

  render(`
    <div class="card">
      <h2>${t('welcome', { name: escapeHtml(state.user.name) })}</h2>
      <p class="small">${t('traineeHomeHint')}</p>
    </div>
    ${activeSubs.length ? `
      <div class="card">
        <h2>${t('mySubscriptions')}</h2>
        ${activeSubs.map(s => `
          <div class="coach-row" data-open-chat="${s.id}" style="gap:10px;">
            ${avatarCircle(s.other_party_name, s.other_party_avatar, 36)}
            <div style="flex:1;">${escapeHtml(s.other_party_name)}<div class="small">${t('packageLabel', { pkg: s.package })} · <span class="pill">${t('statusActive')}</span></div></div>
            <div class="small">${t('chatLink')}</div>
          </div>
        `).join('')}
      </div>` : ''}
    <div class="card">
      <h2>${t('availableCoaches')}</h2>
      ${coaches.length === 0 ? `<p class="small">${t('noApprovedCoaches')}</p>` : coaches.map(c => `
        <div class="coach-row" data-open-coach="${c.id}">
          <div>${escapeHtml(c.name)}<div class="small">${escapeHtml(c.specialty) || t('coachSpecialtyFallback')}</div></div>
          <div class="small">${t('pricePerMonth', { price: c.price_1m })}</div>
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
  const [{ coach }, { reviews }] = await Promise.all([
    api('/coaches/' + coachId),
    api('/reviews/coach/' + coachId),
  ]);
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card" style="text-align:center;">
      ${avatarCircle(coach.name, coach.avatar_path, 88)}
      <h2 style="margin-top:10px;">${escapeHtml(coach.name)} ${coach.verified ? `<span class="verified-badge">${t('verifiedLabel')}</span>` : ''}</h2>
      <p class="small">${escapeHtml(coach.specialty)}</p>
      <p class="small">${coach.avg_rating ? `<span class="rating">★ ${coach.avg_rating}</span> ${t('reviewsCountLabel', { count: coach.review_count })}` : t('noReviewsYet')}</p>
      ${coach.profile_bio ? `<p style="font-size:13px; line-height:1.8; margin-top:10px; text-align:start;">${escapeHtml(coach.profile_bio)}</p>` : ''}
    </div>
    <div class="card">
      <p style="font-size:13px; line-height:1.8;">${escapeHtml(coach.bio) || t('noBioYet')}</p>
      <p class="small" style="margin-top:8px;">${t('certificationLabel', { cert: escapeHtml(coach.certification) || '-' })}</p>
    </div>
    <div class="card">
      <h2>${t('galleryTitle')}</h2>
      <div id="galleryBox"><div class="skeleton block"></div></div>
    </div>
    <div class="card">
      <h2>${t('packagesTitle')}</h2>
      <div class="coach-row"><div>${t('package1m')}</div><div>${coach.price_1m} ${t('currency')}</div></div>
      <div class="coach-row"><div>${t('package3m')}</div><div>${coach.price_3m} ${t('currency')}</div></div>
      <div class="coach-row"><div>${t('package6m')}</div><div>${coach.price_6m} ${t('currency')}</div></div>
    </div>
    <div class="card">
      <select id="pkg">
        <option value="1m">${t('package1m')} - ${coach.price_1m} ${t('currency')}</option>
        <option value="3m">${t('package3m')} - ${coach.price_3m} ${t('currency')}</option>
        <option value="6m">${t('package6m')} - ${coach.price_6m} ${t('currency')}</option>
      </select>
      <button id="subscribeBtn">${t('subscribeBtn')}</button>
    </div>
    <div class="card">
      <h2>${t('reviewsTitle')}</h2>
      ${reviews.length === 0 ? `<p class="small">${t('noReviewsYet')}</p>` : reviews.map((r) => `
        <div class="coach-row" style="display:block;">
          <div style="display:flex; justify-content:space-between;">
            <b style="font-size:12.5px;">${escapeHtml(r.trainee_name)}</b>
            <span class="rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
          </div>
          ${r.comment ? `<p class="small" style="margin-top:4px;">${escapeHtml(r.comment)}</p>` : ''}
          ${r.coach_response ? `<p class="small" style="margin-top:6px; background:var(--surface-2); padding:8px 10px; border-radius:8px;"><b>${t('coachResponseLabel')}</b> ${escapeHtml(r.coach_response)}</p>` : ''}
        </div>
      `).join('')}
    </div>
  `);
  document.getElementById('back').onclick = renderTraineeHome;
  loadAndRenderGallery('galleryBox', coachId, false);
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
      <h2>${t('mockCheckoutTitle')}</h2>
      <p class="small" style="line-height:1.8;">
        ${t('mockCheckoutBody')}
      </p>
      <button id="confirmMock">${t('activateMockBtn')}</button>
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
    ${renderHubTabs(subscriptionId, 'chat')}
    <div class="notice">${t('chatPrivacyNotice')}</div>
    <div class="card" id="chatBox" style="min-height:300px; display:flex; flex-direction:column;">
      <div id="msgs" style="flex:1; overflow-y:auto; margin-bottom:10px;"></div>
    </div>
    <div class="card" style="display:flex; gap:8px;">
      <input id="msgInput" placeholder="${t('messagePlaceholder')}" style="margin:0;">
      <button id="sendBtn" style="width:90px;">${t('sendBtn')}</button>
    </div>
  `);
  wireHubNav(subscriptionId, 'chat');

  async function loadMsgs() {
    try {
      const { messages } = await api('/chat/' + subscriptionId);
      const box = document.getElementById('msgs');
      if (!box) return;
      box.innerHTML = messages.map(m => `
        <div class="msg ${m.flagged ? 'blocked' : (m.sender_id === state.user.id ? 'me' : 'them')}">
          ${m.flagged ? t('blockedMessage') : escapeHtml(m.content)}
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
  renderBottomNav('dashboard');
  const { profile } = await api('/coaches/me/profile');
  const { subscriptions } = await api('/subscriptions/mine');
  const activeSubs = subscriptions.filter(s => s.status === 'active');

  const statusLabel = { pending: t('statusPending'), approved: t('statusApproved'), rejected: t('statusRejected') }[profile.status];

  render(`
    <div class="card">
      <h2>${t('coachDashboardTitle')}</h2>
      <p class="small">${t('accountStatusLabel')} <span class="pill">${statusLabel}</span></p>
      <button class="secondary" id="openStats" style="margin-top:10px;">${t('viewStatsBtn')}</button>
    </div>
    <div class="card">
      <h2>${t('myProfile')}</h2>
      <input id="specialty" placeholder="${t('specialtyPlaceholder')}" value="${escapeHtml(profile.specialty)}">
      <textarea id="bio" placeholder="${t('bioPlaceholder')}" rows="3">${escapeHtml(profile.bio)}</textarea>
      <input id="certification" placeholder="${t('certificationPlaceholder')}" value="${escapeHtml(profile.certification)}">
      <input id="price_1m" type="number" placeholder="${t('price1mPlaceholder')}" value="${profile.price_1m || ''}">
      <input id="price_3m" type="number" placeholder="${t('price3mPlaceholder')}" value="${profile.price_3m || ''}">
      <input id="price_6m" type="number" placeholder="${t('price6mPlaceholder')}" value="${profile.price_6m || ''}">
      <button id="saveProfile">${t('saveProfileBtn')}</button>
      <p class="small" style="margin-top:8px;">${t('profileReviewHint')}</p>
    </div>
    ${activeSubs.length ? `
      <div class="card">
        <h2>${t('myTrainees')}</h2>
        ${activeSubs.map(s => `
          <div class="coach-row" data-open-chat="${s.id}" style="gap:10px;">
            ${avatarCircle(s.other_party_name, s.other_party_avatar, 36)}
            <div style="flex:1;">${escapeHtml(s.other_party_name)}<div class="small">${t('packageLabel', { pkg: s.package })}</div></div>
            <div class="small">${t('chatLink')}</div>
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
  on('openStats', 'click', renderCoachStats);
  wireLogout();
}

wireLangToggle();
boot();
