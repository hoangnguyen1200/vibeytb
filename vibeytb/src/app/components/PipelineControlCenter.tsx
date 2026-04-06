'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

// ── Types ───────────────────────────────────────────────────────────────

interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
  meta?: Record<string, unknown>;
}

interface PhaseLog {
  id: string;
  run_id: string;
  phase: number;
  phase_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  logs: LogEntry[] | null;
  metadata: Record<string, unknown> | null;
}

interface PipelineRun {
  id: string;
  run_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  trigger_type: string;
  error_message: string | null;
  videos_processed?: number;
  videos_published?: number;
  videos_failed?: number;
}

interface PipelineStatus {
  latestRun: PipelineRun | null;
  phases: PhaseLog[];
  recentRuns: PipelineRun[];
  errorCategories: Record<string, number>;
}

interface RunDetail {
  run: PipelineRun | null;
  phases: PhaseLog[];
}

// ── Constants ───────────────────────────────────────────────────────────

const PHASE_META = [
  { num: 1, name: 'data_mining', label: 'Data Mining', icon: '🔍', desc: 'Discover trending AI tools' },
  { num: 2, name: 'scripting', label: 'Scripting', icon: '✍️', desc: 'Generate video script' },
  { num: 3, name: 'production', label: 'Production', icon: '🎬', desc: 'Record, render & stitch' },
  { num: 4, name: 'publishing', label: 'Publishing', icon: '📤', desc: 'Upload to platforms' },
];

const LOG_LEVEL_COLORS: Record<string, string> = {
  info: 'var(--text-primary)',
  warn: '#f59e0b',
  error: 'var(--status-error)',
};

// ── Helpers ─────────────────────────────────────────────────────────────

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

// ── Main Component ──────────────────────────────────────────────────────

export default function PipelineControlCenter() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/status');
      const data = await res.json();
      if (!data.error) setStatus(data);
    } catch {
      // Silently fail — dashboard stays on last known state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, status?.latestRun?.status === 'running' ? 5_000 : 60_000);
    return () => clearInterval(interval);
  }, [fetchStatus, status?.latestRun?.status]);

  // Fetch run detail when a run dot is clicked
  const fetchRunDetail = useCallback(async (runId: string) => {
    setRunDetailLoading(true);
    try {
      const res = await fetch(`/api/pipeline/logs?run_id=${runId}`);
      const data = await res.json();
      if (!data.error) setRunDetail(data);
    } catch {
      setRunDetail(null);
    } finally {
      setRunDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRunId) fetchRunDetail(selectedRunId);
  }, [selectedRunId, fetchRunDetail]);

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch('/api/pipeline/trigger', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTriggerResult({ ok: true, msg: 'Pipeline triggered! Starting in ~30s...' });
        setTimeout(fetchStatus, 5000);
      } else {
        setTriggerResult({ ok: false, msg: data.error || 'Failed to trigger' });
      }
    } catch {
      setTriggerResult({ ok: false, msg: 'Network error' });
    } finally {
      setTriggering(false);
    }
  };

  // Derive pipeline state
  const latestRun = status?.latestRun;
  const isRunning = latestRun?.status === 'running';
  const isFailed = latestRun?.status === 'failed';
  const phases = status?.phases ?? [];
  const errorCategories = status?.errorCategories ?? {};
  const totalErrors = Object.values(errorCategories).reduce((a, b) => a + b, 0);

  if (loading) {
    return (
      <div className="card pipeline-control" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-hover)' }} className="glow-pulse" />
          <div style={{ width: 200, height: 16, borderRadius: 4, background: 'var(--bg-hover)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ height: 80, borderRadius: 'var(--radius-sm)', background: 'var(--bg-hover)' }} className="glow-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card pipeline-control" style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎛️</span>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Pipeline Control Center</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {isRunning ? '🔵 Pipeline is running...' : isFailed ? '🔴 Last run failed' : '🟢 Idle'}
              {latestRun && ` • Last run: ${formatTimeAgo(latestRun.started_at)}`}
              {latestRun?.duration_ms ? ` • Duration: ${formatDuration(latestRun.duration_ms)}` : ''}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            id="btn-trigger-pipeline"
            onClick={handleTrigger}
            disabled={triggering || isRunning}
            className="btn btn-primary"
            style={{
              fontSize: 13, padding: '8px 16px',
              opacity: (triggering || isRunning) ? 0.6 : 1,
              cursor: (triggering || isRunning) ? 'not-allowed' : 'pointer',
            }}
          >
            {triggering ? (
              <><span className="glow-pulse" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'white' }} /> Triggering...</>
            ) : isRunning ? (
              '⏳ Running...'
            ) : (
              '▶️ Trigger Pipeline'
            )}
          </button>
          {isFailed && !isRunning && (
            <button
              id="btn-retry-pipeline"
              onClick={handleTrigger}
              disabled={triggering}
              className="btn btn-danger"
              style={{ fontSize: 13, padding: '8px 16px' }}
            >
              🔄 Retry
            </button>
          )}
        </div>
      </div>

      {/* Trigger result toast */}
      {triggerResult && (
        <div
          style={{
            padding: '10px 16px', marginBottom: 16,
            borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500,
            background: triggerResult.ok ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: triggerResult.ok ? 'var(--status-success)' : 'var(--status-error)',
            border: `1px solid ${triggerResult.ok ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
            animation: 'fadeIn 0.3s ease',
          }}
        >
          {triggerResult.ok ? '✅' : '❌'} {triggerResult.msg}
        </div>
      )}

      {/* Phase Timeline */}
      <div className="phase-timeline">
        {PHASE_META.map(({ num, label, icon, desc }) => {
          const phaseLog = phases.find(p => p.phase === num);
          const phaseStatus = phaseLog?.status ?? 'pending';
          const isActive = phaseStatus === 'running';
          const isDone = phaseStatus === 'completed';
          const isFail = phaseStatus === 'failed';
          const isExpanded = expandedPhase === num;
          const phaseLogs = phaseLog?.logs ?? [];
          const hasLogs = phaseLogs.length > 0;

          return (
            <div key={num} className="phase-card-wrapper">
              <div
                className={`phase-card ${isActive ? 'phase-active' : ''} ${isDone ? 'phase-done' : ''} ${isFail ? 'phase-failed' : ''} ${hasLogs ? 'phase-clickable' : ''}`}
                style={{
                  position: 'relative', padding: '14px 16px',
                  borderRadius: isExpanded ? 'var(--radius-sm) var(--radius-sm) 0 0' : 'var(--radius-sm)',
                  background: isActive ? 'var(--accent-subtle)' : isDone ? 'rgba(34, 197, 94, 0.06)' : isFail ? 'rgba(239, 68, 68, 0.06)' : 'var(--bg-hover)',
                  border: `1px solid ${isActive ? 'var(--border-accent)' : isDone ? 'rgba(34, 197, 94, 0.15)' : isFail ? 'rgba(239, 68, 68, 0.15)' : 'var(--border-subtle)'}`,
                  borderBottom: isExpanded ? 'none' : undefined,
                  cursor: hasLogs ? 'pointer' : 'default',
                  transition: 'all 0.3s ease',
                }}
                onClick={() => hasLogs && setExpandedPhase(isExpanded ? null : num)}
              >
                {/* Phase header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: '50%', fontSize: 14,
                    background: isDone ? 'rgba(34, 197, 94, 0.15)' : isActive ? 'var(--accent-glow)' : isFail ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-active)',
                    ...(isActive ? { animation: 'pulse-glow 2s ease infinite' } : {}),
                  }}>
                    {isDone ? '✅' : isFail ? '❌' : isActive ? '🔵' : icon}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
                  </div>
                  {/* Log count badge */}
                  {hasLogs && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px',
                      borderRadius: 8, background: 'var(--bg-active)',
                      color: 'var(--text-muted)',
                    }}>
                      {phaseLogs.length} {isExpanded ? '▲' : '▼'}
                    </span>
                  )}
                </div>

                {/* Duration or status */}
                <div style={{
                  fontSize: 12, fontWeight: 500, marginTop: 4,
                  color: isDone ? 'var(--status-success)' : isActive ? 'var(--accent)' : isFail ? 'var(--status-error)' : 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {isDone && phaseLog?.finished_at && phaseLog?.started_at
                    ? `Done in ${formatDuration(new Date(phaseLog.finished_at).getTime() - new Date(phaseLog.started_at).getTime())}`
                    : isActive ? 'Running...'
                    : isFail ? phaseLog?.error_message?.slice(0, 60) ?? 'Failed'
                    : 'Waiting'}
                </div>
              </div>

              {/* Expanded log viewer */}
              {isExpanded && (
                <LogViewer logs={phaseLogs} errorMessage={isFail ? (phaseLog?.error_message ?? null) : null} />
              )}
            </div>
          );
        })}
      </div>

      {/* Error Category Summary */}
      {totalErrors > 0 && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-hover)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Error Summary (7 days) — {totalErrors} total
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(errorCategories).map(([cat, count]) => (
              <div key={cat} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 12,
                background: 'rgba(239, 68, 68, 0.08)',
                fontSize: 12, fontWeight: 500, color: 'var(--status-error)',
              }}>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                <span style={{ color: 'var(--text-muted)' }}>{cat}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Run History */}
      {(status?.recentRuns?.length ?? 0) > 1 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Recent Runs
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {status!.recentRuns.slice(0, 7).map((run) => (
              <div
                key={run.id}
                title={`${formatDate(run.started_at)} — ${run.status} — ${formatDuration(run.duration_ms)} — ${run.trigger_type}`}
                style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, cursor: 'pointer',
                  background: run.status === 'completed' ? 'rgba(34, 197, 94, 0.12)' : run.status === 'failed' ? 'rgba(239, 68, 68, 0.12)' : run.status === 'running' ? 'var(--accent-subtle)' : 'var(--bg-hover)',
                  border: `1px solid ${run.status === 'completed' ? 'rgba(34, 197, 94, 0.2)' : run.status === 'failed' ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-subtle)'}`,
                  outline: selectedRunId === run.run_id ? '2px solid var(--accent)' : 'none',
                  outlineOffset: 1,
                  transition: 'transform 0.15s ease',
                }}
                onClick={() => setSelectedRunId(selectedRunId === run.run_id ? null : run.run_id)}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {run.status === 'completed' ? '✅' : run.status === 'failed' ? '❌' : run.status === 'running' ? '🔵' : '⏳'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run Detail Modal */}
      {selectedRunId && (
        <RunDetailPanel
          runDetail={runDetail}
          loading={runDetailLoading}
          onClose={() => { setSelectedRunId(null); setRunDetail(null); }}
        />
      )}
    </div>
  );
}

// ── Log Viewer (embedded in phase card) ─────────────────────────────────

function LogViewer({ logs, errorMessage }: { logs: LogEntry[]; errorMessage: string | null }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      className="log-viewer"
      style={{
        borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        borderTop: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        animation: 'slideDown 0.2s ease',
      }}
    >
      <div
        ref={scrollRef}
        style={{
          maxHeight: 180, overflowY: 'auto', padding: '10px 12px',
          background: 'rgba(0, 0, 0, 0.35)',
          fontFamily: 'var(--font-mono, "SF Mono", "Cascadia Code", Consolas, monospace)',
          fontSize: 11, lineHeight: 1.6,
        }}
      >
        {logs.map((log, i) => (
          <div
            key={i}
            style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '2px 0',
              animation: `fadeIn 0.2s ease ${i * 0.05}s both`,
            }}
          >
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(log.ts)}
            </span>
            <span style={{ color: LOG_LEVEL_COLORS[log.level] || 'var(--text-primary)' }}>
              {log.msg}
            </span>
          </div>
        ))}
      </div>

      {/* Full error message for failed phases */}
      {errorMessage && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(239, 68, 68, 0.08)',
          borderTop: '1px solid rgba(239, 68, 68, 0.15)',
          fontSize: 11, fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--status-error)', wordBreak: 'break-all',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>❌ Error Detail</div>
          {errorMessage}
        </div>
      )}
    </div>
  );
}

// ── Run Detail Panel (shown when clicking a Recent Run dot) ─────────────

function RunDetailPanel({
  runDetail,
  loading,
  onClose,
}: {
  runDetail: RunDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  const run = runDetail?.run;
  const phases = runDetail?.phases ?? [];

  return (
    <div
      style={{
        marginTop: 16, padding: '16px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-accent)',
        background: 'var(--bg-card)',
        animation: 'fadeIn 0.3s ease',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          📋 Run Detail
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 16, padding: '2px 6px',
          }}
        >
          ✕
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
          Loading run details...
        </div>
      ) : !run ? (
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
          No data found for this run.
        </div>
      ) : (
        <>
          {/* Run summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 14 }}>
            <InfoBadge label="Status" value={run.status} color={run.status === 'completed' ? 'var(--status-success)' : run.status === 'failed' ? 'var(--status-error)' : 'var(--accent)'} />
            <InfoBadge label="Started" value={formatDate(run.started_at)} />
            <InfoBadge label="Duration" value={formatDuration(run.duration_ms)} />
            <InfoBadge label="Trigger" value={run.trigger_type} />
            {run.videos_published !== undefined && (
              <InfoBadge label="Published" value={String(run.videos_published)} color="var(--status-success)" />
            )}
          </div>

          {/* Error message */}
          {run.error_message && (
            <div style={{
              padding: '8px 12px', marginBottom: 12,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.15)',
              fontSize: 11, color: 'var(--status-error)',
              fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-all',
            }}>
              {run.error_message}
            </div>
          )}

          {/* Phase breakdown with logs */}
          {phases.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {phases.map((phase) => {
                const meta = PHASE_META.find(m => m.num === phase.phase);
                const phaseLogs = phase.logs ?? [];
                const duration = phase.finished_at && phase.started_at
                  ? formatDuration(new Date(phase.finished_at).getTime() - new Date(phase.started_at).getTime())
                  : '—';
                const statusIcon = phase.status === 'completed' ? '✅' : phase.status === 'failed' ? '❌' : phase.status === 'running' ? '🔵' : '⏳';

                return (
                  <div key={phase.id} style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: phaseLogs.length > 0 ? 6 : 0 }}>
                      <span style={{ fontSize: 12 }}>{statusIcon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{meta?.label ?? phase.phase_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{duration}</span>
                    </div>
                    {/* Inline logs */}
                    {phaseLogs.length > 0 && (
                      <div style={{
                        fontSize: 10, lineHeight: 1.6, paddingLeft: 20,
                        fontFamily: 'var(--font-mono, monospace)',
                        color: 'var(--text-muted)',
                      }}>
                        {phaseLogs.map((log, i) => (
                          <div key={i} style={{ color: LOG_LEVEL_COLORS[log.level] || 'var(--text-muted)' }}>
                            {log.msg}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Phase error */}
                    {phase.error_message && (
                      <div style={{
                        fontSize: 10, marginTop: 4, paddingLeft: 20,
                        color: 'var(--status-error)', fontFamily: 'var(--font-mono, monospace)',
                      }}>
                        ❌ {phase.error_message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Info Badge (for run detail summary) ─────────────────────────────────

function InfoBadge({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: '6px 10px',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-hover)',
      border: '1px solid var(--border-subtle)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: color ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
