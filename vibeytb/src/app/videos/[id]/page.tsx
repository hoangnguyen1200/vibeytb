'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import VideoStatusBadge from '../../components/VideoStatusBadge';

interface ScriptScene {
  scene_index: number;
  narration: string;
  stock_search_keywords?: string;
  target_website_url?: string;
  tool_name?: string;
  estimated_duration: number;
}

interface ScriptJson {
  youtube_title: string;
  youtube_description: string;
  youtube_tags: string[];
  music_mood: string;
  scenes: ScriptScene[];
}

interface VideoDetail {
  id: string;
  status: string;
  tool_name: string | null;
  tool_url: string | null;
  youtube_title: string | null;
  youtube_description: string | null;
  youtube_tags: string[] | null;
  youtube_url: string | null;
  tiktok_url: string | null;
  views_24h: number | null;
  views_latest: number | null;
  likes_24h: number | null;
  likes_latest: number | null;
  comments_24h: number | null;
  comments_latest: number | null;
  discovery_source: string | null;
  script_json: ScriptJson | string | null;
  error_logs: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:shorts\/|v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [scriptExpanded, setScriptExpanded] = useState(false);

  useEffect(() => {
    async function fetchVideo() {
      try {
        const res = await fetch(`/api/videos/${params.id}`);
        const json = await res.json();
        if (json.error) {
          console.error('Video not found:', json.error);
          return;
        }
        setVideo(json.data);
      } catch (err) {
        console.error('Video fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    if (params.id) fetchVideo();
  }, [params.id]);

  function parseScript(raw: ScriptJson | string | null): ScriptJson | null {
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
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

  if (!video) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <h2 style={{ fontSize: 24, marginBottom: 12 }}>Video Not Found</h2>
        <p style={{ color: 'var(--text-secondary)' }}>This video doesn't exist or was removed.</p>
        <button className="btn btn-primary" onClick={() => router.push('/videos')} style={{ marginTop: 20 }}>
          ← Back to Videos
        </button>
      </div>
    );
  }

  const script = parseScript(video.script_json);
  const youtubeId = video.youtube_url ? extractYouTubeId(video.youtube_url) : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => router.push('/videos')}
          style={{
            background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)', padding: '6px 12px',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
          }}
        >
          ← Back
        </button>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>
            {video.tool_name ?? video.youtube_title ?? 'Untitled'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            {formatDate(video.created_at)}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Left: Video Preview */}
        <div>
          {youtubeId ? (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ position: 'relative', paddingBottom: '177.78%' /* 9:16 */ }}>
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}`}
                  title={video.youtube_title ?? 'Video'}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{
                    position: 'absolute', top: 0, left: 0,
                    width: '100%', height: '100%', border: 'none',
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="card" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 300, color: 'var(--text-muted)',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
                <p>No video preview available</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Video hasn't been published yet</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Metadata */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status & Stats */}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
              STATUS
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <VideoStatusBadge status={video.status} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Source: {video.discovery_source ?? 'unknown'}
              </span>
            </div>

            {video.status === 'published' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 24, fontWeight: 700 }}>{video.views_latest ?? video.views_24h ?? '—'}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Views</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 24, fontWeight: 700 }}>{video.likes_latest ?? video.likes_24h ?? '—'}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Likes</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 24, fontWeight: 700 }}>{video.comments_latest ?? video.comments_24h ?? '—'}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Comments</p>
                </div>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
              DETAILS
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Title</label>
                <p style={{ fontSize: 14, marginTop: 2 }}>{video.youtube_title ?? '—'}</p>
              </div>

              {video.youtube_description && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</label>
                  <p style={{ fontSize: 13, marginTop: 2, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {video.youtube_description.substring(0, 200)}
                    {video.youtube_description.length > 200 && '...'}
                  </p>
                </div>
              )}

              {video.youtube_tags && video.youtube_tags.length > 0 && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tags</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {video.youtube_tags.map((tag, i) => (
                      <span key={i} style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 11,
                        background: 'var(--bg-hover)', color: 'var(--text-secondary)',
                      }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {video.tool_url && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tool Website</label>
                  <a href={video.tool_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', display: 'block', marginTop: 2 }}>
                    🌐 {video.tool_url}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Platform Links */}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
              PLATFORMS
            </h3>
            <div style={{ display: 'flex', gap: 10 }}>
              <a
                href={video.youtube_url ?? '#'}
                target={video.youtube_url ? '_blank' : undefined}
                rel="noopener noreferrer"
                className={`btn ${video.youtube_url ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  flex: 1, fontSize: 13,
                  opacity: video.youtube_url ? 1 : 0.5,
                  pointerEvents: video.youtube_url ? 'auto' : 'none',
                }}
              >
                ▶️ YouTube {video.youtube_url ? '✅' : '—'}
              </a>
              <a
                href={video.tiktok_url ?? '#'}
                target={video.tiktok_url ? '_blank' : undefined}
                rel="noopener noreferrer"
                className={`btn ${video.tiktok_url ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  flex: 1, fontSize: 13,
                  opacity: video.tiktok_url ? 1 : 0.5,
                  pointerEvents: video.tiktok_url ? 'auto' : 'none',
                }}
              >
                🎵 TikTok {video.tiktok_url ? '✅' : '—'}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Script Section */}
      {script && (
        <div className="card" style={{ marginTop: 20 }}>
          <div
            onClick={() => setScriptExpanded(!scriptExpanded)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>
              📝 Script ({script.scenes.length} scenes • {script.music_mood} mood)
            </h3>
            <span style={{ fontSize: 18, transition: 'transform 0.2s', transform: scriptExpanded ? 'rotate(180deg)' : '' }}>
              ▼
            </span>
          </div>

          {scriptExpanded && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {script.scenes.map((scene) => (
                <div key={scene.scene_index} style={{
                  padding: 14, background: 'var(--bg-hover)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: '3px solid var(--accent)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                      Scene {scene.scene_index}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      ~{scene.estimated_duration}s
                    </span>
                  </div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)' }}>
                    "{scene.narration}"
                  </p>
                  {scene.target_website_url && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      🌐 {scene.target_website_url}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error Logs (if failed) */}
      {video.error_logs && (
        <div className="card" style={{
          marginTop: 20, borderColor: 'rgba(239, 68, 68, 0.3)',
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--status-error)', marginBottom: 8 }}>
            ⚠️ Error Logs
          </h3>
          <pre style={{
            fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 300, overflow: 'auto',
            background: 'var(--bg-hover)', padding: 12,
            borderRadius: 'var(--radius-sm)',
          }}>
            {video.error_logs}
          </pre>
        </div>
      )}
    </div>
  );
}
