// Behold Content System Frontend Logic

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  loadDashboardData();
  setupFaqForm();
});

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const tabId = `tab-${item.dataset.tab}`;
      const targetPane = document.getElementById(tabId);
      if (targetPane) targetPane.classList.add('active');

      if (item.dataset.tab === 'ranked-topics') loadRankedTopics();
      if (item.dataset.tab === 'review-gate') loadDrafts();
      if (item.dataset.tab === 'source-library') loadSources();
    });
  });
}

async function loadDashboardData() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('stat-signals').textContent = stats.total_signals || 0;
    document.getElementById('stat-candidates').textContent = stats.total_candidates || 0;
    document.getElementById('stat-scored').textContent = stats.total_scored || 0;
    document.getElementById('stat-sources').textContent = stats.verified_sources || 0;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadRankedTopics() {
  const tbody = document.getElementById('topics-table-body');
  try {
    const res = await fetch('/api/topics');
    const topics = await res.json();

    if (topics.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9">No scored topics available yet. Run `npm run research` or `npm run seed`.</td></tr>';
      return;
    }

    tbody.innerHTML = topics.map((t, idx) => {
      let tierBadge = '<span class="badge badge-gold">Create First</span>';
      if (t.total_score < 21 && t.total_score >= 17) tierBadge = '<span class="badge badge-green">Future Topic</span>';
      if (t.total_score < 17) tierBadge = '<span class="badge" style="background:#333;color:#888;">Low Priority</span>';

      return `
        <tr>
          <td><strong>#${idx + 1}</strong></td>
          <td><strong>${escapeHtml(t.title)}</strong><br><small style="color:var(--text-muted)">${escapeHtml(t.underlying_problem || '')}</small></td>
          <td>${t.m1_audience_relevance}/5</td>
          <td>${t.m2_visible_demand}/5</td>
          <td>${t.m3_behold_fit}/5</td>
          <td>${t.m4_client_usefulness}/5</td>
          <td>${t.m5_distinctive_angle}/5</td>
          <td><strong style="color:var(--accent-gold-light);font-size:1.1rem">${t.total_score}/25</strong></td>
          <td>${tierBadge}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9">Error loading topics.</td></tr>';
  }
}

async function loadDrafts() {
  const container = document.getElementById('drafts-container');
  try {
    const res = await fetch('/api/drafts');
    const drafts = await res.json();

    if (drafts.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted)">No drafts currently pending review.</p>';
      return;
    }

    container.innerHTML = drafts.map(d => `
      <div class="draft-card">
        <h4>${escapeHtml(d.title)}</h4>
        <div class="draft-meta">Status: <strong>${d.status.toUpperCase()}</strong> | Type: ${d.draft_type}</div>
        <div class="draft-preview">${escapeHtml(d.body)}</div>
        <div class="draft-actions">
          <button class="btn btn-primary" onclick="approveDraft(${d.id})">✓ Approve & Generate Briefs</button>
          <button class="btn btn-danger" onclick="rejectDraft(${d.id})">✕ Request Revision</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p>Error loading drafts.</p>';
  }
}

async function approveDraft(id) {
  if (!confirm('Approve this article draft and generate multi-channel social & visual briefs?')) return;
  await fetch(`/api/drafts/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved', notes: 'Approved via Clinical Gate' }),
  });
  alert('Draft approved! Production briefs have been generated.');
  loadDrafts();
}

async function rejectDraft(id) {
  const notes = prompt('Enter feedback / notes for revision:');
  if (!notes) return;
  await fetch(`/api/drafts/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'revision_requested', notes }),
  });
  loadDrafts();
}

async function loadSources() {
  const tbody = document.getElementById('sources-table-body');
  try {
    const res = await fetch('/api/sources');
    const sources = await res.json();

    if (sources.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">No sources in library yet. Run research or seed.</td></tr>';
      return;
    }

    tbody.innerHTML = sources.map(s => `
      <tr>
        <td><span class="badge badge-gold">${s.category}</span></td>
        <td>${escapeHtml(s.authors)}</td>
        <td><strong>${escapeHtml(s.title)}</strong><br><small style="color:var(--text-muted)">${escapeHtml(s.publication || '')}</small></td>
        <td>${s.year || '-'}</td>
        <td><code>${escapeHtml(s.doi || s.isbn || '-')}</code></td>
        <td><small>${escapeHtml(s.clinical_takeaway || '')}</small></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6">Error loading sources.</td></tr>';
  }
}

function setupFaqForm() {
  const form = document.getElementById('faq-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      question: document.getElementById('faq-question').value,
      cluster: document.getElementById('faq-cluster').value,
      frequency: document.getElementById('faq-frequency').value,
      notes: document.getElementById('faq-notes').value,
    };

    try {
      const res = await fetch('/api/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert('Client FAQ successfully logged as demand signal!');
        form.reset();
        loadDashboardData();
      }
    } catch (err) {
      alert('Failed to log FAQ');
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
