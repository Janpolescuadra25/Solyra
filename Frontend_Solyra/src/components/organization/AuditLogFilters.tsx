import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';

export interface AuditLogFilterState {
  action: string;
  workspaceId: string;
  userId: string;
  targetType: string;
  targetId: string;
  startDate: string;
  endDate: string;
  limit: string;
}

interface AuditLogFiltersProps {
  values: AuditLogFilterState;
  onChange: (field: keyof AuditLogFilterState, value: string) => void;
  onApply: () => void;
  onReset: () => void;
  isLoading: boolean;
}

export const AuditLogFilters: React.FC<AuditLogFiltersProps> = ({
  values,
  onChange,
  onApply,
  onReset,
  isLoading,
}) => {
  const update = (field: keyof AuditLogFilterState) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    onChange(field, event.target.value);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <Filter className="h-4 w-4 text-indigo-500" />
        Filters
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <span>Action</span>
          <input
            value={values.action}
            onChange={update('action')}
            placeholder="workspace.member.role_updated"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <span>Workspace ID</span>
          <input
            value={values.workspaceId}
            onChange={update('workspaceId')}
            placeholder="workspace UUID"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <span>User ID</span>
          <input
            value={values.userId}
            onChange={update('userId')}
            placeholder="user UUID"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <span>Limit</span>
          <select
            value={values.limit}
            onChange={update('limit')}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>

        <label className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <span>Target Type</span>
          <input
            value={values.targetType}
            onChange={update('targetType')}
            placeholder="workspace_member"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <span>Target ID</span>
          <input
            value={values.targetId}
            onChange={update('targetId')}
            placeholder="target record ID"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <span>Start date</span>
          <input
            type="date"
            value={values.startDate}
            onChange={update('startDate')}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <span>End date</span>
          <input
            type="date"
            value={values.endDate}
            onChange={update('endDate')}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Apply filters
        </button>
      </div>
    </div>
  );
};
