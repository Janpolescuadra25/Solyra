import React, { useEffect, useRef, useState } from 'react';
import { createOrganizationWorkspaceNew, type Workspace } from '../../api/client';

interface CreateWorkspaceModalProps {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  onWorkspaceCreated: (workspace: Workspace) => void;
}

export const CreateWorkspaceModal: React.FC<CreateWorkspaceModalProps> = ({
  organizationId,
  isOpen,
  onClose,
  onWorkspaceCreated,
}) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isIsolated, setIsIsolated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node) && isOpen) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextName = event.target.value;
    setName(nextName);

    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) {
      setSlug(nextName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  };

  const resetForm = () => {
    setName('');
    setSlug('');
    setDescription('');
    setIsIsolated(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || loading) {
      if (!name.trim()) {
        setError('Workspace name is required');
      }
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const created = await createOrganizationWorkspaceNew(organizationId, {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        isIsolated,
      });
      onWorkspaceCreated(created);
      resetForm();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-workspace-title"
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 id="create-workspace-title" className="text-lg font-semibold text-slate-100">
            Create Organization Workspace
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close workspace creation modal"
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="workspace-name" className="block text-xs font-medium text-slate-300">
              Workspace Name *
            </label>
            <input
              id="workspace-name"
              type="text"
              required
              disabled={loading}
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Core Engineering"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="workspace-slug" className="block text-xs font-medium text-slate-300">
              Slug Identifier
            </label>
            <input
              id="workspace-slug"
              type="text"
              disabled={loading}
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              placeholder="e.g. core-engineering"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="workspace-description" className="block text-xs font-medium text-slate-300">
              Description (Optional)
            </label>
            <textarea
              id="workspace-description"
              rows={3}
              disabled={loading}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Brief description of this workspace"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={isIsolated}
              onChange={(event) => setIsIsolated(event.target.checked)}
              disabled={loading}
              className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 disabled:opacity-50"
            />
            Enforce strict workspace isolation
          </label>

          <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
