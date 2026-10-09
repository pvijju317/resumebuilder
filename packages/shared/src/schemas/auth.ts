import { z } from 'zod';
import { ExperienceLevel, Region, Role } from '../enums.js';

export const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const OtpRequestBody = z.object({ email: Email });
export const OtpVerifyBody = z.object({
  email: Email,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const AuthTokens = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
});
export type AuthTokens = z.infer<typeof AuthTokens>;

export const Me = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: Role,
  regionDefault: Region,
  targetRoles: z.array(z.string()),
  experienceLevel: ExperienceLevel.nullable(),
  onboardedAt: z.string().nullable(),
  consentAt: z.string().nullable(),
  modelImprovementOptIn: z.boolean(),
  createdAt: z.string(),
});
export type Me = z.infer<typeof Me>;

export const UpdateMeBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    regionDefault: Region,
    targetRoles: z.array(z.string().trim().min(1).max(120)).max(5),
    experienceLevel: ExperienceLevel,
    modelImprovementOptIn: z.boolean(),
    consent: z.literal(true),
    onboarded: z.literal(true),
  })
  .partial();
export type UpdateMeBody = z.infer<typeof UpdateMeBody>;
