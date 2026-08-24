/**
 * Stage 4 — Performance Checker & Learning Engine
 *
 * Checks content performance at 1, 7, and 30 days. Logs metrics
 * and produces automated learning recommendations (repeat, improve, stop).
 */

import { insertMetric, db } from '../database/db.js';

export function recordPerformanceCheck(publishedId, checkType, metrics) {
  return insertMetric({
    published_id: publishedId,
    check_type: checkType,
    views: metrics.views || 0,
    clicks: metrics.clicks || 0,
    saves: metrics.saves || 0,
    shares: metrics.shares || 0,
    signups: metrics.signups || 0,
    inquiries: metrics.inquiries || 0,
    search_impressions: metrics.search_impressions || 0,
    notes: metrics.notes || '',
  });
}

export function generateLearningReport() {
  const publishedItems = db.prepare(`
    SELECT pc.id as published_id, pc.platform, pc.url, cd.title, tc.cluster,
           AVG(pm.views) as avg_views, AVG(pm.clicks) as avg_clicks, AVG(pm.inquiries) as avg_inquiries
    FROM published_content pc
    JOIN content_drafts cd ON pc.draft_id = cd.id
    JOIN scored_topics st ON cd.scored_topic_id = st.id
    JOIN topic_candidates tc ON st.candidate_id = tc.id
    LEFT JOIN performance_metrics pm ON pc.id = pm.published_id
    GROUP BY tc.cluster
  `).all();

  const recommendations = publishedItems.map(item => {
    let action = 'improve';
    let rationale = '';

    if ((item.avg_clicks || 0) > 50 || (item.avg_inquiries || 0) > 2) {
      action = 'repeat';
      rationale = `High conversion/engagement detected in cluster "${item.cluster}". Prioritize sub-topics in next cycle.`;
    } else if ((item.avg_views || 0) < 10) {
      action = 'stop';
      rationale = `Low visibility for cluster "${item.cluster}". Refine hook or test different angles.`;
    } else {
      action = 'improve';
      rationale = `Steady baseline engagement for "${item.cluster}". Update with fresh case studies or clinical FAQs.`;
    }

    db.prepare(`
      INSERT INTO learning_log (topic_cluster, recommendation, rationale)
      VALUES (?, ?, ?)
    `).run(item.cluster, action, rationale);

    return { cluster: item.cluster, action, rationale };
  });

  return recommendations;
}

export default { recordPerformanceCheck, generateLearningReport };
