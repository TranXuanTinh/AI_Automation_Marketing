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

// Global store for in-memory draft edits
const activeDrafts = {};

async function loadDrafts() {
  const container = document.getElementById('drafts-container');
  try {
    const res = await fetch('/api/drafts');
    const drafts = await res.json();

    if (drafts.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:20px;text-align:center;">No drafts currently pending review. Run <code>npm run research</code> to generate clinical drafts.</p>';
      return;
    }

    // Store in memory
    drafts.forEach(d => {
      activeDrafts[d.id] = {
        title: d.title || '',
        body: d.body || '',
        meta_description: d.meta_description || '',
        faq: (d.faq && Array.isArray(d.faq) && d.faq.length > 0) ? d.faq : [
          {
            question: "Is emotional numbness always related to trauma?",
            answer: "Not necessarily. While emotional numbing can be experienced as a protective response, particularly in the context of overwhelming stress or trauma, it also frequently occurs in clinical depression, burnout, and chronic nervous system hypoarousal. A nuanced clinical perspective is essential."
          },
          {
            question: "Why can I function normally while feeling disconnected inside?",
            answer: "This reflects high-functioning adaptation. In Internal Family Systems (IFS), protective Manager parts competently maintain professional and daily routines while compartmentalizing vulnerable exhaustion or emotional overwhelm."
          },
          {
            question: "What can help me reconnect with my emotions safely?",
            answer: "Directly forcing feelings to return often triggers protective alarm. Body-first somatic grounding within your window of tolerance allows you to first acknowledge your protective numbness before gradually expanding capacity for embodied feeling."
          }
        ],
        sources: d.sources || [],
        bibliography: d.bibliography || []
      };
    });

    container.innerHTML = drafts.map(d => renderDraftCard(d)).join('');

    // Setup live preview and event listeners
    drafts.forEach(d => {
      updateLivePreview(d.id);
    });

  } catch (err) {
    console.error('Error loading drafts:', err);
    container.innerHTML = '<p style="color:var(--danger)">Failed to load drafts from server.</p>';
  }
}

function renderDraftCard(d) {
  const current = activeDrafts[d.id];
  const sourcesCount = (d.sources && d.sources.length) || 0;
  const faqCount = current.faq ? current.faq.length : 0;

  return `
    <div class="draft-card" id="draft-card-${d.id}">
      <!-- Header -->
      <div class="draft-header">
        <div style="flex: 1;">
          <input type="text" class="draft-title-input" id="draft-title-${d.id}"
                 value="${escapeHtml(current.title)}"
                 placeholder="Article Title..."
                 oninput="onDraftTitleChange(${d.id}, this.value)">
          <div class="draft-meta-tags">
            <span class="badge ${d.status === 'approved' ? 'badge-green' : 'badge-gold'}">
              ${d.status === 'approved' ? '✓ APPROVED' : '🛡️ PENDING CLINICAL GATE'}
            </span>
            <span>Topic: <strong>${escapeHtml(d.topic_title || d.title)}</strong></span>
            <span>Cluster: <code>${escapeHtml(d.cluster || 'clinical_care')}</code></span>
            <span>Sources: <strong style="color:var(--accent-gold-light);">${sourcesCount} verified</strong></span>
            <span>FAQs: <strong style="color:var(--accent-gold-light);">${faqCount} contextual</strong></span>
          </div>
        </div>
      </div>

      <!-- SEO Meta Description -->
      <div style="margin-bottom: 12px;">
        <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">
          SEO META DESCRIPTION (Max 155 chars):
        </label>
        <input type="text" class="meta-desc-input" id="draft-meta-${d.id}"
               value="${escapeHtml(current.meta_description)}"
               placeholder="Trauma-informed summary for search engines and social shares..."
               oninput="onDraftMetaChange(${d.id}, this.value)">
      </div>

      <!-- Sub-Tab Navigation -->
      <div class="draft-tab-bar">
        <button class="draft-tab-btn active" id="tab-btn-editor-${d.id}" onclick="switchDraftTab(${d.id}, 'editor')">
          ✏️ Clinical Editor
        </button>
        <button class="draft-tab-btn" id="tab-btn-preview-${d.id}" onclick="switchDraftTab(${d.id}, 'preview')">
          👁️ Formatted Preview
        </button>
        <button class="draft-tab-btn" id="tab-btn-faqs-${d.id}" onclick="switchDraftTab(${d.id}, 'faqs')">
          ❓ 3 Contextual FAQs (${faqCount})
        </button>
        <button class="draft-tab-btn" id="tab-btn-sources-${d.id}" onclick="switchDraftTab(${d.id}, 'sources')">
          🔬 Claim → Source Grounding (${sourcesCount})
        </button>
      </div>

      <!-- PANE 1: CLINICAL EDITOR -->
      <div class="draft-pane" id="pane-editor-${d.id}">
        <!-- Toolbar -->
        <div class="editor-toolbar">
          <button type="button" class="toolbar-btn" onclick="applyFormat(${d.id}, '**', '**')" title="Bold">
            <strong>B</strong>
          </button>
          <button type="button" class="toolbar-btn" onclick="applyFormat(${d.id}, '*', '*')" title="Italic">
            <em>I</em>
          </button>
          <div class="toolbar-divider"></div>
          <button type="button" class="toolbar-btn" onclick="applyFormat(${d.id}, '## ', '')" title="Heading 2">
            H2
          </button>
          <button type="button" class="toolbar-btn" onclick="applyFormat(${d.id}, '### ', '')" title="Heading 3">
            H3
          </button>
          <div class="toolbar-divider"></div>
          <button type="button" class="toolbar-btn" onclick="applyFormat(${d.id}, '> ', '')" title="Blockquote">
            “ Quote
          </button>
          <button type="button" class="toolbar-btn" onclick="applyFormat(${d.id}, '- ', '')" title="Bullet List">
            • List
          </button>
          <button type="button" class="toolbar-btn" onclick="applyFormat(${d.id}, '1. ', '')" title="Numbered List">
            1. Numbered
          </button>
          <button type="button" class="toolbar-btn" onclick="insertCitationPrompt(${d.id})" title="Insert Citation [N]">
            🔖 [Ref]
          </button>
          <button type="button" class="toolbar-btn" onclick="applyFormat(${d.id}, '> [!NOTE] Clinical Observation:\n> ', '')" title="Clinical Callout">
            🏷️ Callout
          </button>

          <!-- Clinical Tone Nuance Helper -->
          <button type="button" class="toolbar-btn btn-nuance" onclick="applyClinicalNuance(${d.id})" title="Nuance overstated trauma claims">
            ✨ Nuance Claim
          </button>
        </div>

        <textarea class="editor-textarea" id="draft-body-${d.id}"
                  oninput="onDraftBodyChange(${d.id}, this.value)"
                  placeholder="Draft body in markdown with inline citations [1], [2]...">${escapeHtml(current.body)}</textarea>

        <div style="display:flex;justify-content:space-between;padding:8px 4px;font-size:0.75rem;color:var(--text-muted);">
          <span id="word-count-${d.id}">Words: 0 | Estimated Read: 0 min</span>
          <span>Tip: Cite academic sources with <code>[1]</code>, <code>[2]</code> to link claim to evidence.</span>
        </div>
      </div>

      <!-- PANE 2: FORMATTED LIVE PREVIEW -->
      <div class="draft-pane" id="pane-preview-${d.id}" style="display: none;">
        <div class="article-preview-pane" id="preview-content-${d.id}">
          <!-- Live rendered markdown -->
        </div>
      </div>

      <!-- PANE 3: 3 CONTEXTUAL FAQS -->
      <div class="draft-pane" id="pane-faqs-${d.id}" style="display: none;">
        <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
          <p style="font-size:0.85rem;color:var(--text-muted);">
            High-impact contextual FAQs derived from clinical practice & audience listening. Review and edit questions/answers directly:
          </p>
          <button class="btn" style="background:rgba(196,163,90,0.15);color:var(--accent-gold-light);padding:5px 10px;font-size:0.8rem;"
                  onclick="addNewFAQ(${d.id})">
            + Add FAQ
          </button>
        </div>

        <div class="faq-section" id="faq-container-${d.id}">
          ${renderFaqCards(d.id, current.faq)}
        </div>
      </div>

      <!-- PANE 4: CLAIM -> SOURCE GROUNDING (15 ACADEMIC SOURCES) -->
      <div class="draft-pane" id="pane-sources-${d.id}" style="display: none;">
        <div style="margin-bottom:14px;">
          <p style="font-size:0.85rem;color:var(--text-muted);">
            Real academic literature & clinical frameworks discovered via PubMed, Google Scholar, and DOI verification.
            Click <strong>Insert [N]</strong> to cite directly at your cursor in the editor:
          </p>
        </div>

        <div class="evidence-panel">
          ${renderEvidenceSources(d.id, d.sources)}
        </div>
      </div>

      <!-- Footer Action Buttons -->
      <div class="draft-actions" style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 16px;">
        <button class="btn btn-primary" onclick="saveDraftEdits(${d.id})" style="background:var(--accent-gold);color:#000;">
          💾 Save Clinical Edits
        </button>
        <button class="btn btn-primary" onclick="approveDraft(${d.id})" style="background:var(--accent-green);color:#fff;">
          ✓ Approve & Generate Briefs
        </button>
        <button class="btn btn-danger" onclick="rejectDraft(${d.id})">
          ✕ Request Revision
        </button>
        <span id="save-indicator-${d.id}" style="font-size:0.85rem;color:var(--text-muted);margin-left:auto;align-self:center;"></span>
      </div>
    </div>
  `;
}

function renderFaqCards(draftId, faqs) {
  if (!faqs || faqs.length === 0) {
    return '<p style="color:var(--text-muted)">No contextual FAQs logged for this draft. Click "+ Add FAQ" above.</p>';
  }

  return faqs.map((faq, idx) => `
    <div class="faq-card-editable" id="faq-item-${draftId}-${idx}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="faq-num-pill">Contextual Client FAQ #${idx + 1}</span>
        <button type="button" style="background:none;border:none;color:#e67373;cursor:pointer;font-size:0.75rem;"
                onclick="removeFAQ(${draftId}, ${idx})">✕ Remove</button>
      </div>
      <input type="text" class="faq-q-input"
             value="${escapeHtml(faq.question)}"
             placeholder="Client Question..."
             oninput="onFaqQuestionChange(${draftId}, ${idx}, this.value)">
      <textarea class="faq-a-textarea"
                placeholder="Compassionate, clinically responsible answer..."
                oninput="onFaqAnswerChange(${draftId}, ${idx}, this.value)">${escapeHtml(faq.answer)}</textarea>
    </div>
  `).join('');
}

function renderEvidenceSources(draftId, sources) {
  if (!sources || sources.length === 0) {
    return '<p style="color:var(--text-muted)">No verified sources linked to this topic yet.</p>';
  }

  return sources.map((s, idx) => {
    const num = idx + 1;
    const identifier = s.doi ? `DOI: ${s.doi}` : (s.isbn ? `ISBN: ${s.isbn}` : '');
    const extUrl = s.url || (s.doi ? `https://doi.org/${s.doi}` : null);

    return `
      <div class="evidence-source-card">
        <div class="evidence-num">[${num}]</div>
        <div class="evidence-content">
          <h5>${escapeHtml(s.title)}</h5>
          <div class="evidence-authors">
            <span class="badge ${s.category === 'peer_reviewed' ? 'badge-green' : 'badge-gold'}" style="font-size:0.7rem;padding:2px 6px;">
              ${s.category}
            </span>
            ${escapeHtml(s.authors)} ${s.year ? `(${s.year})` : ''} • <em>${escapeHtml(s.publication || '')}</em>
            ${identifier ? `• <code>${escapeHtml(identifier)}</code>` : ''}
            ${extUrl ? `• <a href="${escapeHtml(extUrl)}" target="_blank" style="color:var(--accent-gold-light);text-decoration:underline;">View Publication ↗</a>` : ''}
          </div>
          <div class="evidence-takeaway">
            "<strong>Clinical Takeaway:</strong> ${escapeHtml(s.clinical_takeaway || 'Core evidence supporting therapeutic formulation.')}"
          </div>
        </div>
        <div>
          <button type="button" class="evidence-insert-btn" onclick="insertCitationTag(${draftId}, ${num})">
            + Insert [${num}]
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Tab switcher inside draft card
function switchDraftTab(draftId, tabName) {
  const panes = ['editor', 'preview', 'faqs', 'sources'];
  panes.forEach(p => {
    const paneEl = document.getElementById(`pane-${p}-${draftId}`);
    const btnEl = document.getElementById(`tab-btn-${p}-${draftId}`);
    if (paneEl) paneEl.style.display = (p === tabName) ? 'block' : 'none';
    if (btnEl) {
      if (p === tabName) btnEl.classList.add('active');
      else btnEl.classList.remove('active');
    }
  });

  if (tabName === 'preview') {
    updateLivePreview(draftId);
  }
}

// In-memory model update handlers
function onDraftTitleChange(draftId, val) {
  if (activeDrafts[draftId]) activeDrafts[draftId].title = val;
}

function onDraftMetaChange(draftId, val) {
  if (activeDrafts[draftId]) activeDrafts[draftId].meta_description = val;
}

function onDraftBodyChange(draftId, val) {
  if (activeDrafts[draftId]) activeDrafts[draftId].body = val;
  updateWordCount(draftId, val);
}

function onFaqQuestionChange(draftId, idx, val) {
  if (activeDrafts[draftId]?.faq?.[idx]) {
    activeDrafts[draftId].faq[idx].question = val;
  }
}

function onFaqAnswerChange(draftId, idx, val) {
  if (activeDrafts[draftId]?.faq?.[idx]) {
    activeDrafts[draftId].faq[idx].answer = val;
  }
}

function addNewFAQ(draftId) {
  if (!activeDrafts[draftId]) return;
  activeDrafts[draftId].faq = activeDrafts[draftId].faq || [];
  activeDrafts[draftId].faq.push({
    question: "New client question...",
    answer: "Clinical explanation..."
  });
  const container = document.getElementById(`faq-container-${draftId}`);
  if (container) {
    container.innerHTML = renderFaqCards(draftId, activeDrafts[draftId].faq);
  }
  const btn = document.getElementById(`tab-btn-faqs-${draftId}`);
  if (btn) btn.textContent = `❓ 3 Contextual FAQs (${activeDrafts[draftId].faq.length})`;
}

function removeFAQ(draftId, idx) {
  if (!activeDrafts[draftId]?.faq) return;
  activeDrafts[draftId].faq.splice(idx, 1);
  const container = document.getElementById(`faq-container-${draftId}`);
  if (container) {
    container.innerHTML = renderFaqCards(draftId, activeDrafts[draftId].faq);
  }
  const btn = document.getElementById(`tab-btn-faqs-${draftId}`);
  if (btn) btn.textContent = `❓ 3 Contextual FAQs (${activeDrafts[draftId].faq.length})`;
}

// Rich editor formatting actions
function applyFormat(draftId, prefix, suffix) {
  const textarea = document.getElementById(`draft-body-${draftId}`);
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selectedText = text.substring(start, end);

  const replacement = prefix + selectedText + suffix;
  textarea.value = text.substring(0, start) + replacement + text.substring(end);
  textarea.focus();
  textarea.setSelectionRange(start + prefix.length, end + prefix.length);

  onDraftBodyChange(draftId, textarea.value);
}

function insertCitationPrompt(draftId) {
  const num = prompt('Enter reference number to cite (e.g. 1 for [1]):', '1');
  if (!num) return;
  applyFormat(draftId, `[${num}]`, '');
}

function insertCitationTag(draftId, num) {
  applyFormat(draftId, `[${num}]`, '');
  // Switch back to editor tab if not on it
  switchDraftTab(draftId, 'editor');
  showToast(`Inserted citation [${num}] into editor!`);
}

// Clinical Tone Helper: changes absolute claims into nuanced formulation
function applyClinicalNuance(draftId) {
  const textarea = document.getElementById(`draft-body-${draftId}`);
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selectedText = text.substring(start, end);

  if (!selectedText.trim()) {
    // If no text selected, insert the standard nuanced phrase
    const nuancedPhrase = " can be experienced as a protective adaptation, particularly in the context of overwhelming stress or trauma, while also noting overlap with depression and nervous system hypoarousal ";
    textarea.value = text.substring(0, start) + nuancedPhrase + text.substring(end);
    textarea.focus();
    onDraftBodyChange(draftId, textarea.value);
    showToast("Inserted clinical nuance phrase!");
    return;
  }

  // Nuance transformation
  let revised = selectedText
    .replace(/\bis a protective survival response\b/gi, 'can be experienced as a protective response, particularly in the context of overwhelming stress or trauma')
    .replace(/\bthe mind and body instinctively shut down feelings to protect you\b/gi, 'the nervous system may shift into hypoarousal or emotional disconnection as an adaptive protective pattern')
    .replace(/\bis caused by trauma\b/gi, 'often develops in the context of prolonged stress, trauma, or emotional exhaustion')
    .replace(/\bis the explanation\b/gi, 'is one clinically recognized formulation');

  if (revised === selectedText) {
    revised = `can be experienced as an adaptive response (${selectedText.trim()})`;
  }

  textarea.value = text.substring(0, start) + revised + text.substring(end);
  textarea.focus();
  onDraftBodyChange(draftId, textarea.value);
  showToast("Applied clinical nuance formulation!");
}

function updateWordCount(draftId, text) {
  const words = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const readMin = Math.ceil(words / 200);
  const el = document.getElementById(`word-count-${draftId}`);
  if (el) {
    el.textContent = `Words: ${words} | Estimated Read: ~${readMin} min`;
  }
}

// Markdown to styled HTML renderer for live preview
function updateLivePreview(draftId) {
  const current = activeDrafts[draftId];
  const pane = document.getElementById(`preview-content-${draftId}`);
  if (!pane || !current) return;

  let html = renderMarkdownToHtml(current.body || '');

  // Add 3 Contextual FAQs preview box at bottom of article
  if (current.faq && current.faq.length > 0) {
    html += `
      <div style="margin-top: 36px; padding: 24px; background: rgba(196,163,90,0.06); border: 1px solid var(--border-color); border-radius: 8px;">
        <h2 style="margin-top:0;font-size:1.25rem;">Frequently Asked Clinical Questions</h2>
        <div style="margin-top:16px;">
          ${current.faq.map(f => `
            <div style="margin-bottom:18px;">
              <h4 style="color:var(--accent-gold-light);font-size:0.95rem;margin-bottom:6px;">❓ ${escapeHtml(f.question)}</h4>
              <p style="font-size:0.9rem;color:#d8d3c8;margin-bottom:0;">${escapeHtml(f.answer)}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  pane.innerHTML = html;
}

function renderMarkdownToHtml(md) {
  if (!md) return '<p style="color:var(--text-muted)">Empty draft body.</p>';

  const lines = md.split('\n');
  let html = '';
  let inList = false;

  for (let line of lines) {
    line = line.trim();

    // Headers
    if (line.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3>${parseInline(line.substring(4))}</h3>`;
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2>${parseInline(line.substring(3))}</h2>`;
      continue;
    }
    if (line.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2 style="font-size:1.4rem;">${parseInline(line.substring(2))}</h2>`;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<blockquote>${parseInline(line.substring(2))}</blockquote>`;
      continue;
    }

    // List item
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${parseInline(line.substring(2))}</li>`;
      continue;
    }

    if (inList) { html += '</ul>'; inList = false; }

    if (line.length === 0) continue;

    html += `<p>${parseInline(line)}</p>`;
  }

  if (inList) html += '</ul>';
  return html;
}

function parseInline(text) {
  let str = escapeHtml(text);

  // Bold
  str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  str = str.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Inline Code
  str = str.replace(/`(.*?)`/g, '<code style="background:rgba(0,0,0,0.4);padding:2px 5px;border-radius:4px;">$1</code>');

  // Citations [1], [2], [3] converted to citation chips
  str = str.replace(/\[(\d+)\]/g, '<span class="cite-tag" title="View Source [$1]">[$1]</span>');

  return str;
}

// Persist edits to server via PUT /api/drafts/:id
async function saveDraftEdits(id) {
  const current = activeDrafts[id];
  if (!current) return;

  const indicator = document.getElementById(`save-indicator-${id}`);
  if (indicator) indicator.textContent = 'Saving...';

  try {
    const res = await fetch(`/api/drafts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: current.title,
        body: current.body,
        meta_description: current.meta_description,
        faq: current.faq
      })
    });

    const data = await res.json();
    if (res.ok) {
      if (indicator) indicator.textContent = '✓ Edits saved at ' + new Date().toLocaleTimeString();
      showToast('✓ Clinical edits & 3 Contextual FAQs saved to database!');
    } else {
      throw new Error(data.error || 'Server error');
    }
  } catch (err) {
    if (indicator) indicator.textContent = '❌ Save failed';
    alert('Failed to save draft edits: ' + err.message);
  }
}

// Toast notification helper
function showToast(message) {
  const existing = document.querySelector('.toast-msg');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.innerHTML = `<span>🌿</span> <span>${escapeHtml(message)}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

async function approveDraft(id) {
  if (!confirm('Approve this article draft and generate multi-channel social & visual briefs?')) return;
  try {
    const res = await fetch(`/api/drafts/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', notes: 'Approved via Clinical Gate with verified sources and 3 contextual FAQs' }),
    });
    if (res.ok) {
      showToast('✓ Draft approved! Multi-channel social briefs generated.');
      loadDrafts();
      loadDashboardData();
    }
  } catch (err) {
    alert('Failed to approve draft: ' + err.message);
  }
}

async function rejectDraft(id) {
  const notes = prompt('Enter clinical feedback / revision instructions for this draft:');
  if (!notes) return;
  try {
    const res = await fetch(`/api/drafts/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'revision_requested', notes }),
    });
    if (res.ok) {
      showToast('Draft marked for revision with feedback.');
      loadDrafts();
    }
  } catch (err) {
    alert('Failed to request revision: ' + err.message);
  }
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
