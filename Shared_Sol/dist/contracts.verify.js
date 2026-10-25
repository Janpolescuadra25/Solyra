"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("./index.js");
// 1. Verify Council contracts
const sampleRole = index_js_1.CouncilMemberRole.YOSHI;
const sampleStatus = 'ACTIVE';
const sampleTask = {
    taskId: 'task-001',
    assignedRole: sampleRole,
    title: 'Test Task',
    status: sampleStatus,
    createdAt: Date.now(),
    updatedAt: Date.now()
};
// 2. Verify Package contracts
const sampleManifest = {
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
const sampleAst = {
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
const priority = index_js_1.SystemPriority.NORMAL;
const arousal = index_js_1.ArousalLevel.ENGAGED;
const sampleSession = {
    id: 'session-001',
    userId: 'user-001',
    workspaceId: 'workspace-001',
    tokenHash: 'hash-123',
    expiresAt: new Date(Date.now() + 3600_000),
    createdAt: new Date(),
    revokedAt: null,
    revocationReason: null
};
const sampleAccountState = index_js_1.AccountState.ACTIVE;
const sampleAuditEvent = {
    id: 'audit-001',
    userId: 'user-001',
    workspaceId: 'workspace-001',
    eventType: index_js_1.AuditEventType.USER_LOGIN,
    details: { method: 'password' },
    ipAddress: '127.0.0.1',
    userAgent: 'Solyra-Test',
    createdAt: new Date()
};
const sampleEmailOutboxEntry = {
    id: 'email-001',
    userId: 'user-001',
    recipient: 'user@example.com',
    template: 'email_verification',
    payload: { code: '123456' },
    status: index_js_1.EmailOutboxStatus.PENDING,
    error: null,
    createdAt: new Date(),
    sentAt: null
};
const sampleAuthToken = {
    id: 'token-001',
    userId: 'user-001',
    tokenHash: 'token-hash',
    tokenType: index_js_1.AuthTokenType.EMAIL_VERIFICATION,
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
