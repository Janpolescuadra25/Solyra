export * from './ast.js';

/**
 * Solyra Core Types & System Contracts
 */

export const SystemPriority = {
  REFLEX: 'REFLEX',
  SURVIVAL: 'SURVIVAL',
  USER: 'USER',
  LEARNING: 'LEARNING',
  IDLE: 'IDLE',
  NORMAL: 'USER'
} as const;

export type SystemPriority = typeof SystemPriority[keyof typeof SystemPriority];

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
  dispatched?: boolean;
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

export const ArousalLevel = {
  SLEEP: 'sleep',
  DROWSY: 'drowsy',
  ALERT: 'alert',
  HYPERAROUSED: 'hyperaroused',
  ENGAGED: 'alert'
} as const;

export type ArousalLevel = typeof ArousalLevel[keyof typeof ArousalLevel];

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
  passwordHash: string;
  fullName: string;
  avatarUrl?: string;
  role: string;
  isActive: boolean;
  isGuest: boolean;
  onboardingState: 'pending' | 'in_progress' | 'completed';
  failedLoginAttempts: number;
  lockedUntil: Date | null;
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
  revokedAt?: Date | string | null;
  revocationReason?: string | null;
}

export enum AccountState {
  REGISTERED = 'REGISTERED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETION_PENDING = 'DELETION_PENDING',
  DELETED = 'DELETED',
}

export enum AuditEventType {
  USER_SIGNUP = 'USER_SIGNUP',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  ONBOARDING_COMPLETED = 'ONBOARDING_COMPLETED',
  PACKAGE_ACTIVATED = 'PACKAGE_ACTIVATED',
  PACKAGE_DEACTIVATED = 'PACKAGE_DEACTIVATED',
  PACKAGE_ROLLED_BACK = 'PACKAGE_ROLLED_BACK',
  ADMIN_ACTION = 'ADMIN_ACTION',
}

export interface AuditEvent {
  id: string;
  userId?: string | null;
  workspaceId?: string | null;
  eventType: AuditEventType;
  details: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date | string;
}

export enum EmailOutboxStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export interface EmailOutboxEntry {
  id: string;
  userId: string;
  recipient: string;
  template: string;
  payload: Record<string, unknown>;
  status: EmailOutboxStatus;
  error?: string | null;
  createdAt: Date | string;
  sentAt?: Date | string | null;
}

export enum AuthTokenType {
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
  REFRESH = 'REFRESH',
}

export interface AuthToken {
  id: string;
  userId: string;
  tokenHash: string;
  tokenType: AuthTokenType;
  expiresAt: Date | string;
  consumedAt?: Date | string | null;
  createdAt: Date | string;
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

export interface KnowledgeNode {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  embedding?: number[];
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SemanticSearchResult<T = KnowledgeNode> {
  node: T;
  similarity: number;
}

// Phase 1: Council, Package Manifest, and AST contracts
export * from './council';
export * from './package';
export * from './ast';

export interface IKnowledgeRepository {
  create(node: KnowledgeNode): Promise<KnowledgeNode>;
  findById(id: string, workspaceId: string): Promise<KnowledgeNode | null>;
  update(id: string, workspaceId: string, updates: Partial<KnowledgeNode>): Promise<KnowledgeNode | null>;
  delete(id: string, workspaceId: string): Promise<boolean>;
  listByWorkspace(workspaceId: string): Promise<KnowledgeNode[]>;
  searchBySemanticSimilarity(
    workspaceId: string,
    queryEmbedding: number[],
    minSimilarity?: number,
    limit?: number,
  ): Promise<SemanticSearchResult[]>;
}
