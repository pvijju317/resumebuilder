import type { Region } from '@tailor/shared';

/** PRD F8 region presets. Consumed by the rewrite prompt, renderer and export validator. */
export interface RegionRules {
  region: Region;
  documentLabel: 'Resume' | 'CV';
  defaultPages: {
    base: 1 | 2;
    /** years of experience at which 2 pages becomes default */ twoPagesAtYears: number | null;
  };
  paper: 'A4' | 'Letter';
  photo: 'never' | 'optional-off' | 'optional';
  personalFields: 'never' | 'optional-off' | 'europass-optional';
  spelling: 'en-IN' | 'en-US' | 'en-GB';
  dateFormat: 'MMM YYYY' | 'MM/YYYY';
  statementLabel: 'Summary' | 'Profile';
  extras: Array<'noticePeriod' | 'workAuthorization' | 'rightToWork' | 'languagesCefr'>;
  hideCtc: boolean;
}

export const REGION_RULES: Readonly<Record<Region, RegionRules>> = {
  IN: {
    region: 'IN',
    documentLabel: 'Resume',
    defaultPages: { base: 1, twoPagesAtYears: 5 },
    paper: 'A4',
    photo: 'optional-off',
    personalFields: 'optional-off',
    spelling: 'en-IN',
    dateFormat: 'MMM YYYY',
    statementLabel: 'Summary',
    extras: ['noticePeriod'],
    hideCtc: true,
  },
  US: {
    region: 'US',
    documentLabel: 'Resume',
    defaultPages: { base: 1, twoPagesAtYears: 10 },
    paper: 'Letter',
    photo: 'never',
    personalFields: 'never',
    spelling: 'en-US',
    dateFormat: 'MMM YYYY',
    statementLabel: 'Summary',
    extras: ['workAuthorization'],
    hideCtc: true,
  },
  UK: {
    region: 'UK',
    documentLabel: 'CV',
    defaultPages: { base: 2, twoPagesAtYears: null },
    paper: 'A4',
    photo: 'never',
    personalFields: 'never',
    spelling: 'en-GB',
    dateFormat: 'MMM YYYY',
    statementLabel: 'Profile',
    extras: ['rightToWork'],
    hideCtc: true,
  },
  EU: {
    region: 'EU',
    documentLabel: 'CV',
    defaultPages: { base: 2, twoPagesAtYears: null },
    paper: 'A4',
    photo: 'optional',
    personalFields: 'europass-optional',
    spelling: 'en-GB',
    dateFormat: 'MM/YYYY',
    statementLabel: 'Profile',
    extras: ['languagesCefr'],
    hideCtc: true,
  },
};

export function regionRules(region: Region): RegionRules {
  return REGION_RULES[region];
}

export function defaultPageTarget(region: Region, yearsExperience: number): 1 | 2 {
  const r = REGION_RULES[region].defaultPages;
  if (r.twoPagesAtYears !== null && yearsExperience >= r.twoPagesAtYears) return 2;
  return r.base;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a vault `YYYY-MM` date per region (null => "Present"). */
export function formatVaultDate(ym: string | null | undefined, region: Region): string {
  if (!ym) return 'Present';
  const [y, m] = ym.split('-');
  if (!y || !m) return ym;
  return REGION_RULES[region].dateFormat === 'MM/YYYY'
    ? `${m}/${y}`
    : `${MONTHS[Number(m) - 1]} ${y}`;
}
