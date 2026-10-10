import type { Conversation, ChatMessage, RepositoryResult } from '@solyra/shared';

type TenantConversation = Conversation & { tenantId: string };
type TenantChatMessage = ChatMessage & { tenantId: string };

export class InMemoryChatRepository {
  private conversations = new Map<string, TenantConversation>();
  private messages = new Map<string, TenantChatMessage[]>();

  async createConversation(conversation: TenantConversation): Promise<RepositoryResult<TenantConversation>> {
    if (this.conversations.has(conversation.id)) {
      return { success: false, error: `Conversation with ID '${conversation.id}' already exists.` };
    }

    const cloned = structuredClone(conversation);
    this.conversations.set(cloned.id, cloned);
    this.messages.set(cloned.id, []);
    return { success: true, data: structuredClone(cloned) };
  }

  async getConversation(tenantId: string, id: string): Promise<RepositoryResult<TenantConversation | null>> {
    const conversation = this.conversations.get(id);
    if (!conversation || conversation.tenantId !== tenantId) {
      return { success: true, data: null };
    }
    return { success: true, data: structuredClone(conversation) };
  }

  async listConversations(tenantId: string, workspaceId: string): Promise<RepositoryResult<TenantConversation[]>> {
    const results: TenantConversation[] = [];
    for (const conversation of this.conversations.values()) {
      if (conversation.tenantId === tenantId && conversation.workspaceId === workspaceId) {
        results.push(structuredClone(conversation));
      }
    }
    return { success: true, data: results };
  }

  async appendMessage(message: TenantChatMessage): Promise<RepositoryResult<void>> {
    const conversation = this.conversations.get(message.conversationId);
    if (!conversation || conversation.tenantId !== message.tenantId) {
      return { success: false, error: `Conversation '${message.conversationId}' not found in tenant '${message.tenantId}'.` };
    }

    const nextList = this.messages.get(message.conversationId) ?? [];
    nextList.push(structuredClone(message));
    this.messages.set(message.conversationId, nextList);

    conversation.updatedAt = new Date(message.createdAt.getTime());
    return { success: true };
  }

  async getMessages(tenantId: string, conversationId: string): Promise<RepositoryResult<TenantChatMessage[]>> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.tenantId !== tenantId) {
      return { success: false, error: `Conversation '${conversationId}' not found in tenant '${tenantId}'.` };
    }

    const list = this.messages.get(conversationId) ?? [];
    return { success: true, data: structuredClone(list) };
  }
}
