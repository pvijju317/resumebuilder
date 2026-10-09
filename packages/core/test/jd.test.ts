import { describe, expect, it } from 'vitest';
import { jdHash, normalizeJdText, normalizeJobUrl } from '../src/jd.js';

describe('JD normalization', () => {
  it('produces the same hash for whitespace and case variants', () => {
    const a = 'Data Analyst\r\n\r\n\r\nWe need  SQL and Python.​';
    const b = '  data analyst\n\nwe need sql and python. ';
    expect(normalizeJdText(a)).toBe('Data Analyst\n\nWe need SQL and Python.');
    expect(jdHash(a)).toBe(jdHash(b));
    expect(jdHash(a)).not.toBe(jdHash('Data Analyst, Pune'));
  });

  it('canonicalizes job URLs', () => {
    expect(
      normalizeJobUrl('http://WWW.LinkedIn.com/jobs/view/123/?trk=abc&refId=x&utm_source=y#top'),
    ).toBe('https://linkedin.com/jobs/view/123');
    expect(
      normalizeJobUrl('https://boards.greenhouse.io/acme/jobs/42?gh_jid=42&utm_medium=x'),
    ).toBe('https://boards.greenhouse.io/acme/jobs/42?gh_jid=42');
    expect(normalizeJobUrl('https://jobs.lever.co/x/abc?b=2&a=1')).toBe(
      'https://jobs.lever.co/x/abc?a=1&b=2',
    );
    expect(normalizeJobUrl('https://u:p@example.com/')).toBe('https://example.com/');
    expect(normalizeJobUrl('ftp://example.com/x')).toBeNull();
    expect(normalizeJobUrl('not a url')).toBeNull();
  });
});
