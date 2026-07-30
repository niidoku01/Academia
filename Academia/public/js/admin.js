/* ========== ADMIN PAGE ========== */

if (checkAuth() && checkRole('admin', 'school_admin')) {
  const user = getUser();
  renderSidebar('admin');
  loadAdminStats();
  loadUsers();
  populateSchoolFilters();
  loadCompilation();
  loadProgrammes();
  loadStaffDatabase();
  loadNewsApproval();
  loadEventsApproval();
  setupAddUserForm(user);
}

function populateSchoolFilters() {
  const user = getUser();
  ['comp-school-filter', 'prog-school-filter', 'staff-school-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (user.role === 'school_admin') {
      el.style.display = 'none';
    } else {
      el.innerHTML = '<option value="">All Schools</option>' + ALL_SCHOOLS.map(s => `<option value="${s}">${getSchoolShort(s)} - ${s}</option>`).join('');
    }
  });
}

function populateDeptFilter(depts) {
  const el = document.getElementById('prog-dept-filter');
  if (!el) return;
  const currentVal = el.value;
  el.innerHTML = '<option value="">All Departments</option>' + (depts || []).map(d => `<option value="${d}">${d}</option>`).join('');
  if (currentVal && (depts || []).includes(currentVal)) el.value = currentVal;
}

function setupAddUserForm(user) {
  const schoolSelect = document.getElementById('au-school');
  const schoolWrap = document.getElementById('au-school-wrap');
  const schoolLabel = document.getElementById('au-school-label');
  const schoolHint = document.getElementById('au-school-hint');
  const roleSelect = document.getElementById('au-role');

  if (user.role === 'school_admin') {
    const short = getSchoolShort(user.school);
    schoolWrap.innerHTML = `
      <label>School</label>
      <div style="padding:10px 14px;background:var(--bg);border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:0.9rem;color:var(--text);display:flex;align-items:center;gap:8px">
        ${getSchoolLogo(user.school) ? `<img src="${getSchoolLogo(user.school)}" alt="${short}" style="height:20px;width:20px;object-fit:contain">` : ''}
        <span>${short} - ${user.school}</span>
      </div>
      <small style="color:var(--text-secondary);font-size:0.8rem;margin-top:4px;display:block">Users will be added to your school only</small>
    `;
    roleSelect.innerHTML = '<option value="student">Student</option><option value="lecturer">Lecturer</option>';
  } else {
    schoolSelect.innerHTML = ALL_SCHOOLS.map(s => `<option value="${s}">${getSchoolShort(s)} - ${s}</option>`).join('');
    roleSelect.innerHTML = '<option value="student">Student</option><option value="lecturer">Lecturer</option><option value="school_admin">School Admin</option>';
  }
}

function showAdminTab(tab, clickedElement) {
  document.querySelectorAll('#admin-tabs .level-tab').forEach(t => t.classList.remove('active'));
  if (clickedElement) {
    clickedElement.classList.add('active');
  } else {
    const fallback = document.querySelector(`#admin-tabs .level-tab[data-tab="${tab}"]`);
    if (fallback) fallback.classList.add('active');
  }
  ['users','compilation','programmes','staff','news-approval','events-approval'].forEach(t => {
    const el = document.getElementById(t + '-tab');
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  const fab = document.getElementById('fab-add-user');
  if (fab) fab.style.display = tab === 'users' ? 'flex' : 'none';
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
  const user = getUser();
  if (user.role === 'admin') {
    const grouped = {};
    for (const u of users) {
      const sch = u.school || 'Unassigned';
      if (!grouped[sch]) grouped[sch] = [];
      grouped[sch].push(u);
    }
    const schoolKeys = Object.keys(grouped).sort();
    let html = '';
    for (const sch of schoolKeys) {
      const schoolUsers = grouped[sch];
      html += `<div class="glass-card" style="margin-bottom:16px">
        <div class="card-header" style="padding:12px 16px;border-bottom:1px solid var(--border)">
          <h3 style="font-size:0.95rem;margin:0">${schoolBadge(sch)} <span style="color:var(--text-secondary);font-weight:400;font-size:0.82rem">${schoolUsers.length} user${schoolUsers.length > 1 ? 's' : ''}</span></h3>
        </div>
        <div class="card-body" style="padding:0">
          <div class="table-wrapper"><table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Level</th><th>Index</th><th>Actions</th></tr></thead>
            <tbody>${schoolUsers.map(u => `
              <tr>
                <td>${u.full_name}</td>
                <td>${u.email}</td>
                <td><span class="badge badge-${u.role==='admin'?'danger':u.role==='lecturer'||u.role==='school_admin'?'success':'primary'}">${u.role === 'school_admin' ? 'School Admin' : u.role}</span></td>
                <td>${u.level || '-'}</td>
                <td>${u.matric_number || '-'}</td>
                <td>${u.role !== 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Delete</button>` : '<span style="color:var(--text-secondary);font-size:0.85rem">Protected</span>'}</td>
              </tr>
            `).join('')}</tbody>
          </table></div>
        </div>
      </div>`;
    }
    document.getElementById('users-body').innerHTML = html || '<div style="text-align:center;padding:40px;color:var(--text-secondary)">No users found</div>';
  } else {
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
}

async function loadCompilation() {
  const status = document.getElementById('comp-status-filter').value;
  const school = document.getElementById('comp-school-filter')?.value || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (school) params.set('school', school);
  const qs = params.toString();
  const courses = await apiGet('/api/admin/courses' + (qs ? '?' + qs : ''));
  if (!courses) return;
  const user = getUser();
  document.getElementById('compilation-body').innerHTML = courses.map(c => {
    let actions = '';
    if (user.role === 'admin' || user.role === 'school_admin') {
      actions = `<div style="display:flex;gap:4px">
        ${c.status === 'draft' ? `<button class="btn btn-success btn-sm" onclick="publishCourse(${c.id})" title="Publish"><i data-lucide="check-circle" style="width:14px;height:14px"></i></button>` : ''}
        ${c.status === 'published' ? `<button class="btn btn-warning btn-sm" onclick="unpublishCourse(${c.id})" title="Unpublish"><i data-lucide="x-circle" style="width:14px;height:14px"></i></button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="deleteCourse(${c.id})" title="Delete"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
      </div>`;
    }
    return `<tr>
      <td><strong>${c.code}</strong></td>
      <td>${c.title}</td>
      <td><span class="badge badge-primary">${c.level}</span></td>
      <td>${c.semester === 'first' ? 'First' : 'Second'}</td>
      <td>${c.lecturer_name || 'TBA'}</td>
      <td>${schoolBadge(c.school)}</td>
      <td><span class="badge badge-${c.status==='published'?'success':'warning'}">${c.status}</span></td>
      <td>${c.enrolled_count || 0}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text-secondary)">No courses found</td></tr>';
  lucide.createIcons();
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
  const user = getUser();
  const body = {
    full_name: document.getElementById('au-name').value,
    email: document.getElementById('au-email').value,
    password: document.getElementById('au-pass').value,
    role: document.getElementById('au-role').value,
    department: document.getElementById('au-dept').value,
    matric_number: document.getElementById('au-matric').value,
  };
  if (user.role !== 'school_admin') {
    body.school = document.getElementById('au-school').value;
  }
  const res = await apiPost('/api/admin/users', body);
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('User added!', 'success');
  hideModal('add-user-modal');
  document.getElementById('add-user-modal').querySelector('form').reset();
  setupAddUserForm(user);
  if (user.role === 'school_admin') toggleMatricField();
  loadUsers();
  loadAdminStats();
}

async function deleteUser(id) {
  if (!(await showConfirm('Delete this user? This action cannot be undone.'))) return;
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
  if (!(await showConfirm('Reject this news submission? It will not be shown to users.'))) return;
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
  if (!(await showConfirm('Reject this event submission? It will not appear on the calendar.'))) return;
  const res = await apiPut(`/api/admin/events/${id}/reject`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadEventsApproval();
  loadAdminStats();
}

async function loadProgrammes() {
  const school = document.getElementById('prog-school-filter')?.value || '';
  const department = document.getElementById('prog-dept-filter')?.value || '';
  const params = new URLSearchParams();
  if (school) params.set('school', school);
  if (department) params.set('department', department);
  const qs = params.toString();
  const data = await apiGet('/api/admin/courses-by-programme' + (qs ? '?' + qs : ''));
  if (!data) return;

  const allDepts = new Set();
  Object.values(data).forEach(depts => Object.keys(depts).forEach(d => allDepts.add(d)));
  populateDeptFilter([...allDepts].sort());

  const container = document.getElementById('programmes-content');
  let html = '';
  const schools = Object.keys(data);
  if (schools.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon"><i data-lucide="book-open"></i></div><h3>No Courses</h3><p>No courses found for the selected filters.</p></div>';
    lucide.createIcons();
    return;
  }
  for (const sch of schools) {
    const depts = data[sch];
    html += `<div class="glass-card" style="margin-bottom:24px">
      <div class="card-header" style="padding:16px 20px;border-bottom:1px solid var(--border)">
        <h2 style="font-size:1.1rem;margin:0">${schoolBadge(sch)} <span style="color:var(--text-secondary);font-weight:400;font-size:0.85rem;margin-left:8px">${Object.values(depts).reduce((a,b) => a + b.length, 0)} courses</span></h2>
      </div>
      <div class="card-body" style="padding:0">`;
    const deptNames = Object.keys(depts).sort();
    for (const dept of deptNames) {
      const courses = depts[dept];
      html += `<div style="padding:16px 20px;border-bottom:1px solid var(--border)">
        <h3 style="font-size:0.95rem;margin-bottom:12px;color:var(--primary)">${dept}</h3>
        <div class="table-wrapper"><table>
          <thead><tr><th>Code</th><th>Title</th><th>Level</th><th>Semester</th><th>Lecturer</th><th>Status</th><th>Registered</th><th>Actions</th></tr></thead>
          <tbody>${courses.map(c => {
            const user = getUser();
            let actions = '';
            if (user.role === 'admin' || user.role === 'school_admin') {
              actions = `<div style="display:flex;gap:4px">
                ${c.status === 'draft' ? `<button class="btn btn-success btn-sm" onclick="publishCourse(${c.id})" title="Publish"><i data-lucide="check-circle" style="width:14px;height:14px"></i></button>` : ''}
                ${c.status === 'published' ? `<button class="btn btn-warning btn-sm" onclick="unpublishCourse(${c.id})" title="Unpublish"><i data-lucide="x-circle" style="width:14px;height:14px"></i></button>` : ''}
                <button class="btn btn-danger btn-sm" onclick="deleteCourse(${c.id})" title="Delete"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
              </div>`;
            }
            return `<tr>
            <td><strong>${c.code}</strong></td>
            <td>${c.title}</td>
            <td><span class="badge badge-primary">${c.level}</span></td>
            <td>${c.semester === 'first' ? 'First' : 'Second'}</td>
            <td>${c.lecturer_name || 'TBA'}</td>
            <td><span class="badge badge-${c.status==='published'?'success':'warning'}">${c.status}</span></td>
            <td>${c.enrolled_count || 0}</td>
            <td>${actions}</td>
          </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`;
    }
    html += '</div></div>';
  }
  container.innerHTML = html;
  lucide.createIcons();
}

async function loadStaffDatabase() {
  const user = getUser();
  const school = document.getElementById('staff-school-filter')?.value || '';
  const search = document.getElementById('staff-search')?.value || '';
  const params = new URLSearchParams();
  if (school) params.set('school', school);
  if (search) params.set('search', search);
  const qs = params.toString();
  const data = await apiGet('/api/admin/lecturer-portraits' + (qs ? '?' + qs : ''));
  if (!data) return;
  const container = document.getElementById('staff-content');
  const lecturers = data.lecturers || [];
  const admins = data.admins || [];

  if (lecturers.length === 0 && admins.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:40px"><div class="icon"><i data-lucide="users"></i></div><h3>No Staff Found</h3><p>No staff members match your criteria.</p></div>';
    lucide.createIcons();
    return;
  }

  let html = '';

  if (admins.length > 0) {
    const adminGrouped = {};
    for (const a of admins) {
      const sch = a.school || 'Unassigned';
      if (!adminGrouped[sch]) adminGrouped[sch] = [];
      adminGrouped[sch].push(a);
    }
    const adminSchools = Object.keys(adminGrouped).sort();
    for (const sch of adminSchools) {
      const staff = adminGrouped[sch];
      html += `<div class="glass-card" style="margin-bottom:20px">
        <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
          <h2 style="font-size:1rem;margin:0">${schoolBadge(sch)} <span style="color:var(--text-secondary);font-weight:400;font-size:0.85rem;margin-left:8px">${staff.length} admin member${staff.length > 1 ? 's' : ''}</span></h2>
        </div>
        <div class="card-body" style="padding:0">
          <div class="table-wrapper"><table>
            <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Email</th><th>Phone</th><th>Position</th></tr></thead>
            <tbody>${staff.map(s => {
              const roleLabel = s.role === 'school_admin' ? 'School Admin' : 'Admin';
              return `<tr>
                <td><strong>${s.full_name}</strong></td>
                <td><span class="badge badge-danger">${roleLabel}</span></td>
                <td>${s.department || '-'}</td>
                <td><a href="mailto:${s.email}" style="color:var(--primary);text-decoration:none">${s.email}</a></td>
                <td>${s.phone || '-'}</td>
                <td>${s.position || '-'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>
        </div>
      </div>`;
    }
  }

  if (lecturers.length > 0) {
    const lectGrouped = {};
    for (const l of lecturers) {
      const sch = l.school || 'Unassigned';
      if (!lectGrouped[sch]) lectGrouped[sch] = [];
      lectGrouped[sch].push(l);
    }
    const lectSchools = Object.keys(lectGrouped).sort();
    for (const sch of lectSchools) {
      const staff = lectGrouped[sch];
      html += `<div class="glass-card" style="margin-bottom:20px">
        <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
          <h2 style="font-size:1rem;margin:0">${schoolBadge(sch)} <span style="color:var(--text-secondary);font-weight:400;font-size:0.85rem;margin-left:8px">${staff.length} lecturer${staff.length > 1 ? 's' : ''}</span></h2>
        </div>
        <div class="card-body" style="padding:0">
          <div class="table-wrapper"><table>
            <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Email</th><th>Phone</th><th>Specialization</th></tr></thead>
            <tbody>${staff.map(l => `
              <tr>
                <td><strong>${l.full_name}</strong></td>
                <td><span class="badge badge-success">Lecturer</span></td>
                <td>${l.department || '-'}</td>
                <td><a href="mailto:${l.email}" style="color:var(--primary);text-decoration:none">${l.email}</a></td>
                <td>${l.phone || '-'}</td>
                <td>${l.specialization || '-'}</td>
              </tr>
            `).join('')}</tbody>
          </table></div>
        </div>
      </div>`;
    }
  }

  container.innerHTML = html;
  lucide.createIcons();
}

async function publishCourse(id) {
  const res = await apiPut(`/api/admin/courses/${id}/publish`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadCompilation();
  loadProgrammes();
  loadAdminStats();
}

async function unpublishCourse(id) {
  const res = await apiPut(`/api/admin/courses/${id}/unpublish`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadCompilation();
  loadProgrammes();
  loadAdminStats();
}

async function deleteCourse(id) {
  if (!(await showConfirm('Delete this course and all related data (enrollments, materials, assignments)? This cannot be undone.'))) return;
  const res = await apiDelete(`/api/admin/courses/${id}`);
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  loadCompilation();
  loadProgrammes();
  loadAdminStats();
}
