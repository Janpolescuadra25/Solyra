/**
 * Council roles and governance contracts for the Solyra pure code-logic architecture.
 */

export const CouncilMemberRole = {
  YOSHI: 'YOSHI', // Planning, task ledger, priority, and session goals
  ASH: 'ASH',     // Knowledge retrieval, memory indexing, and provenance tracking
  BEN: 'BEN',     // Construction, DSL AST generation, and verification tests
  CHA: 'CHA',     // Web research, documentation, and external grounding
  REX: 'REX',     // Permissions, security boundaries, and execution restrictions
  VAL: 'VAL',     // Independent correctness checks, candidate evaluation, and regression detection
  LIA: 'LIA'      // Request fulfillment, answer organization, and clear communication
} as const;

export type CouncilMemberRoleType = typeof CouncilMemberRole[keyof typeof CouncilMemberRole];
export type CouncilMemberRole = CouncilMemberRoleType;

export type CouncilTaskStatus =
  | 'QUEUED'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'FAILED'
  | 'PROPOSED'
  | 'DELIBERATING'
  | 'APPROVED'
  | 'REJECTED'
  | 'VETOED'
  | 'EXECUTING';

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

export interface DeliberationVote {
  member: CouncilMemberRoleType;
  approve: boolean;
  reason?: string;
  isVeto?: boolean;
  timestamp: number;
}

export interface DeliberationProposal {
  id: string;
  title: string;
  description: string;
  initiator: CouncilMemberRoleType;
  votes: DeliberationVote[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: number;
  concludedAt?: number;
}

export interface CouncilDeliberationResult {
  proposalId: string;
  approved: boolean;
  voteTally: {
    approve: number;
    reject: number;
    total: number;
  };
  vetoedBy?: CouncilMemberRoleType;
  concludedAt: number;
}

export interface CouncilStats {
  totalDeliberations: number;
  approvedCount: number;
  rejectedCount: number;
  vetoedCount: number;
  activeDeliberations: number;
}
