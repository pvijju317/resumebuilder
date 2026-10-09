import { Router } from 'express';
import {
  AchievementBody,
  AchievementPatch,
  CertBody,
  CertPatch,
  ConfirmImportBody,
  EducationBody,
  EducationPatch,
  GapAnswersBody,
  ProfilePatch,
  ProjectBody,
  ProjectPatch,
  ReorderBody,
  RoleBody,
  RolePatch,
  SkillBody,
  SkillPatch,
  UploadUrlBody,
  VaultBuildBody,
} from '@tailor/shared';
import type { ServerEnv } from '@tailor/shared/env';
import type { z } from 'zod';
import type { HitCounter } from '../lib/hits.js';
import { parseBody } from '../lib/http.js';
import { userId } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import type { FilesService } from '../services/files.service.js';
import type { ImportsService } from '../services/imports.service.js';
import type { VaultService } from '../services/vault.service.js';

export function filesRoutes(files: FilesService) {
  const r = Router();
  r.post('/upload-url', async (req, res) => {
    res.json(await files.createUploadUrl(userId(req), parseBody(UploadUrlBody, req.body)));
  });
  return r;
}

export function vaultRoutes(deps: {
  env: ServerEnv;
  hits: HitCounter;
  imports: ImportsService;
  vault: VaultService;
}) {
  const { env, hits, imports, vault } = deps;
  const r = Router();
  const buildLimit = rateLimit({
    hits,
    name: 'vault-build',
    limit: env.VAULT_BUILDS_PER_HOUR,
    windowMs: 3_600_000,
    key: (req) => userId(req),
  });

  r.get('/', async (req, res) => {
    const v = await vault.get(userId(req));
    if (!v) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No vault yet' } });
      return;
    }
    res.json(v);
  });
  r.patch('/profile', async (req, res) => {
    res.json(await vault.patchProfile(userId(req), parseBody(ProfilePatch, req.body)));
  });

  r.post('/build', buildLimit, async (req, res) => {
    res.status(202).json(await imports.build(userId(req), parseBody(VaultBuildBody, req.body)));
  });
  r.get('/imports/latest', async (req, res) => {
    res.json(await imports.latest(userId(req)));
  });
  r.get('/imports/:id', async (req, res) => {
    res.json(await imports.get(userId(req), req.params['id']!));
  });
  r.post('/imports/:id/confirm', async (req, res) => {
    res.json(
      await imports.confirm(userId(req), req.params['id']!, parseBody(ConfirmImportBody, req.body)),
    );
  });

  const crud = <C extends z.ZodType, P extends z.ZodType>(
    path: string,
    kind: Parameters<VaultService['create']>[1],
    create: C,
    patch: P,
  ) => {
    r.post(`/${path}`, async (req, res) => {
      res
        .status(201)
        .json(
          await vault.create(
            userId(req),
            kind,
            parseBody(create, req.body) as Record<string, unknown>,
          ),
        );
    });
    r.patch(`/${path}/:id`, async (req, res) => {
      res.json(
        await vault.update(
          userId(req),
          kind,
          req.params['id']!,
          parseBody(patch, req.body) as Record<string, unknown>,
        ),
      );
    });
    r.delete(`/${path}/:id`, async (req, res) => {
      res.json(await vault.remove(userId(req), kind, req.params['id']!));
    });
  };
  crud('roles', 'role', RoleBody, RolePatch);
  crud('projects', 'project', ProjectBody, ProjectPatch);
  crud('education', 'education', EducationBody, EducationPatch);
  crud('certs', 'cert', CertBody, CertPatch);
  crud('skills', 'skill', SkillBody, SkillPatch);

  r.post('/achievements', async (req, res) => {
    res
      .status(201)
      .json(await vault.createAchievement(userId(req), parseBody(AchievementBody, req.body)));
  });
  r.patch('/achievements/:id', async (req, res) => {
    res.json(
      await vault.updateAchievement(
        userId(req),
        req.params['id']!,
        parseBody(AchievementPatch, req.body),
      ),
    );
  });
  r.delete('/achievements/:id', async (req, res) => {
    res.json(await vault.removeAchievement(userId(req), req.params['id']!));
  });

  r.post('/reorder', async (req, res) => {
    res.json(await vault.reorder(userId(req), parseBody(ReorderBody, req.body)));
  });

  r.get('/gap-questions', async (req, res) => {
    res.json(await vault.gapQuestions(userId(req)));
  });
  r.post('/gap-questions/refresh', buildLimit, async (req, res) => {
    await vault.refreshGapQuestions(userId(req));
    res.status(202).json({ ok: true });
  });
  r.post('/gap-answers', async (req, res) => {
    res.json(
      await vault.answerGapQuestions(userId(req), parseBody(GapAnswersBody, req.body).answers),
    );
  });
  return r;
}
