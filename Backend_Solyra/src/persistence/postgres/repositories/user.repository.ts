import { Pool } from 'pg';
import type { User } from '@solyra/shared';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(user: User): Promise<User>;
  update(id: string, updates: Partial<User>): Promise<User | null>;
  delete(id: string): Promise<boolean>;
  list(): Promise<User[]>;
}

export class PostgresUserRepository implements IUserRepository {
  constructor(private readonly pool: Pool) {}

  private mapRow(row: any): User {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash ?? undefined,
      fullName: row.full_name,
      avatarUrl: row.avatar_url ?? undefined,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
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

  async create(user: User): Promise<User> {
    const now = new Date();
    const query = `
      INSERT INTO users (id, email, password_hash, full_name, avatar_url, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const values = [
      user.id,
      user.email,
      user.passwordHash ?? null,
      user.fullName,
      user.avatarUrl ?? null,
      user.isActive ?? true,
      user.createdAt ?? now,
      user.updatedAt ?? now,
    ];

    const res = await this.pool.query(query, values);
    return this.mapRow(res.rows[0]);
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
          avatar_url = $4,
          is_active = $5,
          updated_at = $6
      WHERE id = $7
      RETURNING *;
    `;

    const values = [
      merged.email,
      merged.passwordHash ?? null,
      merged.fullName,
      merged.avatarUrl ?? null,
      merged.isActive,
      merged.updatedAt,
      id,
    ];

    const res = await this.pool.query(query, values);
    return res.rows.length > 0 ? this.mapRow(res.rows[0]) : null;
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
