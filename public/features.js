// شاشات الميزات الإضافية (خطط، تقدم، عادات، جلسات، إنجازات، لوحة أداء
// الكوتش، الشات بوت للدعم، السوق، التقييمات، متدربيني، الأرباح). بتستخدم
// نفس المساعدات العامة من app.js (render, on, api, state, escapeHtml, t,
// getLang) وبتتحمّل قبله في index.html.

// -------------------- مساعدات نظام التصميم (stat cards / menu rows / progress ring) --------------------

function statCardV2(num, icon, label) {
  return `
    <div class="stat-card-v2">
      <div class="stat-top">
        <div class="stat-num">${num}</div>
        <div class="stat-icon">${icon}</div>
      </div>
      <div class="stat-label-v2">${label}</div>
    </div>
  `;
}

function menuRow({ icon, label, value, id, danger }) {
  return `
    <div class="menu-row${danger ? ' danger-row' : ''}" ${id ? `id="${id}"` : ''}>
      <div class="menu-icon">${icon}</div>
      <div class="menu-label">${label}</div>
      ${value ? `<div class="menu-value">${escapeHtml(value)}</div>` : ''}
      <div class="menu-chevron">${getLang() === 'ar' ? '‹' : '›'}</div>
    </div>
  `;
}

// حلقة تقدّم SVG دائرية - مفيش مكتبة تانية، مجرد دايرتين (مسار خلفي +
// قوس ملوّن بطول نسبي عن طريق stroke-dasharray).
function renderProgressRing(percent, size = 150, label = '') {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c - (clamped / 100) * c;
  return `
    <div class="progress-ring-wrap">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg);">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${stroke}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--red)" stroke-width="${stroke}"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
        <text x="${size / 2}" y="${size / 2}" class="progress-ring-value" text-anchor="middle" dominant-baseline="middle"
          transform="rotate(90 ${size / 2} ${size / 2})">${Math.round(clamped)}%</text>
      </svg>
      ${label ? `<div class="small" style="margin-top:8px;">${label}</div>` : ''}
    </div>
  `;
}

function renderEmptyState(icon, title, hint) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-title">${escapeHtml(title)}</div><div class="empty-hint">${escapeHtml(hint)}</div></div>`;
}

// -------------------- الناف بار السفلي --------------------

function renderBottomNav(active) {
  const navEl = document.getElementById('bottomNav');
  if (!navEl) return;
  if (!state.user) { navEl.classList.add('hidden'); navEl.innerHTML = ''; return; }

  const items = state.user.role === 'coach' ? [
    ['dashboard', 'navDashboardTab', 'home-outline', 'home-filled', renderCoachDashboard],
    ['clients', 'navClientsTab', 'client', 'client', renderMyClients],
    ['csessions', 'navCoachSessionsTab', 'calendar', 'calendar', renderMyBookings],
    ['messages', 'navMessagesTab', 'message', 'message', renderMyMessages],
    ['more', 'navMoreTab', 'more', 'more', renderMore],
  ] : [
    ['home', 'navHomeTab', 'home-outline', 'home-filled', renderTraineeHome],
    ['discover', 'navDiscoverTab', 'search', 'search', renderDiscover],
    ['bookings', 'navBookingsTab', 'calendar', 'calendar', renderMyBookings],
    ['messages', 'navMessagesTab', 'message', 'message', renderMyMessages],
    ['profile', 'navProfileTab', 'profile', 'profile', renderProfile],
  ];

  navEl.classList.remove('hidden');
  navEl.innerHTML = items.map(([key, labelKey, iconName, activeIconName]) => {
    const isActive = active === key;
    return `<button class="nav-item ${isActive ? 'active' : ''}" data-nav="${key}"><span class="nav-icon">${svgIcon(isActive ? activeIconName : iconName, 22)}</span><span>${escapeHtml(t(labelKey))}</span></button>`;
  }).join('');
  items.forEach(([key, , , , fn]) => {
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

function msgTimeLabel(dt) {
  const d = new Date(dt + 'Z');
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(getLang() === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
}

async function renderMyMessages() {
  renderBottomNav('messages');
  const { subscriptions } = await api('/subscriptions/mine');
  const activeSubs = subscriptions.filter((s) => s.status === 'active');

  render(`
    <div class="search-bar">
      <span class="search-icon">${svgIcon('search', 16)}</span>
      <input id="messagesSearch" placeholder="${t('searchConversationsPlaceholder')}">
    </div>
    <div id="conversationsList"></div>
  `);

  function renderConvos(filterQ) {
    const q = (filterQ || '').trim().toLowerCase();
    const list = q ? activeSubs.filter((s) => s.other_party_name.toLowerCase().includes(q)) : activeSubs;
    document.getElementById('conversationsList').innerHTML = list.length === 0
      ? renderEmptyState('💬', t('emptyMessagesTitle'), t('emptyMessagesHint'))
      : `<div class="card">${list.map((s) => `
          <div class="coach-row" data-open-chat="${s.id}" style="gap:10px;">
            ${avatarCircle(s.other_party_name, s.other_party_avatar, 44)}
            <div style="flex:1; min-width:0;">
              <div style="display:flex; justify-content:space-between; gap:8px;">
                <span style="font-weight:800; font-size:13px;">${escapeHtml(s.other_party_name)}</span>
                ${s.last_message_at ? `<span class="small" style="white-space:nowrap;">${msgTimeLabel(s.last_message_at)}</span>` : ''}
              </div>
              <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
                <span class="small" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.last_message ? escapeHtml(s.last_message) : t('packageLabel', { pkg: s.package })}</span>
                ${s.unread_count ? `<span class="badge-dot" style="position:static; flex-shrink:0;">${s.unread_count}</span>` : ''}
              </div>
            </div>
          </div>
        `).join('')}</div>`;
    document.querySelectorAll('[data-open-chat]').forEach((el) => {
      el.onclick = () => renderChat(el.dataset.openChat);
    });
  }

  document.getElementById('messagesSearch').oninput = (e) => renderConvos(e.target.value);
  renderConvos('');
}

// -------------------- حسابي (متدرب) / المزيد (كوتش) --------------------

function avatarUploadWidget() {
  return `
    <div class="avatar-upload-wrap">
      ${avatarCircle(state.user.name, state.user.avatarPath, 88)}
      <label class="avatar-edit-badge" for="avatarFileInput">📷</label>
      <input type="file" id="avatarFileInput" accept="image/png,image/jpeg,image/webp" style="display:none;">
    </div>
  `;
}

function renderAvatarBioCard() {
  return `
    <div class="card" style="text-align:center;">
      ${avatarUploadWidget()}
      ${state.user.avatarPath ? `<button class="secondary" id="removeAvatar" style="width:auto; padding:6px 14px; font-size:11px; margin-bottom:14px;">${t('removePhotoLabel')}</button>` : ''}
      <div style="text-align:start;">
        <div class="error hidden" id="bioErr"></div>
        <textarea id="bioInput" rows="3" maxlength="300" placeholder="${t('bioPlaceholder2')}">${escapeHtml(state.user.bio)}</textarea>
        <button class="secondary" id="saveBio">${t('saveBioBtn')}</button>
      </div>
    </div>
  `;
}

function wireAvatarBioCard(afterChange) {
  wireAvatarUpload(afterChange);
  on('removeAvatar', 'click', async () => {
    await api('/media/avatar', { method: 'DELETE' });
    afterChange();
  });
  on('saveBio', 'click', async () => {
    try {
      await api('/media/bio', { method: 'PUT', body: JSON.stringify({ bio: document.getElementById('bioInput').value }) });
      alert(t('bioSavedAlert'));
    } catch (e) {
      const el = document.getElementById('bioErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  });
}

function renderGalleryCard() {
  return `
    <div class="card">
      <h2>${t('galleryTitle')}</h2>
      <div id="galleryBox"><div class="skeleton block"></div></div>
    </div>
  `;
}

async function refreshCurrentUser() {
  const { user } = await api('/auth/me');
  state.user = user;
}

function profileHeader(roleLabel) {
  return `
    <div class="card" style="text-align:center;">
      ${avatarCircle(state.user.name, state.user.avatarPath, 84)}
      <h2 style="margin-top:10px; margin-bottom:2px;">${escapeHtml(state.user.name)}</h2>
      <p class="small">${roleLabel}</p>
      <a class="link" href="#" id="editProfileLink">${t('editProfileMenuItem')}</a>
    </div>
  `;
}

async function renderProfile() {
  renderBottomNav('profile');
  render(`
    ${profileHeader(t('roleTraineeLabel'))}
    <div class="card menu-card">
      ${menuRow({ icon: svgIcon('calendar', 18), label: t('myBookingsTitle'), id: 'menuBookings' })}
      ${menuRow({ icon: svgIcon('bookmark', 18), label: t('savedPostsMenuItem'), id: 'menuSavedPosts' })}
      ${menuRow({ icon: svgIcon('message', 18), label: t('supportMenuItem'), id: 'menuSupport' })}
      ${menuRow({ icon: svgIcon('close', 18), label: t('blockedUsersMenuItem'), id: 'menuBlockedUsers' })}
      ${menuRow({ icon: svgIcon('document', 18), label: t('privacyPolicyMenuItem'), id: 'menuPrivacyPolicy' })}
      ${menuRow({ icon: svgIcon('close', 18), label: t('deleteAccountMenuItem'), id: 'menuDeleteAccount', danger: true })}
      ${menuRow({ icon: svgIcon('settings', 18), label: t('languageMenuItem'), value: getLang() === 'ar' ? 'العربية' : 'English', id: 'menuLanguage' })}
      ${menuRow({ icon: svgIcon('close', 18), label: t('logoutBtn'), id: 'menuLogout', danger: true })}
    </div>
    <div class="card">
      <h2>${t('accountSection')}</h2>
      <div class="coach-row"><div>${t('emailLabel')}</div><div class="small">${escapeHtml(state.user.email || '')}</div></div>
    </div>
    ${renderAvatarBioCard()}
    ${renderGalleryCard()}
  `);
  wireAvatarBioCard(async () => { await refreshCurrentUser(); renderProfile(); });
  loadAndRenderGallery('galleryBox', state.user.id, true);
  on('editProfileLink', 'click', (e) => { e.preventDefault(); document.getElementById('bioInput')?.scrollIntoView({ behavior: 'smooth' }); });
  on('menuBookings', 'click', renderMyBookings);
  on('menuSavedPosts', 'click', renderSavedPosts);
  on('menuSupport', 'click', renderSupportHome);
  on('menuBlockedUsers', 'click', renderBlockedUsers);
  on('menuPrivacyPolicy', 'click', () => window.open('/privacy-policy', '_blank'));
  on('menuDeleteAccount', 'click', () => window.open('/delete-account', '_blank'));
  on('menuLanguage', 'click', () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); renderProfile(); });
  on('menuLogout', 'click', async () => { await api('/auth/logout', { method: 'POST' }); boot(); });
}

async function renderMore() {
  renderBottomNav('more');
  render(`
    ${profileHeader(t('roleCoachLabel'))}
    <div class="card menu-card">
      ${menuRow({ icon: svgIcon('money', 18), label: t('earningsMenuItem'), id: 'menuEarnings' })}
      ${menuRow({ icon: svgIcon('calendar', 18), label: t('availabilityMenuItem'), id: 'menuAvailability' })}
      ${menuRow({ icon: svgIcon('client', 18), label: t('trainerNetworkMenuItem'), id: 'menuTrainerNetwork' })}
      ${menuRow({ icon: svgIcon('document', 18), label: t('contentMenuItem'), id: 'menuMyPosts' })}
      ${menuRow({ icon: svgIcon('bookmark', 18), label: t('savedPostsMenuItem'), id: 'menuSavedPosts' })}
      ${menuRow({ icon: svgIcon('image', 18), label: t('transformationsTitle'), id: 'menuTransformations' })}
      ${menuRow({ icon: svgIcon('chart', 18), label: t('viewStatsBtn'), id: 'menuStats' })}
      ${menuRow({ icon: svgIcon('upload', 18), label: t('trainerDocumentsMenuItem'), id: 'menuTrainerDocuments' })}
      ${menuRow({ icon: svgIcon('message', 18), label: t('supportMenuItem'), id: 'menuSupport' })}
      ${menuRow({ icon: svgIcon('close', 18), label: t('blockedUsersMenuItem'), id: 'menuBlockedUsers' })}
      ${menuRow({ icon: svgIcon('document', 18), label: t('privacyPolicyMenuItem'), id: 'menuPrivacyPolicy' })}
      ${menuRow({ icon: svgIcon('close', 18), label: t('deleteAccountMenuItem'), id: 'menuDeleteAccount', danger: true })}
      ${menuRow({ icon: svgIcon('settings', 18), label: t('languageMenuItem'), value: getLang() === 'ar' ? 'العربية' : 'English', id: 'menuLanguage' })}
      ${menuRow({ icon: svgIcon('close', 18), label: t('logoutBtn'), id: 'menuLogout', danger: true })}
    </div>
    <div class="card">
      <h2>${t('accountSection')}</h2>
      <div class="coach-row"><div>${t('emailLabel')}</div><div class="small">${escapeHtml(state.user.email || '')}</div></div>
    </div>
    ${renderAvatarBioCard()}
    ${renderGalleryCard()}
  `);
  wireAvatarBioCard(async () => { await refreshCurrentUser(); renderMore(); });
  loadAndRenderGallery('galleryBox', state.user.id, true);
  on('editProfileLink', 'click', (e) => { e.preventDefault(); renderCoachProfileEdit(); });
  on('menuEarnings', 'click', renderEarnings);
  on('menuAvailability', 'click', renderCoachAvailability);
  on('menuTrainerNetwork', 'click', renderTrainerNetwork);
  on('menuMyPosts', 'click', renderMyPosts);
  on('menuSavedPosts', 'click', renderSavedPosts);
  on('menuTransformations', 'click', renderCoachTransformations);
  on('menuStats', 'click', renderCoachStats);
  on('menuTrainerDocuments', 'click', renderTrainerDocuments);
  on('menuSupport', 'click', renderSupportHome);
  on('menuBlockedUsers', 'click', renderBlockedUsers);
  on('menuPrivacyPolicy', 'click', () => window.open('/privacy-policy', '_blank'));
  on('menuDeleteAccount', 'click', () => window.open('/delete-account', '_blank'));
  on('menuLanguage', 'click', () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); renderMore(); });
  on('menuLogout', 'click', async () => { await api('/auth/logout', { method: 'POST' }); boot(); });
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

// -------------------- الجاليري وصورة البروفايل --------------------

function renderGalleryGrid(photos, isOwner) {
  const tiles = photos.map((p) => `
    <div class="gallery-thumb" data-open-photo="${p.id}">
      <img src="/uploads/${encodeURIComponent(p.photo_path)}" alt="" loading="lazy">
      ${isOwner && p.visibility === 'private' ? `<span class="private-flag">${t('visibilityPrivate')}</span>` : ''}
    </div>
  `).join('');
  const addTile = isOwner ? `<div class="gallery-add-tile" id="addPhotoTile">+</div>` : '';
  if (!photos.length && !isOwner) return `<p class="small">${t('noPhotosYet')}</p>`;
  return `<div class="gallery-grid">${addTile}${tiles}</div>`;
}

function closeModal() {
  const el = document.getElementById('modalRoot');
  if (el) el.remove();
}

function openPhotoModal(photo, isOwner, onChange) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-box">
      <img src="/uploads/${encodeURIComponent(photo.photo_path)}" alt="">
      ${isOwner ? `
        <div class="error hidden" id="photoModalErr"></div>
        <textarea id="photoCaption" rows="2" placeholder="${t('captionPlaceholder')}">${escapeHtml(photo.caption)}</textarea>
        <button class="secondary" id="saveCaption" style="margin-bottom:10px;">${t('saveCaptionBtn')}</button>
        <label class="small" style="display:block; margin-bottom:6px;">${t('photoVisibilityLabel')}</label>
        <select id="photoVisibility" style="margin-bottom:10px;">
          <option value="public" ${photo.visibility === 'public' ? 'selected' : ''}>${t('visibilityPublic')}</option>
          <option value="private" ${photo.visibility === 'private' ? 'selected' : ''}>${t('visibilityPrivate')}</option>
        </select>
        <button class="danger" id="deletePhoto" style="margin-bottom:10px;">${t('deletePhotoConfirm')}</button>
      ` : (photo.caption ? `<p style="font-size:13px; line-height:1.8;">${escapeHtml(photo.caption)}</p>` : '')}
      <button class="secondary" id="closeModal">${t('closeBtn2')}</button>
    </div>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });
  document.getElementById('closeModal').onclick = closeModal;

  if (isOwner) {
    document.getElementById('saveCaption').onclick = async () => {
      try {
        await api('/media/gallery/' + photo.id, { method: 'PATCH', body: JSON.stringify({ caption: document.getElementById('photoCaption').value }) });
        closeModal();
        onChange();
      } catch (e) {
        const el = document.getElementById('photoModalErr');
        el.textContent = e.message; el.classList.remove('hidden');
      }
    };
    document.getElementById('photoVisibility').onchange = async (e) => {
      await api('/media/gallery/' + photo.id, { method: 'PATCH', body: JSON.stringify({ visibility: e.target.value }) });
      onChange();
    };
    document.getElementById('deletePhoto').onclick = async () => {
      if (!confirm(t('deletePhotoConfirm'))) return;
      await api('/media/gallery/' + photo.id, { method: 'DELETE' });
      closeModal();
      onChange();
    };
  }
}

async function loadAndRenderGallery(containerId, userId, isOwner) {
  const { photos } = await api('/media/gallery/' + userId);
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = renderGalleryGrid(photos, isOwner);
  if (isOwner) {
    const addTile = document.getElementById('addPhotoTile');
    if (addTile) addTile.onclick = () => openAddPhotoModal(() => loadAndRenderGallery(containerId, userId, isOwner));
  }
  box.querySelectorAll('[data-open-photo]').forEach((el) => {
    el.onclick = () => {
      const photo = photos.find((p) => p.id === Number(el.dataset.openPhoto));
      if (photo) openPhotoModal(photo, isOwner, () => loadAndRenderGallery(containerId, userId, isOwner));
    };
  });
  return photos.length;
}

function openAddPhotoModal(onDone) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-box">
      <h2>${t('addPhotoBtn')}</h2>
      <div class="error hidden" id="addPhotoErr"></div>
      <input id="newPhotoFile" type="file" accept="image/png,image/jpeg,image/webp" style="margin-bottom:10px;">
      <textarea id="newPhotoCaption" rows="2" placeholder="${t('captionPlaceholder')}"></textarea>
      <select id="newPhotoVisibility" style="margin-bottom:10px;">
        <option value="public">${t('visibilityPublic')}</option>
        <option value="private">${t('visibilityPrivate')}</option>
      </select>
      <button id="uploadPhoto">${t('uploadBtn')}</button>
      <button class="secondary" id="closeModal" style="margin-top:8px;">${t('closeBtn2')}</button>
    </div>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });
  document.getElementById('closeModal').onclick = closeModal;
  document.getElementById('uploadPhoto').onclick = async () => {
    const file = document.getElementById('newPhotoFile').files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('caption', document.getElementById('newPhotoCaption').value);
    fd.append('visibility', document.getElementById('newPhotoVisibility').value);
    try {
      await apiUpload('/media/gallery', fd);
      closeModal();
      onDone();
    } catch (e) {
      const el = document.getElementById('addPhotoErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  };
}

function wireAvatarUpload(afterUpload) {
  on('avatarFileInput', 'change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      await apiUpload('/media/avatar', fd);
      alert(t('avatarSavedAlert'));
      afterUpload();
    } catch (err) { alert(err.message); }
  });
}

// -------------------- الحظر والإبلاغ --------------------

async function fetchModerationStatus(targetUserId) {
  try {
    return await api('/moderation/status/' + targetUserId);
  } catch (e) {
    return { blockedByMe: false, blockedMe: false };
  }
}

function moderationMenuHtml() {
  return `
    <div class="mod-menu-wrap">
      <button class="secondary" id="modMenuBtn" type="button" style="width:auto; padding:6px 12px;">⋮</button>
      <div id="modMenuDropdown" class="mod-menu-dropdown hidden">
        <div class="mod-menu-item" id="modBlockItem"><span id="modBlockLabel"></span></div>
        <div class="mod-menu-item danger-row" id="modReportItem">${t('reportUserMenuItem')}</div>
      </div>
    </div>
  `;
}

// targetUserId: صاحب الحساب المطلوب حظره/الإبلاغ عنه. status: نتيجة
// fetchModerationStatus مسبقًا. onBlockChange: بيتنادى بعد نجاح حظر/فك حظر
// عشان الشاشة اللي نادت الدالة تعيد رسم نفسها بالحالة الجديدة.
function wireModerationMenu(targetUserId, status, subscriptionId, onBlockChange) {
  const btn = document.getElementById('modMenuBtn');
  const dropdown = document.getElementById('modMenuDropdown');
  if (!btn || !dropdown) return;

  const labelEl = document.getElementById('modBlockLabel');
  if (labelEl) labelEl.textContent = status.blockedByMe ? t('unblockMenuItem') : t('blockMenuItem');

  btn.onclick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  };
  document.addEventListener('click', () => dropdown.classList.add('hidden'));

  on('modBlockItem', 'click', async () => {
    dropdown.classList.add('hidden');
    if (status.blockedByMe) {
      if (!confirm(t('confirmUnblock'))) return;
      await api('/moderation/block/' + targetUserId, { method: 'DELETE' });
    } else {
      if (!confirm(t('confirmBlock'))) return;
      await api('/moderation/block/' + targetUserId, { method: 'POST' });
    }
    if (onBlockChange) onBlockChange();
  });

  on('modReportItem', 'click', () => {
    dropdown.classList.add('hidden');
    openReportModal(targetUserId, subscriptionId);
  });
}

function openReportModal(targetUserId, subscriptionId) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-box">
      <h2>${t('reportUserTitle')}</h2>
      <div class="error hidden" id="reportErr"></div>
      <select id="reportReason">
        <option value="harassment">${t('reportReasonHarassment')}</option>
        <option value="fraud">${t('reportReasonFraud')}</option>
        <option value="inappropriate">${t('reportReasonInappropriate')}</option>
        <option value="impersonation">${t('reportReasonImpersonation')}</option>
        <option value="other">${t('reportReasonOther')}</option>
      </select>
      <textarea id="reportDetails" rows="3" placeholder="${t('reportDetailsPlaceholder')}"></textarea>
      <button id="submitReport">${t('submitReportBtn')}</button>
      <button class="secondary" id="closeModal" style="margin-top:8px;">${t('closeBtn2')}</button>
    </div>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });
  document.getElementById('closeModal').onclick = closeModal;
  document.getElementById('submitReport').onclick = async () => {
    try {
      await api('/moderation/report/' + targetUserId, { method: 'POST', body: JSON.stringify({
        reason: document.getElementById('reportReason').value,
        details: document.getElementById('reportDetails').value,
        subscriptionId: subscriptionId || null,
      }) });
      closeModal();
      alert(t('reportSubmittedAlert'));
    } catch (e) {
      const el = document.getElementById('reportErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  };
}

async function renderBlockedUsers() {
  const backTarget = state.user.role === 'coach' ? renderMore : renderProfile;
  render(`
    <button class="secondary" id="back" style="margin-bottom:14px;">${t('back')}</button>
    <div class="card">
      <h2>${t('blockedUsersTitle')}</h2>
      <div id="blockedList"><div class="skeleton block"></div></div>
    </div>
  `);
  on('back', 'click', backTarget);
  const { blocked } = await api('/moderation/blocked');
  document.getElementById('blockedList').innerHTML = blocked.length === 0
    ? `<p class="small">${t('noBlockedUsers')}</p>`
    : blocked.map((u) => `
      <div class="coach-row">
        <div style="display:flex; align-items:center; gap:8px;">
          ${avatarCircle(u.name, u.avatar_path, 36)}
          <b style="font-size:12.5px;">${escapeHtml(u.name)}</b>
        </div>
        <button class="secondary" data-unblock="${u.id}" style="width:auto; padding:6px 12px;">${t('unblockMenuItem')}</button>
      </div>
    `).join('');
  document.querySelectorAll('[data-unblock]').forEach((el) => {
    el.onclick = async () => {
      await api('/moderation/block/' + el.dataset.unblock, { method: 'DELETE' });
      renderBlockedUsers();
    };
  });
}

// -------------------- التحولات (قبل/بعد) --------------------

function transformPermissionBadge(tr) {
  if (tr.visibility !== 'public') return '';
  const labelKey = { not_requested: 'permissionNotRequestedLabel', pending: 'permissionPendingLabel', granted: 'permissionGrantedLabel', declined: 'permissionDeclinedLabel' }[tr.permission_status];
  return labelKey ? `<div class="tmeta-small">${t(labelKey)}</div>` : '';
}

function renderTransformCard(tr, showTraineeName) {
  return `
    <div class="transform-card" data-open-transform="${tr.id}">
      <div class="transform-pair">
        <img src="/uploads/${encodeURIComponent(tr.before_photo_path)}" alt="">
        <img src="/uploads/${encodeURIComponent(tr.after_photo_path)}" alt="">
      </div>
      <div class="transform-meta">
        ${showTraineeName ? `<div class="tname">${escapeHtml(tr.trainee_name)}</div>` : ''}
        ${tr.duration_label ? `<div class="tmeta-small">${escapeHtml(tr.duration_label)}</div>` : ''}
        ${tr.visibility === 'private' ? `<div class="tmeta-small">${t('visibilityPrivate')}</div>` : ''}
        ${tr.visibility === 'client_only' ? `<div class="tmeta-small">${t('visibilityClientOnly')}</div>` : ''}
        ${transformPermissionBadge(tr)}
      </div>
    </div>
  `;
}

// isOwnerView: true لما المودال بيتفتح من hub الاشتراك (الكوتش أو المتدرب
// نفسه)، false للبروفايل العام المفتوح لأي حد - عشان زرار الموافقة/الرفض
// يظهر بس للمتدرب صاحب التحول، مش لأي زائر عام.
function openTransformModal(tr, isCoach, onChange, isOwnerView) {
  closeModal();
  const isTrainee = isOwnerView && !isCoach;
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-box">
      <div class="transform-pair" style="border-radius:10px; overflow:hidden; margin-bottom:12px;">
        <img src="/uploads/${encodeURIComponent(tr.before_photo_path)}" alt="">
        <img src="/uploads/${encodeURIComponent(tr.after_photo_path)}" alt="">
      </div>
      ${tr.duration_label ? `<p class="small"><b>${t('durationLabel')}:</b> ${escapeHtml(tr.duration_label)}</p>` : ''}
      ${tr.goal ? `<p class="small"><b>${t('transformGoalLabel')}:</b> ${escapeHtml(tr.goal)}</p>` : ''}
      ${tr.weight_change != null ? `<p class="small"><b>${t('weightChangeLabel')}:</b> ${tr.weight_change > 0 ? '+' : ''}${tr.weight_change} ${t('kgUnit')}</p>` : ''}
      ${tr.body_fat_change != null ? `<p class="small"><b>${t('bodyFatChangeLabel')}:</b> ${tr.body_fat_change > 0 ? '+' : ''}${tr.body_fat_change}%</p>` : ''}
      ${tr.notes ? `<p class="small">${escapeHtml(tr.notes)}</p>` : ''}
      ${tr.testimonial ? `<p class="small" style="margin-top:8px; font-style:italic;">"${escapeHtml(tr.testimonial)}"</p>` : ''}
      ${isCoach || isTrainee ? `<div style="margin-top:8px;">${transformPermissionBadge(tr)}</div>` : ''}
      ${isCoach ? `
        <label class="small" style="display:block; margin:10px 0 6px;">${t('photoVisibilityLabel')}</label>
        <select id="transformVisibility" style="margin-bottom:10px;">
          <option value="private" ${tr.visibility === 'private' ? 'selected' : ''}>${t('visibilityPrivate')}</option>
          <option value="client_only" ${tr.visibility === 'client_only' ? 'selected' : ''}>${t('visibilityClientOnly')}</option>
          <option value="public" ${tr.visibility === 'public' ? 'selected' : ''}>${t('visibilityPublic')}</option>
        </select>
        <button class="danger" id="deleteTransform" style="margin-bottom:10px;">${t('deletePhotoConfirm')}</button>
      ` : ''}
      ${isTrainee && tr.visibility === 'public' && tr.permission_status === 'pending' ? `
        <div class="card" style="background:var(--surface-2); margin:10px 0;">
          <p class="small">${t('permissionRequestTitle')}</p>
          <div style="display:flex; gap:8px; margin-top:6px;">
            <button id="grantPermission">${t('grantPermissionBtn')}</button>
            <button class="secondary" id="declinePermission">${t('declinePermissionBtn')}</button>
          </div>
        </div>
      ` : ''}
      ${isTrainee && tr.visibility === 'public' && tr.permission_status === 'granted' ? `
        <button class="secondary" id="revokePermission" style="margin:10px 0;">${t('revokePermissionBtn')}</button>
      ` : ''}
      <button class="secondary" id="closeModal">${t('closeBtn2')}</button>
    </div>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });
  document.getElementById('closeModal').onclick = closeModal;
  if (isCoach) {
    document.getElementById('transformVisibility').onchange = async (e) => {
      await api('/transformations/' + tr.subscription_id + '/' + tr.id, { method: 'PATCH', body: JSON.stringify({ visibility: e.target.value }) });
      closeModal();
      onChange();
    };
    document.getElementById('deleteTransform').onclick = async () => {
      if (!confirm(t('deletePhotoConfirm'))) return;
      await api('/transformations/' + tr.subscription_id + '/' + tr.id, { method: 'DELETE' });
      closeModal();
      onChange();
    };
  }
  if (isTrainee) {
    const respond = async (decision) => {
      await api('/transformations/' + tr.subscription_id + '/' + tr.id + '/permission', { method: 'POST', body: JSON.stringify({ decision }) });
      closeModal();
      onChange();
    };
    on('grantPermission', 'click', () => respond('granted'));
    on('declinePermission', 'click', () => respond('declined'));
    on('revokePermission', 'click', () => respond('declined'));
  }
}

async function loadAndRenderTransformations(containerId, subscriptionId, isCoach) {
  const { transformations } = await api('/transformations/' + subscriptionId);
  const box = document.getElementById(containerId);
  if (!box) return;
  const addTile = isCoach ? `<div class="gallery-add-tile" id="addTransformTile" style="aspect-ratio:auto; padding:20px 0;">+</div>` : '';
  box.innerHTML = transformations.length === 0 && !isCoach
    ? `<p class="small">${t('noTransformationsYet')}</p>`
    : `<div class="transform-grid">${addTile}${transformations.map((tr) => renderTransformCard(tr, false)).join('')}</div>`;
  if (isCoach) {
    document.getElementById('addTransformTile').onclick = () => openAddTransformModal(subscriptionId, () => loadAndRenderTransformations(containerId, subscriptionId, isCoach));
  }
  box.querySelectorAll('[data-open-transform]').forEach((el) => {
    el.onclick = () => {
      const tr = transformations.find((x) => x.id === Number(el.dataset.openTransform));
      if (tr) openTransformModal(tr, isCoach, () => loadAndRenderTransformations(containerId, subscriptionId, isCoach), true);
    };
  });
}

function openAddTransformModal(subscriptionId, onDone) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-box">
      <h2>${t('addTransformBtn')}</h2>
      <div class="error hidden" id="addTransformErr"></div>
      <label class="small" style="display:block; margin-bottom:6px;">${t('beforePhotoLabel')}</label>
      <input id="beforeFile" type="file" accept="image/png,image/jpeg,image/webp" style="margin-bottom:10px;">
      <label class="small" style="display:block; margin-bottom:6px;">${t('afterPhotoLabel')}</label>
      <input id="afterFile" type="file" accept="image/png,image/jpeg,image/webp" style="margin-bottom:10px;">
      <input id="durationLabelInput" placeholder="${t('durationPlaceholder')}">
      <input id="goalInput" placeholder="${t('transformGoalLabel')}">
      <input id="weightChangeInput" type="number" step="0.1" placeholder="${t('transformWeightChangePlaceholder')}">
      <input id="bodyFatChangeInput" type="number" step="0.1" placeholder="${t('transformBodyFatChangePlaceholder')}">
      <textarea id="notesInput" rows="2" placeholder="${t('progressNotePlaceholder')}"></textarea>
      <textarea id="testimonialInput" rows="2" placeholder="${t('testimonialPlaceholder')}"></textarea>
      <label class="small" style="display:block; margin-bottom:6px;">${t('photoVisibilityLabel')}</label>
      <select id="transformVisibilityNew" style="margin-bottom:10px;">
        <option value="private">${t('visibilityPrivate')}</option>
        <option value="client_only" selected>${t('visibilityClientOnly')}</option>
        <option value="public">${t('visibilityPublic')}</option>
      </select>
      <button id="uploadTransform">${t('uploadBtn')}</button>
      <button class="secondary" id="closeModal" style="margin-top:8px;">${t('closeBtn2')}</button>
    </div>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });
  document.getElementById('closeModal').onclick = closeModal;
  document.getElementById('uploadTransform').onclick = async () => {
    const before = document.getElementById('beforeFile').files[0];
    const after = document.getElementById('afterFile').files[0];
    if (!before || !after) {
      const el = document.getElementById('addTransformErr');
      el.textContent = t('needBothPhotosError'); el.classList.remove('hidden');
      return;
    }
    const fd = new FormData();
    fd.append('before', before);
    fd.append('after', after);
    fd.append('duration_label', document.getElementById('durationLabelInput').value);
    fd.append('goal', document.getElementById('goalInput').value);
    fd.append('notes', document.getElementById('notesInput').value);
    fd.append('testimonial', document.getElementById('testimonialInput').value);
    const weightChange = document.getElementById('weightChangeInput').value;
    const bodyFatChange = document.getElementById('bodyFatChangeInput').value;
    if (weightChange) fd.append('weight_change', weightChange);
    if (bodyFatChange) fd.append('body_fat_change', bodyFatChange);
    fd.append('visibility', document.getElementById('transformVisibilityNew').value);
    try {
      await apiUpload('/transformations/' + subscriptionId, fd);
      closeModal();
      onDone();
    } catch (e) {
      const el = document.getElementById('addTransformErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  };
}

async function loadAndRenderPublicTransformations(coachId) {
  const { transformations } = await api('/transformations/coach/' + coachId);
  const box = document.getElementById('publicTransformBox');
  if (!box) return;
  box.innerHTML = transformations.length === 0
    ? `<p class="small">${t('noTransformationsYet')}</p>`
    : `<div class="transform-grid">${transformations.map((tr) => renderTransformCard(tr, true)).join('')}</div>`;
  box.querySelectorAll('[data-open-transform]').forEach((el) => {
    el.onclick = () => {
      const tr = transformations.find((x) => x.id === Number(el.dataset.openTransform));
      if (tr) openTransformModal(tr, false, () => {}, false);
    };
  });
}

// -------------------- إدارة مواعيد الكوتش (Availability) --------------------

let availabilityEditState = { windows: [] };

async function renderCoachAvailability() {
  const { schedule, blockedDates, settings } = await api('/availability/me');
  availabilityEditState.windows = schedule.map((w) => ({ ...w }));

  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card"><h2>${t('availabilityTitle')}</h2></div>
    <div class="card">
      <h2>${t('sessionSettingsTitle')}</h2>
      <label class="small" style="display:block; margin-bottom:6px;">${t('sessionDurationLabel')}</label>
      <input id="sessionDuration" type="number" min="15" max="240" value="${settings.session_duration_minutes}">
      <label class="small" style="display:block; margin:10px 0 6px;">${t('bufferMinutesLabel')}</label>
      <input id="bufferMinutes" type="number" min="0" max="120" value="${settings.buffer_minutes}">
      <button id="saveSettings" style="margin-top:10px;">${t('saveSettingsBtn')}</button>
    </div>
    <div class="card">
      <h2>${t('weeklyScheduleTitle')}</h2>
      <div id="windowsList"></div>
      <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
        <select id="newWindowDay" style="flex:1; min-width:100px;">
          ${[0, 1, 2, 3, 4, 5, 6].map((d) => `<option value="${d}">${t('dayLabel' + d)}</option>`).join('')}
        </select>
        <input id="newWindowStart" type="time" value="09:00" style="flex:1; min-width:90px;">
        <input id="newWindowEnd" type="time" value="17:00" style="flex:1; min-width:90px;">
      </div>
      <button class="secondary" id="addWindow" style="margin-top:8px;">${t('addWindowBtn')}</button>
      <button id="saveSchedule" style="margin-top:8px;">${t('saveScheduleBtn')}</button>
    </div>
    <div class="card">
      <h2>${t('blockedDatesTitle')}</h2>
      <div id="blockedList">
        ${blockedDates.length === 0 ? `<p class="small">${t('noBlockedDatesYet')}</p>` : blockedDates.map((b) => `
          <div class="coach-row">
            <div>${escapeHtml(b.blocked_date)}${b.reason ? ` - ${escapeHtml(b.reason)}` : ''}</div>
            <button class="secondary" data-remove-blocked="${b.id}" style="width:auto; padding:6px 10px;">${t('removeBtn')}</button>
          </div>
        `).join('')}
      </div>
      <input id="newBlockedDate" type="date" style="margin-top:10px;">
      <input id="newBlockedReason" placeholder="${t('blockedDateReasonPlaceholder')}">
      <button id="addBlockedDate">${t('addBlockedDateBtn')}</button>
    </div>
  `);
  document.getElementById('back').onclick = renderMore;

  function renderWindowsList() {
    const box = document.getElementById('windowsList');
    if (!box) return;
    box.innerHTML = availabilityEditState.windows.length === 0
      ? `<p class="small">${t('noWindowsYet')}</p>`
      : availabilityEditState.windows.map((w, i) => `
        <div class="coach-row">
          <div>${t('dayLabel' + w.day_of_week)} · ${escapeHtml(w.start_time)} - ${escapeHtml(w.end_time)}</div>
          <button class="secondary" data-remove-window="${i}" style="width:auto; padding:6px 10px;">${t('removeBtn')}</button>
        </div>
      `).join('');
    box.querySelectorAll('[data-remove-window]').forEach((el) => {
      el.onclick = () => {
        availabilityEditState.windows.splice(Number(el.dataset.removeWindow), 1);
        renderWindowsList();
      };
    });
  }
  renderWindowsList();

  on('saveSettings', 'click', async () => {
    try {
      await api('/availability/me/settings', { method: 'PUT', body: JSON.stringify({
        session_duration_minutes: Number(document.getElementById('sessionDuration').value),
        buffer_minutes: Number(document.getElementById('bufferMinutes').value),
      })});
      alert(t('settingsSavedAlert'));
    } catch (e) { alert(e.message); }
  });

  on('addWindow', 'click', () => {
    availabilityEditState.windows.push({
      day_of_week: Number(document.getElementById('newWindowDay').value),
      start_time: document.getElementById('newWindowStart').value,
      end_time: document.getElementById('newWindowEnd').value,
    });
    renderWindowsList();
  });

  on('saveSchedule', 'click', async () => {
    try {
      await api('/availability/me/schedule', { method: 'PUT', body: JSON.stringify({ windows: availabilityEditState.windows }) });
      alert(t('scheduleSavedAlert'));
    } catch (e) { alert(e.message); }
  });

  document.querySelectorAll('[data-remove-blocked]').forEach((el) => {
    el.onclick = async () => {
      await api('/availability/me/blocked-dates/' + el.dataset.removeBlocked, { method: 'DELETE' });
      renderCoachAvailability();
    };
  });

  on('addBlockedDate', 'click', async () => {
    const date = document.getElementById('newBlockedDate').value;
    if (!date) return;
    try {
      await api('/availability/me/blocked-dates', { method: 'POST', body: JSON.stringify({
        date, reason: document.getElementById('newBlockedReason').value,
      })});
      renderCoachAvailability();
    } catch (e) { alert(e.message); }
  });
}

// -------------------- شبكة المدربين (Trainer Network) --------------------
// اكتشاف بسيط لمدربين تانيين + متابعة/إلغاء متابعة بس - عمدًا مفيش فيد
// أو إشعارات أو أي تعقيد اجتماعي زيادة، زي ما السبك الأصلي طلب صراحة.

let trainerNetworkTab = 'all';
let trainerNetworkQ = '';
let trainerNetworkDebounce = null;

function renderTrainerNetworkCard(c) {
  return `
    <div class="card" data-open-trainer="${c.id}" style="cursor:pointer; display:flex; gap:12px; align-items:center;">
      ${avatarCircle(c.name, c.avatar_path)}
      <div style="flex:1; min-width:0;">
        <div style="font-weight:800; font-size:13.5px;">${escapeHtml(c.name)} ${c.verified ? `<span class="verified-badge">${t('verifiedLabel')}</span>` : ''}</div>
        <div class="small">${escapeHtml(c.specialty) || t('coachSpecialtyFallback')}</div>
        <div class="small">
          ${c.avg_rating ? `<span class="rating">★ ${c.avg_rating}</span> ${t('reviewsCountLabel', { count: c.review_count })}` : t('noReviewsYet')}
          ${c.location ? ' · ' + escapeHtml(c.location) : ''}
        </div>
      </div>
      <button class="secondary" data-follow-toggle="${c.id}" data-following="${c.is_following ? '1' : '0'}" style="width:auto; padding:8px 12px; white-space:nowrap;">${c.is_following ? t('unfollowBtn') : t('followBtn')}</button>
    </div>
  `;
}

async function renderTrainerNetwork() {
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card"><h2>${t('trainerNetworkTitle')}</h2></div>
    <div class="search-bar" style="margin-bottom:12px;">
      <span class="search-icon">${svgIcon('search', 16)}</span>
      <input id="networkSearch" placeholder="${t('searchTrainersPlaceholder')}" value="${escapeHtml(trainerNetworkQ)}">
    </div>
    <div class="tabs">
      <div class="tab ${trainerNetworkTab === 'all' ? 'active' : ''}" data-ntab="all">${t('allTrainersTab')}</div>
      <div class="tab ${trainerNetworkTab === 'following' ? 'active' : ''}" data-ntab="following">${t('followingTab')}</div>
    </div>
    <div id="networkList"><div class="skeleton block"></div></div>
  `);
  document.getElementById('back').onclick = renderMore;

  async function load() {
    const params = new URLSearchParams();
    if (trainerNetworkQ) params.set('q', trainerNetworkQ);
    const { coaches } = await api('/trainer-network?' + params.toString());
    const list = trainerNetworkTab === 'following' ? coaches.filter((c) => c.is_following) : coaches;
    const box = document.getElementById('networkList');
    if (!box) return;
    box.innerHTML = list.length === 0
      ? `<p class="small">${trainerNetworkTab === 'following' ? t('noFollowingYet') : t('noOtherTrainersYet')}</p>`
      : list.map(renderTrainerNetworkCard).join('');

    box.querySelectorAll('[data-open-trainer]').forEach((el) => {
      el.onclick = (e) => {
        if (e.target.closest('[data-follow-toggle]')) return;
        renderTrainerNetworkProfile(el.dataset.openTrainer);
      };
    });
    box.querySelectorAll('[data-follow-toggle]').forEach((el) => {
      el.onclick = async (e) => {
        e.stopPropagation();
        const id = el.dataset.followToggle;
        const following = el.dataset.following === '1';
        try {
          if (following) await api('/trainer-network/follow/' + id, { method: 'DELETE' });
          else await api('/trainer-network/follow/' + id, { method: 'POST' });
          load();
        } catch (err) { alert(err.message); }
      };
    });
  }

  document.getElementById('networkSearch').oninput = (e) => {
    trainerNetworkQ = e.target.value;
    clearTimeout(trainerNetworkDebounce);
    trainerNetworkDebounce = setTimeout(load, 350);
  };
  document.querySelectorAll('[data-ntab]').forEach((el) => {
    el.onclick = () => { trainerNetworkTab = el.dataset.ntab; renderTrainerNetwork(); };
  });

  load();
}

// عرض بروفايل خفيف للمدرب-يشوف-مدرب (Profile/Specialty/Rating/Location
// بس زي ما السبك طلب) - مش نفس renderCoachProfile الخاصة بالمتدرب (فيها
// زرار اشتراك ودفع مالوش أي معنى هنا، وback بترجع لصفحة متدرب أصلًا).
async function renderTrainerNetworkProfile(coachId) {
  const { coach } = await api('/coaches/' + coachId);
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="cover-header">
      <div class="cover-photo"></div>
      <div class="cover-avatar-wrap">${avatarCircle(coach.name, coach.avatar_path, 78)}</div>
    </div>
    <div class="card">
      <h2 style="margin-bottom:2px;">${escapeHtml(coach.name)} ${coach.verified ? `<span class="verified-badge">${t('verifiedLabel')}</span>` : ''}</h2>
      <p class="small">${escapeHtml(coach.specialty) || t('coachSpecialtyFallback')}</p>
      <p class="small" style="margin-top:4px;">${coach.avg_rating ? `<span class="rating">★ ${coach.avg_rating}</span> ${t('reviewsCountLabel', { count: coach.review_count })}` : t('noReviewsYet')}</p>
      ${coach.location ? `<p class="small" style="margin-top:4px;">📍 ${escapeHtml(coach.location)}</p>` : ''}
      ${coach.bio ? `<p style="font-size:13px; line-height:1.8; margin-top:10px;">${escapeHtml(coach.bio)}</p>` : ''}
      ${coach.certification ? `<div style="margin-top:10px;"><span class="filter-chip active" style="cursor:default;">🎓 ${escapeHtml(coach.certification)}</span></div>` : ''}
    </div>
    <div class="card">
      <button id="followToggleBtn" data-following="${coach.isFollowing ? '1' : '0'}">${coach.isFollowing ? t('unfollowBtn') : t('followBtn')}</button>
    </div>
  `);
  document.getElementById('back').onclick = renderTrainerNetwork;
  on('followToggleBtn', 'click', async () => {
    const btn = document.getElementById('followToggleBtn');
    const following = btn.dataset.following === '1';
    try {
      if (following) await api('/trainer-network/follow/' + coachId, { method: 'DELETE' });
      else await api('/trainer-network/follow/' + coachId, { method: 'POST' });
      renderTrainerNetworkProfile(coachId);
    } catch (e) { alert(e.message); }
  });
}

// -------------------- محتوى المدربين (Trainer Content) --------------------
// فيد بسيط للمدربين ينشروا فيه (نصايح/محتوى تعليمي/تمارين/تحفيز/إعلانات)
// - عمدًا بدون تعقيد اجتماعي زيادة (مفيش تعليقات، مفيش خوارزمية ترتيب)،
// زي ما السبك الأصلي طلب. المحتوى بيودّي لبروفايل المدرب اللي ممكن يودّي
// لحجز - فتح البروفايل بيتفرّع حسب دور الزائر (متدرب يشوف نسخة الحجز،
// مدرب يشوف نسخة الشبكة الخفيفة من غير حجز).

const POST_CATEGORY_LABELS = {
  tip: 'catTip', educational: 'catEducational', exercise: 'catExercise',
  transformation: 'catTransformationPost', motivation: 'catMotivation', announcement: 'catAnnouncement',
};

function openAuthorProfile(coachId) {
  if (state.user.role === 'coach') renderTrainerNetworkProfile(coachId);
  else renderCoachProfile(coachId);
}

async function sharePost(p) {
  const text = `${p.coach_name} - ${t(POST_CATEGORY_LABELS[p.category] || 'catTip')}\n${p.content}`;
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch { /* المستخدم لغى المشاركة */ return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    alert(t('shareCopiedAlert'));
  } catch { /* clipboard مش متاح - نتجاهل بهدوء */ }
}

function renderPostCard(p) {
  return `
    <div class="card">
      <div class="coach-row" data-open-author="${p.coach_id}" style="cursor:pointer; gap:10px;">
        ${avatarCircle(p.coach_name, p.coach_avatar, 40)}
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:13px;">${escapeHtml(p.coach_name)} ${p.coach_verified ? `<span class="verified-badge">${t('verifiedLabel')}</span>` : ''}</div>
          <div class="small">${escapeHtml(p.coach_specialty) || t('coachSpecialtyFallback')}</div>
        </div>
        <span class="pill">${t(POST_CATEGORY_LABELS[p.category] || 'catTip')}</span>
      </div>
      ${p.photo_path ? `<img src="/uploads/${encodeURIComponent(p.photo_path)}" style="width:100%; border-radius:10px; margin:10px 0; display:block;" alt="">` : ''}
      <p style="font-size:13.5px; line-height:1.8; margin:10px 0;">${escapeHtml(p.content)}</p>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button class="secondary" data-like="${p.id}" data-liked="${p.is_liked ? '1' : '0'}" style="width:auto; padding:6px 12px;">${p.is_liked ? '❤️' : '🤍'} ${p.like_count}</button>
        <button class="secondary" data-save="${p.id}" data-saved="${p.is_saved ? '1' : '0'}" style="width:auto; padding:6px 12px;">${p.is_saved ? '🔖' : '📑'} ${p.save_count}</button>
        <button class="secondary" data-share="${p.id}" style="width:auto; padding:6px 12px;">${t('shareBtn')}</button>
      </div>
      <div class="small" style="margin-top:6px;">${new Date(p.created_at + 'Z').toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US')}</div>
    </div>
  `;
}

function wirePostCards(box, posts, onChange) {
  box.querySelectorAll('[data-open-author]').forEach((el) => {
    el.onclick = () => openAuthorProfile(el.dataset.openAuthor);
  });
  box.querySelectorAll('[data-like]').forEach((el) => {
    el.onclick = async () => {
      const id = el.dataset.like;
      const liked = el.dataset.liked === '1';
      try {
        await api('/content/' + id + '/like', { method: liked ? 'DELETE' : 'POST' });
        onChange();
      } catch (e) { alert(e.message); }
    };
  });
  box.querySelectorAll('[data-save]').forEach((el) => {
    el.onclick = async () => {
      const id = el.dataset.save;
      const saved = el.dataset.saved === '1';
      try {
        await api('/content/' + id + '/save', { method: saved ? 'DELETE' : 'POST' });
        onChange();
      } catch (e) { alert(e.message); }
    };
  });
  box.querySelectorAll('[data-share]').forEach((el) => {
    el.onclick = () => {
      const post = posts.find((p) => p.id === Number(el.dataset.share));
      if (post) sharePost(post);
    };
  });
}

async function renderContentFeed() {
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card"><h2>${t('contentFeedTitle')}</h2></div>
    <div id="feedList"><div class="skeleton block"></div></div>
  `);
  document.getElementById('back').onclick = () => (state.user.role === 'coach' ? renderMore() : renderTraineeHome());

  async function load() {
    const { posts } = await api('/content');
    const box = document.getElementById('feedList');
    if (!box) return;
    box.innerHTML = posts.length === 0 ? `<p class="small">${t('noContentYet')}</p>` : posts.map(renderPostCard).join('');
    wirePostCards(box, posts, load);
  }
  load();
}

async function renderSavedPosts() {
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card"><h2>${t('savedPostsTitle')}</h2></div>
    <div id="savedList"><div class="skeleton block"></div></div>
  `);
  document.getElementById('back').onclick = () => (state.user.role === 'coach' ? renderMore() : renderProfile());

  async function load() {
    const { posts } = await api('/content/saved');
    const box = document.getElementById('savedList');
    if (!box) return;
    box.innerHTML = posts.length === 0 ? `<p class="small">${t('noSavedPostsYet')}</p>` : posts.map(renderPostCard).join('');
    wirePostCards(box, posts, load);
  }
  load();
}

function openAddPostModal(onDone) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-box">
      <h2>${t('addPostBtn')}</h2>
      <div class="error hidden" id="addPostErr"></div>
      <label class="small" style="display:block; margin-bottom:6px;">${t('postCategoryLabel')}</label>
      <select id="postCategory" style="margin-bottom:10px;">
        ${Object.entries(POST_CATEGORY_LABELS).map(([key, labelKey]) => `<option value="${key}">${t(labelKey)}</option>`).join('')}
      </select>
      <textarea id="postContent" rows="4" placeholder="${t('postContentPlaceholder')}" style="margin-bottom:10px;"></textarea>
      <label class="small" style="display:block; margin-bottom:6px;">${t('postPhotoLabel')}</label>
      <input id="postPhoto" type="file" accept="image/png,image/jpeg,image/webp" style="margin-bottom:10px;">
      <button id="submitPost">${t('publishPostBtn')}</button>
      <button class="secondary" id="closeModal" style="margin-top:8px;">${t('closeBtn2')}</button>
    </div>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });
  document.getElementById('closeModal').onclick = closeModal;
  document.getElementById('submitPost').onclick = async () => {
    const content = document.getElementById('postContent').value.trim();
    if (!content) {
      const el = document.getElementById('addPostErr');
      el.textContent = t('postContentPlaceholder'); el.classList.remove('hidden');
      return;
    }
    const fd = new FormData();
    fd.append('category', document.getElementById('postCategory').value);
    fd.append('content', content);
    const photo = document.getElementById('postPhoto').files[0];
    if (photo) fd.append('photo', photo);
    try {
      await apiUpload('/content', fd);
      closeModal();
      onDone();
    } catch (e) {
      const el = document.getElementById('addPostErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  };
}

async function renderMyPosts() {
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card">
      <h2>${t('myPostsTitle')}</h2>
      <a class="link" href="#" id="viewFeedLink">${t('contentFeedTitle')}</a>
    </div>
    <button id="addPostTile" style="margin-bottom:12px;">${t('addPostBtn')}</button>
    <div id="myPostsList"><div class="skeleton block"></div></div>
  `);
  document.getElementById('back').onclick = renderMore;
  on('viewFeedLink', 'click', (e) => { e.preventDefault(); renderContentFeed(); });

  async function load() {
    const { posts } = await api('/content/mine');
    const box = document.getElementById('myPostsList');
    if (!box) return;
    box.innerHTML = posts.length === 0 ? `<p class="small">${t('noPostsYet')}</p>` : posts.map((p) => `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="pill">${t(POST_CATEGORY_LABELS[p.category] || 'catTip')}</span>
          <span class="small">${new Date(p.created_at + 'Z').toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US')}</span>
        </div>
        ${p.photo_path ? `<img src="/uploads/${encodeURIComponent(p.photo_path)}" style="width:100%; border-radius:10px; margin:10px 0;" alt="">` : ''}
        <p style="font-size:13.5px; line-height:1.8; margin:8px 0;">${escapeHtml(p.content)}</p>
        <div class="small">❤️ ${p.like_count} · 🔖 ${p.save_count}</div>
        <button class="danger" data-delete-post="${p.id}" style="margin-top:8px;">${t('deleteBtn')}</button>
      </div>
    `).join('');
    box.querySelectorAll('[data-delete-post]').forEach((el) => {
      el.onclick = async () => {
        if (!confirm(t('deletePostConfirm'))) return;
        await api('/content/' + el.dataset.deletePost, { method: 'DELETE' });
        load();
      };
    });
  }
  on('addPostTile', 'click', () => openAddPostModal(load));
  load();
}

async function renderCoachTransformations() {
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card"><h2>${t('transformationsTitle')}</h2></div>
    <div id="allTransformBox"><div class="skeleton block"></div></div>
  `);
  document.getElementById('back').onclick = renderMore;
  const { transformations } = await api('/transformations');
  const box = document.getElementById('allTransformBox');
  box.innerHTML = transformations.length === 0
    ? renderEmptyState('📸', t('noTransformationsYet'), '')
    : `<div class="transform-grid">${transformations.map((tr) => renderTransformCard(tr, true)).join('')}</div>`;
  box.querySelectorAll('[data-open-transform]').forEach((el) => {
    el.onclick = () => {
      const tr = transformations.find((x) => x.id === Number(el.dataset.openTransform));
      if (tr) openTransformModal(tr, true, renderCoachTransformations, true);
    };
  });
}

// -------------------- مستندات المدرب (خاصة، للمراجعة بمعرفة الأدمن) --------------------

const DOC_STATUS_ICON = { pending: 'clock', approved: 'verified', rejected: 'close' };

function renderDocumentCard(doc) {
  const typeLabel = { id: t('docTypeId'), certification: t('docTypeCertification'), other: t('docTypeOther') }[doc.doc_type];
  const statusLabel = { pending: t('docStatusPending'), approved: t('docStatusApproved'), rejected: t('docStatusRejected') }[doc.status];
  return `
    <div class="card" style="background:var(--surface-2);">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px; min-width:0;">
          ${svgIcon(doc.mime_type === 'application/pdf' ? 'document' : 'image', 18)}
          <b style="font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(doc.name)}</b>
        </div>
        <span class="filter-chip ${doc.status === 'approved' ? 'active' : ''}" style="cursor:default; flex-shrink:0;">${statusLabel}</span>
      </div>
      <p class="small" style="margin-top:4px;">${typeLabel} · ${escapeHtml(doc.created_at)}</p>
      ${doc.status === 'rejected' && doc.review_note ? `<p class="small" style="color:var(--danger); margin-top:4px;">${escapeHtml(doc.review_note)}</p>` : ''}
      <div style="display:flex; gap:8px; margin-top:8px;">
        <a class="secondary" href="/api/trainer-documents/${doc.id}/file" target="_blank" rel="noopener" style="flex:1; text-align:center; padding:8px; border-radius:10px; text-decoration:none; font-size:12.5px; font-weight:700;">${t('viewDocumentBtn')}</a>
        <button class="danger" data-delete-doc="${doc.id}" style="width:auto; padding:8px 14px;">${svgIcon('close', 14)}</button>
      </div>
    </div>
  `;
}

async function renderTrainerDocuments() {
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card">
      <h2>${t('trainerDocumentsTitle')}</h2>
      <p class="small">${t('trainerDocumentsHint')}</p>
    </div>
    <div class="card">
      <select id="newDocType">
        <option value="id">${t('docTypeId')}</option>
        <option value="certification">${t('docTypeCertification')}</option>
        <option value="other">${t('docTypeOther')}</option>
      </select>
      <input id="newDocName" placeholder="${t('docNamePlaceholder')}">
      <input id="newDocFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" style="margin-bottom:10px;">
      <div class="error hidden" id="docUploadErr"></div>
      <button id="uploadDocBtn">${t('uploadDocumentBtn')}</button>
    </div>
    <div id="documentsList"><div class="skeleton block"></div></div>
  `);
  document.getElementById('back').onclick = renderMore;

  async function load() {
    const { documents } = await api('/trainer-documents/mine');
    const box = document.getElementById('documentsList');
    box.innerHTML = documents.length === 0
      ? renderEmptyState(svgIcon('document', 30), t('noDocumentsYet'), '')
      : documents.map(renderDocumentCard).join('');
    box.querySelectorAll('[data-delete-doc]').forEach((el) => {
      el.onclick = async () => {
        if (!confirm(t('deleteDocumentConfirm'))) return;
        await api('/trainer-documents/' + el.dataset.deleteDoc, { method: 'DELETE' });
        load();
      };
    });
  }
  await load();

  on('uploadDocBtn', 'click', async () => {
    const file = document.getElementById('newDocFile').files[0];
    const name = document.getElementById('newDocName').value.trim();
    const errEl = document.getElementById('docUploadErr');
    errEl.classList.add('hidden');
    if (!file || !name) {
      errEl.textContent = t('docNameFileRequired');
      errEl.classList.remove('hidden');
      return;
    }
    const fd = new FormData();
    fd.append('document', file);
    fd.append('docType', document.getElementById('newDocType').value);
    fd.append('name', name);
    try {
      await apiUpload('/trainer-documents', fd);
      document.getElementById('newDocName').value = '';
      document.getElementById('newDocFile').value = '';
      load();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  });
}

// -------------------- اكتشف / سوق المدربين --------------------

function avatarCircle(name, avatarPath, size) {
  const px = size || 44;
  if (avatarPath) {
    return `<img class="avatar-img" src="/uploads/${encodeURIComponent(avatarPath)}" style="width:${px}px; height:${px}px;" alt="">`;
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return `<div style="width:${px}px; height:${px}px; border-radius:50%; background:var(--surface-2); border:1px solid var(--line); display:flex; align-items:center; justify-content:center; font-weight:800; color:var(--red-soft); flex-shrink:0; font-size:${Math.round(px * 0.4)}px;">${escapeHtml(initial)}</div>`;
}

// -------------------- خرائط وسوم المطابقة (Find My Trainer) --------------------
// مشتركة بين شاشة وسوم المدرب (app.js) وشاشة أسئلة المتدرب تحت في الملف
// ده - features.js بيتحمّل قبل app.js فالخرائط دي متاحة للاتنين.

const GOAL_LABELS = {
  lose_fat: 'goalLoseFat', build_muscle: 'goalBuildMuscle', get_stronger: 'goalGetStronger',
  improve_fitness: 'goalImproveFitness', calisthenics: 'goalCalisthenics', athletic_performance: 'goalAthleticPerformance',
};
const EXPERIENCE_LABELS = { beginner: 'expBeginner', intermediate: 'expIntermediate', advanced: 'expAdvanced' };
const TRAINING_TYPE_LABELS = { gym: 'typeGym', home: 'typeHome', online: 'typeOnline', in_person: 'typeInPerson' };

function renderCoachCard(c) {
  return `
    <div class="card" data-open-coach="${c.id}" style="cursor:pointer; display:flex; gap:12px; align-items:center;">
      ${avatarCircle(c.name, c.avatar_path)}
      <div style="flex:1; min-width:0;">
        <div style="font-weight:800; font-size:13.5px;">${escapeHtml(c.name)} ${c.verified ? `<span class="verified-badge">${t('verifiedLabel')}</span>` : ''}</div>
        <div class="small">${escapeHtml(c.specialty) || t('coachSpecialtyFallback')}</div>
        <div class="small">
          ${c.avg_rating ? `<span class="rating">★ ${c.avg_rating}</span> ${t('reviewsCountLabel', { count: c.review_count })}` : t('noReviewsYet')}
          ${c.client_count ? ' · ' + t('clientsCountLabel', { count: c.client_count }) : ''}
        </div>
        ${c.compatibilityPct != null ? `<div class="small" style="color:var(--success); font-weight:700; margin-top:2px;">${t('compatibilityLabel')}: ${c.compatibilityPct}%</div>` : ''}
      </div>
      <div class="small" style="white-space:nowrap;">${t('pricePerMonth', { price: c.price_1m })}</div>
    </div>
  `;
}

const PRICE_RANGE_MAX = 3000;
let discoverState = { q: '', minPrice: '', maxPrice: '', sort: 'newest', gender: '', location: '', minRating: '' };
let discoverDebounce = null;

function activeFilterCount() {
  let n = 0;
  if (discoverState.minPrice || discoverState.maxPrice) n++;
  if (discoverState.gender) n++;
  if (discoverState.location) n++;
  if (discoverState.minRating) n++;
  return n;
}

async function renderDiscover() {
  renderBottomNav('discover');
  const filterCount = activeFilterCount();
  render(`
    <div class="card" id="findMyTrainerEntry" style="cursor:pointer; margin-bottom:16px; text-align:center;">
      <h2 style="margin:0 0 4px;">${t('findMyTrainerBtn')}</h2>
      <p class="small" style="margin:0;">${t('findMyTrainerHint')}</p>
    </div>
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:16px;">
      <div class="search-bar" style="flex:1; margin-bottom:0;">
        <span class="search-icon">${svgIcon('search', 16)}</span>
        <input id="discoverSearch" placeholder="${t('searchTrainersPlaceholder')}" value="${escapeHtml(discoverState.q)}">
      </div>
      <button class="secondary" id="openFilterScreen" style="width:auto; padding:11px 14px; position:relative;">
        ⚙️${filterCount ? `<span class="badge-dot" style="position:static; display:inline-flex; margin-inline-start:4px; border:none;">${filterCount}</span>` : ''}
      </button>
    </div>
    <select id="sortSelect" style="margin-bottom:16px;">
      <option value="newest" ${discoverState.sort === 'newest' ? 'selected' : ''}>${t('sortNewest')}</option>
      <option value="rating" ${discoverState.sort === 'rating' ? 'selected' : ''}>${t('sortRating')}</option>
      <option value="price_asc" ${discoverState.sort === 'price_asc' ? 'selected' : ''}>${t('sortPriceAsc')}</option>
      <option value="price_desc" ${discoverState.sort === 'price_desc' ? 'selected' : ''}>${t('sortPriceDesc')}</option>
    </select>
    <div id="discoverResults"><div class="skeleton block"></div><div class="skeleton block"></div></div>
  `);

  async function loadResults() {
    const params = new URLSearchParams();
    if (discoverState.q) params.set('q', discoverState.q);
    if (discoverState.minPrice) params.set('minPrice', discoverState.minPrice);
    if (discoverState.maxPrice) params.set('maxPrice', discoverState.maxPrice);
    if (discoverState.gender) params.set('gender', discoverState.gender);
    if (discoverState.location) params.set('location', discoverState.location);
    if (discoverState.minRating) params.set('minRating', discoverState.minRating);
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
  on('openFilterScreen', 'click', renderFilterScreen);
  on('findMyTrainerEntry', 'click', renderFindMyTrainer);

  loadResults();
}

// -------------------- لاقي مدربك المثالي (Find My Trainer) --------------------
// مطابقة حتمية بناءً على وسوم حقيقية سجلها المدربين بأنفسهم (lib/matching.js)
// - مفيش أي ذكاء اصطناعي هنا، والنصوص هنا مقصود متتقالش "AI" في أي حتة.

let findTrainerAnswers = { goal: '', experience: '', trainingType: '', budget: '', location: '' };

async function renderFindMyTrainer() {
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card">
      <h2>${t('findMyTrainerTitle')}</h2>
      <p class="small" style="margin-bottom:12px;">${t('findMyTrainerHint')}</p>
      <div class="error hidden" id="findTrainerErr"></div>

      <label class="small" style="display:block; margin-bottom:6px;">${t('selectGoalLabel')}</label>
      <select id="qGoal" style="margin-bottom:12px;">
        <option value="">-</option>
        ${Object.entries(GOAL_LABELS).map(([key, labelKey]) => `<option value="${key}" ${findTrainerAnswers.goal === key ? 'selected' : ''}>${t(labelKey)}</option>`).join('')}
      </select>

      <label class="small" style="display:block; margin-bottom:6px;">${t('selectExperienceLabel')}</label>
      <select id="qExperience" style="margin-bottom:12px;">
        <option value="">${t('noPreferenceOption')}</option>
        ${Object.entries(EXPERIENCE_LABELS).map(([key, labelKey]) => `<option value="${key}" ${findTrainerAnswers.experience === key ? 'selected' : ''}>${t(labelKey)}</option>`).join('')}
      </select>

      <label class="small" style="display:block; margin-bottom:6px;">${t('selectTrainingTypeLabel')}</label>
      <select id="qTrainingType" style="margin-bottom:12px;">
        <option value="">${t('noPreferenceOption')}</option>
        ${Object.entries(TRAINING_TYPE_LABELS).map(([key, labelKey]) => `<option value="${key}" ${findTrainerAnswers.trainingType === key ? 'selected' : ''}>${t(labelKey)}</option>`).join('')}
      </select>

      <label class="small" style="display:block; margin-bottom:6px;">${t('budgetLabel')}</label>
      <input id="qBudget" type="number" min="0" value="${escapeHtml(findTrainerAnswers.budget)}" style="margin-bottom:12px;">

      <label class="small" style="display:block; margin-bottom:6px;">${t('locationPlaceholder')}</label>
      <input id="qLocation" value="${escapeHtml(findTrainerAnswers.location)}" style="margin-bottom:12px;">

      <button id="findMatchesBtn">${t('findMatchesBtn')}</button>
    </div>
  `);
  document.getElementById('back').onclick = renderDiscover;

  on('findMatchesBtn', 'click', async () => {
    const goal = document.getElementById('qGoal').value;
    if (!goal) {
      const el = document.getElementById('findTrainerErr');
      el.textContent = t('selectGoalLabel'); el.classList.remove('hidden');
      return;
    }
    findTrainerAnswers = {
      goal,
      experience: document.getElementById('qExperience').value,
      trainingType: document.getElementById('qTrainingType').value,
      budget: document.getElementById('qBudget').value,
      location: document.getElementById('qLocation').value,
    };
    try {
      const { matches } = await api('/matching/find-trainer', { method: 'POST', body: JSON.stringify(findTrainerAnswers) });
      renderMatchResults(matches);
    } catch (e) {
      const el = document.getElementById('findTrainerErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  });
}

function renderMatchResults(matches) {
  render(`
    <button class="secondary" id="back">${t('back')}</button>
    <div class="card">
      <h2>${t('matchResultsTitle')}</h2>
      <button class="secondary" id="changeAnswers" style="width:auto; padding:6px 10px; margin-top:6px;">${t('changeAnswersBtn')}</button>
    </div>
    ${matches.length === 0 ? renderEmptyState('🎯', t('noMatchesFound'), '') : matches.map(renderCoachCard).join('')}
  `);
  document.getElementById('back').onclick = renderDiscover;
  on('changeAnswers', 'click', renderFindMyTrainer);
  document.querySelectorAll('[data-open-coach]').forEach((el) => {
    el.onclick = () => renderCoachProfile(el.dataset.openCoach);
  });
}

const FILTER_CATEGORIES = ['قوة', 'خسارة وزن', 'بناء أجسام', 'ليونة'];

async function renderFilterScreen() {
  const { locations } = await api('/coaches/meta/locations');
  const draft = { ...discoverState };

  render(`
    <div class="topbar" style="margin-bottom:20px;">
      <h2 style="margin:0;">${t('filterTitle')}</h2>
      <a href="#" class="link" id="resetFiltersLink">${t('resetFilters')}</a>
    </div>

    <div class="filter-section-label">${t('categoriesTitle')}</div>
    <div class="chip-row" id="specialtyChips">
      <span class="filter-chip ${!draft.q ? 'active' : ''}" data-specialty="">${t('allOption')}</span>
      ${FILTER_CATEGORIES.map((c) => `<span class="filter-chip ${draft.q === c ? 'active' : ''}" data-specialty="${escapeHtml(c)}">${escapeHtml(c)}</span>`).join('')}
    </div>

    <div class="filter-section-label">${t('genderFilterLabel')}</div>
    <div class="chip-row" id="genderChips">
      <span class="filter-chip ${!draft.gender ? 'active' : ''}" data-gender="">${t('allOption')}</span>
      <span class="filter-chip ${draft.gender === 'male' ? 'active' : ''}" data-gender="male">${t('genderMale')}</span>
      <span class="filter-chip ${draft.gender === 'female' ? 'active' : ''}" data-gender="female">${t('genderFemale')}</span>
    </div>

    <div class="filter-section-label">${t('priceRangeLabel')}</div>
    <div class="dual-range">
      <div class="range-track"></div>
      <div class="range-fill" id="priceFill"></div>
      <input type="range" id="minPriceRange" min="0" max="${PRICE_RANGE_MAX}" step="50" value="${draft.minPrice || 0}">
      <input type="range" id="maxPriceRange" min="0" max="${PRICE_RANGE_MAX}" step="50" value="${draft.maxPrice || PRICE_RANGE_MAX}">
    </div>
    <div class="range-values"><span id="minPriceLabel">${draft.minPrice || 0}</span><span id="maxPriceLabel">${draft.maxPrice || PRICE_RANGE_MAX}+</span></div>

    <div class="filter-section-label">${t('locationFilterLabel')}</div>
    <select id="locationSelect" style="margin-bottom:18px;">
      <option value="">${t('allOption')}</option>
      ${locations.map((l) => `<option value="${escapeHtml(l)}" ${draft.location === l ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
    </select>

    <div class="filter-section-label">${t('ratingFilterLabel')}</div>
    <div class="chip-row" id="ratingChips">
      <span class="filter-chip ${!draft.minRating ? 'active' : ''}" data-rating="">${t('allOption')}</span>
      <span class="filter-chip ${draft.minRating === '4' ? 'active' : ''}" data-rating="4">★ 4+</span>
      <span class="filter-chip ${draft.minRating === '4.5' ? 'active' : ''}" data-rating="4.5">★ 4.5+</span>
      <span class="filter-chip ${draft.minRating === '5' ? 'active' : ''}" data-rating="5">★ 5</span>
    </div>

    <button id="applyFiltersBtn2">${t('applyFiltersBtn2')}</button>
    <button class="secondary" id="cancelFilters" style="margin-top:10px;">${t('back')}</button>
  `);

  function selectChip(container, attr, value) {
    document.querySelectorAll(`#${container} [data-${attr}]`).forEach((el) => {
      el.classList.toggle('active', el.dataset[attr] === value);
    });
  }

  document.querySelectorAll('#specialtyChips [data-specialty]').forEach((el) => {
    el.onclick = () => { draft.q = el.dataset.specialty; selectChip('specialtyChips', 'specialty', draft.q); };
  });
  document.querySelectorAll('#genderChips [data-gender]').forEach((el) => {
    el.onclick = () => { draft.gender = el.dataset.gender; selectChip('genderChips', 'gender', draft.gender); };
  });
  document.querySelectorAll('#ratingChips [data-rating]').forEach((el) => {
    el.onclick = () => { draft.minRating = el.dataset.rating; selectChip('ratingChips', 'rating', draft.minRating); };
  });

  const minRange = document.getElementById('minPriceRange');
  const maxRange = document.getElementById('maxPriceRange');
  function updatePriceUi() {
    let min = Number(minRange.value), max = Number(maxRange.value);
    if (min > max) { [min, max] = [max, min]; }
    document.getElementById('minPriceLabel').textContent = min;
    document.getElementById('maxPriceLabel').textContent = max >= PRICE_RANGE_MAX ? max + '+' : max;
    document.getElementById('priceFill').style.left = (min / PRICE_RANGE_MAX * 100) + '%';
    document.getElementById('priceFill').style.width = ((max - min) / PRICE_RANGE_MAX * 100) + '%';
    draft.minPrice = min > 0 ? min : '';
    draft.maxPrice = max < PRICE_RANGE_MAX ? max : '';
  }
  minRange.oninput = updatePriceUi;
  maxRange.oninput = updatePriceUi;
  updatePriceUi();

  on('resetFiltersLink', 'click', (e) => {
    e.preventDefault();
    discoverState = { q: '', minPrice: '', maxPrice: '', sort: discoverState.sort, gender: '', location: '', minRating: '' };
    renderFilterScreen();
  });
  on('cancelFilters', 'click', renderDiscover);
  on('applyFiltersBtn2', 'click', () => {
    draft.location = document.getElementById('locationSelect').value;
    discoverState = draft;
    renderDiscover();
  });
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
  const progressBySub = {};
  if (groups.active.length) {
    const now = Date.now();
    await Promise.all(groups.active.map(async (s) => {
      const [{ sessions }, { pct }] = await Promise.all([
        api('/sessions/' + s.id),
        api('/habits/' + s.id + '/adherence'),
      ]);
      const next = sessions
        .filter((sess) => sess.status === 'scheduled' && new Date(sess.scheduled_at).getTime() > now)
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];
      if (next) nextSessionBySub[s.id] = next.scheduled_at;
      progressBySub[s.id] = pct;
    }));
  }

  function renderList() {
    const list = groups[clientsTab];
    const emptyMsg = { active: t('noActiveClients'), pending: t('noPendingClients'), past: t('noPastClients') }[clientsTab];
    document.getElementById('clientsList').innerHTML = list.length === 0
      ? renderEmptyState('👥', emptyMsg, '')
      : list.map((s) => `
        <div class="card" data-open-client="${s.id}" style="cursor:pointer; display:flex; gap:12px; align-items:center;">
          ${avatarCircle(s.other_party_name, s.other_party_avatar)}
          <div style="flex:1; min-width:0;">
            <div style="font-weight:800; font-size:13.5px;">${escapeHtml(s.other_party_name)}</div>
            <div class="small">${t('packageLabel', { pkg: s.package })}</div>
            ${clientsTab === 'active' ? `
              <div class="small">${nextSessionBySub[s.id] ? t('nextSessionLabel', { date: new Date(nextSessionBySub[s.id]).toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US') }) : t('noUpcomingSession')}</div>
              ${progressBySub[s.id] != null ? `
                <div class="small" style="margin-top:6px;">${t('progressLabel', { pct: progressBySub[s.id] })}</div>
                <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${progressBySub[s.id]}%;"></div></div>
              ` : ''}
            ` : ''}
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
  ['checkins', 'navCheckins'],
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
      else if (key === 'checkins') renderCheckinsTab(subscriptionId);
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
    daily_calories: nutritionPlan?.daily_calories ?? '',
    protein_target: nutritionPlan?.protein_target ?? '',
    carbs_target: nutritionPlan?.carbs_target ?? '',
    fat_target: nutritionPlan?.fat_target ?? '',
    notes: nutritionPlan?.notes || '',
    // خطط قديمة قبل إضافة time/foods مفيش عندها الحقول دي - نديها قيمة
    // افتراضية هنا عشان الفورم ميتعملش عليها crash.
    meals: nutritionPlan?.meals
      ? JSON.parse(JSON.stringify(nutritionPlan.meals)).map((m) => ({ time: '', foods: [], ...m }))
      : [],
  };

  render(`
    ${renderHubTabs(subscriptionId, 'plan')}
    <div class="card">
      <h2>${t('workoutPlanTitle')}</h2>
      ${isCoach ? `<div id="templateToolbar" class="template-toolbar"></div>` : ''}
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
  if (isCoach) wireTemplateToolbar(subscriptionId);
}

// -------------------- قوالب برامج التمرين --------------------

async function wireTemplateToolbar(subscriptionId) {
  const box = document.getElementById('templateToolbar');
  if (!box) return;
  let templates = [];
  try {
    ({ templates } = await api('/plans/workout-templates'));
  } catch (e) { return; }

  box.innerHTML = `
    <select id="templateSelect" style="margin-bottom:0; flex:1;">
      <option value="">${t('startFromTemplateOption')}</option>
      ${templates.map((tpl) => `<option value="${tpl.id}">${escapeHtml(tpl.title)}</option>`).join('')}
    </select>
    <button class="secondary" id="applyTemplateBtn" style="width:auto; padding:9px 12px;">${t('applyTemplateBtn')}</button>
    <button class="secondary" id="saveAsTemplateBtn" style="width:auto; padding:9px 12px;">${t('saveAsTemplateBtn')}</button>
  `;

  on('applyTemplateBtn', 'click', async () => {
    const id = document.getElementById('templateSelect').value;
    if (!id) return;
    if (planEditState.workout.days.length && !confirm(t('confirmApplyTemplate'))) return;
    try {
      const { template } = await api('/plans/workout-templates/' + id);
      planEditState.workout.days = JSON.parse(JSON.stringify(template.days));
      renderWorkoutBody(subscriptionId, true);
    } catch (e) { alert(e.message); }
  });

  on('saveAsTemplateBtn', 'click', async () => {
    const title = prompt(t('templateNamePrompt'));
    if (!title) return;
    try {
      await api('/plans/workout-templates', { method: 'POST', body: JSON.stringify({ title, days: planEditState.workout.days }) });
      alert(t('templateSavedAlert'));
      wireTemplateToolbar(subscriptionId);
    } catch (e) { alert(e.message); }
  });
}

const EXERCISE_TYPE_KEYS = { normal: 'exTypeNormal', superset: 'exTypeSuperset', dropset: 'exTypeDropset', warmup: 'exTypeWarmup', cooldown: 'exTypeCooldown' };

function newExercise() {
  return { name: '', sets: null, reps: '', weight: '', rest: '', tempo: '', rpe: null, type: 'normal', video_url: '', notes: '' };
}

function exerciseSummaryLine(ex) {
  const parts = [];
  if (ex.sets) parts.push(ex.sets + ' × ' + (ex.reps || '-'));
  else if (ex.reps) parts.push(escapeHtml(ex.reps));
  if (ex.weight) parts.push(escapeHtml(ex.weight));
  if (ex.rest) parts.push(t('restShortLabel', { rest: escapeHtml(ex.rest) }));
  if (ex.tempo) parts.push('Tempo ' + escapeHtml(ex.tempo));
  if (ex.rpe) parts.push('RPE ' + ex.rpe);
  return parts.join(' · ');
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
              <div class="exercise-name">${escapeHtml(ex.name)} ${ex.type && ex.type !== 'normal' ? `<span class="ex-type-badge">${t(EXERCISE_TYPE_KEYS[ex.type])}</span>` : ''}</div>
              <div class="small">${exerciseSummaryLine(ex)}</div>
              ${ex.notes ? `<div class="small">${escapeHtml(ex.notes)}</div>` : ''}
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
          <button class="secondary" data-duplicate-day="${di}" title="${t('duplicateDayBtn')}" style="width:auto; padding:8px 12px; margin-bottom:8px;">⧉</button>
          <button class="secondary" data-remove-day="${di}" style="width:auto; padding:8px 12px; margin-bottom:8px;">${t('removeBtn')}</button>
        </div>
        ${day.exercises.map((ex, ei) => `
          <div class="exercise-card">
            <div style="display:flex; gap:6px;">
              <input data-ex="name:${di}:${ei}" value="${escapeHtml(ex.name)}" placeholder="${t('exerciseNamePlaceholder')}" style="flex:1;">
              <select data-ex="type:${di}:${ei}" style="width:auto; flex-shrink:0;">
                ${Object.entries(EXERCISE_TYPE_KEYS).map(([val, key]) => `<option value="${val}" ${ex.type === val ? 'selected' : ''}>${t(key)}</option>`).join('')}
              </select>
            </div>
            <div class="exercise-grid">
              <input data-ex="sets:${di}:${ei}" type="number" min="0" value="${ex.sets ?? ''}" placeholder="${t('setsPlaceholder')}">
              <input data-ex="reps:${di}:${ei}" value="${escapeHtml(ex.reps)}" placeholder="${t('repsPlaceholder')}">
              <input data-ex="weight:${di}:${ei}" value="${escapeHtml(ex.weight)}" placeholder="${t('weightPlaceholder')}">
              <input data-ex="rest:${di}:${ei}" value="${escapeHtml(ex.rest)}" placeholder="${t('restPlaceholder')}">
              <input data-ex="tempo:${di}:${ei}" value="${escapeHtml(ex.tempo)}" placeholder="${t('tempoPlaceholder')}">
              <input data-ex="rpe:${di}:${ei}" type="number" min="1" max="10" value="${ex.rpe ?? ''}" placeholder="${t('rpePlaceholder')}">
            </div>
            <input data-ex="video_url:${di}:${ei}" value="${escapeHtml(ex.video_url)}" placeholder="${t('videoUrlPlaceholder')}">
            <input data-ex="notes:${di}:${ei}" value="${escapeHtml(ex.notes)}" placeholder="${t('exerciseNotesPlaceholder')}">
            <div class="exercise-actions">
              <button class="secondary" data-move-ex="up:${di}:${ei}" ${ei === 0 ? 'disabled' : ''}>↑</button>
              <button class="secondary" data-move-ex="down:${di}:${ei}" ${ei === day.exercises.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="secondary" data-duplicate-ex="${di}:${ei}" title="${t('duplicateExerciseBtn')}">⧉</button>
              <button class="secondary" data-remove-ex="${di}:${ei}">${t('removeBtn')}</button>
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
    const handler = () => {
      const [field, di, ei] = el.dataset.ex.split(':');
      const numericFields = ['sets', 'rpe'];
      wp.days[+di].exercises[+ei][field] = numericFields.includes(field) ? (el.value ? Number(el.value) : null) : el.value;
    };
    el.oninput = handler;
    if (el.tagName === 'SELECT') el.onchange = handler;
  });
  document.querySelectorAll('[data-remove-day]').forEach((el) => {
    el.onclick = () => { wp.days.splice(+el.dataset.removeDay, 1); renderWorkoutBody(subscriptionId, isCoach); };
  });
  document.querySelectorAll('[data-duplicate-day]').forEach((el) => {
    el.onclick = () => {
      const di = +el.dataset.duplicateDay;
      const copy = JSON.parse(JSON.stringify(wp.days[di]));
      wp.days.splice(di + 1, 0, copy);
      renderWorkoutBody(subscriptionId, isCoach);
    };
  });
  document.querySelectorAll('[data-add-ex]').forEach((el) => {
    el.onclick = () => {
      wp.days[+el.dataset.addEx].exercises.push(newExercise());
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
  document.querySelectorAll('[data-duplicate-ex]').forEach((el) => {
    el.onclick = () => {
      const [di, ei] = el.dataset.duplicateEx.split(':').map(Number);
      const copy = JSON.parse(JSON.stringify(wp.days[di].exercises[ei]));
      wp.days[di].exercises.splice(ei + 1, 0, copy);
      renderWorkoutBody(subscriptionId, isCoach);
    };
  });
  document.querySelectorAll('[data-move-ex]').forEach((el) => {
    el.onclick = () => {
      const [dir, di, ei] = el.dataset.moveEx.split(':');
      const day = wp.days[+di];
      const from = +ei;
      const to = dir === 'up' ? from - 1 : from + 1;
      if (to < 0 || to >= day.exercises.length) return;
      [day.exercises[from], day.exercises[to]] = [day.exercises[to], day.exercises[from]];
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

function newFood() {
  return { name: '', quantity: '', calories: null, protein: null, carbs: null, fat: null, alternative: '' };
}
function newMeal() {
  return { label: '', time: '', description: '', foods: [] };
}

function sumMealsMacros(meals) {
  return meals.reduce((acc, m) => {
    (m.foods || []).forEach((f) => {
      acc.calories += f.calories || 0;
      acc.protein += f.protein || 0;
      acc.carbs += f.carbs || 0;
      acc.fat += f.fat || 0;
    });
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function macroSummaryChips(totals, targets) {
  const calTarget = targets.daily_calories ? Number(targets.daily_calories) : null;
  const proTarget = targets.protein_target ? Number(targets.protein_target) : null;
  const carbTarget = targets.carbs_target ? Number(targets.carbs_target) : null;
  const fatTarget = targets.fat_target ? Number(targets.fat_target) : null;
  return `
    <div class="macro-summary">
      <span class="macro-chip">🔥 ${totals.calories}${calTarget ? ' / ' + calTarget : ''} ${t('kcalUnit')}</span>
      <span class="macro-chip">${t('proteinLabel')} ${totals.protein}${proTarget ? ' / ' + proTarget : ''}${t('gramUnit')}</span>
      <span class="macro-chip">${t('carbsLabel')} ${totals.carbs}${carbTarget ? ' / ' + carbTarget : ''}${t('gramUnit')}</span>
      <span class="macro-chip">${t('fatLabel')} ${totals.fat}${fatTarget ? ' / ' + fatTarget : ''}${t('gramUnit')}</span>
    </div>
  `;
}

function foodSummaryLine(f) {
  const parts = [];
  if (f.quantity) parts.push(escapeHtml(f.quantity));
  if (f.calories) parts.push(f.calories + ' ' + t('kcalUnit'));
  if (f.protein) parts.push(t('proteinLabel') + ' ' + f.protein);
  if (f.carbs) parts.push(t('carbsLabel') + ' ' + f.carbs);
  if (f.fat) parts.push(t('fatLabel') + ' ' + f.fat);
  return parts.join(' · ');
}

function renderNutritionBody(subscriptionId, isCoach) {
  const body = document.getElementById('nutritionBody');
  const np = planEditState.nutrition;

  if (!isCoach) {
    const totals = sumMealsMacros(np.meals);
    body.innerHTML = `
      ${np.daily_calories || np.protein_target || np.carbs_target || np.fat_target ? macroSummaryChips(totals, np) : ''}
      ${np.notes ? `<p style="font-size:13px; line-height:1.8;">${escapeHtml(np.notes)}</p>` : ''}
      ${np.meals.length ? np.meals.map((m) => `
        <div class="plan-day">
          <div class="plan-day-title">${escapeHtml(m.label)}${m.time ? ` <span class="small">· ${escapeHtml(m.time)}</span>` : ''}</div>
          ${m.description ? `<p class="small">${escapeHtml(m.description)}</p>` : ''}
          ${(m.foods || []).map((f) => `
            <div class="exercise-row read">
              <div>
                <div class="exercise-name">${escapeHtml(f.name)}</div>
                <div class="small">${foodSummaryLine(f)}</div>
                ${f.alternative ? `<div class="small">${t('alternativeLabel')} ${escapeHtml(f.alternative)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `).join('') : `<p class="small">${t('noNutritionPlanYet')}</p>`}
    `;
    return;
  }

  function updateMacroPreview() {
    const totals = sumMealsMacros(np.meals);
    const targets = {
      daily_calories: document.getElementById('dailyCalories').value,
      protein_target: document.getElementById('proteinTarget').value,
      carbs_target: document.getElementById('carbsTarget').value,
      fat_target: document.getElementById('fatTarget').value,
    };
    document.getElementById('macroPreview').innerHTML = macroSummaryChips(totals, targets);
  }

  body.innerHTML = `
    <div class="exercise-grid" style="grid-template-columns:repeat(2,1fr); margin-bottom:8px;">
      <input id="dailyCalories" type="number" min="0" value="${np.daily_calories}" placeholder="${t('dailyCaloriesPlaceholder')}">
      <input id="proteinTarget" type="number" min="0" value="${np.protein_target}" placeholder="${t('proteinTargetPlaceholder')}">
      <input id="carbsTarget" type="number" min="0" value="${np.carbs_target}" placeholder="${t('carbsTargetPlaceholder')}">
      <input id="fatTarget" type="number" min="0" value="${np.fat_target}" placeholder="${t('fatTargetPlaceholder')}">
    </div>
    <textarea id="nutritionNotes" rows="2" placeholder="${t('nutritionNotesPlaceholder')}">${escapeHtml(np.notes)}</textarea>
    <div id="macroPreview"></div>
    ${np.meals.map((m, mi) => `
      <div class="meal-card">
        <div style="display:flex; gap:6px;">
          <input data-meal="label:${mi}" value="${escapeHtml(m.label)}" placeholder="${t('mealLabelPlaceholder')}" style="flex:2;">
          <input data-meal="time:${mi}" value="${escapeHtml(m.time)}" placeholder="${t('mealTimePlaceholder')}" style="flex:1;">
        </div>
        <input data-meal="description:${mi}" value="${escapeHtml(m.description)}" placeholder="${t('mealDescPlaceholder')}">
        ${(m.foods || []).map((f, fi) => `
          <div class="food-row">
            <input data-food="name:${mi}:${fi}" value="${escapeHtml(f.name)}" placeholder="${t('foodNamePlaceholder')}">
            <div class="macro-grid-2">
              <input data-food="quantity:${mi}:${fi}" value="${escapeHtml(f.quantity)}" placeholder="${t('foodQuantityPlaceholder')}">
              <input data-food="calories:${mi}:${fi}" type="number" min="0" value="${f.calories ?? ''}" placeholder="${t('foodCaloriesPlaceholder')}">
            </div>
            <div class="exercise-grid">
              <input data-food="protein:${mi}:${fi}" type="number" min="0" value="${f.protein ?? ''}" placeholder="${t('foodProteinPlaceholder')}">
              <input data-food="carbs:${mi}:${fi}" type="number" min="0" value="${f.carbs ?? ''}" placeholder="${t('foodCarbsPlaceholder')}">
              <input data-food="fat:${mi}:${fi}" type="number" min="0" value="${f.fat ?? ''}" placeholder="${t('foodFatPlaceholder')}">
            </div>
            <input data-food="alternative:${mi}:${fi}" value="${escapeHtml(f.alternative)}" placeholder="${t('foodAlternativePlaceholder')}">
            <button class="secondary" data-remove-food="${mi}:${fi}">${t('removeBtn')}</button>
          </div>
        `).join('')}
        <button class="secondary" data-add-food="${mi}" style="margin-bottom:6px;">${t('addFoodBtn')}</button>
        <button class="danger" data-remove-meal="${mi}" style="width:auto; padding:8px 12px;">${t('removeBtn')}</button>
      </div>
    `).join('')}
    <button class="secondary" id="addMeal">${t('addMealBtn')}</button>
    <button id="saveNutrition" style="margin-top:10px;">${t('savePlanBtn')}</button>
  `;

  document.querySelectorAll('[data-meal]').forEach((el) => {
    el.oninput = () => {
      const [field, mi] = el.dataset.meal.split(':');
      np.meals[+mi][field] = el.value;
    };
  });
  document.querySelectorAll('[data-food]').forEach((el) => {
    el.oninput = () => {
      const [field, mi, fi] = el.dataset.food.split(':');
      const numericFields = ['calories', 'protein', 'carbs', 'fat'];
      np.meals[+mi].foods[+fi][field] = numericFields.includes(field) ? (el.value ? Number(el.value) : null) : el.value;
      updateMacroPreview();
    };
  });
  document.querySelectorAll('[data-remove-meal]').forEach((el) => {
    el.onclick = () => { np.meals.splice(+el.dataset.removeMeal, 1); renderNutritionBody(subscriptionId, isCoach); };
  });
  document.querySelectorAll('[data-add-food]').forEach((el) => {
    el.onclick = () => { np.meals[+el.dataset.addFood].foods.push(newFood()); renderNutritionBody(subscriptionId, isCoach); };
  });
  document.querySelectorAll('[data-remove-food]').forEach((el) => {
    el.onclick = () => {
      const [mi, fi] = el.dataset.removeFood.split(':').map(Number);
      np.meals[mi].foods.splice(fi, 1);
      renderNutritionBody(subscriptionId, isCoach);
    };
  });
  on('addMeal', 'click', () => { np.meals.push(newMeal()); renderNutritionBody(subscriptionId, isCoach); });
  // لازم الحقول دي تتكتب في np مباشرة زي باقي الحقول، مش بس تحدّث المعاينة -
  // لأن أي زرار تاني (إضافة/حذف وجبة أو أكلة) بيعيد رسم الفورم كله من np،
  // وأي حاجة اتكتبت وملهاش مكان في np بتتمسح وقتها.
  const TARGET_FIELD_MAP = { dailyCalories: 'daily_calories', proteinTarget: 'protein_target', carbsTarget: 'carbs_target', fatTarget: 'fat_target' };
  Object.entries(TARGET_FIELD_MAP).forEach(([id, field]) => {
    on(id, 'input', () => { np[field] = document.getElementById(id).value; updateMacroPreview(); });
  });
  on('nutritionNotes', 'input', () => { np.notes = document.getElementById('nutritionNotes').value; });
  updateMacroPreview();

  on('saveNutrition', 'click', async () => {
    try {
      await api('/plans/' + subscriptionId + '/nutrition', { method: 'PUT', body: JSON.stringify({
        daily_calories: document.getElementById('dailyCalories').value,
        protein_target: document.getElementById('proteinTarget').value,
        carbs_target: document.getElementById('carbsTarget').value,
        fat_target: document.getElementById('fatTarget').value,
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
  const [{ entries }, { badges }, { pct: adherencePct }] = await Promise.all([
    api('/progress/' + subscriptionId),
    api('/badges/' + subscriptionId),
    api('/habits/' + subscriptionId + '/adherence'),
  ]);
  const weighed = entries.filter((e) => e.weight_kg != null);
  const weightChange = weighed.length >= 2 ? +(weighed[weighed.length - 1].weight_kg - weighed[0].weight_kg).toFixed(1) : null;

  render(`
    ${renderHubTabs(subscriptionId, 'progress')}
    ${adherencePct != null ? `
    <div class="card" style="text-align:center;">
      <h2>${t('progressOverviewTitle')}</h2>
      ${renderProgressRing(adherencePct)}
      <p class="small">${adherencePct >= 70 ? t('progressGoodMsg') : t('progressKeepGoingMsg')}</p>
      ${weightChange != null ? `
        <div class="stat-grid" style="grid-template-columns:1fr; max-width:180px; margin:14px auto 0;">
          <div class="stat-card">
            <div class="stat-value">${weightChange > 0 ? '+' : ''}${weightChange} ${t('kgUnit')}</div>
            <div class="small">${t('weightChangeLabel')}</div>
          </div>
        </div>
      ` : ''}
    </div>` : ''}
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
    <div class="card">
      <h2>${t('transformationsTitle')}</h2>
      <div id="transformBox"><div class="skeleton block"></div></div>
    </div>
  `);
  wireHubNav(subscriptionId, 'progress');
  loadAndRenderTransformations('transformBox', subscriptionId, isCoach);

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

// -------------------- التقييم الدوري (Check-ins) --------------------
// منفصل تمامًا عن progress_entries (تسجيل وزن سريع) وhabit_logs (عادات
// يومية) - ده فورم دوري أشمل بيراجعه الكوتش. فورم واحد مسطّح من غير أي
// إضافة/حذف صفوف بتعمل re-render أثناء الكتابة، فقراءة القيم من الـ DOM
// وقت الإرسال مباشرة كافية وآمنة (عكس بناء الخطط اللي فيها state بيتزامن).

const MEASUREMENT_KEYS = [
  ['waist', 'checkinWaistPlaceholder'],
  ['chest', 'checkinChestPlaceholder'],
  ['hips', 'checkinHipsPlaceholder'],
  ['arm', 'checkinArmPlaceholder'],
  ['thigh', 'checkinThighPlaceholder'],
];

function checkinStatusBadge(c) {
  return c.status === 'reviewed'
    ? `<span class="pill">${t('checkinStatusReviewed')}</span>`
    : `<span class="small">${t('checkinStatusSubmitted')}</span>`;
}

function renderCheckinCard(c, isCoach) {
  const date = new Date(c.created_at + 'Z').toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US');
  const measurementLine = MEASUREMENT_KEYS
    .filter(([key]) => c.measurements[key] != null)
    .map(([key, labelKey]) => `${t(labelKey)}: ${c.measurements[key]}`)
    .join(' · ');
  return `
    <div class="progress-entry" data-checkin-card="${c.id}">
      ${c.photo_path ? `<img src="/uploads/${encodeURIComponent(c.photo_path)}" class="progress-photo" alt="">` : ''}
      <div style="flex:1;">
        <div class="small">${date} ${checkinStatusBadge(c)}</div>
        ${c.weight_kg != null ? `<div>⚖️ ${c.weight_kg} ${t('kgUnit')}</div>` : ''}
        ${c.body_fat_pct != null ? `<div class="small">${t('checkinBodyFatPlaceholder')}: ${c.body_fat_pct}%</div>` : ''}
        ${measurementLine ? `<div class="small">${measurementLine}</div>` : ''}
        ${c.energy_level != null ? `<div class="small">${t('checkinEnergyLabel')}: ${t('energyLevel' + c.energy_level)}</div>` : ''}
        ${c.sleep_hours != null ? `<div class="small">${t('checkinSleepPlaceholder')}: ${c.sleep_hours}</div>` : ''}
        ${c.training_adherence_pct != null ? `<div class="small">${t('checkinTrainingAdherencePlaceholder')}: ${c.training_adherence_pct}%</div>` : ''}
        ${c.diet_adherence_pct != null ? `<div class="small">${t('checkinDietAdherencePlaceholder')}: ${c.diet_adherence_pct}%</div>` : ''}
        ${c.trainee_notes ? `<div class="small">${escapeHtml(c.trainee_notes)}</div>` : ''}
        ${c.coach_notes ? `<div class="small" style="margin-top:6px;"><b>${t('coachNotesLabel')}:</b> ${escapeHtml(c.coach_notes)}</div>` : ''}
        ${isCoach && c.status !== 'reviewed' ? `
          <div style="margin-top:8px;">
            <textarea data-review-notes="${c.id}" rows="2" placeholder="${t('addCoachNotePlaceholder')}"></textarea>
            <button data-review-submit="${c.id}" class="secondary" style="width:auto; padding:6px 10px;">${t('reviewCheckinBtn')}</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

async function renderCheckinsTab(subscriptionId) {
  const isCoach = state.user.role === 'coach';
  const { checkIns } = await api('/checkins/' + subscriptionId);

  render(`
    ${renderHubTabs(subscriptionId, 'checkins')}
    ${!isCoach ? `
    <div class="card">
      <h2>${t('newCheckinTitle')}</h2>
      <div class="error hidden" id="checkinErr"></div>
      <input id="ciWeight" type="number" step="0.1" placeholder="${t('checkinWeightPlaceholder')}">
      <input id="ciBodyFat" type="number" step="0.1" placeholder="${t('checkinBodyFatPlaceholder')}">
      <label class="small" style="display:block; margin:6px 0;">${t('checkinMeasurementsTitle')}</label>
      <div class="stat-grid" style="grid-template-columns:repeat(2,1fr); gap:8px;">
        ${MEASUREMENT_KEYS.map(([key, labelKey]) => `<input id="ciM_${key}" type="number" step="0.1" placeholder="${t(labelKey)}">`).join('')}
      </div>
      <label class="small" style="display:block; margin:10px 0 6px;">${t('checkinPhotoLabel')}</label>
      <input id="ciPhoto" type="file" accept="image/png,image/jpeg,image/webp" style="margin-bottom:10px;">
      <label class="small" style="display:block; margin-bottom:6px;">${t('checkinEnergyLabel')}</label>
      <select id="ciEnergy" style="margin-bottom:10px;">
        <option value="">-</option>
        ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${t('energyLevel' + n)}</option>`).join('')}
      </select>
      <input id="ciSleep" type="number" step="0.5" placeholder="${t('checkinSleepPlaceholder')}">
      <input id="ciTrainingAdherence" type="number" step="1" min="0" max="100" placeholder="${t('checkinTrainingAdherencePlaceholder')}">
      <input id="ciDietAdherence" type="number" step="1" min="0" max="100" placeholder="${t('checkinDietAdherencePlaceholder')}">
      <textarea id="ciNotes" rows="2" placeholder="${t('checkinNotesPlaceholder')}"></textarea>
      <button id="submitCheckin">${t('submitCheckinBtn')}</button>
    </div>` : ''}
    <div class="card">
      <h2>${t('checkinHistoryTitle')}</h2>
      ${checkIns.length === 0 ? `<p class="small">${t('noCheckinsYet')}</p>` : checkIns.map((c) => renderCheckinCard(c, isCoach)).join('')}
    </div>
  `);
  wireHubNav(subscriptionId, 'checkins');

  on('submitCheckin', 'click', async () => {
    const fd = new FormData();
    const weight = document.getElementById('ciWeight').value;
    const bodyFat = document.getElementById('ciBodyFat').value;
    const photo = document.getElementById('ciPhoto').files[0];
    const energy = document.getElementById('ciEnergy').value;
    const sleep = document.getElementById('ciSleep').value;
    const trainingAdherence = document.getElementById('ciTrainingAdherence').value;
    const dietAdherence = document.getElementById('ciDietAdherence').value;
    const notes = document.getElementById('ciNotes').value;
    const measurements = {};
    MEASUREMENT_KEYS.forEach(([key]) => { measurements[key] = document.getElementById('ciM_' + key).value || null; });

    if (weight) fd.append('weight_kg', weight);
    if (bodyFat) fd.append('body_fat_pct', bodyFat);
    fd.append('measurements', JSON.stringify(measurements));
    if (photo) fd.append('photo', photo);
    if (energy) fd.append('energy_level', energy);
    if (sleep) fd.append('sleep_hours', sleep);
    if (trainingAdherence) fd.append('training_adherence_pct', trainingAdherence);
    if (dietAdherence) fd.append('diet_adherence_pct', dietAdherence);
    if (notes) fd.append('trainee_notes', notes);

    try {
      await apiUpload('/checkins/' + subscriptionId, fd);
      renderCheckinsTab(subscriptionId);
    } catch (e) {
      const el = document.getElementById('checkinErr');
      el.textContent = e.message; el.classList.remove('hidden');
    }
  });

  document.querySelectorAll('[data-review-submit]').forEach((el) => {
    el.onclick = async () => {
      const id = el.dataset.reviewSubmit;
      const notes = document.querySelector(`[data-review-notes="${id}"]`).value;
      try {
        await api('/checkins/' + subscriptionId + '/' + id + '/review', { method: 'POST', body: JSON.stringify({ coach_notes: notes }) });
        renderCheckinsTab(subscriptionId);
      } catch (e) { alert(e.message); }
    };
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
        <button id="reportReview" data-review-id="${review.id}" class="secondary" style="width:auto; padding:6px 10px; margin-top:8px;">${t('reportReviewBtn')}</button>
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
  on('reportReview', 'click', async () => {
    const reviewId = document.getElementById('reportReview').dataset.reviewId;
    const reason = prompt(t('reportReviewPrompt'));
    if (reason === null) return;
    try {
      await api('/reviews/' + reviewId + '/report', { method: 'POST', body: JSON.stringify({ reason }) });
      alert(t('reportReviewSentAlert'));
    } catch (e) { alert(e.message); }
  });
}

let sessionsSubTab = 'upcoming';

function dateGroupLabel(dt) {
  const d = new Date(dt);
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(d) - startOf(now)) / 86400000);
  if (diffDays === 0) return t('todayGroupLabel');
  if (diffDays === 1) return t('tomorrowGroupLabel');
  return d.toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
}

function renderSessionRow(s, isCoach, showActions) {
  const timeStr = new Date(s.scheduled_at).toLocaleTimeString(getLang() === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' });
  return `
    <div class="coach-row">
      <div>
        <div style="font-weight:700; font-size:13px;">${timeStr}</div>
        ${s.notes ? `<div class="small">${escapeHtml(s.notes)}</div>` : ''}
      </div>
      ${showActions ? `
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${isCoach ? `<button class="secondary" data-complete="${s.id}" style="width:auto; padding:6px 10px;">${t('markCompletedBtn')}</button>` : ''}
          ${isCoach ? `<button class="secondary" data-noshow="${s.id}" style="width:auto; padding:6px 10px;">${t('markNoShowBtn')}</button>` : ''}
          <button class="secondary" data-cancel="${s.id}" style="width:auto; padding:6px 10px;">${t('cancelSessionBtn')}</button>
        </div>
      ` : `<span class="pill">${{ completed: t('statusCompleted'), cancelled: t('statusCancelled'), no_show: t('statusNoShow') }[s.status] || ''}</span>`}
    </div>
  `;
}

async function renderSessionsTab(subscriptionId) {
  const isCoach = state.user.role === 'coach';
  const [{ sessions }, subDetail] = await Promise.all([
    api('/sessions/' + subscriptionId),
    isCoach ? Promise.resolve(null) : api('/subscriptions/' + subscriptionId),
  ]);
  const coachId = subDetail?.subscription?.coach_id;
  const now = Date.now();
  const isFutureScheduled = (s) => s.status === 'scheduled' && new Date(s.scheduled_at).getTime() > now;
  const upcoming = sessions.filter(isFutureScheduled);
  const past = sessions.filter((s) => s.status === 'completed' || s.status === 'no_show' || (s.status === 'scheduled' && !isFutureScheduled(s)));
  const cancelled = sessions.filter((s) => s.status === 'cancelled');
  const groups = { upcoming, past, cancelled };

  const hasCompletedSession = sessions.some((s) => s.status === 'completed');
  const reviewCardHtml = await renderReviewCard(subscriptionId, isCoach, hasCompletedSession);

  function renderList() {
    const list = groups[sessionsSubTab];
    if (list.length === 0) return renderEmptyState('📅', t('noSessionsYet'), '');
    if (sessionsSubTab !== 'upcoming') return `<div class="card">${list.map((s) => renderSessionRow(s, isCoach, false)).join('')}</div>`;

    let html = '';
    let lastLabel = null;
    for (const s of list) {
      const label = dateGroupLabel(s.scheduled_at);
      if (label !== lastLabel) { html += `<div class="date-group-label">${label}</div>`; lastLabel = label; }
      html += `<div class="card" style="margin-bottom:8px;">${renderSessionRow(s, isCoach, true)}</div>`;
    }
    return html;
  }

  render(`
    ${renderHubTabs(subscriptionId, 'sessions')}
    ${!isCoach ? `
    <div class="card">
      <h2>${t('bookSessionBtn')}</h2>
      <div class="error hidden" id="sessionErr"></div>
      <label class="small" style="display:block; margin-bottom:6px;">${t('pickDateLabel')}</label>
      <input id="sessionDateOnly" type="date">
      <div id="slotPickerBox" style="margin-top:8px;"></div>
      <input id="sessionNotes" placeholder="${t('sessionNotesPlaceholder')}" style="margin-top:8px;">
      <button id="bookBtn" style="margin-top:8px;">${t('bookSessionBtn')}</button>
    </div>` : ''}
    <div class="tabs">
      <div class="tab ${sessionsSubTab === 'upcoming' ? 'active' : ''}" data-stab="upcoming">${t('upcomingSessionsTitle')}</div>
      <div class="tab ${sessionsSubTab === 'past' ? 'active' : ''}" data-stab="past">${t('pastSessionsTitle')}</div>
      <div class="tab ${sessionsSubTab === 'cancelled' ? 'active' : ''}" data-stab="cancelled">${t('statusCancelled')}</div>
    </div>
    <div id="sessionsList">${renderList()}</div>
    ${reviewCardHtml}
  `);
  wireHubNav(subscriptionId, 'sessions');
  wireReviewCard(subscriptionId, isCoach);

  document.querySelectorAll('[data-stab]').forEach((el) => {
    el.onclick = () => { sessionsSubTab = el.dataset.stab; renderSessionsTab(subscriptionId); };
  });

  if (!isCoach && coachId) {
    async function loadSlots() {
      const dateVal = document.getElementById('sessionDateOnly').value;
      const box = document.getElementById('slotPickerBox');
      if (!dateVal) { box.innerHTML = ''; return; }
      box.innerHTML = `<p class="small">${t('loadingSlots')}</p>`;
      try {
        const { hasSchedule, slots } = await api('/availability/' + coachId + '/slots?date=' + encodeURIComponent(dateVal));
        if (!hasSchedule) {
          box.innerHTML = `<input id="sessionTimeOnly" type="time">`;
        } else if (slots.length === 0) {
          box.innerHTML = `<p class="small">${t('noSlotsAvailable')}</p>`;
        } else {
          box.innerHTML = `
            <label class="small" style="display:block; margin-bottom:6px;">${t('selectSlotLabel')}</label>
            <select id="slotSelect">${slots.map((s) => `<option value="${s}">${s}</option>`).join('')}</select>
          `;
        }
      } catch (e) {
        box.innerHTML = '';
      }
    }
    on('sessionDateOnly', 'change', loadSlots);

    on('bookBtn', 'click', async () => {
      const date = document.getElementById('sessionDateOnly').value;
      const timeEl = document.getElementById('slotSelect') || document.getElementById('sessionTimeOnly');
      const time = timeEl ? timeEl.value : '';
      if (!date || !time) return;
      try {
        await api('/sessions/' + subscriptionId, { method: 'POST', body: JSON.stringify({
          date, time,
          notes: document.getElementById('sessionNotes').value,
        })});
        renderSessionsTab(subscriptionId);
      } catch (e) {
        const el = document.getElementById('sessionErr');
        el.textContent = e.message; el.classList.remove('hidden');
      }
    });
  }
  document.querySelectorAll('[data-complete]').forEach((el) => {
    el.onclick = async () => {
      await api('/sessions/' + subscriptionId + '/' + el.dataset.complete + '/status', { method: 'POST', body: JSON.stringify({ status: 'completed' }) });
      renderSessionsTab(subscriptionId);
    };
  });
  document.querySelectorAll('[data-noshow]').forEach((el) => {
    el.onclick = async () => {
      await api('/sessions/' + subscriptionId + '/' + el.dataset.noshow + '/status', { method: 'POST', body: JSON.stringify({ status: 'no_show' }) });
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
