/**
 * Council roles and governance contracts for the Solyra pure code-logic architecture.
 */

export const CouncilMemberRole = {
  YOSHI: 'YOSHI', // Planning, task ledger, priority, and session goals
  ASH: 'ASH',     // Knowledge retrieval, memory indexing, and provenance tracking
  BEN: 'BEN',     // Construction, DSL AST generation, and verification tests
  CHA: 'CHA'      // Web research, documentation, and external grounding
} as const;

export type CouncilMemberRole = typeof CouncilMemberRole[keyof typeof CouncilMemberRole];

export type CouncilTaskStatus = 'QUEUED' | 'ACTIVE' | 'BLOCKED' | 'COMPLETED' | 'FAILED';

export interface CouncilTaskLedgerEntry {
  taskId: string;
  assignedRole: CouncilMemberRole;
  title: string;
  status: CouncilTaskStatus;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface CouncilVote {
  role: CouncilMemberRole;
  approved: boolean;
  reason?: string;
  timestamp: number;
}

export interface CouncilDeliberation {
  proposalId: string;
  proposer: CouncilMemberRole;
  timestamp: number;
  votes: CouncilVote[];
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}
