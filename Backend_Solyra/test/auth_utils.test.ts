import assert from 'node:assert/strict';
import test from 'node:test';

import {
  comparePassword,
  generateSecureToken,
  hashPassword,
  hashToken,
  signSessionToken,
  verifySessionToken,
} from '../src/auth/utils.js';

test('hashPassword creates a valid hash and comparePassword validates it', async () => {
  const password = 'Solyra!Secure123';
  const hash = await hashPassword(password);

  assert.equal(typeof hash, 'string');
  assert.ok(hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$'));
  assert.equal(await comparePassword(password, hash), true);
  assert.equal(await comparePassword('WrongPassword', hash), false);
});

test('generateSecureToken returns hex strings matching the requested byte length', () => {
  const token = generateSecureToken(16);

  assert.equal(token.length, 32);
  assert.match(token, /^[0-9a-f]+$/);
});

test('hashToken produces a deterministic SHA-256 digest', () => {
  const token = 'reset-token-123';
  const digest = hashToken(token);

  assert.equal(digest, '973a4c22db24f3228478499ef424be3fb06c14e872686d2af5e7baf68cac9177');
  assert.equal(digest.length, 64);
  assert.match(digest, /^[0-9a-f]+$/);
});

test('signSessionToken creates a verifiable JWT payload', () => {
  const payload = {
    sub: 'user-123',
    workspaceId: 'workspace-456',
    role: 'owner',
  };

  const secret = 'super-secret-key';
  const token = signSessionToken(payload, secret, '2h');
  const verified = verifySessionToken<typeof payload>(token, secret);

  assert.equal(typeof token, 'string');
  assert.ok(token.length > 0);
  assert.ok(verified);
  assert.equal(verified?.sub, payload.sub);
  assert.equal(verified?.workspaceId, payload.workspaceId);
  assert.equal(verified?.role, payload.role);
});

test('verifySessionToken returns null when the token is invalid or tampered', () => {
  const secret = 'super-secret-key';
  const validToken = signSessionToken({ sub: 'user-123' }, secret, '1h');

  assert.equal(verifySessionToken(validToken.slice(0, -1), secret), null);
  assert.equal(verifySessionToken(`${validToken}tamper`, secret), null);
  assert.equal(verifySessionToken('not-a-jwt', secret), null);
});
