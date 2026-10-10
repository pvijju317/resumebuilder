import { atsScore, type AtsJob, type AtsResume } from '@tailor/core/ats';
import type { VaultFull } from '@tailor/db';
import { JobExtraction, JobOverrides, type AtsScoreDto } from '@tailor/shared';

/** Extraction with the user's chip edits applied. */
export function effectiveExtraction(extracted: unknown, overrides: unknown): JobExtraction | null {
  const e = JobExtraction.safeParse(extracted);
  if (!e.success) return null;
  const o = JobOverrides.safeParse(overrides ?? {});
  return o.success ? { ...e.data, ...o.data } : e.data;
}

/**
 * Informal posts (often LinkedIn) name skills without saying "required", so extraction files them
 * under `keywords`. With no required list, those keywords are what the job asks for.
 */
export function toAtsJob(e: JobExtraction): AtsJob {
  const mustHave = e.mustHave.length ? e.mustHave : e.keywords;
  return { title: e.title, mustHave, niceToHave: e.niceToHave };
}

/** The vault seen as a resume (all visible confirmed items), for the match score. */
export function vaultToAtsResume(v: VaultFull): AtsResume {
  const profile = (v.profile ?? {}) as {
    headline?: string | null;
    summary?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  const roles = v.roles.filter((r) => !r.hidden);
  const recent = [...roles].sort(
    (a, b) =>
      (b.endDate ?? '9999').localeCompare(a.endDate ?? '9999') ||
      b.startDate.localeCompare(a.startDate),
  )[0];
  const bullets = [
    ...roles.flatMap((r) => r.achievements),
    ...v.projects.filter((p) => !p.hidden).flatMap((p) => p.achievements),
  ]
    .filter((a) => !a.hidden)
    .map((a) => a.text);
  const skills = v.skills.filter((s) => !s.hidden).map((s) => s.name);
  const education = v.education.filter((e) => !e.hidden);
  const fullText = [
    profile.headline,
    profile.summary,
    ...roles.map((r) => `${r.title} ${r.company} ${r.scope ?? ''}`),
    ...bullets,
    ...education.map((e) => [e.degree, e.field, e.institution].filter(Boolean).join(' ')),
    ...v.certs.filter((c) => !c.hidden).map((c) => c.name),
    ...skills,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    headline: profile.headline ?? null,
    recentTitle: recent?.title ?? null,
    summary: profile.summary ?? profile.headline ?? null,
    bullets,
    skills,
    fullText,
    // Tailor's templates always produce these sections in an ATS-safe, single-column layout.
    sections: {
      summary: !!(profile.summary || profile.headline),
      experience: roles.length > 0,
      education: education.length > 0,
      skills: skills.length > 0,
    },
    format: {
      singleColumn: true,
      standardHeadings: true,
      readableDates: true,
      contactPresent: !!(profile.email || profile.phone),
      noTables: true,
    },
  };
}

export function scoreDto(resume: AtsResume, job: JobExtraction): AtsScoreDto {
  const s = atsScore(resume, toAtsJob(job));
  return { score: s.score, parts: s.parts, keywords: s.keywords, notes: s.notes };
}
