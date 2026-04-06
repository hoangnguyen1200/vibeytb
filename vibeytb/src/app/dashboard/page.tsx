'use client';

import { useEffect, useState } from 'react';
import StatsCard from '../components/StatsCard';
import VideoStatusBadge from '../components/VideoStatusBadge';
import PipelineControlCenter from '../components/PipelineControlCenter';

interface SummaryData {
  total: number;
  published: number;
  failed: number;
  pending: number;
  successRate: number;
  avgViews: number;
  avgLikes: number;
  avgComments: number;
  totalViews: number;
  lastRun: string | null;
}

interface VideoRow {
  id: string;
  status: string;
  tool_name: string | null;
  youtube_title: string | null;
  youtube_url: string | null;
  tiktok_url: string | null;
  views_24h: number | null;
  likes_24h: number | null;
  created_at: string | null;
}

interface PipelineRun {
  id: string;
  run_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  videos_processed: number;
  videos_published: number;
  videos_failed: number;
  trigger_type: string;
  error_message: string | null;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchData(isManual = false) {
    try {
      if (isManual) setRefreshing(true);
      const [summaryRes, videosRes, runsRes] = await Promise.all([
        fetch('/api/analytics/summary'),
        fetch(`/api/videos?limit=20${statusFilter ? `&status=${statusFilter}` : ''}`),
        fetch('/api/pipeline-runs'),
      ]);
      const summaryJson = await summaryRes.json();
      const videosJson = await videosRes.json();
      const runsJson = await runsRes.json();

      setSummary(summaryJson);
      setVideos(videosJson.data ?? []);
      setPipelineRuns(runsJson.data ?? []);
      setLastFetch(new Date());
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [statusFilter]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchData(), 60_000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatTimeAgo(iso: string | null) {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="glow-pulse" style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--accent-subtle)', border: '2px solid var(--accent)',
        }} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>📊 Pipeline Dashboard</h2>
          <p>Real-time overview of your video automation pipeline</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastFetch && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Updated {lastFetch.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            id="btn-refresh-dashboard"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            style={{
              padding: '6px 14px',
              background: refreshing ? 'var(--bg-hover)' : 'var(--accent-subtle)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent)',
              fontSize: 13,
              fontWeight: 500,
              cursor: refreshing ? 'wait' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{
              display: 'inline-block',
              transition: 'transform 0.3s',
              ...(refreshing ? { animation: 'spin 1s linear infinite' } : {}),
            }}>🔄</span>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="card-grid">
        <StatsCard
          label="Total Videos"
          value={summary?.total ?? 0}
          color="purple"
        />
        <StatsCard
          label="Published"
          value={summary?.published ?? 0}
          color="green"
        />
        <StatsCard
          label="Failed"
          value={summary?.failed ?? 0}
          color="red"
        />
        <StatsCard
          label="Success Rate (7d)"
          value={`${summary?.successRate ?? 0}%`}
          color="blue"
        />
      </div>

      {/* Pipeline Health */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Pipeline Health</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Last run: {formatTimeAgo(summary?.lastRun ?? null)} • Success rate: {summary?.successRate ?? 0}%
            </p>
          </div>
          <div style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
            background: (summary?.successRate ?? 0) >= 70
              ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: (summary?.successRate ?? 0) >= 70
              ? 'var(--status-success)' : 'var(--status-error)',
          }}>
            {(summary?.successRate ?? 0) >= 70 ? '✅ Healthy' : '⚠️ Needs Attention'}
          </div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${summary?.successRate ?? 0}%` }} />
        </div>
      </div>

      {/* Pipeline Control Center */}
      <PipelineControlCenter />

      {/* Engagement Stats */}
      <div className="card-grid">
        <StatsCard
          label="Total Views"
          value={summary?.totalViews ?? 0}
          color="purple"
        />
        <StatsCard
          label="Avg Views (24h)"
          value={summary?.avgViews ?? 0}
          color="blue"
        />
        <StatsCard
          label="Avg Likes (24h)"
          value={summary?.avgLikes ?? 0}
          color="green"
        />
        <StatsCard
          label="Avg Comments (24h)"
          value={summary?.avgComments ?? 0}
          color="amber"
        />
      </div>

      {/* Pipeline Run History */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>🏃 Pipeline Run History</h3>
        {pipelineRuns.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>
            No pipeline runs recorded yet. Runs will appear here after the next orchestrator execution.
          </p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Processed</th>
                  <th>Published</th>
                  <th>Failed</th>
                  <th>Trigger</th>
                </tr>
              </thead>
              <tbody>
                {pipelineRuns.slice(0, 10).map((run) => (
                  <tr key={run.id}>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(run.started_at)}</td>
                    <td>
                      <span style={{
                        padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        background: run.status === 'completed' ? 'rgba(34,197,94,0.12)'
                          : run.status === 'failed' ? 'rgba(239,68,68,0.12)'
                          : 'rgba(139,92,246,0.12)',
                        color: run.status === 'completed' ? 'var(--status-success)'
                          : run.status === 'failed' ? 'var(--status-error)'
                          : 'var(--accent)',
                      }}>
                        {run.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                      {run.duration_ms ? `${Math.round(run.duration_ms / 1000)}s` : '—'}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{run.videos_processed}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--status-success)' }}>{run.videos_published}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: run.videos_failed > 0 ? 'var(--status-error)' : 'inherit' }}>{run.videos_failed}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{run.trigger_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Videos Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Recent Videos</h3>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              background: 'var(--bg-hover)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 12px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <option value="">All Statuses</option>
            <option value="published">Published</option>
            <option value="failed">Failed</option>
            <option value="processing">Processing</option>
            <option value="pending">Pending</option>
            <option value="upload_pending">Upload Pending</option>
          </select>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Tool</th>
                <th>Status</th>
                <th>Views</th>
                <th>Likes</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {videos.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    No videos found
                  </td>
                </tr>
              ) : (
                videos.map((video) => (
                  <tr key={video.id}>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      {formatDate(video.created_at)}
                    </td>
                    <td>
                      <a
                        href={`/videos/${video.id}`}
                        style={{
                          color: 'var(--text-primary)',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        {video.tool_name ?? video.youtube_title ?? 'Untitled'}
                      </a>
                    </td>
                    <td>
                      <VideoStatusBadge status={video.status} />
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {video.views_24h ?? '—'}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {video.likes_24h ?? '—'}
                    </td>
                    <td>
                      {video.youtube_url && (
                        <a
                          href={video.youtube_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="YouTube"
                          style={{ marginRight: 8, fontSize: 16, textDecoration: 'none' }}
                        >
                          ▶️
                        </a>
                      )}
                      {video.tiktok_url && (
                        <a
                          href={video.tiktok_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="TikTok"
                          style={{ fontSize: 16, textDecoration: 'none' }}
                        >
                          🎵
                        </a>
                      )}
                      {!video.youtube_url && !video.tiktok_url && (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
