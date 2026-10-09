# Phase 2a report — Score check without signup

Branch: `phase-2-tailor` · Date: 2026-10-09 · Status: **ready to demo** (2b starts after your review, per CLAUDE.md)

## What was built

| Area | Delivered |
|---|---|
| Temporary storage | `STORAGE_DRIVER=disk`: uploads in a gitignored folder via HMAC-signed PUT URLs (same browser flow as R2/S3), deleted after `FILE_RETENTION_HOURS` (24). Refused in production; R2 stays an env switch. |
| ATS score (TRD §6.1) | Deterministic, no AI: must-have 40, nice-to-have 15, keyword placement 10, title 10, quantified bullets 10, format 10, sections 5. Lemmatized and alias-aware matching (JS = JavaScript, stakeholders ≈ stakeholder management as partial). Plain-language improvement notes. Server-only entry `@tailor/core/ats` (keeps a 13 MB lexicon out of the browser). |
| Job intake (PRD F4) | Paste or link. Shared `JdCache` keyed by canonical URL then text hash, so a JD is extracted once across all users. New jobs land in the tracker as Saved. Editable required / nice-to-have chips with reset. |
| URL reading | SSRF-safe fetcher: public addresses only (checked at connect time and on every redirect), size/time/redirect caps, scripts never run, Readability text. Friendly "paste instead" fallback. |
| `jd.extract` | Worker job: re-checks the cache, extracts once, shares the result, requeues once on high demand. |
| Vault match | `GET /jobs/:id/match` scores the vault against the job. |
| Anonymous check (PRD F1) | Landing "Check my ATS score": resume upload/paste + job paste/link, Cloudflare Turnstile, per-IP daily limit, fingerprint hash, result readable only with an httpOnly cookie in the same browser, 72 h expiry with cleanup of jobs and uploads. |

## Results

- Unit + integration: **249 pass** (core 101 incl. ATS 97.8% branches, api 78, ai 40, worker 13, ui 10, shared 7).
- Browser e2e: **26/26** on desktop and 375 px, including the real Turnstile widget (Cloudflare test key), a second browser being refused another visitor's result, and WCAG 2.1 AA scans on the result and job pages.
- SSRF: a live loopback server is unreachable by IP, by `localhost`, by `[::1]` and via the cloud metadata address.

## Acceptance (2a)

"Landing → ATS score without an account in < 60 s" — the flow passes end to end with the AI step stood in. **Timing with the real model is unverified: `NVIDIA_API_KEY` is still empty in `.env`.**

## To demo it yourself

1. Put `NVIDIA_API_KEY=nvapi-…` in `.env` (the line exists but is empty).
2. Install OrbStack, then `docker compose up -d && pnpm db:deploy && pnpm db:seed && pnpm dev`.
3. Open http://localhost:5173, use **Check my ATS score**.

The worker (which runs `jd.extract`) needs Redis, so step 2 is required for live extraction.

## Open questions for 2b

1. Anonymous "Tailor it" gives one free read-only optimization (PRD F1). Should it use the standard model only, or may it use premium?
2. Templates for 2b: four named in the PRD (Classic, Modern, Compact, Executive). Any brand constraints for the client's showcase templates?
