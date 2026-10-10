import type { AtsScoreDto } from '@tailor/shared';
import { Card, CardContent, Chip, ScoreRing } from '@tailor/ui';
import { Info } from 'lucide-react';

/** Score ring + keyword chips + plain-language notes. Shared by the anonymous check and job match. */
export function ScorePanel({ ats, before }: { ats: AtsScoreDto; before?: number }) {
  const must = ats.keywords.filter((k) => k.tier === 'must');
  const nice = ats.keywords.filter((k) => k.tier === 'nice');
  const matched = must.filter((k) => k.state === 'matched').length;
  if (ats.score === null) return <NotScorable notes={ats.notes} />;
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <ScoreRing score={ats.score} before={before} size={148} />
          <p className="tabular text-sm text-muted">
            {matched} of {must.length} required keywords found
          </p>
          <p className="flex items-start gap-2 text-left text-xs text-subtle">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
            This score estimates keyword and format fit. Real ATS systems vary.
          </p>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-5">
            <KeywordGroup title="Required" items={must} />
            {nice.length ? <KeywordGroup title="Nice to have" items={nice} /> : null}
          </CardContent>
        </Card>
        {ats.notes.length ? (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <h3 className="text-base font-semibold text-text">How to improve</h3>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-text marker:text-subtle">
                {ats.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/** No skills found in the job: say so plainly instead of showing a format-only number. */
function NotScorable({ notes }: { notes: string[] }) {
  const [reason, ...rest] = notes;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-text">
          <Info aria-hidden className="size-4 text-warning" strokeWidth={1.5} />
          Not enough detail to score
        </h3>
        <p className="max-w-[65ch] text-sm text-muted">{reason}</p>
        {rest.length ? (
          <>
            <p className="text-sm font-medium text-text">Meanwhile, from your resume</p>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-text marker:text-subtle">
              {rest.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function KeywordGroup({ title, items }: { title: string; items: AtsScoreDto['keywords'] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-text">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((k) => (
          <Chip key={k.name} state={k.state}>
            {k.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}
