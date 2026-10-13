import {
  CouncilMemberRole,
  type CouncilMemberRoleType,
  type CouncilStats,
  type CouncilDeliberationResult,
  type DeliberationProposal,
  type DeliberationVote,
} from '@solyra/shared';
import { globalBus } from '../neurobus/index.js';
import type { NeuroBus } from '../neurobus/neurobus.js';

export class CouncilEngine {
  private readonly members: Set<CouncilMemberRoleType>;
  private readonly proposals = new Map<string, DeliberationProposal>();
  private readonly stats: CouncilStats = {
    totalDeliberations: 0,
    approvedCount: 0,
    rejectedCount: 0,
    vetoedCount: 0,
    activeDeliberations: 0,
  };

  constructor(private readonly bus: NeuroBus = globalBus) {
    this.members = new Set<CouncilMemberRoleType>(
      Object.values(CouncilMemberRole) as CouncilMemberRoleType[],
    );
  }

  public getMembers(): CouncilMemberRoleType[] {
    return Array.from(this.members);
  }

  public createDeliberationProposal(
    id: string,
    title: string,
    description: string,
    initiator: CouncilMemberRoleType,
  ): DeliberationProposal {
    if (!this.members.has(initiator)) {
      throw new Error(`Invalid initiator role: ${initiator}`);
    }
    if (this.proposals.has(id)) {
      throw new Error(`Proposal with ID ${id} already exists`);
    }

    const proposal: DeliberationProposal = {
      id,
      title,
      description,
      initiator,
      votes: [],
      status: 'PENDING',
      createdAt: Date.now(),
    };

    this.proposals.set(id, proposal);
    this.stats.activeDeliberations++;

    this.bus.emit('council:deliberation:started', {
      proposalId: proposal.id,
      title: proposal.title,
      initiator: proposal.initiator,
    });

    return proposal;
  }

  public castVote(
    proposalId: string,
    member: CouncilMemberRoleType,
    approve: boolean,
    reason?: string,
    isVeto?: boolean,
  ): DeliberationVote {
    if (!this.members.has(member)) {
      throw new Error(`Invalid council member role: ${member}`);
    }

    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }
    if (proposal.status !== 'PENDING') {
      throw new Error(`Cannot vote on proposal with status ${proposal.status}`);
    }

    if (proposal.votes.some((vote) => vote.member === member)) {
      throw new Error(`Member ${member} has already voted on proposal ${proposalId}`);
    }

    const isVetoAuthority = member === CouncilMemberRole.REX || member === CouncilMemberRole.VAL;
    if (isVeto === true && !isVetoAuthority) {
      throw new Error(`Only ${CouncilMemberRole.REX} and ${CouncilMemberRole.VAL} can veto a deliberation`);
    }

    const vote: DeliberationVote = {
      member,
      approve: isVeto === true ? false : approve,
      reason,
      isVeto: isVeto === true && isVetoAuthority,
      timestamp: Date.now(),
    };

    proposal.votes.push(vote);
    return vote;
  }

  public concludeDeliberation(proposalId: string): CouncilDeliberationResult {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }
    if (proposal.status !== 'PENDING') {
      throw new Error(`Proposal ${proposalId} is already concluded with status ${proposal.status}`);
    }

    let approveCount = 0;
    let rejectCount = 0;
    let vetoingMember: CouncilMemberRoleType | undefined;

    for (const vote of proposal.votes) {
      if (vote.isVeto) {
        vetoingMember = vote.member;
      }
      if (vote.approve) {
        approveCount++;
      } else {
        rejectCount++;
      }
    }

    const majorityApproved = approveCount >= 4;
    const isApproved = majorityApproved && vetoingMember === undefined;

    proposal.status = isApproved ? 'APPROVED' : 'REJECTED';
    proposal.concludedAt = Date.now();

    this.stats.totalDeliberations++;
    this.stats.activeDeliberations = Math.max(0, this.stats.activeDeliberations - 1);

    if (isApproved) {
      this.stats.approvedCount++;
    } else {
      this.stats.rejectedCount++;
      if (vetoingMember) {
        this.stats.vetoedCount++;
      }
    }

    const result: CouncilDeliberationResult = {
      proposalId: proposal.id,
      approved: isApproved,
      voteTally: {
        approve: approveCount,
        reject: rejectCount,
        total: proposal.votes.length,
      },
      vetoedBy: vetoingMember,
      concludedAt: proposal.concludedAt,
    };

    this.bus.emit('council:deliberation:concluded', result);
    return result;
  }

  public getProposal(proposalId: string): DeliberationProposal | undefined {
    return this.proposals.get(proposalId);
  }

  public getCouncilStats(): CouncilStats {
    return { ...this.stats };
  }
}
