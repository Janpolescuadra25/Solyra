import {
  CouncilMemberRole,
  CouncilTaskStatus,
  CouncilTaskLedgerEntry,
  BrainPackageManifest,
  BoundedAstProgram,
  SystemPriority,
  ArousalLevel
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

// 4. Verify existing contracts remain functional
const priority: SystemPriority = SystemPriority.NORMAL;
const arousal: ArousalLevel = ArousalLevel.ENGAGED;

console.log('CONTRACT_VERIFICATION_SUCCESS:', {
  role: sampleRole,
  taskId: sampleTask.taskId,
  brainId: sampleManifest.brainId,
  programId: sampleAst.programId,
  priority,
  arousal
});
