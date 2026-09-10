import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'behold.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────
db.exec(`
  -- Raw demand signals from listeners
  CREATE TABLE IF NOT EXISTS demand_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,          -- 'google_paa', 'reddit', 'youtube', 'client_faq', 'social'
    cluster TEXT,                  -- topic cluster e.g. 'trauma_recovery'
    title TEXT,                    -- thread title, PAA question, video title
    body TEXT,                     -- description, raw quote, comment excerpt
    url TEXT,
    engagement_metric TEXT,        -- e.g. '500 upvotes', '120K views'
    raw_quotes TEXT,               -- JSON array of audience-language quotes
    captured_at TEXT DEFAULT (datetime('now')),
    processed INTEGER DEFAULT 0
  );

  -- Grouped topic candidates (output of topic-collector)
  CREATE TABLE IF NOT EXISTS topic_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    underlying_problem TEXT,
    intended_audience TEXT,
    search_intent TEXT,
    demand_signals_summary TEXT,   -- JSON array of signal references
    cluster TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Scored topics (output of topic-scorer)
  CREATE TABLE IF NOT EXISTS scored_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER REFERENCES topic_candidates(id),
    m1_audience_relevance INTEGER CHECK(m1_audience_relevance BETWEEN 1 AND 5),
    m2_visible_demand INTEGER CHECK(m2_visible_demand BETWEEN 1 AND 5),
    m3_behold_fit INTEGER CHECK(m3_behold_fit BETWEEN 1 AND 5),
    m4_client_usefulness INTEGER CHECK(m4_client_usefulness BETWEEN 1 AND 5),
    m5_distinctive_angle INTEGER CHECK(m5_distinctive_angle BETWEEN 1 AND 5),
    total_score INTEGER GENERATED ALWAYS AS (
      m1_audience_relevance + m2_visible_demand + m3_behold_fit +
      m4_client_usefulness + m5_distinctive_angle
    ) STORED,
    behold_modality_connection TEXT,
    repurposing_potential TEXT,
    score_rationale TEXT,
    scored_at TEXT DEFAULT (datetime('now'))
  );

  -- Evidence map sources (verified citations)
  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,        -- 'peer_reviewed', 'clinical_framework', 'audience_language'
    authors TEXT,
    title TEXT NOT NULL,
    publication TEXT,              -- journal, publisher, platform
    year INTEGER,
    doi TEXT,
    isbn TEXT,
    url TEXT,
    clinical_takeaway TEXT,
    verified INTEGER DEFAULT 0,
    verification_note TEXT,
    added_at TEXT DEFAULT (datetime('now'))
  );

  -- Evidence maps linking sources to topics
  CREATE TABLE IF NOT EXISTS evidence_maps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scored_topic_id INTEGER REFERENCES scored_topics(id),
    source_id INTEGER REFERENCES sources(id),
    relevance_note TEXT,
    UNIQUE(scored_topic_id, source_id)
  );

  -- Content drafts
  CREATE TABLE IF NOT EXISTS content_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scored_topic_id INTEGER REFERENCES scored_topics(id),
    draft_type TEXT NOT NULL,      -- 'article', 'faq', 'meta', 'resource'
    title TEXT,
    body TEXT,
    meta_description TEXT,
    headings TEXT,                 -- JSON array
    internal_links TEXT,           -- JSON array
    bibliography TEXT,             -- JSON array
    faq TEXT,                      -- JSON array of { question, answer }
    status TEXT DEFAULT 'draft',   -- 'draft', 'review', 'approved', 'published', 'rejected'
    yiya_notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT,
    published_at TEXT
  );

  -- Social/visual production briefs
  CREATE TABLE IF NOT EXISTS production_briefs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id INTEGER REFERENCES content_drafts(id),
    brief_type TEXT NOT NULL,      -- 'infographic', 'quote', 'pinterest', 'linkedin', 'substack', 'youtube_short', 'animation'
    concept TEXT NOT NULL,
    copy TEXT,
    specifications TEXT,           -- JSON: dimensions, duration, etc.
    status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'complete'
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Published content tracking
  CREATE TABLE IF NOT EXISTS published_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id INTEGER REFERENCES content_drafts(id),
    platform TEXT NOT NULL,        -- 'blog', 'linkedin', 'pinterest', 'instagram', 'youtube', 'substack'
    url TEXT,
    utm_code TEXT,
    published_at TEXT DEFAULT (datetime('now'))
  );

  -- Performance metrics
  CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    published_id INTEGER REFERENCES published_content(id),
    check_type TEXT NOT NULL,      -- 'day_1', 'day_7', 'day_30', 'weekly'
    views INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    signups INTEGER DEFAULT 0,
    inquiries INTEGER DEFAULT 0,
    search_impressions INTEGER DEFAULT 0,
    notes TEXT,
    checked_at TEXT DEFAULT (datetime('now'))
  );

  -- System learning log
  CREATE TABLE IF NOT EXISTS learning_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_cluster TEXT,
    recommendation TEXT,           -- 'repeat', 'improve', 'stop'
    rationale TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migration: ensure faq column exists on content_drafts if table was already created
try {
  db.exec('ALTER TABLE content_drafts ADD COLUMN faq TEXT');
} catch (e) {
  // Column already exists
}

// ── Helper functions ────────────────────────────────────────────────

export function insertSignal(signal) {
  const stmt = db.prepare(`
    INSERT INTO demand_signals (source, cluster, title, body, url, engagement_metric, raw_quotes)
    VALUES (@source, @cluster, @title, @body, @url, @engagement_metric, @raw_quotes)
  `);
  return stmt.run(signal);
}

export function getUnprocessedSignals() {
  return db.prepare('SELECT * FROM demand_signals WHERE processed = 0 ORDER BY captured_at DESC').all();
}

export function markSignalsProcessed(ids) {
  const stmt = db.prepare('UPDATE demand_signals SET processed = 1 WHERE id = ?');
  const tx = db.transaction((idList) => {
    for (const id of idList) stmt.run(id);
  });
  tx(ids);
}

export function insertCandidate(candidate) {
  const stmt = db.prepare(`
    INSERT INTO topic_candidates (title, underlying_problem, intended_audience, search_intent, demand_signals_summary, cluster)
    VALUES (@title, @underlying_problem, @intended_audience, @search_intent, @demand_signals_summary, @cluster)
  `);
  return stmt.run(candidate);
}

export function getCandidates() {
  return db.prepare('SELECT * FROM topic_candidates ORDER BY created_at DESC').all();
}

export function insertScoredTopic(scored) {
  const stmt = db.prepare(`
    INSERT INTO scored_topics (candidate_id, m1_audience_relevance, m2_visible_demand, m3_behold_fit, m4_client_usefulness, m5_distinctive_angle, behold_modality_connection, repurposing_potential, score_rationale)
    VALUES (@candidate_id, @m1_audience_relevance, @m2_visible_demand, @m3_behold_fit, @m4_client_usefulness, @m5_distinctive_angle, @behold_modality_connection, @repurposing_potential, @score_rationale)
  `);
  return stmt.run(scored);
}

export function getScoredTopics() {
  return db.prepare(`
    SELECT st.*, tc.title, tc.underlying_problem, tc.intended_audience, tc.search_intent, tc.cluster
    FROM scored_topics st
    JOIN topic_candidates tc ON st.candidate_id = tc.id
    ORDER BY st.total_score DESC
  `).all();
}

export function insertSource(source) {
  const stmt = db.prepare(`
    INSERT INTO sources (category, authors, title, publication, year, doi, isbn, url, clinical_takeaway, verified, verification_note)
    VALUES (@category, @authors, @title, @publication, @year, @doi, @isbn, @url, @clinical_takeaway, @verified, @verification_note)
  `);
  return stmt.run({
    category: source.category ?? 'peer_reviewed',
    authors: source.authors ?? 'Unknown',
    title: source.title ?? '',
    publication: source.publication ?? '',
    year: source.year ?? null,
    doi: source.doi ?? null,
    isbn: source.isbn ?? null,
    url: source.url ?? null,
    clinical_takeaway: source.clinical_takeaway ?? '',
    verified: source.verified ?? 1,
    verification_note: source.verification_note ?? '',
  });
}

export function getSources() {
  return db.prepare('SELECT * FROM sources ORDER BY category, year DESC').all();
}

export function insertDraft(draft) {
  const stmt = db.prepare(`
    INSERT INTO content_drafts (scored_topic_id, draft_type, title, body, meta_description, headings, internal_links, bibliography, faq, status)
    VALUES (@scored_topic_id, @draft_type, @title, @body, @meta_description, @headings, @internal_links, @bibliography, @faq, @status)
  `);
  return stmt.run({
    ...draft,
    faq: draft.faq ? (typeof draft.faq === 'string' ? draft.faq : JSON.stringify(draft.faq)) : '[]',
  });
}

function attachDraftMetadata(draft) {
  if (!draft) return null;

  // Fetch linked evidence sources from evidence_maps + sources
  const linkedSources = draft.scored_topic_id ? db.prepare(`
    SELECT s.*, em.relevance_note
    FROM sources s
    JOIN evidence_maps em ON s.id = em.source_id
    WHERE em.scored_topic_id = ?
    ORDER BY s.verified DESC, s.year DESC
  `).all(draft.scored_topic_id) : [];

  let parsedFaq = [];
  try {
    parsedFaq = draft.faq ? JSON.parse(draft.faq) : [];
  } catch {}

  let parsedBib = [];
  try {
    parsedBib = draft.bibliography ? JSON.parse(draft.bibliography) : [];
  } catch {}

  let parsedHeadings = [];
  try {
    parsedHeadings = draft.headings ? JSON.parse(draft.headings) : [];
  } catch {}

  let parsedLinks = [];
  try {
    parsedLinks = draft.internal_links ? JSON.parse(draft.internal_links) : [];
  } catch {}

  return {
    ...draft,
    sources: linkedSources,
    faq: parsedFaq,
    bibliography: parsedBib,
    headings: parsedHeadings,
    internal_links: parsedLinks,
  };
}

export function getDrafts(status) {
  let drafts;
  if (status) {
    drafts = db.prepare(`
      SELECT cd.*, st.candidate_id, tc.title as topic_title, tc.cluster, tc.underlying_problem
      FROM content_drafts cd
      LEFT JOIN scored_topics st ON cd.scored_topic_id = st.id
      LEFT JOIN topic_candidates tc ON st.candidate_id = tc.id
      WHERE cd.status = ?
      ORDER BY cd.created_at DESC
    `).all(status);
  } else {
    drafts = db.prepare(`
      SELECT cd.*, st.candidate_id, tc.title as topic_title, tc.cluster, tc.underlying_problem
      FROM content_drafts cd
      LEFT JOIN scored_topics st ON cd.scored_topic_id = st.id
      LEFT JOIN topic_candidates tc ON st.candidate_id = tc.id
      ORDER BY cd.created_at DESC
    `).all();
  }

  return drafts.map(d => attachDraftMetadata(d));
}

export function getDraftById(id) {
  const draft = db.prepare(`
    SELECT cd.*, st.candidate_id, tc.title as topic_title, tc.cluster, tc.underlying_problem
    FROM content_drafts cd
    LEFT JOIN scored_topics st ON cd.scored_topic_id = st.id
    LEFT JOIN topic_candidates tc ON st.candidate_id = tc.id
    WHERE cd.id = ?
  `).get(id);

  if (!draft) return null;
  return attachDraftMetadata(draft);
}

export function updateDraftContent(id, { title, body, faq, meta_description }) {
  const stmt = db.prepare(`
    UPDATE content_drafts
    SET title = COALESCE(@title, title),
        body = COALESCE(@body, body),
        faq = COALESCE(@faq, faq),
        meta_description = COALESCE(@meta_description, meta_description)
    WHERE id = @id
  `);
  return stmt.run({
    id,
    title: title ?? null,
    body: body ?? null,
    faq: faq !== undefined ? (typeof faq === 'string' ? faq : JSON.stringify(faq)) : null,
    meta_description: meta_description ?? null,
  });
}

export function updateDraftStatus(id, status, notes) {
  db.prepare(`
    UPDATE content_drafts SET status = ?, yiya_notes = ?, reviewed_at = datetime('now') WHERE id = ?
  `).run(status, notes, id);
}

export function insertBrief(brief) {
  const stmt = db.prepare(`
    INSERT INTO production_briefs (draft_id, brief_type, concept, copy, specifications)
    VALUES (@draft_id, @brief_type, @concept, @copy, @specifications)
  `);
  return stmt.run(brief);
}

export function getBriefs(draftId) {
  return db.prepare('SELECT * FROM production_briefs WHERE draft_id = ? ORDER BY brief_type').all(draftId);
}

export function insertPublished(pub) {
  const stmt = db.prepare(`
    INSERT INTO published_content (draft_id, platform, url, utm_code)
    VALUES (@draft_id, @platform, @url, @utm_code)
  `);
  return stmt.run(pub);
}

export function insertMetric(metric) {
  const stmt = db.prepare(`
    INSERT INTO performance_metrics (published_id, check_type, views, clicks, saves, shares, signups, inquiries, search_impressions, notes)
    VALUES (@published_id, @check_type, @views, @clicks, @saves, @shares, @signups, @inquiries, @search_impressions, @notes)
  `);
  return stmt.run(metric);
}

export function getPerformanceReport() {
  return db.prepare(`
    SELECT pc.platform, pc.url, cd.title, pm.*
    FROM performance_metrics pm
    JOIN published_content pc ON pm.published_id = pc.id
    JOIN content_drafts cd ON pc.draft_id = cd.id
    ORDER BY pm.checked_at DESC
  `).all();
}

export function getDashboardStats() {
  const signals = db.prepare('SELECT COUNT(*) as count FROM demand_signals').get();
  const candidates = db.prepare('SELECT COUNT(*) as count FROM topic_candidates').get();
  const scored = db.prepare('SELECT COUNT(*) as count FROM scored_topics').get();
  const drafts = db.prepare('SELECT COUNT(*) as count FROM content_drafts').get();
  const published = db.prepare('SELECT COUNT(*) as count FROM published_content').get();
  const sources = db.prepare('SELECT COUNT(*) as count FROM sources WHERE verified = 1').get();

  return {
    total_signals: signals.count,
    total_candidates: candidates.count,
    total_scored: scored.count,
    total_drafts: drafts.count,
    total_published: published.count,
    verified_sources: sources.count,
  };
}

export { db };
export default db;
