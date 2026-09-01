// شاشات الميزات الإضافية (خطط، تقدم، عادات، جلسات، إنجازات، لوحة أداء
// الكوتش، الشات بوت للدعم، السوق، التقييمات، متدربيني، الأرباح). بتستخدم
// نفس المساعدات العامة من app.js (render, on, api, state, escapeHtml, t,
// getLang) وبتتحمّل قبله في index.html.

function renderEmptyState(icon, title, hint) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-title">${escapeHtml(title)}</div><div class="empty-hint">${escapeHtml(hint)}</div></div>`;
}

// -------------------- الناف بار السفلي --------------------

function renderBottomNav(active) {
  const navEl = document.getElementById('bottomNav');
  if (!navEl) return;
  if (!state.user) { navEl.classList.add('hidden'); navEl.innerHTML = ''; return; }

  const items = state.user.role === 'coach' ? [
    ['dashboard', 'navDashboardTab', renderCoachDashboard],
    ['clients', 'navClientsTab', renderMyClients],
    ['csessions', 'navCoachSessionsTab', renderMyBookings],
    ['messages', 'navMessagesTab', renderMyMessages],
    ['more', 'navMoreTab', renderMore],
  ] : [
    ['home', 'navHomeTab', renderTraineeHome],
    ['discover', 'navDiscoverTab', renderDiscover],
    ['bookings', 'navBookingsTab', renderMyBookings],
    ['messages', 'navMessagesTab', renderMyMessages],
    ['profile', 'navProfileTab', renderProfile],
  ];

  navEl.classList.remove('hidden');
  navEl.innerHTML = items.map(([key, labelKey]) => {
    const label = t(labelKey);
    const spaceIdx = label.indexOf(' ');
    const icon = spaceIdx === -1 ? label : label.slice(0, spaceIdx);
    const text = spaceIdx === -1 ? '' : label.slice(spaceIdx + 1);
    return `<button class="nav-item ${active === key ? 'active' : ''}" data-nav="${key}"><span class="nav-icon">${icon}</span><span>${escapeHtml(text)}</span></button>`;
  }).join('');
  items.forEach(([key, , fn]) => {
    const btn = navEl.querySelector(`[data-nav="${key}"]`);
    if (btn) btn.onclick = () => { clearInterval(state.chatTimer); fn(); };
  });
}

// -------------------- حجوزاتي / جلساتي (تجميع كل الاشتراكات) --------------------

async function renderMyBookings() {
  renderBottomNav(state.user.role === 'coach' ? 'csessions' : 'bookings');
  const { subscriptions } = await api('/subscriptions/mine');
  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  const perSub = await Promise.all(activeSubs.map((s) =>
    api('/sessions/' + s.id).then((r) => r.sessions.map((sess) => ({ ...sess, partnerName: s.other_party_name, subscriptionId: s.id })))
  ));
  const all = perSub.flat().sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const now = Date.now();
  const isFutureScheduled = (s) => s.status === 'scheduled' && new Date(s.scheduled_at).getTime() > now;
  const upcoming = all.filter(isFutureScheduled);
  const past = all.filter((s) => !isFutureScheduled(s));
  const statusLabel = { scheduled: t('statusScheduled'), completed: t('statusCompleted'), cancelled: t('statusCancelled') };

  function fmt(dt) {
    return new Date(dt).toLocaleString(getLang() === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  }

  render(`
    <div class="topbar"><h2 style="margin:0;">${t('myBookingsTitle')}</h2></div>
    <div class="card">
      ${upcoming.length === 0 && past.length === 0 ? renderEmptyState('📅', t('emptyBookingsTitle'), t('emptyBookingsHint')) : `
        ${upcoming.length ? `<h2>${t('upcomingSessionsTitle')}</h2>${upcoming.map((s) => `
          <div class="coach-row" data-open-sub="${s.subscriptionId}">
            <div>${escapeHtml(s.partnerName)}<div class="small">${fmt(s.scheduled_at)}</div></div>
            <span class="pill">${statusLabel[s.status]}</span>
          </div>
        `).join('')}` : ''}
        ${past.length ? `<h2 style="margin-top:14px;">${t('pastSessionsTitle')}</h2>${past.map((s) => `
          <div class="coach-row" data-open-sub="${s.subscriptionId}">
            <div>${escapeHtml(s.partnerName)}<div class="small">${fmt(s.scheduled_at)}</div></div>
            <span class="small">${statusLabel[s.status]}</span>
          </div>
        `).join('')}` : ''}
      `}
    </div>
  `);
  document.querySelectorAll('[data-open-sub]').forEach((el) => {
    el.onclick = () => renderSessionsTab(el.dataset.openSub);
  });
}

// -------------------- رسائلي (تجميع كل محادثات الاشتراكات) --------------------

async function renderMyMessages() {
  renderBottomNav('messages');
  const { subscriptions } = await api('/subscriptions/mine');
  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  render(`
    <div class="topbar"><h2 style="margin:0;">${t('myMessagesTitle')}</h2></div>
    <div class="card">
      ${activeSubs.length === 0 ? renderEmptyState('💬', t('emptyMessagesTitle'), t('emptyMessagesHint')) : activeSubs.map((s) => `
        <div class="coach-row" data-open-chat="${s.id}">
          <div>${escapeHtml(s.other_party_name)}<div class="small">${t('packageLabel', { pkg: s.package })}</div></div>
          <div class="small">${t('chatLink')}</div>
        </div>
      `).join('')}
    </div>
  `);
  document.querySelectorAll('[data-open-chat]').forEach((el) => {
    el.onclick = () => renderChat(el.dataset.openChat);
  });
}

// -------------------- حسابي (متدرب) / المزيد (كوتش) --------------------

async function renderProfile() {
  renderBottomNav('profile');
  render(`
    <div class="topbar"><h2 style="margin:0;">${t('profileTitle')}</h2></div>
    <div class="card">
      <h2>${t('accountSection')}</h2>
      <div class="coach-row"><div>${t('nameLabel')}</div><div>${escapeHtml(state.user.name)}</div></div>
      <div class="coach-row"><div>${t('emailLabel')}</div><div class="small">${escapeHtml(state.user.email || '')}</div></div>
      <div class="coach-row"><div>${t('roleLabel')}</div><div>${t('roleTraineeLabel')}</div></div>
    </div>
    <div class="card">
      <button class="secondary" id="goSupport">${t('supportMenuItem')}</button>
    </div>
    ${logoutBtn()}
  `);
  on('goSupport', 'click', renderSupportHome);
  wireLogout();
}

async function renderMore() {
  renderBottomNav('more');
  render(`
    <div class="topbar"><h2 style="margin:0;">${t('moreTitle')}</h2></div>
    <div class="card">
      <h2>${t('accountSection')}</h2>
      <div class="coach-row"><div>${t('nameLabel')}</div><div>${escapeHtml(state.user.name)}</div></div>
      <div class="coach-row"><div>${t('emailLabel')}</div><div class="small">${escapeHtml(state.user.email || '')}</div></div>
      <div class="coach-row"><div>${t('roleLabel')}</div><div>${t('roleCoachLabel')}</div></div>
    </div>
    <div class="card">
      <button class="secondary" id="goEarnings" style="margin-bottom:8px;">${t('earningsMenuItem')}</button>
      <button class="secondary" id="goSupport">${t('supportMenuItem')}</button>
    </div>
    ${logoutBtn()}
  `);
  on('goEarnings', 'click', renderEarnings);
  on('goSupport', 'click', renderSupportHome);
  wireLogout();
}

// -------------------- الدعم الفني --------------------

const TICKET_CATEGORIES = ['payment', 'booking', 'account', 'trainer', 'technical', 'report', 'other'];
const TICKET_CATEGORY_KEYS = { payment: 'catPayment', booking: 'catBooking', account: 'catAccount', trainer: 'catTrainer', technical: 'catTechnical', report: 'catReport', other: 'catOther' };
const TICKET_STATUS_KEYS = { open: 'statusOpen', in_progress: 'statusInProgress', waiting_user: 'statusWaitingUser', resolved: 'statusResolved', closed: 'statusClosed' };
const TICKET_PRIORITY_KEYS = { low: 'priorityLow', normal: 'priorityNormal', high: 'priorityHigh', urgent: 'priorityUrgent' };

async function renderSupportHome() {
  const { tickets } = await api('/support/mine');
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card">
      <h2>${t('helpSupportTitle')}</h2>
      <button id="newTicket">${t('newTicketBtn')}</button>
    </div>
    <div class="card">
      ${tickets.length === 0 ? `<p class="small">${t('noTicketsYet')}</p>` : tickets.map((tk) => `
        <div class="coach-row" data-open-ticket="${tk.id}">
          <div>${escapeHtml(tk.subject)}
            <div class="small">${t(TICKET_CATEGORY_KEYS[tk.category])} · ${new Date(tk.created_at + 'Z').toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US')}</div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${tk.unread ? '<span class="pill">●</span>' : ''}
            <span class="small">${t(TICKET_STATUS_KEYS[tk.status])}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `);
  document.getElementById('back').onclick = boot;
  on('newTicket', 'click', renderNewTicket);
  document.querySelectorAll('[data-open-ticket]').forEach((el) => {
    el.onclick = () => renderTicketDetail(el.dataset.openTicket);
  });
}

function renderNewTicket() {
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card">
      <h2>${t('newTicketBtn')}</h2>
      <div class="error hidden" id="ticketErr"></div>
      <label class="small" style="display:block; margin-bottom:6px;">${t('ticketCategoryLabel')}</label>
      <select id="category">
        ${TICKET_CATEGORIES.map((c) => `<option value="${c}">${t(TICKET_CATEGORY_KEYS[c])}</option>`).join('')}
      </select>
      <input id="subject" placeholder="${t('ticketSubjectPlaceholder')}">
      <textarea id="message" rows="4" placeholder="${t('ticketMessagePlaceholder')}"></textarea>
      <button id="submitTicket">${t('submitTicketBtn')}</button>
    </div>
  `);
  document.getElementById('back').onclick = renderSupportHome;
  on('submitTicket', 'click', async () => {
    try {
      const { ticketId } = await api('/support', { method: 'POST', body: JSON.stringify({
        category: document.getElementById('category').value,
        subject: document.getElementById('subject').value,
        message: document.getElementById('message').value,
      })});
      alert(t('ticketSentAlert'));
      renderTicketDetail(ticketId);
    } catch (e) {
      const el = document.getElementById('ticketErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  });
}

async function renderTicketDetail(ticketId) {
  const { ticket, messages } = await api('/support/' + ticketId);
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card">
      <h2>${escapeHtml(ticket.subject)}</h2>
      <p class="small">${t(TICKET_CATEGORY_KEYS[ticket.category])} · <span class="pill">${t(TICKET_STATUS_KEYS[ticket.status])}</span></p>
    </div>
    <div class="card" style="min-height:200px;">
      ${messages.map((m) => `
        <div class="msg ${m.sender_type === 'user' ? 'me' : 'them'}">${escapeHtml(m.content)}</div>
      `).join('')}
    </div>
    ${ticket.status !== 'closed' ? `
    <div class="card" style="display:flex; gap:8px;">
      <input id="replyInput" placeholder="${t('replyPlaceholder')}" style="margin:0;">
      <button id="replyBtn" style="width:90px;">${t('replyBtn')}</button>
    </div>` : ''}
  `);
  document.getElementById('back').onclick = renderSupportHome;
  on('replyBtn', 'click', async () => {
    const input = document.getElementById('replyInput');
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    try {
      await api('/support/' + ticketId + '/reply', { method: 'POST', body: JSON.stringify({ message }) });
      renderTicketDetail(ticketId);
    } catch (e) { alert(e.message); }
  });
}

// -------------------- اكتشف / سوق المدربين --------------------

function avatarCircle(name) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return `<div style="width:44px; height:44px; border-radius:50%; background:var(--surface-2); border:1px solid var(--line); display:flex; align-items:center; justify-content:center; font-weight:800; color:var(--red-soft); flex-shrink:0;">${escapeHtml(initial)}</div>`;
}

function renderCoachCard(c) {
  return `
    <div class="card" data-open-coach="${c.id}" style="cursor:pointer; display:flex; gap:12px; align-items:center;">
      ${avatarCircle(c.name)}
      <div style="flex:1; min-width:0;">
        <div style="font-weight:800; font-size:13.5px;">${escapeHtml(c.name)} ${c.verified ? `<span class="verified-badge">${t('verifiedLabel')}</span>` : ''}</div>
        <div class="small">${escapeHtml(c.specialty) || t('coachSpecialtyFallback')}</div>
        <div class="small">
          ${c.avg_rating ? `<span class="rating">★ ${c.avg_rating}</span> ${t('reviewsCountLabel', { count: c.review_count })}` : t('noReviewsYet')}
          ${c.client_count ? ' · ' + t('clientsCountLabel', { count: c.client_count }) : ''}
        </div>
      </div>
      <div class="small" style="white-space:nowrap;">${t('pricePerMonth', { price: c.price_1m })}</div>
    </div>
  `;
}

let discoverState = { q: '', minPrice: '', maxPrice: '', sort: 'newest' };
let discoverDebounce = null;

async function renderDiscover() {
  renderBottomNav('discover');
  render(`
    <div class="card">
      <input id="discoverSearch" placeholder="${t('searchTrainersPlaceholder')}" value="${escapeHtml(discoverState.q)}" style="margin-bottom:12px;">
      <div style="display:flex; gap:8px;">
        <input id="minPrice" type="number" placeholder="${t('minPriceLabel')}" value="${escapeHtml(discoverState.minPrice)}">
        <input id="maxPrice" type="number" placeholder="${t('maxPriceLabel')}" value="${escapeHtml(discoverState.maxPrice)}">
      </div>
      <select id="sortSelect">
        <option value="newest" ${discoverState.sort === 'newest' ? 'selected' : ''}>${t('sortNewest')}</option>
        <option value="rating" ${discoverState.sort === 'rating' ? 'selected' : ''}>${t('sortRating')}</option>
        <option value="price_asc" ${discoverState.sort === 'price_asc' ? 'selected' : ''}>${t('sortPriceAsc')}</option>
        <option value="price_desc" ${discoverState.sort === 'price_desc' ? 'selected' : ''}>${t('sortPriceDesc')}</option>
      </select>
      <button id="applyFilters">${t('applyFiltersBtn')}</button>
    </div>
    <div id="discoverResults"><div class="skeleton block"></div><div class="skeleton block"></div></div>
  `);

  async function loadResults() {
    const params = new URLSearchParams();
    if (discoverState.q) params.set('q', discoverState.q);
    if (discoverState.minPrice) params.set('minPrice', discoverState.minPrice);
    if (discoverState.maxPrice) params.set('maxPrice', discoverState.maxPrice);
    if (discoverState.sort !== 'newest') params.set('sort', discoverState.sort);
    const { coaches } = await api('/coaches?' + params.toString());
    const box = document.getElementById('discoverResults');
    if (!box) return;
    box.innerHTML = coaches.length === 0
      ? renderEmptyState('🔍', t('emptyDiscoverTitle'), t('emptyDiscoverHint'))
      : coaches.map(renderCoachCard).join('');
    box.querySelectorAll('[data-open-coach]').forEach((el) => {
      el.onclick = () => renderCoachProfile(el.dataset.openCoach);
    });
  }

  document.getElementById('discoverSearch').oninput = (e) => {
    discoverState.q = e.target.value;
    clearTimeout(discoverDebounce);
    discoverDebounce = setTimeout(loadResults, 350);
  };
  document.getElementById('sortSelect').onchange = (e) => { discoverState.sort = e.target.value; loadResults(); };
  on('applyFilters', 'click', () => {
    discoverState.minPrice = document.getElementById('minPrice').value;
    discoverState.maxPrice = document.getElementById('maxPrice').value;
    loadResults();
  });

  loadResults();
}

// -------------------- متدربيني (للكوتش) --------------------

let clientsTab = 'active';

async function renderMyClients() {
  renderBottomNav('clients');
  const { subscriptions } = await api('/subscriptions/mine');
  const groups = {
    active: subscriptions.filter((s) => s.status === 'active'),
    pending: subscriptions.filter((s) => s.status === 'pending_payment'),
    past: subscriptions.filter((s) => s.status === 'expired' || s.status === 'cancelled'),
  };

  const nextSessionBySub = {};
  if (groups.active.length) {
    const now = Date.now();
    await Promise.all(groups.active.map(async (s) => {
      const { sessions } = await api('/sessions/' + s.id);
      const next = sessions
        .filter((sess) => sess.status === 'scheduled' && new Date(sess.scheduled_at).getTime() > now)
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];
      if (next) nextSessionBySub[s.id] = next.scheduled_at;
    }));
  }

  function renderList() {
    const list = groups[clientsTab];
    const emptyMsg = { active: t('noActiveClients'), pending: t('noPendingClients'), past: t('noPastClients') }[clientsTab];
    document.getElementById('clientsList').innerHTML = list.length === 0
      ? renderEmptyState('👥', emptyMsg, '')
      : list.map((s) => `
        <div class="card" data-open-client="${s.id}" style="cursor:pointer; display:flex; gap:12px; align-items:center;">
          ${avatarCircle(s.other_party_name)}
          <div style="flex:1; min-width:0;">
            <div style="font-weight:800; font-size:13.5px;">${escapeHtml(s.other_party_name)}</div>
            <div class="small">${t('packageLabel', { pkg: s.package })}</div>
            ${clientsTab === 'active' ? `<div class="small">${nextSessionBySub[s.id] ? t('nextSessionLabel', { date: new Date(nextSessionBySub[s.id]).toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US') }) : t('noUpcomingSession')}</div>` : ''}
          </div>
        </div>
      `).join('');
    document.querySelectorAll('[data-open-client]').forEach((el) => {
      el.onclick = () => renderProgressTab(el.dataset.openClient);
    });
  }

  render(`
    <div class="topbar"><h2 style="margin:0;">${t('myClientsTitle')}</h2></div>
    <div class="tabs">
      <div class="tab ${clientsTab === 'active' ? 'active' : ''}" data-ctab="active">${t('clientsTabActive')}</div>
      <div class="tab ${clientsTab === 'pending' ? 'active' : ''}" data-ctab="pending">${t('clientsTabPending')}</div>
      <div class="tab ${clientsTab === 'past' ? 'active' : ''}" data-ctab="past">${t('clientsTabPast')}</div>
    </div>
    <div id="clientsList"></div>
  `);
  document.querySelectorAll('[data-ctab]').forEach((el) => {
    el.onclick = () => { clientsTab = el.dataset.ctab; renderMyClients(); };
  });
  renderList();
}

// -------------------- الأرباح (للكوتش) --------------------

async function renderEarnings() {
  const { subscriptions } = await api('/subscriptions/mine');
  const paid = subscriptions.filter((s) => s.coach_payout != null).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const totalEarnings = paid.reduce((sum, s) => sum + (s.coach_payout || 0), 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthEarnings = paid.filter((s) => (s.created_at || '').slice(0, 7) === thisMonth).reduce((sum, s) => sum + (s.coach_payout || 0), 0);
  const statusLabel = { active: t('statusActive'), expired: t('statusCompleted'), cancelled: t('statusCancelled'), pending_payment: t('statusScheduled') };

  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card">
      <h2>${t('earningsTitle')}</h2>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">${totalEarnings} ${t('currency')}</div><div class="small">${t('totalEarningsLabel')}</div></div>
        <div class="stat-card"><div class="stat-value">${monthEarnings} ${t('currency')}</div><div class="small">${t('thisMonthLabel')}</div></div>
      </div>
    </div>
    <div class="card">
      <h2>${t('transactionsTitle')}</h2>
      ${paid.length === 0 ? `<p class="small">${t('noTransactionsYet')}</p>` : paid.map((s) => `
        <div class="coach-row" style="display:block;">
          <div style="display:flex; justify-content:space-between;">
            <b style="font-size:12.5px;">${escapeHtml(s.other_party_name)}</b>
            <span class="small">${new Date(s.created_at + 'Z').toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US')}</span>
          </div>
          <div class="small">${t('packageLabel', { pkg: s.package })} · ${statusLabel[s.status] || s.status}</div>
          <div class="small">${t('platformFeeLabel')}: ${s.commission_amount} ${t('currency')} (${Math.round(s.commission_rate * 100)}%) · <b>${t('netAmountLabel')}: ${s.coach_payout} ${t('currency')}</b></div>
        </div>
      `).join('')}
    </div>
  `);
  document.getElementById('back').onclick = renderMore;
}

const HUB_TABS = [
  ['chat', 'navChat'],
  ['plan', 'navPlan'],
  ['progress', 'navProgress'],
  ['habits', 'navHabits'],
  ['sessions', 'navSessions'],
];

function renderHubTabs(subscriptionId, active) {
  return `
    <button class="secondary" id="back">${t('back')}</button>
    <div class="subtabs">
      ${HUB_TABS.map(([key, labelKey]) => `<div class="subtab ${active === key ? 'active' : ''}" data-subtab="${key}">${t(labelKey)}</div>`).join('')}
    </div>
  `;
}

// اسم الدوال بتتحل وقت الضغط مش وقت التحميل، عشان features.js وapp.js
// يقدروا يتحملوا بأي ترتيب من غير ما حد يستنى التاني.
function wireHubNav(subscriptionId, active) {
  const isCoach = state.user.role === 'coach';
  if (active === 'chat') renderBottomNav('messages');
  else if (active === 'sessions') renderBottomNav(isCoach ? 'csessions' : 'bookings');

  document.getElementById('back').onclick = () => { clearInterval(state.chatTimer); boot(); };
  document.querySelectorAll('[data-subtab]').forEach((el) => {
    el.onclick = () => {
      const key = el.dataset.subtab;
      if (key === active) return;
      clearInterval(state.chatTimer);
      if (key === 'chat') renderChat(subscriptionId);
      else if (key === 'plan') renderPlanTab(subscriptionId);
      else if (key === 'progress') renderProgressTab(subscriptionId);
      else if (key === 'habits') renderHabitsTab(subscriptionId);
      else if (key === 'sessions') renderSessionsTab(subscriptionId);
    };
  });
}

function renderBadgeShelf(badges) {
  return `
    <div class="card">
      <h2>${t('badgesTitle')}</h2>
      ${badges.length === 0 ? `<p class="small">${t('noBadgesYet')}</p>` : `
        <div class="badge-shelf">
          ${badges.map((b) => {
            const label = getLang() === 'ar' ? b.label_ar : b.label_en;
            return `
              <div class="badge-item" title="${escapeHtml(label)}">
                <div class="badge-icon">${b.icon}</div>
                <div class="badge-label">${escapeHtml(label)}</div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

// -------------------- خطط التمرين والتغذية --------------------

let planEditState = { workout: null, nutrition: null };

async function renderPlanTab(subscriptionId) {
  const isCoach = state.user.role === 'coach';
  const [{ plan: workoutPlan }, { plan: nutritionPlan }] = await Promise.all([
    api('/plans/' + subscriptionId + '/workout'),
    api('/plans/' + subscriptionId + '/nutrition'),
  ]);
  planEditState.workout = {
    title: workoutPlan?.title || '',
    days: workoutPlan?.days ? JSON.parse(JSON.stringify(workoutPlan.days)) : [],
  };
  planEditState.nutrition = {
    daily_calories: nutritionPlan?.daily_calories || '',
    notes: nutritionPlan?.notes || '',
    meals: nutritionPlan?.meals ? JSON.parse(JSON.stringify(nutritionPlan.meals)) : [],
  };

  render(`
    ${renderHubTabs(subscriptionId, 'plan')}
    <div class="card">
      <h2>${t('workoutPlanTitle')}</h2>
      <div id="workoutBody"></div>
    </div>
    <div class="card">
      <h2>${t('nutritionPlanTitle')}</h2>
      <div id="nutritionBody"></div>
    </div>
  `);
  wireHubNav(subscriptionId, 'plan');
  renderWorkoutBody(subscriptionId, isCoach);
  renderNutritionBody(subscriptionId, isCoach);
}

function renderWorkoutBody(subscriptionId, isCoach) {
  const body = document.getElementById('workoutBody');
  const wp = planEditState.workout;

  if (!isCoach) {
    body.innerHTML = wp.days.length ? wp.days.map((day) => `
      <div class="plan-day">
        <div class="plan-day-title">${escapeHtml(day.label)}</div>
        ${day.exercises.map((ex) => `
          <div class="exercise-row read">
            <div>
              <div class="exercise-name">${escapeHtml(ex.name)}</div>
              <div class="small">${ex.sets ? ex.sets + ' × ' : ''}${escapeHtml(ex.reps)}${ex.notes ? ' · ' + escapeHtml(ex.notes) : ''}</div>
            </div>
            ${ex.video_url ? `<a class="link" href="${escapeHtml(ex.video_url)}" target="_blank" rel="noopener">▶</a>` : ''}
          </div>
        `).join('')}
      </div>
    `).join('') : `<p class="small">${t('noWorkoutPlanYet')}</p>`;
    return;
  }

  body.innerHTML = `
    ${wp.days.map((day, di) => `
      <div class="plan-day">
        <div style="display:flex; gap:8px; align-items:center;">
          <input data-day="${di}" value="${escapeHtml(day.label)}" placeholder="${t('dayLabelPlaceholder')}" style="margin-bottom:8px;">
          <button class="secondary" data-remove-day="${di}" style="width:auto; padding:8px 12px; margin-bottom:8px;">${t('removeBtn')}</button>
        </div>
        ${day.exercises.map((ex, ei) => `
          <div class="exercise-row">
            <input data-ex="name:${di}:${ei}" value="${escapeHtml(ex.name)}" placeholder="${t('exerciseNamePlaceholder')}">
            <div style="display:flex; gap:6px;">
              <input data-ex="sets:${di}:${ei}" type="number" value="${ex.sets ?? ''}" placeholder="${t('setsPlaceholder')}">
              <input data-ex="reps:${di}:${ei}" value="${escapeHtml(ex.reps)}" placeholder="${t('repsPlaceholder')}">
            </div>
            <input data-ex="video_url:${di}:${ei}" value="${escapeHtml(ex.video_url)}" placeholder="${t('videoUrlPlaceholder')}">
            <div style="display:flex; gap:6px;">
              <input data-ex="notes:${di}:${ei}" value="${escapeHtml(ex.notes)}" placeholder="${t('exerciseNotesPlaceholder')}">
              <button class="secondary" data-remove-ex="${di}:${ei}" style="width:auto; padding:8px 12px;">${t('removeBtn')}</button>
            </div>
          </div>
        `).join('')}
        <button class="secondary" data-add-ex="${di}" style="margin-bottom:4px;">${t('addExerciseBtn')}</button>
      </div>
    `).join('')}
    <button class="secondary" id="addDay">${t('addDayBtn')}</button>
    <button id="saveWorkout" style="margin-top:10px;">${t('savePlanBtn')}</button>
  `;

  document.querySelectorAll('[data-day]').forEach((el) => {
    el.oninput = () => { wp.days[+el.dataset.day].label = el.value; };
  });
  document.querySelectorAll('[data-ex]').forEach((el) => {
    el.oninput = () => {
      const [field, di, ei] = el.dataset.ex.split(':');
      wp.days[+di].exercises[+ei][field] = field === 'sets' ? (el.value ? Number(el.value) : null) : el.value;
    };
  });
  document.querySelectorAll('[data-remove-day]').forEach((el) => {
    el.onclick = () => { wp.days.splice(+el.dataset.removeDay, 1); renderWorkoutBody(subscriptionId, isCoach); };
  });
  document.querySelectorAll('[data-add-ex]').forEach((el) => {
    el.onclick = () => {
      wp.days[+el.dataset.addEx].exercises.push({ name: '', sets: null, reps: '', video_url: '', notes: '' });
      renderWorkoutBody(subscriptionId, isCoach);
    };
  });
  document.querySelectorAll('[data-remove-ex]').forEach((el) => {
    el.onclick = () => {
      const [di, ei] = el.dataset.removeEx.split(':').map(Number);
      wp.days[di].exercises.splice(ei, 1);
      renderWorkoutBody(subscriptionId, isCoach);
    };
  });
  on('addDay', 'click', () => { wp.days.push({ label: '', exercises: [] }); renderWorkoutBody(subscriptionId, isCoach); });
  on('saveWorkout', 'click', async () => {
    try {
      await api('/plans/' + subscriptionId + '/workout', { method: 'PUT', body: JSON.stringify({ title: wp.title, days: wp.days }) });
      alert(t('planSavedAlert'));
    } catch (e) { alert(e.message); }
  });
}

function renderNutritionBody(subscriptionId, isCoach) {
  const body = document.getElementById('nutritionBody');
  const np = planEditState.nutrition;

  if (!isCoach) {
    body.innerHTML = `
      ${np.daily_calories ? `<p class="small">🔥 ${np.daily_calories} kcal</p>` : ''}
      ${np.notes ? `<p style="font-size:13px; line-height:1.8;">${escapeHtml(np.notes)}</p>` : ''}
      ${np.meals.length ? np.meals.map((m) => `
        <div class="coach-row"><div>${escapeHtml(m.label)}<div class="small">${escapeHtml(m.description)}</div></div></div>
      `).join('') : `<p class="small">${t('noNutritionPlanYet')}</p>`}
    `;
    return;
  }

  body.innerHTML = `
    <input id="dailyCalories" type="number" value="${np.daily_calories || ''}" placeholder="${t('dailyCaloriesPlaceholder')}">
    <textarea id="nutritionNotes" rows="2" placeholder="${t('nutritionNotesPlaceholder')}">${escapeHtml(np.notes)}</textarea>
    ${np.meals.map((m, mi) => `
      <div class="exercise-row">
        <input data-meal-label="${mi}" value="${escapeHtml(m.label)}" placeholder="${t('mealLabelPlaceholder')}">
        <div style="display:flex; gap:6px;">
          <input data-meal-desc="${mi}" value="${escapeHtml(m.description)}" placeholder="${t('mealDescPlaceholder')}">
          <button class="secondary" data-remove-meal="${mi}" style="width:auto; padding:8px 12px;">${t('removeBtn')}</button>
        </div>
      </div>
    `).join('')}
    <button class="secondary" id="addMeal">${t('addMealBtn')}</button>
    <button id="saveNutrition" style="margin-top:10px;">${t('savePlanBtn')}</button>
  `;

  document.querySelectorAll('[data-meal-label]').forEach((el) => {
    el.oninput = () => { np.meals[+el.dataset.mealLabel].label = el.value; };
  });
  document.querySelectorAll('[data-meal-desc]').forEach((el) => {
    el.oninput = () => { np.meals[+el.dataset.mealDesc].description = el.value; };
  });
  document.querySelectorAll('[data-remove-meal]').forEach((el) => {
    el.onclick = () => { np.meals.splice(+el.dataset.removeMeal, 1); renderNutritionBody(subscriptionId, isCoach); };
  });
  on('addMeal', 'click', () => { np.meals.push({ label: '', description: '' }); renderNutritionBody(subscriptionId, isCoach); });
  on('saveNutrition', 'click', async () => {
    try {
      await api('/plans/' + subscriptionId + '/nutrition', { method: 'PUT', body: JSON.stringify({
        daily_calories: document.getElementById('dailyCalories').value,
        notes: document.getElementById('nutritionNotes').value,
        meals: np.meals,
      })});
      alert(t('planSavedAlert'));
    } catch (e) { alert(e.message); }
  });
}

// -------------------- متابعة التقدم --------------------

function renderWeightChart(entries) {
  const w = 400, h = 140, pad = 24;
  const weights = entries.map((e) => e.weight_kg);
  const min = Math.min(...weights), max = Math.max(...weights);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / ((entries.length - 1) || 1);
  const points = entries.map((e, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((e.weight_kg - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;">
      <polyline points="${points.join(' ')}" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${points.map((p) => { const [x, y] = p.split(','); return `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--red-soft)"/>`; }).join('')}
      <text x="${pad}" y="${h - 4}" fill="var(--text-dim)" font-size="10">${min.toFixed(1)} ${t('kgUnit')}</text>
      <text x="${w - pad - 34}" y="14" fill="var(--text-dim)" font-size="10">${max.toFixed(1)} ${t('kgUnit')}</text>
    </svg>
  `;
}

async function renderProgressTab(subscriptionId) {
  const isCoach = state.user.role === 'coach';
  const [{ entries }, { badges }] = await Promise.all([
    api('/progress/' + subscriptionId),
    api('/badges/' + subscriptionId),
  ]);
  const weighed = entries.filter((e) => e.weight_kg != null);

  render(`
    ${renderHubTabs(subscriptionId, 'progress')}
    ${renderBadgeShelf(badges)}
    ${!isCoach ? `
    <div class="card">
      <h2>${t('logWeightBtn')}</h2>
      <div class="error hidden" id="progressErr"></div>
      <input id="weightInput" type="number" step="0.1" placeholder="${t('weightPlaceholder')}">
      <input id="noteInput" placeholder="${t('progressNotePlaceholder')}">
      <label class="small" style="display:block; margin-bottom:6px;">${t('uploadPhotoLabel')}</label>
      <input id="photoInput" type="file" accept="image/png,image/jpeg,image/webp" style="margin-bottom:10px;">
      <button id="saveEntry">${t('addEntryBtn')}</button>
    </div>` : ''}
    ${weighed.length >= 2 ? `
    <div class="card">
      <h2>${t('weightChartTitle')}</h2>
      ${renderWeightChart(weighed)}
    </div>` : ''}
    <div class="card">
      ${entries.length === 0 ? `<p class="small">${t('noProgressYet')}</p>` : entries.slice().reverse().map((e) => `
        <div class="progress-entry">
          ${e.photo_path ? `<img src="/uploads/${encodeURIComponent(e.photo_path)}" class="progress-photo" alt="">` : ''}
          <div>
            ${e.weight_kg != null ? `<div>⚖️ ${e.weight_kg} ${t('kgUnit')}</div>` : ''}
            ${e.note ? `<div class="small">${escapeHtml(e.note)}</div>` : ''}
            <div class="small">${new Date(e.created_at + 'Z').toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US')}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `);
  wireHubNav(subscriptionId, 'progress');

  on('saveEntry', 'click', async () => {
    const fd = new FormData();
    const weight = document.getElementById('weightInput').value;
    const note = document.getElementById('noteInput').value;
    const file = document.getElementById('photoInput').files[0];
    if (weight) fd.append('weight_kg', weight);
    if (note) fd.append('note', note);
    if (file) fd.append('photo', file);
    try {
      await apiUpload('/progress/' + subscriptionId, fd);
      renderProgressTab(subscriptionId);
    } catch (e) {
      const el = document.getElementById('progressErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  });
}

// -------------------- العادات اليومية --------------------

async function renderHabitsTab(subscriptionId) {
  const isCoach = state.user.role === 'coach';
  const [{ habits }, { logs }] = await Promise.all([
    api('/habits/' + subscriptionId + '/definitions'),
    api('/habits/' + subscriptionId + '/logs'),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const doneToday = new Set(logs.filter((l) => l.log_date === today && l.done).map((l) => l.habit_id));
  const countByHabit = {};
  logs.forEach((l) => { if (l.done) countByHabit[l.habit_id] = (countByHabit[l.habit_id] || 0) + 1; });

  render(`
    ${renderHubTabs(subscriptionId, 'habits')}
    <div class="card">
      <h2>${t('habitsTitle')}</h2>
      ${habits.length === 0 ? `<p class="small">${t('noHabitsYet')}</p>` : habits.map((h) => `
        <div class="habit-row">
          <label class="habit-check">
            <input type="checkbox" data-habit="${h.id}" ${doneToday.has(h.id) ? 'checked' : ''} ${isCoach ? 'disabled' : ''}>
            <span>${escapeHtml(h.label)}</span>
          </label>
          <div class="small">${countByHabit[h.id] || 0}/30 · ${t('streakLabel')}</div>
          ${isCoach ? `<button class="secondary" data-remove-habit="${h.id}" style="width:auto; padding:6px 10px;">${t('removeBtn')}</button>` : ''}
        </div>
      `).join('')}
    </div>
    ${isCoach ? `
    <div class="card">
      <input id="newHabit" placeholder="${t('addHabitPlaceholder')}">
      <button id="addHabit">${t('addHabitBtn')}</button>
    </div>` : ''}
  `);
  wireHubNav(subscriptionId, 'habits');

  document.querySelectorAll('[data-habit]').forEach((el) => {
    el.onchange = async () => {
      try {
        await api('/habits/' + subscriptionId + '/logs/toggle', { method: 'POST', body: JSON.stringify({ habit_id: Number(el.dataset.habit), date: today }) });
        renderHabitsTab(subscriptionId);
      } catch (e) { alert(e.message); }
    };
  });
  document.querySelectorAll('[data-remove-habit]').forEach((el) => {
    el.onclick = async () => {
      if (!confirm(t('removeHabitConfirm'))) return;
      await api('/habits/' + subscriptionId + '/definitions/' + el.dataset.removeHabit, { method: 'DELETE' });
      renderHabitsTab(subscriptionId);
    };
  });
  on('addHabit', 'click', async () => {
    const input = document.getElementById('newHabit');
    if (!input.value.trim()) return;
    try {
      await api('/habits/' + subscriptionId + '/definitions', { method: 'POST', body: JSON.stringify({ label: input.value.trim() }) });
      renderHabitsTab(subscriptionId);
    } catch (e) { alert(e.message); }
  });
}

// -------------------- جدولة الجلسات --------------------

async function renderReviewCard(subscriptionId, isCoach, hasCompletedSession) {
  if (!hasCompletedSession) return '';
  const { review } = await api('/reviews/' + subscriptionId + '/mine');

  if (isCoach) {
    if (!review) return '';
    return `
      <div class="card">
        <h2>${t('yourReviewLabel')}</h2>
        <span class="rating">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span>
        ${review.comment ? `<p class="small" style="margin-top:6px;">${escapeHtml(review.comment)}</p>` : ''}
        <textarea id="coachResponse" rows="2" placeholder="${t('coachResponsePlaceholder')}" style="margin-top:10px;">${escapeHtml(review.coach_response)}</textarea>
        <button id="submitResponse">${t('submitResponseBtn')}</button>
      </div>
    `;
  }

  return `
    <div class="card">
      <h2>${review ? t('yourReviewLabel') : t('leaveReviewTitle')}</h2>
      ${!review ? `<p class="small" style="margin-bottom:8px;">${t('leaveReviewHint')}</p>` : ''}
      <select id="reviewRating">
        ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${review && review.rating === n ? 'selected' : ''}>${'★'.repeat(n)}${'☆'.repeat(5 - n)}</option>`).join('')}
      </select>
      <textarea id="reviewComment" rows="2" placeholder="${t('reviewCommentPlaceholder')}">${review ? escapeHtml(review.comment) : ''}</textarea>
      <button id="submitReview">${review ? t('editReviewBtn') : t('submitReviewBtn')}</button>
    </div>
  `;
}

function wireReviewCard(subscriptionId, isCoach) {
  on('submitReview', 'click', async () => {
    try {
      await api('/reviews/' + subscriptionId, { method: 'POST', body: JSON.stringify({
        rating: Number(document.getElementById('reviewRating').value),
        comment: document.getElementById('reviewComment').value,
      })});
      alert(t('reviewSavedAlert'));
      renderSessionsTab(subscriptionId);
    } catch (e) { alert(e.message); }
  });
  on('submitResponse', 'click', async () => {
    try {
      await api('/reviews/' + subscriptionId + '/response', { method: 'POST', body: JSON.stringify({
        response: document.getElementById('coachResponse').value,
      })});
      renderSessionsTab(subscriptionId);
    } catch (e) { alert(e.message); }
  });
}

async function renderSessionsTab(subscriptionId) {
  const isCoach = state.user.role === 'coach';
  const { sessions } = await api('/sessions/' + subscriptionId);
  const now = Date.now();
  const isFutureScheduled = (s) => s.status === 'scheduled' && new Date(s.scheduled_at).getTime() > now;
  const upcoming = sessions.filter(isFutureScheduled);
  const past = sessions.filter((s) => !isFutureScheduled(s));
  const statusLabel = { scheduled: t('statusScheduled'), completed: t('statusCompleted'), cancelled: t('statusCancelled') };

  function fmt(dt) {
    return new Date(dt).toLocaleString(getLang() === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  }

  const hasCompletedSession = sessions.some((s) => s.status === 'completed');
  const reviewCardHtml = await renderReviewCard(subscriptionId, isCoach, hasCompletedSession);

  render(`
    ${renderHubTabs(subscriptionId, 'sessions')}
    ${!isCoach ? `
    <div class="card">
      <h2>${t('bookSessionBtn')}</h2>
      <div class="error hidden" id="sessionErr"></div>
      <input id="sessionDate" type="datetime-local">
      <input id="sessionNotes" placeholder="${t('sessionNotesPlaceholder')}">
      <button id="bookBtn">${t('bookSessionBtn')}</button>
    </div>` : ''}
    <div class="card">
      <h2>${t('upcomingSessionsTitle')}</h2>
      ${upcoming.length === 0 ? `<p class="small">${t('noSessionsYet')}</p>` : upcoming.map((s) => `
        <div class="coach-row">
          <div>${fmt(s.scheduled_at)}${s.notes ? `<div class="small">${escapeHtml(s.notes)}</div>` : ''}</div>
          <div style="display:flex; gap:6px;">
            ${isCoach ? `<button class="secondary" data-complete="${s.id}" style="width:auto; padding:6px 10px;">${t('markCompletedBtn')}</button>` : ''}
            <button class="secondary" data-cancel="${s.id}" style="width:auto; padding:6px 10px;">${t('cancelSessionBtn')}</button>
          </div>
        </div>
      `).join('')}
    </div>
    ${past.length ? `
    <div class="card">
      <h2>${t('pastSessionsTitle')}</h2>
      ${past.map((s) => `
        <div class="coach-row"><div>${fmt(s.scheduled_at)}</div><div class="small pill">${statusLabel[s.status]}</div></div>
      `).join('')}
    </div>` : ''}
    ${reviewCardHtml}
  `);
  wireHubNav(subscriptionId, 'sessions');
  wireReviewCard(subscriptionId, isCoach);

  on('bookBtn', 'click', async () => {
    const val = document.getElementById('sessionDate').value;
    if (!val) return;
    try {
      await api('/sessions/' + subscriptionId, { method: 'POST', body: JSON.stringify({
        scheduled_at: new Date(val).toISOString(),
        notes: document.getElementById('sessionNotes').value,
      })});
      renderSessionsTab(subscriptionId);
    } catch (e) {
      const el = document.getElementById('sessionErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  });
  document.querySelectorAll('[data-complete]').forEach((el) => {
    el.onclick = async () => {
      await api('/sessions/' + subscriptionId + '/' + el.dataset.complete + '/status', { method: 'POST', body: JSON.stringify({ status: 'completed' }) });
      renderSessionsTab(subscriptionId);
    };
  });
  document.querySelectorAll('[data-cancel]').forEach((el) => {
    el.onclick = async () => {
      await api('/sessions/' + subscriptionId + '/' + el.dataset.cancel + '/status', { method: 'POST', body: JSON.stringify({ status: 'cancelled' }) });
      renderSessionsTab(subscriptionId);
    };
  });
}

// -------------------- لوحة أداء الكوتش --------------------

async function renderCoachStats() {
  const stats = await api('/coach-stats');
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card">
      <h2>${t('coachStatsTitle')}</h2>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">${stats.activeTrainees}</div><div class="small">${t('activeTraineesLabel')}</div></div>
        <div class="stat-card"><div class="stat-value">${stats.adherenceRate != null ? stats.adherenceRate + '%' : '-'}</div><div class="small">${t('adherenceRateLabel')}</div></div>
        <div class="stat-card"><div class="stat-value">${stats.revenue} ${t('currency')}</div><div class="small">${t('revenueLabel')}</div></div>
        <div class="stat-card"><div class="stat-value">${stats.upcomingSessions}</div><div class="small">${t('upcomingSessionsLabel')}</div></div>
      </div>
      ${stats.adherenceRate == null ? `<p class="small" style="margin-top:10px;">${t('notEnoughDataForAdherence')}</p>` : ''}
    </div>
  `);
  document.getElementById('back').onclick = renderCoachDashboard;
}
