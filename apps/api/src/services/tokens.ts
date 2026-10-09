import { SignJWT, jwtVerify } from 'jose';
import { AppError, type Role } from '@tailor/shared';
import type { ServerEnv } from '@tailor/shared/env';

export interface AccessClaims {
  sub: string;
  role: Role;
}

const ISSUER = 'tailor-api';
const AUDIENCE = 'tailor';

export function createTokenSigner(env: Pick<ServerEnv, 'JWT_SECRET' | 'JWT_ACCESS_TTL_SECONDS'>) {
  const key = new TextEncoder().encode(env.JWT_SECRET);
  return {
    ttlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    async sign(claims: AccessClaims): Promise<string> {
      return new SignJWT({ role: claims.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(claims.sub)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${env.JWT_ACCESS_TTL_SECONDS}s`)
        .sign(key);
    },
    async verify(token: string): Promise<AccessClaims> {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ['HS256'],
        });
        if (!payload.sub || (payload['role'] !== 'USER' && payload['role'] !== 'ADMIN'))
          throw new Error('bad claims');
        return { sub: payload.sub, role: payload['role'] };
      } catch (e) {
        throw new AppError('UNAUTHORIZED', 'Your session has expired. Please sign in again.', 401, {
          cause: e,
        });
      }
    },
  };
}
export type TokenSigner = ReturnType<typeof createTokenSigner>;
