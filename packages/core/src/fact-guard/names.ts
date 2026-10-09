/** Named-entity checks for Fact Guard: companies, titles, degrees, certifications. */

export type NameKind = 'company' | 'title' | 'degree' | 'certification' | 'institution';

export interface NamedEntity {
  kind: NameKind;
  name: string;
}

export function normalizePhrase(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}+#&]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole-phrase, case-insensitive containment on normalized text. */
export function mentions(haystack: string, phrase: string): boolean {
  const p = normalizePhrase(phrase);
  if (!p) return false;
  return ` ${normalizePhrase(haystack)} `.includes(` ${p} `);
}

/**
 * Single-word titles ("Consultant", "Developer") are too generic to detect reliably in prose;
 * only multi-word titles are checked. Other kinds are always checked.
 */
export function isCheckable(e: NamedEntity): boolean {
  if (e.kind !== 'title') return true;
  return normalizePhrase(e.name).split(' ').length >= 2;
}

const ORG_SUFFIX =
  /\b((?:[A-Z][\p{L}&.-]*\s){0,3}[A-Z][\p{L}&.-]*\s(?:Inc|Ltd|LLC|LLP|Pvt|Corp|Corporation|Technologies|Labs|Bank|Solutions|Systems|Group|University|Institute|Consulting|Ventures)\b\.?)/gu;

/** Heuristic: capitalised phrases ending in an organisation suffix ("Acme Labs", "Zeta Pvt Ltd"). */
export function extractOrgLikeNames(text: string): string[] {
  return [...text.matchAll(ORG_SUFFIX)].map((m) => m[1]!.trim());
}
