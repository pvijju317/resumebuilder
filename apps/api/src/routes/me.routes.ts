import { Router } from 'express';
import { UpdateMeBody } from '@tailor/shared';
import { parseBody } from '../lib/http.js';
import { userId } from '../middleware/auth.js';
import type { MeService } from '../services/me.service.js';

export function meRoutes(me: MeService) {
  const r = Router();
  r.get('/', async (req, res) => {
    res.json(await me.get(userId(req)));
  });
  r.patch('/', async (req, res) => {
    res.json(await me.update(userId(req), parseBody(UpdateMeBody, req.body)));
  });
  return r;
}
