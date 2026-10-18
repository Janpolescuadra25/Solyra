import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { EmailOutboxEntry } from '@solyra/shared';

export interface IEmailOutboxRepository {
  queueEmail(data: {
    id?: string;
    userId?: string;
    recipientEmail: string;
    subject: string;
    template: string;
    payload: Record<string, unknown>;
  }): Promise<EmailOutboxEntry>;
  findPendingEmails(limit?: number): Promise<EmailOutboxEntry[]>;
  markEmailSent(id: string): Promise<void>;
  recordEmailFailure(id: string, errorMessage?: string): Promise<void>;
}

export class EmailOutboxRepository implements IEmailOutboxRepository {
  constructor(private readonly pool: Pool) {}

  private mapRow(row: any): EmailOutboxEntry {
    return {
      id: row.id,
      userId: row.user_id,
      recipient: row.recipient,
      template: row.template,
      payload: row.payload ?? {},
      status: row.status,
      error: row.error ?? null,
      createdAt: new Date(row.created_at),
      sentAt: row.sent_at ? new Date(row.sent_at) : null,
    };
  }

  async queueEmail(data: {
    id?: string;
    userId?: string;
    recipientEmail: string;
    subject: string;
    template: string;
    payload: Record<string, unknown>;
  }): Promise<EmailOutboxEntry> {
    const id = data.id ?? randomUUID();
    const userId = data.userId ?? '00000000-0000-0000-0000-000000000000';
    const payload = {
      subject: data.subject,
      ...data.payload,
    };
    const res = await this.pool.query(
      `
        INSERT INTO email_outbox (id, user_id, recipient, template, payload, status, error, created_at, sent_at)
        VALUES ($1, $2, $3, $4, $5, 'PENDING', NULL, NOW(), NULL)
        RETURNING *
      `,
      [id, userId, data.recipientEmail, data.template, JSON.stringify(payload)]
    );

    return this.mapRow(res.rows[0]);
  }

  async findPendingEmails(limit = 25): Promise<EmailOutboxEntry[]> {
    const res = await this.pool.query(
      `SELECT * FROM email_outbox WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT $1`,
      [limit]
    );
    return res.rows.map((row: any) => this.mapRow(row));
  }

  async markEmailSent(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE email_outbox SET status = 'SENT', sent_at = NOW(), error = NULL WHERE id = $1`,
      [id]
    );
  }

  async recordEmailFailure(id: string, errorMessage?: string): Promise<void> {
    await this.pool.query(
      `UPDATE email_outbox SET status = 'FAILED', error = $1, sent_at = NOW() WHERE id = $2`,
      [errorMessage ?? 'Email delivery failed', id]
    );
  }
}
