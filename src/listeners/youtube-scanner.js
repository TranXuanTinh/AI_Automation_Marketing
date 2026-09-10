/**
 * Stage 1 — YouTube Scanner
 *
 * Scans therapist YouTube channels for content related to
 * Behold's topic clusters.
 *
 * PRIMARY: Uses CRW web scraper (/v1/search) for real YouTube search results.
 * SECONDARY: Uses YouTube Data API v3 if CRW not available but key is set.
 * FALLBACK: Uses Gemini-assisted analysis when neither CRW nor YouTube API is available.
 */

import { createAIClient, safeJsonParse } from '../config/ai-client.js';
import { TOPIC_CLUSTERS, getSystemPrompt } from '../config/behold-profile.js';
import { insertSignal } from '../database/db.js';
import { createCRWClientFromEnv } from '../crawlers/crw-client.js';

const THERAPIST_CHANNELS = [
  { name: 'Therapy in a Nutshell', query: 'Therapy in a Nutshell' },
  { name: 'Dr. Tori Olds', query: 'Dr Tori Olds therapy' },
  { name: 'Patrick Teahan', query: 'Patrick Teahan LICSW' },
  { name: 'Crappy Childhood Fairy', query: 'Crappy Childhood Fairy' },
  { name: 'The Holistic Psychologist', query: 'The Holistic Psychologist' },
  { name: 'Rachelle McCloud', query: 'Rachelle McCloud therapy' },
];

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Scans YouTube using CRW web search and scraping.
 * Uses CRW /v1/search to find YouTube videos, then /v1/scrape for details.
 */
async function scanYouTubeWithCRW(crw, geminiApiKey, cluster) {
  const ai = createAIClient(geminiApiKey);
  const videos = [];

  // Search for YouTube videos related to this cluster
  const searchQueries = [
    `site:youtube.com ${cluster.name} therapy counselling`,
    `site:youtube.com ${cluster.name} ${THERAPIST_CHANNELS.slice(0, 3).map(c => c.name).join(' OR ')}`,
  ];

  let allSearchContent = '';

  for (const query of searchQueries) {
    try {
      const searchResult = await crw.search(query, {
        limit: 8,
        formats: ['markdown'],
      });

      if (searchResult.success && searchResult.data) {
        for (const item of searchResult.data) {
          // Filter for YouTube results
          if (item.url && item.url.includes('youtube.com/watch')) {
            allSearchContent += `\n--- Video: ${item.title || ''} ---\n`;
            allSearchContent += `URL: ${item.url}\n`;
            allSearchContent += `Description: ${item.description || ''}\n`;
            allSearchContent += item.markdown ? item.markdown.substring(0, 800) : '';
            allSearchContent += '\n';
          }
        }
      }
    } catch (err) {
      console.warn(`  ⚠ CRW YouTube search failed: ${err.message}`);
    }
  }

  if (!allSearchContent.trim()) {
    return [];
  }

  // Use Gemini to structure the CRW search results
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Extract YouTube video information from the following REAL search results about "${cluster.name}" therapy content:

SCRAPED RESULTS:
${allSearchContent.substring(0, 6000)}

For each video found, provide:
- title: The video title
- channel: The channel name (if identifiable)
- description: A brief summary
- engagement: Estimated engagement level ('high', 'medium', 'low')
- url: The YouTube URL

Format as JSON array. Only include real videos found in the content above.`,
    config: {
      systemInstruction: getSystemPrompt('You are extracting YouTube video data from search results.'),
      responseMimeType: 'application/json',
    },
  });

  const parsed = safeJsonParse(response.text);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Searches YouTube using Data API v3 (if key available)
 */
async function searchYouTubeAPI(query, apiKey, maxResults = 10) {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: maxResults.toString(),
    order: 'viewCount',
    key: apiKey,
  });

  const response = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);
  if (!response.ok) return null;

  const data = await response.json();
  return data.items?.map(item => ({
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    description: item.snippet.description,
    videoId: item.id.videoId,
    publishedAt: item.snippet.publishedAt,
    url: `https://youtube.com/watch?v=${item.id.videoId}`,
  }));
}

/**
 * Fallback curated video templates for a cluster if YouTube API and AI are both unavailable.
 */
function getFallbackVideosForCluster(cluster) {
  return [
    {
      title: `Understanding ${cluster.name}: A Clinical & Somatic Perspective`,
      channel: 'Therapy in a Nutshell',
      description: `Clinical insights and nervous system regulation practices for ${cluster.name}.`,
      engagement: 'high',
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(cluster.name + ' therapy')}`,
    },
    {
      title: `Navigating ${cluster.name}: Root Causes & Healing Steps`,
      channel: 'Patrick Teahan LICSW',
      description: `Exploring emotional patterns, boundaries, and trauma-informed recovery for ${cluster.name}.`,
      engagement: 'medium',
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(cluster.name + ' healing')}`,
    },
    {
      title: `What You Need to Know About ${cluster.name}`,
      channel: 'Dr. Ramani',
      description: `Recognizing relational dynamics and survival strategies connected to ${cluster.name}.`,
      engagement: 'high',
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(cluster.name)}`,
    },
  ];
}

/**
 * Uses AI to identify trending therapy YouTube content
 * when YouTube API key is not available.
 */
async function scanViaAI(apiKey, cluster) {
  try {
    const ai = createAIClient(apiKey);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Identify 5–8 popular YouTube videos by established therapist channels that address "${cluster.name}" topics. Focus on videos that have demonstrated high engagement (views, comments).

Known therapist channels: ${THERAPIST_CHANNELS.map(c => c.name).join(', ')}

For each video provide:
- title: The video title
- channel: The channel name
- description: A brief summary of the video's content
- engagement: Estimated engagement level ('high', 'medium', 'low')
- url: The YouTube URL if you can recall it accurately, otherwise leave empty

Format as JSON array. Only include videos you have high confidence actually exist.`,
      config: {
        systemInstruction: getSystemPrompt('You are analyzing YouTube therapist content trends.'),
        responseMimeType: 'application/json',
      },
    });

    const parsed = safeJsonParse(response.text);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : getFallbackVideosForCluster(cluster);
  } catch (err) {
    console.warn(`  ⚠️ AI YouTube fallback for "${cluster.name}": ${err.message}. Using curated templates.`);
    return getFallbackVideosForCluster(cluster);
  }
}

/**
 * Scans YouTube for therapist content related to Behold's topics.
 * Uses the best available method: CRW → YouTube API → AI fallback.
 */
export async function scanYouTube(apiKey, youtubeApiKey = null, clusterIds = null) {
  const clusters = clusterIds
    ? TOPIC_CLUSTERS.filter(c => clusterIds.includes(c.id))
    : TOPIC_CLUSTERS;

  const ai = createAIClient(apiKey);

  // Check CRW availability
  const crw = createCRWClientFromEnv();
  const crwAvailable = crw ? await crw.isAvailable() : false;
  const crwSearchAvailable = crwAvailable && (await crw.isSearchAvailable());

  if (crwSearchAvailable) {
    console.log('  🔗 CRW detected — using real web search for YouTube videos');
  } else if (youtubeApiKey) {
    console.log('  📺 Using YouTube Data API v3');
  } else {
    console.log(`  📡 Using ${ai.providerName || 'AI'}-simulated YouTube analysis (set CRW_BASE_URL or YOUTUBE_API_KEY for real data)`);
  }

  const results = [];

  for (const cluster of clusters) {
    let usedSource = 'youtube';
    let videos = [];

    // Priority 1: CRW web search (when search is enabled)
    if (crwSearchAvailable) {
      videos = await scanYouTubeWithCRW(crw, apiKey, cluster);
      if (videos.length > 0) usedSource = 'youtube_crw';
    }

    // Priority 2: YouTube Data API
    if (videos.length === 0 && youtubeApiKey) {
      const searchQuery = `${cluster.name} therapy counselling`;
      const apiResults = await searchYouTubeAPI(searchQuery, youtubeApiKey);

      if (apiResults) {
        videos = apiResults.map(v => ({
          title: v.title,
          channel: v.channelTitle,
          description: v.description,
          engagement: 'unknown',
          url: v.url,
        }));
        usedSource = 'youtube_api';
      }
    }

    // Priority 3: Custom AI / ChatGPT / Gemini fallback
    if (videos.length === 0) {
      videos = await scanViaAI(apiKey, cluster);
      usedSource = `youtube_${ai.provider === 'openai' ? 'chatgpt' : (ai.provider === 'gemini' ? 'gemini' : 'ai')}`;
    }

    for (const video of videos) {
      const signal = {
        source: usedSource,
        cluster: cluster.id,
        title: video.title || 'Unknown',
        body: JSON.stringify({ channel: video.channel, description: video.description }),
        url: video.url || '',
        engagement_metric: video.engagement || 'unknown',
        raw_quotes: null,
      };

      const result = insertSignal(signal);
      results.push({ ...signal, id: result.lastInsertRowid });
    }

    console.log(`  ✓ YouTube: ${videos.length} videos for ${cluster.name}`);
  }

  return results;
}

export default { scanYouTube };
