import { AppError } from '@tailor/shared';
import type { ServerEnv } from '@tailor/shared/env';
import type { PrismaClient, User } from '@tailor/db';
import { hmac, randomToken, safeEqual, sha256, sixDigitCode } from '../lib/crypto.js';
import type { HitCounter } from '../lib/hits.js';
import { otpEmail, type Mailer } from './mailer.js';
import type { TokenSigner } from './tokens.js';

export interface IssuedSession {
  refreshTokenId: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: User;
}

export interface AuthDeps {
  prisma: PrismaClient;
  env: ServerEnv;
  mailer: Mailer;
  signer: TokenSigner;
  hits: HitCounter;
  now?: () => Date;
}

const HOUR = 3_600_000;

export function createAuthService(deps: AuthDeps) {
  const { prisma, env, mailer, signer, hits } = deps;
  const now = deps.now ?? (() => new Date());
  // Codes are bound to the email so a leaked hash cannot be replayed for another address.
  const otpHash = (email: string, code: string) => hmac(env.REFRESH_SECRET, `otp:${email}:${code}`);

  async function issueSession(
    user: User,
    userAgent?: string,
    familyId?: string,
  ): Promise<IssuedSession> {
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(now().getTime() + env.REFRESH_TTL_DAYS * 24 * HOUR);
    const row = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId: familyId ?? randomToken(12),
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
    });
    const accessToken = await signer.sign({ sub: user.id, role: user.role });
    return {
      refreshTokenId: row.id,
      accessToken,
      expiresIn: signer.ttlSeconds,
      refreshToken,
      refreshExpiresAt,
      user,
    };
  }

  function assertActive(user: User) {
    if (user.deletedAt) throw new AppError('FORBIDDEN', 'This account has been deleted.', 403);
  }

  return {
    async requestOtp(email: string): Promise<void> {
      const count = await hits.hit(`otp-email:${sha256(email)}`, HOUR);
      if (count > env.OTP_REQUESTS_PER_EMAIL_PER_HOUR) {
        throw new AppError(
          'RATE_LIMITED',
          'Too many codes requested. Please wait a while and try again.',
          429,
        );
      }
      const code = sixDigitCode();
      await prisma.$transaction([
        // A new code invalidates any earlier one.
        prisma.otpCode.updateMany({
          where: { email, consumedAt: null },
          data: { consumedAt: now() },
        }),
        prisma.otpCode.create({
          data: {
            email,
            codeHash: otpHash(email, code),
            expiresAt: new Date(now().getTime() + env.OTP_TTL_SECONDS * 1000),
          },
        }),
      ]);
      await mailer.send({
        to: email,
        ...otpEmail(env.APP_NAME, code, Math.round(env.OTP_TTL_SECONDS / 60)),
      });
    },

    async verifyOtp(email: string, code: string, userAgent?: string): Promise<IssuedSession> {
      const otp = await prisma.otpCode.findFirst({
        where: { email, consumedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!otp || otp.expiresAt <= now()) {
        throw new AppError('OTP_EXPIRED', 'That code has expired. Request a new one.', 400);
      }
      if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
        throw new AppError(
          'OTP_TOO_MANY_ATTEMPTS',
          'Too many incorrect attempts. Request a new code.',
          429,
        );
      }
      if (!safeEqual(otp.codeHash, otpHash(email, code))) {
        await prisma.otpCode.update({
          where: { id: otp.id },
          data: { attempts: { increment: 1 } },
        });
        throw new AppError('OTP_INVALID', 'That code is incorrect.', 400);
      }
      // Conditional consume: concurrent verifies of the same code cannot both succeed.
      const consumed = await prisma.otpCode.updateMany({
        where: { id: otp.id, consumedAt: null },
        data: { consumedAt: now() },
      });
      if (consumed.count === 0)
        throw new AppError('OTP_EXPIRED', 'That code has already been used.', 400);

      const user = await prisma.user.upsert({ where: { email }, create: { email }, update: {} });
      assertActive(user);
      return issueSession(user, userAgent);
    },

    /** Rotating refresh: a reused (already-rotated) token revokes its whole family. */
    async refresh(token: string, userAgent?: string): Promise<IssuedSession> {
      const unauthorized = () =>
        new AppError('UNAUTHORIZED', 'Your session has expired. Please sign in again.', 401);
      const row = await prisma.refreshToken.findUnique({
        where: { tokenHash: sha256(token) },
        include: { user: true },
      });
      if (!row) throw unauthorized();
      if (row.revokedAt) {
        await prisma.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: now() },
        });
        throw unauthorized();
      }
      if (row.expiresAt <= now()) throw unauthorized();
      assertActive(row.user);

      const revoked = await prisma.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: now() },
      });
      if (revoked.count === 0) throw unauthorized(); // lost a concurrent rotation race
      const session = await issueSession(row.user, userAgent, row.familyId);
      await prisma.refreshToken.update({
        where: { id: row.id },
        data: { replacedById: session.refreshTokenId },
      });
      return session;
    },

    async logout(token: string | undefined): Promise<void> {
      if (!token) return;
      const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
      if (row) {
        await prisma.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: now() },
        });
      }
    },

    /** Google sign-in: link by googleId, else by verified email, else create. */
    async signInWithGoogle(
      profile: { googleId: string; email: string; name: string | null },
      userAgent?: string,
    ) {
      const email = profile.email.toLowerCase();
      const existing =
        (await prisma.user.findUnique({ where: { googleId: profile.googleId } })) ??
        (await prisma.user.findUnique({ where: { email } }));
      const user = existing
        ? await prisma.user.update({
            where: { id: existing.id },
            data: { googleId: profile.googleId, name: existing.name ?? profile.name },
          })
        : await prisma.user.create({
            data: { email, googleId: profile.googleId, name: profile.name },
          });
      assertActive(user);
      return issueSession(user, userAgent);
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
