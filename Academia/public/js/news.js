/* ========== NEWS PAGE ========== */

let currentUserRole = '';

if (checkAuth()) {
  const user = getUser();
  currentUserRole = user.role;
  renderSidebar('news');
  if (user.role === 'lecturer' || user.role === 'admin') {
    document.getElementById('post-news-btn').style.display = 'inline-flex';
  }
  if (user.role === 'lecturer') {
    document.getElementById('news-submit-hint').style.display = 'block';
    document.getElementById('news-submit-btn').textContent = 'Submit for Approval';
  }
  loadNews();
}

async function loadNews() {
  showLoading('news-grid', 'Loading news...');
  const category = document.getElementById('news-category').value;
  const search = document.getElementById('news-search').value;
  const news = await apiGet(`/api/news?category=${category}&search=${encodeURIComponent(search)}`);
  if (!news) return;

  if (news.length === 0) {
    document.getElementById('news-grid').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon"><i data-lucide="megaphone"></i></div><h3>No News</h3><p>No articles found.</p></div>';
    lucide.createIcons();
    return;
  }

  const icons = { announcement: '<i data-lucide="bell"></i>', event: '<i data-lucide="calendar"></i>', update: '<i data-lucide="zap"></i>', urgent: '<i data-lucide="alert-triangle"></i>' };
  const colors = { announcement: 'var(--info)', event: 'var(--success)', update: 'var(--primary)', urgent: 'var(--danger)' };

  document.getElementById('news-grid').innerHTML = news.map(n => `
    <div class="news-card" onclick="viewArticle(${n.id})">
      <div class="news-img" style="background:linear-gradient(135deg, ${colors[n.category]||colors.announcement}, ${colors[n.category]||colors.announcement}dd)">
        ${icons[n.category] || icons.announcement}
      </div>
      <div class="news-content">
        <div style="margin-bottom:8px">
          <span class="badge badge-${n.category==='urgent'?'danger':n.category==='event'?'success':n.category==='update'?'purple':'primary'}">${n.category}</span>
          ${n.is_pinned ? '<span class="badge badge-warning">Pinned</span>' : ''}
          ${currentUserRole === 'lecturer' && n.status ? `<span class="badge badge-${n.status==='approved'?'success':n.status==='rejected'?'danger':'warning'}">${n.status}</span>` : ''}
        </div>
        <h3>${n.title}</h3>
        <p>${n.content.substring(0, 120)}${n.content.length > 120 ? '...' : ''}</p>
        <div class="news-meta">
          <span>${n.author}</span>
          <span>${timeAgo(n.created_at)}</span>
          ${n.school ? schoolBadge(n.school) : ''}
        </div>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

async function viewArticle(id) {
  const article = await apiGet(`/api/news/${id}`);
  if (!article) return;
  document.getElementById('article-title').textContent = article.title;
  document.getElementById('article-meta').innerHTML = `
    <span class="badge badge-${article.category==='urgent'?'danger':'primary'}">${article.category}</span>
    ${article.status ? `<span class="badge badge-${article.status==='approved'?'success':article.status==='rejected'?'danger':'warning'}">${article.status}</span>` : ''}
    &middot; By ${article.author} &middot; ${formatDateTime(article.created_at)}
    ${article.school ? '&middot; ' + schoolBadge(article.school) : ''}
  `;
  document.getElementById('article-body').innerHTML = article.content.replace(/\n/g, '<br>');
  showModal('view-news-modal');
}

async function postNews(e) {
  e.preventDefault();
  const formData = new FormData();
  formData.append('title', document.getElementById('news-title').value);
  formData.append('content', document.getElementById('news-content').value);
  formData.append('category', document.getElementById('news-cat').value);
  formData.append('school', document.getElementById('news-school').value);
  formData.append('is_pinned', document.getElementById('news-pinned').checked ? '1' : '0');

  const res = await apiPostForm('/api/news', formData);
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast(res.message || 'News submitted!', 'success');
  hideModal('news-modal');
  loadNews();
}
