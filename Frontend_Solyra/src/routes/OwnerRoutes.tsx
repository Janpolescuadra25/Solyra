import React, { useEffect, useState } from 'react';
import { Activity, ShieldCheck, ServerCog, UserCog, Clock3, RefreshCw, AlertTriangle } from 'lucide-react';
import { client as apiClient } from '../api/client';

apiClient.defaults.headers.common = {
  ...apiClient.defaults.headers.common,
  'x-solyra-admin': 'true',
};

type TelemetryStats = {
  routedCount?: number;
  suppressedCount?: number;
  activeRoutes?: number;
  totalDeliberations?: number;
  approvedCount?: number;
  rejectedCount?: number;
  vetoedCount?: number;
  activeDeliberations?: number;
  activePackage?: string | null;
  state?: string;
  totalLoaded?: number;
  totalFailed?: number;
  totalUnloaded?: number;
  modulesCount?: number;
};

type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string | Date;
};

type SessionRecord = {
  id: string;
  userId: string;
  workspaceId?: string;
  expiresAt: string | Date;
  createdAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type AuditRecord = {
  id: string;
  eventType: string;
  userId?: string | null;
  workspaceId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string | Date;
};

const formatDate = (value: string | Date | undefined): string => {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '—';
  }
};

export const OwnerDashboardPage: React.FC = () => {
  const [telemetry, setTelemetry] = useState<TelemetryStats>({});
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditRecord[]>([]);
  const [brainHistory, setBrainHistory] = useState<Array<{ id: string; version: string; name: string; moduleCount: number }>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    setMetricsError(null);

    try {
      const [thalamusRes, councilRes, brainRes, usersRes, sessionsRes, auditRes, historyRes] = await Promise.all([
        apiClient.get('/thalamus/stats'),
        apiClient.get('/council/stats'),
        apiClient.get('/brain/stats'),
        apiClient.get('/api/admin/users'),
        apiClient.get('/api/admin/sessions/active'),
        apiClient.get('/api/admin/audit/recent?limit=10'),
        apiClient.get('/brain/history'),
      ]);

      setTelemetry({
        ...thalamusRes.data?.data,
        ...councilRes.data,
        ...brainRes.data,
      });
      setUsers(Array.isArray(usersRes.data?.users) ? usersRes.data.users : []);
      setSessions(Array.isArray(sessionsRes.data?.sessions) ? sessionsRes.data.sessions : []);
      setAuditEvents(Array.isArray(auditRes.data?.events) ? auditRes.data.events : []);
      setBrainHistory(Array.isArray(historyRes.data?.history) ? historyRes.data.history : []);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Service unavailable: failed to fetch administrative metrics';
      setMetricsError(message);
      setError('Unable to load owner control center data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const handleRevokeSession = async (sessionId: string) => {
    if (!window.confirm('Revoke this session?')) {
      return;
    }

    setPendingAction(`session:${sessionId}`);
    setFlashMessage(null);

    try {
      await apiClient.post(`/api/admin/sessions/${sessionId}/revoke`, { reason: 'Revoked by administrator' });
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      setFlashMessage({ type: 'success', text: 'Session revoked successfully.' });
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to revoke this session.';
      setFlashMessage({ type: 'error', text: message });
    } finally {
      setPendingAction(null);
    }
  };

  const handleUnloadModel = async (modelId: string) => {
    setPendingAction(`unload:${modelId}`);
    setFlashMessage(null);

    try {
      await apiClient.post(`/brain/models/${modelId}/unload`);
      setFlashMessage({ type: 'success', text: `Model ${modelId} unloaded successfully.` });
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to unload the model.';
      setFlashMessage({ type: 'error', text: message });
    } finally {
      setPendingAction(null);
    }
  };

  const handleRollbackModel = async (modelId: string) => {
    setPendingAction(`rollback:${modelId}`);
    setFlashMessage(null);

    try {
      await apiClient.post(`/brain/models/${modelId}/rollback`);
      setFlashMessage({ type: 'success', text: `Model ${modelId} rolled back successfully.` });
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to roll back the model.';
      setFlashMessage({ type: 'error', text: message });
    } finally {
      setPendingAction(null);
    }
  };

  const cards = [
    { label: 'Thalamus routes', value: metricsError ? 'Unavailable' : telemetry.activeRoutes ?? 0, icon: Activity },
    { label: 'Suppressed', value: metricsError ? 'Unavailable' : telemetry.suppressedCount ?? 0, icon: AlertTriangle },
    { label: 'Council approvals', value: metricsError ? 'Unavailable' : telemetry.approvedCount ?? 0, icon: ShieldCheck },
    { label: 'Brain state', value: metricsError ? 'Unavailable' : telemetry.state ?? 'UNLOADED', icon: ServerCog },
  ];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-purple-400">Owner Control Center</p>
          <h1 className="text-3xl font-bold text-slate-100 mt-1">Master Owner Administration</h1>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-indigo-500"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {metricsError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-red-200 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span>{metricsError}</span>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-100 hover:bg-red-500/20"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {error && !metricsError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-red-200 text-sm">{error}</div>
      )}

      {flashMessage && (
        <div className={`rounded-xl border p-4 text-sm ${flashMessage.type === 'success' ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-200' : 'border-red-500/40 bg-red-500/5 text-red-200'}`}>
          {flashMessage.text}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs uppercase tracking-[0.2em]">
              <span>{label}</span>
              <Icon className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="mt-4 text-3xl font-bold text-slate-100">{typeof value === 'number' ? value : String(value)}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Brain Packages</h2>
            <span className="text-xs text-indigo-300">{brainHistory.length} entries</span>
          </div>
          <div className="space-y-2">
            {loading ? (
              <p className="text-slate-400 text-sm">Loading package history…</p>
            ) : brainHistory.length === 0 ? (
              <p className="text-slate-400 text-sm">No package history available.</p>
            ) : (
              brainHistory.map((pkg) => (
                <div key={`${pkg.id}-${pkg.version}`} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div>
                    <div className="font-medium text-slate-200">{pkg.name}</div>
                    <div className="text-xs text-slate-400">v{pkg.version}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={Boolean(pendingAction)}
                      onClick={() => void handleRollbackModel(pkg.id)}
                      className="rounded bg-indigo-600/80 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pendingAction === `rollback:${pkg.id}` ? 'Rolling back…' : 'Rollback'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(pendingAction)}
                      onClick={() => void handleUnloadModel(pkg.id)}
                      className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pendingAction === `unload:${pkg.id}` ? 'Unloading…' : 'Unload'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">User Administration</h2>
            <UserCog className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="space-y-2">
            {loading ? (
              <p className="text-slate-400 text-sm">Loading users…</p>
            ) : users.length === 0 ? (
              <p className="text-slate-400 text-sm">No users found.</p>
            ) : (
              users.slice(0, 6).map((user) => (
                <div key={user.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div>
                    <div className="font-medium text-slate-200">{user.name}</div>
                    <div className="text-xs text-slate-400">{user.email}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="rounded-full bg-slate-800 px-2 py-1 capitalize">{user.role}</span>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-300">{user.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Active Sessions</h2>
            <Clock3 className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="space-y-2">
            {loading ? (
              <p className="text-slate-400 text-sm">Loading sessions…</p>
            ) : sessions.length === 0 ? (
              <p className="text-slate-400 text-sm">No active sessions.</p>
            ) : (
              sessions.slice(0, 6).map((session) => (
                <div key={session.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-200">{session.userId}</div>
                      <div className="text-xs text-slate-400">{session.ipAddress || 'Unknown IP'}</div>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(pendingAction)}
                      onClick={() => void handleRevokeSession(session.id)}
                      className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pendingAction === `session:${session.id}` ? 'Revoking…' : 'Revoke'}
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">Expires: {formatDate(session.expiresAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Security Audit Log</h2>
            <ShieldCheck className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="space-y-2">
            {loading ? (
              <p className="text-slate-400 text-sm">Loading audit events…</p>
            ) : auditEvents.length === 0 ? (
              <p className="text-slate-400 text-sm">No audit events recorded.</p>
            ) : (
              auditEvents.slice(0, 8).map((event) => (
                <div key={event.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100">{event.eventType}</span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-indigo-300">{event.userId || 'system'}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{formatDate(event.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
