/**
 * CLI Runner: Stage 1 — Run All Listeners
 */

import dotenv from 'dotenv';
dotenv.config();

import { scanGooglePAA } from '../listeners/google-paa.js';
import { scanReddit } from '../listeners/reddit-scanner.js';
import { scanYouTube } from '../listeners/youtube-scanner.js';

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY environment variable is required.');
    process.exit(1);
  }

  console.log('====================================================');
  console.log('🎧 BEHOLD AI CONTENT SYSTEM: STAGE 1 (LISTEN)');
  console.log('====================================================');

  console.log('\n[1/3] Scanning Google People Also Ask & Autocomplete...');
  await scanGooglePAA(apiKey);

  console.log('\n[2/3] Scanning Reddit Community Discussions...');
  await scanReddit();

  console.log('\n[3/3] Scanning YouTube Therapist Channels...');
  await scanYouTube(apiKey, process.env.YOUTUBE_API_KEY);

  console.log('\n✅ Stage 1 complete! Demand signals captured in database.');
  console.log('Next step: run `npm run research` to process signals into ranked topics.');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
