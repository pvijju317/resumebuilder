import { describe, expect, it } from 'vitest';
import { extractNumbers, numberSupported, stripAsks } from '../src/fact-guard/numbers.js';

const one = (s: string) => {
  const n = extractNumbers(s);
  expect(n).toHaveLength(1);
  return n[0]!;
};

describe('extractNumbers', () => {
  it.each([
    ['grew users by 12', 12, 'number'],
    ['served 1,200,000 users', 1_200_000, 'number'],
    ['served 1,20,000 users', 120_000, 'number'],
    ['served 1.2M users', 1_200_000, 'number'],
    ['served 1.2 million users', 1_200_000, 'number'],
    ['closed ₹5 Cr in deals', 50_000_000, 'currency:INR'],
    ['closed Rs. 40 lakh pipeline', 4_000_000, 'currency:INR'],
    ['saved $3.4 billion', 3_400_000_000, 'currency:USD'],
    ['saved 500 USD monthly', 500, 'currency:USD'],
    ['cut costs by £20k', 20_000, 'currency:GBP'],
    ['budget of €2bn', 2_000_000_000, 'currency:EUR'],
    ['cut time by 63%', 63, 'percent'],
    ['cut time by 63 %', 63, 'percent'],
    ['cut time by 63 percent', 63, 'percent'],
    ['cut time by 63 per cent', 63, 'percent'],
    ['made it 3x faster', 3, 'number'],
    ['ranked 2nd nationally', 2, 'number'],
    ['led five engineers', 5, 'number'],
    ['since 2021', 2021, 'number'],
  ])('%s', (text, value, kind) => {
    const n = one(text);
    expect(n.value).toBeCloseTo(value);
    expect(n.kind).toBe(kind);
  });

  it('extracts numbers with attached units', () => {
    expect(
      extractNumbers('load time from 40s to 6s, p95 120ms, 2hrs saved, 500GB').map((n) => n.value),
    ).toEqual([40, 6, 120, 2, 500]);
    expect(extractNumbers('2FA and 5G rollout')).toEqual([]);
  });

  it('marks lower bounds', () => {
    expect(one('40+ clients').plus).toBe(true);
  });

  it('ignores digits embedded in identifiers', () => {
    expect(extractNumbers('Deployed on AWS EC2 and S3 with K8s and Python3, B2B, v1.2')).toEqual(
      [],
    );
  });

  it('does not treat words that start with a multiplier as multipliers', () => {
    const n = one('mentored 5 members');
    expect(n.value).toBe(5);
    expect(n.multiplier).toBe(1);
  });

  it('extracts both ends of ranges', () => {
    expect(extractNumbers('teams of 10-15').map((n) => n.value)).toEqual([10, 15]);
  });

  it('records precision as written', () => {
    const n = one('1.20M');
    expect(n.decimals).toBe(2);
    expect(n.sigFigs).toBe(3);
    expect(one('5000 users').sigFigs).toBe(1);
    expect(one('0.5% churn').sigFigs).toBe(1);
  });

  it('strips ASK placeholders before extracting', () => {
    expect(stripAsks('cut by [[ASK: by how much, e.g. 20%?]] overall')).not.toContain('20');
    expect(extractNumbers('cut cost [[ASK: how much? e.g. 20%]]')).toEqual([]);
  });
});

describe('numberSupported', () => {
  const ok = (out: string, src: string) => numberSupported(one(out), one(src));

  it('accepts equal values across notations', () => {
    expect(ok('1.2M users', '1,200,000 users')).toBe(true);
    expect(ok('₹50 million', '₹5 Cr')).toBe(true);
    expect(ok('63%', '63 percent')).toBe(true);
  });

  it('accepts honest rounding/truncation with ≥ 2 significant digits', () => {
    expect(ok('1.2M', '1,234,567')).toBe(true);
    expect(ok('63%', '63.4%')).toBe(true);
    expect(ok('1.2M', '1,290,000')).toBe(true); // truncation
  });

  it('rejects inflated rounding and low-precision rounding', () => {
    expect(ok('1.3M', '1,234,567')).toBe(false);
    expect(ok('2K', '1,500')).toBe(false);
  });

  it('accepts lower bounds only when the source meets them', () => {
    expect(ok('40+', '40')).toBe(true);
    expect(ok('40+', '47')).toBe(true);
    expect(ok('500+', '47')).toBe(false);
  });

  it('enforces kind compatibility', () => {
    expect(ok('63%', '63 dashboards')).toBe(false);
    expect(ok('$5M', '₹5M')).toBe(false);
    expect(ok('₹5 Cr', '50000000 revenue')).toBe(true);
    expect(ok('63 dashboards', '63%')).toBe(true);
  });
});
