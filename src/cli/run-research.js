/**
 * CLI Runner: Stage 2 — AI Research & Create
 */

import dotenv from 'dotenv';
dotenv.config();

import { collectTopics } from '../research/topic-collector.js';
import { scoreTopics, getTopTopics } from '../research/topic-scorer.js';
import { mapEvidence } from '../research/evidence-mapper.js';
import { draftContent } from '../research/content-drafter.js';

async function main() {
  const apiKey = process.env.XFTOKEN_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: XFTOKEN_API_KEY or GEMINI_API_KEY environment variable is required.');
    process.exit(1);
  }

  console.log('====================================================');
  console.log('🔬 BEHOLD AI CONTENT SYSTEM: STAGE 2 (RESEARCH & CREATE)');
  console.log('====================================================');

  console.log('\n[1/4] Collecting & grouping demand signals into topic candidates...');
  await collectTopics(apiKey);

  console.log('\n[2/4] Scoring topic candidates with 25-point Behold matrix...');
  await scoreTopics(apiKey);

  const topTopics = getTopTopics(1);
  if (topTopics.length > 0) {
    const top = topTopics[0];
    console.log(`\n[3/4] Building verified evidence map for #1 topic: "${top.title}"...`);
    await mapEvidence(apiKey, top.id, top.title, top.underlying_problem);

    console.log(`\n[4/4] Generating clinical psychoeducation draft & FAQ...`);
    await draftContent(apiKey, top.id);
  }

  console.log('\n✅ Stage 2 complete! Results ready for Yiya\'s review.');
  console.log('Start web dashboard with `npm start` to inspect and approve.');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
