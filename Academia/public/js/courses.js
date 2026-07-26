/* ========== COURSES PAGE ========== */

let currentLevel = '';
let allCourses = [];

if (checkAuth()) {
  const user = getUser();
  renderSidebar('courses');

  if (user.role === 'student' && user.level) {
    currentLevel = user.level;
    document.querySelectorAll('.level-tab').forEach(t => {
      t.classList.remove('active');
      if (t.textContent.trim() === user.level) t.classList.add('active');
    });
  }

  if (user.role === 'lecturer') {
    document.getElementById('add-course-btn').style.display = 'inline-flex';
    document.getElementById('upload-material-btn').style.display = 'inline-flex';
  }
  if (user.role === 'student') {
    document.getElementById('courses-view-toggle').style.display = 'flex';
  } else {
    document.getElementById('courses-view-toggle').style.display = 'none';
  }
  loadCourses();
}

async function loadCourses() {
  showLoading('course-list', 'Loading courses...');
  const semester = document.getElementById('semester-filter').value;
  const search = document.getElementById('search-courses').value;
  const url = `/api/courses?level=${currentLevel}&semester=${semester}&search=${encodeURIComponent(search)}`;
  const courses = await apiGet(url);
  if (!courses) return;
  allCourses = courses;
  renderCourses(courses);
}

function filterLevel(level, clickedElement) {
  currentLevel = level;
  document.querySelectorAll('.level-tab').forEach(t => t.classList.remove('active'));
  if (clickedElement && clickedElement.classList) clickedElement.classList.add('active');
  loadCourses();
}

function renderCourses(courses) {
  const user = getUser();
  if (courses.length === 0) {
    document.getElementById('course-list').innerHTML = '<div class="empty-state"><div class="icon"><i data-lucide="book-open"></i></div><h3>No Courses Found</h3><p>No courses match your criteria.</p></div>';
    lucide.createIcons();
    return;
  }

  document.getElementById('course-list').innerHTML = courses.map(c => {
    const isEnrolled = c.enrolled;
    let actionBtns = '';
    if (user.role === 'student') {
      actionBtns = isEnrolled
        ? `<button class="btn btn-danger btn-sm" onclick="unenrollCourse(${c.id})">Drop</button>`
        : `<button class="btn btn-success btn-sm" onclick="enrollCourse(${c.id})">Register</button>`;
    }
    return `
      <div class="course-card">
        <div class="course-code">${c.code}</div>
        <h3>${c.title}</h3>
        <div class="course-meta">
          <span class="badge badge-primary">${c.level}</span>
          <span class="badge badge-${c.semester==='first'?'success':'purple'}">${c.semester} semester</span>
          <span style="margin-left:8px;font-size:0.85rem">${c.lecturer_name || 'TBA'}</span>
          ${user.role === 'student' && isEnrolled ? '<span class="badge badge-success" style="margin-left:4px">Registered</span>' : ''}
        </div>
        <div class="course-actions">
          <button class="btn btn-primary btn-sm" onclick="viewMaterials(${c.id}, '${c.code} - ${c.title.replace(/'/g,"\\'")}')">Materials</button>
          ${actionBtns}
        </div>
      </div>
    `;
  }).join('');

  const matSelect = document.getElementById('mat-course');
  if (matSelect) {
    matSelect.innerHTML = courses.map(c => `<option value="${c.id}">${c.code} - ${c.title}</option>`).join('');
  }
}

async function viewMaterials(courseId, courseName) {
  document.getElementById('materials-title').textContent = 'Materials: ' + courseName;
  document.getElementById('materials-panel').style.display = 'block';
  const materials = await apiGet(`/api/courses/${courseId}/materials`);
  if (!materials || materials.length === 0) {
    document.getElementById('materials-list').innerHTML = '<div class="empty-state"><div class="icon"><i data-lucide="file"></i></div><p>No materials uploaded yet</p></div>';
    lucide.createIcons();
    return;
  }
  document.getElementById('materials-list').innerHTML = materials.map(m => {
    const ext = m.file_path ? m.file_path.split('.').pop().toLowerCase() : '';
    const iconClass = ['pdf'].includes(ext) ? 'pdf' : ['doc','docx','txt'].includes(ext) ? 'doc' : ['mp4','avi','mov'].includes(ext) ? 'vid' : 'other';
    const icons = { pdf: '<i data-lucide="file"></i>', doc: '<i data-lucide="file-text"></i>', vid: '<i data-lucide="video"></i>', other: '<i data-lucide="folder"></i>' };
    return `
      <li class="material-item">
        <div class="material-icon ${iconClass}">${icons[iconClass] || icons.other}</div>
        <div class="material-info">
          <h4>${m.title}</h4>
          <p>${m.category ? m.category.replace(/_/g,' ') : ''} ${m.academic_year ? '&middot; ' + m.academic_year : ''} &middot; ${m.uploaded_by_name}</p>
        </div>
        ${m.file_path ? `<a href="${m.file_path}" target="_blank" class="btn btn-outline btn-sm">Download</a>` : ''}
      </li>
    `;
  }).join('');
  lucide.createIcons();
}

async function enrollCourse(courseId) {
  const res = await apiPost('/api/courses/enroll', { course_id: courseId });
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  if (!res.error) loadCourses();
}

async function unenrollCourse(courseId) {
  if (!confirm('Are you sure you want to drop this course?')) return;
  const res = await apiPost('/api/courses/unenroll', { course_id: courseId });
  showToast(res.message || res.error, res.error ? 'error' : 'success');
  if (!res.error) loadCourses();
}

async function createCourse(e) {
  e.preventDefault();
  const res = await apiPost('/api/admin/courses', {
    code: document.getElementById('cr-code').value,
    title: document.getElementById('cr-title').value,
    description: document.getElementById('cr-desc').value,
    level: document.getElementById('cr-level').value,
    school: document.getElementById('cr-school').value,
    department: document.getElementById('cr-dept').value,
    semester: document.getElementById('cr-semester').value,
  });
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast(res.message || 'Course created!', 'success');
  hideModal('course-modal');
  loadCourses();
}

async function uploadMaterial(e) {
  e.preventDefault();
  const formData = new FormData();
  formData.append('course_id', document.getElementById('mat-course').value);
  formData.append('title', document.getElementById('mat-title').value);
  formData.append('description', document.getElementById('mat-desc').value);
  formData.append('category', document.getElementById('mat-category').value);
  formData.append('academic_year', document.getElementById('mat-year').value);
  const file = document.getElementById('mat-file').files[0];
  if (file) formData.append('file', file);

  const res = await apiPostForm('/api/courses', formData);
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('Material uploaded!', 'success');
  hideModal('material-modal');
}

function switchView(view) {
  const coursesView = document.getElementById('courses-view');
  const materialsView = document.getElementById('materials-view');
  const tabCourses = document.getElementById('tab-courses');
  const tabMaterials = document.getElementById('tab-materials');

  if (view === 'materials') {
    coursesView.style.display = 'none';
    materialsView.style.display = 'block';
    tabCourses.classList.remove('active');
    tabMaterials.classList.add('active');
    loadMyMaterials();
  } else {
    coursesView.style.display = 'block';
    materialsView.style.display = 'none';
    tabCourses.classList.add('active');
    tabMaterials.classList.remove('active');
  }
}

async function loadMyMaterials() {
  const list = document.getElementById('my-materials-list');
  showLoading('my-materials-list', 'Loading materials...');

  const category = document.getElementById('material-category-filter').value;
  const search = document.getElementById('search-materials').value.toLowerCase();

  const materials = await apiGet('/api/courses/my-materials');
  if (!materials) return;

  let filtered = materials;
  if (category) filtered = filtered.filter(m => m.category === category);
  if (search) filtered = filtered.filter(m =>
    m.title.toLowerCase().includes(search) ||
    m.course_code.toLowerCase().includes(search) ||
    m.course_title.toLowerCase().includes(search)
  );

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="icon"><i data-lucide="file-text"></i></div><h3>No Materials Found</h3><p>No materials have been uploaded for your registered courses yet.</p></div>';
    lucide.createIcons();
    return;
  }

  const grouped = {};
  filtered.forEach(m => {
    const key = m.course_code + ' - ' + m.course_title;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  });

  let html = '';
  for (const [courseName, mats] of Object.entries(grouped)) {
    const categoryIcons = {
      lecture_note: 'file-text', textbook: 'book-open', slide: 'presentation',
      past_question: 'help-circle', video: 'video', other: 'folder'
    };
    html += `<div class="materials-group">
      <div class="materials-group-header">
        <i data-lucide="book-open"></i>
        <span>${courseName}</span>
        <span class="badge badge-primary">${mats.length} material${mats.length > 1 ? 's' : ''}</span>
      </div>
      <div class="materials-group-body">`;
    mats.forEach(m => {
      const icon = categoryIcons[m.category] || 'file';
      html += `
        <div class="material-card">
          <div class="material-card-icon"><i data-lucide="${icon}"></i></div>
          <div class="material-card-info">
            <h4>${m.title}</h4>
            <p>${m.category ? m.category.replace(/_/g, ' ') : ''}${m.academic_year ? ' &middot; ' + m.academic_year : ''} &middot; ${m.uploaded_by_name}</p>
          </div>
          ${m.file_path ? `<a href="${m.file_path}" target="_blank" class="btn btn-outline btn-sm"><i data-lucide="download"></i></a>` : ''}
        </div>`;
    });
    html += '</div></div>';
  }
  list.innerHTML = html;
  lucide.createIcons();
}
