import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryBundle } from '../src/persistence/in-memory/index.js';
import { generateSecureToken, hashToken } from '../src/auth/utils.js';

describe('Step 17 Phase 1: Workspace Invitations', () => {
  let bundle: ReturnType<typeof createInMemoryBundle>;
  let ownerId: string;
  let workspaceId: string;

  beforeEach(() => {
    bundle = createInMemoryBundle();

    ownerId = '11111111-1111-4111-8111-111111111111';
    workspaceId = 'workspace-invitation-test-ws';

    bundle.users.create({
      id: ownerId,
      email: 'owner@example.com',
      passwordHash: 'hash',
      fullName: 'Owner User',
      role: 'user',
      isActive: true,
      isGuest: false,
      onboardingState: 'completed',
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    bundle.workspaces.create({
      id: workspaceId,
      slug: 'workspace-invitation-test',
      name: 'Workspace Invitation Test',
      ownerId,
      isIsolated: false,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('creates a token hash with the expected 64-character SHA-256 output', () => {
    const rawToken = generateSecureToken(32);
    assert.equal(rawToken.length, 64);

    const hashed = hashToken(rawToken);
    assert.equal(hashed.length, 64);
    assert.notEqual(hashed, rawToken);
  });

  it('creates an invitation and stores its token hash for lookup', async () => {
    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await bundle.workspaceInvitations.create({
      workspaceId,
      email: 'invitee@example.com',
      role: 'member',
      tokenHash,
      invitedBy: ownerId,
      expiresAt,
    });

    assert.ok(invitation.id);
    assert.equal(invitation.status, 'pending');
    assert.equal(invitation.email, 'invitee@example.com');
    assert.equal(invitation.role, 'member');

    const found = await bundle.workspaceInvitations.findByTokenHash(tokenHash);
    assert.ok(found);
    assert.equal(found?.id, invitation.id);
  });

  it('finds an active invitation for an email within a workspace', async () => {
    const rawToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await bundle.workspaceInvitations.create({
      workspaceId,
      email: 'duplicate@example.com',
      role: 'member',
      tokenHash: hashToken(rawToken),
      invitedBy: ownerId,
      expiresAt,
    });

    const active = await bundle.workspaceInvitations.findByWorkspaceAndEmail(workspaceId, 'duplicate@example.com');
    assert.ok(active);
    assert.equal(active?.email, 'duplicate@example.com');
  });

  it('accepts an invitation and moves it to the accepted status', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await bundle.workspaceInvitations.create({
      workspaceId,
      email: 'join@example.com',
      role: 'admin',
      tokenHash: hashToken(generateSecureToken(32)),
      invitedBy: ownerId,
      expiresAt,
    });

    const accepted = await bundle.workspaceInvitations.updateStatus(invitation.id, 'accepted', new Date());
    assert.equal(accepted?.status, 'accepted');
    assert.ok(accepted?.acceptedAt);
  });

  it('revokes a pending invitation and marks it revoked', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await bundle.workspaceInvitations.create({
      workspaceId,
      email: 'revoke@example.com',
      role: 'viewer',
      tokenHash: hashToken(generateSecureToken(32)),
      invitedBy: ownerId,
      expiresAt,
    });

    const revoked = await bundle.workspaceInvitations.revoke(invitation.id);
    assert.equal(revoked, true);

    const fetched = await bundle.workspaceInvitations.findById(invitation.id);
    assert.equal(fetched?.status, 'revoked');
  });

  it('lists invitations scoped to the workspace in reverse chronological order', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await bundle.workspaceInvitations.create({
      workspaceId,
      email: 'member1@example.com',
      role: 'member',
      tokenHash: hashToken(generateSecureToken(32)),
      invitedBy: ownerId,
      expiresAt,
    });

    await bundle.workspaceInvitations.create({
      workspaceId,
      email: 'member2@example.com',
      role: 'viewer',
      tokenHash: hashToken(generateSecureToken(32)),
      invitedBy: ownerId,
      expiresAt,
    });

    const list = await bundle.workspaceInvitations.listByWorkspace(workspaceId);
    assert.equal(list.length, 2);
    assert.ok(list.every((invitation) => invitation.workspaceId === workspaceId));
  });
});
