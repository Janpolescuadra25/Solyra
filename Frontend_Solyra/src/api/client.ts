import axios from 'axios';

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

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const response = await client.get('/api/chat/conversations');
  return response.data?.conversations ?? response.data?.data ?? [];
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

client.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
