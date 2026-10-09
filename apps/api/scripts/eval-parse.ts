/**
 * Phase 1 acceptance: parse the 10 synthetic resumes with the live model and compare roles/dates
 * with ground truth.   pnpm eval:parse [--model <id>]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AiClient, MemoryRateLimiter } from '@tailor/ai';
import { detokenizeDeep, tokenizePii } from '@tailor/core';
import { AiEnv, parseEnv } from '@tailor/shared/env';
import type { VaultDraft } from '@tailor/shared';
import { loadEnv } from '../src/env.js';
import { extractResumeText } from '../src/services/extract.js';

void loadEnv; // importing ../src/env.js loads the repo .env
const { values } = parseArgs({ options: { model: { type: 'string' } } });
const env = parseEnv(AiEnv, process.env);
const ROOT = resolve(import.meta.dirname, '../../../evals/resumes');
type Truth = {
  id: string;
  name: string;
  roles: { company: string; title: string; startDate: string; endDate: string | null }[];
};
const truth = JSON.parse(readFileSync(resolve(ROOT, 'truth.json'), 'utf8')) as Truth[];
const files = readdirSync(resolve(ROOT, 'files'));

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const ai = new AiClient({
  env,
  limiter: new MemoryRateLimiter({ rpm: env.AI_RPM_LIMIT, burst: env.AI_RPM_BURST }),
});

let rolesOk = 0;
let rolesTotal = 0;
let resumesOk = 0;
for (const t of truth) {
  const file = files.find((f) => f.startsWith(t.id))!;
  const { text } = await extractResumeText(readFileSync(resolve(ROOT, 'files', file)));
  const { text: tokenized, map } = tokenizePii(text);
  const started = Date.now();
  try {
    const r = await ai.run(
      'vault.parse',
      { text: tokenized },
      values.model ? { modelOverride: values.model } : {},
    );
    const draft = detokenizeDeep(r.output, map) as VaultDraft;
    const problems: string[] = [];
    for (const want of t.roles) {
      rolesTotal++;
      const got = draft.roles.find((g) => norm(g.company) === norm(want.company));
      if (!got) problems.push(`missing ${want.company}`);
      else if (norm(got.title) !== norm(want.title))
        problems.push(`${want.company}: title "${got.title}"`);
      else if (got.startDate !== want.startDate || (got.endDate ?? null) !== want.endDate)
        problems.push(
          `${want.company}: dates ${got.startDate}..${got.endDate ?? 'present'} (want ${want.startDate}..${want.endDate ?? 'present'})`,
        );
      else rolesOk++;
    }
    if (draft.roles.length !== t.roles.length)
      problems.push(`role count ${draft.roles.length} (want ${t.roles.length})`);
    if (problems.length === 0) resumesOk++;
    console.log(
      `${problems.length ? '✗' : '✓'} ${t.id} · ${Date.now() - started} ms${r.repaired ? ' · repaired' : ''}${problems.length ? ` · ${problems.join('; ')}` : ''}`,
    );
  } catch (e) {
    rolesTotal += t.roles.length;
    console.log(`✗ ${t.id} · ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(
  `\nresumes fully correct: ${resumesOk}/${truth.length} · roles correct: ${rolesOk}/${rolesTotal}`,
);
process.exitCode = resumesOk === truth.length ? 0 : 1;
