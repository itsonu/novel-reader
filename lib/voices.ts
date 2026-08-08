// Kokoro voice IDs encode locale + gender: <locale><gender>_<name>.
// a=American b=British j=Japanese z=Mandarin e=Spanish f=French h=Hindi i=Italian p=Portuguese
// NOTE: this is ACCENT/LOCALE, not ethnicity. A voice's accent says nothing about who speaks it.
export type Voice = {
  id: string;
  name: string;      // display name
  accent: string;    // "American" | "British" | ...
  gender: 'Female' | 'Male';
  timbre: string;    // expression descriptor
  grade?: string;    // Kokoro's own quality grade, where published
};

const ACCENT: Record<string, string> = {
  a: 'American', b: 'British', j: 'Japanese', z: 'Mandarin',
  e: 'Spanish', f: 'French', h: 'Hindi', i: 'Italian', p: 'Portuguese'
};

// Timbre is a listening judgement, kept short and honest. Unlisted voices fall back to "neutral".
const TIMBRE: Record<string, string> = {
  af_heart: 'warm, intimate', af_bella: 'rich, theatrical', af_nicole: 'soft, close-mic',
  af_aoede: 'clear, youthful', af_kore: 'even, composed', af_sarah: 'bright, friendly',
  af_nova: 'crisp, modern', af_sky: 'light, airy', af_alloy: 'flat, neutral',
  af_jessica: 'dry, matter-of-fact', af_river: 'calm, unhurried',
  am_michael: 'steady, grounded', am_fenrir: 'deep, weighted', am_puck: 'wry, animated',
  am_echo: 'measured, distant', am_eric: 'plain, direct', am_liam: 'young, easy',
  am_onyx: 'dark, resonant', am_adam: 'blunt, unpolished', am_santa: 'jolly, aged',
  bf_emma: 'poised, literary', bf_isabella: 'formal, precise', bf_alice: 'brisk, clipped',
  bf_lily: 'gentle, small', bm_george: 'gravelled, elder', bm_fable: 'storyteller, lilting',
  bm_lewis: 'grave, slow', bm_daniel: 'neutral, newsreader'
};

// Grades Kokoro publishes for its best-supported voices.
const GRADE: Record<string, string> = {
  af_heart: 'A', af_bella: 'A-', am_fenrir: 'C+', am_michael: 'C+',
  af_nicole: 'B-', bf_emma: 'B-', am_puck: 'C+', bm_fable: 'C'
};

const titled = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function describeVoice(id: string): Voice {
  const [prefix, raw = id] = id.split('_');
  const accent = ACCENT[prefix?.[0]] ?? 'Unknown';
  const gender = prefix?.[1] === 'm' ? 'Male' : 'Female';
  return {
    id,
    name: titled(raw),
    accent,
    gender,
    timbre: TIMBRE[id] ?? 'neutral',
    grade: GRADE[id]
  };
}

/** "Heart — American Female · warm, intimate" */
export const voiceLabel = (v: Voice) =>
  `${v.name} — ${v.accent} ${v.gender} · ${v.timbre}`;

/** Group for an <optgroup>-style menu. */
export function groupVoices(ids: string[]) {
  const groups = new Map<string, Voice[]>();
  for (const id of ids) {
    const v = describeVoice(id);
    const key = `${v.accent} ${v.gender}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(v);
  }
  // graded voices first inside each group, then alphabetical
  for (const list of groups.values())
    list.sort((a, b) => (a.grade ? 0 : 1) - (b.grade ? 0 : 1) || a.name.localeCompare(b.name));
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** System (Web Speech) voices, labelled the same way so the menu reads consistently. */
export function describeSystemVoice(v: SpeechSynthesisVoice): Voice {
  const region = new Intl.DisplayNames(['en'], { type: 'region' });
  const tag = v.lang.split('-')[1];
  let accent = 'System';
  try { accent = tag ? region.of(tag) ?? 'System' : 'System'; } catch {}
  const male = /\b(male|david|mark|george|daniel|alex|fred|thomas)\b/i.test(v.name);
  return {
    id: v.voiceURI,
    name: v.name.replace(/^Microsoft\s+/, '').replace(/\s*-\s*.*$/, ''),
    accent,
    gender: male ? 'Male' : 'Female',
    timbre: v.localService ? 'on-device' : 'network'
  };
}
