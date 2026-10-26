import { type Conversation, type ChatMessage } from '@solyra/shared';
import type { IChatRepository } from '../postgres/repositories/chat.repository.js';

export class InMemoryChatRepository implements IChatRepository {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, ChatMessage[]>();

  async createConversation(conversation: Conversation): Promise<Conversation> {
    const session: Conversation = {
      ...conversation,
      archiveState: conversation.archiveState ?? 'active',
      retentionExpiresAt: conversation.retentionExpiresAt ? new Date(conversation.retentionExpiresAt) : undefined,
      deletedAt: conversation.deletedAt ? new Date(conversation.deletedAt) : undefined,
      createdAt: new Date(conversation.createdAt),
      updatedAt: new Date(conversation.updatedAt),
    };

    this.conversations.set(session.id, session);
    this.messages.set(session.id, []);
    return structuredClone(session);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const conversation = this.conversations.get(id);
    return conversation ? structuredClone(conversation) : null;
  }

  async getConversationById(id: string): Promise<Conversation | null> {
    return this.getConversation(id);
  }

  async listConversations(workspaceId: string, userId?: string, includeArchived: boolean = false): Promise<Conversation[]> {
    return Array.from(this.conversations.values())
      .filter((conversation) => conversation.workspaceId === workspaceId)
      .filter((conversation) => (userId ? conversation.userId === userId : true))
      .filter((conversation) => !conversation.deletedAt && conversation.archiveState !== 'deleted')
      .filter((conversation) => (includeArchived ? true : (conversation.archiveState ?? 'active') === 'active'))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((conversation) => structuredClone(conversation));
  }

  async deleteConversation(id: string, workspaceId: string): Promise<boolean> {
    const conversation = this.conversations.get(id);
    if (!conversation || conversation.workspaceId !== workspaceId) {
      return false;
    }

    this.conversations.delete(id);
    this.messages.delete(id);
    return true;
  }

  async appendMessage(message: ChatMessage): Promise<ChatMessage> {
    const clone: ChatMessage = structuredClone(message);
    const nextList = this.messages.get(clone.conversationId) ?? [];
    nextList.push(clone);
    this.messages.set(clone.conversationId, nextList);

    const conversation = this.conversations.get(clone.conversationId);
    if (conversation) {
      conversation.updatedAt = new Date(clone.createdAt.getTime());
    }

    return structuredClone(clone);
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const list = this.messages.get(conversationId) ?? [];
    return list.map((message) => structuredClone(message));
  }

  async archiveConversation(id: string, workspaceId: string): Promise<boolean> {
    const session = this.conversations.get(id);
    if (!session || session.workspaceId !== workspaceId) return false;
    if (session.deletedAt || (session.archiveState ?? 'active') !== 'active') return false;

    session.archiveState = 'archived';
    session.updatedAt = new Date();
    return true;
  }

  async restoreConversation(id: string, workspaceId: string): Promise<boolean> {
    const session = this.conversations.get(id);
    if (!session || session.workspaceId !== workspaceId) return false;
    if (session.deletedAt || (session.archiveState ?? 'active') !== 'archived') return false;

    session.archiveState = 'active';
    session.updatedAt = new Date();
    return true;
  }

  async softDeleteConversation(id: string, workspaceId: string): Promise<boolean> {
    const session = this.conversations.get(id);
    if (!session || session.workspaceId !== workspaceId) return false;
    if (session.deletedAt || (session.archiveState ?? 'active') === 'deleted') return false;

    session.archiveState = 'deleted';
    session.deletedAt = new Date();
    session.updatedAt = new Date();
    return true;
  }

  async setRetentionExpiry(id: string, workspaceId: string, expiresAt: Date | null): Promise<boolean> {
    const session = this.conversations.get(id);
    if (!session || session.workspaceId !== workspaceId) return false;
    if (session.deletedAt || (session.archiveState ?? 'active') === 'deleted') return false;

    session.retentionExpiresAt = expiresAt ? new Date(expiresAt) : undefined;
    session.updatedAt = new Date();
    return true;
  }

  async cleanupExpiredConversations(now: Date = new Date(), batchSize: number = 50): Promise<number> {
    const expired = Array.from(this.conversations.values())
      .filter((conversation) => conversation.workspaceId)
      .filter((conversation) => conversation.retentionExpiresAt && conversation.archiveState !== 'deleted')
      .filter((conversation) => new Date(conversation.retentionExpiresAt as Date).getTime() <= now.getTime())
      .slice(0, batchSize);

    for (const conversation of expired) {
      conversation.archiveState = 'deleted';
      conversation.deletedAt = new Date(now);
      conversation.updatedAt = new Date(now);
    }

    return expired.length;
  }

  clear(): void {
    this.conversations.clear();
    this.messages.clear();
  }
}
