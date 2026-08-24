/**
 * Stage 1 — YouTube Scanner
 *
 * Scans therapist YouTube channels for content related to
 * Behold's topic clusters. Uses YouTube Data API v3 if key
 * is available, falls back to Gemini-assisted analysis.
 */

import { GoogleGenAI } from '@google/genai';
import { TOPIC_CLUSTERS, getSystemPrompt } from '../config/behold-profile.js';
import { insertSignal } from '../database/db.js';

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
 * Uses Gemini to identify trending therapy YouTube content
 * when YouTube API key is not available.
 */
async function scanViaGemini(apiKey, cluster) {
  const ai = new GoogleGenAI({ apiKey });

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

  try {
    return JSON.parse(response.text);
  } catch {
    return [];
  }
}

/**
 * Scans YouTube for therapist content related to Behold's topics.
 */
export async function scanYouTube(geminiApiKey, youtubeApiKey = null, clusterIds = null) {
  const clusters = clusterIds
    ? TOPIC_CLUSTERS.filter(c => clusterIds.includes(c.id))
    : TOPIC_CLUSTERS;

  const results = [];

  for (const cluster of clusters) {
    let videos = [];

    if (youtubeApiKey) {
      // Use YouTube Data API for real search results
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
      }
    }

    // Fall back to Gemini analysis if no API key or API failed
    if (videos.length === 0) {
      videos = await scanViaGemini(geminiApiKey, cluster);
    }

    for (const video of videos) {
      const signal = {
        source: 'youtube',
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
