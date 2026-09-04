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

// بديل موحّد لنجوم ★/☆ النصية - نفس الفكرة المستخدمة في features.js.
function starRating(rating, size) {
  const r = Math.round(Number(rating) || 0);
  const s = size || 13;
  const filled = svgIconPro('star', s, 'color:#FFC94D;').replace('fill="none"', 'fill="currentColor"');
  const empty = svgIconPro('star', s, 'color:#FFC94D; opacity:.35;');
  let html = '';
  for (let i = 0; i < 5; i++) html += i < r ? filled : empty;
  return `<span style="display:inline-flex; align-items:center; gap:1px;">${html}</span>`;
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
  const isSuperAdmin = admin.role === 'SUPER_ADMIN';
  let stats = {
    users: 0, athletes: 0, coaches: 0, pendingCoachApprovals: 0, activeSubscriptions: 0,
    totalCommission: 0, totalCoachPayouts: 0, completedSessions: 0,
    checkInsSubmitted: 0, progressEntriesLogged: 0, openSupportTickets: 0, openUserReports: 0,
  };
  try { stats = await api('/admin/stats'); } catch (e) {}

  // كل رقم هنا استعلام حقيقي من القاعدة (routes/adminAuth.js /stats) -
  // مفيش أرقام مختلقة (Super Admin spec §12).
  render(`
    <div class="stat-row">
      <div class="stat-tile"><div class="num">${stats.users}</div><div class="label">يوزر</div></div>
      <div class="stat-tile"><div class="num">${stats.athletes}</div><div class="label">متدرب</div></div>
      <div class="stat-tile"><div class="num">${stats.coaches}</div><div class="label">مدرب معتمد</div></div>
      <div class="stat-tile"><div class="num">${stats.activeSubscriptions}</div><div class="label">اشتراك نشط</div></div>
    </div>
    <div class="stat-row">
      <div class="stat-tile"><div class="num">${stats.completedSessions}</div><div class="label">جلسة اتعملت</div></div>
      <div class="stat-tile"><div class="num">${stats.checkInsSubmitted}</div><div class="label">تشيك-إن</div></div>
      <div class="stat-tile"><div class="num">${stats.openSupportTickets}</div><div class="label">تذاكر مفتوحة</div></div>
      <div class="stat-tile"><div class="num">${stats.totalCommission}</div><div class="label">إجمالي العمولة (ج)</div></div>
    </div>
    <div class="tabs">
      <div class="tab active" id="tabPending">طلبات المدربين</div>
      <div class="tab" id="tabProfileEdits">تعديلات البروفايل</div>
      <div class="tab" id="tabDocs">مستندات المدربين</div>
      <div class="tab" id="tabSupport">تذاكر الدعم</div>
      <div class="tab" id="tabReports">بلاغات المستخدمين</div>
      <div class="tab" id="tabDeletions">طلبات حذف الحساب</div>
      <div class="tab" id="tabFlagged">محاولات التحايل</div>
      <div class="tab" id="tabReviews">التقييمات</div>
      <div class="tab" id="tabBookings">الحجوزات</div>
      <div class="tab" id="tabContent">محتوى المدربين</div>
      <div class="tab" id="tabUsers">المستخدمين</div>
      <div class="tab" id="tabAthletes">المتدربين (تفاصيل)</div>
      <div class="tab" id="tabSubscriptions">الاشتراكات والدفع</div>
      <div class="tab" id="tabExercises">مكتبة التمارين</div>
      <div class="tab" id="tabFoods">مكتبة الأطعمة</div>
      <div class="tab" id="tabAiCoach">AI Coach</div>
      ${isSuperAdmin ? '<div class="tab" id="tabAdmins">الأدمن والصلاحيات</div>' : ''}
      ${isSuperAdmin ? '<div class="tab" id="tabAudit">سجل التدقيق</div>' : ''}
      <div class="tab" id="tabSettings">الإعدادات</div>
    </div>
    <div id="adminContent"></div>
    ${logoutBtn()}
  `);

  const ALL_TABS = [
    'tabPending', 'tabProfileEdits', 'tabDocs', 'tabSupport', 'tabReports', 'tabDeletions', 'tabFlagged',
    'tabReviews', 'tabBookings', 'tabContent', 'tabUsers', 'tabAthletes', 'tabSubscriptions', 'tabExercises',
    'tabFoods', 'tabAiCoach', 'tabAdmins', 'tabAudit', 'tabSettings',
  ];
  function activateTab(id) {
    ALL_TABS.forEach((t) => {
      const el = document.getElementById(t);
      if (el) el.classList.toggle('active', t === id);
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
              <button data-approve="${p.id}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('check', 15)}موافقة</button>
              <button class="danger" data-reject="${p.id}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('close', 15)}رفض</button>
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

  const PROFILE_FIELD_LABELS = {
    specialty: 'التخصص', bio: 'النبذة', certification: 'الشهادة',
    price_1m: 'سعر الشهر', price_3m: 'سعر 3 شهور', price_6m: 'سعر 6 شهور',
    gender: 'الجنس', location: 'الموقع',
  };

  // بيبني جدول مقارنة قبل/بعد لبس الحقول اللي اتغيّرت فعلًا، عشان الأدمن
  // يشوف الفرق بسرعة بدل ما يقارن كل حقل يدوي.
  function renderEditDiff(edit) {
    const rows = Object.keys(PROFILE_FIELD_LABELS)
      .filter((f) => String(edit['live_' + f] ?? '') !== String(edit[f] ?? ''))
      .map((f) => `
        <div class="coach-row" style="display:block; padding:8px 0;">
          <b class="small">${PROFILE_FIELD_LABELS[f]}</b>
          <p class="small" style="color:var(--text-dim); margin:2px 0;">قبل: ${escapeHtml(String(edit['live_' + f] ?? '-') || '-')}</p>
          <p class="small" style="color:var(--red-soft); margin:2px 0;">بعد: ${escapeHtml(String(edit[f] ?? '-') || '-')}</p>
        </div>
      `).join('');
    return rows || '<p class="small">مفيش فروقات ظاهرة.</p>';
  }

  async function showProfileEdits() {
    activateTab('tabProfileEdits');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>تعديلات بروفايل مدربين معتمدين</h2>
        <p class="small">البروفايل العام فاضل زي ما هو (النسخة القديمة) لحد ما توافق أو ترفض هنا.</p>
        <div id="profileEditsList"><p class="small">بيحمّل...</p></div>
      </div>
    `;
    async function load() {
      const { edits } = await api('/coaches/admin/pending-edits');
      document.getElementById('profileEditsList').innerHTML = edits.length === 0
        ? '<p class="small">مفيش تعديلات قيد المراجعة.</p>'
        : edits.map((edit) => `
          <div class="card" style="background:var(--surface-2);">
            <b>${escapeHtml(edit.coach_name)}</b> <span class="small">(${escapeHtml(edit.coach_email)}) · ${escapeHtml(edit.created_at)}</span>
            ${renderEditDiff(edit)}
            <div style="display:flex; gap:8px; margin-top:6px;">
              <button data-approve-edit="${edit.id}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('check', 15)}موافقة</button>
              <button class="danger" data-reject-edit="${edit.id}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('close', 15)}رفض</button>
            </div>
          </div>
        `).join('');
      document.querySelectorAll('[data-approve-edit]').forEach((el) => {
        el.onclick = async () => { await api(`/coaches/admin/edits/${el.dataset.approveEdit}/approve`, { method: 'POST' }); load(); };
      });
      document.querySelectorAll('[data-reject-edit]').forEach((el) => {
        el.onclick = async () => {
          const note = prompt('سبب الرفض (اختياري):') || '';
          await api(`/coaches/admin/edits/${el.dataset.rejectEdit}/reject`, { method: 'POST', body: JSON.stringify({ note }) });
          load();
        };
      });
    }
    load();
  }

  const DOC_TYPE_LABELS = { id: 'بطاقة شخصية', certification: 'شهادة', other: 'مستند تاني' };
  const DOC_STATUS_LABELS = { pending: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض' };

  async function showTrainerDocuments() {
    activateTab('tabDocs');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>مستندات المدربين</h2>
        <div class="filters">
          <select id="tdStatus">
            <option value="pending">قيد المراجعة</option>
            <option value="">كل الحالات</option>
            <option value="approved">معتمدة</option>
            <option value="rejected">مرفوضة</option>
          </select>
          <button id="tdApply" style="width:auto; padding:8px 16px;">فلترة</button>
        </div>
        <div id="docsList"><p class="small">بيحمّل...</p></div>
      </div>
    `;
    async function load() {
      const params = new URLSearchParams();
      const status = document.getElementById('tdStatus').value;
      if (status) params.set('status', status);
      const { documents } = await api('/trainer-documents/admin/all?' + params.toString());
      document.getElementById('docsList').innerHTML = documents.length === 0
        ? '<p class="small">مفيش مستندات.</p>'
        : documents.map((d) => `
          <div class="card" style="background:var(--surface-2);">
            <div style="display:flex; justify-content:space-between;">
              <b>${escapeHtml(d.coach_name)}</b>
              <span class="badge ${d.status === 'pending' ? 'blocked' : 'review'}">${DOC_STATUS_LABELS[d.status]}</span>
            </div>
            <p class="small">${escapeHtml(d.coach_email)} · ${DOC_TYPE_LABELS[d.doc_type]} · ${escapeHtml(d.name)} · ${escapeHtml(d.created_at)}</p>
            ${d.review_note ? `<p class="small">ملاحظة: ${escapeHtml(d.review_note)}</p>` : ''}
            <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
              <a class="secondary" href="/api/trainer-documents/${d.id}/file" target="_blank" rel="noopener" style="width:auto; padding:8px 14px; border-radius:8px; text-decoration:none; font-size:12.5px; font-weight:700; display:inline-block;">${svgIconPro('document', 14)} عرض</a>
              ${d.status === 'pending' ? `
                <button data-approve-doc="${d.id}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('check', 15)}موافقة</button>
                <button class="danger" data-reject-doc="${d.id}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('close', 15)}رفض</button>
              ` : ''}
            </div>
          </div>
        `).join('');
      document.querySelectorAll('[data-approve-doc]').forEach((el) => {
        el.onclick = async () => { await api(`/trainer-documents/admin/${el.dataset.approveDoc}/review`, { method: 'POST', body: JSON.stringify({ action: 'approve' }) }); load(); };
      });
      document.querySelectorAll('[data-reject-doc]').forEach((el) => {
        el.onclick = async () => {
          const note = prompt('سبب الرفض (اختياري):') || '';
          await api(`/trainer-documents/admin/${el.dataset.rejectDoc}/review`, { method: 'POST', body: JSON.stringify({ action: 'reject', note }) });
          load();
        };
      });
    }
    on('tdApply', 'click', load);
    load();
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
                <button data-dismiss="${r.id}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('close', 15)}تجاهل</button>
                <button data-warn="${r.id}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('message', 15)}تحذير بالإيميل</button>
                <button class="danger" data-ban="${r.id}">حظر الحساب</button>
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

  const DELETION_STATUS_LABELS = { pending: 'مفتوح', completed: 'اتحذف', rejected: 'اترفض' };

  async function showDeletionRequests() {
    activateTab('tabDeletions');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>طلبات حذف الحساب</h2>
        <div class="filters">
          <select id="dStatus">
            <option value="pending">مفتوحة</option>
            <option value="">كل الحالات</option>
            <option value="completed">اتحذفت</option>
            <option value="rejected">اترفضت</option>
          </select>
          <button id="dApply" style="width:auto; padding:8px 16px;">فلترة</button>
        </div>
        <div id="deletionsList"><p class="small">بيحمّل...</p></div>
      </div>
    `;
    async function load() {
      const params = new URLSearchParams();
      const status = document.getElementById('dStatus').value;
      if (status) params.set('status', status);
      const { requests } = await api('/account-deletion/admin/all?' + params.toString());
      document.getElementById('deletionsList').innerHTML = requests.length === 0
        ? '<p class="small">مفيش طلبات.</p>'
        : requests.map((r) => `
          <div class="card" style="background:var(--surface-2);">
            <div style="display:flex; justify-content:space-between;">
              <b>${escapeHtml(r.email)}</b>
              <span class="badge ${r.status === 'pending' ? 'blocked' : 'review'}">${DELETION_STATUS_LABELS[r.status]}</span>
            </div>
            <p class="small">${escapeHtml(r.created_at)}</p>
            ${r.matchingUser
              ? `<p class="small">حساب مطابق: ${r.matchingUser.role === 'coach' ? 'مدرب' : 'متدرب'} #${r.matchingUser.id}${r.matchingUser.banned ? ' · <span style="color:var(--danger)">محظور بالفعل</span>' : ''}</p>`
              : `<p class="small" style="color:var(--danger);">مفيش حساب مسجل بالإيميل ده حاليًا</p>`}
            ${r.reason ? `<p style="font-size:12.5px; margin:6px 0;">${escapeHtml(r.reason)}</p>` : ''}
            ${r.status === 'pending' ? `
              <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
                <button class="danger" data-approve="${r.id}" ${!r.matchingUser ? 'disabled' : ''} style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('trash', 15)}موافقة وحذف الحساب</button>
                <button class="secondary" data-reject="${r.id}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('close', 15)}رفض</button>
              </div>
            ` : ''}
          </div>
        `).join('');
      document.querySelectorAll('[data-approve]').forEach((el) => {
        el.onclick = async () => {
          if (!confirm('متأكد من حذف الحساب ده وكل بياناته نهائيًا؟ الإجراء ده مش هينفع يترجع')) return;
          try {
            await api('/account-deletion/admin/' + el.dataset.approve + '/approve', { method: 'POST' });
            load();
          } catch (e) { alert(e.message); }
        };
      });
      document.querySelectorAll('[data-reject]').forEach((el) => {
        el.onclick = async () => { await api('/account-deletion/admin/' + el.dataset.reject + '/reject', { method: 'POST' }); load(); };
      });
    }
    on('dApply', 'click', load);
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
    const [{ reviews }, { reports }] = await Promise.all([
      api('/reviews/admin/all'),
      api('/reviews/admin/reports?status=open'),
    ]);
    document.getElementById('adminContent').innerHTML = `
      ${reports.length > 0 ? `
      <div class="card">
        <h2>بلاغات على تقييمات (${reports.length})</h2>
        ${reports.map((r) => `
          <div class="card" style="background:var(--surface-2);">
            <div style="display:flex; justify-content:space-between;">
              <b>بلاغ من ${escapeHtml(r.reporter_name)}</b>
              <span class="badge blocked">مفتوح</span>
            </div>
            <p class="small">على تقييم ${escapeHtml(r.trainee_name)}: ${starRating(r.rating)} ${r.review_hidden ? '· <span style="color:var(--danger)">التقييم مخفي بالفعل</span>' : ''}</p>
            ${r.comment ? `<p style="font-size:12.5px; margin:6px 0;">${escapeHtml(r.comment)}</p>` : ''}
            ${r.reason ? `<p class="small">سبب البلاغ: ${escapeHtml(r.reason)}</p>` : ''}
            <div style="display:flex; gap:8px; margin-top:6px;">
              <button data-dismiss-report="${r.id}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('close', 15)}تجاهل البلاغ</button>
              ${!r.review_hidden ? `<button class="danger" data-hide-report="${r.id}">إخفاء التقييم</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>` : ''}
      <div class="card">
        <h2>مراجعة التقييمات</h2>
        ${reviews.length === 0 ? '<p class="small">مفيش تقييمات لسه.</p>' : reviews.map((r) => `
          <div class="card" style="background:var(--surface-2);">
            <div style="display:flex; justify-content:space-between;">
              <b>${escapeHtml(r.trainee_name)} ← ${escapeHtml(r.coach_name)}</b>
              <span>${starRating(r.rating)}</span>
            </div>
            ${r.comment ? `<p style="font-size:12.5px; margin:6px 0;">${escapeHtml(r.comment)}</p>` : ''}
            ${r.hidden ? '<span class="badge blocked">مخفي</span>' : ''}
            <div style="display:flex; gap:8px; margin-top:6px;">
              ${r.hidden
                ? `<button data-restore="${r.id}">إظهار</button>`
                : `<button class="danger" data-hide="${r.id}">إخفاء</button>`}
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
    document.querySelectorAll('[data-dismiss-report]').forEach((el) => {
      el.onclick = async () => { await api('/reviews/admin/reports/' + el.dataset.dismissReport + '/action', { method: 'POST', body: JSON.stringify({ action: 'dismiss' }) }); showReviews(); };
    });
    document.querySelectorAll('[data-hide-report]').forEach((el) => {
      el.onclick = async () => { await api('/reviews/admin/reports/' + el.dataset.hideReport + '/action', { method: 'POST', body: JSON.stringify({ action: 'hide' }) }); showReviews(); };
    });
  }

  const BOOKING_STATUS_LABELS = { scheduled: 'محجوزة', completed: 'اتعملت', cancelled: 'ملغية', no_show: 'متغيّب عنها' };

  async function showBookings() {
    activateTab('tabBookings');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>كل الحجوزات</h2>
        <div class="filters">
          <select id="bStatus">
            <option value="">كل الحالات</option>
            <option value="scheduled">محجوزة</option>
            <option value="completed">اتعملت</option>
            <option value="cancelled">ملغية</option>
            <option value="no_show">متغيّب عنها</option>
          </select>
          <select id="bRange">
            <option value="">كل الأوقات</option>
            <option value="today">النهاردة</option>
            <option value="week">الأسبوع ده</option>
          </select>
          <input id="bSearch" placeholder="بحث بإيميل/اسم المدرب أو المتدرب">
          <button id="bApply" style="width:auto; padding:8px 16px;">فلترة</button>
        </div>
        <div id="bookingsList"><p class="small">بيحمّل...</p></div>
      </div>
    `;
    async function load() {
      const params = new URLSearchParams();
      const status = document.getElementById('bStatus').value;
      const range = document.getElementById('bRange').value;
      const q = document.getElementById('bSearch').value.trim();
      if (status) params.set('status', status);
      if (range) params.set('range', range);
      if (q) params.set('q', q);
      const { sessions } = await api('/sessions/admin/all?' + params.toString());
      document.getElementById('bookingsList').innerHTML = sessions.length === 0
        ? '<p class="small">مفيش حجوزات مطابقة.</p>'
        : sessions.map((s) => `
          <div class="card" style="background:var(--surface-2);">
            <div style="display:flex; justify-content:space-between;">
              <b>${escapeHtml(s.trainee_name)} ← ${escapeHtml(s.coach_name)}</b>
              <span class="badge ${s.status === 'cancelled' || s.status === 'no_show' ? 'blocked' : ''}">${BOOKING_STATUS_LABELS[s.status] || s.status}</span>
            </div>
            <p class="small">${new Date(s.scheduled_at).toLocaleString('ar-EG')}</p>
            <p class="small">الباقة: ${escapeHtml(s.package)} · ${s.amount} ج · حالة الاشتراك: ${escapeHtml(s.subscription_status)}</p>
            ${s.notes ? `<p style="font-size:12.5px; margin:6px 0;">${escapeHtml(s.notes)}</p>` : ''}
          </div>
        `).join('');
    }
    on('bApply', 'click', load);
    load();
  }

  const POST_CATEGORY_LABELS_ADMIN = { tip: 'نصيحة تدريبية', educational: 'محتوى تعليمي', exercise: 'محتوى تمارين', transformation: 'قصة تحوّل', motivation: 'تحفيز', announcement: 'إعلان' };

  async function showContent() {
    activateTab('tabContent');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>محتوى المدربين</h2>
        <div id="contentList"><p class="small">بيحمّل...</p></div>
      </div>
    `;
    async function load() {
      const { posts } = await api('/content/admin/all');
      document.getElementById('contentList').innerHTML = posts.length === 0
        ? '<p class="small">مفيش منشورات لسه.</p>'
        : posts.map((p) => `
          <div class="card" style="background:var(--surface-2);">
            <div style="display:flex; justify-content:space-between;">
              <b>${escapeHtml(p.coach_name)}</b>
              <span class="small">${POST_CATEGORY_LABELS_ADMIN[p.category] || p.category}</span>
            </div>
            <p class="small">${escapeHtml(p.coach_email)} · ${escapeHtml(p.created_at)}</p>
            <p style="font-size:12.5px; margin:6px 0;">${escapeHtml(p.content)}</p>
            ${p.photo_path ? `<img src="/uploads/${encodeURIComponent(p.photo_path)}" style="max-width:200px; border-radius:8px; margin-bottom:6px;">` : ''}
            ${p.hidden ? '<span class="badge blocked">مخفي</span>' : ''}
            <div style="display:flex; gap:8px; margin-top:6px;">
              ${p.hidden
                ? `<button data-restore-post="${p.id}">إظهار</button>`
                : `<button class="danger" data-hide-post="${p.id}">إخفاء</button>`}
            </div>
          </div>
        `).join('');
      document.querySelectorAll('[data-hide-post]').forEach((el) => {
        el.onclick = async () => { await api('/content/admin/' + el.dataset.hidePost + '/hide', { method: 'POST' }); load(); };
      });
      document.querySelectorAll('[data-restore-post]').forEach((el) => {
        el.onclick = async () => { await api('/content/admin/' + el.dataset.restorePost + '/restore', { method: 'POST' }); load(); };
      });
    }
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
            <b>${escapeHtml(u.name)}</b> <span class="small">(${escapeHtml(u.email)})</span>
            <p class="small">${u.role === 'coach' ? 'مدرب' : 'متدرب'} ${u.banned ? '· <span style="color:var(--danger)">محظور</span>' : ''} ${!u.verified ? '· <span style="color:var(--text-dim)">إيميل مش متأكد</span>' : ''}</p>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${!u.verified ? `<button data-verify="${u.id}">تأكيد يدوي</button>` : ''}
              ${u.banned
                ? `<button data-unban="${u.id}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('check', 15)}إلغاء الحظر</button>`
                : `<button class="danger" data-ban="${u.id}">حظر</button>`}
              <button class="danger" data-delete="${u.id}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px;">${svgIconPro('trash', 15)}حذف نهائي</button>
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

  // -------------------- المتدربين (سياق كامل) --------------------

  async function showAthletes() {
    activateTab('tabAthletes');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>المتدربين</h2>
        <p class="small" style="margin-bottom:10px;">افتح أي متدرب عشان تشوف: التقييم اللي ملأه، خطة التمرين والتغذية اللي بناها الكوتش، تقدمه، عاداته، شارات إنجازه.</p>
        <div class="filters">
          <input id="atSearch" placeholder="بحث بالاسم أو الإيميل">
          <button id="atApply" style="width:auto; padding:8px 16px;">بحث</button>
        </div>
        <div id="athletesList"><p class="small">بيحمّل...</p></div>
      </div>
    `;
    async function load() {
      const q = document.getElementById('atSearch').value;
      const params = q ? '?q=' + encodeURIComponent(q) : '';
      const { trainees } = await api('/athletes' + params);
      document.getElementById('athletesList').innerHTML = trainees.length === 0
        ? '<p class="small">مفيش نتايج.</p>'
        : trainees.map((t) => `
          <div class="coach-row" ${t.latest_subscription_id ? `data-open-athlete="${t.latest_subscription_id}"` : ''}>
            <div>
              <b>${escapeHtml(t.name)}</b>
              <div class="small">${escapeHtml(t.email)} ${t.banned ? '· <span style="color:var(--danger)">محظور</span>' : ''}</div>
            </div>
            <div class="small">${t.latest_coach_name ? 'مع: ' + escapeHtml(t.latest_coach_name) : 'مفيش اشتراك'}</div>
          </div>
        `).join('');
      document.querySelectorAll('[data-open-athlete]').forEach((el) => {
        el.onclick = () => showAthleteDetail(el.dataset.openAthlete);
      });
    }
    on('atApply', 'click', load);
    load();
  }

  async function showAthleteDetail(subscriptionId) {
    const data = await api('/athletes/' + subscriptionId);
    const { subscription, assessment, workoutPlan, nutritionPlan, progressEntries, habits, badges, checkIns, transformationCount } = data;
    document.getElementById('adminContent').innerHTML = `
      <button class="secondary" id="athleteBack" style="margin-bottom:12px;">← رجوع لكل المتدربين</button>
      <div class="card">
        <h2>${escapeHtml(subscription.trainee_name)}</h2>
        <p class="small">${escapeHtml(subscription.trainee_email)} · الكوتش: ${escapeHtml(subscription.coach_name)} · حالة الاشتراك: ${escapeHtml(subscription.status)}</p>
      </div>
      <div class="card">
        <h2>التقييم (Assessment)</h2>
        ${!assessment ? '<p class="small">لسه ملأش التقييم.</p>' : `
          <p class="small">اتبعت: ${escapeHtml(assessment.submittedAt || 'لسه')}</p>
          ${assessment.answers.map((a) => `<div class="coach-row" style="display:block; padding:6px 0;"><b class="small">${escapeHtml(a.label)}</b><p class="small" style="margin:2px 0;">${escapeHtml(JSON.stringify(a.answer))}</p></div>`).join('')}
        `}
      </div>
      <div class="card">
        <h2>خطة التمرين</h2>
        ${!workoutPlan ? '<p class="small">مفيش خطة اتبنت لسه.</p>' : `<p class="small">${escapeHtml(workoutPlan.title || '-')} · ${workoutPlan.days.length} يوم · آخر تحديث: ${escapeHtml(workoutPlan.updatedAt)}</p>`}
      </div>
      <div class="card">
        <h2>خطة التغذية</h2>
        ${!nutritionPlan ? '<p class="small">مفيش خطة اتبنت لسه.</p>' : `<p class="small">${nutritionPlan.dailyCalories || '-'} سعرة/يوم · ${nutritionPlan.meals.length} وجبة</p>`}
      </div>
      <div class="card">
        <h2>التقدم (${progressEntries.length})</h2>
        ${progressEntries.slice(0, 5).map((p) => `<p class="small">${escapeHtml(p.created_at)} — ${p.weight_kg ? p.weight_kg + ' كجم' : ''} ${p.note ? '· ' + escapeHtml(p.note) : ''}</p>`).join('') || '<p class="small">مفيش تسجيلات.</p>'}
      </div>
      <div class="card">
        <h2>العادات</h2>
        ${habits.map((h) => `<p class="small">${escapeHtml(h.label)} — اتعمل ${h.doneLast30Days} مرة آخر 30 يوم</p>`).join('') || '<p class="small">مفيش عادات متابَعة.</p>'}
      </div>
      <div class="card">
        <h2>الشارات (${badges.length}) · تشيك-إن (${checkIns.length}) · صور تحوّل (${transformationCount})</h2>
      </div>
    `;
    document.getElementById('athleteBack').onclick = showAthletes;
  }

  // -------------------- الاشتراكات والدفع --------------------

  const SUB_STATUS_LABELS = { pending_payment: 'في انتظار الدفع', active: 'نشط', expired: 'منتهي', cancelled: 'ملغي' };

  async function showSubscriptions() {
    activateTab('tabSubscriptions');
    document.getElementById('adminContent').innerHTML = `<div class="card"><h2>الاشتراكات والدفع</h2><div id="subsList"><p class="small">بيحمّل...</p></div></div>`;
    const { subscriptions } = await api('/subscriptions/admin/all');
    document.getElementById('subsList').innerHTML = subscriptions.length === 0
      ? '<p class="small">مفيش اشتراكات.</p>'
      : subscriptions.slice(0, 200).map((s) => `
        <div class="coach-row">
          <div>
            <b>${escapeHtml(s.trainee_name)} ← ${escapeHtml(s.coach_name)}</b>
            <div class="small">الباقة: ${escapeHtml(s.package)} · ${s.amount} ج · ${escapeHtml(s.created_at)}</div>
          </div>
          <span class="badge ${s.status === 'active' ? '' : s.status === 'cancelled' ? 'blocked' : 'review'}">${SUB_STATUS_LABELS[s.status] || s.status}</span>
        </div>
      `).join('');
  }

  // -------------------- مكتبة التمارين/الأطعمة العامة (Super Admin) --------------------

  async function showExercisesAdmin() {
    activateTab('tabExercises');
    document.getElementById('adminContent').innerHTML = `<div class="card"><h2>مكتبة التمارين العامة</h2><p class="small" style="margin-bottom:10px;">دي التمارين المتاحة لكل المدربين (مش تمارين مدرب معيّن). إضافة/تعديل/حذف محصورة على Super Admin.</p><div id="exList"><p class="small">بيحمّل...</p></div></div>`;
    try {
      const { exercises } = await api('/exercises/admin/all');
      document.getElementById('exList').innerHTML = exercises.length === 0
        ? '<p class="small">مفيش تمارين عامة.</p>'
        : `<p class="small">${exercises.length} تمرين. ${exercises.slice(0, 30).map((e) => escapeHtml(e.name)).join('، ')}${exercises.length > 30 ? '...' : ''}</p>`;
    } catch (e) {
      document.getElementById('exList').innerHTML = `<p class="small">${escapeHtml(e.message)}</p>`;
    }
  }

  async function showFoodsAdmin() {
    activateTab('tabFoods');
    document.getElementById('adminContent').innerHTML = `<div class="card"><h2>مكتبة الأطعمة العامة</h2><p class="small" style="margin-bottom:10px;">القيم الغذائية دي مدخلة يدويًا فقط - مفيش أرقام مختلقة تلقائيًا. إضافة/تعديل/حذف محصورة على Super Admin.</p><div id="foodList"><p class="small">بيحمّل...</p></div></div>`;
    try {
      const { foods } = await api('/foods/admin/all');
      document.getElementById('foodList').innerHTML = foods.length === 0
        ? '<p class="small">مفيش أطعمة عامة.</p>'
        : `<p class="small">${foods.length} صنف. ${foods.slice(0, 30).map((f) => escapeHtml(f.name)).join('، ')}${foods.length > 30 ? '...' : ''}</p>`;
    } catch (e) {
      document.getElementById('foodList').innerHTML = `<p class="small">${escapeHtml(e.message)}</p>`;
    }
  }

  // -------------------- AI Coach --------------------
  // Honest architecture note (spec §11: "do NOT fake unsupported admin
  // functionality"). This backend is a coach-assigns-a-plan marketplace; it
  // does not run the deterministic Coaching Engine (intents/coaching-rules/
  // readiness/progression/weekly-coaching/travel-competition rules) that
  // exists in the separate client-only TRAINO rebuild, which has no server
  // and sends nothing here. There is nothing to configure server-side.

  function showAiCoach() {
    activateTab('tabAiCoach');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>AI Coach</h2>
        <p class="small">مفيش محرك ذكاء اصطناعي/قواعد آلية شغال على السيرفر ده حاليًا. المنصة دي مبنية على مبدأ "الكوتش البني-آدم بيبني الخطة يدويًا" - مفيش intents ولا coaching rules ولا readiness rules ولا progression rules متخزنة أو شغالة هنا يتم إدارتها.</p>
        <p class="small" style="margin-top:8px;">فيه محرك تدريب آلي (Deterministic Coaching Engine) موجود فعلاً في نسخة تانية من التطبيق (TRAINO rebuild) - لكنه شغال بالكامل على جهاز المستخدم (client-side فقط)، من غير أي سيرفر أو قاعدة بيانات، ومش متصل بالباك إند ده خالص. عشان كده مفيش حاجة نعرضها أو نتحكم فيها هنا بدون ما نختلق بيانات مش موجودة فعلاً.</p>
      </div>
    `;
  }

  // -------------------- الأدمن والصلاحيات (Super Admin فقط) --------------------

  const ADMIN_ROLE_LABELS = { ADMIN: 'ADMIN', SUPER_ADMIN: 'SUPER_ADMIN' };

  async function showAdmins() {
    activateTab('tabAdmins');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>إنشاء حساب أدمن جديد</h2>
        <div class="error hidden" id="newAdminErr"></div>
        <input id="newAdminUsername" placeholder="اليوزرنيم">
        <input id="newAdminPassword" type="password" placeholder="الباسورد (10 حروف على الأقل)">
        <select id="newAdminRole"><option value="ADMIN">ADMIN</option><option value="SUPER_ADMIN">SUPER_ADMIN</option></select>
        <button id="createAdminBtn">إنشاء</button>
      </div>
      <div class="card">
        <h2>كل حسابات الأدمن</h2>
        <div id="adminsList"><p class="small">بيحمّل...</p></div>
      </div>
    `;
    async function load() {
      const { admins } = await api('/admins');
      document.getElementById('adminsList').innerHTML = admins.map((a) => `
        <div class="coach-row">
          <div>
            <b>${escapeHtml(a.username)}</b> ${a.id === admin.id ? '<span class="small">(انت)</span>' : ''}
            <div class="small">${ADMIN_ROLE_LABELS[a.role] || a.role} ${a.status === 'suspended' ? '· <span style="color:var(--danger)">معلّق</span>' : ''}</div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${a.id === admin.id ? '' : a.role === 'ADMIN'
              ? `<button data-promote="${a.id}" style="width:auto; padding:6px 12px; font-size:11.5px;">رقّي لـ SUPER_ADMIN</button>`
              : `<button data-demote="${a.id}" style="width:auto; padding:6px 12px; font-size:11.5px;">نزّل لـ ADMIN</button>`}
            ${a.id === admin.id ? '' : a.status === 'suspended'
              ? `<button data-restore-admin="${a.id}" style="width:auto; padding:6px 12px; font-size:11.5px;">${svgIconPro('check', 13)}إلغاء التعليق</button>`
              : `<button class="danger" data-suspend-admin="${a.id}" style="width:auto; padding:6px 12px; font-size:11.5px;">تعليق</button>`}
          </div>
        </div>
      `).join('');
      document.querySelectorAll('[data-promote]').forEach((el) => {
        el.onclick = async () => { try { await api(`/admins/${el.dataset.promote}/role`, { method: 'PATCH', body: JSON.stringify({ role: 'SUPER_ADMIN' }) }); load(); } catch (e) { alert(e.message); } };
      });
      document.querySelectorAll('[data-demote]').forEach((el) => {
        el.onclick = async () => { try { await api(`/admins/${el.dataset.demote}/role`, { method: 'PATCH', body: JSON.stringify({ role: 'ADMIN' }) }); load(); } catch (e) { alert(e.message); } };
      });
      document.querySelectorAll('[data-suspend-admin]').forEach((el) => {
        el.onclick = async () => { if (!confirm('متأكد من تعليق حساب الأدمن ده؟')) return; try { await api(`/admins/${el.dataset.suspendAdmin}/suspend`, { method: 'POST' }); load(); } catch (e) { alert(e.message); } };
      });
      document.querySelectorAll('[data-restore-admin]').forEach((el) => {
        el.onclick = async () => { await api(`/admins/${el.dataset.restoreAdmin}/restore`, { method: 'POST' }); load(); };
      });
    }
    on('createAdminBtn', 'click', async () => {
      const errEl = document.getElementById('newAdminErr');
      errEl.classList.add('hidden');
      try {
        await api('/admins', { method: 'POST', body: JSON.stringify({
          username: document.getElementById('newAdminUsername').value,
          password: document.getElementById('newAdminPassword').value,
          role: document.getElementById('newAdminRole').value,
        })});
        document.getElementById('newAdminUsername').value = '';
        document.getElementById('newAdminPassword').value = '';
        load();
      } catch (e) {
        errEl.textContent = e.message; errEl.classList.remove('hidden');
      }
    });
    load();
  }

  // -------------------- سجل التدقيق (Super Admin فقط) --------------------

  async function showAuditLog() {
    activateTab('tabAudit');
    document.getElementById('adminContent').innerHTML = `<div class="card"><h2>سجل التدقيق</h2><p class="small" style="margin-bottom:10px;">سجل دائم لكل الحاجات المهمة اللي أي أدمن عملها - بيتضاف عليه بس، محدش يقدر يعدّله أو يمسحه.</p><div id="auditList"><p class="small">بيحمّل...</p></div></div>`;
    const { entries } = await api('/admin/audit-log');
    document.getElementById('auditList').innerHTML = entries.length === 0
      ? '<p class="small">مفيش حاجة متسجلة لسه.</p>'
      : entries.map((e) => `
        <div class="attempt-row">
          <div><b>${escapeHtml(e.action)}</b> ${e.success ? '' : '<span class="badge blocked">اترفض</span>'} <span class="small">· ${escapeHtml(e.admin_username || '-')} · ${escapeHtml(e.created_at)}</span></div>
          <div class="small">${escapeHtml(e.resource_type)}${e.resource_id ? ' #' + escapeHtml(e.resource_id) : ''}</div>
        </div>
      `).join('');
  }

  async function showSettings() {
    activateTab('tabSettings');
    document.getElementById('adminContent').innerHTML = `
      <div class="card">
        <h2>تغيير الباسورد</h2>
        <p class="small">مسجل دخول بحساب: <b>${escapeHtml(admin.username)}</b></p>
        <div class="error hidden" id="pwErr"></div>
        <div class="small hidden" id="pwOk" style="color:var(--success); margin-bottom:10px; display:flex; align-items:center; gap:5px;">${svgIconPro('check', 13)}اتغيّر الباسورد</div>
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
  document.getElementById('tabProfileEdits').onclick = showProfileEdits;
  document.getElementById('tabDocs').onclick = showTrainerDocuments;
  document.getElementById('tabDeletions').onclick = showDeletionRequests;
  document.getElementById('tabFlagged').onclick = showFlagged;
  document.getElementById('tabReviews').onclick = showReviews;
  document.getElementById('tabBookings').onclick = showBookings;
  document.getElementById('tabContent').onclick = showContent;
  document.getElementById('tabUsers').onclick = showUsers;
  document.getElementById('tabAthletes').onclick = showAthletes;
  document.getElementById('tabSubscriptions').onclick = showSubscriptions;
  document.getElementById('tabExercises').onclick = showExercisesAdmin;
  document.getElementById('tabFoods').onclick = showFoodsAdmin;
  document.getElementById('tabAiCoach').onclick = showAiCoach;
  if (isSuperAdmin) {
    document.getElementById('tabAdmins').onclick = showAdmins;
    document.getElementById('tabAudit').onclick = showAuditLog;
  }
  document.getElementById('tabSettings').onclick = showSettings;
  showPending();
  wireLogout();
}

boot();
