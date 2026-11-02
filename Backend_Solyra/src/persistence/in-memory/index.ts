export * from './user.repository.js';
export * from './workspace.repository.js';
export * from './organization.repository.js';
export * from './chat.repository.js';
export * from './memory.repository.js';
export * from './workspace-invitation.repository.js';

import { InMemoryUserRepository } from './user.repository.js';
import { InMemoryWorkspaceRepository } from './workspace.repository.js';
import { InMemoryOrganizationRepository } from './organization.repository.js';
import { InMemoryChatRepository } from './chat.repository.js';
import { InMemoryMemoryRepository } from './memory.repository.js';
import { InMemoryWorkspaceInvitationRepository } from './workspace-invitation.repository.js';
import type { IWorkspaceInvitationRepository } from '../postgres/repositories/workspace-invitation.repository.js';

export interface InMemoryPersistenceBundle {
  users: any;
  workspaces: any;
  organizations: any;
  chats: any;
  memories: any;
  workspaceInvitations: IWorkspaceInvitationRepository;
  emailOutbox?: any;
  audit?: any;
}

export function createInMemoryBundle(): InMemoryPersistenceBundle {
  return {
    users: new InMemoryUserRepository(),
    workspaces: new InMemoryWorkspaceRepository(),
    organizations: new InMemoryOrganizationRepository(),
    chats: new InMemoryChatRepository(),
    memories: new InMemoryMemoryRepository(),
    workspaceInvitations: new InMemoryWorkspaceInvitationRepository(),
  };
}
