/* ========== ASSIGNMENTS PAGE ========== */

if (checkAuth()) {
  const user = getUser();
  renderSidebar('assignments');
  if (user.role === 'lecturer') {
    document.getElementById('create-assignment-btn').style.display = 'inline-flex';
    document.getElementById('create-midsem-btn').style.display = 'inline-flex';
  }
  loadAssignments();
  loadMidsems();
  loadCoursesForSelects();
}

function showTab(tab, clickedElement) {
  document.querySelectorAll('.level-tab').forEach(t => t.classList.remove('active'));
  if (clickedElement && clickedElement.classList) clickedElement.classList.add('active');
  document.getElementById('assignments-tab').style.display = tab === 'assignments' ? 'block' : 'none';
  document.getElementById('midsems-tab').style.display = tab === 'midsems' ? 'block' : 'none';
}

async function loadCoursesForSelects() {
  const courses = await apiGet('/api/courses');
  if (!courses) return;
  const placeholder = '<option value="" disabled selected>Select a course</option>';
  const options = courses.map(c => `<option value="${c.id}">${c.code} - ${c.title}</option>`).join('');
  document.getElementById('as-course').innerHTML = placeholder + options;
  document.getElementById('ms-course').innerHTML = placeholder + options;
}

async function loadAssignments() {
  const data = await apiGet('/api/assignments');
  if (!data) return;
  const user = getUser();

  if (data.length === 0) {
    document.getElementById('assignments-table').style.display = 'none';
    document.getElementById('no-assignments').style.display = 'block';
    return;
  }

  document.getElementById('assignments-body').innerHTML = data.map(a => {
    const isOverdue = new Date(a.due_date) < new Date();
    let statusHtml = '';
    let actionHtml = '';

    if (user.role === 'student') {
      if (a.submitted) {
        statusHtml = `<span class="badge badge-success">Submitted</span>`;
        actionHtml = a.my_grade !== null ? `<span class="badge badge-primary">Grade: ${a.my_grade}/${a.total_marks}</span>` : '<span class="badge badge-warning">Graded pending</span>';
      } else if (isOverdue) {
        statusHtml = '<span class="badge badge-danger">Overdue</span>';
      } else {
        statusHtml = '<span class="badge badge-warning">Pending</span>';
        actionHtml = `<button class="btn btn-primary btn-sm" onclick="openSubmit(${a.id})">Submit</button>`;
      }
    } else {
      statusHtml = `<span class="badge badge-info">${a.submission_count || 0} submissions</span>`;
      actionHtml = `<span class="badge badge-purple">${a.graded_count || 0} graded</span>`;
    }

    return `
      <tr>
        <td><strong>${a.course_code}</strong><br><small style="color:var(--text-secondary)">${a.course_title}</small></td>
        <td>${a.title}</td>
        <td>${formatDateTime(a.due_date)}${isOverdue ? '<br><small style="color:var(--danger)">Overdue</small>' : ''}</td>
        <td>${statusHtml}</td>
        <td>${actionHtml}</td>
      </tr>
    `;
  }).join('');
  lucide.createIcons();
}

async function loadMidsems() {
  const data = await apiGet('/api/assignments/midsems');
  if (!data) return;

  if (data.length === 0) {
    document.querySelector('#midsems-tab table').style.display = 'none';
    document.getElementById('no-midsems').style.display = 'block';
    return;
  }

  document.getElementById('midsems-body').innerHTML = data.map(m => `
    <tr>
      <td><strong>${m.course_code}</strong><br><small>${m.course_title}</small></td>
      <td>${m.title}</td>
      <td>${formatDateTime(m.exam_date)}<br><small>${m.duration_minutes} mins</small></td>
      <td>${m.venue || 'TBA'}</td>
      <td>${m.total_marks}</td>
    </tr>
  `).join('');
  lucide.createIcons();
}

function openSubmit(assignmentId) {
  document.getElementById('submit-assignment-id').value = assignmentId;
  showModal('submit-modal');
}

async function submitAssignment(e) {
  e.preventDefault();
  const formData = new FormData();
  const notes = document.getElementById('submit-notes').value;
  if (notes) formData.append('notes', notes);
  const file = document.getElementById('submit-file').files[0];
  if (file) formData.append('file', file);

  const res = await apiPostForm(`/api/assignments/submit/${document.getElementById('submit-assignment-id').value}`, formData);
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('Assignment submitted!', 'success');
  hideModal('submit-modal');
  loadAssignments();
}

async function createAssignment(e) {
  e.preventDefault();
  const formData = new FormData();
  formData.append('course_id', document.getElementById('as-course').value);
  formData.append('title', document.getElementById('as-title').value);
  formData.append('description', document.getElementById('as-desc').value);
  formData.append('due_date', document.getElementById('as-due').value);
  formData.append('total_marks', document.getElementById('as-marks').value);
  const file = document.getElementById('as-file').files[0];
  if (file) formData.append('attachment', file);

  const res = await apiPostForm('/api/assignments', formData);
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('Assignment created!', 'success');
  hideModal('assignment-modal');
  loadAssignments();
}

async function createMidsem(e) {
  e.preventDefault();
  const res = await apiPost('/api/assignments/midsem', {
    course_id: document.getElementById('ms-course').value,
    title: document.getElementById('ms-title').value,
    description: document.getElementById('ms-desc').value,
    exam_date: document.getElementById('ms-date').value,
    duration_minutes: document.getElementById('ms-duration').value,
    total_marks: document.getElementById('ms-marks').value,
    venue: document.getElementById('ms-venue').value,
    instructions: document.getElementById('ms-instructions').value,
  });
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('Mid-sem exam scheduled!', 'success');
  hideModal('midsem-modal');
  loadMidsems();
}
