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

function render(html) {
  const topbar = document.querySelector('.topbar');
  if (topbar) topbar.style.display = '';
  // شاشة الخطة (renderPlanTab) بتضيف plan-view-wide على .wrap بعد ما تنده
  // render() عشان جداول التمرين/التغذية تاخد مساحة أوسع على تابلت/ديسكتوب
  // - أي شاشة تانية بتعمل render() تلاقي العرض يرجع تلقائي للـ480px العادي.
  document.querySelector('.wrap')?.classList.remove('plan-view-wide');
  app.innerHTML = html;
}
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
  if (!user) { renderBottomNav(null); return renderSplash(); }
  if (user.role === 'coach') { renderBottomNav('dashboard'); return renderCoachDashboard(); }
  renderBottomNav('home');
  return renderTraineeHome();
}

function renderSplash() {
  render(`
    <div class="splash">
      <img src="/icons/icon-512.png" class="splash-logo" alt="Traino">
      <div class="splash-title">TRAINO</div>
      <div class="splash-tagline">${t('splashTagline')}</div>
      <div class="splash-actions">
        <button id="getStarted">${t('getStartedBtn')}</button>
        <button class="secondary" id="imTrainer">${t('imTrainerBtn')}</button>
        <p class="small" style="margin-top:18px;">${t('alreadyHaveAccount')} <a class="link" href="#" id="goLoginLink">${t('loginBtn')}</a></p>
      </div>
    </div>
  `);
  document.querySelector('.topbar').style.display = 'none';
  on('getStarted', 'click', () => renderAuth('register', 'trainee'));
  on('imTrainer', 'click', () => renderAuth('register', 'coach'));
  on('goLoginLink', 'click', (e) => { e.preventDefault(); renderAuth('login'); });
}

function renderAuth(tab = 'login', presetRole) {
  render(`
    <div class="tabs">
      <div class="tab ${tab === 'login' ? 'active' : ''}" id="tabLogin">${t('tabLogin')}</div>
      <div class="tab ${tab === 'register' ? 'active' : ''}" id="tabRegister">${t('tabRegister')}</div>
    </div>
    <div class="card" id="authCard"></div>
  `);
  document.getElementById('tabLogin').onclick = renderLoginForm;
  document.getElementById('tabRegister').onclick = () => renderRegisterForm();
  if (tab === 'register') renderRegisterForm(presetRole); else renderLoginForm();
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
    <p class="small" style="margin-top:10px; text-align:center;"><a class="link" href="#" id="forgotPasswordLink">${t('forgotPasswordLink')}</a></p>
  `;
  on('forgotPasswordLink', 'click', (e) => { e.preventDefault(); renderForgotPasswordForm(); });
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

function renderRegisterForm(presetRole) {
  document.getElementById('tabRegister').classList.add('active');
  document.getElementById('tabLogin').classList.remove('active');
  document.getElementById('authCard').innerHTML = `
    <h2>${t('registerTitle')}</h2>
    <div class="error hidden" id="authErr"></div>
    <input id="name" placeholder="${t('namePlaceholder')}">
    <input id="email" type="email" placeholder="${t('emailPlaceholder')}">
    <input id="password" type="password" placeholder="${t('passwordHintPlaceholder')}">
    <select id="role">
      <option value="trainee" ${presetRole === 'trainee' ? 'selected' : ''}>${t('roleTrainee')}</option>
      <option value="coach" ${presetRole === 'coach' ? 'selected' : ''}>${t('roleCoach')}</option>
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

function renderForgotPasswordForm() {
  render(`
    <button class="secondary" id="back">${t('backToLoginLink')}</button>
    <div class="card">
      <h2>${t('forgotPasswordTitle')}</h2>
      <p class="small" style="line-height:1.8; margin-bottom:14px;">${t('forgotPasswordHint')}</p>
      <div class="error hidden" id="forgotErr"></div>
      <input id="forgotEmail" type="email" placeholder="${t('emailPlaceholder')}">
      <button id="sendResetCode">${t('sendResetCodeBtn')}</button>
    </div>
  `);
  document.getElementById('back').onclick = () => renderAuth('login');
  on('sendResetCode', 'click', async () => {
    const email = document.getElementById('forgotEmail').value.trim();
    if (!email) return;
    const btn = document.getElementById('sendResetCode');
    btn.disabled = true;
    try {
      await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      state.pendingEmail = email;
      renderResetPasswordForm();
    } catch (e) {
      const el = document.getElementById('forgotErr');
      el.textContent = e.message; el.classList.remove('hidden');
      btn.disabled = false;
    }
  });
}

function renderResetPasswordForm() {
  render(`
    <button class="secondary" id="back">${t('backToLoginLink')}</button>
    <div class="card">
      <h2>${t('resetPasswordTitle')}</h2>
      <p class="small" style="line-height:1.8; margin-bottom:10px;">
        ${t('resetPasswordHint', { email: state.pendingEmail })}
      </p>
      <div class="notice">${t('resetCodeSentMessage')}</div>
      <div class="error hidden" id="resetErr"></div>
      <input id="resetCode" placeholder="${t('resetCodePlaceholder')}" maxlength="6" style="text-align:center; font-size:20px; letter-spacing:6px;">
      <input id="newPassword" type="password" placeholder="${t('newPasswordPlaceholder')}">
      <button id="doReset">${t('resetPasswordBtn')}</button>
      <button class="secondary" id="resendResetCode" style="margin-top:10px;">${t('resendResetCodeBtn')}</button>
    </div>
  `);
  document.getElementById('back').onclick = () => renderAuth('login');
  on('doReset', 'click', async () => {
    try {
      await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({
        email: state.pendingEmail,
        code: document.getElementById('resetCode').value,
        newPassword: document.getElementById('newPassword').value,
      })});
      alert(t('passwordResetSuccessAlert'));
      boot();
    } catch (e) {
      const el = document.getElementById('resetErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  });
  on('resendResetCode', 'click', async () => {
    try {
      await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: state.pendingEmail }) });
      alert(t('resetCodeResentAlert'));
    } catch (e) { alert(e.message); }
  });
}

function showAuthErr(msg) {
  const el = document.getElementById('authErr');
  el.textContent = msg; el.classList.remove('hidden');
}

async function renderTraineeHome() {
  renderBottomNav('home');
  const { coaches } = await api('/coaches');
  state.coaches = coaches;
  const { subscriptions } = await api('/subscriptions/mine');
  state.mySubs = subscriptions;
  const { posts: contentPreview } = await api('/content').catch(() => ({ posts: [] }));

  const activeSubs = subscriptions.filter(s => s.status === 'active');
  const topTrainers = [...coaches].sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0)).slice(0, 8);
  const CATEGORIES = [
    [svgIconPro('strength', 22), t('catStrength'), 'قوة'],
    [svgIconPro('fat-loss', 22), t('catWeightLoss'), 'خسارة وزن'],
    [svgIconPro('muscle-building', 22), t('catBodybuilding'), 'بناء أجسام'],
    [svgIconPro('fitness', 22), t('catMobility'), 'ليونة'],
  ];

  render(`
    <div class="search-bar" id="homeSearchWrap">
      <span class="search-icon">${svgIcon('search', 16)}</span>
      <input id="homeSearch" placeholder="${t('searchTrainersPlaceholder')}" readonly style="cursor:pointer;">
    </div>

    <div class="category-grid">
      ${CATEGORIES.map(([icon, label, query]) => `
        <div class="category-item" data-category="${escapeHtml(query)}">
          <div class="category-icon">${icon}</div>
          <div class="category-label">${label}</div>
        </div>
      `).join('')}
    </div>

    <div class="section-header">
      <h2>${t('topTrainersTitle')}</h2>
      <a class="link" href="#" id="seeAllTrainers">${t('seeAllLink')}</a>
    </div>
    ${topTrainers.length === 0 ? `<p class="small" style="margin-bottom:16px;">${t('noApprovedCoaches')}</p>` : `
      <div class="hscroll">
        ${topTrainers.map((c) => `
          <div class="trainer-mini-card" data-open-coach="${c.id}">
            ${avatarCircle(c.name, c.avatar_path, 56)}
            <div class="tmc-name">${escapeHtml(c.name)}</div>
            <div class="tmc-spec">${escapeHtml(c.specialty) || t('coachSpecialtyFallback')}</div>
            ${c.avg_rating ? ratingBadge(c.avg_rating) : `<span class="small">${t('noReviewsYet')}</span>`}
          </div>
        `).join('')}
      </div>
    `}

    ${contentPreview.length > 0 ? `
    <div class="section-header">
      <h2>${t('contentFeedTitle')}</h2>
      <a class="link" href="#" id="seeAllContent">${t('seeAllLink')}</a>
    </div>
    <div id="homeContentPreview">${contentPreview.slice(0, 2).map(renderPostCard).join('')}</div>
    ` : ''}

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
  `);

  document.querySelectorAll('[data-open-coach]').forEach(el => {
    el.onclick = () => renderCoachProfile(el.dataset.openCoach);
  });
  document.querySelectorAll('[data-open-chat]').forEach(el => {
    el.onclick = () => renderChat(el.dataset.openChat);
  });
  on('homeSearchWrap', 'click', () => renderDiscover());
  document.querySelectorAll('[data-category]').forEach(el => {
    el.onclick = () => { discoverState.q = el.dataset.category; renderDiscover(); };
  });
  on('seeAllTrainers', 'click', (e) => { e.preventDefault(); renderDiscover(); });
  on('seeAllContent', 'click', (e) => { e.preventDefault(); renderContentFeed(); });
  const homeContentBox = document.getElementById('homeContentPreview');
  if (homeContentBox) wirePostCards(homeContentBox, contentPreview, () => renderTraineeHome());
}

async function renderCoachProfile(coachId) {
  const [{ coach }, { reviews }] = await Promise.all([
    api('/coaches/' + coachId),
    api('/reviews/coach/' + coachId),
  ]);
  const canModerate = state.user && state.user.id !== Number(coachId);
  const modStatus = canModerate ? await fetchModerationStatus(coachId) : null;
  render(`
    <div class="cover-header">
      <div class="cover-photo"></div>
      <div class="cover-avatar-wrap">${avatarCircle(coach.name, coach.avatar_path, 78)}</div>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <button class="secondary" id="back">${t('back')}</button>
      ${canModerate ? moderationMenuHtml() : ''}
    </div>
    <div class="card">
      <h2 style="margin-bottom:2px;">${escapeHtml(coach.name)} ${coach.verified ? `<span class="verified-badge">${svgIconPro('verified', 13)} ${t('verifiedLabel')}</span>` : ''}</h2>
      <p class="small">${escapeHtml(coach.specialty) || t('coachSpecialtyFallback')}</p>
      <p class="small" style="margin-top:4px;">${coach.avg_rating ? `${ratingBadge(coach.avg_rating)} ${t('reviewsCountLabel', { count: coach.review_count })}` : t('noReviewsYet')}</p>
      ${coach.profile_bio ? `<p style="font-size:13px; line-height:1.8; margin-top:10px;">${escapeHtml(coach.profile_bio)}</p>` : ''}
    </div>
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:14px;">
      <div class="stat-card">
        <div class="stat-value">${coach.client_count || 0}</div>
        <div class="small">${t('clientsStatLabel')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${coach.avg_rating || '-'}</div>
        <div class="small">${t('ratingStatLabel')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${coach.review_count || 0}</div>
        <div class="small">${t('reviewsStatLabel')}</div>
      </div>
    </div>
    <div class="card">
      <h2>${t('aboutMeTitle')}</h2>
      <p style="font-size:13px; line-height:1.8;">${escapeHtml(coach.bio) || t('noBioYet')}</p>
      ${coach.certification ? `<div style="margin-top:10px;"><span class="filter-chip active" style="cursor:default; display:inline-flex; align-items:center; gap:5px;">${svgIconPro('verified', 13)}${escapeHtml(coach.certification)}</span></div>` : ''}
    </div>
    <div class="card">
      <h2>${t('transformationsTitle')}</h2>
      <div id="publicTransformBox"><div class="skeleton block"></div></div>
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
            <span class="rating">${starRating(r.rating)}</span>
          </div>
          ${r.comment ? `<p class="small" style="margin-top:4px;">${escapeHtml(r.comment)}</p>` : ''}
          ${r.coach_response ? `<p class="small" style="margin-top:6px; background:var(--surface-2); padding:8px 10px; border-radius:8px;"><b>${t('coachResponseLabel')}</b> ${escapeHtml(r.coach_response)}</p>` : ''}
        </div>
      `).join('')}
    </div>
  `);
  document.getElementById('back').onclick = renderTraineeHome;
  if (canModerate) {
    wireModerationMenu(coachId, modStatus, null, () => renderCoachProfile(coachId));
  }
  loadAndRenderGallery('galleryBox', coachId, false);
  loadAndRenderPublicTransformations(coachId);
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

  let otherParty = null;
  let modStatus = { blockedByMe: false, blockedMe: false };
  try {
    const data = await api('/subscriptions/' + subscriptionId);
    otherParty = data.otherParty;
    if (otherParty) modStatus = await fetchModerationStatus(otherParty.id);
  } catch (e) {}
  const isBlocked = modStatus.blockedByMe || modStatus.blockedMe;

  render(`
    ${renderHubTabs(subscriptionId, 'chat')}
    ${otherParty ? `
      <div class="coach-row" style="margin-bottom:10px; cursor:default;">
        <b style="font-size:13px;">${escapeHtml(otherParty.name)}</b>
        ${moderationMenuHtml()}
      </div>
    ` : ''}
    <div class="notice">${t('chatPrivacyNotice')}</div>
    <div class="card" id="chatBox" style="min-height:300px; display:flex; flex-direction:column;">
      <div id="msgs" style="flex:1; overflow-y:auto; margin-bottom:10px;"></div>
    </div>
    ${isBlocked ? `
      <div class="card"><p class="small">${t('chatBlockedNotice')}</p></div>
    ` : `
      <div class="card" style="display:flex; gap:8px;">
        <input id="msgInput" placeholder="${t('messagePlaceholder')}" style="margin:0;">
        <button id="sendBtn" style="width:90px;">${t('sendBtn')}</button>
      </div>
    `}
  `);
  wireHubNav(subscriptionId, 'chat');
  if (otherParty) {
    wireModerationMenu(otherParty.id, modStatus, subscriptionId, () => renderChat(subscriptionId));
  }

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
  const stats = await api('/coach-stats');
  const activeSubs = subscriptions.filter(s => s.status === 'active');

  const statusLabel = { pending: t('statusPending'), approved: t('statusApproved'), rejected: t('statusRejected') }[profile.status];

  function fmtTime(dt) {
    return new Date(dt).toLocaleString(getLang() === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }

  render(`
    <div class="card">
      <h2>${t('greetingText', { name: escapeHtml(state.user.name) })}</h2>
      <p class="small">${t('accountStatusLabel')} <span class="pill">${statusLabel}</span></p>
    </div>

    <div class="stat-grid-2">
      ${statCardV2(stats.activeTrainees, svgIcon('client', 15), t('activeClientsStatLabel'))}
      ${statCardV2(stats.sessionsToday, svgIcon('calendar', 15), t('sessionsTodayStatLabel'))}
      ${statCardV2(stats.monthRevenue + ' ' + t('currency'), svgIcon('money', 15), t('thisMonthLabel'))}
      ${statCardV2(stats.satisfactionPct != null ? stats.satisfactionPct + '%' : '-', svgIcon('heart', 15), t('satisfactionStatLabel'))}
    </div>

    <div class="card menu-card" style="margin-bottom:18px;">
      <h2 style="margin-bottom:0;">${t('quickActionsTitle')}</h2>
      ${menuRow({ icon: svgIcon('profile', 18), label: t('editProfileMenuItem'), id: 'qaEditProfile' })}
      ${menuRow({ icon: svgIcon('client', 18), label: t('myClientsTitle'), id: 'qaMyClients' })}
      ${menuRow({ icon: svgIcon('calendar', 18), label: t('availabilityMenuItem'), id: 'qaAvailability' })}
      ${menuRow({ icon: svgIcon('upload', 18), label: t('trainerDocumentsMenuItem'), id: 'qaDocuments' })}
    </div>

    <div class="section-header">
      <h2>${t('upcomingSessionsTitle')}</h2>
      <a class="link" href="#" id="seeAllSessions">${t('seeAllLink')}</a>
    </div>
    <div class="card" style="margin-bottom:18px;">
      ${stats.upcomingList.length === 0 ? `<p class="small">${t('noSessionsYet')}</p>` : stats.upcomingList.map((s) => `
        <div class="coach-row" style="gap:10px;">
          ${avatarCircle(s.trainee_name, s.trainee_avatar, 36)}
          <div style="flex:1;">${escapeHtml(s.trainee_name)}<div class="small">${fmtTime(s.scheduled_at)}</div></div>
        </div>
      `).join('')}
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
  `);

  document.querySelectorAll('[data-open-chat]').forEach(el => {
    el.onclick = () => renderChat(el.dataset.openChat);
  });
  on('seeAllSessions', 'click', (e) => { e.preventDefault(); renderMyBookings(); });
  on('qaEditProfile', 'click', renderCoachProfileEdit);
  on('qaMyClients', 'click', renderMyClients);
  on('qaAvailability', 'click', renderCoachAvailability);
  on('qaDocuments', 'click', renderTrainerDocuments);
}

async function renderCoachProfileEdit() {
  const { profile, pendingEdit } = await api('/coaches/me/profile');

  // لو المدرب معتمد وعنده تعديل قيد المراجعة أو اتراجع، الفورم بيتملى
  // من التعديل ده مش من النسخة العامة الحالية - عشان يشوف آخر حاجة بعتها
  // ويقدر يعدّلها ويبعتها تاني، مش يضطر يكتب كل حاجة من الأول.
  const formValues = pendingEdit || profile;
  const editBanner = pendingEdit
    ? pendingEdit.status === 'pending'
      ? `<div class="notice">${t('profileEditPendingBanner', { date: new Date(pendingEdit.created_at).toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US') })}</div>`
      : `<div class="notice">${t('profileEditRejectedBanner')}${pendingEdit.review_note ? ': ' + escapeHtml(pendingEdit.review_note) : ''}</div>`
    : '';

  render(`
    <button class="secondary" id="back" style="margin-bottom:14px;">${t('back')}</button>
    <div class="card">
      <h2>${t('myProfile')}</h2>
      ${editBanner}
      <input id="specialty" placeholder="${t('specialtyPlaceholder')}" value="${escapeHtml(formValues.specialty)}">
      <textarea id="bio" placeholder="${t('bioPlaceholder')}" rows="3">${escapeHtml(formValues.bio)}</textarea>
      <input id="certification" placeholder="${t('certificationPlaceholder')}" value="${escapeHtml(formValues.certification)}">
      <select id="gender">
        <option value="" ${!formValues.gender ? 'selected' : ''}>${t('genderUnspecified')}</option>
        <option value="male" ${formValues.gender === 'male' ? 'selected' : ''}>${t('genderMale')}</option>
        <option value="female" ${formValues.gender === 'female' ? 'selected' : ''}>${t('genderFemale')}</option>
      </select>
      <input id="location" placeholder="${t('locationPlaceholder')}" value="${escapeHtml(formValues.location)}">
      <input id="price_1m" type="number" placeholder="${t('price1mPlaceholder')}" value="${formValues.price_1m || ''}">
      <input id="price_3m" type="number" placeholder="${t('price3mPlaceholder')}" value="${formValues.price_3m || ''}">
      <input id="price_6m" type="number" placeholder="${t('price6mPlaceholder')}" value="${formValues.price_6m || ''}">
      <button id="saveProfile">${t('saveProfileBtn')}</button>
      <p class="small" style="margin-top:8px;">${profile.status === 'approved' ? t('profileReviewHintApproved') : t('profileReviewHint')}</p>
    </div>
    <div class="card">
      <h2>${t('matchingTagsTitle')}</h2>
      <p class="small" style="margin-bottom:10px;">${t('matchingTagsHint')}</p>
      <label class="small" style="display:block; margin-bottom:6px;">${t('goalsLabel')}</label>
      <div class="chip-row" id="goalsChips">
        ${Object.entries(GOAL_LABELS).map(([key, labelKey]) => `<span class="filter-chip ${JSON.parse(profile.goals_json || '[]').includes(key) ? 'active' : ''}" data-tag-goal="${key}">${t(labelKey)}</span>`).join('')}
      </div>
      <label class="small" style="display:block; margin:12px 0 6px;">${t('trainingTypesLabel')}</label>
      <div class="chip-row" id="trainingTypeChips">
        ${Object.entries(TRAINING_TYPE_LABELS).map(([key, labelKey]) => `<span class="filter-chip ${JSON.parse(profile.training_types_json || '[]').includes(key) ? 'active' : ''}" data-tag-type="${key}">${t(labelKey)}</span>`).join('')}
      </div>
      <label class="small" style="display:block; margin:12px 0 6px;">${t('experienceLevelsLabel')}</label>
      <div class="chip-row" id="experienceChips">
        ${Object.entries(EXPERIENCE_LABELS).map(([key, labelKey]) => `<span class="filter-chip ${JSON.parse(profile.experience_levels_json || '[]').includes(key) ? 'active' : ''}" data-tag-exp="${key}">${t(labelKey)}</span>`).join('')}
      </div>
      <button id="saveMatchingTags" style="margin-top:12px;">${t('saveMatchingTagsBtn')}</button>
    </div>
  `);

  on('back', 'click', renderCoachDashboard);
  on('saveProfile', 'click', async () => {
    try {
      await api('/coaches/me/profile', { method: 'PUT', body: JSON.stringify({
        specialty: document.getElementById('specialty').value,
        bio: document.getElementById('bio').value,
        certification: document.getElementById('certification').value,
        gender: document.getElementById('gender').value,
        location: document.getElementById('location').value,
        price_1m: Number(document.getElementById('price_1m').value) || 0,
        price_3m: Number(document.getElementById('price_3m').value) || 0,
        price_6m: Number(document.getElementById('price_6m').value) || 0,
      })});
      renderCoachProfileEdit();
    } catch (e) { alert(e.message); }
  });

  document.querySelectorAll('[data-tag-goal], [data-tag-type], [data-tag-exp]').forEach((el) => {
    el.onclick = () => el.classList.toggle('active');
  });
  on('saveMatchingTags', 'click', async () => {
    const goals = Array.from(document.querySelectorAll('[data-tag-goal].active')).map((el) => el.dataset.tagGoal);
    const trainingTypes = Array.from(document.querySelectorAll('[data-tag-type].active')).map((el) => el.dataset.tagType);
    const experienceLevels = Array.from(document.querySelectorAll('[data-tag-exp].active')).map((el) => el.dataset.tagExp);
    try {
      await api('/coaches/me/matching-tags', { method: 'PUT', body: JSON.stringify({ goals, trainingTypes, experienceLevels }) });
      alert(t('matchingTagsSavedAlert'));
    } catch (e) { alert(e.message); }
  });
}

wireLangToggle();
boot();
