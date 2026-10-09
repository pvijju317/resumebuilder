import type { NextFunction, Request, Response } from 'express';
import { AppError } from '@tailor/shared';
import type { HitCounter } from '../lib/hits.js';

export function rateLimit(opts: {
  hits: HitCounter;
  name: string;
  limit: number;
  windowMs: number;
  key: (req: Request) => string;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const count = await opts.hits.hit(`${opts.name}:${opts.key(req)}`, opts.windowMs);
      res.setHeader('RateLimit-Limit', String(opts.limit));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, opts.limit - count)));
      if (count > opts.limit) {
        res.setHeader('Retry-After', String(Math.ceil(opts.windowMs / 1000)));
        throw new AppError(
          'RATE_LIMITED',
          'Too many requests. Please wait a moment and try again.',
          429,
        );
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
