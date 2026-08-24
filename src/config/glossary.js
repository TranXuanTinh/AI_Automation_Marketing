/**
 * Behold Content System — Glossary
 *
 * Programmatic version of the glossary from First Task.md.
 * Used in AI prompts to ensure consistent terminology.
 */

export const GLOSSARY = {
  content_opportunity: {
    term: 'Content opportunity',
    definition: 'A useful question or problem that Behold could address through an article or resource.',
    example: 'Many women search for why they feel emotionally numb after prolonged stress.',
  },
  working_title: {
    term: 'Working title',
    definition: 'A temporary title describing what the content will cover.',
    example: '"Why Do I Feel Numb After Years of Holding Everything Together?"',
  },
  intended_audience: {
    term: 'Intended audience',
    definition: 'The specific people the resource is meant to help.',
    example: 'Spiritually sensitive women aged 35–65 experiencing emotional exhaustion.',
  },
  client_need: {
    term: 'Client need',
    definition: 'The emotional or practical problem behind the search.',
    example: 'The person wants to understand whether emotional numbness means something is wrong with them.',
  },
  search_intent: {
    term: 'Search intent',
    definition: 'What the person hopes to find or accomplish when searching.',
    example: 'Someone searching "why do I feel emotionally numb?" wants understanding and possible next steps — not a sales page.',
  },
  demand_signal: {
    term: 'Demand signal',
    definition: 'Visible evidence that people are asking about or engaging with a topic.',
    example: 'The same question appears in Google\'s "People also ask," Reddit discussions, and therapist videos.',
  },
  audience_language: {
    term: 'Audience language',
    definition: 'The words real people use to describe their experiences.',
    example: '"I\'m functioning, but I don\'t feel anything anymore."',
  },
  credible_source: {
    term: 'Credible source',
    definition: 'A trustworthy source with qualified authorship and reliable evidence.',
    example: 'The American Psychological Association, a peer-reviewed journal, or a recognized trauma researcher.',
  },
  evidence_map: {
    term: 'Evidence map',
    definition: 'An organized list showing which sources support each part of the future article.',
    example: 'Research source for nervous-system shutdown; clinical source for symptoms; audience source for lived-experience language.',
  },
  unique_behold_angle: {
    term: 'Unique Behold angle',
    definition: 'The distinct perspective Behold brings to a familiar subject.',
    example: 'Explaining numbness compassionately as protection while including body awareness, relational healing, and spiritual sensitivity.',
  },
};

/**
 * Formats the glossary into a prompt-friendly string
 */
export function getGlossaryPrompt() {
  return Object.values(GLOSSARY)
    .map(g => `- **${g.term}**: ${g.definition}`)
    .join('\n');
}
