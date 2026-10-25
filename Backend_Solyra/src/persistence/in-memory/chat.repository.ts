import { type Conversation, type ChatMessage } from '@solyra/shared';
import type { IChatRepository } from '../postgres/repositories/chat.repository.js';

export class InMemoryChatRepository implements IChatRepository {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, ChatMessage[]>();

  async createConversation(conversation: Conversation): Promise<Conversation> {
    const clone: Conversation = structuredClone(conversation);
    this.conversations.set(clone.id, clone);
    this.messages.set(clone.id, []);
    return structuredClone(clone);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const conversation = this.conversations.get(id);
    return conversation ? structuredClone(conversation) : null;
  }

  async listConversations(workspaceId: string, userId?: string): Promise<Conversation[]> {
    const results: Conversation[] = [];

    for (const conversation of this.conversations.values()) {
      if (conversation.workspaceId !== workspaceId) {
        continue;
      }
      if (userId && conversation.userId !== userId) {
        continue;
      }
      results.push(structuredClone(conversation));
    }

    return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
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

  clear(): void {
    this.conversations.clear();
    this.messages.clear();
  }
}
