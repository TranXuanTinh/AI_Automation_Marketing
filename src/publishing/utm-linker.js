/**
 * Stage 3 — UTM Linker & Publishing Coordinator
 *
 * Appends standard UTM tracking codes to URLs based on target platform and campaign.
 */

import { insertPublished } from '../database/db.js';

export function generateUtmUrl(baseUrl, { source, medium, campaign, content = null }) {
  const url = new URL(baseUrl);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', medium);
  url.searchParams.set('utm_campaign', campaign);
  if (content) {
    url.searchParams.set('utm_content', content);
  }
  return url.toString();
}

export function registerPublication(draftId, platform, destinationBaseUrl, campaignName) {
  const channelConfig = {
    pinterest: { medium: 'social', source: 'pinterest' },
    instagram: { medium: 'social', source: 'instagram' },
    linkedin: { medium: 'social', source: 'linkedin' },
    youtube: { medium: 'video', source: 'youtube' },
    substack: { medium: 'newsletter', source: 'substack' },
    blog: { medium: 'organic', source: 'website' },
  };

  const config = channelConfig[platform] || { medium: 'referral', source: platform };
  const trackedUrl = generateUtmUrl(destinationBaseUrl, {
    source: config.source,
    medium: config.medium,
    campaign: campaignName,
  });

  const res = insertPublished({
    draft_id: draftId,
    platform,
    url: trackedUrl,
    utm_code: `utm_source=${config.source}&utm_medium=${config.medium}&utm_campaign=${campaignName}`,
  });

  return { id: res.lastInsertRowid, platform, trackedUrl };
}

export default { generateUtmUrl, registerPublication };
