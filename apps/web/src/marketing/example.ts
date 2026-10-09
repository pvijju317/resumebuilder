import type { ChipState } from '@tailor/ui';

/**
 * Illustrative example shown on the landing page. Built from the synthetic eval pair
 * `p2-data-analyst-us` (evals/pairs.jsonl): every number in the tailored bullets exists in that
 * sample vault. Scores are illustrative and labelled as an example in the UI.
 */
export const EXAMPLE = {
  role: 'Data Analyst',
  context: 'Retail analytics role, US',
  score: { before: 54, after: 86 },
  keywords: [
    { name: 'SQL', before: 'matched', after: 'matched' },
    { name: 'Python', before: 'matched', after: 'matched' },
    { name: 'Tableau', before: 'missing', after: 'matched' },
    { name: 'A/B testing', before: 'partial', after: 'matched' },
    { name: 'Stakeholder management', before: 'missing', after: 'matched' },
  ] satisfies { name: string; before: ChipState; after: ChipState }[],
  bullets: [
    {
      before: 'Responsible for monthly sales reports using Python and SQL.',
      after: [
        'Automated monthly sales reporting in ',
        '[Python and SQL]',
        ', cutting manual effort by ',
        '[63%]',
        '.',
      ],
    },
    {
      before: 'Made dashboards for store managers.',
      after: [
        'Built ',
        '[40 Tableau dashboards]',
        ' used weekly by ',
        '[120 store and category managers]',
        '.',
      ],
    },
    {
      before: 'Worked on pricing experiments in stores.',
      after: [
        'Analyzed pricing ',
        '[A/B tests]',
        ' across 300 stores; the winning variant lifted basket size ',
        '[4.2%]',
        '.',
      ],
    },
  ],
};
