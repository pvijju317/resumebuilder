# Deploy the trial to Vercel (free, 1–2 days)

Website and API run on Vercel; Postgres (Neon) and Redis (Upstash) come from the Vercel
Marketplace on free plans. Background jobs run inside the API function after each response
(`QUEUE_DRIVER=inline`), and uploads are kept in Postgres for 24 hours (`STORAGE_DRIVER=db`).
The long-term setup (worker + object storage) is unchanged and selected by env.

> Vercel Hobby is for non-commercial use under Vercel's terms. Fine for this short trial by your
> choice; switch the team to Pro before real users.

## 1. Import the repo
1. vercel.com → **Add New → Project** → import `pvijju317/resumebuilder`.
2. Framework preset: **Other**. Leave build settings as they are (`vercel.json` sets them).
3. Don't deploy yet: first add storage and env vars (steps 2–3). If it already deployed and failed, that's fine.
4. **Settings → Environments → Production → Branch Tracking**: set the branch to `deploy/vercel-trial`.

## 2. Add storage (free plans)
In the project: **Storage → Marketplace**
- **Neon** (Postgres) → Free → connect to this project (all environments). It adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
- **Upstash for Redis** → Free → connect. It adds `KV_URL` (used as `REDIS_URL` automatically).

## 3. Environment variables (Settings → Environment Variables, Production)

| Name | Value |
|---|---|
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (uses the repo's pnpm 12) |
| `QUEUE_DRIVER` | `inline` |
| `STORAGE_DRIVER` | `db` |
| `FILE_MAX_BYTES` | `4194304` (Vercel request limit is 4.5 MB) |
| `JWT_SECRET` | output of `openssl rand -base64 48` |
| `REFRESH_SECRET` | another `openssl rand -base64 48` |
| `CRON_SECRET` | another `openssl rand -base64 32` |
| `NVIDIA_API_KEY` | your key from build.nvidia.com |
| `AI_MODEL_STANDARD` | `nvidia/nemotron-3-super-120b-a12b` |
| `AI_MODEL_PREMIUM` | `nvidia/nemotron-3-ultra-550b-a55b` |
| `AI_RPM_LIMIT` | `35` |
| `EMAIL_TRANSPORT` | `smtp` |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | your Brevo SMTP login |
| `SMTP_PASS` | your Brevo SMTP key |
| `SES_FROM` | `Tailor <the-sender-you-verified-in-brevo>` |
| `TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` (test key; real key later) |
| `TURNSTILE_SECRET` | `1x0000000000000000000000000000000AA` |
| `ADMIN_EMAIL` | optional: your email |

`APP_URL` and `API_URL` default to the project's production URL; set them only for a custom domain.

## 4. Deploy
**Deployments → Redeploy** (or push to `deploy/vercel-trial`). The build migrates and seeds the
database, builds the site, and bundles the API (~120 MB function).

## 5. Check
- `https://<project>.vercel.app/api/v1/health` → `{"ok":true}`
- `https://<project>.vercel.app/api/v1/health/ready` → database and Redis `true`
- Landing page → **Check my ATS score** → result within a minute.

## After the trial
Delete the Neon and Upstash stores and the project, or switch to Pro and set
`QUEUE_DRIVER=bullmq` with a worker host and `STORAGE_DRIVER=s3` (R2) for production.
