import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Clipboard, Clock3, Loader2, Plus, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  createWorkspaceInvitation,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  updateWorkspaceMemberRole,
  type WorkspaceInvitation,
  type WorkspaceInvitationRole,
  type WorkspaceInvitationStatus,
  type WorkspaceMember,
} from '../../api/client';

const normalizeRole = (value?: string): WorkspaceInvitationRole => {
  const normalized = (value ?? 'MEMBER').toString().toUpperCase();
  if (normalized === 'OWNER' || normalized === 'ADMIN' || normalized === 'MEMBER') {
    return normalized as WorkspaceInvitationRole;
  }
  return 'MEMBER';
};

const normalizeStatus = (value?: string): WorkspaceInvitationStatus => {
  const normalized = (value ?? 'PENDING').toString().toUpperCase();
  if (normalized === 'PENDING' || normalized === 'ACCEPTED' || normalized === 'REVOKED' || normalized === 'EXPIRED') {
    return normalized as WorkspaceInvitationStatus;
  }
  return 'PENDING';
};

const roleLabel = (role: WorkspaceInvitationRole): string => {
  if (role === 'OWNER') return 'Owner';
  if (role === 'ADMIN') return 'Admin';
  return 'Member';
};

const buildInviteLink = (token?: string): string | null => {
  if (!token) return null;
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://localhost:5173';
  return `${base}/invitations/accept/${encodeURIComponent(token)}`;
};

const statusBadgeClasses = (status: WorkspaceInvitationStatus): string => {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300';
    case 'ACCEPTED':
      return 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300';
    case 'REVOKED':
      return 'bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300';
    case 'EXPIRED':
      return 'bg-slate-500/10 text-slate-700 ring-1 ring-inset ring-slate-500/20 dark:bg-slate-700/30 dark:text-slate-300';
    default:
      return 'bg-slate-500/10 text-slate-700 ring-1 ring-inset ring-slate-500/20 dark:bg-slate-700/30 dark:text-slate-300';
  }
};

const memberRoleOptions = ['owner', 'admin', 'member', 'viewer'] as const;

interface WorkspaceInvitationsTabProps {
  workspaceId: string;
  userRole?: string | null;
  currentUserId?: string;
  workspaceUserRole?: string | null;
}

export const WorkspaceInvitationsTab: React.FC<WorkspaceInvitationsTabProps> = ({
  workspaceId,
  userRole,
  currentUserId,
  workspaceUserRole,
}) => {
  const { user } = useAuth();
  const resolvedUserId = currentUserId || user?.id;
  const [activeSection, setActiveSection] = useState<'members' | 'invitations'>('members');
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<WorkspaceInvitationRole>('MEMBER');
  const [expiresInDays, setExpiresInDays] = useState<number>(7);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [generatedInvite, setGeneratedInvite] = useState<{ url: string; email: string } | null>(null);
  const [copiedInvitationId, setCopiedInvitationId] = useState<string | null>(null);

  const myMembership = members.find((member) => member.userId === resolvedUserId);
  const effectiveRole = (workspaceUserRole || myMembership?.role || userRole || 'member').toLowerCase();
  const canManage = userRole === 'owner' || userRole === 'admin' || effectiveRole === 'owner' || effectiveRole === 'admin';
  const canManageMembers = effectiveRole === 'owner' || effectiveRole === 'admin';

  const fetchMembers = useCallback(async () => {
    if (!workspaceId) {
      setMembers([]);
      return;
    }

    try {
      setLoadingMembers(true);
      setMemberError(null);
      const nextMembers = await listWorkspaceMembers(workspaceId);
      setMembers(nextMembers);
    } catch (error: any) {
      setMemberError(error?.message || 'Failed to load workspace members.');
    } finally {
      setLoadingMembers(false);
    }
  }, [workspaceId]);

  const fetchInvitations = async () => {
    if (!workspaceId) {
      setInvitations([]);
      return;
    }

    try {
      setIsLoading(true);
      const response = await listWorkspaceInvitations(workspaceId);
      const nextInvitations = (response.invitations ?? []).map((invitation) => ({
        ...invitation,
        role: normalizeRole(invitation.role),
        status: normalizeStatus(invitation.status),
        token: invitation.token,
      }));
      setInvitations(nextInvitations);
    } catch (error: any) {
      setInvitations([]);
      setFormError(error?.response?.data?.message || error?.message || 'Unable to load workspace invitations.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'members') {
      void fetchMembers();
    }
  }, [activeSection, fetchMembers]);

  useEffect(() => {
    void fetchInvitations();
  }, [workspaceId]);

  const handleRoleChange = async (member: WorkspaceMember, nextRole: string) => {
    const normalizedRole = nextRole.toLowerCase();
    if (member.userId === resolvedUserId) {
      setMemberError('You cannot modify your own workspace role.');
      return;
    }

    if (effectiveRole === 'admin' && member.role === 'owner') {
      setMemberError('Admins cannot modify owner roles.');
      return;
    }

    if (member.role === normalizedRole) {
      return;
    }

    const ownerCount = members.filter((entry) => entry.role === 'owner').length;
    if (member.role === 'owner' && normalizedRole !== 'owner' && ownerCount <= 1) {
      setMemberError('Cannot demote the sole workspace owner.');
      return;
    }

    try {
      setMemberActionLoading(member.userId);
      setMemberError(null);
      setMemberSuccess(null);
      const updated = await updateWorkspaceMemberRole(workspaceId, member.userId, normalizedRole);
      setMembers((currentMembers) => currentMembers.map((entry) => {
        if (entry.userId !== member.userId) {
          return entry;
        }
        return { ...entry, role: updated.role || normalizedRole };
      }));
      setMemberSuccess(`Updated ${member.user?.fullName || member.user?.email || member.userId} to ${updated.role}.`);
    } catch (error: any) {
      setMemberError(error?.message || 'Failed to update member role.');
    } finally {
      setMemberActionLoading(null);
    }
  };

  const handleRemoveMember = async (member: WorkspaceMember) => {
    if (member.userId === resolvedUserId) {
      setMemberError('You cannot remove yourself from the workspace.');
      return;
    }

    const ownerCount = members.filter((entry) => entry.role === 'owner').length;
    if (member.role === 'owner' && ownerCount <= 1) {
      setMemberError('Cannot remove the sole workspace owner.');
      return;
    }

    if (effectiveRole === 'admin' && member.role === 'owner') {
      setMemberError('Admins cannot remove owner accounts.');
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to remove ${member.user?.fullName || member.user?.email || member.userId} from this workspace?`);
    if (!confirmed) {
      return;
    }

    try {
      setMemberActionLoading(member.userId);
      setMemberError(null);
      setMemberSuccess(null);
      await removeWorkspaceMember(workspaceId, member.userId);
      setMembers((currentMembers) => currentMembers.filter((entry) => entry.userId !== member.userId));
      setMemberSuccess(`Removed ${member.user?.fullName || member.user?.email || member.userId} from the workspace.`);
    } catch (error: any) {
      setMemberError(error?.message || 'Failed to remove workspace member.');
    } finally {
      setMemberActionLoading(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!workspaceId) {
      return;
    }

    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError('Please provide a valid email address.');
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      const payloadRole = selectedRole.toUpperCase() as 'OWNER' | 'ADMIN' | 'MEMBER';
      const response = await createWorkspaceInvitation(workspaceId, {
        email: trimmedEmail,
        role: payloadRole,
        expiresInDays,
      });

      const newInvitation = {
        ...(response.invitation ?? {
          id: `invite-${Date.now()}`,
          workspaceId,
          email: trimmedEmail,
          role: selectedRole,
          status: 'PENDING',
          invitedBy: 'current-user',
          expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        role: normalizeRole(response.invitation?.role ?? selectedRole),
        status: normalizeStatus(response.invitation?.status ?? 'PENDING'),
        token: response.token,
        expiresAt: response.invitation?.expiresAt ?? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
      };

      setInvitations((previous) => [newInvitation, ...previous]);

      const nextInviteUrl = response.inviteUrl ?? buildInviteLink(response.token) ?? '';
      if (nextInviteUrl) {
        setGeneratedInvite({ url: nextInviteUrl, email: trimmedEmail });
      }

      setEmail('');
      setSelectedRole('MEMBER');
      setExpiresInDays(7);
      setIsFormOpen(false);
      await fetchInvitations();
    } catch (error: any) {
      setFormError(error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Failed to create workspace invitation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (invitationId: string) => {
    if (!workspaceId || !window.confirm('Are you sure you want to revoke this invitation?')) {
      return;
    }

    try {
      await revokeWorkspaceInvitation(workspaceId, invitationId);
      setInvitations((previous) => previous.map((invitation) =>
        invitation.id === invitationId
          ? { ...invitation, status: 'REVOKED' }
          : invitation,
      ));
      await fetchInvitations();
    } catch (error: any) {
      setFormError(error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Failed to revoke invitation.');
    }
  };

  const handleCopy = async (value: string, invitationId?: string) => {
    try {
      await navigator.clipboard.writeText(value);
      if (invitationId) {
        setCopiedInvitationId(invitationId);
        setTimeout(() => setCopiedInvitationId(null), 1500);
      }
    } catch {
      setFormError('Clipboard access failed. Please copy the invite link manually.');
    }
  };

  if (!workspaceId) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
        Select a workspace to manage invitations.
      </div>
    );
  }

  const tabButtonStyles = (isActive: boolean) => `py-2 px-4 font-medium text-sm border-b-2 transition-colors ${isActive ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`;

  return (
    <div className="space-y-6">
      <div className="flex border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="Workspace member sections">
        <button
          type="button"
          id="tab-members"
          role="tab"
          aria-controls="panel-members"
          aria-selected={activeSection === 'members'}
          tabIndex={activeSection === 'members' ? 0 : -1}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              setActiveSection('invitations');
              document.getElementById('tab-invitations')?.focus();
            }
          }}
          onClick={() => setActiveSection('members')}
          className={tabButtonStyles(activeSection === 'members')}
        >
          Current Members ({members.length})
        </button>
        <button
          type="button"
          id="tab-invitations"
          role="tab"
          aria-controls="panel-invitations"
          aria-selected={activeSection === 'invitations'}
          tabIndex={activeSection === 'invitations' ? 0 : -1}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              setActiveSection('members');
              document.getElementById('tab-members')?.focus();
            }
          }}
          onClick={() => setActiveSection('invitations')}
          className={tabButtonStyles(activeSection === 'invitations')}
        >
          Pending Invitations ({invitations.length})
        </button>
      </div>

      <div
        id="panel-members"
        role="tabpanel"
        aria-labelledby="tab-members"
        hidden={activeSection !== 'members'}
        className="space-y-4"
      >
        {memberError && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{memberError}</span>
          </div>
        )}

        {memberSuccess && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300" role="status">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{memberSuccess}</span>
          </div>
        )}

        {loadingMembers ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-10 text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm">Loading workspace members…</span>
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <UserPlus className="mx-auto h-8 w-8 text-slate-400" />
            <h3 className="mt-3 text-base font-medium text-slate-700 dark:text-slate-200">No members yet</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Invite a teammate to get started.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800" aria-label="Workspace members">
                <thead className="bg-slate-50 text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-medium">Member</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {members.map((member) => {
                    const isSelf = member.userId === resolvedUserId;
                    const ownerCount = members.filter((entry) => entry.role === 'owner').length;
                    const isAdminModifyingOwner = effectiveRole === 'admin' && member.role === 'owner';
                    const isSoleOwner = member.role === 'owner' && ownerCount <= 1;
                    const isDisabled = !canManageMembers || isSelf || isAdminModifyingOwner || memberActionLoading === member.userId;
                    const roleDisplay = member.role.charAt(0).toUpperCase() + member.role.slice(1);

                    return (
                      <tr key={member.id || member.userId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 dark:text-slate-100">
                            {member.user?.fullName || member.user?.displayName || member.user?.email || member.userId}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{member.user?.email || member.userId}</div>
                        </td>
                        <td className="px-4 py-3">
                          {canManageMembers ? (
                            <select
                              value={member.role}
                              disabled={isDisabled}
                              aria-label={`Update role for ${member.user?.fullName || member.user?.email || member.userId}`}
                              onChange={(event) => {
                                void handleRoleChange(member, event.target.value);
                              }}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            >
                              {memberRoleOptions.map((role) => (
                                <option key={role} value={role}>
                                  {role.charAt(0).toUpperCase() + role.slice(1)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {roleDisplay}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          }) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {canManageMembers && (
                            <button
                              type="button"
                              disabled={isSelf || isSoleOwner || isAdminModifyingOwner || memberActionLoading === member.userId}
                              onClick={() => void handleRemoveMember(member)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/40"
                            >
                              {memberActionLoading === member.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              {memberActionLoading === member.userId ? 'Working...' : 'Remove'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div
        id="panel-invitations"
        role="tabpanel"
        aria-labelledby="tab-invitations"
        hidden={activeSection !== 'invitations'}
        className="space-y-6"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Workspace Invitations</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Invite users to this workspace with a temporary access link.</p>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => setIsFormOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              Invite Member
            </button>
          )}
        </div>

        {generatedInvite && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <Check className="h-4 w-4" />
              Invitation created for {generatedInvite.email}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={generatedInvite.url}
                className="flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm dark:border-emerald-800 dark:bg-slate-900 dark:text-slate-200"
              />
              <button
                type="button"
                onClick={() => void handleCopy(generatedInvite.url)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-slate-800"
              >
                <Clipboard className="h-3.5 w-3.5" />
                Copy Link
              </button>
            </div>
          </div>
        )}

        {isFormOpen && canManage && (
          <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="name@example.com"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Role</label>
                <select
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value as WorkspaceInvitationRole)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                  <option value="OWNER">Owner</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Expiration</label>
                <select
                  value={expiresInDays}
                  onChange={(event) => setExpiresInDays(Number(event.target.value))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value={1}>1 day</option>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                </select>
              </div>
            </div>

            {formError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {isSubmitting ? 'Sending invite...' : 'Send Invite'}
              </button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-10 text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm">Loading invitations…</span>
          </div>
        ) : invitations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <Clock3 className="mx-auto h-8 w-8 text-slate-400" />
            <h3 className="mt-3 text-base font-medium text-slate-700 dark:text-slate-200">No invitations yet</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Invite teammates to join this workspace and manage access.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
                <thead className="bg-slate-50 text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Expires</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {invitations.map((invitation) => {
                    const inviteLink = buildInviteLink(invitation.token ?? undefined);
                    return (
                      <tr key={invitation.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{invitation.email}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{roleLabel(invitation.role)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClasses(invitation.status)}`}>
                            {invitation.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {new Date(invitation.expiresAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => { if (inviteLink) void handleCopy(inviteLink, invitation.id); }}
                              disabled={!inviteLink || !canManage}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              {copiedInvitationId === invitation.id ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                              {copiedInvitationId === invitation.id ? 'Copied' : 'Copy Link'}
                            </button>

                            {canManage && invitation.status !== 'REVOKED' && invitation.status !== 'ACCEPTED' && (
                              <button
                                type="button"
                                onClick={() => void handleRevoke(invitation.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
