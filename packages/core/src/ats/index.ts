/** Server-only entry (pulls in the lemmatizer lexicon): import from '@tailor/core/ats'. */
export * from './score.js';
export * from './resume-text.js';
export { keywordForms, lemma, phrase, tokens } from './normalize.js';
export { jdHash, normalizeJdText, normalizeJobUrl } from '../jd.js';
