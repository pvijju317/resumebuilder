import { vaultStrength, type StrengthInput } from '@tailor/core';
import { Metric, VaultExtras, VaultProfile, type VaultDto } from '@tailor/shared';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

const byOrder = { orderBy: { order: 'asc' } } as const;

export const vaultInclude = {
  roles: { ...byOrder, include: { achievements: byOrder } },
  projects: { ...byOrder, include: { achievements: byOrder } },
  education: byOrder,
  certs: byOrder,
  skills: byOrder,
} satisfies Prisma.VaultInclude;

export type VaultFull = Prisma.VaultGetPayload<{ include: typeof vaultInclude }>;

type Db = PrismaClient | Prisma.TransactionClient;

export function loadVault(db: Db, where: Prisma.VaultWhereUniqueInput) {
  return db.vault.findUnique({ where, include: vaultInclude });
}

const metrics = (v: unknown) => z.array(Metric).catch([]).parse(v);

function achievementDto(a: VaultFull['roles'][number]['achievements'][number]) {
  return {
    id: a.id,
    text: a.text,
    metrics: metrics(a.metrics),
    skills: a.skills,
    impactType: a.impactType,
    hidden: a.hidden,
    confirmed: a.confirmed,
    order: a.order,
  };
}

export function toVaultDto(v: VaultFull, openGapQuestions: number): VaultDto {
  return {
    id: v.id,
    profile: VaultProfile.catch({ name: '', links: [] }).parse(v.profile),
    strength: v.strength,
    extras: VaultExtras.catch({
      languages: [],
      awards: [],
      publications: [],
      volunteering: [],
    }).parse(v.extras ?? {}),
    roles: v.roles.map((r) => ({
      id: r.id,
      company: r.company,
      title: r.title,
      location: r.location,
      startDate: r.startDate,
      endDate: r.endDate,
      type: r.type,
      teamSize: r.teamSize,
      scope: r.scope,
      hidden: r.hidden,
      order: r.order,
      achievements: r.achievements.map(achievementDto),
    })),
    projects: v.projects.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      url: p.url,
      startDate: p.startDate,
      endDate: p.endDate,
      summary: p.summary,
      hidden: p.hidden,
      order: p.order,
      achievements: p.achievements.map(achievementDto),
    })),
    education: v.education.map((e) => ({
      id: e.id,
      institution: e.institution,
      degree: e.degree,
      field: e.field,
      startDate: e.startDate,
      endDate: e.endDate,
      grade: e.grade,
      hidden: e.hidden,
      order: e.order,
    })),
    certs: v.certs.map((c) => ({
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      date: c.date,
      url: c.url,
      hidden: c.hidden,
      order: c.order,
    })),
    skills: v.skills.map((s) => ({
      id: s.id,
      name: s.name,
      key: s.key,
      category: s.category,
      proficiency: s.proficiency,
      years: s.years,
      hidden: s.hidden,
      order: s.order,
    })),
    openGapQuestions,
    updatedAt: v.updatedAt.toISOString(),
  };
}

export function toStrengthInput(v: VaultFull): StrengthInput {
  const profile = VaultProfile.catch({ name: '', links: [] }).parse(v.profile);
  const ach = (a: VaultFull['roles'][number]['achievements'][number]) => ({
    id: a.id,
    text: a.text,
    metrics: metrics(a.metrics),
    skills: a.skills,
    hidden: a.hidden,
    order: a.order,
  });
  return {
    profile,
    roles: v.roles.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      hidden: r.hidden,
      order: r.order,
      achievements: r.achievements.map(ach),
    })),
    projects: v.projects.map((p) => ({ hidden: p.hidden, achievements: p.achievements.map(ach) })),
    educationCount: v.education.filter((e) => !e.hidden).length,
    skillsCount: v.skills.filter((s) => !s.hidden).length,
  };
}

/** Recompute and store vault strength; returns the new score. */
export async function recomputeStrength(db: Db, vaultId: string): Promise<number> {
  const v = await loadVault(db, { id: vaultId });
  if (!v) return 0;
  const { score } = vaultStrength(toStrengthInput(v));
  if (score !== v.strength)
    await db.vault.update({ where: { id: vaultId }, data: { strength: score } });
  return score;
}
