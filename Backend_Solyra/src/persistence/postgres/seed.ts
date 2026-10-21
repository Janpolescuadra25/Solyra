import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';

import { getPgPool } from './pool.js';

export const OWNER_EMAIL = 'paulescuadra25@gmail.com';
export const OWNER_FULL_NAME = 'Solyra Owner';
export const OWNER_WORKSPACE_SLUG = 'solyra-owner';

export function requireOwnerPassword(env: NodeJS.ProcessEnv = process.env): string {
  const password = env.OWNER_INITIAL_PASSWORD;

  if (typeof password !== 'string' || password.trim().length === 0) {
    throw new Error('FAIL-CLOSED: OWNER_INITIAL_PASSWORD environment variable is required');
  }

  return password;
}

export async function ensureOwnerSeed(
  pool: Pick<Pool, 'query' | 'end'>,
  passwordOverride?: string,
): Promise<{ userId: string; workspaceId: string; created: boolean }> {
  const password = passwordOverride ?? requireOwnerPassword();

  const existingUserResult = await pool.query('SELECT * FROM users WHERE email = $1', [OWNER_EMAIL]);

  let userId: string;
  let created = false;

  if (existingUserResult.rows.length === 0) {
    const passwordHash = await bcrypt.hash(password, 12);
    const insertUserResult = await pool.query(
      `
        INSERT INTO users (
          id,
          email,
          password_hash,
          full_name,
          role,
          is_active,
          is_guest,
          onboarding_state,
          failed_login_attempts,
          locked_until,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id;
      `,
      [randomUUID(), OWNER_EMAIL.toLowerCase(), passwordHash, OWNER_FULL_NAME, 'owner', true, false, 'completed'],
    );

    userId = String(insertUserResult.rows[0]?.id ?? randomUUID());
    created = true;
  } else {
    const existingUser = existingUserResult.rows[0];
    userId = String(existingUser.id);

    const needsRoleOrStateUpdate =
      String(existingUser.role ?? 'user') !== 'owner' ||
      Boolean(existingUser.is_active) !== true ||
      String(existingUser.onboarding_state ?? 'pending') !== 'completed' ||
      Boolean(existingUser.is_guest) !== false;

    if (needsRoleOrStateUpdate) {
      await pool.query(
        `
          UPDATE users
          SET role = $2,
              is_active = $3,
              is_guest = $4,
              onboarding_state = $5,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1;
        `,
        [userId, 'owner', true, false, 'completed'],
      );
    }
  }

  const existingWorkspaceResult = await pool.query(
    'SELECT * FROM workspaces WHERE owner_id = $1 AND slug = $2',
    [userId, OWNER_WORKSPACE_SLUG],
  );

  let workspaceId: string;

  if (existingWorkspaceResult.rows.length === 0) {
    const workspaceInsert = await pool.query(
      `
        INSERT INTO workspaces (
          id,
          slug,
          name,
          owner_id,
          is_isolated,
          settings,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id;
      `,
      [randomUUID(), OWNER_WORKSPACE_SLUG, `${OWNER_FULL_NAME} Workspace`, userId, false, JSON.stringify({ ownerSeeded: true })],
    );

    workspaceId = String(workspaceInsert.rows[0]?.id ?? randomUUID());
  } else {
    workspaceId = String(existingWorkspaceResult.rows[0].id);
  }

  return { userId, workspaceId, created };
}

export async function runOwnerSeed(): Promise<number> {
  const pool = getPgPool();

  try {
    const result = await ensureOwnerSeed(pool);
    console.log(`Owner seed completed for ${OWNER_EMAIL} with workspace ${result.workspaceId}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return 1;
  } finally {
    await pool.end();
  }
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  const exitCode = await runOwnerSeed();
  process.exit(exitCode);
}
