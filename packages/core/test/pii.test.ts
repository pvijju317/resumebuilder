import { describe, expect, it } from 'vitest';
import { containsPiiTokens, detokenize, detokenizeDeep, tokenizePii } from '../src/pii.js';

const RESUME = `Asha Rao
asha.rao@example.com | +91 98450 12345 | linkedin.com/in/asha-rao | https://github.com/asharao.
Flat No. 402, Lakeview Apartments, 5th Cross Road, Indiranagar, Bengaluru 560038

Senior Data Analyst, Contoso Retail (2021-03 to present)
- Grew revenue 1,200,000 over 2019-2023; 40 dashboards for 120 managers
- Call centre migration: reduced wait time by 35%
Phone (US): (415) 555-0134`;

describe('tokenizePii', () => {
  it('replaces contacts, URLs, phones and address lines, and restores them exactly', () => {
    const { text, map } = tokenizePii(RESUME);
    expect(text).not.toMatch(
      /asha\.rao@example\.com|98450|linkedin\.com|github\.com|560038|555-0134/,
    );
    expect(text).toContain('{{EMAIL_1}}');
    expect(text).toContain('{{PHONE_1}}');
    expect(text).toContain('{{PHONE_2}}');
    expect(text).toContain('{{URL_1}}');
    expect(text).toContain('{{URL_2}}.');
    expect(text).toContain('{{ADDRESS_1}}');
    expect(map['{{EMAIL_1}}']).toBe('asha.rao@example.com');
    expect(detokenize(text, map)).toBe(RESUME);
  });

  it('keeps names, metrics, years and date ranges', () => {
    const { text } = tokenizePii(RESUME);
    for (const keep of [
      'Asha Rao',
      '1,200,000',
      '2019-2023',
      '2021-03',
      '40 dashboards',
      '35%',
      'Contoso Retail',
    ]) {
      expect(text).toContain(keep);
    }
  });

  it('reuses one token for repeated values', () => {
    const { text, map } = tokenizePii('a@b.co and again a@b.co');
    expect(text).toBe('{{EMAIL_1}} and again {{EMAIL_1}}');
    expect(Object.keys(map)).toHaveLength(1);
  });

  it('handles UK postcodes and US ZIP address lines', () => {
    expect(tokenizePii('12 Baker Street, London NW1 6XE').text).toBe('{{ADDRESS_1}}');
    expect(tokenizePii('500 Main Street, Austin TX 78701').text).toBe('{{ADDRESS_1}}');
  });

  it('leaves text without PII unchanged', () => {
    const s = 'Led 3 squads; shipped v2.4 in 2024; NPS up 12 points.';
    expect(tokenizePii(s)).toEqual({ text: s, map: {} });
    expect(containsPiiTokens(s)).toBe(false);
  });
});

describe('detokenizeDeep', () => {
  it('restores tokens inside nested AI output and leaves unknown tokens', () => {
    const map = { '{{EMAIL_1}}': 'a@b.co' };
    const out = detokenizeDeep(
      { profile: { email: '{{EMAIL_1}}', links: ['{{URL_9}}'] }, n: 3, ok: true, z: null },
      map,
    );
    expect(out).toEqual({
      profile: { email: 'a@b.co', links: ['{{URL_9}}'] },
      n: 3,
      ok: true,
      z: null,
    });
    expect(containsPiiTokens('see {{URL_9}}')).toBe(true);
  });
});
