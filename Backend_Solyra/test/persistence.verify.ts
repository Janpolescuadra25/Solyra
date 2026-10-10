import type { User, Workspace, WorkspaceMembership, Conversation, ChatMessage, MemoryRecord } from '@solyra/shared';
import { createInMemoryPersistence } from '../src/persistence/index.js';

type TenantUser = User & { tenantId: string };
type TenantWorkspace = Workspace & { tenantId: string };
type TenantWorkspaceMembership = WorkspaceMembership & { tenantId: string };
type TenantConversation = Conversation & { tenantId: string };
type TenantChatMessage = ChatMessage & { tenantId: string };

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

async function runPersistenceSuite() {
  console.log('=== RUNNING PERSISTENCE SUBSYSTEM VERIFICATION SUITE ===');
  const db = createInMemoryPersistence();
  const tenantA = 'tenant-alpha';
  const tenantB = 'tenant-beta';

  const userA: TenantUser = {
    id: 'usr-101',
    tenantId: tenantA,
    email: 'alpha@example.com',
    fullName: 'Alpha User',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createUserA = await db.users.create(userA);
  assert(createUserA.success, 'User creation failed');
  assert(createUserA.data?.id === 'usr-101', 'Created user ID mismatch');

  const duplicateUser = await db.users.create({ ...userA, id: 'usr-102' } as TenantUser);
  assert(!duplicateUser.success, 'Allowed duplicate user email in same tenant');

  const tenantBUser: TenantUser = { ...userA, id: 'usr-201', tenantId: tenantB };
  const createTenantBUser = await db.users.create(tenantBUser);
  assert(createTenantBUser.success, 'User creation in separate tenant failed');

  const findCrossTenant = await db.users.findById(tenantB, 'usr-101');
  assert(findCrossTenant.success && findCrossTenant.data === null, 'Tenant isolation leak on user by id');

  const workspaceA: TenantWorkspace = {
    id: 'ws-101',
    tenantId: tenantA,
    slug: 'alpha-core',
    name: 'Alpha Workspace',
    ownerId: 'usr-101',
    isIsolated: false,
    settings: { theme: 'dark' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createWorkspace = await db.workspaces.create(workspaceA);
  assert(createWorkspace.success, 'Workspace creation failed');

  const duplicateSlug = await db.workspaces.create({ ...workspaceA, id: 'ws-102' } as TenantWorkspace);
  assert(!duplicateSlug.success, 'Allowed duplicate slug in same tenant');

  const membership: TenantWorkspaceMembership = {
    id: 'member-1',
    tenantId: tenantA,
    workspaceId: 'ws-101',
    userId: 'usr-101',
    role: 'owner',
    joinedAt: new Date(),
  };

  const memberResult = await db.workspaces.addMember(membership);
  assert(memberResult.success, 'Failed to add member to workspace');

  const membersResult = await db.workspaces.getMembers(tenantA, 'ws-101');
  assert(membersResult.success && membersResult.data?.length === 1, 'Failed to retrieve members');

  const conversationA: TenantConversation = {
    id: 'conv-101',
    tenantId: tenantA,
    workspaceId: 'ws-101',
    userId: 'usr-101',
    title: 'Project Strategy',
    modelIdentifier: 'gpt-4o',
    messageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createConversation = await db.chat.createConversation(conversationA);
  assert(createConversation.success, 'Conversation creation failed');

  const messageA: TenantChatMessage = {
    id: 'msg-001',
    tenantId: tenantA,
    conversationId: 'conv-101',
    senderId: 'usr-101',
    role: 'user',
    content: 'Initialize autonomic system',
    createdAt: new Date(),
  };

  const appendMessage = await db.chat.appendMessage(messageA);
  assert(appendMessage.success, 'Failed to append message');

  const listMessages = await db.chat.getMessages(tenantA, 'conv-101');
  assert(listMessages.success && listMessages.data?.length === 1, 'Message list retrieval failed');
  assert(listMessages.data?.[0]?.content === 'Initialize autonomic system', 'Message content mismatch');

  const crossTenantMessages = await db.chat.getMessages(tenantB, 'conv-101');
  assert(!crossTenantMessages.success, 'Cross-tenant chat isolation leak');

  const memoryOne: MemoryRecord = {
    id: 'mem-001',
    tenantId: tenantA,
    tier: 'working',
    key: 'current-task',
    content: 'Building Phase 3 persistence',
    salience: 0.9,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const memoryTwo: MemoryRecord = {
    id: 'mem-002',
    tenantId: tenantA,
    tier: 'working',
    key: 'recent-finding',
    content: 'Autonomic heartbeats healthy',
    salience: 0.75,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const memoryThree: MemoryRecord = {
    id: 'mem-003',
    tenantId: tenantA,
    tier: 'short_term',
    key: 'recent-finding',
    content: 'Autonomic heartbeats healthy',
    salience: 0.9,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const memoryStoreOne = await db.memory.store(memoryOne);
  const memoryStoreTwo = await db.memory.store(memoryTwo);
  const memoryStoreThree = await db.memory.store(memoryThree);
  assert(memoryStoreOne.success && memoryStoreTwo.success && memoryStoreThree.success, 'Memory store failed');

  const workingMemory = await db.memory.retrieve(tenantA, 'working', 'current-task');
  assert(workingMemory.success && workingMemory.data?.content === 'Building Phase 3 persistence', 'Memory retrieval failed');

  const workingSearch = await db.memory.searchBySalience(tenantA, 'working', 0.7);
  assert(workingSearch.success && workingSearch.data?.length === 2, 'Memory salience search failed');
  assert(workingSearch.data?.[0]?.content === 'Building Phase 3 persistence', 'Memory search ordering failed');

  const deleteResult = await db.memory.delete(tenantA, 'working', 'current-task');
  assert(deleteResult.success && deleteResult.data === true, 'Delete failed');

  const postDelete = await db.memory.retrieve(tenantA, 'working', 'current-task');
  assert(postDelete.success && postDelete.data === null, 'Memory record remained after deletion');

  console.log('>>> ALL PERSISTENCE TESTS PASSED CLEANLY!');
}

runPersistenceSuite().catch((error) => {
  console.error('[FATAL ERROR IN PERSISTENCE SUITE]', error);
  process.exit(1);
});
