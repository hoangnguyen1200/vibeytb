'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  views_latest: number | null;
  likes_24h: number | null;
  likes_latest: number | null;
  comments_24h: number | null;
  discovery_source: string | null;
  created_at: string | null;
}

function extractVideoId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

type SortKey = 'date' | 'views' | 'tool';

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 15;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Debounce search input
  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
    }, 300);
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
    setPage(0);
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return '⇅';
    return sortAsc ? '↑' : '↓';
  }

  useEffect(() => {
    async function fetchVideos() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(page * limit),
          sort: sortKey,
          dir: sortAsc ? 'asc' : 'desc',
        });
        if (statusFilter) params.set('status', statusFilter);
        if (debouncedSearch) params.set('search', debouncedSearch);

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
  }, [statusFilter, page, sortKey, sortAsc, debouncedSearch]);

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  const totalPages = Math.ceil(total / limit);

  const [summary, setSummary] = useState<{ published: number; failed: number } | null>(null);

  useEffect(() => {
    fetch('/api/analytics/summary')
      .then(r => r.json())
      .then(d => setSummary({ published: d.published ?? 0, failed: d.failed ?? 0 }))
      .catch(() => {});
  }, []);

  async function exportCSV() {
    try {
      const res = await fetch('/api/videos?limit=100&offset=0');
      const json = await res.json();
      const rows = json.data ?? [];

      const headers = ['Date', 'Tool', 'Title', 'Status', 'Views', 'YouTube URL', 'TikTok URL'];
      const csvRows = [
        headers.join(','),
        ...rows.map((r: VideoRow) => [
          r.created_at ? new Date(r.created_at).toISOString() : '',
          `"${(r.tool_name ?? '').replace(/"/g, '""')}"`,
          `"${(r.youtube_title ?? '').replace(/"/g, '""')}"`,
          r.status,
          r.views_latest ?? r.views_24h ?? '',
          r.youtube_url ?? '',
          r.tiktok_url ?? '',
        ].join(',')),
      ];

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vibeytb_videos_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export error:', err);
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>🎬 Videos</h2>
          <p>All videos produced by the pipeline — {total} total</p>
        </div>
        <button
          id="btn-export-csv"
          onClick={exportCSV}
          style={{
            padding: '6px 14px',
            background: 'var(--accent-subtle)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--accent)',
            fontSize: 13, fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          📥 Export CSV
        </button>
      </div>

      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatsCard label="Total" value={total} color="purple" />
        <StatsCard label="Published" value={summary?.published ?? '—'} color="green" />
        <StatsCard label="Failed" value={summary?.failed ?? '—'} color="red" />
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Video List</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Page {page + 1} of {Math.max(totalPages, 1)}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              id="videos-search"
              type="text"
              placeholder="🔍 Search tools..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                background: 'var(--bg-hover)', color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)', padding: '6px 12px',
                fontSize: 13, width: 180,
                outline: 'none',
              }}
            />
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
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('date')}>
                    Date {sortIcon('date')}
                  </th>
                  <th>Thumb</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('tool')}>
                    Tool {sortIcon('tool')}
                  </th>
                  <th>Title</th>
                  <th>Status</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('views')}>
                    Views {sortIcon('views')}
                  </th>
                  <th>Links</th>
                </tr>
              </thead>
              <tbody>
                {videos.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                      {debouncedSearch ? `No results for "${debouncedSearch}"` : 'No videos found'}
                    </td>
                  </tr>
                ) : (
                  videos.map((v) => {
                    const vidId = extractVideoId(v.youtube_url);
                    return (
                    <tr key={v.id}>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {formatDate(v.created_at)}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {vidId ? (
                          <img
                            src={`https://img.youtube.com/vi/${vidId}/default.jpg`}
                            alt={v.tool_name ?? 'thumb'}
                            style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 4, display: 'block' }}
                            loading="lazy"
                          />
                        ) : (
                          <div style={{ width: 48, height: 36, background: 'var(--bg-hover)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🎬</div>
                        )}
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
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {v.views_latest ?? v.views_24h ?? '—'}
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
                    );
                  })
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
