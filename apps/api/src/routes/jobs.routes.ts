import { Router, type CookieOptions } from 'express';
import {
  AnonCheckBody,
  CreateJobBody,
  JobOverrides,
  UploadUrlBody,
  type PublicConfig,
} from '@tailor/shared';
import type { ServerEnv } from '@tailor/shared/env';
import { ipKey, sha256 } from '../lib/crypto.js';
import type { HitCounter } from '../lib/hits.js';
import { parseBody } from '../lib/http.js';
import { userId } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { AppError } from '@tailor/shared';
import type { AnonService } from '../services/anon.service.js';
import { toJobDto, type JobsService } from '../services/jobs.service.js';
import type { HumanCheck } from '../services/turnstile.js';

export function jobsRoutes(deps: { env: ServerEnv; hits: HitCounter; jobs: JobsService }) {
  const { env, hits, jobs } = deps;
  const r = Router();
  const createLimit = rateLimit({
    hits,
    name: 'jobs',
    limit: env.JOBS_PER_HOUR,
    windowMs: 3_600_000,
    key: (req) => userId(req),
  });

  r.post('/', createLimit, async (req, res) => {
    const job = await jobs.create(
      { userId: userId(req) },
      parseBody(CreateJobBody, req.body),
      'url' in req.body ? 'url' : 'paste',
    );
    res.status(job.status === 'ready' ? 201 : 202).json(toJobDto(job));
  });
  r.get('/', async (req, res) => {
    const page = await jobs.list(userId(req), {
      cursor: typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined,
    });
    res.json({ items: page.items.map(toJobDto), nextCursor: page.nextCursor });
  });
  r.get('/:id', async (req, res) => {
    res.json(toJobDto(await jobs.get(userId(req), req.params['id']!)));
  });
  r.patch('/:id', async (req, res) => {
    res.json(
      toJobDto(
        await jobs.setOverrides(userId(req), req.params['id']!, parseBody(JobOverrides, req.body)),
      ),
    );
  });
  r.delete('/:id/overrides', async (req, res) => {
    res.json(toJobDto(await jobs.resetOverrides(userId(req), req.params['id']!)));
  });
  r.get('/:id/match', async (req, res) => {
    res.json(await jobs.match(userId(req), req.params['id']!));
  });
  return r;
}

export const ANON_COOKIE = 'tailor_anon';

export function anonRoutes(deps: {
  env: ServerEnv;
  hits: HitCounter;
  anon: AnonService;
  human: HumanCheck;
}) {
  const { env, hits, anon, human } = deps;
  const r = Router();
  const cookie: CookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/anon',
    maxAge: env.ANON_SESSION_TTL_HOURS * 3_600_000,
  };
  const perIpDay = rateLimit({
    hits,
    name: 'anon-check',
    limit: env.ANON_CHECKS_PER_IP_PER_DAY,
    windowMs: 86_400_000,
    key: (req) => ipKey(req.ip),
  });
  const uploadLimit = rateLimit({
    hits,
    name: 'anon-upload',
    limit: env.ANON_CHECKS_PER_IP_PER_DAY * 2,
    windowMs: 86_400_000,
    key: (req) => ipKey(req.ip),
  });

  r.post('/upload-url', uploadLimit, async (req, res) => {
    res.json(await anon.createUploadUrl(parseBody(UploadUrlBody, req.body)));
  });

  r.post('/check', perIpDay, async (req, res) => {
    const body = parseBody(AnonCheckBody, req.body);
    // Turnstile before any AI work (PRD F1).
    if (!(await human.verify(body.turnstileToken, req.ip))) {
      throw new AppError('FORBIDDEN', 'We could not verify you are human. Please try again.', 403);
    }
    const { token, dto } = await anon.check({
      resume: body.resume,
      job: body.job,
      ipHash: ipKey(req.ip),
      fpHash: body.fingerprint ? sha256(body.fingerprint) : null,
    });
    res.cookie(ANON_COOKIE, token, cookie);
    res.status(201).json(dto);
  });

  r.get('/check/:id', async (req, res) => {
    res.json(await anon.get(req.params['id']!, req.cookies?.[ANON_COOKIE] as string | undefined));
  });
  return r;
}

export function configRoute(env: ServerEnv) {
  const r = Router();
  r.get('/', (_req, res) => {
    const body: PublicConfig = { turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null };
    res.set('Cache-Control', 'public, max-age=300').json(body);
  });
  return r;
}
