import {
  CouncilMemberRole,
  CouncilTaskStatus,
  CouncilTaskLedgerEntry,
  BrainPackageManifest,
  BoundedAstProgram,
  SystemPriority,
  ArousalLevel,
  AccountState,
  AuditEvent,
  AuditEventType,
  AuthToken,
  AuthTokenType,
  EmailOutboxEntry,
  EmailOutboxStatus,
  AuthSession
} from './index';

// 1. Verify Council contracts
const sampleRole: CouncilMemberRole = CouncilMemberRole.YOSHI;
const sampleStatus: CouncilTaskStatus = 'ACTIVE';
const sampleTask: CouncilTaskLedgerEntry = {
  taskId: 'task-001',
  assignedRole: sampleRole,
  title: 'Test Task',
  status: sampleStatus,
  createdAt: Date.now(),
  updatedAt: Date.now()
};

// 2. Verify Package contracts
const sampleManifest: BrainPackageManifest = {
  schemaVersion: '1.0',
  brainId: 'brain-v1',
  version: '1.0.0',
  createdAt: Date.now(),
  runtimeConstraints: {
    maxMemoryBytes: 1024 * 1024,
    maxExecutionTimeMs: 500,
    boundedAstDepth: 5
  },
  modules: []
};

// 3. Verify AST contracts
const sampleAst: BoundedAstProgram = {
  version: '1.0',
  programId: 'prog-001',
  maxDepth: 3,
  body: [
    {
      type: 'ReturnStatement',
      value: { type: 'Literal', value: true }
    }
  ]
};

// 4. Verify account, session, audit, and email contracts remain functional
const priority: SystemPriority = SystemPriority.NORMAL;
const arousal: ArousalLevel = ArousalLevel.ENGAGED;
const sampleSession: AuthSession = {
  id: 'session-001',
  userId: 'user-001',
  workspaceId: 'workspace-001',
  tokenHash: 'hash-123',
  expiresAt: new Date(Date.now() + 3600_000),
  createdAt: new Date(),
  revokedAt: null,
  revocationReason: null
};
const sampleAccountState: AccountState = AccountState.ACTIVE;
const sampleAuditEvent: AuditEvent = {
  id: 'audit-001',
  userId: 'user-001',
  workspaceId: 'workspace-001',
  eventType: AuditEventType.USER_LOGIN,
  details: { method: 'password' },
  ipAddress: '127.0.0.1',
  userAgent: 'Solyra-Test',
  createdAt: new Date()
};
const sampleEmailOutboxEntry: EmailOutboxEntry = {
  id: 'email-001',
  userId: 'user-001',
  recipient: 'user@example.com',
  template: 'email_verification',
  payload: { code: '123456' },
  status: EmailOutboxStatus.PENDING,
  error: null,
  createdAt: new Date(),
  sentAt: null
};
const sampleAuthToken: AuthToken = {
  id: 'token-001',
  userId: 'user-001',
  tokenHash: 'token-hash',
  tokenType: AuthTokenType.EMAIL_VERIFICATION,
  expiresAt: new Date(Date.now() + 3600_000),
  createdAt: new Date(),
  consumedAt: null
};

console.log('CONTRACT_VERIFICATION_SUCCESS:', {
  role: sampleRole,
  taskId: sampleTask.taskId,
  brainId: sampleManifest.brainId,
  programId: sampleAst.programId,
  priority,
  arousal,
  sessionId: sampleSession.id,
  accountState: sampleAccountState,
  auditEvent: sampleAuditEvent.eventType,
  emailStatus: sampleEmailOutboxEntry.status,
  tokenType: sampleAuthToken.tokenType
});
