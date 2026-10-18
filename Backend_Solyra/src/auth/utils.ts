import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const BCRYPT_SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signSessionToken(
  payload: Record<string, unknown>,
  secret: string,
  expiresIn: string | number = '1h'
): string {
  const hasExplicitExpiry = Object.prototype.hasOwnProperty.call(payload, 'exp');

  if (hasExplicitExpiry) {
    return jwt.sign(payload, secret);
  }

  return jwt.sign(payload, secret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifySessionToken<T = Record<string, unknown>>(
  token: string,
  secret: string
): T | null {
  try {
    return jwt.verify(token, secret) as T;
  } catch {
    return null;
  }
}
