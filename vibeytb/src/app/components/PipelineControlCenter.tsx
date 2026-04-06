'use client';

import { useEffect, useState, useCallback } from 'react';

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
}

interface PipelineStatus {
  latestRun: PipelineRun | null;
  phases: PhaseLog[];
  recentRuns: PipelineRun[];
  errorCategories: Record<string, number>;
}

const PHASE_META = [
  { num: 1, name: 'data_mining', label: 'Data Mining', icon: '🔍', desc: 'Discover trending AI tools' },
  { num: 2, name: 'scripting', label: 'Scripting', icon: '✍️', desc: 'Generate video script' },
  { num: 3, name: 'production', label: 'Production', icon: '🎬', desc: 'Record, render & stitch' },
  { num: 4, name: 'publishing', label: 'Publishing', icon: '📤', desc: 'Upload to platforms' },
];

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

export default function PipelineControlCenter() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{ ok: boolean; msg: string } | null>(null);

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
    // Poll every 10s when a run is active, 60s when idle
    const interval = setInterval(fetchStatus, status?.latestRun?.status === 'running' ? 10_000 : 60_000);
    return () => clearInterval(interval);
  }, [fetchStatus, status?.latestRun?.status]);

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch('/api/pipeline/trigger', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTriggerResult({ ok: true, msg: 'Pipeline triggered! Starting in ~30s...' });
        // Refresh status after a delay
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

  // Skeleton loading
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
              fontSize: 13,
              padding: '8px 16px',
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
            padding: '10px 16px',
            marginBottom: 16,
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            fontWeight: 500,
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

          return (
            <div
              key={num}
              className={`phase-card ${isActive ? 'phase-active' : ''} ${isDone ? 'phase-done' : ''} ${isFail ? 'phase-failed' : ''}`}
              style={{
                position: 'relative',
                padding: '14px 16px',
                borderRadius: 'var(--radius-sm)',
                background: isActive
                  ? 'var(--accent-subtle)'
                  : isDone
                    ? 'rgba(34, 197, 94, 0.06)'
                    : isFail
                      ? 'rgba(239, 68, 68, 0.06)'
                      : 'var(--bg-hover)',
                border: `1px solid ${
                  isActive ? 'var(--border-accent)' : isDone ? 'rgba(34, 197, 94, 0.15)' : isFail ? 'rgba(239, 68, 68, 0.15)' : 'var(--border-subtle)'
                }`,
                transition: 'all 0.3s ease',
              }}
            >
              {/* Phase number + status indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: '50%', fontSize: 14,
                  background: isDone
                    ? 'rgba(34, 197, 94, 0.15)'
                    : isActive
                      ? 'var(--accent-glow)'
                      : isFail
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'var(--bg-active)',
                  ...(isActive ? { animation: 'pulse-glow 2s ease infinite' } : {}),
                }}>
                  {isDone ? '✅' : isFail ? '❌' : isActive ? '🔵' : icon}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
                </div>
              </div>

              {/* Duration or status text */}
              <div style={{
                fontSize: 12, fontWeight: 500, marginTop: 4,
                color: isDone ? 'var(--status-success)' : isActive ? 'var(--accent)' : isFail ? 'var(--status-error)' : 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {isDone && phaseLog?.finished_at && phaseLog?.started_at
                  ? `Done in ${formatDuration(new Date(phaseLog.finished_at).getTime() - new Date(phaseLog.started_at).getTime())}`
                  : isActive
                    ? 'Running...'
                    : isFail
                      ? phaseLog?.error_message?.slice(0, 60) ?? 'Failed'
                      : 'Waiting'}
              </div>

              {/* Error detail tooltip for failed phases */}
              {isFail && phaseLog?.error_message && (
                <div style={{
                  fontSize: 11, color: 'var(--status-error)', marginTop: 4,
                  padding: '6px 8px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.06)',
                  fontFamily: 'var(--font-mono)', wordBreak: 'break-all',
                }}>
                  {phaseLog.error_message.slice(0, 120)}
                </div>
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
                fontSize: 12, fontWeight: 500,
                color: 'var(--status-error)',
              }}>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                <span style={{ color: 'var(--text-muted)' }}>{cat}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Run History (compact) */}
      {(status?.recentRuns?.length ?? 0) > 1 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Recent Runs
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {status!.recentRuns.slice(0, 7).map((run) => (
              <div
                key={run.id}
                title={`${run.run_id} — ${run.status} — ${formatDuration(run.duration_ms)} — ${run.trigger_type}`}
                style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, cursor: 'default',
                  background: run.status === 'completed'
                    ? 'rgba(34, 197, 94, 0.12)'
                    : run.status === 'failed'
                      ? 'rgba(239, 68, 68, 0.12)'
                      : run.status === 'running'
                        ? 'var(--accent-subtle)'
                        : 'var(--bg-hover)',
                  border: `1px solid ${
                    run.status === 'completed' ? 'rgba(34, 197, 94, 0.2)' : run.status === 'failed' ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-subtle)'
                  }`,
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {run.status === 'completed' ? '✅' : run.status === 'failed' ? '❌' : run.status === 'running' ? '🔵' : '⏳'}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
