const API_BASE = '';

const SCHOOL_LOGOS = {
  'University for Development Studies': '/images/schools/uds.png',
  'University of Education, Winneba': '/images/schools/uew.png',
  'Ghana Institute of Management and Public Administration': '/images/schools/gimpa.png',
  'University of Mines and Technology': '/images/schools/umat.png',
  'University of Health and Allied Sciences': '/images/schools/uhas.png',
  'University of Energy and Natural Resources': '/images/schools/uenr.png',
  'University of Ghana': '/images/schools/ug.png',
  'Ghana Communication Technology University': '/images/schools/gctu.png',
  'Kwame Nkrumah University of Science and Technology': '/images/schools/knust.png',
  'University of Cape Coast': '/images/schools/ucc.png',
  'University of Professional Studies, Accra': '/images/schools/upsa.png',
  'Central University': '/images/schools/cu.png'
};

const SCHOOL_SHORT = {
  'University for Development Studies': 'UDS',
  'University of Education, Winneba': 'UEW',
  'Ghana Institute of Management and Public Administration': 'GIMPA',
  'University of Mines and Technology': 'UMaT',
  'University of Health and Allied Sciences': 'UHAS',
  'University of Energy and Natural Resources': 'UENR',
  'University of Ghana': 'UG',
  'Ghana Communication Technology University': 'GCTU',
  'Kwame Nkrumah University of Science and Technology': 'KNUST',
  'University of Cape Coast': 'UCC',
  'University of Professional Studies, Accra': 'UPSA',
  'Central University': 'CU'
};

function getSchoolLogo(school) {
  return SCHOOL_LOGOS[school] || '';
}

function getSchoolShort(school) {
  return SCHOOL_SHORT[school] || school || '';
}

function schoolBadge(school) {
  if (!school) return '';
  const logo = getSchoolLogo(school);
  const short = getSchoolShort(school);
  if (logo) {
    return `<span class="school-badge"><img src="${logo}" alt="${short}" class="school-badge-logo"> ${short}</span>`;
  }
  return `<span class="school-badge">${school}</span>`;
}

function showPreloader() {
  if (document.getElementById('preloader')) return;
  const preloader = document.createElement('div');
  preloader.id = 'preloader';
  preloader.className = 'preloader';
  preloader.innerHTML = `
    <img src="/images/logos/logo1.png" alt="Academia" class="preloader-logo">
    <img src="/images/logos/logo2.png" alt="Academia" class="preloader-logo-text">
    <div class="preloader-spinner"></div>
  `;
  document.body.prepend(preloader);
}

function hidePreloader() {
  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.classList.add('hidden');
    setTimeout(() => preloader.remove(), 400);
  }
}

showPreloader();
window.addEventListener('load', () => setTimeout(hidePreloader, 600));

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

function checkAuth() {
  if (!getToken()) { window.location.href = '/'; return false; }
  return true;
}

function checkRole(...roles) {
  const user = getUser();
  if (!user || !roles.includes(user.role)) {
    window.location.href = '/dashboard';
    return false;
  }
  return true;
}

async function logout() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
  localStorage.clear();
  window.location.href = '/';
}

async function apiGet(url) {
  try {
    const res = await fetch(API_BASE + url, {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    if (res.status === 401 || res.status === 403) { logout(); return null; }
    return await res.json();
  } catch { showToast('Network error. Please try again.', 'error'); return null; }
}

async function apiPost(url, body) {
  try {
    const res = await fetch(API_BASE + url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken()
      },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch { showToast('Network error. Please try again.', 'error'); return { error: 'Network error' }; }
}

async function apiPostForm(url, formData) {
  try {
    const res = await fetch(API_BASE + url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: formData
    });
    return await res.json();
  } catch { showToast('Network error. Please try again.', 'error'); return { error: 'Network error' }; }
}

async function apiDelete(url) {
  try {
    const res = await fetch(API_BASE + url, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    return await res.json();
  } catch { showToast('Network error. Please try again.', 'error'); return { error: 'Network error' }; }
}

async function apiPut(url, body) {
  try {
    const res = await fetch(API_BASE + url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken()
      },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch { showToast('Network error. Please try again.', 'error'); return { error: 'Network error' }; }
}

function showToast(message, type = 'info') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast ' + type;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((d - now) / 1000);
  if (diff > 0) {
    if (diff < 60) return 'In a moment';
    if (diff < 3600) return 'In ' + Math.floor(diff / 60) + 'm';
    if (diff < 86400) return 'In ' + Math.floor(diff / 3600) + 'h';
    return 'In ' + Math.floor(diff / 86400) + 'd';
  }
  const absDiff = Math.abs(diff);
  if (absDiff < 60) return 'Just now';
  if (absDiff < 3600) return Math.floor(absDiff / 60) + 'm ago';
  if (absDiff < 86400) return Math.floor(absDiff / 3600) + 'h ago';
  return Math.floor(absDiff / 86400) + 'd ago';
}

function renderSidebar(activePage) {
  const user = getUser();
  if (!user) return;

  const initials = user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  let navItems = '';
  const studentNav = `
    <div class="nav-section">Main</div>
    <a href="/dashboard" class="nav-item ${activePage==='dashboard'?'active':''}"><i data-lucide="layout-dashboard"></i>Dashboard</a>
    <a href="/courses" class="nav-item ${activePage==='courses'?'active':''}"><i data-lucide="book-open"></i>My Courses</a>
    <a href="/assignments" class="nav-item ${activePage==='assignments'?'active':''}"><i data-lucide="file-text"></i>Assignments</a>
    <a href="/calendar" class="nav-item ${activePage==='calendar'?'active':''}"><i data-lucide="calendar"></i>Calendar</a>
    <a href="/news" class="nav-item ${activePage==='news'?'active':''}"><i data-lucide="megaphone"></i>News</a>
    <div class="nav-section">People</div>
    <a href="/lecturers" class="nav-item ${activePage==='lecturers'?'active':''}"><i data-lucide="users"></i>Lecturers</a>
  `;

  const lecturerNav = `
    <div class="nav-section">Main</div>
    <a href="/dashboard" class="nav-item ${activePage==='dashboard'?'active':''}"><i data-lucide="layout-dashboard"></i>Dashboard</a>
    <a href="/courses" class="nav-item ${activePage==='courses'?'active':''}"><i data-lucide="book-open"></i>My Courses</a>
    <a href="/assignments" class="nav-item ${activePage==='assignments'?'active':''}"><i data-lucide="file-text"></i>Assignments & Exams</a>
    <a href="/calendar" class="nav-item ${activePage==='calendar'?'active':''}"><i data-lucide="calendar"></i>Calendar</a>
    <a href="/news" class="nav-item ${activePage==='news'?'active':''}"><i data-lucide="megaphone"></i>News</a>
    <div class="nav-section">Profile</div>
    <a href="/profile" class="nav-item ${activePage==='profile'?'active':''}"><i data-lucide="user-circle"></i>My Portrait</a>
  `;

  const adminNav = `
    <div class="nav-section">Main</div>
    <a href="/dashboard" class="nav-item ${activePage==='dashboard'?'active':''}"><i data-lucide="layout-dashboard"></i>Dashboard</a>
    <a href="/admin" class="nav-item ${activePage==='admin'?'active':''}"><i data-lucide="settings"></i>Admin Panel</a>
    <a href="/courses" class="nav-item ${activePage==='courses'?'active':''}"><i data-lucide="book-open"></i>All Courses</a>
    <a href="/calendar" class="nav-item ${activePage==='calendar'?'active':''}"><i data-lucide="calendar"></i>Calendar</a>
    <a href="/news" class="nav-item ${activePage==='news'?'active':''}"><i data-lucide="megaphone"></i>News</a>
    <a href="/admin-profile" class="nav-item ${activePage==='admin-profile'?'active':''}"><i data-lucide="shield-check"></i>My Portrait</a>
    <div class="nav-section">People</div>
    <a href="/lecturers" class="nav-item ${activePage==='lecturers'?'active':''}"><i data-lucide="users"></i>Lecturer Portraits</a>
  `;

  let nav = (user.role === 'admin' || user.role === 'school_admin') ? adminNav : user.role === 'lecturer' ? lecturerNav : studentNav;
  const schoolLogo = SCHOOL_LOGOS[user.school] || '';

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-header">
      <div class="logo-wrap">
        <img src="/images/logos/logo1.png" alt="Academia" class="sidebar-logo" onerror="this.style.display='none'">
        <img src="/images/logos/logo2.png" alt="Academia" class="sidebar-brand-logo">
      </div>
      ${schoolLogo ? `<div class="sidebar-school"><img src="${schoolLogo}" alt="${user.school}" class="school-logo"></div>` : ''}
      <div class="subtitle">${user.school || 'System'}</div>
    </div>
    <div class="sidebar-nav">${nav}</div>
    <div class="sidebar-footer">
      <div class="user-info">
        <div class="user-avatar">${initials}</div>
        <div class="user-details">
          <div class="user-name">${user.full_name}</div>
          <div class="user-role">${user.role === 'school_admin' ? 'School Admin' : user.role.charAt(0).toUpperCase() + user.role.slice(1)} ${user.level || ''}</div>
        </div>
      </div>
      <button class="btn btn-outline btn-sm" style="width:100%;margin-top:12px;font-size:0.8rem;" onclick="openChangePasswordModal(false, '${activePage}')">
        <i data-lucide="key-round" style="width:14px;height:14px"></i> Change Password
      </button>
      <button class="btn btn-outline btn-sm" style="width:100%;margin-top:8px;font-size:0.8rem;" onclick="logout()">
        <i data-lucide="log-out" style="width:14px;height:14px"></i> Sign Out
      </button>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function openChangePasswordModal(forceReset = false, activePage) {
  const existing = document.getElementById('change-password-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'change-password-modal';
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>Account Settings</h2>
        <button type="button" class="modal-close" onclick="closeChangePasswordModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div id="change-password-message" class="success-msg" style="display:${forceReset ? 'block' : 'none'}">${forceReset ? 'Your account is still using the default password. Update it now to continue securely.' : ''}</div>
        <div id="change-password-error" class="error-msg" style="display:none"></div>

        <div style="margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid var(--border-light)">
          <label style="display:block;margin-bottom:6px;font-weight:600;font-size:0.82rem;color:var(--text-secondary)">Your School</label>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="cp-school" style="flex:1;padding:10px 14px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:0.9rem;font-family:inherit;background:var(--bg);color:var(--text);transition:var(--transition)">
              <option value="University for Development Studies">University for Development Studies</option>
              <option value="University of Education, Winneba">University of Education, Winneba</option>
              <option value="Ghana Institute of Management and Public Administration">Ghana Institute of Management and Public Administration</option>
              <option value="University of Mines and Technology">University of Mines and Technology</option>
              <option value="University of Health and Allied Sciences">University of Health and Allied Sciences</option>
              <option value="University of Energy and Natural Resources">University of Energy and Natural Resources</option>
              <option value="University of Ghana">University of Ghana</option>
              <option value="Ghana Communication Technology University">Ghana Communication Technology University</option>
              <option value="Kwame Nkrumah University of Science and Technology">Kwame Nkrumah University of Science and Technology</option>
              <option value="University of Cape Coast">University of Cape Coast</option>
              <option value="University of Professional Studies, Accra">University of Professional Studies, Accra</option>
              <option value="Central University">Central University</option>
            </select>
            <button type="button" class="btn btn-primary btn-sm" id="cp-school-save" style="white-space:nowrap">Save</button>
          </div>
        </div>

        <div class="form-group">
          <label for="cp-current-password">Current Password</label>
          <input id="cp-current-password" type="password" placeholder="Enter your current password" required>
        </div>
        <div class="form-group">
          <label for="cp-new-password">New Password</label>
          <input id="cp-new-password" type="password" placeholder="Enter a new password" required>
        </div>
        <div class="form-group">
          <label for="cp-confirm-password">Confirm New Password</label>
          <input id="cp-confirm-password" type="password" placeholder="Re-enter the new password" required>
        </div>
        <div class="form-group" id="cp-mfa-wrap" style="display:none;">
          <label for="cp-mfa-otp">MFA Setup Code</label>
          <input id="cp-mfa-otp" type="text" maxlength="6" placeholder="Enter the 6-digit MFA code" required>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline" onclick="closeChangePasswordModal()">Cancel</button>
        <button type="button" class="btn btn-primary" id="change-password-submit">Update Password</button>
        <button type="button" class="btn btn-outline" id="mfa-setup-button" style="display:none;">Enable MFA</button>
        <button type="button" class="btn btn-primary" id="mfa-verify-button" style="display:none;">Verify MFA</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const mfaSetupButton = document.getElementById('mfa-setup-button');
  const mfaVerifyButton = document.getElementById('mfa-verify-button');
  const cpMfaWrap = document.getElementById('cp-mfa-wrap');
  const cpMfaOtp = document.getElementById('cp-mfa-otp');
  let pendingMfaChallengeToken = null;

  const user = getUser();
  const schoolSelect = document.getElementById('cp-school');
  const schoolSection = schoolSelect ? schoolSelect.closest('[style*="margin-bottom"]') || schoolSelect.parentElement.parentElement.parentElement : null;
  if (user && user.role !== 'admin') {
    if (schoolSection) schoolSection.style.display = 'none';
  } else if (user && user.school) {
    schoolSelect.value = user.school;
  }

  const messageBox = document.getElementById('change-password-message');
  const errorBox = document.getElementById('change-password-error');

  document.getElementById('cp-school-save').addEventListener('click', async () => {
    const selected = schoolSelect.value;
    const result = await apiPost('/api/auth/update-school', { school: selected });
    if (result?.error) {
      errorBox.textContent = result.error;
      errorBox.style.display = 'block';
      messageBox.style.display = 'none';
      return;
    }
    const storedUser = getUser();
    if (storedUser) {
      storedUser.school = selected;
      localStorage.setItem('user', JSON.stringify(storedUser));
    }
    messageBox.textContent = 'School updated successfully.';
    messageBox.style.display = 'block';
    errorBox.style.display = 'none';
    renderSidebar(activePage || 'dashboard');
  });

  document.getElementById('change-password-submit').addEventListener('click', async () => {
    const currentPassword = document.getElementById('cp-current-password').value;
    const newPassword = document.getElementById('cp-new-password').value;
    const confirmPassword = document.getElementById('cp-confirm-password').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      errorBox.textContent = 'Please complete all password fields.';
      errorBox.style.display = 'block';
      messageBox.style.display = 'none';
      return;
    }

    if (newPassword !== confirmPassword) {
      errorBox.textContent = 'New passwords do not match.';
      errorBox.style.display = 'block';
      messageBox.style.display = 'none';
      return;
    }

    const result = await apiPost('/api/auth/change-password', { currentPassword, newPassword });
    if (result?.error) {
      errorBox.textContent = result.error;
      errorBox.style.display = 'block';
      messageBox.style.display = 'none';
      return;
    }

    messageBox.textContent = result?.message || 'Password changed successfully.';
    messageBox.style.display = 'block';
    errorBox.style.display = 'none';
    document.getElementById('change-password-submit').disabled = true;

    const storedUser = getUser();
    if (storedUser) {
      storedUser.forcePasswordChange = false;
      localStorage.setItem('user', JSON.stringify(storedUser));
    }

    mfaSetupButton.style.display = 'inline-flex';
  });

  mfaSetupButton.addEventListener('click', async () => {
    const result = await apiPost('/api/auth/request-mfa-setup', {});
    if (result?.error) {
      errorBox.textContent = result.error;
      errorBox.style.display = 'block';
      messageBox.style.display = 'none';
      return;
    }

    pendingMfaChallengeToken = result?.challengeToken || null;
    cpMfaWrap.style.display = 'block';
    mfaVerifyButton.style.display = 'inline-flex';
    messageBox.textContent = result?.message || 'A verification code has been sent to your email. In preview mode, the code will also be printed in the server console.';
    messageBox.style.display = 'block';
    errorBox.style.display = 'none';
  });

  mfaVerifyButton.addEventListener('click', async () => {
    const otpCode = cpMfaOtp.value.trim();
    if (!pendingMfaChallengeToken || !otpCode) {
      errorBox.textContent = 'Request the MFA code first, then enter the 6-digit verification code.';
      errorBox.style.display = 'block';
      messageBox.style.display = 'none';
      return;
    }

    const result = await apiPost('/api/auth/confirm-mfa-setup', {
      challengeToken: pendingMfaChallengeToken,
      otpCode
    });

    if (result?.error) {
      errorBox.textContent = result.error;
      errorBox.style.display = 'block';
      messageBox.style.display = 'none';
      return;
    }

    messageBox.textContent = result?.message || 'MFA has been enabled successfully.';
    messageBox.style.display = 'block';
    errorBox.style.display = 'none';
    mfaVerifyButton.disabled = true;
    cpMfaWrap.style.display = 'none';
    setTimeout(() => closeChangePasswordModal(), 2000);
  });
}

function closeChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) modal.remove();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const isOpen = sidebar.classList.toggle('open');
  let backdrop = document.getElementById('sidebar-backdrop');
  if (isOpen && window.innerWidth <= 768) {
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'sidebar-backdrop';
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:99;display:none';
      document.body.appendChild(backdrop);
    }
    backdrop.style.display = 'block';
  } else if (backdrop) {
    backdrop.remove();
  }
}

function showModal(id) { document.getElementById(id)?.classList.add('active'); }
function hideModal(id) { document.getElementById(id)?.classList.remove('active'); }

function showLoading(containerId, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="empty-state"><div class="preloader-spinner" style="width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:preloaderSpin .8s linear infinite;margin:0 auto 12px"></div><p style="color:var(--text-secondary);font-size:0.9rem">${message || 'Loading...'}</p></div>`;
}

document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open') && !sidebar.contains(e.target) && !e.target.closest('.mobile-toggle')) {
    sidebar.classList.remove('open');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) backdrop.remove();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      const backdrop = document.getElementById('sidebar-backdrop');
      if (backdrop) backdrop.remove();
      return;
    }
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    const cpModal = document.getElementById('change-password-modal');
    if (cpModal) cpModal.remove();
  }
});

document.addEventListener('click', (e) => {
  const overlay = e.target.closest('.modal-overlay');
  if (overlay && e.target === overlay) {
    overlay.classList.remove('active');
  }
});

/* ========== IDLE SESSION TIMEOUT ========== */
(function() {
  const IDLE_WARNING_MS = 14 * 60 * 1000;
  const IDLE_LOGOUT_MS = 15 * 60 * 1000;
  const COUNTDOWN_SECONDS = 60;

  let idleTimer = null;
  let logoutTimer = null;
  let countdownInterval = null;
  let countdownRemaining = COUNTDOWN_SECONDS;

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    clearTimeout(logoutTimer);
    clearInterval(countdownInterval);
    removeIdleModal();
    idleTimer = setTimeout(showIdleWarning, IDLE_WARNING_MS);
  }

  function showIdleWarning() {
    if (!getToken()) return;
    countdownRemaining = COUNTDOWN_SECONDS;
    const overlay = document.createElement('div');
    overlay.id = 'idle-timeout-modal';
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px;text-align:center">
        <div class="modal-header"><h2>Session Expiring</h2></div>
        <div class="modal-body" style="padding:20px 24px">
          <p style="margin-bottom:12px;color:var(--text-secondary)">You've been inactive. Your session will expire in:</p>
          <div id="idle-countdown" style="font-size:2.2rem;font-weight:800;color:var(--primary);margin-bottom:16px">${countdownRemaining}s</div>
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:20px">Click anywhere or press a key to stay signed in.</p>
          <button class="btn btn-primary btn-block" id="idle-stay-btn">Stay Signed In</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('idle-stay-btn').addEventListener('click', resetIdleTimer);

    countdownInterval = setInterval(() => {
      countdownRemaining--;
      const el = document.getElementById('idle-countdown');
      if (el) el.textContent = countdownRemaining + 's';
      if (countdownRemaining <= 0) {
        clearInterval(countdownInterval);
        performIdleLogout();
      }
    }, 1000);

    logoutTimer = setTimeout(performIdleLogout, IDLE_LOGOUT_MS);
  }

  function performIdleLogout() {
    clearInterval(countdownInterval);
    clearTimeout(idleTimer);
    clearTimeout(logoutTimer);
    removeIdleModal();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  }

  function removeIdleModal() {
    const modal = document.getElementById('idle-timeout-modal');
    if (modal) modal.remove();
  }

  const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
  events.forEach(evt => document.addEventListener(evt, resetIdleTimer, { passive: true }));
  resetIdleTimer();
})();
