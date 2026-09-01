// شاشات الميزات الإضافية (خطط، تقدم، عادات، جلسات، إنجازات، لوحة أداء
// الكوتش). بتستخدم نفس المساعدات العامة من app.js (render, on, api, state,
// escapeHtml, t, getLang) وبتتحمّل قبله في index.html.

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
  `);
  wireHubNav(subscriptionId, 'sessions');

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
