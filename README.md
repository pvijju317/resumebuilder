# Tailor — Resume Optimizer

Web app + Chrome extension that tailors a verified Career Vault to each job. Product and design
specs: [PRD.md](PRD.md), [TRD.md](TRD.md), build rules: [CLAUDE.md](CLAUDE.md). Phase reports live
in [docs/](docs/).

## Requirements

- Node 22.12+ (`.nvmrc`), pnpm 12
- A Docker-compatible runtime (OrbStack or Docker Desktop) for Postgres, Redis and Mailpit

## Setup

```bash
pnpm i
cp .env.example .env            # then set NVIDIA_API_KEY (and Google OAuth keys if used)
docker compose up -d            # postgres :5432 (+ tailor_test), redis :6379, mailpit :1025 / :8025
pnpm db:migrate && pnpm db:seed
pnpm dev                        # web :5173, api :4000, worker
```

Sign in at http://localhost:5173 — OTP emails land in Mailpit at http://localhost:8025.
The design system is at http://localhost:5173/styleguide.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm exec playwright install chromium   # once
pnpm test:e2e
pnpm eval --task resume.rewrite --models nvidia/nemotron-3-super-120b-a12b,nvidia/nemotron-3-ultra-550b-a55b --dataset evals/pairs.jsonl
```

## Layout

| Path | What |
|---|---|
| `apps/web` | React app (login, app shell, styleguide; product screens land per phase) |
| `apps/api` | Express API — auth, `/me` |
| `apps/worker` | BullMQ workers — AI queue, `AiCallLog` |
| `packages/shared` | Zod contracts + env schema (the only source of types) |
| `packages/core` | Deterministic logic — Fact Guard, region rules, skill aliases |
| `packages/ai` | Provider layer, task registry, prompts, rate limiter, eval harness |
| `packages/db` | Prisma schema, migrations, seed |
| `packages/ui` | Design tokens and components |
| `evals/` | Synthetic eval pairs; run output in `evals/runs/` (gitignored) |

Switching AI provider or model is an env change only — see the AI section of `.env.example`.
