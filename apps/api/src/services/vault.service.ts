import { answerToMetrics, skillKey } from '@tailor/core';
import {
  loadVault,
  recomputeStrength,
  toVaultDto,
  type Prisma,
  type PrismaClient,
} from '@tailor/db';
import { AppError, Metric, type GapQuestionDto, type VaultDto } from '@tailor/shared';
import { z } from 'zod';
import type { JobQueue } from './queue.js';

type Simple = 'role' | 'project' | 'education' | 'cert' | 'skill';
const MODEL = {
  role: 'vaultRole',
  project: 'vaultProject',
  education: 'vaultEducation',
  cert: 'vaultCertification',
  skill: 'vaultSkill',
} as const;
const REORDER_MODEL = {
  roles: 'vaultRole',
  projects: 'vaultProject',
  education: 'vaultEducation',
  certs: 'vaultCertification',
  skills: 'vaultSkill',
} as const;

const notFound = () => new AppError('NOT_FOUND', 'Not found', 404);

export function createVaultService(deps: { prisma: PrismaClient; queue: JobQueue }) {
  const { prisma, queue } = deps;
  // Dynamic model access for the five structurally similar vault tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (m: string) => (prisma as any)[m];

  async function vaultIdOf(userId: string): Promise<string> {
    const v = await prisma.vault.findUnique({ where: { userId }, select: { id: true } });
    if (!v) throw new AppError('NOT_FOUND', 'Build your vault first.', 404);
    return v.id;
  }

  async function dto(vaultId: string): Promise<VaultDto> {
    const v = await loadVault(prisma, { id: vaultId });
    if (!v) throw notFound();
    const open = await prisma.vaultGapQuestion.count({ where: { vaultId, status: 'open' } });
    return toVaultDto(v, open);
  }

  async function changed(vaultId: string) {
    await recomputeStrength(prisma, vaultId);
    return dto(vaultId);
  }

  /** Achievement ownership: it must hang off a role or project in this user's vault. */
  async function ownedAchievement(vaultId: string, id: string) {
    const a = await prisma.vaultAchievement.findFirst({
      where: { id, OR: [{ role: { vaultId } }, { project: { vaultId } }] },
    });
    if (!a) throw notFound();
    return a;
  }

  return {
    async get(userId: string): Promise<VaultDto | null> {
      const v = await prisma.vault.findUnique({ where: { userId }, select: { id: true } });
      return v ? dto(v.id) : null;
    },

    async patchProfile(userId: string, patch: Record<string, unknown>) {
      const vaultId = await vaultIdOf(userId);
      const v = await prisma.vault.findUniqueOrThrow({ where: { id: vaultId } });
      await prisma.vault.update({
        where: { id: vaultId },
        data: { profile: { ...(v.profile as object), ...patch } as Prisma.InputJsonObject },
      });
      return changed(vaultId);
    },

    async create(userId: string, kind: Simple, data: Record<string, unknown>) {
      const vaultId = await vaultIdOf(userId);
      const m = MODEL[kind];
      const max = await table(m).aggregate({ where: { vaultId }, _max: { order: true } });
      const extra = kind === 'skill' ? { key: skillKey(String(data['name'])) } : {};
      if (
        kind === 'skill' &&
        (await prisma.vaultSkill.findFirst({ where: { vaultId, key: extra.key } }))
      ) {
        throw new AppError('CONFLICT', 'That skill is already in your vault.', 409);
      }
      await table(m).create({
        data: {
          ...data,
          ...extra,
          vaultId,
          order: (max._max.order ?? -1) + 1,
          ...(kind === 'skill' ? {} : { confirmed: true }),
        },
      });
      return changed(vaultId);
    },

    async update(userId: string, kind: Simple, id: string, data: Record<string, unknown>) {
      const vaultId = await vaultIdOf(userId);
      const m = MODEL[kind];
      const row = await table(m).findFirst({ where: { id, vaultId } });
      if (!row) throw notFound();
      const extra =
        kind === 'skill' && typeof data['name'] === 'string' ? { key: skillKey(data['name']) } : {};
      await table(m).update({ where: { id }, data: { ...data, ...extra } });
      return changed(vaultId);
    },

    async remove(userId: string, kind: Simple, id: string) {
      const vaultId = await vaultIdOf(userId);
      const res = await table(MODEL[kind]).deleteMany({ where: { id, vaultId } });
      if (res.count === 0) throw notFound();
      return changed(vaultId);
    },

    async createAchievement(
      userId: string,
      data: {
        roleId?: string;
        projectId?: string;
        text: string;
        metrics: z.infer<typeof Metric>[];
        skills: string[];
        impactType: string[];
        hidden?: boolean;
      },
    ) {
      const vaultId = await vaultIdOf(userId);
      const parent = data.roleId
        ? await prisma.vaultRole.findFirst({ where: { id: data.roleId, vaultId } })
        : await prisma.vaultProject.findFirst({ where: { id: data.projectId!, vaultId } });
      if (!parent) throw notFound();
      const where = data.roleId ? { roleId: data.roleId } : { projectId: data.projectId! };
      const max = await prisma.vaultAchievement.aggregate({ where, _max: { order: true } });
      await prisma.vaultAchievement.create({
        data: {
          ...where,
          text: data.text,
          metrics: data.metrics,
          skills: data.skills.map((s) => skillKey(s)),
          impactType: data.impactType,
          hidden: data.hidden ?? false,
          confirmed: true,
          source: 'manual',
          order: (max._max.order ?? -1) + 1,
        },
      });
      return changed(vaultId);
    },

    async updateAchievement(
      userId: string,
      id: string,
      data: {
        text?: string;
        metrics?: z.infer<typeof Metric>[];
        skills?: string[];
        impactType?: string[];
        hidden?: boolean;
      },
    ) {
      const vaultId = await vaultIdOf(userId);
      await ownedAchievement(vaultId, id);
      const { metrics, skills, ...rest } = data;
      await prisma.vaultAchievement.update({
        where: { id },
        data: {
          ...rest,
          ...(skills ? { skills: skills.map((s) => skillKey(s)) } : {}),
          ...(metrics ? { metrics } : {}),
          source: 'editor',
        },
      });
      return changed(vaultId);
    },

    async removeAchievement(userId: string, id: string) {
      const vaultId = await vaultIdOf(userId);
      await ownedAchievement(vaultId, id);
      await prisma.vaultAchievement.delete({ where: { id } });
      await prisma.vaultGapQuestion.deleteMany({ where: { vaultId, achievementId: id } });
      return changed(vaultId);
    },

    /** `ids` is the complete new order; every id must belong to the same scope. */
    async reorder(
      userId: string,
      body: { kind: keyof typeof REORDER_MODEL | 'achievements'; parentId?: string; ids: string[] },
    ) {
      const vaultId = await vaultIdOf(userId);
      if (new Set(body.ids).size !== body.ids.length)
        throw new AppError('VALIDATION', 'Duplicate ids', 400);
      if (body.kind === 'achievements') {
        if (!body.parentId)
          throw new AppError('VALIDATION', 'parentId is required for achievements', 400);
        const rows = await prisma.vaultAchievement.findMany({
          where: {
            OR: [
              { roleId: body.parentId, role: { vaultId } },
              { projectId: body.parentId, project: { vaultId } },
            ],
          },
          select: { id: true },
        });
        if (rows.length !== body.ids.length || !rows.every((r) => body.ids.includes(r.id)))
          throw new AppError('VALIDATION', 'Order must list every item once', 400);
        await prisma.$transaction(
          body.ids.map((id, order) =>
            prisma.vaultAchievement.update({ where: { id }, data: { order } }),
          ),
        );
      } else {
        const m = REORDER_MODEL[body.kind];
        const rows: { id: string }[] = await table(m).findMany({
          where: { vaultId },
          select: { id: true },
        });
        if (rows.length !== body.ids.length || !rows.every((r) => body.ids.includes(r.id)))
          throw new AppError('VALIDATION', 'Order must list every item once', 400);
        await prisma.$transaction(
          body.ids.map((id, order) => table(m).update({ where: { id }, data: { order } })),
        );
      }
      return dto(vaultId);
    },

    // ---------- Gap questions ----------

    async gapQuestions(userId: string): Promise<GapQuestionDto[]> {
      const vaultId = await vaultIdOf(userId);
      const qs = await prisma.vaultGapQuestion.findMany({
        where: { vaultId, status: 'open' },
        orderBy: { createdAt: 'asc' },
      });
      const ach = await prisma.vaultAchievement.findMany({
        where: { id: { in: qs.map((q) => q.achievementId) } },
        select: { id: true, text: true },
      });
      return qs.flatMap((q) => {
        const a = ach.find((x) => x.id === q.achievementId);
        return a
          ? [
              {
                id: q.id,
                achievementId: q.achievementId,
                achievementText: a.text,
                question: q.question,
                expectedUnit: q.expectedUnit,
                status: 'open' as const,
              },
            ]
          : [];
      });
    },

    async refreshGapQuestions(userId: string) {
      const vaultId = await vaultIdOf(userId);
      await prisma.vault.update({
        where: { id: vaultId },
        data: { gapQuestionsRequestedAt: new Date() },
      });
      await queue.enqueue({ name: 'vault.gapQuestions', data: { vaultId, userId } });
    },

    /** Answers become metrics on the achievement (PRD F3); parsing is deterministic. */
    async answerGapQuestions(
      userId: string,
      answers: ({ questionId: string; answer: string } | { questionId: string; skip: true })[],
    ) {
      const vaultId = await vaultIdOf(userId);
      let added = 0;
      for (const a of answers) {
        const q = await prisma.vaultGapQuestion.findFirst({
          where: { id: a.questionId, vaultId, status: 'open' },
        });
        if (!q) throw notFound();
        if ('skip' in a) {
          await prisma.vaultGapQuestion.update({
            where: { id: q.id },
            data: { status: 'skipped' },
          });
          continue;
        }
        const ach = await ownedAchievement(vaultId, q.achievementId);
        const fresh = answerToMetrics(a.answer, {
          context: q.question,
          expectedUnit: q.expectedUnit,
        });
        const current = z.array(Metric).catch([]).parse(ach.metrics);
        await prisma.$transaction([
          prisma.vaultAchievement.update({
            where: { id: ach.id },
            data: { metrics: [...current, ...fresh].slice(0, 10) },
          }),
          prisma.vaultGapQuestion.update({
            where: { id: q.id },
            data: { status: 'answered', answer: a.answer },
          }),
        ]);
        added += fresh.length;
      }
      return { metricsAdded: added, vault: await changed(vaultId) };
    },
  };
}
export type VaultService = ReturnType<typeof createVaultService>;
