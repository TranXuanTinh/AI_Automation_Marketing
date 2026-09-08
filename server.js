/**
 * Behold Content System — Express Web Server & API
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

import {
  getDashboardStats,
  getScoredTopics,
  getSources,
  getDrafts,
  updateDraftStatus,
  getBriefs,
  getPerformanceReport,
  insertDraft
} from './src/database/db.js';
import { addClientFAQ } from './src/listeners/client-faq.js';
import { generateSocialBriefs } from './src/publishing/social-brief-generator.js';
import { registerPublication } from './src/publishing/utm-linker.js';
import { generateLearningReport } from './src/monitoring/performance-checker.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────────

// Dashboard statistics
app.get('/api/stats', (req, res) => {
  res.json(getDashboardStats());
});

// Ranked topics
app.get('/api/topics', (req, res) => {
  res.json(getScoredTopics());
});

// Verified sources library
app.get('/api/sources', (req, res) => {
  res.json(getSources());
});

// Drafts for review
app.get('/api/drafts', (req, res) => {
  const status = req.query.status;
  res.json(getDrafts(status));
});

// Yiya Human Approval Gate
app.post('/api/drafts/:id/review', async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body; // 'approved', 'rejected', 'revision_requested'

  updateDraftStatus(id, status, notes);

  // If approved, automatically trigger brief generation
  const aiApiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY || process.env.GEMINI_API_KEY || process.env.XFTOKEN_API_KEY;
  if (status === 'approved' && aiApiKey) {
    try {
      await generateSocialBriefs(aiApiKey, id);
    } catch (err) {
      console.error('Failed to generate briefs automatically:', err.message);
    }
  }

  res.json({ success: true, message: `Draft ${id} updated to ${status}` });
});

// Production briefs for a draft
app.get('/api/drafts/:id/briefs', (req, res) => {
  res.json(getBriefs(req.params.id));
});

// Log client FAQ (Listener Stage 1)
app.post('/api/faqs', (req, res) => {
  const { question, cluster, frequency, notes } = req.body;
  const result = addClientFAQ({ question, cluster, frequency, notes });
  res.json({ success: true, id: result.lastInsertRowid });
});

// Publish with UTM tracking
app.post('/api/publish', (req, res) => {
  const { draftId, platform, destinationUrl, campaign } = req.body;
  const pub = registerPublication(draftId, platform, destinationUrl, campaign);
  res.json({ success: true, publication: pub });
});

// Performance & learning report
app.get('/api/learning-report', (req, res) => {
  const recommendations = generateLearningReport();
  const report = getPerformanceReport();
  res.json({ recommendations, performance: report });
});

// Scheduled cron job for weekly learning report (every Monday at 9:00 AM)
cron.schedule('0 9 * * 1', () => {
  console.log('⏰ Running weekly automated performance review & learning audit...');
  generateLearningReport();
});

app.listen(PORT, () => {
  console.log(`\n🌿 Behold Content System is running at http://localhost:${PORT}`);
  console.log(`Press Ctrl+C to stop.`);
});
