import { Pool } from 'pg';
import type { IKnowledgeRepository } from '@solyra/shared';

import { createPostgresPool, checkPostgresHealth, type SolyraPoolOptions } from './pool.js';
import { PostgresUserRepository, type IUserRepository } from './repositories/user.repository.js';
import { PostgresWorkspaceRepository, type IWorkspaceRepository } from './repositories/workspace.repository.js';
import { PostgresChatRepository, type IChatRepository } from './repositories/chat.repository.js';
import { PostgresKnowledgeRepository } from './repositories/knowledge.repository.js';
import { PostgresMemoryRepository, type IMemoryRepository } from './repositories/memory.repository.js';
import { SessionRepository, type ISessionRepository } from './repositories/session.repository.js';
import { EmailOutboxRepository, type IEmailOutboxRepository } from './repositories/email-outbox.repository.js';
import { AuditEventRepository, type IAuditEventRepository } from './repositories/audit-event.repository.js';

export interface PostgresPersistenceBundle {
  pool: Pool;
  users: IUserRepository;
  workspaces: IWorkspaceRepository;
  chat: IChatRepository;
  knowledge: IKnowledgeRepository;
  memory: IMemoryRepository;
  sessions: ISessionRepository;
  emailOutbox: IEmailOutboxRepository;
  audit: IAuditEventRepository;
  checkHealth: () => Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
}

export function createPostgresBundle(pool: Pool): PostgresPersistenceBundle {
  return {
    pool,
    users: new PostgresUserRepository(pool),
    workspaces: new PostgresWorkspaceRepository(pool),
    chat: new PostgresChatRepository(pool),
    knowledge: new PostgresKnowledgeRepository(pool),
    memory: new PostgresMemoryRepository(pool),
    sessions: new SessionRepository(pool),
    emailOutbox: new EmailOutboxRepository(pool),
    audit: new AuditEventRepository(pool),
    checkHealth: () => checkPostgresHealth(pool),
  };
}

export function createPostgresPersistence(options?: SolyraPoolOptions | Pool): PostgresPersistenceBundle {
  const pool = options instanceof Pool ? options : createPostgresPool(options);
  return createPostgresBundle(pool);
}

export * from './pool.js';
export * from './guard.js';
export * from './repositories/user.repository.js';
export * from './repositories/workspace.repository.js';
export * from './repositories/chat.repository.js';
export * from './repositories/knowledge.repository.js';
export * from './repositories/memory.repository.js';
export * from './repositories/session.repository.js';
export * from './repositories/email-outbox.repository.js';
export * from './repositories/audit-event.repository.js';
