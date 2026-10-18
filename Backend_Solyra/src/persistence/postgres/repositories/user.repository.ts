import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { User } from '@solyra/shared';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(user: Partial<User> & { email: string; passwordHash: string; fullName: string }): Promise<User>;
  update(id: string, updates: Partial<User>): Promise<User | null>;
  delete(id: string): Promise<boolean>;
  list(): Promise<User[]>;
  incrementFailedLoginAttempts(userId: string): Promise<number>;
  resetFailedLoginAttempts(userId: string): Promise<void>;
  lockUserAccount(userId: string, lockedUntil: Date): Promise<void>;
  updateOnboardingState(userId: string, state: 'pending' | 'in_progress' | 'completed'): Promise<User | null>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
}

export class PostgresUserRepository implements IUserRepository {
  constructor(private readonly pool: Pool) {}

  private mapRow(row: any): User {
    return {
      id: String(row.id),
      email: row.email,
      passwordHash: row.password_hash ?? row.passwordHash ?? '',
      fullName: row.full_name ?? row.fullName ?? '',
      role: row.role ?? 'user',
      isActive: row.is_active ?? row.isActive ?? true,
      isGuest: row.is_guest ?? row.isGuest ?? false,
      onboardingState: row.onboarding_state ?? row.onboardingState ?? 'pending',
      failedLoginAttempts: Number(row.failed_login_attempts ?? row.failedLoginAttempts ?? 0),
      lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
      createdAt: new Date(row.created_at ?? row.createdAt),
      updatedAt: new Date(row.updated_at ?? row.updatedAt),
    };
  }

  async findById(id: string): Promise<User | null> {
    const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows.length > 0 ? this.mapRow(res.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const res = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return res.rows.length > 0 ? this.mapRow(res.rows[0]) : null;
  }

  async create(user: Partial<User> & { email: string; passwordHash: string; fullName: string }): Promise<User> {
    const id = user.id ?? randomUUID();
    const role = user.role ?? 'user';
    const isActive = user.isActive ?? true;
    const isGuest = user.isGuest ?? false;
    const onboardingState = user.onboardingState ?? 'pending';

    const query = `
      INSERT INTO users (
        id, email, password_hash, full_name, role,
        is_active, is_guest, onboarding_state,
        failed_login_attempts, locked_until, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING
        id, email, password_hash AS "passwordHash", full_name AS "fullName",
        role, is_active AS "isActive", is_guest AS "isGuest",
        onboarding_state AS "onboardingState", failed_login_attempts AS "failedLoginAttempts",
        locked_until AS "lockedUntil", created_at AS "createdAt", updated_at AS "updatedAt";
    `;

    const result = await this.pool.query(query, [
      id,
      user.email.toLowerCase().trim(),
      user.passwordHash,
      user.fullName.trim(),
      role,
      isActive,
      isGuest,
      onboardingState,
    ]);

    return this.mapRow(result.rows[0]);
  }

  async update(id: string, updates: Partial<User>): Promise<User | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const merged: User = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    const query = `
      UPDATE users
      SET email = $1,
          password_hash = $2,
          full_name = $3,
          role = $4,
          is_active = $5,
          is_guest = $6,
          onboarding_state = $7,
          failed_login_attempts = $8,
          locked_until = $9,
          updated_at = $10
      WHERE id = $11
      RETURNING *;
    `;

    const values = [
      merged.email,
      merged.passwordHash,
      merged.fullName,
      merged.role,
      merged.isActive,
      merged.isGuest,
      merged.onboardingState,
      merged.failedLoginAttempts,
      merged.lockedUntil,
      merged.updatedAt,
      id,
    ];

    const res = await this.pool.query(query, values);
    return res.rows.length > 0 ? this.mapRow(res.rows[0]) : null;
  }

  async incrementFailedLoginAttempts(userId: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING failed_login_attempts;`,
      [userId]
    );
    return Number(res.rows[0]?.failed_login_attempts ?? 0);
  }

  async resetFailedLoginAttempts(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET failed_login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1;`,
      [userId]
    );
  }

  async lockUserAccount(userId: string, lockedUntil: Date): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET locked_until = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1;`,
      [userId, lockedUntil]
    );
  }

  async updateOnboardingState(userId: string, state: 'pending' | 'in_progress' | 'completed'): Promise<User | null> {
    const res = await this.pool.query(
      `UPDATE users
       SET onboarding_state = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING
         id, email, password_hash AS "passwordHash", full_name AS "fullName",
         role, is_active AS "isActive", is_guest AS "isGuest",
         onboarding_state AS "onboardingState", failed_login_attempts AS "failedLoginAttempts",
         locked_until AS "lockedUntil", created_at AS "createdAt", updated_at AS "updatedAt";`,
      [userId, state]
    );
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET password_hash = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1;`,
      [userId, passwordHash]
    );
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async list(): Promise<User[]> {
    const res = await this.pool.query('SELECT * FROM users ORDER BY created_at ASC');
    return res.rows.map((row) => this.mapRow(row));
  }
}
