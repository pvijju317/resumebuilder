import type { NextFunction, Request, Response } from 'express';
import { AppError } from '@tailor/shared';
import type { AccessClaims, TokenSigner } from '../services/tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessClaims;
    }
  }
}

export function requireAuth(signer: TokenSigner) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(new AppError('UNAUTHORIZED', 'Please sign in.', 401));
      return;
    }
    try {
      req.auth = await signer.verify(header.slice(7));
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== 'ADMIN') next(new AppError('FORBIDDEN', 'Not allowed.', 403));
  else next();
}

export function userId(req: Request): string {
  if (!req.auth) throw new AppError('UNAUTHORIZED', 'Please sign in.', 401);
  return req.auth.sub;
}
