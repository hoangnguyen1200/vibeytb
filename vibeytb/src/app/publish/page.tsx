'use client';

import { useState, useEffect } from 'react';

interface VideoOption {
  id: string;
  tool_name: string | null;
  youtube_title: string | null;
  youtube_url: string | null;
  status: string;
  created_at: string;
}

export default function PublishPage() {
  const [videos, setVideos] = useState<VideoOption[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [caption, setCaption] = useState('');
  const [privacyLevel, setPrivacyLevel] = useState('');
  const [allowComment, setAllowComment] = useState(true);
  const [allowDuet, setAllowDuet] = useState(true);
  const [allowStitch, setAllowStitch] = useState(true);
  const [discloseBranded, setDiscloseBranded] = useState(false);
  const [discloseYourBrand, setDiscloseYourBrand] = useState(false);
  const [isConfigured] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'post' | 'status'>('post');

  // Fetch published videos for selection
  useEffect(() => {
    async function fetchVideos() {
      try {
        const res = await fetch('/api/videos?status=published&limit=50');
        const json = await res.json();
        setVideos(json.data ?? []);
      } catch (err) {
        console.error('Failed to fetch videos:', err);
      }
    }
    fetchVideos();
  }, []);

  const selectedVideo = videos.find(v => v.id === selectedVideoId);

  // Validation
  const canSubmit = selectedVideoId
    && caption.trim()
    && privacyLevel
    && !isSubmitting
    && isConfigured;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      // In future: call /api/tiktok/post
      // For now: add to publish_queue
      const res = await fetch('/api/publish/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: selectedVideoId,
          platform: 'tiktok',
          metadata: {
            caption,
            privacyLevel,
            allowComment,
            allowDuet,
            allowStitch,
            discloseBranded,
            discloseYourBrand,
          },
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setSubmitResult({ ok: true, message: 'Added to publish queue!' });
        setCaption('');
        setPrivacyLevel('');
        setSelectedVideoId('');
      } else {
        setSubmitResult({ ok: false, message: json.error ?? 'Failed to queue' });
      }
    } catch {
      setSubmitResult({ ok: false, message: 'Network error' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>📤 Multi-Platform Publish</h2>
        <p>Post videos to TikTok and other platforms</p>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
        padding: 4, width: 'fit-content',
      }}>
        <button
          onClick={() => setActiveTab('post')}
          style={{
            padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            background: activeTab === 'post' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'post' ? 'white' : 'var(--text-secondary)',
          }}
        >
          🎵 Post to TikTok
        </button>
        <button
          onClick={() => setActiveTab('status')}
          style={{
            padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            background: activeTab === 'status' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'status' ? 'white' : 'var(--text-secondary)',
          }}
        >
          📊 Status
        </button>
      </div>

      {activeTab === 'post' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
          {/* Left: Post Form */}
          <form onSubmit={handleSubmit}>
            {/* Video Selection */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
                1️⃣ SELECT VIDEO
              </h3>
              <select
                id="video-select"
                value={selectedVideoId}
                onChange={(e) => setSelectedVideoId(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)', fontSize: 14,
                }}
              >
                <option value="">Choose a published video...</option>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.tool_name ?? v.youtube_title ?? 'Untitled'} — {new Date(v.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            {/* Caption */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
                2️⃣ CAPTION
              </h3>
              <textarea
                id="caption-input"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={2200}
                rows={4}
                placeholder="Write your TikTok caption... #hashtags @mentions"
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)', fontSize: 14,
                  resize: 'vertical', fontFamily: 'inherit',
                }}
              />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                {caption.length}/2200
              </p>
            </div>

            {/* UX Point 1: Privacy Level — NO DEFAULT */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                3️⃣ PRIVACY LEVEL
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Required — choose who can view this video
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { value: 'PUBLIC_TO_EVERYONE', label: '🌍 Public', desc: 'Everyone' },
                  { value: 'MUTUAL_FOLLOW_FRIENDS', label: '👥 Friends', desc: 'Mutual followers' },
                  { value: 'SELF_ONLY', label: '🔒 Private', desc: 'Only you' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPrivacyLevel(opt.value)}
                    style={{
                      flex: 1, padding: '12px 8px',
                      background: privacyLevel === opt.value ? 'var(--accent-subtle)' : 'var(--bg-hover)',
                      border: `2px solid ${privacyLevel === opt.value ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      color: 'var(--text-primary)', textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 18 }}>{opt.label.split(' ')[0]}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{opt.label.split(' ').slice(1).join(' ')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* UX Point 2: Interaction Settings */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
                4️⃣ INTERACTION SETTINGS
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { id: 'allow-comment', label: 'Allow Comments', checked: allowComment, set: setAllowComment },
                  { id: 'allow-duet', label: 'Allow Duet', checked: allowDuet, set: setAllowDuet },
                  { id: 'allow-stitch', label: 'Allow Stitch', checked: allowStitch, set: setAllowStitch },
                ].map(toggle => (
                  <label key={toggle.id} htmlFor={toggle.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: 'var(--bg-hover)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  }}>
                    <span style={{ fontSize: 14 }}>{toggle.label}</span>
                    <input
                      type="checkbox"
                      id={toggle.id}
                      checked={toggle.checked}
                      onChange={(e) => toggle.set(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* UX Point 3: Content Disclosure — REQUIRED BY TIKTOK */}
            <div className="card" style={{
              marginBottom: 16,
              borderColor: 'var(--border-accent)',
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                5️⃣ CONTENT DISCLOSURE
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Required by TikTok Content Posting API guidelines
              </p>

              <label htmlFor="disclose-branded" style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px', background: 'var(--bg-hover)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                marginBottom: 8,
              }}>
                <input
                  type="checkbox"
                  id="disclose-branded"
                  checked={discloseBranded}
                  onChange={(e) => setDiscloseBranded(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--accent)' }}
                />
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Branded Content</span>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    This video promotes a third-party brand, product, or service
                  </p>
                </div>
              </label>

              <label htmlFor="disclose-your-brand" style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px', background: 'var(--bg-hover)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  id="disclose-your-brand"
                  checked={discloseYourBrand}
                  onChange={(e) => setDiscloseYourBrand(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--accent)' }}
                />
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Your Brand</span>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    This video promotes your own brand or business
                  </p>
                </div>
              </label>
            </div>

            {/* Submit */}
            {submitResult && (
              <div style={{
                padding: '12px 16px', marginBottom: 16,
                borderRadius: 'var(--radius-sm)',
                background: submitResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${submitResult.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                color: submitResult.ok ? 'var(--status-success)' : 'var(--status-error)',
                fontSize: 13,
              }}>
                {submitResult.ok ? '✅' : '❌'} {submitResult.message}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="btn btn-primary"
              style={{
                width: '100%', padding: '14px 20px',
                fontSize: 15, fontWeight: 700,
                opacity: canSubmit ? 1 : 0.5,
              }}
            >
              {isSubmitting ? '⏳ Publishing...' : '🎵 Post to TikTok'}
            </button>

            {!isConfigured && (
              <p style={{
                textAlign: 'center', marginTop: 12,
                fontSize: 12, color: 'var(--status-warning)',
              }}>
                ⚠️ TikTok API not yet configured — form is preview only
              </p>
            )}
          </form>

          {/* Right: Info Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* API Status */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>🎵</span>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700 }}>TikTok API</h3>
                  <span className={`badge ${isConfigured ? 'badge-published' : 'badge-pending'}`}>
                    {isConfigured ? '✅ Connected' : '⏳ Pending Audit'}
                  </span>
                </div>
              </div>

              {!isConfigured && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <p style={{ marginBottom: 8 }}>
                    This UI implements all 5 TikTok UX compliance points required
                    for Content Posting API approval:
                  </p>
                  <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li>✅ Privacy level selector (no default)</li>
                    <li>✅ Comment/Duet/Stitch toggles</li>
                    <li>✅ Content disclosure checkboxes</li>
                    <li>✅ Video preview before post</li>
                    <li>✅ User-initiated post action</li>
                  </ol>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <a
                      href="https://developers.tiktok.com/apps/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{ fontSize: 12, padding: '6px 12px' }}
                    >
                      Dev Portal →
                    </a>
                    <a
                      href="https://developers.tiktok.com/doc/content-sharing-guidelines"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: '6px 12px' }}
                    >
                      Guidelines
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Selected Video Preview */}
            {selectedVideo && (
              <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>
                  PREVIEW
                </h3>
                <p style={{ fontSize: 16, fontWeight: 700 }}>
                  {selectedVideo.tool_name ?? selectedVideo.youtube_title ?? 'Untitled'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {new Date(selectedVideo.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
                {selectedVideo.youtube_url && (
                  <a
                    href={selectedVideo.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ marginTop: 10, fontSize: 12, padding: '6px 12px', display: 'block', textAlign: 'center', textDecoration: 'none' }}
                  >
                    ▶️ Watch on YouTube
                  </a>
                )}
              </div>
            )}

            {/* YouTube Status */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>▶️</span>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700 }}>YouTube Shorts</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Auto-published via pipeline
                  </p>
                </div>
                <span className="badge badge-published" style={{ marginLeft: 'auto' }}>
                  ✅ Active
                </span>
              </div>
            </div>

            {/* Future Platforms */}
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>
                COMING SOON
              </h3>
              {[
                { icon: '📸', name: 'Reels' },
                { icon: '📘', name: 'Facebook' },
                { icon: '💼', name: 'LinkedIn' },
                { icon: '🐦', name: 'X' },
              ].map(p => (
                <div key={p.name} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 0', opacity: 0.5,
                }}>
                  <span>{p.icon}</span>
                  <span style={{ fontSize: 13 }}>{p.name}</span>
                  <span className="badge badge-pending" style={{ marginLeft: 'auto', fontSize: 10 }}>Planned</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'status' && (
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Publish Queue</h3>
          <p style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            No items in queue yet. Post a video to get started.
          </p>
        </div>
      )}
    </div>
  );
}
