import { AppError, ExperienceLevel, type Me, type UpdateMeBody } from '@tailor/shared';
import type { PrismaClient, User } from '@tailor/db';

export function toMe(u: User): Me {
  const level = ExperienceLevel.safeParse(u.experienceLevel);
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    regionDefault: u.regionDefault,
    targetRoles: u.targetRoles,
    experienceLevel: level.success ? level.data : null,
    onboardedAt: u.onboardedAt?.toISOString() ?? null,
    consentAt: u.consentAt?.toISOString() ?? null,
    modelImprovementOptIn: u.modelImprovementOptIn,
    createdAt: u.createdAt.toISOString(),
  };
}

export function createMeService(prisma: PrismaClient, now: () => Date = () => new Date()) {
  return {
    async get(userId: string): Promise<Me> {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      if (!u || u.deletedAt) throw new AppError('UNAUTHORIZED', 'Please sign in again.', 401);
      return toMe(u);
    },

    async update(userId: string, body: UpdateMeBody): Promise<Me> {
      const { consent, onboarded, ...fields } = body;
      const u = await prisma.user.update({
        where: { id: userId },
        data: {
          ...fields,
          ...(consent ? { consentAt: now() } : {}),
          ...(onboarded ? { onboardedAt: now() } : {}),
        },
      });
      return toMe(u);
    },
  };
}
export type MeService = ReturnType<typeof createMeService>;
