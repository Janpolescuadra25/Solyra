/**
 * Brain Package Manifest and Evaluation Contracts.
 * Governs the Author, Target, and Candidate package isolation workflow.
 */

export interface BrainModuleReference {
  name: string;
  entryPoint: string;
  sha256: string;
  moduleType: 'DSL_RULESET' | 'INDEX_LOOKUP' | 'HEURISTIC' | 'GRAMMAR';
}

export interface BrainPackageManifest {
  schemaVersion: '1.0';
  brainId: string;
  version: string;
  authorSignature?: string;
  createdAt: number;
  runtimeConstraints: {
    maxMemoryBytes: number;
    maxExecutionTimeMs: number;
    boundedAstDepth: number;
  };
  modules: BrainModuleReference[];
}

export interface BrainEvaluationHarness {
  harnessId: string;
  evaluatorVersion: string;
  heldOutTestSuiteId: string;
  resourceQuotas: {
    maxDurationSeconds: number;
    memoryLimitMb: number;
  };
}

export interface CandidateEvaluationResult {
  candidateBrainId: string;
  candidateSha256: string;
  developmentPassed: boolean;
  heldOutPassed: boolean;
  score: number;
  executionMetrics: {
    durationMs: number;
    peakMemoryBytes: number;
  };
  adjudication: 'PASS' | 'FAIL' | 'REGRESSION';
}
