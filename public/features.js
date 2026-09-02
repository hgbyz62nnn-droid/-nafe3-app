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
      ${upcoming.length === 0 && past.length === 0 ? renderEmptyState(svgIconPro('calendar', 30), t('emptyBookingsTitle'), t('emptyBookingsHint')) : `
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
      ? renderEmptyState(svgIconPro('message', 30), t('emptyMessagesTitle'), t('emptyMessagesHint'))
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
      <label class="avatar-edit-badge" for="avatarFileInput">${svgIconPro('edit', 13)}</label>
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
      ${menuRow({ icon: svgIconPro('document', 18), label: t('assessmentMenuItem'), id: 'menuAssessmentTemplate' })}
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
  on('menuAssessmentTemplate', 'click', renderAssessmentTemplateBuilder);
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
      ${tickets.length === 0 ? renderEmptyState(svgIcon('message', 30), t('noTicketsYet'), '') : tickets.map((tk) => `
        <div class="coach-row" data-open-ticket="${tk.id}" style="gap:10px;">
          <div style="flex:1; min-width:0;">${escapeHtml(tk.subject)}
            <div class="small">${t(TICKET_CATEGORY_KEYS[tk.category])} · ${new Date(tk.created_at + 'Z').toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US')}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
            ${tk.unread ? '<span class="badge-dot" style="position:static;"></span>' : ''}
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
            <button class="secondary" data-remove-blocked="${b.id}" style="width:auto; padding:6px 10px;">${svgIconPro('close', 14)}</button>
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
          <button class="secondary" data-remove-window="${i}" style="width:auto; padding:6px 10px;">${svgIconPro('close', 14)}</button>
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
        <div style="font-weight:800; font-size:13.5px;">${escapeHtml(c.name)} ${c.verified ? `<span class="verified-badge">${svgIconPro('verified', 13)} ${t('verifiedLabel')}</span>` : ''}</div>
        <div class="small">${escapeHtml(c.specialty) || t('coachSpecialtyFallback')}</div>
        <div class="small">
          ${c.avg_rating ? `${ratingBadge(c.avg_rating)} ${t('reviewsCountLabel', { count: c.review_count })}` : t('noReviewsYet')}
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
      <h2 style="margin-bottom:2px;">${escapeHtml(coach.name)} ${coach.verified ? `<span class="verified-badge">${svgIconPro('verified', 13)} ${t('verifiedLabel')}</span>` : ''}</h2>
      <p class="small">${escapeHtml(coach.specialty) || t('coachSpecialtyFallback')}</p>
      <p class="small" style="margin-top:4px;">${coach.avg_rating ? `${ratingBadge(coach.avg_rating)} ${t('reviewsCountLabel', { count: coach.review_count })}` : t('noReviewsYet')}</p>
      ${coach.location ? `<p class="small" style="margin-top:4px; display:flex; align-items:center; gap:5px;">${svgIconPro('location', 13)}${escapeHtml(coach.location)}</p>` : ''}
      ${coach.bio ? `<p style="font-size:13px; line-height:1.8; margin-top:10px;">${escapeHtml(coach.bio)}</p>` : ''}
      ${coach.certification ? `<div style="margin-top:10px;"><span class="filter-chip active" style="cursor:default; display:inline-flex; align-items:center; gap:5px;">${svgIconPro('verified', 13)}${escapeHtml(coach.certification)}</span></div>` : ''}
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
          <div style="font-weight:700; font-size:13px;">${escapeHtml(p.coach_name)} ${p.coach_verified ? `<span class="verified-badge">${svgIconPro('verified', 13)} ${t('verifiedLabel')}</span>` : ''}</div>
          <div class="small">${escapeHtml(p.coach_specialty) || t('coachSpecialtyFallback')}</div>
        </div>
        <span class="pill">${t(POST_CATEGORY_LABELS[p.category] || 'catTip')}</span>
      </div>
      ${p.photo_path ? `<img src="/uploads/${encodeURIComponent(p.photo_path)}" style="width:100%; border-radius:10px; margin:10px 0; display:block;" alt="">` : ''}
      <p style="font-size:13.5px; line-height:1.8; margin:10px 0;">${escapeHtml(p.content)}</p>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button class="secondary" data-like="${p.id}" data-liked="${p.is_liked ? '1' : '0'}" style="width:auto; padding:6px 12px; display:inline-flex; align-items:center; gap:5px;">${favoriteHeartIcon(!!p.is_liked)} ${p.like_count}</button>
        <button class="secondary" data-save="${p.id}" data-saved="${p.is_saved ? '1' : '0'}" style="width:auto; padding:6px 12px; display:inline-flex; align-items:center; gap:5px;">${bookmarkIcon(!!p.is_saved)} ${p.save_count}</button>
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
        <div class="small" style="display:flex; align-items:center; gap:10px;"><span style="display:inline-flex; align-items:center; gap:4px;">${favoriteHeartIcon(true)} ${p.like_count}</span><span style="display:inline-flex; align-items:center; gap:4px;">${bookmarkIcon(true)} ${p.save_count}</span></div>
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
    ? renderEmptyState(svgIconPro('fitness', 30), t('noTransformationsYet'), '')
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

// -------------------- مكتبة التمارين --------------------

const MUSCLE_GROUP_LABELS = {
  chest: 'muscleGroupChest', back: 'muscleGroupBack', legs: 'muscleGroupLegs',
  shoulders: 'muscleGroupShoulders', arms: 'muscleGroupArms', core: 'muscleGroupCore', cardio: 'muscleGroupCardio',
};
const EQUIPMENT_LABELS = {
  barbell: 'equipmentBarbell', dumbbell: 'equipmentDumbbell', machine: 'equipmentMachine',
  cable: 'equipmentCable', bodyweight: 'equipmentBodyweight', bands: 'equipmentBands', kettlebell: 'equipmentKettlebell',
};
const EXERCISE_KIND_LABELS = { compound: 'exKindCompound', isolation: 'exKindIsolation', unilateral: 'exKindUnilateral', bilateral: 'exKindBilateral' };
const MOVEMENT_PATTERN_LABELS = {
  push: 'movePush', pull: 'movePull', squat: 'moveSquat', hinge: 'moveHinge', lunge: 'moveLunge',
  carry: 'moveCarry', rotation: 'moveRotation', anti_rotation: 'moveAntiRotation', flexion: 'moveFlexion', extension: 'moveExtension',
};

function exerciseTagLine(ex) {
  const parts = [];
  if (ex.muscle_group) parts.push(t(MUSCLE_GROUP_LABELS[ex.muscle_group]));
  if (ex.equipment) parts.push(t(EQUIPMENT_LABELS[ex.equipment]));
  if (ex.difficulty) parts.push(t(EXPERIENCE_LABELS[ex.difficulty]));
  return parts.join(' · ');
}

// بديل موحّد لأيقونة القلب ♥/♡ اللي كانت نص عادي (مش من نظام الأيقونات) -
// نفس شكل القلب من TRAINO_PRO_Icon_System، بس متملي ومتلوّن وقت المفضلة.
function favoriteHeartIcon(isFav) {
  const raw = svgIconPro('heart', 16, isFav ? 'color:var(--red-soft);' : '');
  return isFav ? raw.replace('fill="none"', 'fill="currentColor"') : raw;
}

// نفس فكرة favoriteHeartIcon - بديل موحّد لأيقونة الحفظ 🔖/📑 اللي كانت
// إيموجي، ببكماركة من نظام TRAINO_PRO_Icon_System متملية وقت الحفظ.
function bookmarkIcon(isSaved) {
  const raw = svgIconPro('bookmark', 16, isSaved ? 'color:var(--red-soft);' : '');
  return isSaved ? raw.replace('fill="none"', 'fill="currentColor"') : raw;
}

// بديل موحّد لنجوم التقييم ★/☆ اللي كانت نص عادي مكرر - نفس فكرة القلب:
// نجمة SVG واحدة من نظام TRAINO_PRO، متملية للنجوم المكتسبة وشفافة للباقي.
function starRating(rating, size) {
  const r = Math.round(Number(rating) || 0);
  const s = size || 13;
  const filled = svgIconPro('star', s, 'color:#FFC94D;').replace('fill="none"', 'fill="currentColor"');
  const empty = svgIconPro('star', s, 'color:#FFC94D; opacity:.35;');
  let html = '';
  for (let i = 0; i < 5; i++) html += i < r ? filled : empty;
  return `<span style="display:inline-flex; align-items:center; gap:1px;">${html}</span>`;
}

// شارة مضغوطة (نجمة واحدة + الرقم) للاستخدام جوه سطر نصي زي كارت المدرب.
function ratingBadge(value) {
  const star = svgIconPro('star', 12, 'color:#FFC94D;').replace('fill="none"', 'fill="currentColor"');
  return `<span class="rating" style="display:inline-flex; align-items:center; gap:3px;">${star}${escapeHtml(String(value))}</span>`;
}

function secondaryMusclesText(raw) {
  let list = [];
  try { list = Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list) || !list.length) return '-';
  return list.map((k) => MUSCLE_GROUP_LABELS[k] ? t(MUSCLE_GROUP_LABELS[k]) : k).join('، ');
}

// شاشة تفاصيل التمرين (Exercise Detail) - بتتفتح من صف في المكتبة، وبتوفر
// نفس زرار الاختيار اللي كان في الصف نفسه عشان المستخدم يقدر يضيف التمرين
// من هنا كمان من غير ما يرجع للقايمة.
async function openExerciseDetail(exerciseId, onSelect) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  root.innerHTML = `<div class="modal-box"><div class="skeleton block"></div></div>`;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });

  let ex;
  try {
    ({ exercise: ex } = await api('/exercises/' + exerciseId));
  } catch (e) { closeModal(); return; }
  if (!document.getElementById('modalRoot')) return;

  document.querySelector('#modalRoot .modal-box').innerHTML = `
    <h2>${escapeHtml(ex.name)}</h2>
    ${ex.video_url ? `<a class="link" href="${escapeHtml(ex.video_url)}" target="_blank" rel="noopener">${svgIconPro('play', 16)} ${t('videoUrlPlaceholder')}</a>` : ''}
    <div class="coach-row"><div>${t('primaryMuscleLabel')}</div><div class="small">${ex.muscle_group ? t(MUSCLE_GROUP_LABELS[ex.muscle_group]) : '-'}</div></div>
    <div class="coach-row"><div>${t('secondaryMusclesLabel')}</div><div class="small">${secondaryMusclesText(ex.secondary_muscles)}</div></div>
    <div class="coach-row"><div>${t('equipmentLabel')}</div><div class="small">${ex.equipment ? t(EQUIPMENT_LABELS[ex.equipment]) : '-'}</div></div>
    <div class="coach-row"><div>${t('difficultyLabel')}</div><div class="small">${ex.difficulty ? t(EXPERIENCE_LABELS[ex.difficulty]) : '-'}</div></div>
    <div class="coach-row"><div>${t('exerciseKindLabel')}</div><div class="small">${ex.exercise_type ? t(EXERCISE_KIND_LABELS[ex.exercise_type]) : '-'}</div></div>
    <div class="coach-row"><div>${t('movementPatternLabel')}</div><div class="small">${ex.movement_pattern ? t(MOVEMENT_PATTERN_LABELS[ex.movement_pattern]) : '-'}</div></div>
    <h2 style="margin-top:12px;">${t('instructionsLabel')}</h2>
    <p class="small">${ex.instructions ? escapeHtml(ex.instructions) : t('noInstructionsYet')}</p>
    ${onSelect ? `<button id="exDetailSelect" style="margin-top:10px;">${t('selectExerciseBtn')}</button>` : ''}
    <button class="secondary" id="closeModal" style="margin-top:8px;">${t('closeBtn2')}</button>
  `;
  document.getElementById('closeModal').onclick = closeModal;
  if (onSelect) {
    document.getElementById('exDetailSelect').onclick = () => { closeModal(); onSelect(ex); };
  }
}

// swapOptions لو موجودة بتحوّل المودال لوضع "تبديل تمرين": بتستبعد
// التمرين الحالي من النتايج وبتبدأ مفلترة على نفس العضلة/المعدات بتاعته،
// زي ما طلبت المواصفة (Part 8 - Swap Exercise يطابق بالعضلة/المعدات..).
function openExerciseLibrary(onSelect, swapOptions) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  const libState = {
    scope: 'all', search: '', difficulty: '',
    muscleGroup: swapOptions?.muscleGroup || '', equipment: swapOptions?.equipment || '',
    exerciseType: '', movementPattern: '', excludeId: swapOptions?.excludeId || null,
  };

  root.innerHTML = `
    <div class="modal-box">
      <h2>${swapOptions ? t('swapExerciseBtn') : t('exerciseLibraryTitle')}</h2>
      <input id="exLibSearch" placeholder="${t('searchExercisesPlaceholder')}">
      <div class="chip-row" id="exLibTabs" style="margin:8px 0;">
        <span class="filter-chip active" data-scope="all">${t('allExercisesTab')}</span>
        <span class="filter-chip" data-scope="favorites">${t('favoritesTab')}</span>
        <span class="filter-chip" data-scope="mine">${t('myExercisesTab')}</span>
      </div>
      <div style="display:flex; gap:6px; margin-bottom:6px;">
        <select id="exLibMuscle" style="flex:1;">
          <option value="">${t('anyMuscleGroupOption')}</option>
          ${Object.entries(MUSCLE_GROUP_LABELS).map(([k, l]) => `<option value="${k}" ${libState.muscleGroup === k ? 'selected' : ''}>${t(l)}</option>`).join('')}
        </select>
        <select id="exLibEquipment" style="flex:1;">
          <option value="">${t('anyEquipmentOption')}</option>
          ${Object.entries(EQUIPMENT_LABELS).map(([k, l]) => `<option value="${k}" ${libState.equipment === k ? 'selected' : ''}>${t(l)}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex; gap:6px; margin-bottom:10px;">
        <select id="exLibKind" style="flex:1;">
          <option value="">${t('anyExerciseKindOption')}</option>
          ${Object.entries(EXERCISE_KIND_LABELS).map(([k, l]) => `<option value="${k}">${t(l)}</option>`).join('')}
        </select>
        <select id="exLibPattern" style="flex:1;">
          <option value="">${t('anyMovementPatternOption')}</option>
          ${Object.entries(MOVEMENT_PATTERN_LABELS).map(([k, l]) => `<option value="${k}">${t(l)}</option>`).join('')}
        </select>
      </div>
      <button class="secondary" id="exLibAddCustomToggle" style="margin-bottom:10px;">${t('addCustomExerciseBtn')}</button>
      <div id="exLibCustomForm" class="hidden" style="margin-bottom:12px;">
        <input id="exLibNewName" placeholder="${t('customExerciseNamePlaceholder')}">
        <div style="display:flex; gap:6px;">
          <select id="exLibNewMuscle" style="flex:1;">
            <option value="">${t('anyMuscleGroupOption')}</option>
            ${Object.entries(MUSCLE_GROUP_LABELS).map(([k, l]) => `<option value="${k}">${t(l)}</option>`).join('')}
          </select>
          <select id="exLibNewEquipment" style="flex:1;">
            <option value="">${t('anyEquipmentOption')}</option>
            ${Object.entries(EQUIPMENT_LABELS).map(([k, l]) => `<option value="${k}">${t(l)}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex; gap:6px;">
          <select id="exLibNewKind" style="flex:1;">
            <option value="">${t('anyExerciseKindOption')}</option>
            ${Object.entries(EXERCISE_KIND_LABELS).map(([k, l]) => `<option value="${k}">${t(l)}</option>`).join('')}
          </select>
          <select id="exLibNewPattern" style="flex:1;">
            <option value="">${t('anyMovementPatternOption')}</option>
            ${Object.entries(MOVEMENT_PATTERN_LABELS).map(([k, l]) => `<option value="${k}">${t(l)}</option>`).join('')}
          </select>
        </div>
        <textarea id="exLibNewInstructions" rows="2" placeholder="${t('instructionsPlaceholder')}"></textarea>
        <div class="small" style="margin:6px 0 4px;">${t('secondaryMusclesLabel')}</div>
        <div class="chip-row" id="exLibNewSecondary" style="margin-bottom:10px;">
          ${Object.entries(MUSCLE_GROUP_LABELS).map(([k, l]) => `<span class="filter-chip" data-secondary-muscle="${k}">${t(l)}</span>`).join('')}
        </div>
        <button id="exLibSaveCustom">${t('saveCustomExerciseBtn')}</button>
      </div>
      <div id="exLibList"><div class="skeleton block"></div></div>
      <button class="secondary" id="closeModal" style="margin-top:10px;">${t('closeBtn2')}</button>
    </div>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });
  document.getElementById('closeModal').onclick = closeModal;

  document.getElementById('exLibAddCustomToggle').onclick = () => {
    document.getElementById('exLibCustomForm').classList.toggle('hidden');
  };
  document.querySelectorAll('#exLibNewSecondary [data-secondary-muscle]').forEach((chip) => {
    chip.onclick = () => chip.classList.toggle('active');
  });
  document.getElementById('exLibSaveCustom').onclick = async () => {
    const name = document.getElementById('exLibNewName').value.trim();
    if (!name) return;
    const secondaryMuscles = Array.from(document.querySelectorAll('#exLibNewSecondary [data-secondary-muscle].active'))
      .map((c) => c.dataset.secondaryMuscle);
    try {
      await api('/exercises', { method: 'POST', body: JSON.stringify({
        name,
        muscleGroup: document.getElementById('exLibNewMuscle').value || null,
        equipment: document.getElementById('exLibNewEquipment').value || null,
        exerciseType: document.getElementById('exLibNewKind').value || null,
        movementPattern: document.getElementById('exLibNewPattern').value || null,
        instructions: document.getElementById('exLibNewInstructions').value || null,
        secondaryMuscles,
      }) });
      document.getElementById('exLibNewName').value = '';
      document.getElementById('exLibNewInstructions').value = '';
      document.querySelectorAll('#exLibNewSecondary [data-secondary-muscle]').forEach((c) => c.classList.remove('active'));
      document.getElementById('exLibCustomForm').classList.add('hidden');
      libState.scope = 'mine';
      document.querySelectorAll('#exLibTabs .filter-chip').forEach((c) => c.classList.toggle('active', c.dataset.scope === 'mine'));
      loadList();
    } catch (e) { alert(e.message); }
  };

  document.querySelectorAll('#exLibTabs .filter-chip').forEach((chip) => {
    chip.onclick = () => {
      document.querySelectorAll('#exLibTabs .filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      libState.scope = chip.dataset.scope;
      loadList();
    };
  });
  document.getElementById('exLibSearch').oninput = (e) => { libState.search = e.target.value; loadList(); };
  document.getElementById('exLibMuscle').onchange = (e) => { libState.muscleGroup = e.target.value; loadList(); };
  document.getElementById('exLibEquipment').onchange = (e) => { libState.equipment = e.target.value; loadList(); };
  document.getElementById('exLibKind').onchange = (e) => { libState.exerciseType = e.target.value; loadList(); };
  document.getElementById('exLibPattern').onchange = (e) => { libState.movementPattern = e.target.value; loadList(); };

  async function loadList() {
    const listBox = document.getElementById('exLibList');
    if (!listBox) return;
    listBox.innerHTML = `<div class="skeleton block"></div>`;
    const qs = new URLSearchParams();
    qs.set('scope', libState.scope);
    if (libState.search) qs.set('search', libState.search);
    if (libState.muscleGroup) qs.set('muscleGroup', libState.muscleGroup);
    if (libState.equipment) qs.set('equipment', libState.equipment);
    if (libState.exerciseType) qs.set('exerciseType', libState.exerciseType);
    if (libState.movementPattern) qs.set('movementPattern', libState.movementPattern);
    if (libState.excludeId) qs.set('excludeId', libState.excludeId);
    let exercises;
    try {
      ({ exercises } = await api('/exercises?' + qs.toString()));
    } catch (e) { return; }
    if (!document.getElementById('exLibList')) return;
    if (!exercises.length) {
      listBox.innerHTML = `<p class="small">${swapOptions ? t('noRelatedExercisesFound') : t('noExercisesFoundMsg')}</p>`;
      return;
    }
    listBox.innerHTML = exercises.map((ex) => `
      <div class="coach-row" style="gap:8px;" data-ex-id="${ex.id}">
        <div style="flex:1; min-width:0;">
          <div>${escapeHtml(ex.name)}</div>
          <div class="small">${escapeHtml(exerciseTagLine(ex))}</div>
        </div>
        <button class="secondary" data-detail-ex="${ex.id}" style="width:auto; padding:6px 10px;">${t('viewDetailBtn')}</button>
        <button class="secondary" data-fav-ex="${ex.id}" data-fav-state="${ex.is_favorite}" style="width:auto; padding:6px 10px;">${favoriteHeartIcon(!!ex.is_favorite)}</button>
        ${ex.coach_id ? `<button class="secondary" data-del-ex="${ex.id}" style="width:auto; padding:6px 10px;">${svgIconPro('close', 14)}</button>` : ''}
        <button data-select-ex="${ex.id}" style="width:auto; padding:6px 10px;">${t('selectExerciseBtn')}</button>
      </div>
    `).join('');

    listBox.querySelectorAll('[data-select-ex]').forEach((btn) => {
      btn.onclick = () => {
        const ex = exercises.find((x) => x.id === Number(btn.dataset.selectEx));
        closeModal();
        onSelect(ex);
      };
    });
    listBox.querySelectorAll('[data-detail-ex]').forEach((btn) => {
      btn.onclick = () => {
        const ex = exercises.find((x) => x.id === Number(btn.dataset.detailEx));
        openExerciseDetail(ex.id, (chosen) => onSelect(chosen));
      };
    });
    listBox.querySelectorAll('[data-fav-ex]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.favEx;
        const isFav = btn.dataset.favState === '1';
        try {
          await api('/exercises/' + id + '/favorite', { method: isFav ? 'DELETE' : 'POST' });
          loadList();
        } catch (e) { alert(e.message); }
      };
    });
    listBox.querySelectorAll('[data-del-ex]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm(t('removeBtn') + '?')) return;
        try {
          await api('/exercises/' + btn.dataset.delEx, { method: 'DELETE' });
          loadList();
        } catch (e) { alert(e.message); }
      };
    });
  }

  loadList();
}

function renderCoachCard(c) {
  return `
    <div class="card" data-open-coach="${c.id}" style="cursor:pointer; display:flex; gap:12px; align-items:center;">
      ${avatarCircle(c.name, c.avatar_path)}
      <div style="flex:1; min-width:0;">
        <div style="font-weight:800; font-size:13.5px;">${escapeHtml(c.name)} ${c.verified ? `<span class="verified-badge">${svgIconPro('verified', 13)} ${t('verifiedLabel')}</span>` : ''}</div>
        <div class="small">${escapeHtml(c.specialty) || t('coachSpecialtyFallback')}</div>
        <div class="small">
          ${c.avg_rating ? `${ratingBadge(c.avg_rating)} ${t('reviewsCountLabel', { count: c.review_count })}` : t('noReviewsYet')}
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
      <button class="secondary" id="openFilterScreen" style="width:auto; padding:11px 14px; position:relative; display:inline-flex; align-items:center;">
        ${svgIconPro('filter', 18)}${filterCount ? `<span class="badge-dot" style="position:static; display:inline-flex; margin-inline-start:4px; border:none;">${filterCount}</span>` : ''}
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
      ? renderEmptyState(svgIconPro('search', 30), t('emptyDiscoverTitle'), t('emptyDiscoverHint'))
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
    ${matches.length === 0 ? renderEmptyState(svgIconPro('target', 30), t('noMatchesFound'), '') : matches.map(renderCoachCard).join('')}
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
      <span class="filter-chip ${draft.minRating === '4' ? 'active' : ''}" data-rating="4" style="display:inline-flex; align-items:center; gap:4px;">${svgIconPro('star', 11)}4+</span>
      <span class="filter-chip ${draft.minRating === '4.5' ? 'active' : ''}" data-rating="4.5" style="display:inline-flex; align-items:center; gap:4px;">${svgIconPro('star', 11)}4.5+</span>
      <span class="filter-chip ${draft.minRating === '5' ? 'active' : ''}" data-rating="5" style="display:inline-flex; align-items:center; gap:4px;">${svgIconPro('star', 11)}5</span>
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
      ? renderEmptyState(svgIconPro('client', 30), emptyMsg, '')
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
  ['assessment', 'navAssessment'],
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

  // السبعة تابات مش بتتلم كلها في عرض شاشة الموبايل، فلازم نلف بالتاب
  // النشط لمنتصف الصف كل ما نفتحه - وإلا ممكن يفضل مقطوع على حافة
  // الشاشة (زي "التقييم الدوري") من غير ما المستخدم يعرف إنه موجود أصلًا.
  const activeTabEl = document.querySelector(`.subtabs [data-subtab="${active}"]`);
  if (activeTabEl) activeTabEl.scrollIntoView({ inline: 'center', block: 'nearest' });

  document.getElementById('back').onclick = () => { clearInterval(state.chatTimer); boot(); };
  document.querySelectorAll('[data-subtab]').forEach((el) => {
    el.onclick = () => {
      const key = el.dataset.subtab;
      if (key === active) return;
      clearInterval(state.chatTimer);
      if (key === 'chat') renderChat(subscriptionId);
      else if (key === 'assessment') renderAssessmentTab(subscriptionId);
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
                <div class="badge-icon">${svgIconPro(b.icon, 24)}</div>
                <div class="badge-label">${escapeHtml(label)}</div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

// -------------------- نظام التقييم (Assessment) --------------------

const ASSESSMENT_SECTIONS = ['general_info', 'training_background', 'health_medical', 'lifestyle', 'goals', 'measurements', 'notes'];
const SECTION_LABEL_KEYS = {
  general_info: 'sectionGeneralInfo', training_background: 'sectionTrainingBackground', health_medical: 'sectionHealthMedical',
  lifestyle: 'sectionLifestyle', goals: 'sectionGoals', measurements: 'sectionMeasurements', notes: 'sectionNotes',
};
const QUESTION_TYPES = ['single_choice', 'multiple_choice', 'yes_no', 'number', 'short_text', 'long_text', 'date', 'measurement', 'image_upload'];
const TYPE_LABEL_KEYS = {
  single_choice: 'qTypeSingleChoice', multiple_choice: 'qTypeMultipleChoice', yes_no: 'qTypeYesNo', number: 'qTypeNumber',
  short_text: 'qTypeShortText', long_text: 'qTypeLongText', date: 'qTypeDate', measurement: 'qTypeMeasurement', image_upload: 'qTypeImageUpload',
};

// أسئلة الإضافة السريعة منقولة حرفيًا من قسم "ASSESSMENT QUICK-CHOICE
// DESIGN" في المواصفة - مش اختراع خيارات جديدة، لو الكوتش ضغط عليها
// بتتضاف بالظبط زي ما هي (بالعربي أو الإنجليزي حسب لغة الواجهة الحالية).
const PRESET_QUESTIONS = [
  { key: 'presetPrimaryGoal', section: 'goals', type: 'single_choice',
    ar: { label: 'الهدف الأساسي', options: ['خسارة دهون', 'بناء عضلات', 'إعادة تكوين الجسم', 'زيادة القوة', 'التحمل', 'لياقة عامة', 'أداء رياضي'] },
    en: { label: 'Primary Goal', options: ['Fat Loss', 'Muscle Gain', 'Body Recomposition', 'Strength', 'Endurance', 'General Fitness', 'Sports Performance'] } },
  { key: 'presetExperience', section: 'training_background', type: 'single_choice',
    ar: { label: 'مستوى الخبرة', options: ['مبتدئ', 'مبتدئ متقدم', 'متوسط', 'متقدم'] },
    en: { label: 'Experience', options: ['Beginner', 'Novice', 'Intermediate', 'Advanced'] } },
  { key: 'presetTrainingDays', section: 'training_background', type: 'single_choice',
    ar: { label: 'أيام التدريب أسبوعيًا', options: ['1', '2', '3', '4', '5', '6', '7'] },
    en: { label: 'Training Days', options: ['1', '2', '3', '4', '5', '6', '7'] } },
  { key: 'presetSessionDuration', section: 'training_background', type: 'single_choice',
    ar: { label: 'مدة الجلسة', options: ['30 دقيقة', '45 دقيقة', '60 دقيقة', '75 دقيقة', '90+ دقيقة'] },
    en: { label: 'Session Duration', options: ['30 min', '45 min', '60 min', '75 min', '90+ min'] } },
  { key: 'presetTrainingLocation', section: 'training_background', type: 'single_choice',
    ar: { label: 'مكان التدريب', options: ['الجيم', 'المنزل', 'خارجي', 'مختلط'] },
    en: { label: 'Training Location', options: ['Gym', 'Home', 'Outdoor', 'Mixed'] } },
  { key: 'presetActivityLevel', section: 'lifestyle', type: 'single_choice',
    ar: { label: 'مستوى النشاط', options: ['قليل الحركة', 'خفيف', 'متوسط', 'عالي', 'عالي جدًا'] },
    en: { label: 'Activity Level', options: ['Sedentary', 'Light', 'Moderate', 'High', 'Very High'] } },
  { key: 'presetSleep', section: 'lifestyle', type: 'single_choice',
    ar: { label: 'ساعات النوم', options: ['أقل من 5 ساعات', '5-6 ساعات', '6-7 ساعات', '7-8 ساعات', '8 ساعات+'] },
    en: { label: 'Sleep', options: ['<5h', '5-6h', '6-7h', '7-8h', '8h+'] } },
  { key: 'presetStress', section: 'lifestyle', type: 'single_choice',
    ar: { label: 'مستوى التوتر', options: ['منخفض', 'متوسط', 'عالي', 'عالي جدًا'] },
    en: { label: 'Stress', options: ['Low', 'Moderate', 'High', 'Very High'] } },
  { key: 'presetCardio', section: 'lifestyle', type: 'single_choice',
    ar: { label: 'الكارديو', options: ['لا يوجد', '1-2 جلسة', '3-4 جلسات', '5+ جلسات'] },
    en: { label: 'Cardio', options: ['None', '1-2 sessions', '3-4 sessions', '5+ sessions'] } },
  { key: 'presetInjuries', section: 'health_medical', type: 'multiple_choice',
    ar: { label: 'إصابات / محدوديات', options: ['لا يوجد', 'الكتف', 'الكوع', 'المعصم', 'الظهر', 'الحوض', 'الركبة', 'الكاحل', 'أخرى'] },
    en: { label: 'Injuries / Limitations', options: ['None', 'Shoulder', 'Elbow', 'Wrist', 'Back', 'Hip', 'Knee', 'Ankle', 'Other'] } },
  { key: 'presetTrainingPreference', section: 'training_background', type: 'single_choice',
    ar: { label: 'تفضيل التدريب', options: ['أجهزة', 'أوزان حرة', 'وزن الجسم', 'مختلط'] },
    en: { label: 'Training Preference', options: ['Machines', 'Free Weights', 'Bodyweight', 'Mixed'] } },
  { key: 'presetWeakPoints', section: 'goals', type: 'multiple_choice',
    ar: { label: 'نقاط ضعف', options: ['صدر', 'ظهر', 'أكتاف', 'باي', 'تراي', 'كوادز', 'هامسترينج', 'مؤخرة', 'سمانة', 'بطن'] },
    en: { label: 'Weak Points', options: ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'] } },
];

// مودال مشترك لإضافة سؤال - يستخدم في بناء القالب الافتراضي وفي إضافة
// سؤال خاص بمتدرب معيّن، عشان نفس المنطق ما يتكررش مرتين.
function openQuestionEditor(defaultSection, onSave) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  const optionsState = [];

  root.innerHTML = `
    <div class="modal-box">
      <h2>${t('addQuestionBtn')}</h2>
      <input id="qLabel" placeholder="${t('questionLabelPlaceholder')}">
      <label class="small" style="display:block; margin:8px 0 4px;">${t('questionSectionLabel')}</label>
      <select id="qSection">
        ${ASSESSMENT_SECTIONS.map((s) => `<option value="${s}" ${s === defaultSection ? 'selected' : ''}>${t(SECTION_LABEL_KEYS[s])}</option>`).join('')}
      </select>
      <label class="small" style="display:block; margin:10px 0 4px;">${t('questionTypeLabel')}</label>
      <select id="qType">
        ${QUESTION_TYPES.map((ty) => `<option value="${ty}">${t(TYPE_LABEL_KEYS[ty])}</option>`).join('')}
      </select>
      <label class="small" style="display:flex; align-items:center; gap:6px; margin:10px 0;">
        <input type="checkbox" id="qRequired" style="width:auto; margin:0;"> ${t('questionRequiredLabel')}
      </label>
      <div id="qOptionsBox" class="hidden">
        <label class="small" style="display:block; margin-bottom:4px;">${t('questionOptionsLabel')}</label>
        <div class="chip-row" id="qOptionsChips"></div>
        <div style="display:flex; gap:6px;">
          <input id="qNewOption" placeholder="${t('addOptionPlaceholder')}" style="flex:1;">
          <button type="button" class="secondary" id="qAddOption" style="width:auto; padding:9px 12px;">${t('addOptionBtn')}</button>
        </div>
      </div>
      <button id="qSaveBtn" style="margin-top:12px;">${t('saveTemplateBtn')}</button>
      <button class="secondary" id="closeModal" style="margin-top:8px;">${t('closeBtn2')}</button>
    </div>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });
  document.getElementById('closeModal').onclick = closeModal;

  function renderOptionsChips() {
    document.getElementById('qOptionsChips').innerHTML = optionsState.map((o, i) => `<span class="filter-chip active" data-remove-opt="${i}" style="display:inline-flex; align-items:center; gap:5px;">${escapeHtml(o)} ${svgIconPro('close', 11)}</span>`).join('');
    document.querySelectorAll('[data-remove-opt]').forEach((chip) => {
      chip.onclick = () => { optionsState.splice(Number(chip.dataset.removeOpt), 1); renderOptionsChips(); };
    });
  }
  function toggleOptionsVisibility() {
    const type = document.getElementById('qType').value;
    document.getElementById('qOptionsBox').classList.toggle('hidden', !['single_choice', 'multiple_choice'].includes(type));
  }
  document.getElementById('qType').onchange = toggleOptionsVisibility;
  toggleOptionsVisibility();
  renderOptionsChips();

  document.getElementById('qAddOption').onclick = () => {
    const val = document.getElementById('qNewOption').value.trim();
    if (!val) return;
    optionsState.push(val);
    document.getElementById('qNewOption').value = '';
    renderOptionsChips();
  };

  document.getElementById('qSaveBtn').onclick = () => {
    const label = document.getElementById('qLabel').value.trim();
    if (!label) return;
    const type = document.getElementById('qType').value;
    if (['single_choice', 'multiple_choice'].includes(type) && optionsState.length < 2) return;
    const question = {
      section: document.getElementById('qSection').value,
      type,
      label,
      options: [...optionsState],
      required: document.getElementById('qRequired').checked,
    };
    closeModal();
    onSave(question);
  };
}

let assessmentTemplateEditState = [];

async function renderAssessmentTemplateBuilder() {
  let template;
  try {
    ({ template } = await api('/assessments/template'));
  } catch (e) { return; }
  assessmentTemplateEditState = template ? template.questions.map((q) => ({ section: q.section, type: q.type, label: q.label, options: q.options, required: !!q.required })) : [];

  function renderBody() {
    render(`
      <button class="secondary" id="back" style="margin-bottom:14px;">${t('back')}</button>
      <div class="card">
        <h2>${t('assessmentTemplateBuilderTitle')}</h2>
        ${template ? `<p class="small">${t('templateVersionLabel', { version: template.version })}</p>` : ''}
        <p class="small">${t('assessmentTemplateBuilderHint')}</p>
      </div>
      <div class="card">
        <h2>${t('quickAddQuestionsTitle')}</h2>
        <div class="chip-row">
          ${PRESET_QUESTIONS.map((p, i) => `<span class="filter-chip" data-add-preset="${i}">${t(p.key)}</span>`).join('')}
        </div>
      </div>
      ${ASSESSMENT_SECTIONS.map((section) => {
        const qs = assessmentTemplateEditState.map((q, i) => ({ ...q, i })).filter((q) => q.section === section);
        return `
          <div class="card">
            <div class="section-header">
              <h2>${t(SECTION_LABEL_KEYS[section])}</h2>
              <button class="secondary" data-add-q="${section}" style="width:auto; padding:6px 12px;">${t('addQuestionBtn')}</button>
            </div>
            ${qs.length === 0 ? `<p class="small">${t('noQuestionsYetInSection')}</p>` : qs.map((q, pos) => `
              <div class="coach-row" style="gap:8px;">
                <div style="flex:1; min-width:0;">
                  <div>${escapeHtml(q.label)} ${q.required ? `<span class="pill">${t('requiredLabel')}</span>` : ''}</div>
                  <div class="small">${t(TYPE_LABEL_KEYS[q.type])}${q.options.length ? ' · ' + q.options.map(escapeHtml).join('، ') : ''}</div>
                </div>
                <button class="secondary" data-move-q="up:${q.i}" ${pos === 0 ? 'disabled' : ''} style="width:auto; padding:6px 10px;">↑</button>
                <button class="secondary" data-move-q="down:${q.i}" ${pos === qs.length - 1 ? 'disabled' : ''} style="width:auto; padding:6px 10px;">↓</button>
                <button class="secondary" data-remove-q="${q.i}" style="width:auto; padding:6px 10px;">${svgIconPro('close', 14)}</button>
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
      <button id="saveTemplate">${t('saveTemplateBtn')}</button>
    `);

    document.getElementById('back').onclick = renderMore;
    document.querySelectorAll('[data-add-preset]').forEach((chip) => {
      chip.onclick = () => {
        const p = PRESET_QUESTIONS[Number(chip.dataset.addPreset)];
        const content = getLang() === 'ar' ? p.ar : p.en;
        assessmentTemplateEditState.push({ section: p.section, type: p.type, label: content.label, options: [...content.options], required: false });
        renderBody();
      };
    });
    document.querySelectorAll('[data-add-q]').forEach((btn) => {
      btn.onclick = () => {
        openQuestionEditor(btn.dataset.addQ, (q) => { assessmentTemplateEditState.push(q); renderBody(); });
      };
    });
    document.querySelectorAll('[data-remove-q]').forEach((btn) => {
      btn.onclick = () => { assessmentTemplateEditState.splice(Number(btn.dataset.removeQ), 1); renderBody(); };
    });
    // الترتيب هنا داخل نفس القسم بس - بندور على أقرب سؤال بنفس القسم قبل/بعد
    // الفهرس الحالي في المصفوفة الكاملة ونبدّل مكانهم، عشان ترتيب الأقسام
    // نفسه (general_info -> ... -> notes) يفضل ثابت زي ما هو دايمًا.
    document.querySelectorAll('[data-move-q]').forEach((btn) => {
      btn.onclick = () => {
        const [dir, iStr] = btn.dataset.moveQ.split(':');
        const i = Number(iStr);
        const section = assessmentTemplateEditState[i].section;
        let target = -1;
        if (dir === 'up') {
          for (let j = i - 1; j >= 0; j--) { if (assessmentTemplateEditState[j].section === section) { target = j; break; } }
        } else {
          for (let j = i + 1; j < assessmentTemplateEditState.length; j++) { if (assessmentTemplateEditState[j].section === section) { target = j; break; } }
        }
        if (target === -1) return;
        [assessmentTemplateEditState[i], assessmentTemplateEditState[target]] = [assessmentTemplateEditState[target], assessmentTemplateEditState[i]];
        renderBody();
      };
    });
    on('saveTemplate', 'click', async () => {
      if (!assessmentTemplateEditState.length) { alert(t('noQuestionsYetInSection')); return; }
      try {
        await api('/assessments/template', { method: 'PUT', body: JSON.stringify({ questions: assessmentTemplateEditState }) });
        alert(t('templateSavedAlert'));
        renderAssessmentTemplateBuilder();
      } catch (e) { alert(e.message); }
    });
  }

  renderBody();
}

function assessmentAnswerSummary(q, value) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return '-';
  if (q.type === 'yes_no') return value === true ? t('yesLabel') : value === false ? t('noLabel') : '-';
  if (q.type === 'multiple_choice') return Array.isArray(value) ? value.map(escapeHtml).join('، ') : '-';
  return escapeHtml(String(value));
}

function renderReadOnlyQuestion(q, value) {
  if (q.type === 'image_upload') {
    return `
      <div style="margin-bottom:10px;">
        <div class="small" style="margin-bottom:6px;">${escapeHtml(q.label)}</div>
        ${value ? `<img src="/uploads/${encodeURIComponent(value)}" style="max-width:160px; border-radius:10px; display:block;">` : `<div class="small">-</div>`}
      </div>
    `;
  }
  return `
    <div class="coach-row">
      <div>${escapeHtml(q.label)}</div>
      <div class="small">${assessmentAnswerSummary(q, value)}</div>
    </div>
  `;
}

function renderFillQuestion(q, val) {
  switch (q.type) {
    case 'single_choice':
      return `
        <div style="margin-bottom:14px;">
          <div class="small" style="margin-bottom:6px;">${escapeHtml(q.label)}${q.required ? ' *' : ''}</div>
          <div class="chip-row" data-fill-choice="${q.key}">
            ${q.options.map((o) => `<span class="filter-chip ${val === o ? 'active' : ''}" data-opt="${escapeHtml(o)}">${escapeHtml(o)}</span>`).join('')}
          </div>
        </div>
      `;
    case 'multiple_choice':
      return `
        <div style="margin-bottom:14px;">
          <div class="small" style="margin-bottom:6px;">${escapeHtml(q.label)}${q.required ? ' *' : ''}</div>
          <div class="chip-row" data-fill-multi="${q.key}">
            ${q.options.map((o) => `<span class="filter-chip ${Array.isArray(val) && val.includes(o) ? 'active' : ''}" data-opt="${escapeHtml(o)}">${escapeHtml(o)}</span>`).join('')}
          </div>
        </div>
      `;
    case 'yes_no':
      return `
        <div style="margin-bottom:14px;">
          <div class="small" style="margin-bottom:6px;">${escapeHtml(q.label)}${q.required ? ' *' : ''}</div>
          <div class="chip-row" data-fill-yesno="${q.key}">
            <span class="filter-chip ${val === true ? 'active' : ''}" data-opt="yes">${t('yesLabel')}</span>
            <span class="filter-chip ${val === false ? 'active' : ''}" data-opt="no">${t('noLabel')}</span>
          </div>
        </div>
      `;
    case 'number':
    case 'measurement':
      return `
        <div style="margin-bottom:10px;">
          <div class="small" style="margin-bottom:4px;">${escapeHtml(q.label)}${q.required ? ' *' : ''}</div>
          <input data-fill-number="${q.key}" type="number" value="${val ?? ''}">
        </div>
      `;
    case 'short_text':
      return `
        <div style="margin-bottom:10px;">
          <div class="small" style="margin-bottom:4px;">${escapeHtml(q.label)}${q.required ? ' *' : ''}</div>
          <input data-fill-text="${q.key}" value="${escapeHtml(val || '')}">
        </div>
      `;
    case 'long_text':
      return `
        <div style="margin-bottom:10px;">
          <div class="small" style="margin-bottom:4px;">${escapeHtml(q.label)}${q.required ? ' *' : ''}</div>
          <textarea data-fill-text="${q.key}" rows="3">${escapeHtml(val || '')}</textarea>
        </div>
      `;
    case 'date':
      return `
        <div style="margin-bottom:10px;">
          <div class="small" style="margin-bottom:4px;">${escapeHtml(q.label)}${q.required ? ' *' : ''}</div>
          <input data-fill-date="${q.key}" type="date" value="${val || ''}">
        </div>
      `;
    case 'image_upload':
      return `
        <div style="margin-bottom:14px;">
          <div class="small" style="margin-bottom:6px;">${escapeHtml(q.label)}${q.required ? ' *' : ''}</div>
          ${val ? `<img src="/uploads/${encodeURIComponent(val)}" style="max-width:140px; border-radius:10px; display:block; margin-bottom:8px;">` : ''}
          <input type="file" accept="image/*" data-fill-image="${q.key}">
        </div>
      `;
    default:
      return '';
  }
}

async function renderAssessmentTab(subscriptionId) {
  render(`${renderHubTabs(subscriptionId, 'assessment')}<div class="card"><div class="skeleton block"></div></div>`);
  wireHubNav(subscriptionId, 'assessment');

  let data;
  try { data = await api('/assessments/' + subscriptionId); } catch (e) { return; }

  if (data.needsTemplate) {
    render(`${renderHubTabs(subscriptionId, 'assessment')}<div class="card">${renderEmptyState(svgIconPro('document', 30), t('noAssessmentTemplateYet'), '')}</div>`);
    wireHubNav(subscriptionId, 'assessment');
    return;
  }

  const a = data.assessment;
  const isCoach = state.user.role === 'coach';

  if (isCoach) {
    const allQuestions = [...a.questions.map((q) => ({ ...q, kind: 'main' })), ...a.extraQuestions.map((q, i) => ({ ...q, kind: 'extra', refIndex: i }))];
    render(`
      ${renderHubTabs(subscriptionId, 'assessment')}
      <div class="card">
        <h2>${t('assessmentSummaryTitle')}</h2>
        ${!a.submittedAt ? `<p class="small">${t('noAssessmentAnswersYet')}</p>` : allQuestions.map((q) => {
          const value = q.kind === 'main' ? a.answers[q.id] : a.extraAnswers[q.refIndex];
          return renderReadOnlyQuestion(q, value);
        }).join('')}
      </div>
      <div class="card">
        <div class="section-header">
          <h2>${t('extraQuestionsTitle')}</h2>
          ${a.extraQuestions.length < 2 ? `<button class="secondary" id="addExtraQ" style="width:auto; padding:6px 12px;">${t('addExtraQuestionBtn')}</button>` : ''}
        </div>
        ${a.extraQuestions.length === 0 ? `<p class="small">${t('noQuestionsYetInSection')}</p>` : a.extraQuestions.map((q) => `
          <div class="coach-row"><div>${escapeHtml(q.label)}</div><div class="small">${t(TYPE_LABEL_KEYS[q.type])}</div></div>
        `).join('')}
      </div>
    `);
    wireHubNav(subscriptionId, 'assessment');
    const addBtn = document.getElementById('addExtraQ');
    if (addBtn) addBtn.onclick = () => {
      openQuestionEditor('notes', async (q) => {
        try {
          await api('/assessments/' + subscriptionId + '/extra-questions', { method: 'POST', body: JSON.stringify({ questions: [q] }) });
          renderAssessmentTab(subscriptionId);
        } catch (e) { alert(e.message); }
      });
    };
    return;
  }

  // فورم تعبئة التقييم للمتدرب - الأسئلة الأساسية والإضافية مدموجة في
  // قايمة واحدة بمفتاح موحّد، وبتترجع تاني لشكلهم الأصلي وقت الحفظ.
  const combinedQuestions = [
    ...a.questions.map((q) => ({ ...q, kind: 'main', key: 'q' + q.id, refId: q.id })),
    ...a.extraQuestions.map((q, i) => ({ ...q, kind: 'extra', key: 'e' + i, refId: i })),
  ];
  const localAnswers = {};
  combinedQuestions.forEach((q) => {
    localAnswers[q.key] = q.kind === 'main' ? (a.answers[q.refId] ?? null) : (a.extraAnswers[q.refId] ?? null);
  });

  function renderFillBody() {
    render(`
      ${renderHubTabs(subscriptionId, 'assessment')}
      <div class="card">
        <h2>${t('fillAssessmentTitle')}</h2>
        ${ASSESSMENT_SECTIONS.map((section) => {
          const qs = combinedQuestions.filter((q) => q.section === section);
          if (!qs.length) return '';
          return `<h2 style="margin-top:14px;">${t(SECTION_LABEL_KEYS[section])}</h2>${qs.map((q) => renderFillQuestion(q, localAnswers[q.key])).join('')}`;
        }).join('')}
        <button id="submitAssessment" style="margin-top:12px;">${t('submitAssessmentBtn')}</button>
      </div>
    `);
    wireHubNav(subscriptionId, 'assessment');
    wireFillInputs();
    on('submitAssessment', 'click', async () => {
      const answers = {};
      const extraAnswers = {};
      combinedQuestions.forEach((q) => {
        if (q.kind === 'main') answers[q.refId] = localAnswers[q.key];
        else extraAnswers[q.refId] = localAnswers[q.key];
      });
      try {
        await api('/assessments/' + subscriptionId + '/answers', { method: 'PUT', body: JSON.stringify({ answers, extraAnswers }) });
        alert(t('assessmentSubmittedAlert'));
      } catch (e) { alert(e.message); }
    });
  }

  function wireFillInputs() {
    document.querySelectorAll('[data-fill-choice]').forEach((box) => {
      box.querySelectorAll('[data-opt]').forEach((chip) => {
        chip.onclick = () => { localAnswers[box.dataset.fillChoice] = chip.dataset.opt; renderFillBody(); };
      });
    });
    document.querySelectorAll('[data-fill-multi]').forEach((box) => {
      box.querySelectorAll('[data-opt]').forEach((chip) => {
        chip.onclick = () => {
          const key = box.dataset.fillMulti;
          const cur = Array.isArray(localAnswers[key]) ? [...localAnswers[key]] : [];
          const idx = cur.indexOf(chip.dataset.opt);
          if (idx >= 0) cur.splice(idx, 1); else cur.push(chip.dataset.opt);
          localAnswers[key] = cur;
          renderFillBody();
        };
      });
    });
    document.querySelectorAll('[data-fill-yesno]').forEach((box) => {
      box.querySelectorAll('[data-opt]').forEach((chip) => {
        chip.onclick = () => { localAnswers[box.dataset.fillYesno] = chip.dataset.opt === 'yes'; renderFillBody(); };
      });
    });
    document.querySelectorAll('[data-fill-number]').forEach((el) => {
      el.oninput = () => { localAnswers[el.dataset.fillNumber] = el.value === '' ? null : Number(el.value); };
    });
    document.querySelectorAll('[data-fill-text]').forEach((el) => {
      el.oninput = () => { localAnswers[el.dataset.fillText] = el.value; };
    });
    document.querySelectorAll('[data-fill-date]').forEach((el) => {
      el.onchange = () => { localAnswers[el.dataset.fillDate] = el.value || null; };
    });
    document.querySelectorAll('[data-fill-image]').forEach((el) => {
      el.onchange = async () => {
        const file = el.files[0];
        if (!file) return;
        const key = el.dataset.fillImage;
        const formData = new FormData();
        formData.append('photo', file);
        try {
          const res = await apiUpload('/assessments/' + subscriptionId + '/upload-answer', formData);
          localAnswers[key] = res.filename;
          renderFillBody();
        } catch (e) { alert(e.message); }
      };
    });
  }

  renderFillBody();
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
    ${isCoach ? `<button class="secondary" id="clientPreviewBtn" style="width:auto; padding:9px 14px; display:flex; align-items:center; gap:6px;">${svgIconPro('client', 16)}${t('clientPreviewBtn')}</button>` : ''}
    <div class="card">
      <h2>${t('workoutPlanTitle')}</h2>
      ${isCoach ? `<div id="templateToolbar" class="template-toolbar"></div>` : ''}
      <div id="workoutBody"></div>
    </div>
    <div class="card">
      <h2>${t('nutritionPlanTitle')}</h2>
      ${isCoach ? `<div id="nutritionTemplateToolbar" class="template-toolbar"></div>` : ''}
      <div id="nutritionBody"></div>
    </div>
  `);
  wireHubNav(subscriptionId, 'plan');
  renderWorkoutBody(subscriptionId, isCoach);
  renderNutritionBody(subscriptionId, isCoach);
  if (isCoach) {
    wireTemplateToolbar(subscriptionId);
    wireNutritionTemplateToolbar(subscriptionId);
    on('clientPreviewBtn', 'click', openClientPreview);
  }
}

function openClientPreview() {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-box">
      <h2>${t('clientPreviewTitle')}</h2>
      <p class="small" style="margin-bottom:12px;">${t('clientPreviewHint')}</p>
      <div class="card" style="margin-bottom:10px;">
        <h2>${t('workoutPlanTitle')}</h2>
        ${workoutReadOnlyHtml(planEditState.workout)}
      </div>
      <div class="card">
        <h2>${t('nutritionPlanTitle')}</h2>
        ${nutritionReadOnlyHtml(planEditState.nutrition)}
      </div>
      <button class="secondary" id="closeModal" style="margin-top:12px;">${t('closeBtn2')}</button>
    </div>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });
  document.getElementById('closeModal').onclick = closeModal;
}

// -------------------- قوالب برامج التمرين --------------------

function openSaveTemplateModal(onSave) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-box">
      <h2>${t('saveAsTemplateBtn')}</h2>
      <input id="templateNameInput" placeholder="${t('templateNamePlaceholder')}">
      <button id="confirmSaveTemplate" style="margin-top:10px;">${t('saveAsTemplateBtn')}</button>
      <button class="secondary" id="closeModal" style="margin-top:8px;">${t('closeBtn2')}</button>
    </div>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });
  document.getElementById('closeModal').onclick = closeModal;
  document.getElementById('confirmSaveTemplate').onclick = () => {
    const name = document.getElementById('templateNameInput').value.trim();
    if (!name) return;
    closeModal();
    onSave(name);
  };
}

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
    <button class="secondary" id="deleteTemplateBtn" title="${t('deleteTemplateBtn')}" style="width:auto; padding:9px 10px;">${svgIconPro('trash', 16)}</button>
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

  on('saveAsTemplateBtn', 'click', () => {
    openSaveTemplateModal(async (title) => {
      try {
        await api('/plans/workout-templates', { method: 'POST', body: JSON.stringify({ title, days: planEditState.workout.days }) });
        alert(t('templateSavedAlert'));
        wireTemplateToolbar(subscriptionId);
      } catch (e) { alert(e.message); }
    });
  });

  on('deleteTemplateBtn', 'click', async () => {
    const id = document.getElementById('templateSelect').value;
    if (!id) { alert(t('chooseTemplateFirstAlert')); return; }
    if (!confirm(t('confirmDeleteTemplate'))) return;
    try {
      await api('/plans/workout-templates/' + id, { method: 'DELETE' });
      wireTemplateToolbar(subscriptionId);
    } catch (e) { alert(e.message); }
  });
}

async function wireNutritionTemplateToolbar(subscriptionId) {
  const box = document.getElementById('nutritionTemplateToolbar');
  if (!box) return;
  let templates = [];
  try {
    ({ templates } = await api('/plans/nutrition-templates'));
  } catch (e) { return; }

  box.innerHTML = `
    <select id="nutritionTemplateSelect" style="margin-bottom:0; flex:1;">
      <option value="">${t('startFromTemplateOption')}</option>
      ${templates.map((tpl) => `<option value="${tpl.id}">${escapeHtml(tpl.title)}</option>`).join('')}
    </select>
    <button class="secondary" id="applyNutritionTemplateBtn" style="width:auto; padding:9px 12px;">${t('applyTemplateBtn')}</button>
    <button class="secondary" id="saveAsNutritionTemplateBtn" style="width:auto; padding:9px 12px;">${t('saveAsTemplateBtn')}</button>
    <button class="secondary" id="deleteNutritionTemplateBtn" title="${t('deleteTemplateBtn')}" style="width:auto; padding:9px 10px;">${svgIconPro('trash', 16)}</button>
  `;

  on('applyNutritionTemplateBtn', 'click', async () => {
    const id = document.getElementById('nutritionTemplateSelect').value;
    if (!id) return;
    if (planEditState.nutrition.meals.length && !confirm(t('confirmApplyNutritionTemplate'))) return;
    try {
      const { template } = await api('/plans/nutrition-templates/' + id);
      planEditState.nutrition = {
        daily_calories: template.daily_calories ?? '',
        protein_target: template.protein_target ?? '',
        carbs_target: template.carbs_target ?? '',
        fat_target: template.fat_target ?? '',
        notes: template.notes || '',
        meals: JSON.parse(JSON.stringify(template.meals)),
      };
      renderNutritionBody(subscriptionId, true);
    } catch (e) { alert(e.message); }
  });

  on('saveAsNutritionTemplateBtn', 'click', () => {
    openSaveTemplateModal(async (title) => {
      try {
        await api('/plans/nutrition-templates', { method: 'POST', body: JSON.stringify({
          title,
          daily_calories: document.getElementById('dailyCalories')?.value,
          protein_target: document.getElementById('proteinTarget')?.value,
          carbs_target: document.getElementById('carbsTarget')?.value,
          fat_target: document.getElementById('fatTarget')?.value,
          notes: document.getElementById('nutritionNotes')?.value,
          meals: planEditState.nutrition.meals,
        }) });
        alert(t('templateSavedAlert'));
        wireNutritionTemplateToolbar(subscriptionId);
      } catch (e) { alert(e.message); }
    });
  });

  on('deleteNutritionTemplateBtn', 'click', async () => {
    const id = document.getElementById('nutritionTemplateSelect').value;
    if (!id) { alert(t('chooseTemplateFirstAlert')); return; }
    if (!confirm(t('confirmDeleteTemplate'))) return;
    try {
      await api('/plans/nutrition-templates/' + id, { method: 'DELETE' });
      wireNutritionTemplateToolbar(subscriptionId);
    } catch (e) { alert(e.message); }
  });
}

const EXERCISE_TYPE_KEYS = {
  normal: 'exTypeNormal', superset: 'exTypeSuperset', dropset: 'exTypeDropset', giant_set: 'exTypeGiantSet',
  circuit: 'exTypeCircuit', rest_pause: 'exTypeRestPause', myo_reps: 'exTypeMyoReps', amrap: 'exTypeAmrap',
  warmup: 'exTypeWarmup', cooldown: 'exTypeCooldown',
};

// إعداد سريع (Quick Presets) - قيم افتراضية معقولة لكل هدف تدريبي، بتتملى
// جاهزة في التمرين والمدرب يقدر يعدّلها زي ما يحب بدل ما يكتبها من الصفر.
const WORKOUT_PRESETS = {
  strength: { key: 'wPresetStrength', sets: 5, reps: '3-5', rir: 2, rest: '180 sec' },
  hypertrophy: { key: 'wPresetHypertrophy', sets: 4, reps: '8-12', rir: 1, rest: '90 sec' },
  endurance: { key: 'wPresetEndurance', sets: 3, reps: '15-20', rir: 3, rest: '45 sec' },
  power: { key: 'wPresetPower', sets: 5, reps: '3-5', rir: 3, rest: '150 sec' },
  general: { key: 'wPresetGeneralFitness', sets: 3, reps: '10-12', rir: 2, rest: '60 sec' },
};

function newExercise() {
  return { name: '', exercise_id: null, sets: null, reps: '', weight: '', rest: '', tempo: '', execution: '', rpe: null, rir: null, type: 'normal', video_url: '', notes: '' };
}

const EXECUTION_PREDEFINED = ['normal', 'controlled', 'explosive', 'pause'];
const EXECUTION_LABEL_KEYS = {
  normal: 'executionNormal', controlled: 'executionControlled', explosive: 'executionExplosive', pause: 'executionPause',
};
// true لو القيمة المخزنة فعلًا "مخصصة" (نص حر مش من الأربعة قيم الجاهزة)،
// أو المدرب لسه فاتح خانة "مخصص" من غير ما يكتب فيها حاجة لسه (علم مؤقت
// UI-only، مش بيتبعت للسيرفر - عشان نعرف نعرض خانة الكتابة حتى وهي فاضية).
function isCustomExecution(ex) {
  return (!!ex.execution && !EXECUTION_PREDEFINED.includes(ex.execution)) || !!ex._executionCustomMode;
}

function exerciseSummaryLine(ex) {
  const parts = [];
  if (ex.sets) parts.push(ex.sets + ' × ' + (ex.reps || '-'));
  else if (ex.reps) parts.push(escapeHtml(ex.reps));
  if (ex.weight) parts.push(escapeHtml(ex.weight));
  if (ex.rest) parts.push(t('restShortLabel', { rest: escapeHtml(ex.rest) }));
  if (ex.tempo) parts.push('Tempo ' + escapeHtml(ex.tempo));
  if (ex.execution) parts.push(EXECUTION_LABEL_KEYS[ex.execution] ? t(EXECUTION_LABEL_KEYS[ex.execution]) : escapeHtml(ex.execution));
  if (ex.rpe) parts.push('RPE ' + ex.rpe);
  if (ex.rir != null) parts.push('RIR ' + ex.rir);
  return parts.join(' · ');
}

// بيقسّم مصفوفة الأيام المسطّحة (days_json) لمجموعات كل مجموعة 7 أيام =
// "أسبوع" للعرض بس - مفيش حقل "week" مخزّن في القاعدة أصلًا، فده مجرد
// تقسيم عرضي فوق نفس البيانات المحفوظة (مفيش مصدر بيانات جديد).
function chunkDaysIntoWeeks(days, perWeek = 7) {
  const weeks = [];
  for (let i = 0; i < days.length; i += perWeek) weeks.push(days.slice(i, i + perWeek));
  return weeks;
}

// يوم "راحة" = يوم اتضاف من غير أي تمرين جواه (نفس البيانات الموجودة،
// مفيش علم rest_day مخزّن منفصل).
function isRestDay(day) {
  return !day.exercises || day.exercises.length === 0;
}

// صورة مصغّرة للتمرين بس لو فيه رابط يوتيوب محفوظ أصلًا على التمرين نفسه
// (video_url) - مفيش عمود صورة منفصل في قاعدة البيانات، ومفيش أيقونة
// UI بتتستخدم بدل الصورة زي ما التعليمات بتطلب.
function youtubeThumbnailUrl(videoUrl) {
  if (!videoUrl) return null;
  const m = String(videoUrl).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

function sumFoodsMacros(foods) {
  return (foods || []).reduce((acc, f) => {
    acc.calories += f.calories || 0;
    acc.protein += f.protein || 0;
    acc.carbs += f.carbs || 0;
    acc.fat += f.fat || 0;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

// تقريب لمنزلة عشرية واحدة وإزالة ".0" الزيادة - عشان جمع أرقام عشرية
// (زي بروتين 3.6 + 4.2...) ميطلعش بذيل أرقام طويل زي 155.60000000000002.
function roundMacro(n) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? r : r.toFixed(1);
}

function macroTotalsLine(totals) {
  return `${roundMacro(totals.calories)} ${t('kcalUnit')} · ${t('proteinLabel')} ${roundMacro(totals.protein)}${t('gramUnit')} · ${t('carbsLabel')} ${roundMacro(totals.carbs)}${t('gramUnit')} · ${t('fatLabel')} ${roundMacro(totals.fat)}${t('gramUnit')}`;
}

function exerciseThumbHtml(ex) {
  const thumb = youtubeThumbnailUrl(ex.video_url);
  return thumb ? `<img class="plan-ex-thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy">` : '';
}

// جدول تمارين اليوم لسطح المكتب - كل الأعمدة المطلوبة، بيلف أفقيًا لو
// المساحة مش كفاية بدل ما يكسر التخطيط (نفس بيانات exercise-card في
// الـ builder، مجرد عرض مختلف للقراءة فقط).
function exerciseTableDesktopHtml(exercises) {
  return `
    <div class="plan-table-wrap plan-table-desktop">
      <table class="plan-table">
        <thead><tr>
          <th>${t('exerciseNumColumnHeader')}</th>
          <th>${t('exerciseColumnHeader')}</th>
          <th>${t('setsColumnHeader')}</th>
          <th>${t('repsColumnHeader')}</th>
          <th>${t('rirColumnHeader')}</th>
          <th>${t('rpeColumnHeader')}</th>
          <th>${t('restColumnHeader')}</th>
          <th>${t('weightColumnHeader')}</th>
          <th>${t('tempoColumnHeader')}</th>
          <th>${t('executionColumnHeader')}</th>
          <th>${t('setTypeColumnHeader')}</th>
          <th>${t('notesColumnHeader')}</th>
          <th>${t('videoColumnHeader')}</th>
        </tr></thead>
        <tbody>
          ${exercises.map((ex, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="wrap-cell" style="display:flex; align-items:center; gap:8px;">${exerciseThumbHtml(ex)}<span>${escapeHtml(ex.name)}</span></td>
              <td>${ex.sets ?? '-'}</td>
              <td>${escapeHtml(ex.reps) || '-'}</td>
              <td>${ex.rir ?? '-'}</td>
              <td>${ex.rpe ?? '-'}</td>
              <td>${escapeHtml(ex.rest) || '-'}</td>
              <td>${escapeHtml(ex.weight) || '-'}</td>
              <td>${escapeHtml(ex.tempo) || '-'}</td>
              <td>${ex.execution ? (EXECUTION_LABEL_KEYS[ex.execution] ? t(EXECUTION_LABEL_KEYS[ex.execution]) : escapeHtml(ex.execution)) : '-'}</td>
              <td>${ex.type && ex.type !== 'normal' ? `<span class="ex-type-badge">${t(EXERCISE_TYPE_KEYS[ex.type])}</span>` : '-'}</td>
              <td class="wrap-cell">${escapeHtml(ex.notes) || '-'}</td>
              <td>${ex.video_url ? `<a class="link" href="${escapeHtml(ex.video_url)}" target="_blank" rel="noopener" style="display:inline-flex;">${svgIconPro('play', 15)}</a>` : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// صف مضغوط للموبايل: تمبنيل + اسم + Sets×Reps + RIR/RPE/Rest، والباقي
// (وزن/تمبو/طريقة أداء/نوع مجموعة/ملاحظات/فيديو) وراء "التفاصيل" native
// <details> بدل ما نحشر 13 عمود في شاشة صغيرة.
function exerciseRowMobileHtml(ex) {
  const hasMoreDetails = ex.weight || ex.tempo || ex.execution || (ex.type && ex.type !== 'normal') || ex.notes || ex.video_url;
  return `
    <div class="plan-mobile-row">
      ${exerciseThumbHtml(ex)}
      <div class="plan-mobile-row-main">
        <div class="exercise-name">${escapeHtml(ex.name)}</div>
        <div class="plan-mobile-row-stats">${ex.sets ? `${ex.sets} × ${escapeHtml(ex.reps) || '-'}` : (ex.reps ? escapeHtml(ex.reps) : '-')}</div>
        <div class="plan-mobile-row-stats">${[ex.rir != null ? 'RIR ' + ex.rir : '', ex.rpe ? 'RPE ' + ex.rpe : '', ex.rest ? t('restShortLabel', { rest: escapeHtml(ex.rest) }) : ''].filter(Boolean).join(' • ')}</div>
        ${hasMoreDetails ? `
          <details class="plan-mobile-details">
            <summary>${t('viewDetailsLabel')}</summary>
            <div class="plan-mobile-details-body">
              ${ex.weight ? `<div>${t('weightColumnHeader')}: ${escapeHtml(ex.weight)}</div>` : ''}
              ${ex.tempo ? `<div>${t('tempoColumnHeader')}: ${escapeHtml(ex.tempo)}</div>` : ''}
              ${ex.execution ? `<div>${t('executionColumnHeader')}: ${EXECUTION_LABEL_KEYS[ex.execution] ? t(EXECUTION_LABEL_KEYS[ex.execution]) : escapeHtml(ex.execution)}</div>` : ''}
              ${ex.type && ex.type !== 'normal' ? `<div>${t('setTypeColumnHeader')}: ${t(EXERCISE_TYPE_KEYS[ex.type])}</div>` : ''}
              ${ex.notes ? `<div style="grid-column:1/-1;">${t('notesColumnHeader')}: ${escapeHtml(ex.notes)}</div>` : ''}
              ${ex.video_url ? `<a class="link" href="${escapeHtml(ex.video_url)}" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; gap:4px;">${svgIconPro('play', 14)}${t('videoColumnHeader')}</a>` : ''}
            </div>
          </details>
        ` : ''}
      </div>
    </div>
  `;
}

function exerciseTableMobileHtml(exercises) {
  return `<div class="plan-table-mobile">${exercises.map(exerciseRowMobileHtml).join('')}</div>`;
}

// جدول "نظرة عامة" لأيام الأسبوع (اليوم/التركيز/عدد التمارين/الحالة) -
// من نفس مصفوفة الأيام بالظبط، من غير أي بيانات جديدة.
function weekOverviewTableHtml(weekDays) {
  return `
    <div class="plan-table-wrap">
      <table class="plan-table">
        <thead><tr>
          <th>${t('dayColumnHeader')}</th>
          <th>${t('focusColumnHeader')}</th>
          <th>${t('exercisesColumnHeader')}</th>
          <th>${t('statusColumnHeader')}</th>
        </tr></thead>
        <tbody>
          ${weekDays.map((day, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="wrap-cell">${escapeHtml(day.label) || '-'}</td>
              <td>${isRestDay(day) ? '—' : day.exercises.length}</td>
              <td>${isRestDay(day)
                ? `<span class="day-type-badge rest">${t('dayTypeRest')}</span>`
                : `<span class="day-type-badge training">${t('dayTypeTraining')}</span>`}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function workoutReadOnlyHtml(wp) {
  if (!wp.days.length) return `<p class="small">${t('noWorkoutPlanYet')}</p>`;
  const weeks = chunkDaysIntoWeeks(wp.days, 7);
  return weeks.map((weekDays, wi) => `
    <div class="plan-week-block">
      ${weeks.length > 1 ? `<div class="plan-week-header">${t('weekLabel', { n: wi + 1 })}</div>` : ''}
      <div class="small" style="font-weight:700; margin-bottom:6px;">${t('weeklyOverviewTitle')}</div>
      ${weekOverviewTableHtml(weekDays)}
      ${weekDays.map((day) => isRestDay(day) ? `
        <div class="plan-day-block">
          <div class="plan-day-body" style="padding:12px 14px; display:flex; align-items:center; justify-content:space-between;">
            <b style="font-size:13.5px;">${escapeHtml(day.label)}</b>
            <span class="day-type-badge rest">${t('dayTypeRest')}</span>
          </div>
        </div>
      ` : `
        <details class="plan-day-block">
          <summary>
            <span>${escapeHtml(day.label)}</span>
            <span class="day-type-badge training">${t('dayTypeTraining')}</span>
          </summary>
          <div class="plan-day-body">
            ${exerciseTableDesktopHtml(day.exercises)}
            ${exerciseTableMobileHtml(day.exercises)}
          </div>
        </details>
      `).join('')}
    </div>
  `).join('');
}

function renderWorkoutBody(subscriptionId, isCoach) {
  const body = document.getElementById('workoutBody');
  const wp = planEditState.workout;

  if (!isCoach) {
    body.innerHTML = workoutReadOnlyHtml(wp);
    return;
  }

  body.innerHTML = `
    ${wp.days.map((day, di) => `
      <div class="plan-day">
        <div style="display:flex; gap:8px; align-items:center;">
          <input data-day="${di}" value="${escapeHtml(day.label)}" placeholder="${t('dayLabelPlaceholder')}" style="margin-bottom:8px;">
          <button class="secondary" data-duplicate-day="${di}" title="${t('duplicateDayBtn')}" style="width:auto; padding:8px 12px; margin-bottom:8px;">⧉</button>
          <button class="secondary" data-remove-day="${di}" style="width:auto; padding:8px 12px; margin-bottom:8px;">${svgIconPro('close', 14)}</button>
        </div>
        ${day.exercises.map((ex, ei) => `
          <div class="exercise-card">
            <div style="display:flex; gap:6px;">
              <input data-ex="name:${di}:${ei}" value="${escapeHtml(ex.name)}" placeholder="${t('exerciseNamePlaceholder')}" style="flex:1;">
              <button type="button" class="secondary" data-browse-ex="${di}:${ei}" style="width:auto; padding:9px 10px; flex-shrink:0;" title="${t('browseLibraryBtn')}">${svgIconPro('search', 16)}</button>
              <button type="button" class="secondary" data-swap-ex="${di}:${ei}" style="width:auto; padding:9px 10px; flex-shrink:0;" title="${t('swapExerciseBtn')}">${svgIconPro('swap', 16)}</button>
              <select data-ex="type:${di}:${ei}" style="width:auto; flex-shrink:0;">
                ${Object.entries(EXERCISE_TYPE_KEYS).map(([val, key]) => `<option value="${val}" ${ex.type === val ? 'selected' : ''}>${t(key)}</option>`).join('')}
              </select>
            </div>
            <div class="chip-row" data-preset-ex="${di}:${ei}" style="margin:6px 0;">
              ${Object.entries(WORKOUT_PRESETS).map(([k, p]) => `<span class="filter-chip" data-preset="${k}">${t(p.key)}</span>`).join('')}
            </div>
            <div class="exercise-grid" style="grid-template-columns:repeat(4,1fr);">
              <input data-ex="sets:${di}:${ei}" type="number" min="0" value="${ex.sets ?? ''}" placeholder="${t('setsPlaceholder')}">
              <input data-ex="reps:${di}:${ei}" value="${escapeHtml(ex.reps)}" placeholder="${t('repsPlaceholder')}">
              <input data-ex="rir:${di}:${ei}" type="number" min="0" max="5" value="${ex.rir ?? ''}" placeholder="${t('rirPlaceholder')}">
              <input data-ex="rpe:${di}:${ei}" type="number" min="1" max="10" value="${ex.rpe ?? ''}" placeholder="${t('rpePlaceholder')}">
              <input data-ex="rest:${di}:${ei}" value="${escapeHtml(ex.rest)}" placeholder="${t('restShortPlaceholder')}" title="${t('restPlaceholder')}">
              <input data-ex="tempo:${di}:${ei}" value="${escapeHtml(ex.tempo)}" placeholder="${t('tempoPlaceholderShort')}" title="${t('tempoPlaceholder')}">
              <input data-ex="weight:${di}:${ei}" value="${escapeHtml(ex.weight)}" placeholder="${t('weightPlaceholder')}">
            </div>
            <input data-ex="video_url:${di}:${ei}" value="${escapeHtml(ex.video_url)}" placeholder="${t('videoUrlPlaceholder')}">
            <input data-ex="notes:${di}:${ei}" value="${escapeHtml(ex.notes)}" placeholder="${t('exerciseNotesPlaceholder')}">
            <button type="button" class="secondary" data-toggle-advanced="${di}:${ei}" style="width:auto; padding:6px 10px; margin:6px 0;">${t('advancedOptionsBtn')}</button>
            <div class="${ex._advancedOpen || ex.execution ? '' : 'hidden'}" data-advanced-box="${di}:${ei}" style="margin-bottom:6px;">
              <select data-exec-select="${di}:${ei}">
                <option value="">${t('anyExecutionOption')}</option>
                ${EXECUTION_PREDEFINED.map((k) => `<option value="${k}" ${ex.execution === k ? 'selected' : ''}>${t(EXECUTION_LABEL_KEYS[k])}</option>`).join('')}
                <option value="custom" ${isCustomExecution(ex) ? 'selected' : ''}>${t('executionCustomOption')}</option>
              </select>
              ${isCustomExecution(ex) ? `<input data-ex="execution:${di}:${ei}" value="${escapeHtml(ex.execution)}" placeholder="${t('executionCustomPlaceholder')}" style="margin-top:6px;">` : ''}
            </div>
            <div class="exercise-actions">
              <button class="secondary" data-move-ex="up:${di}:${ei}" ${ei === 0 ? 'disabled' : ''}>↑</button>
              <button class="secondary" data-move-ex="down:${di}:${ei}" ${ei === day.exercises.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="secondary" data-duplicate-ex="${di}:${ei}" title="${t('duplicateExerciseBtn')}">⧉</button>
              <button class="secondary" data-remove-ex="${di}:${ei}">${svgIconPro('close', 14)}</button>
            </div>
          </div>
        `).join('')}
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
          <button class="secondary" data-add-ex="${di}" style="width:auto; flex:1;">${t('addExerciseBtn')}</button>
          <button class="secondary" data-add-superset="${di}" style="width:auto; flex:1;">${t('addSupersetBtn')}</button>
          <button class="secondary" data-add-circuit="${di}" style="width:auto; flex:1;">${t('addCircuitBtn')}</button>
        </div>
      </div>
    `).join('')}
    <button class="secondary" id="addDay">${t('addDayBtn')}</button>
    <button class="secondary" id="repeatWeek" ${wp.days.length === 0 ? 'disabled' : ''}>${t('repeatWeekBtn')}</button>
    <button id="saveWorkout" style="margin-top:10px;">${t('savePlanBtn')}</button>
  `;

  document.querySelectorAll('[data-day]').forEach((el) => {
    el.oninput = () => { wp.days[+el.dataset.day].label = el.value; };
  });
  document.querySelectorAll('[data-ex]').forEach((el) => {
    const handler = () => {
      const [field, di, ei] = el.dataset.ex.split(':');
      const numericFields = ['sets', 'rpe', 'rir'];
      wp.days[+di].exercises[+ei][field] = numericFields.includes(field) ? (el.value ? Number(el.value) : null) : el.value;
    };
    el.oninput = handler;
    if (el.tagName === 'SELECT') el.onchange = handler;
  });
  document.querySelectorAll('[data-toggle-advanced]').forEach((btn) => {
    btn.onclick = () => {
      const [di, ei] = btn.dataset.toggleAdvanced.split(':').map(Number);
      const ex = wp.days[di].exercises[ei];
      ex._advancedOpen = !ex._advancedOpen;
      renderWorkoutBody(subscriptionId, isCoach);
    };
  });
  document.querySelectorAll('[data-exec-select]').forEach((sel) => {
    sel.onchange = () => {
      const [di, ei] = sel.dataset.execSelect.split(':').map(Number);
      const ex = wp.days[di].exercises[ei];
      if (sel.value === 'custom') {
        ex._executionCustomMode = true;
        ex._advancedOpen = true;
      } else {
        ex._executionCustomMode = false;
        ex.execution = sel.value;
      }
      renderWorkoutBody(subscriptionId, isCoach);
    };
  });
  document.querySelectorAll('[data-preset-ex]').forEach((box) => {
    box.querySelectorAll('[data-preset]').forEach((chip) => {
      chip.onclick = () => {
        const [di, ei] = box.dataset.presetEx.split(':').map(Number);
        const p = WORKOUT_PRESETS[chip.dataset.preset];
        Object.assign(wp.days[di].exercises[ei], { sets: p.sets, reps: p.reps, rir: p.rir, rest: p.rest });
        renderWorkoutBody(subscriptionId, isCoach);
      };
    });
  });
  document.querySelectorAll('[data-swap-ex]').forEach((el) => {
    el.onclick = async () => {
      const [di, ei] = el.dataset.swapEx.split(':').map(Number);
      const current = wp.days[di].exercises[ei];
      let muscleGroup = '';
      let equipment = '';
      if (current.exercise_id) {
        try {
          const { exercise } = await api('/exercises/' + current.exercise_id);
          muscleGroup = exercise.muscle_group || '';
          equipment = exercise.equipment || '';
        } catch (e) { /* لو التمرين مش موجود، هتفتح المكتبة من غير فلترة مسبقة */ }
      }
      openExerciseLibrary((chosen) => {
        // نحافظ على كل إعدادات البرمجة (sets/reps/rir/rpe/rest/tempo/type)
        // زي ما طلبت المواصفة، ونبدّل بس الاسم والربط بالتمرين الجديد.
        wp.days[di].exercises[ei].name = chosen.name;
        wp.days[di].exercises[ei].exercise_id = chosen.id;
        renderWorkoutBody(subscriptionId, isCoach);
        alert(t('exerciseSwappedAlert'));
      }, { excludeId: current.exercise_id || undefined, muscleGroup, equipment });
    };
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
  // إضافة سوبرسيت/سيركت بيضيفوا أكتر من تمرين مرة واحدة، كلهم بنفس نوع
  // الـ set type، عشان المدرب يعبّي التفاصيل بدل ما يضيفهم واحد واحد.
  document.querySelectorAll('[data-add-superset]').forEach((el) => {
    el.onclick = () => {
      const day = wp.days[+el.dataset.addSuperset];
      day.exercises.push({ ...newExercise(), type: 'superset' }, { ...newExercise(), type: 'superset' });
      renderWorkoutBody(subscriptionId, isCoach);
    };
  });
  document.querySelectorAll('[data-add-circuit]').forEach((el) => {
    el.onclick = () => {
      const day = wp.days[+el.dataset.addCircuit];
      day.exercises.push({ ...newExercise(), type: 'circuit' }, { ...newExercise(), type: 'circuit' }, { ...newExercise(), type: 'circuit' });
      renderWorkoutBody(subscriptionId, isCoach);
    };
  });
  document.querySelectorAll('[data-browse-ex]').forEach((el) => {
    el.onclick = () => {
      const [di, ei] = el.dataset.browseEx.split(':').map(Number);
      openExerciseLibrary((chosen) => {
        wp.days[di].exercises[ei].name = chosen.name;
        wp.days[di].exercises[ei].exercise_id = chosen.id;
        renderWorkoutBody(subscriptionId, isCoach);
      });
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
  on('repeatWeek', 'click', () => {
    if (!wp.days.length) return;
    if (!confirm(t('confirmRepeatWeek'))) return;
    const copy = JSON.parse(JSON.stringify(wp.days));
    wp.days.push(...copy);
    renderWorkoutBody(subscriptionId, isCoach);
  });
  on('saveWorkout', 'click', async () => {
    try {
      await api('/plans/' + subscriptionId + '/workout', { method: 'PUT', body: JSON.stringify({ title: wp.title, days: wp.days }) });
      alert(t('planSavedAlert'));
    } catch (e) { alert(e.message); }
  });
}

function newFood() {
  return { name: '', food_id: null, quantity: '', calories: null, protein: null, carbs: null, fat: null, alternative: '' };
}

// -------------------- مكتبة الأطعمة --------------------

const FOOD_CATEGORY_LABELS = {
  protein: 'categoryProtein', carb: 'categoryCarb', fat: 'categoryFat',
  vegetable: 'categoryVegetable', fruit: 'categoryFruit', dairy: 'categoryDairy',
};

function foodTagLine(f) {
  const parts = [];
  if (f.category) parts.push(t(FOOD_CATEGORY_LABELS[f.category]));
  parts.push(Math.round(f.calories_per_100g) + ' ' + t('kcalUnit') + ' ' + t('per100gLabel'));
  return parts.join(' · ');
}

const FOOD_QUANTITY_PRESETS = [25, 50, 100, 150, 200, 300];

function computeFoodMacros(food, qty) {
  const ratio = qty / 100;
  return {
    calories: Math.round(food.calories_per_100g * ratio),
    protein: Math.round(food.protein_per_100g * ratio * 10) / 10,
    carbs: Math.round(food.carbs_per_100g * ratio * 10) / 10,
    fat: Math.round(food.fat_per_100g * ratio * 10) / 10,
  };
}

function openFoodDetail(foodId, onSelect) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  root.innerHTML = `<div class="modal-box"><div class="skeleton block"></div></div>`;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });

  api('/foods/' + foodId).then(({ food }) => {
    if (!document.getElementById('modalRoot')) return;
    let qty = 100;
    document.querySelector('#modalRoot .modal-box').innerHTML = `
      <h2>${escapeHtml(food.name)}</h2>
      <div class="small" style="margin-bottom:10px;">${escapeHtml(foodTagLine(food))}</div>
      <div class="macro-summary" style="margin-bottom:14px;">
        <span class="macro-chip">${food.calories_per_100g} ${t('kcalUnit')} ${t('per100gLabel')}</span>
        <span class="macro-chip">${t('proteinLabel')} ${food.protein_per_100g}${t('gramUnit')}</span>
        <span class="macro-chip">${t('carbsLabel')} ${food.carbs_per_100g}${t('gramUnit')}</span>
        <span class="macro-chip">${t('fatLabel')} ${food.fat_per_100g}${t('gramUnit')}</span>
      </div>
      <div class="small" style="margin-bottom:6px;">${t('chooseQuantityLabel')}</div>
      <div class="chip-row" id="foodQtyChips" style="margin-bottom:8px;">
        ${FOOD_QUANTITY_PRESETS.map((g) => `<span class="filter-chip${g === 100 ? ' active' : ''}" data-qty="${g}">${g}${t('gramUnit')}</span>`).join('')}
      </div>
      <input id="foodQtyCustom" type="number" min="1" placeholder="${t('customQuantityPlaceholder')}" style="margin-bottom:10px;">
      <div id="foodQtyPreview" class="macro-summary" style="margin-bottom:12px;"></div>
      <button id="confirmFoodSelect">${t('confirmSelectFoodBtn')}</button>
      <button class="secondary" id="closeModal" style="margin-top:8px;">${t('closeBtn2')}</button>
    `;
    document.getElementById('closeModal').onclick = closeModal;

    function updatePreview() {
      const m = computeFoodMacros(food, qty);
      document.getElementById('foodQtyPreview').innerHTML = `
        <span class="macro-chip">${qty}${t('gramUnit')}</span>
        <span class="macro-chip">${m.calories} ${t('kcalUnit')}</span>
        <span class="macro-chip">${t('proteinLabel')} ${m.protein}${t('gramUnit')}</span>
        <span class="macro-chip">${t('carbsLabel')} ${m.carbs}${t('gramUnit')}</span>
        <span class="macro-chip">${t('fatLabel')} ${m.fat}${t('gramUnit')}</span>
      `;
    }
    updatePreview();

    document.querySelectorAll('#foodQtyChips .filter-chip').forEach((chip) => {
      chip.onclick = () => {
        qty = Number(chip.dataset.qty);
        document.getElementById('foodQtyCustom').value = '';
        document.querySelectorAll('#foodQtyChips .filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        updatePreview();
      };
    });
    document.getElementById('foodQtyCustom').oninput = (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v > 0) {
        qty = v;
        document.querySelectorAll('#foodQtyChips .filter-chip').forEach((c) => c.classList.remove('active'));
        updatePreview();
      }
    };
    document.getElementById('confirmFoodSelect').onclick = () => {
      const m = computeFoodMacros(food, qty);
      const selection = { name: food.name, food_id: food.id, quantity: qty + t('gramUnit'), calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat };
      closeModal();
      onSelect(selection);
    };
  }).catch(() => { closeModal(); });
}

function openFoodLibrary(onSelect) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  const libState = { scope: 'all', search: '', category: '' };

  root.innerHTML = `
    <div class="modal-box">
      <h2>${t('foodLibraryTitle')}</h2>
      <input id="foodLibSearch" placeholder="${t('searchFoodsPlaceholder')}">
      <div class="chip-row" id="foodLibTabs" style="margin:8px 0;">
        <span class="filter-chip active" data-scope="all">${t('allFoodsTab')}</span>
        <span class="filter-chip" data-scope="favorites">${t('favoritesTab')}</span>
        <span class="filter-chip" data-scope="mine">${t('myFoodsTab')}</span>
      </div>
      <select id="foodLibCategory" style="margin-bottom:10px;">
        <option value="">${t('anyCategoryOption')}</option>
        ${Object.entries(FOOD_CATEGORY_LABELS).map(([k, l]) => `<option value="${k}">${t(l)}</option>`).join('')}
      </select>
      <button class="secondary" id="foodLibAddCustomToggle" style="margin-bottom:10px;">${t('addCustomFoodBtn')}</button>
      <div id="foodLibCustomForm" class="hidden" style="margin-bottom:12px;">
        <input id="foodLibNewName" placeholder="${t('customFoodNamePlaceholder')}">
        <select id="foodLibNewCategory" style="margin-bottom:8px;">
          <option value="">${t('anyCategoryOption')}</option>
          ${Object.entries(FOOD_CATEGORY_LABELS).map(([k, l]) => `<option value="${k}">${t(l)}</option>`).join('')}
        </select>
        <div class="exercise-grid">
          <input id="foodLibNewCal" type="number" min="0" placeholder="${t('foodCaloriesPlaceholder')} (${t('per100gLabel')})">
          <input id="foodLibNewPro" type="number" min="0" placeholder="${t('foodProteinPlaceholder')} (${t('per100gLabel')})">
          <input id="foodLibNewCarb" type="number" min="0" placeholder="${t('foodCarbsPlaceholder')} (${t('per100gLabel')})">
          <input id="foodLibNewFat" type="number" min="0" placeholder="${t('foodFatPlaceholder')} (${t('per100gLabel')})">
        </div>
        <button id="foodLibSaveCustom">${t('saveCustomFoodBtn')}</button>
      </div>
      <div id="foodLibList"><div class="skeleton block"></div></div>
      <button class="secondary" id="closeModal" style="margin-top:10px;">${t('closeBtn2')}</button>
    </div>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });
  document.getElementById('closeModal').onclick = closeModal;

  document.getElementById('foodLibAddCustomToggle').onclick = () => {
    document.getElementById('foodLibCustomForm').classList.toggle('hidden');
  };
  document.getElementById('foodLibSaveCustom').onclick = async () => {
    const name = document.getElementById('foodLibNewName').value.trim();
    if (!name) return;
    try {
      await api('/foods', { method: 'POST', body: JSON.stringify({
        name,
        category: document.getElementById('foodLibNewCategory').value || null,
        calories: document.getElementById('foodLibNewCal').value,
        protein: document.getElementById('foodLibNewPro').value,
        carbs: document.getElementById('foodLibNewCarb').value,
        fat: document.getElementById('foodLibNewFat').value,
      }) });
      document.getElementById('foodLibNewName').value = '';
      document.getElementById('foodLibCustomForm').classList.add('hidden');
      libState.scope = 'mine';
      document.querySelectorAll('#foodLibTabs .filter-chip').forEach((c) => c.classList.toggle('active', c.dataset.scope === 'mine'));
      loadList();
    } catch (e) { alert(e.message); }
  };

  document.querySelectorAll('#foodLibTabs .filter-chip').forEach((chip) => {
    chip.onclick = () => {
      document.querySelectorAll('#foodLibTabs .filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      libState.scope = chip.dataset.scope;
      loadList();
    };
  });
  document.getElementById('foodLibSearch').oninput = (e) => { libState.search = e.target.value; loadList(); };
  document.getElementById('foodLibCategory').onchange = (e) => { libState.category = e.target.value; loadList(); };

  async function loadList() {
    const listBox = document.getElementById('foodLibList');
    if (!listBox) return;
    listBox.innerHTML = `<div class="skeleton block"></div>`;
    const qs = new URLSearchParams();
    qs.set('scope', libState.scope);
    if (libState.search) qs.set('search', libState.search);
    if (libState.category) qs.set('category', libState.category);
    let foods;
    try {
      ({ foods } = await api('/foods?' + qs.toString()));
    } catch (e) { return; }
    if (!document.getElementById('foodLibList')) return;
    if (!foods.length) {
      listBox.innerHTML = `<p class="small">${t('noFoodsFoundMsg')}</p>`;
      return;
    }
    listBox.innerHTML = foods.map((f) => `
      <div class="coach-row" style="gap:8px;" data-food-id="${f.id}">
        <div style="flex:1; min-width:0;">
          <div>${escapeHtml(f.name)}</div>
          <div class="small">${escapeHtml(foodTagLine(f))}</div>
        </div>
        <button class="secondary" data-fav-food="${f.id}" data-fav-state="${f.is_favorite}" style="width:auto; padding:6px 10px;">${favoriteHeartIcon(!!f.is_favorite)}</button>
        ${f.coach_id ? `<button class="secondary" data-del-food="${f.id}" style="width:auto; padding:6px 10px;">${svgIconPro('close', 14)}</button>` : ''}
        <button data-select-food="${f.id}" style="width:auto; padding:6px 10px;">${t('selectFoodBtn')}</button>
      </div>
    `).join('');

    listBox.querySelectorAll('[data-select-food]').forEach((btn) => {
      btn.onclick = () => openFoodDetail(Number(btn.dataset.selectFood), onSelect);
    });
    listBox.querySelectorAll('[data-fav-food]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.favFood;
        const isFav = btn.dataset.favState === '1';
        try {
          await api('/foods/' + id + '/favorite', { method: isFav ? 'DELETE' : 'POST' });
          loadList();
        } catch (e) { alert(e.message); }
      };
    });
    listBox.querySelectorAll('[data-del-food]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm(t('removeBtn') + '?')) return;
        try {
          await api('/foods/' + btn.dataset.delFood, { method: 'DELETE' });
          loadList();
        } catch (e) { alert(e.message); }
      };
    });
  }

  loadList();
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
      <span class="macro-chip">${totals.calories}${calTarget ? ' / ' + calTarget : ''} ${t('kcalUnit')}</span>
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

function dailyTargetsTableHtml(np) {
  if (!(np.daily_calories || np.protein_target || np.carbs_target || np.fat_target)) return '';
  return `
    <div class="small" style="font-weight:700; margin-bottom:6px;">${t('dailyTargetsTitle')}</div>
    <div class="plan-table-wrap">
      <table class="plan-table">
        <thead><tr>
          <th>${t('caloriesLabel')}</th>
          <th>${t('proteinLabel')}</th>
          <th>${t('carbsLabel')}</th>
          <th>${t('fatLabel')}</th>
        </tr></thead>
        <tbody><tr>
          <td>${np.daily_calories ? `${np.daily_calories} ${t('kcalUnit')}` : '-'}</td>
          <td>${np.protein_target ? `${np.protein_target}${t('gramUnit')}` : '-'}</td>
          <td>${np.carbs_target ? `${np.carbs_target}${t('gramUnit')}` : '-'}</td>
          <td>${np.fat_target ? `${np.fat_target}${t('gramUnit')}` : '-'}</td>
        </tr></tbody>
      </table>
    </div>
  `;
}

function mealFoodTableDesktopHtml(foods) {
  return `
    <div class="plan-table-wrap plan-table-desktop">
      <table class="plan-table">
        <thead><tr>
          <th>${t('foodColumnHeader')}</th>
          <th>${t('quantityColumnHeader')}</th>
          <th>${t('caloriesLabel')}</th>
          <th>${t('proteinLabel')}</th>
          <th>${t('carbsLabel')}</th>
          <th>${t('fatLabel')}</th>
        </tr></thead>
        <tbody>
          ${foods.map((f) => `
            <tr>
              <td class="wrap-cell">${escapeHtml(f.name)}${f.alternative ? `<div class="small">${t('alternativeLabel')} ${escapeHtml(f.alternative)}</div>` : ''}</td>
              <td>${escapeHtml(f.quantity) || '-'}</td>
              <td>${f.calories ?? '-'}</td>
              <td>${f.protein ?? '-'}</td>
              <td>${f.carbs ?? '-'}</td>
              <td>${f.fat ?? '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function mealFoodTableMobileHtml(foods) {
  return `
    <div class="plan-table-mobile">
      ${foods.map((f) => `
        <div class="plan-mobile-row">
          <div class="plan-mobile-row-main">
            <div class="exercise-name">${escapeHtml(f.name)}</div>
            <div class="plan-mobile-row-stats">${[escapeHtml(f.quantity), f.calories ? f.calories + ' ' + t('kcalUnit') : ''].filter(Boolean).join(' • ')}</div>
            ${f.alternative ? `<div class="plan-mobile-row-stats">${t('alternativeLabel')} ${escapeHtml(f.alternative)}</div>` : ''}
            <details class="plan-mobile-details">
              <summary>${t('viewDetailsLabel')}</summary>
              <div class="plan-mobile-details-body">
                <div>${t('proteinLabel')}: ${f.protein ?? '-'}${t('gramUnit')}</div>
                <div>${t('carbsLabel')}: ${f.carbs ?? '-'}${t('gramUnit')}</div>
                <div>${t('fatLabel')}: ${f.fat ?? '-'}${t('gramUnit')}</div>
              </div>
            </details>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function nutritionReadOnlyHtml(np) {
  if (!np.meals.length) return `<p class="small">${t('noNutritionPlanYet')}</p>`;
  const dailyTotals = sumMealsMacros(np.meals);
  return `
    ${dailyTargetsTableHtml(np)}
    ${np.notes ? `<p style="font-size:13px; line-height:1.8;">${escapeHtml(np.notes)}</p>` : ''}
    ${np.meals.map((m) => {
      const foods = m.foods || [];
      const mealTotals = sumFoodsMacros(foods);
      return `
        <div class="plan-day-block" style="border:1px solid var(--line); border-radius:12px; margin-bottom:10px; padding:12px 14px;">
          <div class="plan-day-title" style="font-weight:800; font-size:13.5px; margin-bottom:2px;">${escapeHtml(m.label)}${m.time ? ` <span class="small">· ${escapeHtml(m.time)}</span>` : ''}</div>
          ${m.description ? `<p class="small" style="margin:2px 0 8px;">${escapeHtml(m.description)}</p>` : ''}
          ${foods.length ? `
            ${mealFoodTableDesktopHtml(foods)}
            ${mealFoodTableMobileHtml(foods)}
            <div class="meal-subtotal-row"><span>${t('mealSubtotalLabel')}</span><span>${macroTotalsLine(mealTotals)}</span></div>
          ` : ''}
        </div>
      `;
    }).join('')}
    <div class="daily-total-block">
      <span class="daily-total-label">${t('dailyTotalLabel')}</span>
      <span class="daily-total-value">${macroTotalsLine(dailyTotals)}</span>
    </div>
  `;
}

function renderNutritionBody(subscriptionId, isCoach) {
  const body = document.getElementById('nutritionBody');
  const np = planEditState.nutrition;

  if (!isCoach) {
    body.innerHTML = nutritionReadOnlyHtml(np);
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
            <div style="display:flex; gap:6px;">
              <input data-food="name:${mi}:${fi}" value="${escapeHtml(f.name)}" placeholder="${t('foodNamePlaceholder')}" style="flex:1;">
              <button type="button" class="secondary" data-browse-food="${mi}:${fi}" style="width:auto; padding:9px 10px; flex-shrink:0;" title="${t('browseFoodLibraryBtn')}">${svgIconPro('search', 16)}</button>
            </div>
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
            <button class="secondary" data-remove-food="${mi}:${fi}">${svgIconPro('close', 14)}</button>
          </div>
        `).join('')}
        <button class="secondary" data-add-food="${mi}" style="margin-bottom:6px;">${t('addFoodBtn')}</button>
        <div style="display:flex; gap:6px;">
          <button class="secondary" data-dup-meal="${mi}" style="width:auto; padding:8px 12px; display:flex; align-items:center; gap:6px;">${svgIconPro('copy', 16)}${t('duplicateMealBtn')}</button>
          <button class="danger" data-remove-meal="${mi}" style="width:auto; padding:8px 12px;">${svgIconPro('close', 14)}</button>
        </div>
      </div>
    `).join('')}
    <div class="chip-row" id="mealPresetChips" style="margin:10px 0 4px; align-items:center;">
      <span class="small">${t('quickAddMealLabel')}</span>
      <span class="filter-chip" data-meal-preset="mealPresetBreakfast">${t('mealPresetBreakfast')}</span>
      <span class="filter-chip" data-meal-preset="mealPresetLunch">${t('mealPresetLunch')}</span>
      <span class="filter-chip" data-meal-preset="mealPresetDinner">${t('mealPresetDinner')}</span>
      <span class="filter-chip" data-meal-preset="mealPresetSnack">${t('mealPresetSnack')}</span>
    </div>
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
  document.querySelectorAll('[data-dup-meal]').forEach((el) => {
    el.onclick = () => {
      const idx = +el.dataset.dupMeal;
      const copy = JSON.parse(JSON.stringify(np.meals[idx]));
      np.meals.splice(idx + 1, 0, copy);
      renderNutritionBody(subscriptionId, isCoach);
    };
  });
  document.querySelectorAll('[data-meal-preset]').forEach((chip) => {
    chip.onclick = () => {
      const m = newMeal();
      m.label = t(chip.dataset.mealPreset);
      np.meals.push(m);
      renderNutritionBody(subscriptionId, isCoach);
    };
  });
  document.querySelectorAll('[data-add-food]').forEach((el) => {
    el.onclick = () => { np.meals[+el.dataset.addFood].foods.push(newFood()); renderNutritionBody(subscriptionId, isCoach); };
  });
  document.querySelectorAll('[data-browse-food]').forEach((el) => {
    el.onclick = () => {
      const [mi, fi] = el.dataset.browseFood.split(':').map(Number);
      openFoodLibrary((chosen) => {
        np.meals[mi].foods[fi] = { ...np.meals[mi].foods[fi], ...chosen, alternative: np.meals[mi].foods[fi].alternative };
        renderNutritionBody(subscriptionId, isCoach);
      });
    };
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
      <input id="weightInput" type="number" step="0.1" placeholder="${t('progressWeightPlaceholder')}">
      <input id="noteInput" placeholder="${t('progressNotePlaceholder')}">
      <label class="small" style="display:block; margin-bottom:6px;">${t('uploadPhotoLabel')}</label>
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
        <button type="button" class="secondary" id="choosePhotoBtn" style="width:auto; padding:9px 14px; flex-shrink:0;">${t('choosePhotoBtn')}</button>
        <span class="small" id="photoInputName">${t('noFileChosenLabel')}</span>
      </div>
      <input id="photoInput" type="file" accept="image/png,image/jpeg,image/webp" style="display:none;">
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
            ${e.weight_kg != null ? `<div style="display:flex; align-items:center; gap:5px;">${svgIconPro('chart', 13)}${e.weight_kg} ${t('kgUnit')}</div>` : ''}
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

  on('choosePhotoBtn', 'click', () => document.getElementById('photoInput').click());
  on('photoInput', 'change', () => {
    const f = document.getElementById('photoInput').files[0];
    document.getElementById('photoInputName').textContent = f ? f.name : t('noFileChosenLabel');
  });

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
        ${c.weight_kg != null ? `<div style="display:flex; align-items:center; gap:5px;">${svgIconPro('chart', 13)}${c.weight_kg} ${t('kgUnit')}</div>` : ''}
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
          ${isCoach ? `<button class="secondary" data-remove-habit="${h.id}" style="width:auto; padding:6px 10px;">${svgIconPro('close', 14)}</button>` : ''}
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
        <span class="rating">${starRating(review.rating)}</span>
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
    if (list.length === 0) return renderEmptyState(svgIconPro('calendar', 30), t('noSessionsYet'), '');
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
