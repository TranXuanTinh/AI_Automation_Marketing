/**
 * Behold Counselling — Brand Profile & AI Configuration
 *
 * This file defines the practitioner identity, clinical modalities,
 * audience profiles, tone guidelines, and scoring criteria that
 * power every AI-generated output in the system.
 */

export const PRACTITIONER = {
  name: 'Yiya',
  credential: 'Registered Clinical Counsellor (RCC)',
  practice: 'Behold Counselling',
  website: 'beholdcounselling.com',
  psychologyToday: 'https://www.psychologytoday.com/profile/831616',
  location: 'British Columbia, Canada',
};

export const MODALITIES = [
  {
    name: 'Internal Family Systems (IFS)',
    shortName: 'IFS',
    description: 'Parts-based therapy that treats all internal parts — including protective ones causing numbness, self-criticism, or avoidance — as having positive intentions. Works by accessing the compassionate Self to lead the internal system.',
    keyPhrases: ['parts work', 'inner critic', 'Manager', 'Firefighter', 'Exile', 'Self-energy', 'unblending', 'unburdening'],
  },
  {
    name: 'Developmental Needs Meeting Strategy (DNMS)',
    shortName: 'DNMS',
    description: 'Addresses unmet developmental needs from childhood. If emotions were unsafe early on, the nervous system learned to suppress them. DNMS repairs these attachment wounds through resourcing and reparenting.',
    keyPhrases: ['developmental needs', 'attachment wound', 'reparenting', 'inner child', 'unmet needs'],
  },
  {
    name: 'Eye Movement Desensitization and Reprocessing (EMDR)',
    shortName: 'EMDR',
    description: 'Processes traumatic memories stored in the nervous system using bilateral stimulation. Reduces the emotional intensity of stuck memories, allowing natural integration.',
    keyPhrases: ['bilateral stimulation', 'reprocessing', 'trauma memory', 'desensitization', 'adaptive resolution'],
  },
  {
    name: 'Somatic Therapy',
    shortName: 'Somatic',
    description: 'Body-first, bottom-up approach to trauma recovery. Addresses the physiological imprint of trauma through interoceptive awareness, nervous system regulation, and completing thwarted defensive responses.',
    keyPhrases: ['nervous system regulation', 'window of tolerance', 'freeze response', 'body awareness', 'interoception', 'polyvagal', 'somatic experiencing'],
  },
  {
    name: 'Mindfulness Practices',
    shortName: 'Mindfulness',
    description: 'Non-judgmental, present-moment awareness. Helps clients notice internal experiences without being overwhelmed by them. Foundation for emotional regulation and body-based therapeutic work.',
    keyPhrases: ['present moment', 'non-judgmental awareness', 'grounding', 'body scan', 'breath work', 'contemplative practice'],
  },
];

export const SPIRITUAL_INTEGRATION = {
  description: 'Spiritually sensitive counselling that integrates Christian faith without imposing it. Holds clinical depth alongside genuine spiritual questions — doubt, dryness, lament, and meaning-making — without toxic positivity or dogmatic conclusions.',
  keyPhrases: ['spiritual dryness', 'dark night of the soul', 'faith and doubt', 'lament', 'spiritual integration', 'contemplative', 'Christian counselling'],
};

export const TARGET_AUDIENCE = {
  primary: 'Emotionally burdened, spiritually sensitive adults (aged 30–65) navigating trauma, grief, and life transitions',
  mainPathways: [
    'Trauma, overwhelm, and relational patterns (IFS, somatic regulation, boundary differentiation)',
    'Grief, loss, and life transitions (Sudden loss, miscarriage, ambiguous addiction loss, thresholds)',
    'Faith, meaning, and soul care (Spiritual dryness, non-dogmatic Christian integration, discernment)',
  ],
  segments: [
    'Emotionally exhausted women (burnout, over-responsibility, resentment, loss of self)',
    'Women at a life threshold (career change, separation, empty nest, identity & spiritual transition)',
    'Complex-trauma survivors (shame, hypervigilance, dissociation, bodily reactions to triggers)',
    'Adult children shaped by family burdens (parentified children, obligation to chosen responsibility)',
    'Spiritually sensitive Christians (spiritual dryness, dark night of the soul, trauma-informed prayer)',
    'Creative and highly sensitive adults (overstimulation, perfectionism, creative vitality)',
    'Neurodivergent adults & ADHD (executive dysfunction, shame spiral, structure without rigidity)',
    'People carrying complicated/ambiguous grief (miscarriage, suicide, addiction, estrangement)',
    'Adults caught in resentment & relational injury (forgiveness pressure vs. safety and repair)',
    'Men learning relational attunement (embodied emotional awareness, curiosity before fixing)',
    'Young men facing vocational disruption (identity, meaning, and purpose beyond productivity)',
  ],
  innerLanguage: [
    "I look fine on the outside but I'm hollow inside.",
    "I’m carrying too much, but I don’t know how to stop.",
    "I understand my patterns intellectually, but they are still in my body.",
    "I don’t know what I really want anymore.",
    "Something has to change.",
    "I want to trust myself—and perhaps God—again.",
    "I feel as though I am standing at a threshold.",
    "I can't cry even when I want to.",
    "Standard talk therapy gave me insight but nothing changed in my body.",
    "I know I should set boundaries but I physically cannot say no.",
  ],
};

export const TOPIC_CLUSTERS = [
  { id: 'trauma_recovery', name: 'Trauma Recovery', subreddits: ['r/CPTSD', 'r/traumatoolbox', 'r/PTSD'] },
  { id: 'grief_loss', name: 'Grief & Complicated Grief', subreddits: ['r/GriefSupport', 'r/Miscarriage', 'r/SuicideBereavement'] },
  { id: 'anxiety_overwhelm', name: 'High-Functioning Anxiety & Emotional Exhaustion', subreddits: ['r/Anxiety', 'r/HighFunctioningAnxiety'] },
  { id: 'emotional_numbness', name: 'Emotional Numbness & Dissociation', subreddits: ['r/CPTSD', 'r/dpdr'] },
  { id: 'resentment_forgiveness', name: 'Resentment, Forgiveness & Boundaries', subreddits: ['r/CPTSD', 'r/relationships'] },
  { id: 'ifs_parts', name: 'IFS & Parts Work', subreddits: ['r/InternalFamilySystems'] },
  { id: 'faith_spiritual', name: 'Faith, Spiritual Integration & Dryness', subreddits: ['r/Christianity', 'r/Deconstruction'] },
  { id: 'adhd_neurodivergent', name: 'ADHD, Executive Function & Neurodivergence', subreddits: ['r/ADHD', 'r/adhdwomen'] },
];

export const TONE_GUIDELINES = {
  voice: 'warm clinical clarity',
  principles: [
    'Write like a compassionate clinician explaining to a friend — warm but precise',
    'Name the experience before explaining it',
    'Honour the reader\'s intelligence — no oversimplification',
    'Avoid medical jargon unless defined; use the audience\'s own language',
    'Responsible clinical formulation: Never present trauma as the sole, absolute explanation for emotional symptoms. Use nuanced framing: "X can be experienced as a protective response, particularly in the context of overwhelming stress or trauma", while noting overlap with depression, grief, burnout, and nervous system hypoarousal.',
    'Evidence Grounding: Every significant clinical claim or framework must cite an evidence source with numbered inline citations [1], [2] linked to the research base.',
    'Include the body — emotional experiences live in the nervous system, not just the mind (somatic regulation, polyvagal, window of tolerance)',
    'Hold spiritual questions with openness, never impose or dismiss',
    'Always offer hope without toxic positivity — "it can shift" not "just think positive"',
    'Use Canadian English spelling (colour, honour, practise)',
  ],
  avoid: [
    'Generic self-help language ("just breathe", "practice gratitude")',
    'Clickbait or SEO-stuffed phrasing',
    'Overstated monocausal claims (e.g. claiming numbness "is" definitively a trauma survival response rather than "can be experienced as an adaptation")',
    'Medical diagnosis language (leave that to the clinical context)',
    'Definitive claims without evidence or ungrounded generalizations',
    'AI-sounding phrases ("In today\'s fast-paced world", "Let\'s dive in")',
  ],
};

export const SCORING_MATRIX = {
  metrics: [
    {
      id: 'm1',
      name: 'Audience Relevance',
      question: 'Is this a real and important struggle for Behold\'s ideal clients?',
      maxScore: 'Closely matches emotionally exhausted, spiritually sensitive adults seeking trauma-informed support.',
    },
    {
      id: 'm2',
      name: 'Visible Demand',
      question: 'Is there documented evidence that people are asking about it?',
      maxScore: 'Appears repeatedly across Google PAA, Reddit discussions, and therapist YouTube content.',
    },
    {
      id: 'm3',
      name: 'Behold Fit',
      question: 'Does this connect strongly with your expertise and approach?',
      maxScore: 'Strong fit with IFS, DNMS, EMDR, Somatic Therapy, Mindfulness, and/or spiritually integrated counselling.',
    },
    {
      id: 'm4',
      name: 'Client Usefulness',
      question: 'Would this resource help someone understand themselves or take a safe next step?',
      maxScore: 'Immediately useful as educational resource, FAQ, or client handout.',
    },
    {
      id: 'm5',
      name: 'Distinctive Angle',
      question: 'Can Behold contribute something more thoughtful than existing generic articles?',
      maxScore: 'Clear opportunity for compassionate, spiritually sensitive, and relational perspective.',
    },
  ],
  thresholds: {
    createFirst: { min: 21, max: 25, label: 'Create First' },
    strongFuture: { min: 17, max: 20, label: 'Strong Future Topic' },
    needsAngle: { min: 13, max: 16, label: 'Needs Sharper Angle' },
    doNotPrioritize: { min: 0, max: 12, label: 'Do Not Prioritize' },
  },
};

export const PUBLISHING_CHANNELS = {
  yiyaEcosystem: {
    label: '3A — Yiya Public Ecosystem',
    description: 'Art, music, meditation, workshops',
    platforms: ['Pinterest', 'Instagram', 'YouTube', 'Substack', 'Spotify', 'SoundCloud'],
    destinationUrl: 'yiya.ca',
  },
  beholdEcosystem: {
    label: '3B — Behold Public Ecosystem',
    description: 'Counselling education + resources',
    platforms: ['Google (blog)', 'LinkedIn', 'Psychology Today', 'Pinterest', 'Instagram', 'YouTube'],
    destinationUrl: 'beholdcounselling.com',
  },
};

export const MONITORING_SCHEDULE = {
  day1: { label: 'Day 1 Check', hours: 24 },
  day7: { label: 'Day 7 Check', hours: 168 },
  day30: { label: 'Day 30 Check', hours: 720 },
  weeklyReport: { cron: '0 9 * * 1', label: 'Weekly Learning Report (Monday 9 AM)' },
};

/**
 * Generates the system prompt for Gemini API calls
 * to ensure all AI outputs follow Behold's brand voice.
 */
export function getSystemPrompt(context = '') {
  return `You are a clinical content research assistant for ${PRACTITIONER.practice}, led by ${PRACTITIONER.name} (${PRACTITIONER.credential}) in ${PRACTITIONER.location}.

CORE MODALITIES: ${MODALITIES.map(m => m.name).join(', ')}, and Spiritually Integrated Counselling.

TARGET AUDIENCE: ${TARGET_AUDIENCE.primary}

TONE: ${TONE_GUIDELINES.voice}
${TONE_GUIDELINES.principles.map(p => `- ${p}`).join('\n')}

AVOID:
${TONE_GUIDELINES.avoid.map(a => `- ${a}`).join('\n')}

CRITICAL RULES:
- NEVER invent citations, DOIs, ISBNs, or author names
- NEVER fabricate search volume numbers or statistics
- NEVER write the finished publishable article — produce research and drafts only
- Always distinguish peer-reviewed evidence from audience-language sources
- Use Canadian English spelling (colour, honour, practise)
- Frame adaptive survival strategies as protection, not pathology

${context}`;
}
