import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Organization, OrganizationRole } from '@solyra/shared';
import { useAuth } from '../context/AuthContext';
import { OrganizationWorkspacesList } from '../components/organization/OrganizationWorkspacesList';
import { addOrganizationMember, ApiOrganizationMember, createOrganizationApi, getOrganization, getOrganizationMembers, getOrganizations, updateOrganizationMemberRole } from '../api/client';

export const OrganizationsListPage: React.FC = () => {
  const { currentOrganization, switchOrganization, refreshOrganizations } = useAuth(); const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Organization[]>([]); const [name, setName] = useState(''); const [error, setError] = useState<string | null>(null);
  const load = async () => { try { setOrgs(await getOrganizations()); } catch { setError('Unable to load organizations.'); } };
  useEffect(() => { void load(); }, []);
  const create = async (event: React.FormEvent) => { event.preventDefault(); if (name.trim().length < 2) { setError('Name must be at least 2 characters.'); return; } try { const org = await createOrganizationApi({ name: name.trim() }); await refreshOrganizations(); await switchOrganization(org.id); navigate(`/organizations/${org.id}`); } catch { setError('Unable to create organization.'); } };
  return <div className="space-y-6"><h1 className="text-2xl font-bold">Organizations</h1>{error && <p className="text-rose-400">{error}</p>}<form onSubmit={create} className="flex gap-3"><input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required placeholder="Organization name" className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" /><button className="rounded-lg bg-indigo-600 px-4 py-2">Create</button></form><div className="grid gap-3 md:grid-cols-2">{orgs.map((org) => <button key={org.id} type="button" onClick={() => navigate(`/organizations/${org.id}`)} className={`text-left rounded-lg border p-4 ${currentOrganization?.id === org.id ? 'border-indigo-400' : 'border-slate-700'}`}><div className="font-semibold">{org.name}</div><div className="text-xs text-slate-400">{org.slug}</div></button>)}</div></div>;
};

export const OrganizationDetailPage: React.FC = () => {
  const { orgId } = useParams<{ orgId: string }>();
  const { userOrgRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'workspaces' ? 'workspaces' : 'members';
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<ApiOrganizationMember[]>([]);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<OrganizationRole>('member');
  const load = async () => { if (!orgId) return; setOrg(await getOrganization(orgId)); setMembers(await getOrganizationMembers(orgId)); };
  useEffect(() => { void load(); }, [orgId]);
  if (!org) return <p>Loading organization…</p>;
  const canManage = userOrgRole === 'owner' || userOrgRole === 'admin';
  const add = async (event: React.FormEvent) => { event.preventDefault(); if (!orgId || !userId.trim()) return; await addOrganizationMember(orgId, { userId: userId.trim(), role }); setUserId(''); await load(); };
  return <div className="space-y-6"><h1 className="text-2xl font-bold">{org.name}</h1><div className="flex border-b border-slate-200 dark:border-slate-800"><button type="button" onClick={() => setSearchParams({ tab: 'members' })} className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'members' ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>Members</button><button type="button" onClick={() => setSearchParams({ tab: 'workspaces' })} className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'workspaces' ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>Workspaces</button></div>{activeTab === 'workspaces' ? (<OrganizationWorkspacesList orgId={org.id} canManage={canManage} />) : (<><div className="space-y-6">{canManage && <form onSubmit={add} className="flex gap-3"><input value={userId} onChange={(e) => setUserId(e.target.value)} required placeholder="User ID" className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" /><select value={role} onChange={(e) => setRole(e.target.value as OrganizationRole)} className="rounded-lg bg-slate-900 border border-slate-700 px-3"><option value="member">Member</option><option value="admin">Admin</option><option value="owner">Owner</option></select><button className="rounded-lg bg-indigo-600 px-4">Add</button></form>}<div className="divide-y divide-slate-800 rounded-lg border border-slate-800">{members.map((member) => <div key={member.id} className="flex justify-between p-3"><span>{member.user?.email ?? member.userId}</span>{canManage ? <select value={member.role} onChange={(e) => void updateOrganizationMemberRole(org.id, member.userId, e.target.value as OrganizationRole)} className="bg-slate-900" ><option value="member">Member</option><option value="admin">Admin</option><option value="owner">Owner</option></select> : <span>{member.role}</span>}</div>)}</div></div></>)}</div>;
};
