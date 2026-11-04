import React from 'react';
import { Download } from 'lucide-react';
import type { OrganizationAuditLogEntry } from '../../api/client';

interface AuditExportButtonProps {
  orgId: string;
  events: OrganizationAuditLogEntry[];
}

const escapeCsv = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export const AuditExportButton: React.FC<AuditExportButtonProps & { disabled?: boolean }> = ({ orgId, events, disabled = false }) => {
  const handleCsvExport = () => {
    if (events.length === 0) {
      return;
    }

    const header = ['timestamp', 'actor', 'action', 'targetType', 'targetId', 'workspaceId', 'metadata'];
    const rows = events.map((event) => [
      event.createdAt ?? event.created_at ?? '',
      event.userId ?? event.user_id ?? 'system',
      event.action,
      event.targetType ?? event.target_type ?? '',
      event.targetId ?? event.target_id ?? '',
      event.workspaceId ?? event.workspace_id ?? '',
      JSON.stringify(event.metadata ?? event.details ?? {}),
    ]);

    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${orgId}-audit-log.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleJsonExport = () => {
    if (events.length === 0) {
      return;
    }

    const jsonString = JSON.stringify(events, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${orgId}-audit-log.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center space-x-2">
      <button
        type="button"
        onClick={handleCsvExport}
        disabled={disabled || events.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </button>
      <button
        type="button"
        onClick={handleJsonExport}
        disabled={disabled || events.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        Export JSON
      </button>
    </div>
  );
};
