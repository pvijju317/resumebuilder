import type { PlanFeatures } from '@tailor/shared';

/**
 * Initial plan rows (PRD F12). After seeding, the DB is the source of truth and admins edit
 * plans there — application code never reads these constants. Prices are PAISE.
 */
export interface PlanSeed {
  id: string;
  name: string;
  priceInr: number;
  interval: 'month' | 'year' | 'one_time';
  credits: number;
  premiumCredits: number;
  downloadsPerMonth: number | null;
  features: PlanFeatures;
  sortOrder: number;
}

const included = { coverLetters: 1, regenerates: 3, refines: 3 };

const free: PlanFeatures = {
  editor: false,
  coverLetters: false,
  autofill: false,
  priorityQueue: false,
  extensionMatchScore: true,
  tracker: true,
  includedPerOptimization: { coverLetters: 0, regenerates: 0, refines: 0 },
};
const starter: PlanFeatures = {
  ...free,
  editor: true,
  includedPerOptimization: included,
  validityDays: 30,
};
const pro: PlanFeatures = {
  ...free,
  editor: true,
  coverLetters: true,
  autofill: true,
  includedPerOptimization: included,
};
const power: PlanFeatures = { ...pro, priorityQueue: true };

export const PLAN_SEEDS: PlanSeed[] = [
  {
    id: 'free',
    name: 'Free',
    priceInr: 0,
    interval: 'month',
    credits: 3,
    premiumCredits: 0,
    downloadsPerMonth: 1,
    features: free,
    sortOrder: 0,
  },
  {
    id: 'starter',
    name: 'Starter',
    priceInr: 9_900,
    interval: 'one_time',
    credits: 5,
    premiumCredits: 0,
    downloadsPerMonth: null,
    features: starter,
    sortOrder: 1,
  },
  {
    id: 'pro_monthly',
    name: 'Pro',
    priceInr: 19_900,
    interval: 'month',
    credits: 40,
    premiumCredits: 0,
    downloadsPerMonth: null,
    features: pro,
    sortOrder: 2,
  },
  {
    id: 'pro_yearly',
    name: 'Pro (yearly)',
    priceInr: 199_000,
    interval: 'year',
    credits: 40,
    premiumCredits: 0,
    downloadsPerMonth: null,
    features: pro,
    sortOrder: 3,
  },
  {
    id: 'power_monthly',
    name: 'Power',
    priceInr: 39_900,
    interval: 'month',
    credits: 150,
    premiumCredits: 20,
    downloadsPerMonth: null,
    features: power,
    sortOrder: 4,
  },
  {
    id: 'power_yearly',
    name: 'Power (yearly)',
    priceInr: 399_000,
    interval: 'year',
    credits: 150,
    premiumCredits: 20,
    downloadsPerMonth: null,
    features: power,
    sortOrder: 5,
  },
];

/**
 * USD per 1M tokens, for AiCallLog cost estimates. The NVIDIA free endpoint costs 0; paid
 * fallback rows are added (and kept current) by admins once a provider is chosen.
 */
export const MODEL_PRICE_SEEDS = [
  {
    provider: 'nvidia',
    model: 'nvidia/nemotron-3-super-120b-a12b',
    inputPerMUsd: '0',
    outputPerMUsd: '0',
  },
  {
    provider: 'nvidia',
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    inputPerMUsd: '0',
    outputPerMUsd: '0',
  },
];
