import React, { useState, useEffect, useRef } from 'react';
import { X, Link2, AlertCircle, Loader2 } from 'lucide-react';

interface LinkWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLink: (workspaceId: string) => Promise<void>;
}

export const LinkWorkspaceModal: React.FC<LinkWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onLink,
}) => {
  const [workspaceId, setWorkspaceId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = workspaceId.trim();
    if (!trimmedId) {
      setError('Please enter a valid workspace ID.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onLink(trimmedId);
      setWorkspaceId('');
      onClose();
    } catch (err: any) {
      if (err?.response?.data?.code === 'FORBIDDEN_NOT_WORKSPACE_OWNER') {
        setError('Only the owner of this workspace can link it to an organization.');
        return;
      }
      const message = err?.response?.data?.message || err?.message || 'Failed to link workspace';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
            <Link2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Link Workspace</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Connect an existing workspace</p>
          </div>
        </div>
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Workspace ID / UUID
          </label>
          <input
            type="text"
            value={workspaceId}
            onChange={(e) => {
              setWorkspaceId(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
            disabled={isSubmitting}
            autoFocus
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !workspaceId.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Linking...
              </>
            ) : (
              'Link'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
