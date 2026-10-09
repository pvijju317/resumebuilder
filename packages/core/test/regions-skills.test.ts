import { describe, expect, it } from 'vitest';
import { REGION_RULES, defaultPageTarget, formatVaultDate, regionRules } from '../src/regions.js';
import { buildAliasMap, normalizeSkillText, skillKey } from '../src/skills.js';

describe('regions', () => {
  it('encodes PRD F8 presets', () => {
    expect(regionRules('UK').documentLabel).toBe('CV');
    expect(REGION_RULES.US.photo).toBe('never');
    expect(REGION_RULES.US.paper).toBe('Letter');
    expect(REGION_RULES.EU.dateFormat).toBe('MM/YYYY');
    expect(REGION_RULES.IN.spelling).toBe('en-IN');
  });

  it('chooses default page targets', () => {
    expect(defaultPageTarget('US', 3)).toBe(1);
    expect(defaultPageTarget('US', 12)).toBe(2);
    expect(defaultPageTarget('UK', 1)).toBe(2);
  });

  it('formats vault dates per region', () => {
    expect(formatVaultDate('2023-04', 'US')).toBe('Apr 2023');
    expect(formatVaultDate('2023-04', 'EU')).toBe('04/2023');
    expect(formatVaultDate(null, 'IN')).toBe('Present');
    expect(formatVaultDate('2023', 'IN')).toBe('2023');
  });
});

describe('skills', () => {
  it('normalizes and resolves aliases', () => {
    expect(normalizeSkillText('  Node.JS. ')).toBe('node.js');
    expect(skillKey('JS')).toBe('javascript');
    expect(skillKey('k8s')).toBe('kubernetes');
    expect(skillKey('Postgres')).toBe('postgresql');
    expect(skillKey('C#')).toBe('c#');
    expect(skillKey('Underwater Basket Weaving')).toBe('underwater basket weaving');
  });

  it('builds custom alias maps', () => {
    const m = buildAliasMap({ 'tailor cms': ['tcms'] });
    expect(skillKey('TCMS', m)).toBe('tailor cms');
  });
});
