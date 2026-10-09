import { skillKey } from '@tailor/core';
import { recomputeStrength, type Prisma, type PrismaClient } from '@tailor/db';
import {
  AppError,
  VaultDraft,
  VaultProfile,
  VaultExtras,
  type VaultImportDto,
} from '@tailor/shared';
import type { FilesService } from './files.service.js';
import type { JobQueue } from './queue.js';

const SUFFIXES =
  /\b(pvt|private|ltd|limited|llp|llc|inc|corp|corporation|co|company|gmbh|plc|technologies|solutions)\b/g;
export const normalizeCompany = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ymToNum = (ym: string | null | undefined, fallback: number) => {
  if (!ym) return fallback;
  const [y, m] = ym.split('-').map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
};

/** Same company and overlapping dates (PRD F3 de-duplication suggestion). */
export function isDuplicateRole(
  a: { company: string; startDate?: string | null; endDate?: string | null },
  b: { company: string; startDate?: string | null; endDate?: string | null },
  now = new Date(),
): boolean {
  if (normalizeCompany(a.company) !== normalizeCompany(b.company)) return false;
  const nowN = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const [as, ae] = [ymToNum(a.startDate, 0), ymToNum(a.endDate, nowN)];
  const [bs, be] = [ymToNum(b.startDate, 0), ymToNum(b.endDate, nowN)];
  return as <= be && bs <= ae;
}

type Db = PrismaClient | Prisma.TransactionClient;

export function createImportsService(deps: {
  prisma: PrismaClient;
  files: FilesService;
  queue: JobQueue;
}) {
  const { prisma, files, queue } = deps;

  async function requireConsent(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { consentAt: true },
    });
    if (!user?.consentAt) {
      throw new AppError(
        'CONSENT_REQUIRED',
        'Please review and accept how we process your resume first.',
        403,
      );
    }
  }

  async function duplicates(db: Db, userId: string, draft: VaultDraft | null): Promise<number[]> {
    if (!draft) return [];
    const existing = await db.vaultRole.findMany({
      where: { vault: { userId } },
      select: { company: true, startDate: true, endDate: true },
    });
    return draft.roles.flatMap((r, i) => (existing.some((e) => isDuplicateRole(r, e)) ? [i] : []));
  }

  async function toDto(row: {
    id: string;
    userId: string;
    status: string;
    draft: unknown;
    error: string | null;
    createdAt: Date;
  }): Promise<VaultImportDto> {
    const draft = row.draft ? (VaultDraft.safeParse(row.draft).data ?? null) : null;
    return {
      id: row.id,
      status: row.status as VaultImportDto['status'],
      draft,
      error: row.error,
      duplicateRoleIndexes:
        row.status === 'ready' ? await duplicates(prisma, row.userId, draft) : [],
      createdAt: row.createdAt.toISOString(),
    };
  }

  return {
    async build(
      userId: string,
      body: { fileId: string } | { text: string },
    ): Promise<VaultImportDto> {
      await requireConsent(userId);
      const fileId = 'fileId' in body ? body.fileId : null;
      const text = fileId
        ? await files.extractText(userId, fileId)
        : (body as { text: string }).text;
      const row = await prisma.vaultImport.create({
        data: { userId, fileId, source: fileId ? 'file' : 'text', text, status: 'queued' },
      });
      await queue.enqueue({ name: 'vault.parse', data: { importId: row.id } });
      return toDto(row);
    },

    async get(userId: string, id: string): Promise<VaultImportDto> {
      const row = await prisma.vaultImport.findFirst({ where: { id, userId } });
      if (!row) throw new AppError('NOT_FOUND', 'Import not found', 404);
      return toDto(row);
    },

    async latest(userId: string): Promise<VaultImportDto | null> {
      const row = await prisma.vaultImport.findFirst({
        where: { userId, status: { not: 'confirmed' } },
        orderBy: { createdAt: 'desc' },
      });
      return row ? toDto(row) : null;
    },

    /** Write the reviewed draft into the vault as confirmed items. */
    async confirm(
      userId: string,
      id: string,
      input: { draft: VaultDraft; skipRoleIndexes: number[] },
    ) {
      const row = await prisma.vaultImport.findFirst({ where: { id, userId } });
      if (!row) throw new AppError('NOT_FOUND', 'Import not found', 404);
      if (row.status !== 'ready')
        throw new AppError('CONFLICT', 'This import is not ready to confirm.', 409);
      const draft = input.draft;
      const skip = new Set(input.skipRoleIndexes);

      const vaultId = await prisma.$transaction(async (tx) => {
        const existing = await tx.vault.findUnique({ where: { userId } });
        let vaultId: string;
        if (existing) {
          // Fill only empty profile fields; never overwrite what the user already confirmed.
          const current = VaultProfile.catch({ name: '', links: [] }).parse(existing.profile);
          const merged = {
            ...draft.profile,
            ...Object.fromEntries(
              Object.entries(current).filter(
                ([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0),
              ),
            ),
          };
          const extras = VaultExtras.catch({
            languages: [],
            awards: [],
            publications: [],
            volunteering: [],
          }).parse(existing.extras ?? {});
          const mergedExtras = {
            languages: [
              ...extras.languages,
              ...draft.extras.languages.filter(
                (l) => !extras.languages.some((x) => x.name.toLowerCase() === l.name.toLowerCase()),
              ),
            ],
            awards: [...extras.awards, ...draft.extras.awards],
            publications: [...extras.publications, ...draft.extras.publications],
            volunteering: [...extras.volunteering, ...draft.extras.volunteering],
          };
          await tx.vault.update({
            where: { id: existing.id },
            data: { profile: merged, extras: mergedExtras },
          });
          vaultId = existing.id;
        } else {
          vaultId = (
            await tx.vault.create({
              data: { userId, profile: draft.profile, extras: draft.extras },
            })
          ).id;
        }

        const base = async (
          model:
            'vaultRole' | 'vaultProject' | 'vaultEducation' | 'vaultCertification' | 'vaultSkill',
        ) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((await (tx[model] as any).aggregate({ where: { vaultId }, _max: { order: true } }))._max
            .order ?? -1) + 1;

        let order = await base('vaultRole');
        for (const [i, r] of draft.roles.entries()) {
          if (skip.has(i) || !r.startDate) continue;
          await tx.vaultRole.create({
            data: {
              vaultId,
              company: r.company,
              title: r.title,
              location: r.location ?? null,
              startDate: r.startDate,
              endDate: r.endDate ?? null,
              type: r.type ?? null,
              teamSize: r.teamSize ?? null,
              scope: r.scope ?? null,
              confirmed: true,
              order: order++,
              achievements: {
                create: r.achievements.map((a, j) => ({
                  text: a.text,
                  metrics: a.metrics,
                  skills: a.skills.map((s) => skillKey(s)),
                  impactType: a.impactType,
                  confirmed: true,
                  source: 'parse',
                  order: j,
                })),
              },
            },
          });
        }
        order = await base('vaultProject');
        for (const p of draft.projects) {
          await tx.vaultProject.create({
            data: {
              vaultId,
              name: p.name,
              role: p.role ?? null,
              url: p.url ?? null,
              startDate: p.startDate ?? null,
              endDate: p.endDate ?? null,
              summary: p.summary ?? null,
              confirmed: true,
              order: order++,
              achievements: {
                create: p.achievements.map((a, j) => ({
                  text: a.text,
                  metrics: a.metrics,
                  skills: a.skills.map((s) => skillKey(s)),
                  impactType: a.impactType,
                  confirmed: true,
                  source: 'parse',
                  order: j,
                })),
              },
            },
          });
        }
        order = await base('vaultEducation');
        for (const e of draft.education) {
          await tx.vaultEducation.create({
            data: {
              vaultId,
              institution: e.institution,
              degree: e.degree ?? null,
              field: e.field ?? null,
              startDate: e.startDate ?? null,
              endDate: e.endDate ?? null,
              grade: e.grade ?? null,
              confirmed: true,
              order: order++,
            },
          });
        }
        order = await base('vaultCertification');
        for (const c of draft.certifications) {
          await tx.vaultCertification.create({
            data: {
              vaultId,
              name: c.name,
              issuer: c.issuer ?? null,
              date: c.date ?? null,
              url: c.url ?? null,
              confirmed: true,
              order: order++,
            },
          });
        }
        order = await base('vaultSkill');
        for (const s of draft.skills) {
          const key = skillKey(s.name);
          await tx.vaultSkill.upsert({
            where: { vaultId_key: { vaultId, key } },
            create: {
              vaultId,
              name: s.name,
              key,
              category: s.category ?? null,
              proficiency: s.proficiency ?? null,
              years: s.years ?? null,
              order: order++,
            },
            update: {},
          });
        }
        await tx.vaultImport.update({
          where: { id: row.id },
          data: { status: 'confirmed', confirmedAt: new Date(), draft },
        });
        await recomputeStrength(tx, vaultId);
        return vaultId;
      });

      await queue.enqueue({ name: 'vault.gapQuestions', data: { vaultId, userId } });
      return { vaultId };
    },
  };
}
export type ImportsService = ReturnType<typeof createImportsService>;
