import defaultAliases from '../data/skill-aliases.json' with { type: 'json' };

/** canonical -> aliases (the JSON file shape, also the SkillAlias table seed). */
export type AliasSource = Record<string, string[]>;
/** alias (and canonical) -> canonical lookup. */
export type AliasMap = ReadonlyMap<string, string>;

/** Lowercase, trim, collapse whitespace; keeps + # . / & which are meaningful in skill names. */
export function normalizeSkillText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}+#./&\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
}

export function buildAliasMap(source: AliasSource = defaultAliases): AliasMap {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(source)) {
    const c = normalizeSkillText(canonical);
    map.set(c, c);
    for (const a of aliases) map.set(normalizeSkillText(a), c);
  }
  return map;
}

export const defaultAliasMap: AliasMap = buildAliasMap();

/** Resolve a skill name to its canonical key (unknown skills normalize to themselves). */
export function skillKey(name: string, aliases: AliasMap = defaultAliasMap): string {
  const n = normalizeSkillText(name);
  return aliases.get(n) ?? n;
}
