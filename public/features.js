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
      <span class="search-icon">🔍</span>
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
      ${menuRow({ icon: '📅', label: t('myBookingsTitle'), id: 'menuBookings' })}
      ${menuRow({ icon: '🆘', label: t('supportMenuItem'), id: 'menuSupport' })}
      ${menuRow({ icon: '🌍', label: t('languageMenuItem'), value: getLang() === 'ar' ? 'العربية' : 'English', id: 'menuLanguage' })}
      ${menuRow({ icon: '🚪', label: t('logoutBtn'), id: 'menuLogout', danger: true })}
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
  on('menuSupport', 'click', renderSupportHome);
  on('menuLanguage', 'click', () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); renderProfile(); });
  on('menuLogout', 'click', async () => { await api('/auth/logout', { method: 'POST' }); boot(); });
}

async function renderMore() {
  renderBottomNav('more');
  render(`
    ${profileHeader(t('roleCoachLabel'))}
    <div class="card menu-card">
      ${menuRow({ icon: '💰', label: t('earningsMenuItem'), id: 'menuEarnings' })}
      ${menuRow({ icon: '📸', label: t('transformationsTitle'), id: 'menuTransformations' })}
      ${menuRow({ icon: '📊', label: t('viewStatsBtn'), id: 'menuStats' })}
      ${menuRow({ icon: '🆘', label: t('supportMenuItem'), id: 'menuSupport' })}
      ${menuRow({ icon: '🌍', label: t('languageMenuItem'), value: getLang() === 'ar' ? 'العربية' : 'English', id: 'menuLanguage' })}
      ${menuRow({ icon: '🚪', label: t('logoutBtn'), id: 'menuLogout', danger: true })}
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
  on('editProfileLink', 'click', (e) => { e.preventDefault(); renderCoachDashboard(); });
  on('menuEarnings', 'click', renderEarnings);
  on('menuTransformations', 'click', renderCoachTransformations);
  on('menuStats', 'click', renderCoachStats);
  on('menuSupport', 'click', renderSupportHome);
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

// -------------------- التحولات (قبل/بعد) --------------------

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
      </div>
    </div>
  `;
}

function openTransformModal(tr, isCoach, onChange) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'modalRoot';
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-box">
      <div class="transform-pair" style="border-radius:10px; overflow:hidden; margin-bottom:12px;">
        <img src="/uploads/${encodeURIComponent(tr.before_photo_path)}" alt="">
        <img src="/uploads/${encodeURIComponent(tr.after_photo_path)}" alt="">
      </div>
      ${tr.goal ? `<p class="small"><b>${t('transformGoalLabel')}:</b> ${escapeHtml(tr.goal)}</p>` : ''}
      ${tr.notes ? `<p class="small">${escapeHtml(tr.notes)}</p>` : ''}
      ${isCoach ? `
        <label class="small" style="display:block; margin-bottom:6px;">${t('photoVisibilityLabel')}</label>
        <select id="transformVisibility" style="margin-bottom:10px;">
          <option value="private" ${tr.visibility === 'private' ? 'selected' : ''}>${t('visibilityPrivate')}</option>
          <option value="public" ${tr.visibility === 'public' ? 'selected' : ''}>${t('visibilityPublic')}</option>
        </select>
        <button class="danger" id="deleteTransform" style="margin-bottom:10px;">${t('deletePhotoConfirm')}</button>
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
      onChange();
    };
    document.getElementById('deleteTransform').onclick = async () => {
      if (!confirm(t('deletePhotoConfirm'))) return;
      await api('/transformations/' + tr.subscription_id + '/' + tr.id, { method: 'DELETE' });
      closeModal();
      onChange();
    };
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
      if (tr) openTransformModal(tr, isCoach, () => loadAndRenderTransformations(containerId, subscriptionId, isCoach));
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
      <input id="durationLabel" placeholder="${t('durationPlaceholder')}">
      <input id="goalInput" placeholder="${t('transformGoalLabel')}">
      <textarea id="notesInput" rows="2" placeholder="${t('progressNotePlaceholder')}"></textarea>
      <select id="transformVisibilityNew" style="margin-bottom:10px;">
        <option value="private">${t('visibilityPrivate')}</option>
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
    fd.append('duration_label', document.getElementById('durationLabel').value);
    fd.append('goal', document.getElementById('goalInput').value);
    fd.append('notes', document.getElementById('notesInput').value);
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
      if (tr) openTransformModal(tr, false, () => {});
    };
  });
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
      if (tr) openTransformModal(tr, true, renderCoachTransformations);
    };
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
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:16px;">
      <div class="search-bar" style="flex:1; margin-bottom:0;">
        <span class="search-icon">🔍</span>
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

  loadResults();
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
        <div style="display:flex; gap:6px;">
          ${isCoach ? `<button class="secondary" data-complete="${s.id}" style="width:auto; padding:6px 10px;">${t('markCompletedBtn')}</button>` : ''}
          <button class="secondary" data-cancel="${s.id}" style="width:auto; padding:6px 10px;">${t('cancelSessionBtn')}</button>
        </div>
      ` : `<span class="pill">${{ completed: t('statusCompleted'), cancelled: t('statusCancelled') }[s.status] || ''}</span>`}
    </div>
  `;
}

async function renderSessionsTab(subscriptionId) {
  const isCoach = state.user.role === 'coach';
  const { sessions } = await api('/sessions/' + subscriptionId);
  const now = Date.now();
  const isFutureScheduled = (s) => s.status === 'scheduled' && new Date(s.scheduled_at).getTime() > now;
  const upcoming = sessions.filter(isFutureScheduled);
  const past = sessions.filter((s) => s.status === 'completed' || (s.status === 'scheduled' && !isFutureScheduled(s)));
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
      <input id="sessionDate" type="datetime-local">
      <input id="sessionNotes" placeholder="${t('sessionNotesPlaceholder')}">
      <button id="bookBtn">${t('bookSessionBtn')}</button>
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
