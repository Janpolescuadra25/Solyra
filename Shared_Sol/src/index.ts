/**
 * Solyra Core Types & System Contracts
 */

export type SystemPriority = 'REFLEX' | 'SURVIVAL' | 'USER' | 'LEARNING' | 'IDLE';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  uptimeSeconds: number;
  timestamp: string;
  version: string;
  service: string;
}

export type BrainstemState = 'OFFLINE' | 'BOOTING' | 'STANDBY' | 'ONLINE' | 'DEGRADED' | 'SHUTTING_DOWN';

export interface ReadinessStatus {
  ready: boolean;
  brainstem: 'online' | 'standby' | 'error' | BrainstemState;
  homeostasis: 'normal' | 'pressure' | 'critical';
  storage: 'connected' | 'disconnected';
  activeSlots: number;
  neurobus?: 'online' | 'offline' | 'degraded';
  arousal?: ArousalLevel;
}

export interface NeuroBusFrame<T = unknown> {
  id: string;
  priority: SystemPriority;
  channel: string;
  source: string;
  timestamp: number;
  payload: T;
}

export interface PriorityQueueDepth {
  REFLEX: number;
  SURVIVAL: number;
  USER: number;
  LEARNING: number;
  IDLE: number;
  total: number;
}

export interface NeuroBusMetrics {
  totalPublished: number;
  totalProcessed: number;
  totalDropped: number;
  queueDepth: PriorityQueueDepth;
  capacity: number;
  highWaterMark: number;
  activeSubscribers: number;
}

export type ArousalLevel = 'sleep' | 'drowsy' | 'alert' | 'hyperaroused';

export interface ArousalState {
  level: ArousalLevel;
  metabolicPressure: number;
  memoryPressure: number;
  timestamp: string;
}

export interface HomeostasisTelemetry {
  arousal: ArousalState;
  memory: {
    heapUsedBytes: number;
    heapTotalBytes: number;
    rssBytes: number;
    heapPercent: number;
  };
  sampleTimestamp: string;
}

export interface ThalamusGateDecision {
  accepted: boolean;
  reason?: string;
  assignedPriority: SystemPriority;
  channel: string;
}

// ============================================================================
// Phase 3: Domain Models & Persistence Contracts (Authentication & Storage)
// ============================================================================

export type UserRole = 'owner' | 'admin' | 'member' | 'guest';

export interface User {
  id: string;
  email: string;
  passwordHash?: string;
  fullName: string;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantContext {
  userId: string;
  workspaceId: string;
  role: UserRole;
  correlationId?: string;
}

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  isIsolated: boolean;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  userId: string;
  role: UserRole;
  joinedAt: Date;
}

export interface AuthSession {
  id: string;
  userId: string;
  workspaceId: string;
  tokenHash: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface SessionTokenPayload {
  sub: string;
  workspaceId: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface MessageAttachment {
  id: string;
  type: 'image' | 'document' | 'audio' | 'code';
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  role: MessageRole;
  content: string;
  attachments?: MessageAttachment[];
  tokenCount?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  modelIdentifier: string;
  systemPromptOverride?: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type MemoryTier = 'working' | 'short_term' | 'long_term' | 'episodic';

export interface MemoryRecord {
  id: string;
  tenantId: string;
  tier: MemoryTier;
  key: string;
  content: string;
  embedding?: number[];
  salience: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkingMemorySlot {
  slot: number;
  activeKey: string;
  summary: string;
  updatedAt: Date;
}

export interface RepositoryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  update(id: string, updates: Partial<User>): Promise<User>;
}

export interface IWorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findBySlug(slug: string): Promise<Workspace | null>;
  create(workspace: Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workspace>;
  getMembers(workspaceId: string): Promise<WorkspaceMembership[]>;
}

export interface IChatRepository {
  createConversation(conversation: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  appendMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage>;
  getRecentMessages(conversationId: string, limit: number): Promise<ChatMessage[]>;
}

export interface IMemoryRepository {
  store(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryRecord>;
  retrieve(tenantId: string, tier: MemoryTier, key: string): Promise<MemoryRecord | null>;
  searchBySalience(tenantId: string, tier: MemoryTier, minSalience: number): Promise<MemoryRecord[]>;
}
