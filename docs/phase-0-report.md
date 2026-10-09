# Phase 0 report — Foundations & AI layer

Branch: `phase-0-foundations` · Date: 2026-10-09 · Status: **awaiting sign-off** (3 acceptance checks blocked on environment, see below)

## What was built

| Area | Delivered |
|---|---|
| Monorepo | pnpm + Turborepo, TS strict, ESLint (flat) + Prettier, Vitest, Playwright, `docker-compose` (Postgres 16, Redis 7, Mailpit), GitHub Actions CI (`.github/workflows/ci.yml`), TODO-without-issue check in `pnpm lint` |
| `packages/shared` | Zod contracts for every API/AI boundary (vault, job extraction, ResumeDoc, rewrite I/O, auth, plan features, AI task inputs), typed env schema, `AppError` |
| `packages/db` | Prisma 7 schema (TRD §4 + `OtpCode`, `RefreshToken`, `SkillAlias`, `AiModelPrice`), initial migration, idempotent seed: 6 plans, 199 skill aliases, model price rows, admin user from `ADMIN_EMAIL` |
| Auth (`apps/api`) | Email OTP (HMAC-hashed, single-use, 5-attempt lockout, per-IP and per-email limits), Google OAuth (state cookie + verified `id_token`, links by email), 15-min JWT + rotating refresh cookie with reuse detection (reused token revokes the family), `GET/PATCH /me`, health/readiness, `{error:{code,message}}` envelope, PII-redacted Pino logs |
| `packages/ai` | Provider interface (TRD §5.1), OpenAI-compatible adapter (NVIDIA/DeepInfra/OpenRouter), Anthropic adapter stub, task registry for all 8 TRD §5.2 tasks with versioned prompts, Zod validation + one temperature-0 repair call, Redis token-bucket limiter, 1/3/9 s jittered retries → env fallback provider → "High demand" error, `<think>` stripping, `AiCallLog` sink with cost estimate |
| Reasoning toggle | Verified on the model card: `chat_template_kwargs: {enable_thinking: false}` (Nemotron 3). Model IDs verified against the live `integrate.api.nvidia.com/v1/models` list. |
| `packages/core` | **Fact Guard built early** (agreed): numbers incl. ₹ Cr / lakh / M / %, `40+`, rounding rules, years vs role dates, companies/titles/degrees/certs/institutions, org-name heuristic, unmapped bullets, summary sentence filtering, `[[ASK]]` handling. Region rules (PRD F8), skill alias normalization |
| Eval harness | `pnpm eval` → `results.jsonl`, `summary.json`, blind side-by-side `report.html` (grading form, downloads `grades.json`), separate `key.json`. Metrics: JSON validity (with/without repair), must-have coverage, Fact Guard violations, ASK count, length, first-person, latency p50/p95, tokens. 5 synthetic pairs in `evals/pairs.jsonl` |
| `apps/worker` | BullMQ AI queue with priority levels, shared rate limiter, Prisma `AiCallLog` sink, single auto-requeue on high demand |
| Design system | `packages/ui`: tokens (light/dark by token swap, configurable accent), 12–48 type scale, Inter self-hosted; button, field, card, chip, score ring with before→after, strength meter, progress steps, modal, toast, menu, empty state, skeleton. `/styleguide` route |
| `apps/web` | Login (email OTP + Google when configured), session restore, app shell (sidebar + top bar + mobile drawer), dashboard with honest empty states |

## How to verify

```bash
docker compose up -d && pnpm db:migrate && pnpm db:seed
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e
pnpm eval --task resume.rewrite --dataset evals/pairs.jsonl   # needs NVIDIA_API_KEY in .env
```

## Results in this session

| Check | Result |
|---|---|
| Lint, Prettier, typecheck (9 projects) | Pass |
| Unit/integration tests | **143 pass** (core 68, ai 40, api 17, ui 8, shared 6, worker 4); 2 skipped (Redis integration) |
| Fact Guard coverage | **99.07% branches**, 100% lines (gate: 95%, enforced in `packages/core/vitest.config.ts`) |
| Fact Guard false positives | 0 violations on identity rewrites of all 5 eval pairs |
| API tests | Run against a real Postgres 17 (scratch instance) — 17/17 |
| Accessibility | Playwright + axe: 0 WCAG 2.1 AA violations on `/login` and `/styleguide`, light + dark, desktop + 375 px (8 scans) |
| Login in browser | Verified manually: OTP request → code → dashboard → reload keeps session → sign out → `/` redirects to login |

## Acceptance criteria

| Criterion | Status |
|---|---|
| Login works | **Met manually** (browser, real Postgres). The Playwright login spec (`e2e/auth.spec.ts`) is written but not yet run — it needs Mailpit + Redis (Docker). |
| `pnpm eval` runs Super and Ultra and outputs the blind HTML report | **Blocked: needs `NVIDIA_API_KEY`.** Pipeline verified end-to-end without a key (failures handled, report written). |
| Rate limiter proven by test | **Partly.** Virtual-clock test proves ≤ rpm + burst per 60 s window. The real-Redis test (3 clients sharing one bucket) is written and skips until Redis is running. |

## Deviations from TRD (with reason)

1. **Node 22** (not 20): Node 20 is end-of-life (Apr 2026) and current Vitest requires ≥ 22.12.
2. **TypeScript 6.0**: typescript-eslint does not support TS 7 yet.
3. **Mailpit instead of MailHog**: MailHog is unmaintained and has no arm64 image; Mailpit is a drop-in (same ports).
4. **No LocalStack**: since March 2026 its image requires an auth token and the free tier is non-commercial. Phase 0 doesn't need S3/SES — see open question 3.
5. **SES via SMTP**: one nodemailer path for Mailpit (dev) and the SES SMTP interface (prod).
6. **Money fields** keep TRD names (`priceInr`, …) but store **paise** (your decision).
7. **`AI_RPM_BURST=3`** added: a token bucket admits rpm + burst per minute, so burst is capped to stay under NVIDIA's ~40.
8. **Dependency pins**: express 5.2.1, bullmq 6.3.11, lucide 1.53.0 — newer releases were < 24 h old and pnpm's release-age policy rejected them (I removed pnpm's auto-added bypasses).
9. **React 18** kept per TRD.

## Known gaps (scheduled)

- Chrome extension package (`pnpm --filter extension dev`) → Phase 5, which starts with live-DOM research.
- Onboarding + consent screens → Phase 1, before the first upload (API fields already exist).
- Top-bar credits → Phase 3 (no credit data yet; not shown rather than faked).
- `DELETE /me`, `GET /me/export` → Phase 6. PII tokenization and seeded sample vault → Phase 1.
- Anthropic adapter tested only against a mocked transport. Structured-output (`json_schema`) is off for Nemotron until verified live.
- Fact Guard limits: single-word titles aren't checked, org names are detected by suffix (Ltd, Labs, …) plus known vault names, and words like "doubled"/"halved" aren't verified.

## Open questions

1. **NVIDIA API key** — please add `NVIDIA_API_KEY` to `.env` (from build.nvidia.com) so I can run the eval and verify the reasoning flag with a real call.
2. **Container runtime** — please install OrbStack (or Docker Desktop) so the Redis rate-limiter test, the Playwright login spec and `pnpm dev` can run.
3. **S3 for Phase 1 uploads** — LocalStack now needs a commercial licence. Options: (a) a real dev bucket in ap-south-1 (matches prod; I'd create it just-in-time), (b) Adobe S3Mock in compose (free, offline), (c) buy LocalStack. I recommend (b) for local/CI plus (a) for staging.
4. **Google OAuth** — is there a dev OAuth client? Until then Google sign-in is hidden in the UI.
5. **India page length** — PRD says "1–2 pages". I set 1 page, switching to 2 at ≥ 5 years' experience. OK?
6. **Starter plan cover letters** — the PRD plan table omits them, but "included per optimization: 1 cover letter" suggests all paid plans. Seeded as **not included** for Starter; please confirm.
7. **Sampling** — the model card recommends temperature 1.0 / top_p 0.95 even with reasoning off; the TRD sets 0–0.6 per task. I kept the TRD values; the eval can compare both once the key is in.
8. **Git remote** — share an org/repo when ready so CI runs on push.

## Addendum — design review round (2026-10-09)

Client feedback: "why sign in first, where is the landing page, colours and design feel basic."

- **Landing page at `/`** (pulled forward from Phase 3): hero with a live before/after resume, how it works, Fact Guard, region formats (rendered from `packages/core` region config), extension and privacy, pricing read from the new public `GET /plans`, FAQ, final CTA, footer with legal placeholders. The product moved to `/app`; sign-in is now optional from the nav.
- **Visual refresh**: cobalt accent on stone neutrals (all pairs ≥ 4.5:1 in both themes), Geist + Geist Mono, tinted shadows, split login page with product preview, setup-path dashboard.
- **Skill**: `design-taste-frontend` (Leonxlnx/taste-skill, MIT) reviewed and vendored in `.claude/skills/`; CLAUDE.md rules take precedence (no stock imagery, Lucide icons).
- **Bugs found and fixed**: `Button asChild` crashed Radix Slot; `pnpm db:deploy` ran pnpm's built-in `deploy` (would have broken CI); region table `<dl role="tabpanel">` broke list semantics.
- **Checks**: 148 unit/integration tests pass; Playwright 16/16 (WCAG 2.1 AA on `/`, `/login`, `/styleguide` in light/dark, desktop/375 px; pricing toggle; no horizontal scroll).
- **Not yet true**: the PRD's no-signup "check my ATS score" hero needs the scoring engine (Phase 2) and the anonymous backend (Phase 3). Until then the hero CTA leads to sign-up and the demo is a labelled example.
