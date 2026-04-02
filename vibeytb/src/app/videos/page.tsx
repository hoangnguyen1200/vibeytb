'use client';

import { useEffect, useState } from 'react';
import StatsCard from '../components/StatsCard';
import VideoStatusBadge from '../components/VideoStatusBadge';

interface VideoRow {
  id: string;
  status: string;
  tool_name: string | null;
  tool_url: string | null;
  youtube_title: string | null;
  youtube_url: string | null;
  tiktok_url: string | null;
  views_24h: number | null;
  likes_24h: number | null;
  comments_24h: number | null;
  discovery_source: string | null;
  created_at: string | null;
}

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 15;

  useEffect(() => {
    async function fetchVideos() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(page * limit),
        });
        if (statusFilter) params.set('status', statusFilter);

        const res = await fetch(`/api/videos?${params}`);
        const json = await res.json();
        setVideos(json.data ?? []);
        setTotal(json.total ?? 0);
      } catch (err) {
        console.error('Videos fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchVideos();
  }, [statusFilter, page]);

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  const totalPages = Math.ceil(total / limit);

  // Compute stats from current data
  const publishedCount = videos.filter(v => v.status === 'published').length;
  const failedCount = videos.filter(v => v.status === 'failed').length;

  return (
    <div>
      <div className="page-header">
        <h2>🎬 Videos</h2>
        <p>All videos produced by the pipeline — {total} total</p>
      </div>

      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatsCard label="Total" value={total} color="purple" />
        <StatsCard label="Published (this page)" value={publishedCount} color="green" />
        <StatsCard label="Failed (this page)" value={failedCount} color="red" />
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Video List</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Page {page + 1} of {Math.max(totalPages, 1)}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <select
              id="videos-status-filter"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              style={{
                background: 'var(--bg-hover)', color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)', padding: '6px 12px',
                fontSize: 13, cursor: 'pointer',
              }}
            >
              <option value="">All Statuses</option>
              <option value="published">Published</option>
              <option value="failed">Failed</option>
              <option value="processing">Processing</option>
              <option value="upload_pending">Upload Pending</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="glow-pulse" style={{
              width: 32, height: 32, borderRadius: '50%', margin: '0 auto',
              background: 'var(--accent-subtle)', border: '2px solid var(--accent)',
            }} />
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tool</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Views</th>
                  <th>Links</th>
                </tr>
              </thead>
              <tbody>
                {videos.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                      No videos found
                    </td>
                  </tr>
                ) : (
                  videos.map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {formatDate(v.created_at)}
                      </td>
                      <td>
                        <a
                          href={`/videos/${v.id}`}
                          style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
                        >
                          {v.tool_name ?? '—'}
                        </a>
                      </td>
                      <td style={{
                        maxWidth: 280, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {v.youtube_title ?? '—'}
                      </td>
                      <td><VideoStatusBadge status={v.status} /></td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {v.discovery_source ?? '—'}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {v.views_24h ?? '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {v.youtube_url && (
                          <a href={v.youtube_url} target="_blank" rel="noopener noreferrer"
                            style={{ marginRight: 6, textDecoration: 'none' }} title="YouTube">▶️</a>
                        )}
                        {v.tiktok_url && (
                          <a href={v.tiktok_url} target="_blank" rel="noopener noreferrer"
                            style={{ textDecoration: 'none' }} title="TikTok">🎵</a>
                        )}
                        {v.tool_url && (
                          <a href={v.tool_url} target="_blank" rel="noopener noreferrer"
                            style={{ marginLeft: 6, textDecoration: 'none' }} title="Website">🌐</a>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16,
          }}>
            <button
              className="btn btn-secondary"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              style={{ padding: '6px 16px', fontSize: 13 }}
            >
              ← Prev
            </button>
            <button
              className="btn btn-secondary"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '6px 16px', fontSize: 13 }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
