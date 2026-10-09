import type { NextFunction, Request, Response } from 'express';
import { AppError, isAppError } from '@tailor/shared';
import type { Logger } from 'pino';
import type { z } from 'zod';

export function parseBody<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new AppError('VALIDATION', first?.message ?? 'Invalid request', 400, { cause: r.error });
  }
  return r.data;
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError('NOT_FOUND', 'Not found', 404));
}

/** Errors as `{error: {code, message}}` (TRD §8). Friendly message out, detail in logs. */
export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (isAppError(err)) {
      if (err.httpStatus >= 500) logger.error({ err, reqId: req.id }, err.message);
      res.status(err.httpStatus).json(err.toJSON());
      return;
    }
    const status = (err as { status?: number }).status;
    if (status === 400 && (err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Malformed JSON body' } });
      return;
    }
    logger.error({ err, reqId: req.id }, 'unhandled error');
    res
      .status(500)
      .json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
  };
}
