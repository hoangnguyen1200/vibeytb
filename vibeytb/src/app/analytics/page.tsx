'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid,
} from 'recharts';
import StatsCard from '../components/StatsCard';

interface VideoRow {
  id: string;
  tool_name: string | null;
  youtube_title: string | null;
  youtube_url: string | null;
  views_24h: number | null;
  likes_24h: number | null;
  comments_24h: number | null;
  views_latest: number | null;
  likes_latest: number | null;
  comments_latest: number | null;
  analytics_updated_at: string | null;
  created_at: string | null;
  title_style: string | null;
  status: string;
}

interface ChartDataPoint {
  date: string;
  views: number;
  likes: number;
}

export default function AnalyticsPage() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/videos?limit=100&status=published');
        const json = await res.json();
        setVideos(json.data ?? []);
      } catch (err) {
        console.error('Analytics fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Helper: get best available views (latest > 24h)
  const getViews = (v: VideoRow) => v.views_latest ?? v.views_24h ?? 0;
  const getLikes = (v: VideoRow) => v.likes_latest ?? v.likes_24h ?? 0;
  const getComments = (v: VideoRow) => v.comments_latest ?? v.comments_24h ?? 0;

  // Filter out error_ URLs
  const validVideos = videos.filter(v => !v.youtube_url?.includes('error_'));

  // Compute chart data: group by date
  const chartData: ChartDataPoint[] = (() => {
    const map = new Map<string, { views: number; likes: number }>();
    for (const v of validVideos) {
      if (!v.created_at) continue;
      const date = new Date(v.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
      });
      const existing = map.get(date) ?? { views: 0, likes: 0 };
      map.set(date, {
        views: existing.views + getViews(v),
        likes: existing.likes + getLikes(v),
      });
    }
    return Array.from(map.entries())
      .map(([date, data]) => ({ date, ...data }))
      .reverse(); // chronological
  })();

  // Top performers (by latest views) — map to safe chart-ready objects
  const topVideos = [...validVideos]
    .filter(v => getViews(v) > 0)
    .sort((a, b) => getViews(b) - getViews(a))
    .slice(0, 10)
    .map(v => ({
      ...v,
      _views: getViews(v),
      _likes: getLikes(v),
      _label: v.tool_name ?? v.youtube_title?.slice(0, 20) ?? 'Untitled',
    }));

  // Aggregates (using latest data)
  const totalViews = validVideos.reduce((s, v) => s + getViews(v), 0);
  const totalLikes = validVideos.reduce((s, v) => s + getLikes(v), 0);
  const totalComments = validVideos.reduce((s, v) => s + getComments(v), 0);
  const publishedCount = validVideos.length;
  const avgViews = publishedCount > 0 ? Math.round(totalViews / publishedCount) : 0;
  const likeRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(1) : '0';

  const tooltipStyle = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--text-primary)',
  };

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
        <h2>📈 Analytics</h2>
        <p>Performance insights across {publishedCount} published videos</p>
      </div>

      {/* Summary Cards */}
      <div className="card-grid">
        <StatsCard label="Total Views" value={totalViews.toLocaleString()} color="purple" />
        <StatsCard label="Total Likes" value={totalLikes.toLocaleString()} color="green" />
        <StatsCard label="Avg Views/Video" value={avgViews.toLocaleString()} color="blue" />
        <StatsCard label="Like Rate" value={`${likeRate}%`} color="amber" />
      </div>

      {/* Views Over Time Chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          Views Over Time
        </h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="views"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 4, fill: '#8b5cf6' }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="likes"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3, fill: '#22c55e' }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
            No analytics data yet. Videos need 24h to collect stats.
          </p>
        )}
      </div>

      {/* A/B Title Style Performance */}
      {(() => {
        const styleMap = new Map<string, { totalViews: number; count: number }>();
        for (const v of validVideos) {
          if (!v.title_style || getViews(v) === 0) continue;
          const existing = styleMap.get(v.title_style) ?? { totalViews: 0, count: 0 };
          styleMap.set(v.title_style, {
            totalViews: existing.totalViews + getViews(v),
            count: existing.count + 1,
          });
        }
        const styleData = Array.from(styleMap.entries()).map(([style, d]) => ({
          style: style.replace('_', ' '),
          avgViews: Math.round(d.totalViews / d.count),
          count: d.count,
        })).sort((a, b) => b.avgViews - a.avgViews);

        return styleData.length > 0 ? (
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              🧪 A/B Title Style Performance
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={styleData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="style" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="avgViews" name="Avg Views" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              {styleData.map(s => (
                <span key={s.style} style={{
                  padding: '4px 12px', borderRadius: 12, fontSize: 12,
                  background: 'var(--bg-hover)', color: 'var(--text-secondary)',
                }}>
                  {s.style}: <strong>{s.avgViews}</strong> avg views ({s.count} videos)
                </span>
              ))}
            </div>
          </div>
        ) : null;
      })()}

      {/* Top Performing Videos */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          🏆 Top Performing Videos
        </h3>
        {topVideos.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={Math.max(200, topVideos.length * 40)}>
              <BarChart data={topVideos} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis
                  type="category"
                  dataKey="_label"
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                  width={120}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="_views"
                  name="Views"
                  fill="#8b5cf6"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>

            <div className="table-container" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tool</th>
                    <th>Views</th>
                    <th>Likes</th>
                    <th>Like Rate</th>
                    <th>Growth</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {topVideos.map((v, i) => (
                    <tr key={v.id}>
                      <td style={{ color: i < 3 ? 'var(--accent)' : 'var(--text-muted)', fontWeight: i < 3 ? 700 : 400 }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                      </td>
                      <td>
                        <a href={`/videos/${v.id}`}
                          style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                          {v.tool_name ?? v.youtube_title ?? 'Untitled'}
                        </a>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {getViews(v).toLocaleString()}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {getLikes(v).toLocaleString()}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                        {getViews(v) > 0 ? `${((getLikes(v) / getViews(v)) * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {v.views_24h != null && getViews(v) > 0 && v.views_24h > 0
                          ? `${(getViews(v) / v.views_24h).toFixed(1)}x`
                          : '—'}
                      </td>
                      <td>
                        {v.youtube_url && !v.youtube_url.includes('error_') && (
                          <a href={v.youtube_url} target="_blank" rel="noopener noreferrer"
                            style={{ textDecoration: 'none' }}>▶️</a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
            No performance data yet.
          </p>
        )}
      </div>
    </div>
  );
}
