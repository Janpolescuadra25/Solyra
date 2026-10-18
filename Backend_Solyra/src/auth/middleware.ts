import 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionTokenPayload } from '@solyra/shared';

import type { PostgresPersistenceBundle } from '../persistence/postgres/index.js';
import { hashToken, verifySessionToken } from './utils.js';

declare module 'node:http' {
  interface IncomingMessage {
    user?: SessionTokenPayload & { sessionId?: string };
    session?: {
      id: string;
      userId: string;
      workspaceId: string;
    };
  }
}

export function getResolvedJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable must be configured in production.');
    }
    return 'solyra-dev-jwt-secret-do-not-use-in-production-change-me';
  }
  return secret;
}

export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number = 15 * 60 * 1000,
    private readonly maxRequests: number = 10
  ) {}

  check(key: string): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
    const now = Date.now();

    for (const [bucketKey, bucket] of this.buckets.entries()) {
      const active = bucket.filter((timestamp) => now - timestamp < this.windowMs);
      if (active.length === 0) {
        this.buckets.delete(bucketKey);
      } else {
        this.buckets.set(bucketKey, active);
      }
    }

    const entries = this.buckets.get(key) ?? [];
    const recent = entries.filter((timestamp) => now - timestamp < this.windowMs);
    if (recent.length >= this.maxRequests) {
      const oldest = recent[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    const nextEntries = recent.length === 0 ? [] : recent;
    nextEntries.push(now);
    this.buckets.set(key, nextEntries);

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - nextEntries.length),
    };
  }
}

function sendJsonError(res: ServerResponse, statusCode: number, message: string): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: message }));
}

export async function authenticateRequest(
  req: IncomingMessage,
  res: ServerResponse,
  bundle: PostgresPersistenceBundle
): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    sendJsonError(res, 401, 'Authorization header required');
    return false;
  }

  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!headerValue.startsWith('Bearer ')) {
    sendJsonError(res, 401, 'Authorization header must use Bearer scheme');
    return false;
  }

  const token = headerValue.slice('Bearer '.length).trim();
  if (!token) {
    sendJsonError(res, 401, 'Authorization token is required');
    return false;
  }

  const jwtSecret = getResolvedJwtSecret();
  const payload = verifySessionToken<SessionTokenPayload & { sessionId?: string }>(token, jwtSecret);
  if (!payload) {
    sendJsonError(res, 401, 'Invalid or expired session token');
    return false;
  }

  const tokenHash = hashToken(token);
  const session = await bundle.sessions.findSessionByTokenHash(tokenHash);
  if (!session) {
    sendJsonError(res, 401, 'Session not found or has been invalidated');
    return false;
  }

  if (session.revokedAt != null) {
    sendJsonError(res, 401, 'Session has been revoked');
    return false;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    sendJsonError(res, 401, 'Session has expired');
    return false;
  }

  const user = await bundle.users.findById(session.userId);
  if (!user || !user.isActive) {
    sendJsonError(res, 403, 'Account is suspended or deactivated');
    return false;
  }

  req.user = payload;
  req.session = {
    id: session.id,
    userId: session.userId,
    workspaceId: session.workspaceId,
  };

  return true;
}

export { sendJsonError };
