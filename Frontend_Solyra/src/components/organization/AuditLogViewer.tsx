import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { getOrganizationAuditLogs, type OrganizationAuditLogQueryParams, type OrganizationAuditLogResult } from '../../api/client';
import { AuditExportButton } from './AuditExportButton';
import { AuditLogFilters, type AuditLogFilterState } from './AuditLogFilters';
import { AuditLogTable } from './AuditLogTable';

interface AuditLogViewerProps {
  orgId: string;
  canManage: boolean;
}

const defaultFilters: AuditLogFilterState = {
  action: '',
  workspaceId: '',
  userId: '',
  targetType: '',
  targetId: '',
  startDate: '',
  endDate: '',
  limit: '25',
};

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ orgId, canManage }) => {
  const [draftFilters, setDraftFilters] = useState<AuditLogFilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<AuditLogFilterState>(defaultFilters);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<OrganizationAuditLogResult>({
    events: [],
    total: 0,
    limit: 25,
    offset: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(
    async (filters: AuditLogFilterState, currentPage: number) => {
      if (!orgId) {
        return;
      }

      const limit = Number(filters.limit) || 25;
      const offset = currentPage * limit;
      const params: OrganizationAuditLogQueryParams = {
        action: filters.action || undefined,
        workspaceId: filters.workspaceId || undefined,
        userId: filters.userId || undefined,
        targetType: filters.targetType || undefined,
        targetId: filters.targetId || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        limit,
        offset,
      };

      try {
        setIsLoading(true);
        setError(null);
        const nextResult = await getOrganizationAuditLogs(orgId, params);
        setResult(nextResult);
      } catch (err: any) {
        setError(err?.message || 'Failed to load audit logs.');
      } finally {
        setIsLoading(false);
      }
    },
    [orgId],
  );

  useEffect(() => {
    void fetchLogs(appliedFilters, page);
  }, [appliedFilters, page, fetchLogs]);

  const handleFilterChange = (field: keyof AuditLogFilterState, value: string) => {
    setDraftFilters((previous) => ({ ...previous, [field]: value }));
  };

  const handleApply = () => {
    setPage(0);
    setAppliedFilters(draftFilters);
  };

  const handleReset = () => {
    setPage(0);
    setDraftFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  if (!canManage) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        Only organization owners and admins can review audit history.
      </div>
    );
  }

  const pageSize = Number(appliedFilters.limit) || 25;
  const hasPreviousPage = result.offset > 0;
  const hasNextPage = result.offset + result.events.length < result.total;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Organization Audit Logs</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Immutable event history for organization activity, workspace membership changes, and role governance actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Redaction enabled
          </div>
          <AuditExportButton orgId={orgId} events={result.events} />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <AuditLogFilters
        values={draftFilters}
        onChange={handleFilterChange}
        onApply={handleApply}
        onReset={handleReset}
        isLoading={isLoading}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Page size: {pageSize}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={!hasPreviousPage || isLoading}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={!hasNextPage || isLoading}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Next
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading audit events…
        </div>
      )}

      {!isLoading && <AuditLogTable events={result.events} total={result.total} offset={result.offset} loading={false} />}
    </div>
  );
};
