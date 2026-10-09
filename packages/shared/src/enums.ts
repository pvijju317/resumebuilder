import { z } from 'zod';

export const Region = z.enum(['IN', 'US', 'UK', 'EU']);
export type Region = z.infer<typeof Region>;

export const Role = z.enum(['USER', 'ADMIN']);
export type Role = z.infer<typeof Role>;

export const AppStatus = z.enum([
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
  'GHOSTED',
]);
export type AppStatus = z.infer<typeof AppStatus>;

export const ImpactType = z.enum([
  'revenue',
  'cost',
  'time',
  'quality',
  'scale',
  'leadership',
  'other',
]);
export type ImpactType = z.infer<typeof ImpactType>;

export const Seniority = z.enum([
  'intern',
  'entry',
  'mid',
  'senior',
  'lead',
  'manager',
  'director',
  'executive',
  'unknown',
]);
export type Seniority = z.infer<typeof Seniority>;

export const Tier = z.enum(['standard', 'premium']);
export type Tier = z.infer<typeof Tier>;

export const Tone = z.enum(['default', 'technical', 'leadership']);
export type Tone = z.infer<typeof Tone>;

export const ExperienceLevel = z.enum(['fresher', 'early', 'mid', 'senior', 'executive']);
export type ExperienceLevel = z.infer<typeof ExperienceLevel>;
