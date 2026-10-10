import { ChevronDown } from 'lucide-react';
import { Reveal } from './reveal.js';

const FAQ: [string, string][] = [
  [
    'Will it make things up about me?',
    'No. Every number, employer, title and date in a tailored resume is checked against your vault by code. Anything not found is reverted, and missing details become questions for you.',
  ],
  [
    'What is an ATS score?',
    'An estimate of how well your resume matches a job’s keywords and how cleanly it parses. Real applicant tracking systems vary, so treat it as a guide, not a guarantee.',
  ],
  [
    'Is my data used to train AI models?',
    'Not unless you opt in, and the option is off by default. Contact details are removed before any AI step. Export and deletion of your data are coming to Settings before launch.',
  ],
  [
    'I am a fresher. Will this work for me?',
    'Yes. The vault asks about projects, internships and coursework, and turns your answers into specific, quantified achievements.',
  ],
  [
    'Does the extension submit applications for me?',
    'Never. It fills in standard fields and drafts answers for you to review. You always press submit yourself.',
  ],
  [
    'Which countries are supported?',
    'India, the United States, the United Kingdom and Europe. Each has its own format for length, photo, personal details, spelling and dates.',
  ],
];

/** Accordion on native <details> (keyboard and screen-reader support built in). */
export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="grid scroll-mt-24 gap-10 py-20 md:grid-cols-[1fr_1.6fr] md:py-28"
    >
      <Reveal>
        <h2 id="faq-title" className="text-xl font-semibold tracking-tight text-text md:text-2xl">
          Questions, answered.
        </h2>
      </Reveal>
      <Reveal delay={80}>
        <div className="divide-y divide-border border-y border-border">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-medium text-text [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown
                  aria-hidden
                  className="size-5 shrink-0 text-subtle transition-transform duration-200 group-open:rotate-180"
                  strokeWidth={1.5}
                />
              </summary>
              <p className="max-w-[65ch] pb-5 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
