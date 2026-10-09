import { detokenizeDeep, selectGapCandidates, tokenizePii } from '@tailor/core';
import { loadVault, toStrengthInput, type PrismaClient } from '@tailor/db';
import { AppError, VaultDraft } from '@tailor/shared';
import type { AiClient } from '@tailor/ai';

export interface VaultJobDeps {
  prisma: PrismaClient;
  ai: Pick<AiClient, 'run'>;
}

/** Called when a job should be retried once later (AI high demand). */
export type Requeue = (delayMs: number) => Promise<void>;

export const PARSE_FAILED_MESSAGE =
  'We could not read your resume this time. Try again, or paste the text instead.';

/**
 * Contact details never need AI: fill empty profile fields straight from the PII map, so a model
 * that drops a token cannot lose the user's email or phone.
 */
export function fillContacts(draft: VaultDraft, map: Record<string, string>): VaultDraft {
  const first = (kind: string) =>
    Object.entries(map).find(([t]) => t.startsWith(`{{${kind}_`))?.[1];
  const profile = { ...draft.profile };
  profile.email ||= first('EMAIL') ?? null;
  profile.phone ||= first('PHONE') ?? null;
  const urls = Object.entries(map)
    .filter(([t]) => t.startsWith('{{URL_'))
    .map(([, u]) => u);
  const links = [...profile.links];
  for (const url of urls) {
    if (links.some((l) => l.url === url)) continue;
    const kind = /linkedin\.com/i.test(url)
      ? 'linkedin'
      : /github\.com|gitlab\.com/i.test(url)
        ? 'github'
        : 'portfolio';
    links.push({ kind, url });
  }
  return { ...draft, profile: { ...profile, links: links.slice(0, 6) } };
}

export async function runVaultParse(
  deps: VaultJobDeps,
  importId: string,
  requeue: Requeue,
  alreadyRequeued: boolean,
) {
  const { prisma, ai } = deps;
  const row = await prisma.vaultImport.findUnique({ where: { id: importId } });
  // Idempotent: only queued imports are processed (a retry after success is a no-op).
  if (!row || row.status !== 'queued') return { skipped: true };
  await prisma.vaultImport.update({ where: { id: importId }, data: { status: 'parsing' } });

  const { text, map } = tokenizePii(row.text);
  try {
    const r = await ai.run('vault.parse', { text }, { userId: row.userId, refId: importId });
    const draft = VaultDraft.parse(fillContacts(detokenizeDeep(r.output, map), map));
    await prisma.vaultImport.update({
      where: { id: importId },
      data: { status: 'ready', draft, model: r.model, error: null },
    });
    return { status: 'ready' as const };
  } catch (e) {
    if (e instanceof AppError && e.code === 'AI_UNAVAILABLE' && !alreadyRequeued) {
      await prisma.vaultImport.update({ where: { id: importId }, data: { status: 'queued' } });
      await requeue(30_000);
      return { status: 'requeued' as const };
    }
    await prisma.vaultImport.update({
      where: { id: importId },
      data: { status: 'failed', error: PARSE_FAILED_MESSAGE },
    });
    return { status: 'failed' as const, error: e };
  }
}

export async function runGapQuestions(
  deps: VaultJobDeps,
  data: { vaultId: string; userId: string },
) {
  const { prisma, ai } = deps;
  const v = await loadVault(prisma, { id: data.vaultId });
  if (!v) return { created: 0 };
  const candidates = selectGapCandidates(toStrengthInput(v), 8);
  // Answered/skipped questions are kept as history; open ones are replaced.
  if (candidates.length === 0) {
    await prisma.vaultGapQuestion.deleteMany({ where: { vaultId: v.id, status: 'open' } });
    return { created: 0 };
  }
  const tokenized = candidates.map((a) => ({
    id: a.id,
    text: tokenizePii(a.text).text,
    metrics: a.metrics,
  }));
  const r = await ai.run(
    'vault.gapQuestions',
    { achievements: tokenized, maxQuestions: 8 },
    { userId: data.userId, refId: v.id },
  );

  const allowed = new Set(candidates.map((c) => c.id));
  const seen = new Set<string>();
  const questions = r.output.questions.filter((q) => {
    if (!allowed.has(q.achievementId) || seen.has(q.achievementId)) return false;
    seen.add(q.achievementId);
    return true;
  });
  await prisma.$transaction([
    prisma.vaultGapQuestion.deleteMany({ where: { vaultId: v.id, status: 'open' } }),
    prisma.vaultGapQuestion.createMany({
      data: questions.map((q) => ({
        vaultId: v.id,
        achievementId: q.achievementId,
        question: q.question,
        expectedUnit: q.expectedUnit ?? null,
      })),
    }),
  ]);
  return { created: questions.length };
}
