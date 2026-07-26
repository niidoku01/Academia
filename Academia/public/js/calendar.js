/* ========== CALENDAR PAGE ========== */

let currentDate = new Date();
let currentUserRole = '';

if (checkAuth()) {
  const user = getUser();
  currentUserRole = user.role;
  renderSidebar('calendar');
  if (user.role === 'lecturer' || user.role === 'admin') {
    document.getElementById('add-event-btn').style.display = 'inline-flex';
  }
  if (user.role === 'lecturer') {
    document.getElementById('event-submit-hint').style.display = 'block';
    document.getElementById('event-submit-btn').textContent = 'Submit Event';
  }
  renderCalendar();
}

function changeMonth(delta) {
  currentDate.setMonth(currentDate.getMonth() + delta);
  renderCalendar();
}

function goToday() {
  currentDate = new Date();
  renderCalendar();
}

async function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  document.getElementById('cal-month-year').textContent = new Date(year, month).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

  const events = await apiGet(`/api/calendar?year=${year}&month=${month + 1}`);
  if (!events) return;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let html = dayNames.map(d => `<div class="cal-header">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    const dayEvents = events.filter(e => e.event_date && e.event_date.startsWith(dateStr));

    html += `
      <div class="cal-day ${isToday ? 'today' : ''}">
        <div class="day-num">${d}</div>
        ${dayEvents.map(e => `<div class="cal-event ${e.event_type}" title="${e.title}">${e.title}</div>`).join('')}
      </div>
    `;
  }

  document.getElementById('calendar-grid').innerHTML = html;

  const upcoming = events.filter(e => new Date(e.event_date) >= today).slice(0, 10);
  document.getElementById('events-list').innerHTML = upcoming.length === 0
    ? '<div class="empty-state"><div class="icon"><i data-lucide="calendar"></i></div><p>No upcoming events</p></div>'
    : upcoming.map(e => `
      <div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--border)">
        <div class="stat-icon ${e.event_type==='exam'?'red':e.event_type==='assignment'?'orange':'blue'}" style="width:44px;height:44px;border-radius:10px;font-size:1.2rem;flex-shrink:0">
          ${e.event_type==='exam'?'<i data-lucide="clipboard-list"></i>':e.event_type==='assignment'?'<i data-lucide="file-text"></i>':e.event_type==='holiday'?'<i data-lucide="party-popper"></i>':'<i data-lucide="calendar"></i>'}
        </div>
        <div style="flex:1">
          <h4 style="font-size:0.95rem">${e.title}</h4>
          <p style="font-size:0.82rem;color:var(--text-secondary)">${formatDateTime(e.event_date)} ${e.course_code ? '&middot; ' + e.course_code : ''}</p>
        </div>
        <span class="badge badge-${e.event_type==='exam'?'danger':e.event_type==='assignment'?'warning':'primary'}">${e.event_type}</span>
        ${currentUserRole === 'lecturer' && e.status ? `<span class="badge badge-${e.status==='approved'?'success':e.status==='rejected'?'danger':'warning'}">${e.status}</span>` : ''}
      </div>
    `).join('');
  lucide.createIcons();
}

async function createEvent(e) {
  e.preventDefault();
  const res = await apiPost('/api/calendar', {
    title: document.getElementById('ev-title').value,
    description: document.getElementById('ev-desc').value,
    event_date: document.getElementById('ev-start').value,
    end_date: document.getElementById('ev-end').value || null,
    event_type: document.getElementById('ev-type').value,
    school: document.getElementById('ev-school').value || null,
  });
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast(res.message || 'Event added!', 'success');
  hideModal('event-modal');
  renderCalendar();
}
