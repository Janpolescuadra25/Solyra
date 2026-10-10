import {
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
  InMemoryChatRepository,
  InMemoryMemoryRepository,
} from './in-memory/index.js';

export * from './in-memory/index.js';
export * from './postgres/index.js';
export { createPostgresPersistence } from './postgres/index.js';

export interface PersistenceBundle {
  users: InMemoryUserRepository;
  workspaces: InMemoryWorkspaceRepository;
  chat: InMemoryChatRepository;
  memory: InMemoryMemoryRepository;
}

export function createInMemoryPersistence(): PersistenceBundle {
  return {
    users: new InMemoryUserRepository(),
    workspaces: new InMemoryWorkspaceRepository(),
    chat: new InMemoryChatRepository(),
    memory: new InMemoryMemoryRepository(),
  };
}
