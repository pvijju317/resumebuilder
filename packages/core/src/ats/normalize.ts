import { createRequire } from 'node:module';

// wink-lemmatizer is untyped CommonJS; load it with a minimal typed surface.
const { lemmatizeNoun, lemmatizeVerb } = createRequire(import.meta.url)('wink-lemmatizer') as {
  lemmatizeNoun(word: string): string;
  lemmatizeVerb(word: string): string;
};
import aliasSource from '../../data/skill-aliases.json' with { type: 'json' };
import { defaultAliasMap, normalizeSkillText, skillKey } from '../skills.js';

const cache = new Map<string, string>();

/** Noun lemma first ("stakeholders" → "stakeholder"), else verb lemma ("managing" → "manage"). */
export function lemma(token: string): string {
  let l = cache.get(token);
  if (l === undefined) {
    // Keep tokens with symbols or digits as-is (c++, c#, node.js, s3, 2fa).
    if (/[^a-z]/.test(token) || token.length < 4) l = token;
    else {
      const n = lemmatizeNoun(token);
      l = n !== token ? n : lemmatizeVerb(token);
    }
    cache.set(token, l);
  }
  return l;
}

/** Lowercase, strip punctuation (keeping + # . / & inside skills), lemmatize each token. */
export function tokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}+#./&\s-]/gu, ' ')
      // Strip edge punctuation but keep a leading dot before letters (.net).
      .replace(/(?<=\s|^)[-/&]+|(?<=\s|^)\.+(?![a-z])|[.\-/&]+(?=\s|$)/g, ' ')
      .split(/[\s-]+/)
      .filter(Boolean)
      .map(lemma)
  );
}

export const phrase = (text: string) => tokens(text).join(' ');

const canonicalAliases = aliasSource as Record<string, string[]>;

/**
 * Filler a JD wraps around a skill ("strong SQL skills", "French language", "fintech experience").
 * Resumes say the core term, so it is matched without these words too.
 */
const FILLER = new Set([
  // Lemmatized forms: "skills" → skill, "working" → work, "proven" → prove.
  ...['experience', 'knowledge', 'skill', 'proficiency', 'expertise', 'background'],
  ...['understanding', 'familiarity', 'language', 'domain', 'ability'],
  ...['strong', 'excellent', 'solid', 'good', 'prove', 'work', 'deep'],
  ...['of', 'in', 'with', 'and', 'the', 'a', 'an'],
]);

/**
 * The core term of a filler-wrapped keyword, or null. Only the ends are trimmed, so a filler word
 * inside a real term stays ("natural language processing").
 */
function coreForm(p: string): string | null {
  const t = p.split(' ');
  let i = 0;
  let j = t.length;
  while (i < j && FILLER.has(t[i]!)) i++;
  while (j > i && FILLER.has(t[j - 1]!)) j--;
  const core = t.slice(i, j).join(' ');
  // A lone short token ("c", "r") would match far too much.
  return core.length >= 2 && core !== p ? core : null;
}

/** Every surface form a keyword may appear as: name, JD aliases, alias-map canonical and its aliases. */
export function keywordForms(name: string, aliases: string[] = []): string[] {
  const forms = new Set<string>([name, ...aliases]);
  for (const f of [...forms]) {
    const canonical = skillKey(f, defaultAliasMap);
    forms.add(canonical);
    for (const a of canonicalAliases[canonical] ?? []) forms.add(a);
  }
  const phrases = new Set([...forms].map(phrase).filter(Boolean));
  for (const p of [...phrases]) {
    const core = coreForm(p);
    if (core) phrases.add(core);
  }
  return [...phrases];
}

/** Whole-phrase containment on token boundaries. */
export const containsPhrase = (haystack: string, needle: string) =>
  ` ${haystack} `.includes(` ${needle} `);

export { normalizeSkillText };
