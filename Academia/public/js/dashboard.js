/* ========== DASHBOARD PAGE ========== */

if (checkAuth()) {
  const user = getUser();
  renderSidebar('dashboard');
  document.getElementById('greeting').textContent = `Hi, ${user.full_name}`;

  if (user?.forcePasswordChange) {
    openChangePasswordModal(true);
  }

  loadDashboard();
}

async function loadDashboard() {
  showLoading('content-area', 'Loading dashboard...');
  const data = await apiGet('/api/dashboard');
  if (!data) return;
  const user = getUser();

  if (user.role === 'student') {
    renderStudentDashboard(data, user);
  } else if (user.role === 'lecturer') {
    renderLecturerDashboard(data, user);
  } else {
    renderAdminDashboard(data, user);
  }
}

function renderStudentDashboard(data, user) {
  const s = data.stats;
  const levelDisplay = s.level ? s.level.replace('L', 'Level ') : 'N/A';
  const greetingText = getGreeting();
  const firstName = user.full_name.split(' ')[0];

  let html = `
    <div class="hero-section animate-fade-in">
      <div class="hero-content">
        <div class="hero-greeting">${greetingText}</div>
        <h1 class="hero-name">Welcome, <span>${firstName}</span></h1>
        <div class="hero-info">
          <span class="info-chip">${s.department || 'Student'}</span>
          <span class="info-chip">${levelDisplay}</span>
          ${s.index_number ? `<span class="info-chip">${s.index_number}</span>` : ''}
        </div>
        <div class="hero-actions">
          <a href="/courses" class="btn btn-hero">Browse Courses</a>
          <a href="/assignments" class="btn btn-hero-outline">View Assignments</a>
        </div>
      </div>
    </div>

    <div class="quick-actions">
      <a href="/courses" class="quick-action animate-fade-in-up animate-delay-1">
        <div class="quick-action-icon" style="background:linear-gradient(135deg,#e3f2fd,#bbdefb);color:var(--info)"><i data-lucide="book-open"></i></div>
        <span class="quick-action-label">My Courses</span>
      </a>
      <a href="/assignments" class="quick-action animate-fade-in-up animate-delay-2">
        <div class="quick-action-icon" style="background:linear-gradient(135deg,#fff3e0,#ffe0b2);color:var(--accent)"><i data-lucide="file-text"></i></div>
        <span class="quick-action-label">Assignments</span>
      </a>
      <a href="/news" class="quick-action animate-fade-in-up animate-delay-3">
        <div class="quick-action-icon" style="background:linear-gradient(135deg,#e8f5e9,#c8e6c9);color:var(--success)"><i data-lucide="megaphone"></i></div>
        <span class="quick-action-label">News</span>
      </a>
      <a href="/calendar" class="quick-action animate-fade-in-up animate-delay-4">
        <div class="quick-action-icon" style="background:linear-gradient(135deg,#f3e5f5,#e1bee7);color:#7b1fa2"><i data-lucide="calendar"></i></div>
        <span class="quick-action-label">Calendar</span>
      </a>
    </div>

    <div class="stats-grid stats-grid-5">
      <div class="glass-card-stat orange animate-fade-in-up animate-delay-1">
        <div class="stat-icon-lg" style="background:#fff3e0;color:var(--accent)"><i data-lucide="graduation-cap"></i></div>
        <div class="stat-number">${s.enrolled_courses || 0}</div>
        <div class="stat-label">Registered Courses</div>
      </div>
      <div class="glass-card-stat blue animate-fade-in-up animate-delay-2">
        <div class="stat-icon-lg" style="background:#e3f2fd;color:var(--info)"><i data-lucide="file-text"></i></div>
        <div class="stat-number">${s.pending_assignments || 0}</div>
        <div class="stat-label">Pending Assignments</div>
      </div>
      <div class="glass-card-stat red animate-fade-in-up animate-delay-3">
        <div class="stat-icon-lg" style="background:#ffebee;color:var(--danger)"><i data-lucide="clipboard-list"></i></div>
        <div class="stat-number">${s.upcoming_exams || 0}</div>
        <div class="stat-label">Upcoming Exams</div>
      </div>
      <div class="glass-card-stat green animate-fade-in-up animate-delay-4">
        <div class="stat-icon-lg" style="background:#e8f5e9;color:var(--success)"><i data-lucide="trophy"></i></div>
        <div class="stat-number">${s.average_grade !== null ? s.average_grade + '%' : 'N/A'}</div>
        <div class="stat-label">Average Grade</div>
      </div>
      <div class="glass-card-stat purple animate-fade-in-up animate-delay-5">
        <div class="stat-icon-lg" style="background:#f3e5f5;color:#7b1fa2"><i data-lucide="folder-open"></i></div>
        <div class="stat-number">${s.course_materials || 0}</div>
        <div class="stat-label">Course Materials</div>
      </div>
    </div>
  `;

  if (s.my_courses && s.my_courses.length > 0) {
    html += `
      <div class="section-title animate-fade-in">
        <h2>My Courses</h2>
        <a href="/courses" class="btn btn-outline btn-sm">View All</a>
      </div>
      <div class="course-grid" style="margin-bottom:32px">
        ${s.my_courses.map((c, i) => `
          <div class="course-card animate-fade-in-up animate-delay-${Math.min(i+1, 5)}">
            <div class="course-code">${c.code}</div>
            <h3 style="font-size:1rem">${c.title}</h3>
            <div class="course-meta">
              <span class="badge badge-primary">${c.level}</span>
              <span class="badge badge-${c.semester==='first'?'success':'purple'}">${c.semester}</span>
              <span style="margin-left:8px;font-size:0.85rem">${c.lecturer_name || 'TBA'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (s.upcoming_deadlines && s.upcoming_deadlines.length > 0) {
    html += `
      <div class="section-title animate-fade-in">
        <h2>Upcoming Deadlines</h2>
        <a href="/assignments" class="btn btn-outline btn-sm">All Assignments</a>
      </div>
      <div class="glass-card animate-fade-in-up" style="margin-bottom:32px">
        <div class="card-body" style="padding:0">
          <div class="table-wrapper">
            <table>
              <thead><tr><th>Course</th><th>Assignment</th><th>Due Date</th><th>Marks</th></tr></thead>
              <tbody>
                ${s.upcoming_deadlines.map(d => {
                  const isUrgent = new Date(d.due_date) - new Date() < 86400000;
                  return `<tr>
                    <td><strong>${d.course_code}</strong></td>
                    <td>${d.title}</td>
                    <td><span class="${isUrgent ? 'text-danger' : ''}">${formatDateTime(d.due_date)}</span></td>
                    <td>${d.total_marks}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  if (s.recent_submissions && s.recent_submissions.length > 0) {
    html += `
      <div class="section-title animate-fade-in"><h2>Recent Submissions</h2></div>
      <div class="glass-card animate-fade-in-up" style="margin-bottom:32px">
        <div class="card-body" style="padding:0">
          <div class="table-wrapper">
            <table>
              <thead><tr><th>Course</th><th>Assignment</th><th>Submitted</th><th>Grade</th></tr></thead>
              <tbody>
                ${s.recent_submissions.map(sub => `
                  <tr>
                    <td><strong>${sub.course_code}</strong></td>
                    <td>${sub.assignment_title}</td>
                    <td>${timeAgo(sub.submitted_at)}</td>
                    <td>${sub.grade !== null
                      ? `<span class="badge badge-success">${sub.grade}/${sub.total_marks}</span>`
                      : '<span class="badge badge-warning">Pending</span>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  if (s.recent_materials && s.recent_materials.length > 0) {
    html += `
      <div class="section-title animate-fade-in">
        <h2>Recent Materials</h2>
        <a href="/courses" class="btn btn-outline btn-sm">Browse All</a>
      </div>
      <div class="glass-card animate-fade-in-up" style="margin-bottom:32px">
        <div class="card-body" style="padding:0">
          <ul class="material-list">
            ${s.recent_materials.map(m => {
              const ext = m.file_path ? m.file_path.split('.').pop().toLowerCase() : '';
              const iconClass = ['pdf'].includes(ext) ? 'pdf' : ['doc','docx','txt'].includes(ext) ? 'doc' : ['mp4','avi','mov'].includes(ext) ? 'vid' : 'other';
              const icons = { pdf: '<i data-lucide="file"></i>', doc: '<i data-lucide="file-text"></i>', vid: '<i data-lucide="video"></i>', other: '<i data-lucide="folder"></i>' };
              return `
                <li class="material-item">
                  <div class="material-icon ${iconClass}">${icons[iconClass] || icons.other}</div>
                  <div class="material-info">
                    <h4>${m.title}</h4>
                    <p>${m.course_code} - ${m.course_title} &middot; ${m.category ? m.category.replace(/_/g,' ') : ''} &middot; ${m.uploader || ''}</p>
                  </div>
                  ${m.file_path ? `<a href="${m.file_path}" target="_blank" class="btn btn-outline btn-sm">Download</a>` : ''}
                </li>
              `;
            }).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  html += `
    <div class="bottom-grid">
      <div>
        <div class="glass-card animate-fade-in-up">
          <div class="card-header"><h2>Latest News</h2><a href="/news" class="btn btn-outline btn-sm">View All</a></div>
          <div class="card-body" id="recent-news"><div class="empty-state"><div class="icon"><i data-lucide="megaphone"></i></div><p>No news yet</p></div></div>
        </div>
      </div>
      <div>
        <div class="glass-card animate-fade-in-up">
          <div class="card-header"><h2>Upcoming Events</h2><a href="/calendar" class="btn btn-outline btn-sm">Calendar</a></div>
          <div class="card-body" id="upcoming-events"><div class="empty-state"><div class="icon"><i data-lucide="calendar"></i></div><p>No events</p></div></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('content-area').innerHTML = html;
  if (window.lucide) lucide.createIcons();

  if (data.recentNews && data.recentNews.length > 0) {
    document.getElementById('recent-news').innerHTML = data.recentNews.map(n => `
      <div style="padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="window.location.href='/news'">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span class="badge badge-${n.category==='urgent'?'danger':n.category==='event'?'success':'primary'}">${n.category}</span>
          ${n.is_pinned ? '<span class="badge badge-warning">Pinned</span>' : ''}
        </div>
        <h4 style="font-size:0.95rem;margin-bottom:2px">${n.title}</h4>
        <p style="font-size:0.8rem;color:var(--text-secondary)">${timeAgo(n.created_at)} &middot; ${n.author}</p>
      </div>
    `).join('');
  }

  if (data.upcomingEvents && data.upcomingEvents.length > 0) {
    document.getElementById('upcoming-events').innerHTML = data.upcomingEvents.map(e => `
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <span class="badge badge-${e.event_type==='exam'?'danger':e.event_type==='assignment'?'warning':'primary'}" style="margin-bottom:4px">${e.event_type}</span>
        <h4 style="font-size:0.9rem;margin-bottom:2px">${e.title}</h4>
        <p style="font-size:0.78rem;color:var(--text-secondary)">${formatDateTime(e.event_date)}</p>
      </div>
    `).join('');
  }
}

function renderLecturerDashboard(data, user) {
  const s = data.stats;
  const firstName = user.full_name.split(' ')[0];
  const greetingText = getGreeting();

  let html = `
    <div class="hero-section animate-fade-in">
      <div class="hero-content">
        <div class="hero-greeting">${greetingText}</div>
        <h1 class="hero-name">Welcome, <span>${firstName}</span></h1>
        <div class="hero-info">
          <span class="info-chip">${user.department || 'Lecturer'}</span>
          <span class="info-chip">${getSchoolShort(user.school)}</span>
        </div>
        <div class="hero-actions">
          <a href="/profile" class="btn btn-hero">My Portrait</a>
          <a href="/courses" class="btn btn-hero-outline">Manage Courses</a>
        </div>
      </div>
    </div>

    <div class="quick-actions">
      <a href="/courses" class="quick-action animate-fade-in-up animate-delay-1">
        <div class="quick-action-icon" style="background:linear-gradient(135deg,#e3f2fd,#bbdefb);color:var(--info)"><i data-lucide="book-open"></i></div>
        <span class="quick-action-label">My Courses</span>
      </a>
      <a href="/assignments" class="quick-action animate-fade-in-up animate-delay-2">
        <div class="quick-action-icon" style="background:linear-gradient(135deg,#fff3e0,#ffe0b2);color:var(--accent)"><i data-lucide="file-text"></i></div>
        <span class="quick-action-label">Assignments</span>
      </a>
      <a href="/calendar" class="quick-action animate-fade-in-up animate-delay-3">
        <div class="quick-action-icon" style="background:linear-gradient(135deg,#e8f5e9,#c8e6c9);color:var(--success)"><i data-lucide="calendar"></i></div>
        <span class="quick-action-label">Events</span>
      </a>
      <a href="/profile" class="quick-action animate-fade-in-up animate-delay-4">
        <div class="quick-action-icon" style="background:linear-gradient(135deg,#f3e5f5,#e1bee7);color:#7b1fa2"><i data-lucide="user-circle"></i></div>
        <span class="quick-action-label">My Portrait</span>
      </a>
    </div>

    <div class="stats-grid stats-grid-3">
      <div class="glass-card-stat blue animate-fade-in-up animate-delay-1">
        <div class="stat-icon-lg" style="background:#e3f2fd;color:var(--info)"><i data-lucide="book-open"></i></div>
        <div class="stat-number">${s.assigned_courses||0}</div>
        <div class="stat-label">Assigned Courses</div>
      </div>
      <div class="glass-card-stat green animate-fade-in-up animate-delay-2">
        <div class="stat-icon-lg" style="background:#e8f5e9;color:var(--success)"><i data-lucide="users"></i></div>
        <div class="stat-number">${s.total_students||0}</div>
        <div class="stat-label">Total Students</div>
      </div>
      <div class="glass-card-stat orange animate-fade-in-up animate-delay-3">
        <div class="stat-icon-lg" style="background:#fff3e0;color:var(--accent)"><i data-lucide="file-text"></i></div>
        <div class="stat-number">${s.pending_grading||0}</div>
        <div class="stat-label">Pending Grading</div>
      </div>
    </div>

    <div class="bottom-grid">
      <div>
        <div class="glass-card animate-fade-in-up">
          <div class="card-header"><h2>Latest News</h2><a href="/news" class="btn btn-outline btn-sm">View All</a></div>
          <div class="card-body" id="recent-news"><div class="empty-state"><div class="icon"><i data-lucide="megaphone"></i></div><p>No news yet</p></div></div>
        </div>
      </div>
      <div>
        <div class="glass-card animate-fade-in-up">
          <div class="card-header"><h2>Upcoming Events</h2><a href="/calendar" class="btn btn-outline btn-sm">Calendar</a></div>
          <div class="card-body" id="upcoming-events"><div class="empty-state"><div class="icon"><i data-lucide="calendar"></i></div><p>No events</p></div></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('content-area').innerHTML = html;
  if (window.lucide) lucide.createIcons();
  renderNewsAndEvents(data);
}

function renderAdminDashboard(data, user) {
  const s = data.stats;
  const firstName = user.full_name.split(' ')[0];
  const greetingText = getGreeting();

  let html = `
    <div class="hero-section animate-fade-in">
      <div class="hero-content">
        <div class="hero-greeting">${greetingText}</div>
        <h1 class="hero-name">Welcome, <span>${firstName}</span></h1>
        <div class="hero-info">
          <span class="info-chip">${user.role === 'school_admin' ? 'School Admin' : 'Administrator'}</span>
          ${user.school ? `<span class="info-chip">${getSchoolShort(user.school)}</span>` : '<span class="info-chip">System Management</span>'}
        </div>
        <div class="hero-actions">
          <a href="/admin" class="btn btn-hero">Admin Panel</a>
          <a href="/lecturers" class="btn btn-hero-outline">Staff Database</a>
        </div>
      </div>
    </div>

    <div class="quick-actions">
      <a href="/admin" class="quick-action animate-fade-in-up animate-delay-1">
        <div class="quick-action-icon" style="background:linear-gradient(135deg,#e3f2fd,#bbdefb);color:var(--info)"><i data-lucide="settings"></i></div>
        <span class="quick-action-label">Admin Panel</span>
      </a>
      <a href="/lecturers" class="quick-action animate-fade-in-up animate-delay-2">
        <div class="quick-action-icon" style="background:linear-gradient(135deg,#e8f5e9,#c8e6c9);color:var(--success)"><i data-lucide="users"></i></div>
        <span class="quick-action-label">Staff</span>
      </a>
      <a href="/news" class="quick-action animate-fade-in-up animate-delay-3">
        <div class="quick-action-icon" style="background:linear-gradient(135deg,#f3e5f5,#e1bee7);color:#7b1fa2"><i data-lucide="megaphone"></i></div>
        <span class="quick-action-label">News</span>
      </a>
    </div>

    <div class="stats-grid stats-grid-2">
      <div class="glass-card-stat blue animate-fade-in-up animate-delay-1">
        <div class="stat-icon-lg" style="background:#e3f2fd;color:var(--info)"><i data-lucide="users"></i></div>
        <div class="stat-number">${s.total_students||0}</div>
        <div class="stat-label">Students</div>
      </div>
      <div class="glass-card-stat green animate-fade-in-up animate-delay-2">
        <div class="stat-icon-lg" style="background:#e8f5e9;color:var(--success)"><i data-lucide="briefcase"></i></div>
        <div class="stat-number">${s.total_lecturers||0}</div>
        <div class="stat-label">Lecturers</div>
      </div>
    </div>

    <div class="bottom-grid">
      <div>
        <div class="glass-card animate-fade-in-up">
          <div class="card-header"><h2>Latest News</h2><a href="/news" class="btn btn-outline btn-sm">View All</a></div>
          <div class="card-body" id="recent-news"><div class="empty-state"><div class="icon"><i data-lucide="megaphone"></i></div><p>No news yet</p></div></div>
        </div>
      </div>
      <div>
        <div class="glass-card animate-fade-in-up">
          <div class="card-header"><h2>Upcoming Events</h2><a href="/calendar" class="btn btn-outline btn-sm">Calendar</a></div>
          <div class="card-body" id="upcoming-events"><div class="empty-state"><div class="icon"><i data-lucide="calendar"></i></div><p>No events</p></div></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('content-area').innerHTML = html;
  if (window.lucide) lucide.createIcons();
  renderNewsAndEvents(data);
}

function renderNewsAndEvents(data) {
  if (data.recentNews && data.recentNews.length > 0) {
    document.getElementById('recent-news').innerHTML = data.recentNews.map(n => `
      <div style="padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="window.location.href='/news'">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span class="badge badge-${n.category==='urgent'?'danger':n.category==='event'?'success':'primary'}">${n.category}</span>
          ${n.is_pinned ? '<span class="badge badge-warning">Pinned</span>' : ''}
        </div>
        <h4 style="font-size:0.95rem;margin-bottom:2px">${n.title}</h4>
        <p style="font-size:0.8rem;color:var(--text-secondary)">${timeAgo(n.created_at)} &middot; ${n.author}</p>
      </div>
    `).join('');
  }
  if (data.upcomingEvents && data.upcomingEvents.length > 0) {
    document.getElementById('upcoming-events').innerHTML = data.upcomingEvents.map(e => `
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <span class="badge badge-${e.event_type==='exam'?'danger':e.event_type==='assignment'?'warning':'primary'}" style="margin-bottom:4px">${e.event_type}</span>
        <h4 style="font-size:0.9rem;margin-bottom:2px">${e.title}</h4>
        <p style="font-size:0.78rem;color:var(--text-secondary)">${formatDateTime(e.event_date)}</p>
      </div>
    `).join('');
  }
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
