import { config } from 'dotenv';
import { resolve } from 'node:path';
import aliases from '@tailor/core/data/skill-aliases.json' with { type: 'json' };
import { normalizeSkillText } from '@tailor/core';
import { createPrisma } from './client.js';
import { MODEL_PRICE_SEEDS, PLAN_SEEDS } from './seed-data.js';

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');
const prisma = createPrisma(url);

async function main() {
  for (const p of PLAN_SEEDS) {
    // Seed creates plans once; existing rows are admin-owned and left untouched.
    await prisma.plan.upsert({ where: { id: p.id }, create: { ...p, active: true }, update: {} });
  }

  const rows = Object.entries(aliases as Record<string, string[]>).flatMap(([canonical, list]) =>
    [canonical, ...list].map((alias) => ({
      alias: normalizeSkillText(alias),
      canonical: normalizeSkillText(canonical),
    })),
  );
  await prisma.skillAlias.createMany({ data: rows, skipDuplicates: true });

  for (const m of MODEL_PRICE_SEEDS) {
    await prisma.aiModelPrice.upsert({
      where: { provider_model: { provider: m.provider, model: m.model } },
      create: m,
      update: {},
    });
  }

  const adminEmail = process.env['ADMIN_EMAIL']?.toLowerCase();
  if (adminEmail) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      create: { email: adminEmail, role: 'ADMIN', name: 'Admin' },
      update: { role: 'ADMIN' },
    });
  }

  console.log(
    `seeded: ${PLAN_SEEDS.length} plans, ${rows.length} skill aliases, ${MODEL_PRICE_SEEDS.length} model prices${adminEmail ? `, admin ${adminEmail}` : ''}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
