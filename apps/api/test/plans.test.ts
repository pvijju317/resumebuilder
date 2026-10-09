import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, makeApp, resetDb } from './harness.js';

beforeEach(resetDb);
afterAll(() => db().$disconnect());

const features = {
  editor: true,
  coverLetters: true,
  autofill: true,
  priorityQueue: false,
  extensionMatchScore: true,
  tracker: true,
  includedPerOptimization: { coverLetters: 1, regenerates: 3, refines: 3 },
};

describe('GET /plans', () => {
  it('returns active plans in order and skips inactive or malformed rows', async () => {
    await db().plan.createMany({
      data: [
        {
          id: 'pro',
          name: 'Pro',
          priceInr: 19_900,
          interval: 'month',
          credits: 40,
          premiumCredits: 0,
          features,
          sortOrder: 2,
        },
        {
          id: 'free',
          name: 'Free',
          priceInr: 0,
          interval: 'month',
          credits: 3,
          premiumCredits: 0,
          downloadsPerMonth: 1,
          features,
          sortOrder: 1,
        },
        {
          id: 'old',
          name: 'Old',
          priceInr: 1,
          interval: 'month',
          credits: 1,
          premiumCredits: 0,
          features,
          active: false,
        },
        {
          id: 'bad',
          name: 'Bad',
          priceInr: 1,
          interval: 'month',
          credits: 1,
          premiumCredits: 0,
          features: { nope: 1 },
        },
      ],
    });
    const r = await makeApp().req.get('/api/v1/plans').expect(200);
    expect(r.body.map((p: { id: string }) => p.id)).toEqual(['free', 'pro']);
    expect(r.body[1]).toMatchObject({
      priceInr: 19_900,
      interval: 'month',
      downloadsPerMonth: null,
      features,
    });
    expect(r.headers['cache-control']).toBe('public, max-age=300');
  });
});
