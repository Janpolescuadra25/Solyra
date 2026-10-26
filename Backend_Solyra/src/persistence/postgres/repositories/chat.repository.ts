import { Pool } from 'pg';
import type { ArchiveState, ChatMessage, Conversation } from '@solyra/shared';

export interface IChatRepository {
  createConversation(conversation: Conversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  getConversationById(id: string): Promise<Conversation | null>;
  listConversations(workspaceId: string, userId?: string, includeArchived?: boolean): Promise<Conversation[]>;
  deleteConversation(id: string, workspaceId: string): Promise<boolean>;
  appendMessage(message: ChatMessage): Promise<ChatMessage>;
  getMessages(conversationId: string): Promise<ChatMessage[]>;
  archiveConversation(id: string, workspaceId?: string): Promise<boolean>;
  restoreConversation(id: string, workspaceId?: string): Promise<boolean>;
  softDeleteConversation(id: string, workspaceId?: string): Promise<boolean>;
  setRetentionExpiry(id: string, workspaceId?: string, expiresAt?: Date | null): Promise<boolean>;
  cleanupExpiredConversations(now?: Date, batchSize?: number): Promise<number>;
}

export class PostgresChatRepository implements IChatRepository {
  constructor(private readonly pool: Pool) {}

  private mapConversation(row: any): Conversation {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      title: row.title,
      modelIdentifier: row.model_identifier,
      systemPromptOverride: row.system_prompt_override ?? undefined,
      messageCount: Number(row.message_count ?? 0),
      archiveState: (row.archive_state as ArchiveState) ?? 'active',
      retentionExpiresAt: row.retention_expires_at ? new Date(row.retention_expires_at) : undefined,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapMessage(row: any): ChatMessage {
    return {
      id: row.id,
      conversationId: row.session_id,
      senderId: row.sender_id ?? row.sender,
      role: row.role,
      content: row.content,
      attachments: row.attachments ?? undefined,
      tokenCount: row.token_count ?? undefined,
      metadata: row.metadata ?? undefined,
      createdAt: new Date(row.created_at),
    };
  }

  async createConversation(conversation: Conversation): Promise<Conversation> {
    const query = `
      INSERT INTO chat_sessions (
        id, workspace_id, user_id, title, model_identifier,
        system_prompt_override, message_count, created_at, updated_at,
        archive_state, retention_expires_at, deleted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;

    const values = [
      conversation.id,
      conversation.workspaceId,
      conversation.userId,
      conversation.title,
      conversation.modelIdentifier,
      conversation.systemPromptOverride ?? null,
      conversation.messageCount ?? 0,
      conversation.createdAt ? conversation.createdAt.toISOString() : new Date().toISOString(),
      conversation.updatedAt ? conversation.updatedAt.toISOString() : new Date().toISOString(),
      conversation.archiveState ?? 'active',
      conversation.retentionExpiresAt ? conversation.retentionExpiresAt.toISOString() : null,
      conversation.deletedAt ? conversation.deletedAt.toISOString() : null,
    ];

    const res = await this.pool.query(query, values);
    return this.mapConversation(res.rows[0]);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const res = await this.pool.query('SELECT * FROM chat_sessions WHERE id = $1', [id]);
    return res.rows.length > 0 ? this.mapConversation(res.rows[0]) : null;
  }

  async getConversationById(id: string): Promise<Conversation | null> {
    return this.getConversation(id);
  }

  async listConversations(workspaceId: string, userId?: string, includeArchived: boolean = false): Promise<Conversation[]> {
    let query = 'SELECT * FROM chat_sessions WHERE workspace_id = $1 AND deleted_at IS NULL';
    const values: unknown[] = [workspaceId];

    if (userId) {
      query += ' AND user_id = $2';
      values.push(userId);
    }

    if (!includeArchived) {
      query += ' AND archive_state = \'active\'';
    }

    query += ' ORDER BY updated_at DESC';

    const res = await this.pool.query(query, values);
    return res.rows.map((row) => this.mapConversation(row));
  }

  async deleteConversation(id: string, workspaceId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM chat_sessions WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
    return (res.rowCount ?? 0) > 0;
  }

  async appendMessage(message: ChatMessage): Promise<ChatMessage> {
    const now = new Date();
    const query = `
      INSERT INTO chat_messages (id, session_id, sender_id, sender, role, content, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const meta = message.metadata ? JSON.stringify(message.metadata) : '{}';
    const res = await this.pool.query(query, [
      message.id,
      message.conversationId,
      message.senderId,
      message.senderId,
      message.role,
      message.content,
      meta,
      message.createdAt ?? now,
    ]);

    await this.pool.query(
      'UPDATE chat_sessions SET message_count = message_count + 1, updated_at = $1 WHERE id = $2',
      [message.createdAt ?? now, message.conversationId],
    );

    return this.mapMessage(res.rows[0]);
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const res = await this.pool.query('SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC', [conversationId]);
    return res.rows.map((row) => this.mapMessage(row));
  }

  async archiveConversation(id: string, workspaceId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE chat_sessions
       SET archive_state = 'archived', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND workspace_id = $2 AND archive_state = 'active' AND deleted_at IS NULL
       RETURNING id;`,
      [id, workspaceId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async restoreConversation(id: string, workspaceId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE chat_sessions
       SET archive_state = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND workspace_id = $2 AND archive_state = 'archived' AND deleted_at IS NULL
       RETURNING id;`,
      [id, workspaceId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async softDeleteConversation(id: string, workspaceId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE chat_sessions
       SET archive_state = 'deleted', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
       RETURNING id;`,
      [id, workspaceId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async setRetentionExpiry(id: string, workspaceId: string, expiresAt: Date | null): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE chat_sessions
       SET retention_expires_at = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
       RETURNING id;`,
      [id, workspaceId, expiresAt ? expiresAt.toISOString() : null],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async cleanupExpiredConversations(now: Date = new Date(), batchSize: number = 50): Promise<number> {
    const res = await this.pool.query(
      `WITH expired_batch AS (
         SELECT id
         FROM chat_sessions
         WHERE archive_state != 'deleted'
           AND retention_expires_at IS NOT NULL
           AND retention_expires_at <= $1
           AND deleted_at IS NULL
         LIMIT $2
       )
       UPDATE chat_sessions
       SET archive_state = 'deleted',
           deleted_at = NOW(),
           updated_at = NOW()
       WHERE id IN (SELECT id FROM expired_batch)
       RETURNING id;`,
      [now.toISOString(), batchSize],
    );

    return res.rowCount ?? 0;
  }
}
