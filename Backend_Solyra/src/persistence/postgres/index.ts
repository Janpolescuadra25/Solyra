import { Pool } from 'pg';

import { createPostgresPool, checkPostgresHealth, type SolyraPoolOptions } from './pool.js';
import { PostgresUserRepository, type IUserRepository } from './repositories/user.repository.js';
import { PostgresWorkspaceRepository, type IWorkspaceRepository } from './repositories/workspace.repository.js';
import { PostgresChatRepository, type IChatRepository } from './repositories/chat.repository.js';
import { PostgresKnowledgeRepository, type IKnowledgeRepository } from './repositories/knowledge.repository.js';

export interface PostgresPersistenceBundle {
  pool: Pool;
  users: IUserRepository;
  workspaces: IWorkspaceRepository;
  chat: IChatRepository;
  knowledge: IKnowledgeRepository;
  checkHealth: () => Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
}

export function createPostgresPersistence(options?: SolyraPoolOptions | Pool): PostgresPersistenceBundle {
  const pool = options instanceof Pool ? options : createPostgresPool(options);

  return {
    pool,
    users: new PostgresUserRepository(pool),
    workspaces: new PostgresWorkspaceRepository(pool),
    chat: new PostgresChatRepository(pool),
    knowledge: new PostgresKnowledgeRepository(pool),
    checkHealth: () => checkPostgresHealth(pool),
  };
}

export * from './pool.js';
export * from './repositories/user.repository.js';
export * from './repositories/workspace.repository.js';
export * from './repositories/chat.repository.js';
export * from './repositories/knowledge.repository.js';
