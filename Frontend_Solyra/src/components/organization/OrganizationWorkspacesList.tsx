import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Briefcase, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import type { Workspace } from '@solyra/shared';
import {
  getOrganizationWorkspaces,
  createOrganizationWorkspace,
  deleteOrganizationWorkspace,
} from '../../api/client';
import { LinkWorkspaceModal } from './LinkWorkspaceModal';

interface OrganizationWorkspacesListProps {
  orgId: string;
  canManage: boolean;
}

export const OrganizationWorkspacesList: React.FC<OrganizationWorkspacesListProps> = ({
  orgId,
  canManage,
}) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getOrganizationWorkspaces(orgId);
      setWorkspaces(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load workspaces.');
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleLink = async (workspaceId: string) => {
    await createOrganizationWorkspace(orgId, workspaceId);
    await fetchWorkspaces();
  };

  const handleUnlink = async (workspaceId: string) => {
    if (!window.confirm('Are you sure you want to unlink this workspace from the organization?')) {
      return;
    }
    try {
      setUnlinkingId(workspaceId);
      await deleteOrganizationWorkspace(orgId, workspaceId);
      await fetchWorkspaces();
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || 'Failed to unlink workspace');
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Linked Workspaces ({workspaces.length})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Workspaces connected to this organization for centralized governance.
          </p>
        </div>
        {canManage && (
          <div className="relative">
            <button
              onClick={() => setIsModalOpen(!isModalOpen)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Link Workspace
            </button>
            <LinkWorkspaceModal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              onLink={handleLink}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchWorkspaces}
            className="text-xs font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Briefcase className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100">No workspaces linked</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Link an existing workspace to share resources and manage access.
          </p>
          {canManage && (
            <div className="relative mt-4">
              <button
                onClick={() => setIsModalOpen(!isModalOpen)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Link Workspace
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {workspaces.map((ws: any) => (
              <li key={ws.id} className="flex items-center justify-between p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {ws.name || ws.slug || 'Untitled Workspace'}
                    </h4>
                    <p className="text-xs text-slate-400">ID: {ws.id}</p>
                  </div>
                </div>

                {canManage && (
                  <button
                    onClick={() => handleUnlink(ws.id)}
                    disabled={unlinkingId === ws.id}
                    title="Unlink workspace"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    {unlinkingId === ws.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
