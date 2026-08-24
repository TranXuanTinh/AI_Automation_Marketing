/**
 * CLI Tool: Seed database with verified Beta 1 research data
 */

import {
  insertCandidate,
  insertScoredTopic,
  insertSource,
  insertDraft,
  db
} from '../database/db.js';

console.log('🌱 Seeding database with verified Behold Beta 1 research data...');

// Clean existing data for clean seed
db.exec(`
  DELETE FROM evidence_maps;
  DELETE FROM sources;
  DELETE FROM content_drafts;
  DELETE FROM scored_topics;
  DELETE FROM topic_candidates;
  DELETE FROM demand_signals;
`);

const topic1Cand = insertCandidate({
  title: 'Why You Look Fine on the Outside but Feel Numb Inside',
  underlying_problem: 'High-functioning individuals appear competent externally but feel emotionally hollow or disconnected.',
  intended_audience: 'High-functioning, emotionally exhausted adults (primarily women 30–60) with complex trauma or chronic overwhelm.',
  search_intent: 'Informational & validation-seeking — why do I feel this way and am I broken?',
  demand_signals_summary: JSON.stringify(['Google PAA', 'Reddit r/CPTSD', 'Therapy in a Nutshell YouTube']),
  cluster: 'emotional_numbness',
});

const scoredTopic1 = insertScoredTopic({
  candidate_id: topic1Cand.lastInsertRowid,
  m1_audience_relevance: 5,
  m2_visible_demand: 5,
  m3_behold_fit: 5,
  m4_client_usefulness: 5,
  m5_distinctive_angle: 5,
  behold_modality_connection: 'IFS protector parts + Somatic dorsal freeze + DNMS developmental neglect repair',
  repurposing_potential: 'Handout, 5-min grounding practice, FAQ, 5 visual quotes, LinkedIn article',
  score_rationale: 'Perfect alignment with Behold audience and modalities with validated cross-platform demand.',
});

// Seed sources
const s1 = insertSource({
  category: 'peer_reviewed',
  authors: 'Hodgdon, H. B., Anderson, F. G., et al.',
  title: 'Internal Family Systems (IFS) Therapy for Posttraumatic Stress Disorder (PTSD) among Survivors of Multiple Childhood Trauma: A Pilot Effectiveness Study',
  publication: 'Journal of Aggression, Maltreatment & Trauma',
  year: 2022,
  doi: '10.1080/10926771.2021.2013375',
  url: 'https://doi.org/10.1080/10926771.2021.2013375',
  clinical_takeaway: '92% of participants no longer met PTSD criteria at follow-up; validated IFS for dissociation and affective blunting.',
  verified: 1,
  verification_note: 'Verified in Taylor & Francis / PubMed',
});

const s2 = insertSource({
  category: 'clinical_framework',
  authors: 'Schwartz, Richard C.',
  title: 'No Bad Parts: Healing Trauma and Restoring Wholeness with the Internal Family Systems Model',
  publication: 'Sounds True',
  year: 2021,
  isbn: '978-1683646686',
  clinical_takeaway: 'Numbness is a protective Manager part safeguarding vulnerable exiles.',
  verified: 1,
  verification_note: 'Verified publisher ISBN',
});

const s3 = insertSource({
  category: 'clinical_framework',
  authors: 'Walker, Pete',
  title: 'Complex PTSD: From Surviving to Thriving: A Guide and Map for Recovering from Childhood Trauma',
  publication: 'Azure Coyote',
  year: 2013,
  isbn: '978-1492871842',
  clinical_takeaway: 'Defines the functional freeze and fawn survival defenses.',
  verified: 1,
  verification_note: 'Verified publisher ISBN',
});

// Link in evidence map
db.prepare('INSERT INTO evidence_maps (scored_topic_id, source_id, relevance_note) VALUES (?, ?, ?)')
  .run(scoredTopic1.lastInsertRowid, s1.lastInsertRowid, 'Academic validation for IFS trauma resolution');
db.prepare('INSERT INTO evidence_maps (scored_topic_id, source_id, relevance_note) VALUES (?, ?, ?)')
  .run(scoredTopic1.lastInsertRowid, s2.lastInsertRowid, 'Theoretical framing for protective numbness parts');
db.prepare('INSERT INTO evidence_maps (scored_topic_id, source_id, relevance_note) VALUES (?, ?, ?)')
  .run(scoredTopic1.lastInsertRowid, s3.lastInsertRowid, 'Audience resonance with functional freeze');

// Seed draft
insertDraft({
  scored_topic_id: scoredTopic1.lastInsertRowid,
  draft_type: 'article',
  title: 'Why You Look Fine on the Outside but Feel Numb Inside',
  body: '# Why You Look Fine on the Outside but Feel Numb Inside\n\nWhen your life looks calm and capable to everyone around you, feeling internally empty can feel like a private, confusing failure...\n\n## Numbness as Protection, Not Pathology\n\nIn Internal Family Systems (IFS) and somatic trauma therapy, emotional numbness is not viewed as a broken system. It is recognized as an intelligent, protective survival response...',
  meta_description: 'Discover why high-functioning adults feel emotionally numb and learn how trauma-informed IFS and somatic therapy help restore nervous system connection.',
  headings: JSON.stringify(['Why High Functioning Masks Exhaustion', 'Numbness as Protection', 'The Somatic Freeze Response', 'Gentle Ways Back to Feeling']),
  internal_links: JSON.stringify(['/learn/five-minute-grounding/', '/services/ifs-therapy/']),
  bibliography: JSON.stringify(['Hodgdon et al. (2022)', 'Schwartz (2021)', 'Walker (2013)']),
  status: 'review',
});

console.log('✅ Seed data successfully loaded into data/behold.db!');
