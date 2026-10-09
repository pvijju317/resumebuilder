# Phase 1 report — Career Vault

Branch: `phase-1-career-vault` (from `main` after Phase 0 sign-off) · Date: 2026-10-09 · Status: **awaiting sign-off** (live-parse acceptance blocked on the NVIDIA key)

## What was built

| Area | Delivered |
|---|---|
| Storage | S3-compatible storage service (Cloudflare R2 by decision), presigned PUT bound to content type and length, `UploadedFile` tracking. Configured purely by env (`S3_*`). |
| Text extraction | pdfjs-dist 6 (positions → lines, two-column gutter detection so sidebars don't interleave), mammoth for DOCX, TXT. File type sniffed from bytes; 5 MB / 10 page / scanned-PDF guards with friendly errors. |
| PII | `tokenizePii` / `detokenizeDeep` in `packages/core`: email, phone (≥ 10 digits; keeps years and metrics), URLs, address lines (IN PIN, US ZIP, UK postcode). Reversible. Applied before every AI call. |
| `vault.parse` | API creates a `VaultImport` and queues a job; worker tokenizes → AI → restores PII → fills email/phone/links from the token map (never trusts the model for contacts) → stores the draft. Requeues once on high demand, else fails with a friendly message. Idempotent. |
| Review | Profile, roles (month pickers, "I work here now"), achievements with metric chips, low-confidence flags (< 0.7), duplicate-role detection (same normalized company + overlapping dates) with skip, skills chips. Nothing is saved until **Confirm**. |
| Confirm | Transactional merge into the vault: confirmed items, skill keys alias-normalized and de-duplicated, existing confirmed profile fields never overwritten, then strength recomputed and gap questions queued. |
| Gap questions | Deterministic choice of unquantified achievements (most recent first, max 8); AI only phrases the questions; invalid/duplicate ids dropped. Answers become metrics by code (`answerToMetrics`: "About 120 store and category managers" → 120 / "store and category managers"). One question at a time UI with strength before → after. |
| Vault strength | Deterministic 0–100 (`vaultStrength`): profile 15, experience 15, quantified achievements 40, skills 15, education 10, skill-tagged 5. Rises as metrics are added. |
| Editor | CRUD for profile, roles, achievements, projects, education, certifications, skills; hide/show; keyboard-accessible reorder (up/down) for roles, projects, achievements and list entities; delete confirmation. |
| Onboarding & consent | 3 skippable screens (country, target roles, experience); DPDP consent card before any upload (`CONSENT_REQUIRED` enforced by the API); model-improvement opt-in off by default. |

## How to verify

```bash
docker compose up -d && pnpm db:migrate && pnpm db:seed
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e
pnpm eval:parse          # needs NVIDIA_API_KEY in .env
```

## Results in this session

| Check | Result |
|---|---|
| Lint, Prettier, typecheck | Pass |
| Unit + integration | **203 pass** (core 88, api 48, ai 40 + 2 skipped Redis, worker 10, ui 10, shared 7) |
| Extraction on 10 fixtures | 10/10: names, companies, titles and date ranges intact; reading order verified (no sidebar interleaving) for both two-column PDFs |
| Browser e2e | **22/22** (desktop + 375 px): landing, login, onboarding, consent, paste → review → confirm, editor CRUD, profile edit, gap answer; WCAG 2.1 AA scans on review and editor screens |
| Fact Guard coverage | 99% branches (unchanged) |

E2E ran against the local API with Postgres and the OTP-log fallback (no Docker on this machine). In CI they use Mailpit; the worker's AI step is stood in by writing a draft with `psql`.

## Acceptance criteria

| Criterion | Status |
|---|---|
| 10 varied sample resumes parse into the vault with correct roles/dates | **Blocked on `NVIDIA_API_KEY`.** Fixtures (`evals/resumes`, 6 layouts × 5 date styles) and the scorer (`pnpm eval:parse`) are ready; extraction already passes 10/10. |
| Editor CRUD e2e passes | **Met** (`e2e/vault.spec.ts`, desktop and mobile). |

## Bugs found and fixed this phase

- `ProfilePatch` built with Zod `.partial()` still injected defaults and blanked the user's name on any profile edit.
- Gap-answer units were truncated at the first "and" ("120 store").
- Section "Add" buttons had identical accessible names (now "Add role", "Add skill", …).
- Toasts covered the sticky confirm bar (moved top-right).

## Decisions and deviations

1. **Cloudflare R2** instead of S3 ap-south-1 (your choice). R2 has no India jurisdiction; Asia-Pacific is only a location hint. DPDP does not mandate localization, so this is permitted, but flag it if the client has contractual residency needs.
2. Imports are polled every 2 s (SSE is reserved for the optimizer in Phase 2, per TRD).
3. Extracted resume text is stored on `VaultImport.text` (needed for re-parse); deleted with the user.

## R2 setup (needed for file uploads; pasted text works without it)

1. Cloudflare dashboard → R2 → create bucket `tailor-dev` (location hint: Asia-Pacific).
2. Bucket → Settings → CORS policy:
   ```json
   [{ "AllowedOrigins": ["http://localhost:5173"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 600 }]
   ```
3. R2 → Manage API tokens → create an *Object Read & Write* token scoped to that bucket.
4. In `.env`: `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET=tailor-dev`, `S3_ACCESS_KEY_ID=…`, `S3_SECRET_ACCESS_KEY=…`.

## Known gaps

- Metric values on an achievement are added through gap answers; direct metric editing in the editor is not built yet (text, hide, reorder, delete are).
- Extras (languages, awards, publications, volunteering) are parsed and stored but have no editor UI yet.
- Virus scanning of uploads (ClamAV) is Phase 6 per plan.
- "Save this to your vault?" from the resume editor is Phase 2 (needs the editor).

## Open questions

1. **NVIDIA key** in `.env` so `pnpm eval:parse` (Phase 1 acceptance) and `pnpm eval` (Phase 0) can run.
2. **OrbStack / Docker** so Redis, BullMQ worker and Mailpit run locally (`pnpm dev` end to end).
3. **R2 credentials** per the steps above (you add them to `.env`).
4. Should direct metric editing and an extras editor be added in Phase 1, or deferred to Phase 2 polish?
