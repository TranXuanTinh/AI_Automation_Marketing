/**
 * Stage 1 — Client FAQ Input
 *
 * Provides API endpoints for Yiya to log anonymized client
 * FAQs through the dashboard. These become demand signals
 * that inform topic selection.
 */

import { insertSignal } from '../database/db.js';
import db from '../database/db.js';

/**
 * Adds a client FAQ as a demand signal.
 * Called via the dashboard when Yiya logs a question.
 */
export function addClientFAQ({ question, cluster, frequency = 'occasional', notes = '' }) {
  const signal = {
    source: 'client_faq',
    cluster: cluster || 'uncategorized',
    title: question,
    body: JSON.stringify({ frequency, notes }),
    url: '',
    engagement_metric: frequency,
    raw_quotes: null,
  };

  return insertSignal(signal);
}

/**
 * Retrieves all client FAQs, optionally filtered by cluster.
 */
export function getClientFAQs(cluster = null) {
  if (cluster) {
    return db.prepare(
      "SELECT * FROM demand_signals WHERE source = 'client_faq' AND cluster = ? ORDER BY captured_at DESC"
    ).all(cluster);
  }
  return db.prepare(
    "SELECT * FROM demand_signals WHERE source = 'client_faq' ORDER BY captured_at DESC"
  ).all();
}

/**
 * Returns FAQ frequency summary by cluster.
 */
export function getFAQSummary() {
  return db.prepare(`
    SELECT cluster, COUNT(*) as count, engagement_metric as frequency
    FROM demand_signals
    WHERE source = 'client_faq'
    GROUP BY cluster, engagement_metric
    ORDER BY count DESC
  `).all();
}

export default { addClientFAQ, getClientFAQs, getFAQSummary };
