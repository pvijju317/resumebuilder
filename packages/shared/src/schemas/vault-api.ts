import { z } from 'zod';
import { ImpactType } from '../enums.js';
import { YearMonth } from './common.js';
import { Link, Metric, VaultDraft, VaultExtras, VaultProfile } from './vault.js';

// ---------- Files ----------

export const RESUME_MIME = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
} as const;
export type ResumeMime = keyof typeof RESUME_MIME;

export const UploadUrlBody = z.object({
  fileName: z.string().trim().min(1).max(200),
  mime: z.enum(Object.keys(RESUME_MIME) as [ResumeMime, ...ResumeMime[]], {
    message: 'Upload a PDF, DOCX or TXT file',
  }),
  size: z.number().int().positive(),
});

export const UploadUrlResponse = z.object({
  fileId: z.string(),
  url: z.string(),
  headers: z.record(z.string(), z.string()),
  expiresIn: z.number().int(),
});
export type UploadUrlResponse = z.infer<typeof UploadUrlResponse>;

// ---------- Import (parse → review → confirm) ----------

export const VaultBuildBody = z.union([
  z.object({ fileId: z.string().min(1) }),
  z.object({
    text: z.string().trim().min(200, 'Paste your full resume (at least a few lines)').max(60_000),
  }),
]);

export const ImportStatus = z.enum(['queued', 'parsing', 'ready', 'failed', 'confirmed']);

export const VaultImportDto = z.object({
  id: z.string(),
  status: ImportStatus,
  draft: VaultDraft.nullable(),
  error: z.string().nullable(),
  /** Indexes of draft roles that look like roles already in the vault (same company, overlapping dates). */
  duplicateRoleIndexes: z.array(z.number().int()),
  createdAt: z.string(),
});
export type VaultImportDto = z.infer<typeof VaultImportDto>;

export const ConfirmImportBody = z.object({
  draft: VaultDraft,
  skipRoleIndexes: z.array(z.number().int().min(0)).default([]),
});

// ---------- Vault entities ----------

export const AchievementDto = z.object({
  id: z.string(),
  text: z.string(),
  metrics: z.array(Metric),
  skills: z.array(z.string()),
  impactType: z.array(z.string()),
  hidden: z.boolean(),
  confirmed: z.boolean(),
  order: z.number().int(),
});
export type AchievementDto = z.infer<typeof AchievementDto>;

export const RoleDto = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  type: z.string().nullable(),
  teamSize: z.number().int().nullable(),
  scope: z.string().nullable(),
  hidden: z.boolean(),
  order: z.number().int(),
  achievements: z.array(AchievementDto),
});
export type RoleDto = z.infer<typeof RoleDto>;

export const ProjectDto = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  url: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  summary: z.string().nullable(),
  hidden: z.boolean(),
  order: z.number().int(),
  achievements: z.array(AchievementDto),
});
export type ProjectDto = z.infer<typeof ProjectDto>;

export const EducationDto = z.object({
  id: z.string(),
  institution: z.string(),
  degree: z.string().nullable(),
  field: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  grade: z.string().nullable(),
  hidden: z.boolean(),
  order: z.number().int(),
});
export type EducationDto = z.infer<typeof EducationDto>;

export const CertDto = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string().nullable(),
  date: z.string().nullable(),
  url: z.string().nullable(),
  hidden: z.boolean(),
  order: z.number().int(),
});
export type CertDto = z.infer<typeof CertDto>;

export const SkillDto = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
  category: z.string().nullable(),
  proficiency: z.string().nullable(),
  years: z.number().nullable(),
  hidden: z.boolean(),
  order: z.number().int(),
});
export type SkillDto = z.infer<typeof SkillDto>;

export const VaultDto = z.object({
  id: z.string(),
  profile: VaultProfile,
  strength: z.number().int(),
  extras: VaultExtras,
  roles: z.array(RoleDto),
  projects: z.array(ProjectDto),
  education: z.array(EducationDto),
  certs: z.array(CertDto),
  skills: z.array(SkillDto),
  openGapQuestions: z.number().int(),
  updatedAt: z.string(),
});
export type VaultDto = z.infer<typeof VaultDto>;

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

export const RoleBody = z.object({
  company: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  location: nullableText(120),
  startDate: YearMonth,
  endDate: YearMonth.nullable().optional(),
  type: nullableText(40),
  teamSize: z.number().int().positive().nullable().optional(),
  scope: nullableText(500),
  hidden: z.boolean().optional(),
});
export const RolePatch = RoleBody.partial();

export const AchievementBody = z
  .object({
    roleId: z.string().optional(),
    projectId: z.string().optional(),
    text: z.string().trim().min(3).max(600),
    metrics: z.array(Metric).max(10).default([]),
    skills: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    impactType: z.array(ImpactType).default([]),
    hidden: z.boolean().optional(),
  })
  .refine((a) => Boolean(a.roleId) !== Boolean(a.projectId), {
    message: 'An achievement belongs to exactly one role or project',
  });
export const AchievementPatch = z.object({
  text: z.string().trim().min(3).max(600).optional(),
  metrics: z.array(Metric).max(10).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  impactType: z.array(ImpactType).optional(),
  hidden: z.boolean().optional(),
});

export const ProjectBody = z.object({
  name: z.string().trim().min(1).max(200),
  role: nullableText(200),
  url: nullableText(500),
  startDate: YearMonth.nullable().optional(),
  endDate: YearMonth.nullable().optional(),
  summary: nullableText(600),
  hidden: z.boolean().optional(),
});
export const ProjectPatch = ProjectBody.partial();

export const EducationBody = z.object({
  institution: z.string().trim().min(1).max(200),
  degree: nullableText(200),
  field: nullableText(200),
  startDate: YearMonth.nullable().optional(),
  endDate: YearMonth.nullable().optional(),
  grade: nullableText(60),
  hidden: z.boolean().optional(),
});
export const EducationPatch = EducationBody.partial();

export const CertBody = z.object({
  name: z.string().trim().min(1).max(200),
  issuer: nullableText(200),
  date: YearMonth.nullable().optional(),
  url: nullableText(500),
  hidden: z.boolean().optional(),
});
export const CertPatch = CertBody.partial();

export const SkillBody = z.object({
  name: z.string().trim().min(1).max(80),
  category: nullableText(60),
  proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).nullable().optional(),
  years: z.number().min(0).max(60).nullable().optional(),
  hidden: z.boolean().optional(),
});
export const SkillPatch = SkillBody.partial();

export const ProfilePatch = VaultProfile.partial().extend({
  links: z.array(Link).max(6).optional(),
});

export const ReorderBody = z.object({
  kind: z.enum(['roles', 'projects', 'education', 'certs', 'skills', 'achievements']),
  /** For achievements: the role or project whose achievements are being ordered. */
  parentId: z.string().optional(),
  ids: z.array(z.string()).min(1).max(200),
});

// ---------- Gap questions ----------

export const GapQuestionDto = z.object({
  id: z.string(),
  achievementId: z.string(),
  achievementText: z.string(),
  question: z.string(),
  expectedUnit: z.string().nullable(),
  status: z.enum(['open', 'answered', 'skipped']),
});
export type GapQuestionDto = z.infer<typeof GapQuestionDto>;

export const GapAnswersBody = z.object({
  answers: z
    .array(
      z.union([
        z.object({ questionId: z.string(), answer: z.string().trim().min(1).max(300) }),
        z.object({ questionId: z.string(), skip: z.literal(true) }),
      ]),
    )
    .min(1)
    .max(8),
});
