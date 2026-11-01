import axios from 'axios';
import type { Organization, OrganizationRole, Workspace } from '@solyra/shared';

export const client = axios.create({
  baseURL: '/',
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface ChatExecutionMetadata {
  source?: string;
  programId?: string;
  stepsExecuted?: number;
  executionTimeMs?: number;
  success?: boolean;
  timestamp?: string;
}

export interface ChatMessage {
  id: string;
  conversationId?: string;
  conversation_id?: string;
  senderId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: ChatExecutionMetadata;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  workspaceId?: string;
  userId?: string;
  modelIdentifier?: string;
  messageCount?: number;
  archiveState?: 'active' | 'archived' | 'deleted';
  retentionExpiresAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageResponse {
  success: boolean;
  userMessage?: ChatMessage;
  assistantMessage?: ChatMessage;
  messages?: ChatMessage[];
  execution?: {
    programId?: string;
    stepsExecuted?: number;
    executionTimeMs?: number;
    success?: boolean;
  };
  error?: string;
}

export async function fetchConversations(includeArchived: boolean = false): Promise<ConversationSummary[]> {
  const query = includeArchived ? '?includeArchived=true' : '';
  const response = await client.get(`/api/chat/conversations${query}`);
  return response.data?.conversations ?? response.data?.data ?? [];
}

export async function archiveConversation(conversationId: string): Promise<ConversationSummary> {
  const response = await client.post(`/api/chat/conversations/${encodeURIComponent(conversationId)}/archive`);
  return response.data?.conversation ?? response.data?.data ?? null;
}

export async function restoreConversation(conversationId: string): Promise<ConversationSummary> {
  const response = await client.post(`/api/chat/conversations/${encodeURIComponent(conversationId)}/restore`);
  return response.data?.conversation ?? response.data?.data ?? null;
}

export async function softDeleteConversation(conversationId: string): Promise<ConversationSummary> {
  const response = await client.post(`/api/chat/conversations/${encodeURIComponent(conversationId)}/soft-delete`);
  return response.data?.conversation ?? response.data?.data ?? null;
}

export async function setConversationRetention(
  conversationId: string,
  retentionExpiresAt: string | null,
): Promise<ConversationSummary> {
  const response = await client.post(`/api/chat/conversations/${encodeURIComponent(conversationId)}/set-retention`, {
    retentionExpiresAt,
  });
  return response.data?.conversation ?? response.data?.data ?? null;
}

export async function createConversation(title?: string, modelIdentifier = 'solyra-default'): Promise<ConversationSummary> {
  const response = await client.post('/api/chat/conversations', {
    title: title || 'New Conversation',
    modelIdentifier,
  });
  return response.data?.conversation ?? response.data?.data ?? null;
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const response = await client.get(`/api/chat/conversations/${conversationId}/messages`);
  return response.data?.messages ?? response.data?.data ?? [];
}

export async function sendMessage(conversationId: string, content: string): Promise<SendMessageResponse> {
  const response = await client.post(`/api/chat/conversations/${conversationId}/messages`, { content });
  return response.data ?? {};
}

export function subscribeToChatStream(
  conversationId: string,
  onEvent: (data: any) => void,
  onError?: (err: any) => void,
): () => void {
  let isClosed = false;
  let retryCount = 0;
  let eventSource: EventSource | null = null;
  const maxRetries = 3;

  function connect() {
    if (isClosed) {
      return;
    }

    const url = `/api/chat/conversations/${encodeURIComponent(conversationId)}/stream`;
    eventSource = new EventSource(url, { withCredentials: true });

    eventSource.onmessage = (event) => {
      retryCount = 0;
      try {
        const parsed = JSON.parse(event.data);
        onEvent(parsed);
      } catch {
        onEvent({ type: 'raw', data: event.data });
      }
    };

    eventSource.onerror = (err) => {
      if (isClosed) {
        return;
      }

      eventSource?.close();
      if (retryCount < maxRetries) {
        const timeout = Math.pow(2, retryCount) * 1000;
        retryCount += 1;
        setTimeout(connect, timeout);
      } else {
        onError?.(err);
      }
    };
  }

  connect();

  return () => {
    isClosed = true;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

client.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const activeOrgId = sessionStorage.getItem('activeOrganizationId');
  if (activeOrgId && config.headers) config.headers['X-Organization-ID'] = activeOrgId;
  return config;
});

export interface ApiOrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; email: string; displayName?: string };
}

const unwrap = <T,>(data: any): T => data?.data ?? data;
export async function getOrganizations(): Promise<Organization[]> {
  const response = await client.get('/api/organizations');
  return response.data?.organizations ?? response.data?.data ?? [];
}
export async function getOrganization(id: string): Promise<Organization> {
  return unwrap<Organization>((await client.get(`/api/organizations/${encodeURIComponent(id)}`)).data);
}
export async function createOrganizationApi(data: { name: string; slug?: string }): Promise<Organization> {
  return unwrap<Organization>((await client.post('/api/organizations', data)).data);
}
export async function getOrganizationMembers(orgId: string): Promise<ApiOrganizationMember[]> {
  const data = (await client.get(`/api/organizations/${encodeURIComponent(orgId)}/members`)).data;
  return data?.members ?? data?.data ?? [];
}
export async function addOrganizationMember(orgId: string, data: { userId: string; role: OrganizationRole }): Promise<ApiOrganizationMember> {
  return unwrap<ApiOrganizationMember>((await client.post(`/api/organizations/${encodeURIComponent(orgId)}/members`, data)).data);
}

// Organization Workspace endpoints (Step 15 Phase 2)
export async function getOrganizationWorkspaces(orgId: string): Promise<Workspace[]> {
  const data = unwrap<any>((await client.get(`/api/organizations/${encodeURIComponent(orgId)}/workspaces`)).data);
  return data?.workspaces ?? (Array.isArray(data) ? data : []);
}

export async function createOrganizationWorkspace(orgId: string, workspaceId: string): Promise<Workspace> {
  return unwrap<Workspace>((await client.post(`/api/organizations/${encodeURIComponent(orgId)}/workspaces`, { workspaceId })).data);
}

export const linkOrganizationWorkspace = createOrganizationWorkspace;

export async function deleteOrganizationWorkspace(orgId: string, workspaceId: string): Promise<void> {
  await client.delete(`/api/organizations/${encodeURIComponent(orgId)}/workspaces/${encodeURIComponent(workspaceId)}`);
}

export const unlinkOrganizationWorkspace = deleteOrganizationWorkspace;

export async function updateOrganizationMemberRole(orgId: string, userId: string, role: OrganizationRole): Promise<ApiOrganizationMember> {
  return unwrap<ApiOrganizationMember>((await client.put(`/api/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`, { role })).data);
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('token');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
