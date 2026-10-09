import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Chip } from '../src/components/chip.js';
import { Field, Input } from '../src/components/field.js';
import { OPTIMIZE_STEPS, ProgressSteps } from '../src/components/progress-steps.js';
import { ScoreRing, scoreTone } from '../src/components/score-ring.js';
import { StrengthMeter } from '../src/components/strength-meter.js';

afterEach(cleanup);

describe('ScoreRing', () => {
  it('describes the score and delta for screen readers', () => {
    render(<ScoreRing score={78} before={56} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'ATS score 78 out of 100, up 22 from 56',
    );
  });

  it('clamps values and handles decreases', () => {
    render(<ScoreRing score={140} before={-5} label="Match" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Match 100 out of 100, up 100 from 0',
    );
    cleanup();
    render(<ScoreRing score={40} before={60} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/down 20 from 60/);
  });

  it('maps scores to tones', () => {
    expect([scoreTone(30), scoreTone(60), scoreTone(80)]).toEqual(['danger', 'warning', 'success']);
  });
});

describe('Chip', () => {
  it('conveys state in text, not only colour', () => {
    render(<Chip state="missing">Kubernetes</Chip>);
    expect(screen.getByText('(missing)')).toBeTruthy();
  });
});

describe('Field', () => {
  it('wires label, hint and error to the control', () => {
    render(
      <Field label="Email" hint="We'll send a code" error="Enter a valid email">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)?.textContent).toBe('Enter a valid email');
    expect(screen.queryByText("We'll send a code")).toBeNull();
  });
});

describe('ProgressSteps', () => {
  it('marks done/active/pending steps and announces the active one', () => {
    render(<ProgressSteps steps={OPTIMIZE_STEPS} current="checking" />);
    const done = screen
      .getAllByText('(done)', { exact: false })
      .map((el) => el.closest('li')?.textContent);
    expect(done).toEqual([
      expect.stringContaining('Selecting'),
      expect.stringContaining('Rewriting'),
    ]);
    expect(screen.getByText('Checking facts…')).toBeTruthy();
    expect(
      screen.getByText('(in progress)', { exact: false }).closest('li')?.textContent,
    ).toContain('Checking facts');
  });

  it('announces completion', () => {
    render(<ProgressSteps steps={OPTIMIZE_STEPS} current="done" />);
    expect(screen.getByText('Finished')).toBeTruthy();
  });
});

describe('StrengthMeter', () => {
  it('exposes a meter with the value', () => {
    render(<StrengthMeter value={62} />);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('62');
  });
});
