import { Pool } from 'pg';
import type { ChatMessage, Conversation } from '@solyra/shared';

export interface IChatRepository {
  createConversation(conversation: Conversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  listConversations(workspaceId: string, userId?: string): Promise<Conversation[]>;
  deleteConversation(id: string, workspaceId: string): Promise<boolean>;
  appendMessage(message: ChatMessage): Promise<ChatMessage>;
  getMessages(conversationId: string): Promise<ChatMessage[]>;
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
    const now = new Date();
    const query = `
      INSERT INTO chat_sessions (
        id, workspace_id, user_id, title, model_identifier, system_prompt_override, message_count, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const res = await this.pool.query(query, [
      conversation.id,
      conversation.workspaceId,
      conversation.userId,
      conversation.title,
      conversation.modelIdentifier,
      conversation.systemPromptOverride ?? null,
      conversation.messageCount ?? 0,
      conversation.createdAt ?? now,
      conversation.updatedAt ?? now,
    ]);

    return this.mapConversation(res.rows[0]);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const res = await this.pool.query('SELECT * FROM chat_sessions WHERE id = $1', [id]);
    return res.rows.length > 0 ? this.mapConversation(res.rows[0]) : null;
  }

  async listConversations(workspaceId: string, userId?: string): Promise<Conversation[]> {
    if (userId) {
      const res = await this.pool.query(
        'SELECT * FROM chat_sessions WHERE workspace_id = $1 AND user_id = $2 ORDER BY updated_at DESC',
        [workspaceId, userId],
      );
      return res.rows.map((row) => this.mapConversation(row));
    }

    const res = await this.pool.query('SELECT * FROM chat_sessions WHERE workspace_id = $1 ORDER BY updated_at DESC', [workspaceId]);
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
}
