'use client';

import { useEffect, useState } from 'react';
import StatsCard from '../components/StatsCard';
import VideoStatusBadge from '../components/VideoStatusBadge';

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

export default function DashboardPage() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    async function fetchData() {
      try {
        const [summaryRes, videosRes] = await Promise.all([
          fetch('/api/analytics/summary'),
          fetch(`/api/videos?limit=20${statusFilter ? `&status=${statusFilter}` : ''}`),
        ]);
        const summaryJson = await summaryRes.json();
        const videosJson = await videosRes.json();

        setSummary(summaryJson);
        setVideos(videosJson.data ?? []);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    setLoading(true);
    fetchData();
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
      <div className="page-header">
        <h2>📊 Pipeline Dashboard</h2>
        <p>Real-time overview of your video automation pipeline</p>
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
