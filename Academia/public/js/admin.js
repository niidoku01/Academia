/* ========== ADMIN PAGE ========== */

if (checkAuth() && checkRole('admin', 'school_admin')) {
  renderSidebar('admin');
  loadAdminStats();
  loadUsers();
  loadCompilation();
  loadProgrammes();
  loadPortraits();
  loadNewsApproval();
  loadEventsApproval();
}

function showAdminTab(tab, clickedElement) {
  document.querySelectorAll('#admin-tabs .level-tab').forEach(t => t.classList.remove('active'));
  if (clickedElement) {
    clickedElement.classList.add('active');
  } else {
    const fallback = document.querySelector(`#admin-tabs .level-tab[data-tab="${tab}"]`);
    if (fallback) fallback.classList.add('active');
  }
  ['users','compilation','programmes','portraits','news-approval','events-approval'].forEach(t => {
    const el = document.getElementById(t + '-tab');
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
}

async function loadAdminStats() {
  const data = await apiGet('/api/admin/stats');
  if (!data) return;
  document.getElementById('admin-stats').innerHTML = `
    <div class="stat-card"><div class="stat-icon blue"><i data-lucide="users"></i></div><div class="stat-info"><h3>${data.total_students}</h3><p>Students</p></div></div>
    <div class="stat-card"><div class="stat-icon green"><i data-lucide="briefcase"></i></div><div class="stat-info"><h3>${data.total_lecturers}</h3><p>Lecturers</p></div></div>
    <div class="stat-card"><div class="stat-icon orange"><i data-lucide="book-open"></i></div><div class="stat-info"><h3>${data.published_courses} / ${data.total_courses}</h3><p>Published / Total Courses</p></div></div>
    <div class="stat-card"><div class="stat-icon purple"><i data-lucide="bell"></i></div><div class="stat-info"><h3>${data.pending_news}</h3><p>Pending News</p></div></div>
    <div class="stat-card"><div class="stat-icon green"><i data-lucide="calendar"></i></div><div class="stat-info"><h3>${data.pending_events}</h3><p>Pending Events</p></div></div>
  `;
  lucide.createIcons();
}

async function loadUsers() {
  showLoading('users-body', 'Loading users...');
  const users = await apiGet('/api/admin/users');
  if (!users) return;
  document.getElementById('users-body').innerHTML = users.map(u => `
    <tr>
      <td>${u.full_name}</td>
      <td>${u.email}</td>
      <td><span class="badge badge-${u.role==='admin'?'danger':u.role==='lecturer'||u.role==='school_admin'?'success':'primary'}">${u.role === 'school_admin' ? 'School Admin' : u.role}</span></td>
      <td>${schoolBadge(u.school)}</td>
      <td>${u.level || '-'}</td>
      <td>${u.matric_number || '-'}</td>
      <td>${u.role !== 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Delete</button>` : '<span style="color:var(--text-secondary);font-size:0.85rem">Protected</span>'}</td>
    </tr>
  `).join('');
}

async function loadCompilation() {
  const status = document.getElementById('comp-status-filter').value;
  const params = status ? `?status=${status}` : '';
  const courses = await apiGet('/api/admin/courses' + params);
  if (!courses) return;
  document.getElementById('compilation-body').innerHTML = courses.map(c => `
    <tr>
      <td><strong>${c.code}</strong></td>
      <td>${c.title}</td>
      <td><span class="badge badge-primary">${c.level}</span></td>
      <td>${c.semester === 'first' ? 'First' : 'Second'}</td>
      <td>${c.lecturer_name || 'TBA'}</td>
      <td>${schoolBadge(c.school)}</td>
      <td><span class="badge badge-${c.status==='published'?'success':'warning'}">${c.status}</span></td>
      <td>${c.enrolled_count || 0}</td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary)">No courses found</td></tr>';
}

async function loadNewsApproval() {
  const status = document.getElementById('news-status-filter').value;
  const params = status ? `?status=${status}` : '';
  const news = await apiGet('/api/admin/news' + params);
  if (!news) return;
  document.getElementById('news-approval-body').innerHTML = news.map(n => `
    <tr>
      <td><strong>${n.title}</strong></td>
      <td>${n.author}</td>
      <td><span class="badge badge-primary">${n.category || 'General'}</span></td>
      <td>${n.school || 'All'}</td>
      <td><span class="badge badge-${n.status==='approved'?'success':n.status==='rejected'?'danger':'warning'}">${n.status}</span></td>
      <td>${new Date(n.created_at).toLocaleDateString()}</td>
      <td>${n.status === 'pending'
        ? `<button class="btn btn-success btn-sm" onclick="approveNews(${n.id})">Approve</button>
           <button class="btn btn-danger btn-sm" onclick="rejectNews(${n.id})">Reject</button>`
        : `<span style="color:var(--text-secondary);font-size:0.85rem">${n.status === 'approved' ? 'Approved' : 'Rejected'}</span>`}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary)">No news found</td></tr>';
}

async function loadEventsApproval() {
  const status = document.getElementById('events-status-filter').value;
  const params = status ? `?status=${status}` : '';
  const events = await apiGet('/api/admin/events' + params);
  if (!events) return;
  document.getElementById('events-approval-body').innerHTML = events.map(e => `
    <tr>
      <td><strong>${e.title}</strong></td>
      <td>${e.created_by_name}</td>
      <td><span class="badge badge-primary">${e.event_type || 'event'}</span></td>
      <td>${new Date(e.event_date).toLocaleDateString()}</td>
      <td>${e.course_code || '-'}</td>
      <td>${e.school || 'All'}</td>
      <td><span class="badge badge-${e.status==='approved'?'success':e.status==='rejected'?'danger':'warning'}">${e.status}</span></td>
      <td>${e.status === 'pending'
        ? `<button class="btn btn-success btn-sm" onclick="approveEvent(${e.id})">Approve</button>
           <button class="btn btn-danger btn-sm" onclick="rejectEvent(${e.id})">Reject</button>`
        : `<span style="color:var(--text-secondary);font-size:0.85rem">${e.status === 'approved' ? 'Approved' : 'Rejected'}</span>`}</td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary)">No events found</td></tr>';
}

function toggleMatricField() {
  const role = document.getElementById('au-role').value;
  const wrap = document.getElementById('au-matric-wrap');
  const passInput = document.getElementById('au-pass');
  const passLabel = document.getElementById('au-pass-label');
  if (wrap) wrap.style.display = role === 'student' ? '' : 'none';
  if (passInput) {
    passInput.required = role !== 'school_admin';
    if (role === 'school_admin') {
      passInput.removeAttribute('minlength');
    } else {
      passInput.setAttribute('minlength', '6');
    }
  }
  if (passLabel) passLabel.style.display = role === 'school_admin' ? '' : 'none';
}

async function addUser(e) {
  e.preventDefault();
  const res = await apiPost('/api/admin/users', {
    full_name: document.getElementById('au-name').value,
    email: document.getElementById('au-email').value,
    password: document.getElementById('au-pass').value,
    role: document.getElementById('au-role').value,
    school: document.getElementById('au-school').value,
    department: document.getElementById('au-dept').value,
    matric_number: document.getElementById('au-matric').value,
  });
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('User added!', 'success');
  hideModal('add-user-modal');
  loadUsers();
  loadAdminStats();
}

async function deleteUser(id) {
  if (!confirm('Delete this user?')) return;
  const res = await apiDelete(`/api/admin/users/${id}`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadUsers();
  loadAdminStats();
}

async function approveNews(id) {
  const res = await apiPut(`/api/admin/news/${id}/approve`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadNewsApproval();
  loadAdminStats();
}

async function rejectNews(id) {
  if (!confirm('Reject this news submission?')) return;
  const res = await apiPut(`/api/admin/news/${id}/reject`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadNewsApproval();
  loadAdminStats();
}

async function approveEvent(id) {
  const res = await apiPut(`/api/admin/events/${id}/approve`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadEventsApproval();
  loadAdminStats();
}

async function rejectEvent(id) {
  if (!confirm('Reject this event submission?')) return;
  const res = await apiPut(`/api/admin/events/${id}/reject`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadEventsApproval();
  loadAdminStats();
}

async function loadProgrammes() {
  const data = await apiGet('/api/admin/courses-by-programme');
  if (!data) return;
  const container = document.getElementById('programmes-content');
  let html = '';
  const schools = Object.keys(data);
  if (schools.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon"><i data-lucide="book-open"></i></div><h3>No Courses</h3><p>No courses available yet.</p></div>';
    lucide.createIcons();
    return;
  }
  for (const school of schools) {
    const depts = data[school];
    html += `<div class="glass-card" style="margin-bottom:24px">
      <div class="card-header" style="padding:16px 20px;border-bottom:1px solid var(--border)">
        <h2 style="font-size:1.1rem;margin:0">${schoolBadge(school)} <span style="color:var(--text-secondary);font-weight:400;font-size:0.85rem;margin-left:8px">${Object.values(depts).reduce((a,b) => a + b.length, 0)} courses</span></h2>
      </div>
      <div class="card-body" style="padding:0">`;
    const deptNames = Object.keys(depts).sort();
    for (const dept of deptNames) {
      const courses = depts[dept];
      html += `<div style="padding:16px 20px;border-bottom:1px solid var(--border)">
        <h3 style="font-size:0.95rem;margin-bottom:12px;color:var(--primary)">${dept}</h3>
        <div class="table-wrapper"><table>
          <thead><tr><th>Code</th><th>Title</th><th>Level</th><th>Semester</th><th>Lecturer</th><th>Status</th><th>Registered</th></tr></thead>
          <tbody>${courses.map(c => `<tr>
            <td><strong>${c.code}</strong></td>
            <td>${c.title}</td>
            <td><span class="badge badge-primary">${c.level}</span></td>
            <td>${c.semester === 'first' ? 'First' : 'Second'}</td>
            <td>${c.lecturer_name || 'TBA'}</td>
            <td><span class="badge badge-${c.status==='published'?'success':'warning'}">${c.status}</span></td>
            <td>${c.enrolled_count || 0}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    }
    html += '</div></div>';
  }
  container.innerHTML = html;
  lucide.createIcons();
}

async function loadPortraits() {
  const search = document.getElementById('portrait-search') ? document.getElementById('portrait-search').value : '';
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  const data = await apiGet('/api/admin/lecturer-portraits' + params);
  if (!data) return;
  const grid = document.getElementById('portraits-grid');
  const lecturers = data.lecturers || [];
  const admins = data.admins || [];

  if (admins.length === 0 && lecturers.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon"><i data-lucide="users"></i></div><h3>No Portraits</h3><p>No profiles found.</p></div>';
    lucide.createIcons();
    return;
  }

  let html = '';

  if (admins.length > 0) {
    html += `<div style="grid-column:1/-1;margin-bottom:8px"><h3 style="font-size:1rem;font-weight:700;color:var(--text-secondary)">Administration</h3></div>`;
    html += admins.map(a => `
      <div class="glass-card" style="overflow:hidden">
        <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:24px;text-align:center;color:white">
          ${a.photo_path
            ? `<img src="${a.photo_path}" alt="${a.full_name}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.3);margin-bottom:12px">`
            : `<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.15);display:inline-flex;align-items:center;justify-content:center;font-size:2rem;font-weight:700;margin-bottom:12px;border:3px solid rgba(255,255,255,0.3)">${a.full_name.split(' ').map(n=>n[0]).join('').substring(0,2)}</div>`
          }
          <h3 style="font-size:1.05rem;margin-bottom:4px">${a.full_name}</h3>
          <p style="font-size:0.82rem;opacity:0.85">${a.position || 'Administrator'}${a.school ? ', ' + getSchoolShort(a.school) : ''}</p>
        </div>
        <div style="padding:16px 20px">
          ${a.bio ? `<div style="margin-bottom:8px"><strong style="font-size:0.8rem;color:var(--text-secondary)">Bio</strong><p style="margin:2px 0 0;font-size:0.85rem;color:var(--text-secondary)">${a.bio.substring(0, 150)}${a.bio.length > 150 ? '...' : ''}</p></div>` : ''}
          <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;font-size:0.85rem">
            ${a.email ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i data-lucide="mail" style="width:14px;height:14px;color:var(--text-secondary)"></i>${a.email}</div>` : ''}
            ${a.phone ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i data-lucide="phone" style="width:14px;height:14px;color:var(--text-secondary)"></i>${a.phone}</div>` : ''}
            ${a.school ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i data-lucide="building-2" style="width:14px;height:14px;color:var(--text-secondary)"></i>${getSchoolShort(a.school)}</div>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  if (lecturers.length > 0) {
    html += `<div style="grid-column:1/-1;margin-top:16px;margin-bottom:8px"><h3 style="font-size:1rem;font-weight:700;color:var(--text-secondary)">Lecturers</h3></div>`;
    html += lecturers.map(l => `
      <div class="glass-card" style="overflow:hidden">
        <div style="background:linear-gradient(135deg,var(--primary),var(--primary-dark));padding:24px;text-align:center;color:white">
          ${l.photo_path
            ? `<img src="${l.photo_path}" alt="${l.full_name}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.3);margin-bottom:12px">`
            : `<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.15);display:inline-flex;align-items:center;justify-content:center;font-size:2rem;font-weight:700;margin-bottom:12px;border:3px solid rgba(255,255,255,0.3)">${l.full_name.split(' ').map(n=>n[0]).join('').substring(0,2)}</div>`
          }
          <h3 style="font-size:1.05rem;margin-bottom:4px">${l.full_name}</h3>
          <p style="font-size:0.82rem;opacity:0.85">${l.department || ''} ${l.school ? '&middot; ' + getSchoolShort(l.school) : ''}</p>
        </div>
        <div style="padding:16px 20px">
          ${l.specialization ? `<div style="margin-bottom:8px"><strong style="font-size:0.8rem;color:var(--text-secondary)">Specialization</strong><p style="margin:2px 0 0;font-size:0.9rem">${l.specialization}</p></div>` : ''}
          ${l.qualification ? `<div style="margin-bottom:8px"><strong style="font-size:0.8rem;color:var(--text-secondary)">Qualification</strong><p style="margin:2px 0 0;font-size:0.9rem">${l.qualification}</p></div>` : ''}
          ${l.bio ? `<div style="margin-bottom:8px"><strong style="font-size:0.8rem;color:var(--text-secondary)">Bio</strong><p style="margin:2px 0 0;font-size:0.85rem;color:var(--text-secondary)">${l.bio.substring(0, 150)}${l.bio.length > 150 ? '...' : ''}</p></div>` : ''}
          <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;font-size:0.85rem">
            ${l.email ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i data-lucide="mail" style="width:14px;height:14px;color:var(--text-secondary)"></i>${l.email}</div>` : ''}
            ${l.phone ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i data-lucide="phone" style="width:14px;height:14px;color:var(--text-secondary)"></i>${l.phone}</div>` : ''}
            ${l.office_location ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i data-lucide="map-pin" style="width:14px;height:14px;color:var(--text-secondary)"></i>${l.office_location}</div>` : ''}
            ${l.office_hours ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i data-lucide="clock" style="width:14px;height:14px;color:var(--text-secondary)"></i>${l.office_hours}</div>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  grid.innerHTML = html;
  lucide.createIcons();
}
