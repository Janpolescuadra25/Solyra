import React from 'react';
import { FileText, ShieldAlert } from 'lucide-react';
import type { OrganizationAuditLogEntry } from '../../api/client';

interface AuditLogTableProps {
  events: OrganizationAuditLogEntry[];
  total: number;
  offset: number;
  loading: boolean;
}

const formatTimestamp = (value?: string | Date): string => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
};

const summarizeMetadata = (value: Record<string, unknown> | undefined): string => {
  if (!value || Object.keys(value).length === 0) {
    return '—';
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 120 ? `${serialized.slice(0, 117)}...` : serialized;
  } catch {
    return 'Metadata available';
  }
};

export const AuditLogTable: React.FC<AuditLogTableProps> = ({ events, total, offset, loading }) => {
  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        Loading audit events…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center dark:border-slate-700">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <FileText className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100">No audit events found</h3>
        <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
          No activity matches the current filters. Try broadening the date range or clearing the action filter.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Showing {offset + 1}–{Math.min(offset + events.length, total)} of {total} events
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-950/80">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Time</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Actor</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Action</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Target</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {events.map((event) => (
              <tr key={event.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{formatTimestamp(event.createdAt ?? event.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{event.userId ?? event.user_id ?? 'system'}</div>
                    {event.userAgent ? (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{event.userAgent}</div>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                    {event.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                  <div className="space-y-1">
                    <div>{event.targetType ?? event.target_type ?? '—'}</div>
                    <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{event.targetId ?? event.target_id ?? '—'}</div>
                    {event.workspaceId ?? event.workspace_id ? (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">WS: {event.workspaceId ?? event.workspace_id}</div>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                  <div className="max-w-md break-words">{summarizeMetadata(event.metadata ?? event.details)}</div>
                  {event.ipAddress || event.ip_address ? (
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                      <ShieldAlert className="h-3 w-3" />
                      {event.ipAddress ?? event.ip_address}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
