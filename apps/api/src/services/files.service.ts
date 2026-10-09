import { randomUUID } from 'node:crypto';
import { AppError, RESUME_MIME, type ResumeMime, type UploadUrlResponse } from '@tailor/shared';
import type { ServerEnv } from '@tailor/shared/env';
import type { PrismaClient } from '@tailor/db';
import { extractResumeText } from './extract.js';
import type { Storage } from './storage.js';

export function createFilesService(deps: {
  prisma: PrismaClient;
  env: ServerEnv;
  storage: Storage | null;
}) {
  const { prisma, env } = deps;
  const storage = () => {
    if (!deps.storage)
      throw new AppError(
        'INTERNAL',
        'File uploads are not configured yet. Paste your resume text instead.',
        503,
      );
    return deps.storage;
  };

  return {
    async createUploadUrl(
      userId: string,
      body: { fileName: string; mime: ResumeMime; size: number },
    ): Promise<UploadUrlResponse> {
      if (body.size > env.FILE_MAX_BYTES) {
        throw new AppError(
          'VALIDATION',
          `Files must be ${Math.round(env.FILE_MAX_BYTES / 1024 / 1024)} MB or smaller.`,
          400,
        );
      }
      const key = `resumes/${userId}/${randomUUID()}.${RESUME_MIME[body.mime]}`;
      const file = await prisma.uploadedFile.create({
        data: {
          userId,
          key,
          fileName: body.fileName,
          mime: body.mime,
          size: body.size,
          status: 'pending',
        },
      });
      const { url, headers } = await storage().presignPut(
        key,
        body.mime,
        body.size,
        env.UPLOAD_URL_TTL_SECONDS,
      );
      return { fileId: file.id, url, headers, expiresIn: env.UPLOAD_URL_TTL_SECONDS };
    },

    /** Verify the uploaded object and extract its text. */
    async extractText(userId: string, fileId: string): Promise<string> {
      const file = await prisma.uploadedFile.findFirst({ where: { id: fileId, userId } });
      if (!file) throw new AppError('NOT_FOUND', 'File not found', 404);
      const head = await storage().head(file.key);
      if (!head)
        throw new AppError('VALIDATION', 'The upload did not finish. Please try again.', 400);
      if (head.size > env.FILE_MAX_BYTES) {
        await prisma.uploadedFile.update({
          where: { id: file.id },
          data: { status: 'rejected', error: 'too_large' },
        });
        throw new AppError('VALIDATION', 'That file is too large.', 400);
      }
      try {
        const { text } = await extractResumeText(await storage().get(file.key));
        await prisma.uploadedFile.update({
          where: { id: file.id },
          data: { status: 'parsed', size: head.size },
        });
        return text;
      } catch (e) {
        await prisma.uploadedFile.update({
          where: { id: file.id },
          data: {
            status: 'rejected',
            error: e instanceof AppError ? e.message.slice(0, 200) : 'extract_failed',
          },
        });
        throw e;
      }
    },
  };
}
export type FilesService = ReturnType<typeof createFilesService>;
