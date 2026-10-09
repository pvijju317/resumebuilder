import { PlanFeatures, PublicPlan } from '@tailor/shared';
import type { PrismaClient } from '@tailor/db';

/** Active plans from the DB (admin-editable; never hardcoded). Invalid rows are skipped. */
export function createPlansService(prisma: PrismaClient) {
  return {
    async listPublic(): Promise<PublicPlan[]> {
      const rows = await prisma.plan.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
      });
      return rows.flatMap((r) => {
        const parsed = PublicPlan.safeParse({
          ...r,
          features: PlanFeatures.safeParse(r.features).data,
        });
        return parsed.success ? [parsed.data] : [];
      });
    },
  };
}
