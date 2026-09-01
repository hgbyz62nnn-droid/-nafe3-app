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

// Everything in this panel comes straight from user-submitted data (coach
// bios, chat messages flagged for review, names/emails) - escape before
// dropping into HTML so it can't run as script in the admin's own session.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

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
      <div class="tab" id="tabSupport">تذاكر الدعم</div>
      <div class="tab" id="tabReports">بلاغات المستخدمين</div>
      <div class="tab" id="tabFlagged">محاولات التحايل</div>
      <div class="tab" id="tabReviews">التقييمات</div>
      <div class="tab" id="tabUsers">المستخدمين</div>
      <div class="tab" id="tabSettings">الإعدادات</div>
    </div>
    <div id="adminContent"></div>
    ${logoutBtn()}
  `);

  function activateTab(id) {
    ['tabPending', 'tabSupport', 'tabReports', 'tabFlagged', 'tabReviews', 'tabUsers', 'tabSettings'].forEach((t) => {
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
            <b>${escapeHtml(p.name)}</b> <span class="small">(${escapeHtml(p.email)})</span>
            <p class="small">${escapeHtml(p.specialty) || '-'} — ${escapeHtml(p.certification) || '-'}</p>
            <p style="font-size:12.5px;">${escapeHtml(p.bio)}</p>
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

  const REPORT_REASON_LABELS = {
    harassment: 'تحرش', fraud: 'احتيال', inappropriate: 'محتوى غير لائق', impersonation: 'انتحال شخصية', other: 'حاجة تانية',
  };
  const REPORT_STATUS_LABELS = { open: 'مفتوح', dismissed: 'اتصرف عنه', action_taken: 'اتخد إجراء' };

  async function showReports() {
    activateTab('tabReports');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>بلاغات المستخدمين</h2>
        <div class="filters">
          <select id="rStatus">
            <option value="open">مفتوحة</option>
            <option value="">كل الحالات</option>
            <option value="dismissed">اتصرف عنها</option>
            <option value="action_taken">اتخد فيها إجراء</option>
          </select>
          <button id="rApply" style="width:auto; padding:8px 16px;">فلترة</button>
        </div>
        <div id="reportsList"><p class="small">بيحمّل...</p></div>
      </div>
    `;
    async function load() {
      const params = new URLSearchParams();
      const status = document.getElementById('rStatus').value;
      if (status) params.set('status', status);
      const { reports } = await api('/moderation/admin/reports?' + params.toString());
      document.getElementById('reportsList').innerHTML = reports.length === 0
        ? '<p class="small">مفيش بلاغات.</p>'
        : reports.map((r) => `
          <div class="card" style="background:var(--surface-2);">
            <div style="display:flex; justify-content:space-between;">
              <b>${escapeHtml(r.reporter_name)} ← ${escapeHtml(r.reported_name)}</b>
              <span class="badge ${r.status === 'open' ? 'blocked' : 'review'}">${REPORT_STATUS_LABELS[r.status]}</span>
            </div>
            <p class="small">سبب البلاغ: ${REPORT_REASON_LABELS[r.reason] || r.reason} · ${escapeHtml(r.created_at)}</p>
            <p class="small">المُبلَّغ: ${escapeHtml(r.reported_email)} ${r.reported_banned ? '· <span style="color:var(--danger)">محظور بالفعل</span>' : ''}</p>
            ${r.details ? `<p style="font-size:12.5px; margin:6px 0;">${escapeHtml(r.details)}</p>` : ''}
            ${r.admin_action ? `<p class="small">آخر إجراء: ${r.admin_action === 'ban' ? 'حظر الحساب' : r.admin_action === 'warn' ? 'إيميل تحذير' : 'تجاهل'}</p>` : ''}
            ${r.status === 'open' ? `
              <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
                <button data-dismiss="${r.id}">🙈 تجاهل</button>
                <button data-warn="${r.id}">✉️ تحذير بالإيميل</button>
                <button class="danger" data-ban="${r.id}">🚫 حظر الحساب</button>
              </div>
            ` : ''}
          </div>
        `).join('');
      document.querySelectorAll('[data-dismiss]').forEach((el) => {
        el.onclick = async () => { await api('/moderation/admin/reports/' + el.dataset.dismiss + '/action', { method: 'POST', body: JSON.stringify({ action: 'dismiss' }) }); load(); };
      });
      document.querySelectorAll('[data-warn]').forEach((el) => {
        el.onclick = async () => { await api('/moderation/admin/reports/' + el.dataset.warn + '/action', { method: 'POST', body: JSON.stringify({ action: 'warn' }) }); load(); };
      });
      document.querySelectorAll('[data-ban]').forEach((el) => {
        el.onclick = async () => {
          if (!confirm('متأكد من حظر الحساب المُبلَّغ عنه بالكامل؟')) return;
          await api('/moderation/admin/reports/' + el.dataset.ban + '/action', { method: 'POST', body: JSON.stringify({ action: 'ban' }) });
          load();
        };
      });
    }
    on('rApply', 'click', load);
    load();
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
            <div><b>${escapeHtml(a.user_name)}</b> <span class="small">(${escapeHtml(a.user_email)})</span> · <span class="small">${escapeHtml(a.created_at)}</span></div>
            <div>
              ${a.blocked ? '<span class="badge blocked">اتمنعت</span>' : '<span class="badge review">للمراجعة</span>'}
              ${a.reasons.split(',').map((r) => `<span class="badge blocked" style="background:var(--surface-2); color:var(--text-dim);">${escapeHtml(REASON_LABELS[r] || r)}</span>`).join('')}
            </div>
            <div class="msg-text">${escapeHtml(a.message)}</div>
          </div>
        `).join('');
    }
    on('fApply', 'click', load);
    load();
  }

  const CATEGORY_LABELS = { payment: 'الدفع', booking: 'الحجز', account: 'الحساب', trainer: 'المدرب', technical: 'مشكلة تقنية', report: 'بلاغ', other: 'حاجة تانية' };
  const STATUS_LABELS = { open: 'مفتوحة', in_progress: 'قيد المعالجة', waiting_user: 'محتاجة رد اليوزر', resolved: 'اتحلت', closed: 'مقفولة' };
  const PRIORITY_LABELS = { low: 'منخفضة', normal: 'عادية', high: 'عالية', urgent: 'عاجلة' };

  async function showSupport() {
    activateTab('tabSupport');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>تذاكر الدعم الفني</h2>
        <div class="filters">
          <select id="sStatus"><option value="">كل الحالات</option>${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <select id="sPriority"><option value="">كل الأولويات</option>${Object.entries(PRIORITY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <select id="sCategory"><option value="">كل الأنواع</option>${Object.entries(CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <button id="sApply" style="width:auto; padding:8px 16px;">فلترة</button>
        </div>
        <div id="ticketsList"><p class="small">بيحمّل...</p></div>
      </div>
    `;
    async function load() {
      const params = new URLSearchParams();
      const status = document.getElementById('sStatus').value;
      const priority = document.getElementById('sPriority').value;
      const category = document.getElementById('sCategory').value;
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      if (category) params.set('category', category);
      const { tickets } = await api('/support/admin/all?' + params.toString());
      document.getElementById('ticketsList').innerHTML = tickets.length === 0
        ? '<p class="small">مفيش تذاكر.</p>'
        : tickets.map((tk) => `
          <div class="coach-row" data-open-ticket="${tk.id}">
            <div>
              <b>${escapeHtml(tk.subject)}</b> ${tk.unread ? '<span class="badge blocked">جديد</span>' : ''}
              <div class="small">${escapeHtml(tk.user_name)} (${tk.user_role === 'coach' ? 'مدرب' : 'متدرب'}) · ${CATEGORY_LABELS[tk.category]} · ${escapeHtml(tk.updated_at)}</div>
            </div>
            <div>
              <span class="badge ${tk.priority === 'urgent' || tk.priority === 'high' ? 'blocked' : 'review'}">${PRIORITY_LABELS[tk.priority]}</span>
              <div class="small">${STATUS_LABELS[tk.status]}</div>
            </div>
          </div>
        `).join('');
      document.querySelectorAll('[data-open-ticket]').forEach((el) => {
        el.onclick = () => showTicketDetail(el.dataset.openTicket);
      });
    }
    on('sApply', 'click', load);
    load();
  }

  async function showTicketDetail(ticketId) {
    const { ticket, messages, context } = await api('/support/admin/' + ticketId);
    document.getElementById('adminContent').innerHTML = `
      <button class="secondary" id="ticketBack" style="margin-bottom:12px;">← رجوع لكل التذاكر</button>
      <div class="card">
        <h2>${escapeHtml(ticket.subject)}</h2>
        <p class="small">${escapeHtml(ticket.user_name)} (${escapeHtml(ticket.user_email)}) · ${ticket.user_role === 'coach' ? 'مدرب' : 'متدرب'}${ticket.user_banned ? ' · <span style="color:var(--danger)">محظور</span>' : ''}</p>
        ${context && context.activeSubscription ? `<p class="small">${ticket.user_role === 'trainee' ? `مشترك حاليًا مع: ${escapeHtml(context.activeSubscription.coach_name)}` : `عدد المتدربين النشطين: ${context.activeSubscription.c}`}</p>` : ''}
        <div class="filters" style="margin-top:10px;">
          <select id="chStatus">${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${k === ticket.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <select id="chPriority">${Object.entries(PRIORITY_LABELS).map(([k, v]) => `<option value="${k}" ${k === ticket.priority ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <select id="chCategory">${Object.entries(CATEGORY_LABELS).map(([k, v]) => `<option value="${k}" ${k === ticket.category ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <button id="applyChanges" style="width:auto; padding:8px 16px;">حفظ</button>
        </div>
      </div>
      <div class="card" style="min-height:180px;">
        ${messages.map((m) => `
          <div class="msg ${m.sender_type === 'admin' ? 'me' : 'them'}">${escapeHtml(m.content)}</div>
        `).join('')}
      </div>
      <div class="card" style="display:flex; gap:8px;">
        <input id="adminReply" placeholder="اكتب ردك..." style="margin:0;">
        <button id="sendReply" style="width:90px;">إرسال</button>
      </div>
    `;
    document.getElementById('ticketBack').onclick = showSupport;
    on('sendReply', 'click', async () => {
      const input = document.getElementById('adminReply');
      const message = input.value.trim();
      if (!message) return;
      input.value = '';
      await api('/support/admin/' + ticketId + '/reply', { method: 'POST', body: JSON.stringify({ message }) });
      showTicketDetail(ticketId);
    });
    on('applyChanges', 'click', async () => {
      await api('/support/admin/' + ticketId + '/status', { method: 'POST', body: JSON.stringify({
        status: document.getElementById('chStatus').value,
        priority: document.getElementById('chPriority').value,
        category: document.getElementById('chCategory').value,
      })});
      showTicketDetail(ticketId);
    });
  }

  async function showReviews() {
    activateTab('tabReviews');
    const { reviews } = await api('/reviews/admin/all');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>مراجعة التقييمات</h2>
        ${reviews.length === 0 ? '<p class="small">مفيش تقييمات لسه.</p>' : reviews.map((r) => `
          <div class="card" style="background:var(--surface-2);">
            <div style="display:flex; justify-content:space-between;">
              <b>${escapeHtml(r.trainee_name)} ← ${escapeHtml(r.coach_name)}</b>
              <span style="color:#FFC94D;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
            </div>
            ${r.comment ? `<p style="font-size:12.5px; margin:6px 0;">${escapeHtml(r.comment)}</p>` : ''}
            ${r.hidden ? '<span class="badge blocked">مخفي</span>' : ''}
            <div style="display:flex; gap:8px; margin-top:6px;">
              ${r.hidden
                ? `<button data-restore="${r.id}">↩️ إظهار</button>`
                : `<button class="danger" data-hide="${r.id}">🚫 إخفاء</button>`}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    document.querySelectorAll('[data-hide]').forEach((el) => {
      el.onclick = async () => { await api('/reviews/admin/' + el.dataset.hide + '/hide', { method: 'POST' }); showReviews(); };
    });
    document.querySelectorAll('[data-restore]').forEach((el) => {
      el.onclick = async () => { await api('/reviews/admin/' + el.dataset.restore + '/restore', { method: 'POST' }); showReviews(); };
    });
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
            <b>${escapeHtml(u.name)}</b> <span class="small">(${escapeHtml(u.email)})</span>
            <p class="small">${u.role === 'coach' ? 'مدرب' : 'متدرب'} ${u.banned ? '· <span style="color:var(--danger)">محظور</span>' : ''} ${!u.verified ? '· <span style="color:var(--text-dim)">إيميل مش متأكد</span>' : ''}</p>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${!u.verified ? `<button data-verify="${u.id}">📧 تأكيد يدوي</button>` : ''}
              ${u.banned
                ? `<button data-unban="${u.id}">✅ إلغاء الحظر</button>`
                : `<button class="danger" data-ban="${u.id}">🚫 حظر</button>`}
              <button class="danger" data-delete="${u.id}">🗑️ حذف نهائي</button>
            </div>
          </div>
        `).join('');
      document.querySelectorAll('[data-verify]').forEach((el) => {
        el.onclick = async () => { await api(`/auth/admin/${el.dataset.verify}/verify`, { method: 'POST' }); load(); };
      });
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

  async function showSettings() {
    activateTab('tabSettings');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>تغيير الباسورد</h2>
        <p class="small">مسجل دخول بحساب: <b>${escapeHtml(admin.username)}</b></p>
        <div class="error hidden" id="pwErr"></div>
        <div class="small hidden" id="pwOk" style="color:var(--success); margin-bottom:10px;">✅ اتغيّر الباسورد</div>
        <input id="currentPassword" type="password" placeholder="الباسورد الحالي">
        <input id="newPassword" type="password" placeholder="الباسورد الجديد (10 حروف على الأقل)">
        <button id="changePw">حفظ</button>
      </div>
      <div class="card">
        <h2>النسخ الاحتياطية</h2>
        <p class="small" style="margin-bottom:10px;">نسخة يومية بتتعمل تلقائي وبتفضل محفوظة 7 أيام. نزّل نسخة بانتظام لجهازك عشان تبقى نسخة حقيقية بره السيرفر.</p>
        <div id="backupsList"><p class="small">بيحمّل...</p></div>
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

    try {
      const { backups } = await api('/admin/backups');
      document.getElementById('backupsList').innerHTML = backups.length === 0
        ? '<p class="small">مفيش نسخ لسه (بتتعمل أول واحدة عند تشغيل السيرفر).</p>'
        : backups.map((b) => `
          <div class="coach-row">
            <div>${escapeHtml(b.name)}<div class="small">${(b.size / 1024).toFixed(0)} KB · ${escapeHtml(b.createdAt)}</div></div>
            <a class="link" href="/api/admin/backups/${encodeURIComponent(b.name)}">تحميل</a>
          </div>
        `).join('');
    } catch (e) {
      document.getElementById('backupsList').innerHTML = `<p class="small">${escapeHtml(e.message)}</p>`;
    }
  }

  document.getElementById('tabPending').onclick = showPending;
  document.getElementById('tabSupport').onclick = showSupport;
  document.getElementById('tabReports').onclick = showReports;
  document.getElementById('tabFlagged').onclick = showFlagged;
  document.getElementById('tabReviews').onclick = showReviews;
  document.getElementById('tabUsers').onclick = showUsers;
  document.getElementById('tabSettings').onclick = showSettings;
  showPending();
  wireLogout();
}

boot();
