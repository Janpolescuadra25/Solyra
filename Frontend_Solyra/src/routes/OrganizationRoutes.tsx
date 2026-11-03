import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Organization, OrganizationRole, Workspace } from '@solyra/shared';
import { useAuth } from '../context/AuthContext';
import { OrganizationWorkspacesList } from '../components/organization/OrganizationWorkspacesList';
import { WorkspaceInvitationsTab } from '../components/workspace/WorkspaceInvitationsTab';
import {
  addOrganizationMember,
  ApiOrganizationMember,
  createOrganizationApi,
  getOrganization,
  getOrganizationMembers,
  getOrganizationWorkspaces,
  getOrganizations,
  listWorkspaceMembers,
  updateOrganizationMemberRole,
} from '../api/client';

type TabType = 'members' | 'workspaces' | 'invitations';

export const OrganizationsListPage: React.FC = () => {
  const { currentOrganization, switchOrganization, refreshOrganizations } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setOrgs(await getOrganizations());
    } catch {
      setError('Unable to load organizations.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }

    try {
      const org = await createOrganizationApi({ name: name.trim() });
      await refreshOrganizations();
      await switchOrganization(org.id);
      navigate(`/organizations/${org.id}`);
    } catch {
      setError('Unable to create organization.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Organizations</h1>
      {error && <p className="text-rose-400">{error}</p>}

      <form onSubmit={create} className="flex gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          required
          placeholder="Organization name"
          className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2"
        />
        <button className="rounded-lg bg-indigo-600 px-4 py-2">Create</button>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        {orgs.map((org) => (
          <button
            key={org.id}
            type="button"
            onClick={() => navigate(`/organizations/${org.id}`)}
            className={`text-left rounded-lg border p-4 ${currentOrganization?.id === org.id ? 'border-indigo-400' : 'border-slate-700'}`}
          >
            <div className="font-semibold">{org.name}</div>
            <div className="text-xs text-slate-400">{org.slug}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export const OrganizationDetailPage: React.FC = () => {
  const { orgId } = useParams<{ orgId: string }>();
  const { user, userOrgRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: TabType = rawTab === 'workspaces' ? 'workspaces' : rawTab === 'invitations' ? 'invitations' : 'members';

  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<ApiOrganizationMember[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [workspaceUserRole, setWorkspaceUserRole] = useState<string>('member');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<OrganizationRole>('member');

  const load = async () => {
    if (!orgId) return;

    const [nextOrg, nextMembers, nextWorkspaces] = await Promise.all([
      getOrganization(orgId),
      getOrganizationMembers(orgId),
      getOrganizationWorkspaces(orgId),
    ]);

    setOrg(nextOrg);
    setMembers(nextMembers);
    setWorkspaces(nextWorkspaces);

    if (nextWorkspaces.length > 0) {
      setSelectedWorkspaceId((current) => {
        if (current && nextWorkspaces.some((workspace) => workspace.id === current)) {
          return current;
        }
        return nextWorkspaces[0].id;
      });
    } else {
      setSelectedWorkspaceId('');
    }
  };

  useEffect(() => {
    void load();
  }, [orgId]);

  useEffect(() => {
    if (workspaces.length === 0) {
      setSelectedWorkspaceId('');
      setWorkspaceUserRole(userOrgRole || 'member');
      return;
    }

    if (!workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [selectedWorkspaceId, workspaces, userOrgRole]);

  useEffect(() => {
    let isMounted = true;

    if (!selectedWorkspaceId) {
      setWorkspaceUserRole(userOrgRole || 'member');
      return () => {
        isMounted = false;
      };
    }

    void listWorkspaceMembers(selectedWorkspaceId)
      .then((membersList) => {
        if (!isMounted) return;
        const currentMember = membersList.find((member) => member.userId === user?.id);
        if (currentMember) {
          setWorkspaceUserRole(currentMember.role);
        } else if (userOrgRole === 'owner' || userOrgRole === 'admin') {
          setWorkspaceUserRole(userOrgRole);
        } else {
          setWorkspaceUserRole('member');
        }
      })
      .catch(() => {
        if (isMounted) {
          setWorkspaceUserRole(userOrgRole || 'member');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedWorkspaceId, user?.id, userOrgRole]);

  if (!org) {
    return <p>Loading organization…</p>;
  }

  const canManage = userOrgRole === 'owner' || userOrgRole === 'admin';

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || !userId.trim()) return;
    await addOrganizationMember(orgId, { userId: userId.trim(), role });
    setUserId('');
    await load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{org.name}</h1>

      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'members' })}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'members' ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          Members
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'workspaces' })}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'workspaces' ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          Workspaces
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'invitations' })}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'invitations' ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          Invitations
        </button>
      </div>

      {activeTab === 'workspaces' ? (
        <OrganizationWorkspacesList orgId={org.id} canManage={canManage} />
      ) : activeTab === 'invitations' ? (
        <div className="space-y-4">
          {workspaces.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Workspace</label>
              <select
                value={selectedWorkspaceId}
                onChange={(event) => setSelectedWorkspaceId(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name || workspace.slug}
                  </option>
                ))}
              </select>
            </div>
          )}

          <WorkspaceInvitationsTab
            workspaceId={selectedWorkspaceId}
            userRole={userOrgRole}
            currentUserId={user?.id}
            workspaceUserRole={workspaceUserRole}
          />
        </div>
      ) : (
        <>
          <div className="space-y-6">
            {canManage && (
              <form onSubmit={add} className="flex gap-3">
                <input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                  placeholder="User ID"
                  className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2"
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as OrganizationRole)}
                  className="rounded-lg bg-slate-900 border border-slate-700 px-3"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <button className="rounded-lg bg-indigo-600 px-4">Add</button>
              </form>
            )}

            <div className="divide-y divide-slate-800 rounded-lg border border-slate-800">
              {members.map((member) => (
                <div key={member.id} className="flex justify-between p-3">
                  <span>{member.user?.email ?? member.userId}</span>
                  {canManage ? (
                    <select
                      value={member.role}
                      onChange={(e) => void updateOrganizationMemberRole(org.id, member.userId, e.target.value as OrganizationRole)}
                      className="rounded-lg bg-slate-900 border border-slate-700 px-3"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </select>
                  ) : (
                    <span className="text-sm text-slate-400 capitalize">{member.role}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
