# CLAUDE.md — Build instructions for Tailor (Resume Optimizer v1)

You are building a production web app + Chrome extension for MTPL's client. Read `PRD.md` (what & why) and `TRD.md` (how) fully before writing code. They are the source of truth.

---

## Operating rules

1. **Phase-gated.** Build one phase at a time (below). At the end of each phase: run all checks, write a short `docs/phase-N-report.md` (what was built, how to verify, known gaps, open questions), then **stop and wait for sign-off**. Do not start the next phase on your own.
2. **Ask, don't assume.** If PRD/TRD are ambiguous or conflict with reality, stop and ask. List questions together, not one at a time.
3. **Verify against live systems.** Never assume third-party DOM, API shapes, model IDs, or rate limits. Check the live job-board pages, the NVIDIA model catalog (build.nvidia.com), and Razorpay docs before coding against them. Save real page HTML as test fixtures. (A previous MTPL extension failed because selectors were written against assumed markup.)
4. **No hardcoded business values.** Plan prices/limits, model IDs, rate limits, region rules, selectors → DB or config/env.
5. **Deterministic first.** Anything that can be computed (scoring, selection, fact checking, formatting, autofill mapping) is code, not an AI call. AI only for language understanding and writing (TRD §5.2 lists every allowed task).
6. **Fact Guard is non-negotiable.** No code path may export a resume that bypasses Fact Guard.
7. **Just-in-time infra.** Create cloud resources only when the phase needs them.
8. **Small, reviewable commits** with conventional commit messages. Each phase on its own branch `phase-N-<name>`.
9. Keep the AI provider layer swappable: switching provider/model must be an env change only.

---

## Commands (set these up in Phase 0)

```
pnpm i
docker compose up -d            # postgres, redis, localstack, mailhog
pnpm db:migrate && pnpm db:seed
pnpm dev                        # web + api + worker
pnpm --filter extension dev     # load apps/extension/dist unpacked in Chrome
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e                   # Playwright
pnpm eval --task resume.rewrite --models <ids> --dataset evals/pairs.jsonl
```

Definition of done for every phase: lint, typecheck, unit tests, and relevant e2e tests pass; no `TODO` without an issue reference; phase report written.

---

## Phases

### Phase 0 — Foundations & AI layer
- Monorepo per TRD §3, TypeScript strict, ESLint/Prettier, Vitest, Playwright, docker-compose, CI workflow.
- Prisma schema (TRD §4), migrations, seed (plans, admin, skill aliases).
- Auth: email OTP + Google, JWT/refresh, `/me`.
- `packages/ai`: provider interface, OpenAI-compatible adapter (NVIDIA NIM), Anthropic adapter stub, task registry, Zod output validation + repair, Redis rate limiter (`AI_RPM_LIMIT`), retries/fallback, `<think>` stripping, reasoning-off toggle verified from model card, `AiCallLog`.
- Eval harness CLI (TRD §5.5) with 5 sample pairs committed (synthetic, no real PII).
- Design system in `packages/ui` (tokens, typography, buttons, inputs, cards, chips, score ring, toasts, modal, empty states) + a `/styleguide` route.
**Accept:** login works; `pnpm eval` runs both Nemotron Super and Ultra on the samples and outputs the blind HTML report; rate limiter proven by test.

### Phase 1 — Career Vault
- Upload (S3 signed URL) → parse text (pdfjs/mammoth) → `vault.parse` job → review screen → confirm.
- Gap questions flow, answers stored as metrics; vault strength score.
- Vault editor (all entities, reorder, hide), PII tokenization before AI calls.
**Accept:** 10 varied sample resumes parse into the vault with correct roles/dates; editor CRUD e2e passes.

### Phase 2 — Jobs, ATS score, try-first flow, Optimizer, Editor, Export
*Reordered 2026-10-09 (client request): the anonymous try-first flow moved here from Phase 3. Build in two slices; demo 2a before starting 2b.*

**2a — Score check without signup**
- Job intake (paste/URL), `jd.extract` with `JdCache`, skill chip overrides.
- `packages/core`: ATS score (TRD §6.1), region rules (§6.4) — fully unit tested.
- Landing hero "Check my ATS score": resume upload/paste + JD/URL → score, matched/missing keywords, section checks. No account. Turnstile before AI calls, IP/fingerprint limits, 72 h expiry (PRD F1).
**Accept 2a:** Playwright: landing → ATS score without an account in < 60 s for a 2-page resume.

**2b — Tailor**
- `packages/core`: vault selection (§6.2), Fact Guard (§6.3, built in Phase 0) wired into the pipeline.
- Optimizer pipeline in worker with SSE progress; `[[ASK]]` answer flow.
- Result screen, WYSIWYG editor (TipTap), keyword checklist, regenerate/refine with per-optimization limits, versions, save-to-vault.
- `packages/render`: 4 templates × 4 regions, PDF (Puppeteer) + DOCX, auto-fit, post-render parse check.
- Cover letter generate/edit/export.
- Anonymous "Tailor it" read-only preview (1 free optimization) + claim-on-signup with the session preserved.
**Accept 2b:** end-to-end optimize ≤ 30 s p50 on dev; Fact Guard tests ≥ 95% branch coverage; exported PDFs pass pdfjs text-order check for every template × region; Playwright: landing → score → anon optimize → signup (session preserved).

### Phase 3 — Plans & billing
- Landing, pricing section and legal placeholders shipped in Phase 0; replace placeholders with reviewed legal text.
- Plans from DB, credit ledger, transactional deduction/refund, download gating, Razorpay subscriptions + one-time, webhooks, GST invoices, cancel flow.
**Accept:** Playwright: signup → upgrade in Razorpay test mode → download.

### Phase 4 — Tracker & insights
- Applications CRUD, kanban + table, status history, follow-up reminders (SES), ghosted suggestion job.
- Insights computations with minimum sample rules; dashboard widgets; weekly summary email (opt-in).
**Accept:** seeded data produces correct callback rates per bucket (unit tests on aggregation).

### Phase 5 — Chrome extension
- **First:** open live LinkedIn Jobs, Naukri, Indeed, Greenhouse, Lever, Workday pages; record DOM structure; save HTML fixtures; write selector configs into `ExtensionSelectorConfig`. Report findings before coding detection logic.
- Side panel UI, capture → match → tailor → preview/download → mark applied.
- Autofill mapping (rule-based) + AI answers for free-text; highlight fields; never submit.
- Token handoff from web app; selector config fetch; detection telemetry.
**Accept:** detection + autofill pass on saved live fixtures and a manual check on live pages, documented with screenshots in the phase report.

### Phase 6 — Admin, hardening, launch prep
- Admin panel (TRD §8 admin endpoints): users, credits, plans, AI usage/cost, failures, selector editor, quality flags.
- Sentry, dashboards, alerts, rate limits, ClamAV, data export/delete, audit log.
- Load test (200 concurrent optimizations), backup restore test.
- Production readiness checklist (TRD §15) — flag that the free NVIDIA endpoint must be replaced/augmented by a paid provider before public traffic.

---

## Design rules (apply to every screen)

The product must look premium, calm, and trustworthy — like Linear, Stripe Dashboard, or Notion. It must never look like a template.

- **Typography:** Inter (or Geist) via self-hosted font. Scale: 12 / 14 / 16 / 20 / 24 / 32 / 48. Body 14–16, line-height 1.5. Headings semibold, tight tracking. Numbers in tabular figures.
- **Color:** neutral base (zinc/slate). One accent (default deep indigo `#4338CA`, configurable token). Semantic: success green, warning amber, danger red — used only for state. Dark mode via tokens, not overrides.
- **Layout:** 8 px grid; max content width 1200 px; app shell with left sidebar (Dashboard, Vault, Jobs, Tracker, Billing, Settings) and a top bar with credits + profile. Generous whitespace; cards with 1 px borders and subtle shadow, radius 12 px.
- **Data as the visual:** score ring with before → after delta, keyword chips (matched / missing / partial), diff highlighting of rewritten bullets, vault strength meter. No stock illustrations, no emoji, no gradients, no decorative blobs.
- **Motion:** 150–200 ms ease-out for state changes; progress steps during optimization (`Selecting → Rewriting → Checking facts → Scoring`) — never a bare spinner for > 2 s.
- **Copy:** short, direct, honest. No fake stats, no "guaranteed" claims, no unverifiable user counts.
- **Components:** shadcn/ui primitives restyled to tokens; Lucide icons at 16/20 px, stroke 1.5.
- **Responsive:** fully usable at 375 px; editor degrades to a single-column edit mode on mobile.
- **Accessibility:** WCAG 2.1 AA contrast, keyboard navigable, focus rings visible, ARIA on custom controls.
- **Resume templates:** typographically excellent and ATS-safe — single column, real text, standard headings, consistent spacing; they are the product's showcase.

---

## Code conventions

- Zod schemas in `packages/shared` are the contract between web, api, worker, and extension. Never duplicate types.
- API handlers thin; logic in services; DB access only via Prisma in services.
- All money in integer paise; all dates UTC ISO; vault dates `YYYY-MM`.
- Feature flags/env for anything provider-specific.
- Errors: typed `AppError(code, message, httpStatus)`; user-facing messages friendly, logs detailed.
- No PII in logs. No prompt/response bodies logged in production.

---

## Known constraints to respect

- NVIDIA free endpoint (`https://integrate.api.nvidia.com/v1`) is ~40 requests/min and intended for development/prototyping, not production. Keep `AI_RPM_LIMIT=35`, queue everything, and design so a paid provider can be added via env with zero code change.
- Credits are deducted only on successful completion; any failure refunds in the same transaction.
- The extension never submits forms.
- Export is blocked while `[[ASK]]` placeholders remain.
