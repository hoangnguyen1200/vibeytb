'use client';

import { useState } from 'react';

export default function PublishPage() {
  const [isConfigured] = useState(false); // Will check TikTok creds

  return (
    <div>
      <div className="page-header">
        <h2>📤 Multi-Platform Publish</h2>
        <p>Post videos to TikTok and other platforms</p>
      </div>

      {/* TikTok Section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 28 }}>🎵</span>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>TikTok</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Content Posting API — requires TikTok Developer Audit
            </p>
          </div>
          <span className={`badge ${isConfigured ? 'badge-published' : 'badge-pending'}`}
            style={{ marginLeft: 'auto' }}>
            {isConfigured ? '✅ Connected' : '⏳ Not Configured'}
          </span>
        </div>

        {!isConfigured && (
          <div style={{
            padding: 20, background: 'var(--bg-hover)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              ⚠️ TikTok API Not Yet Approved
            </h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
              Your Content Posting API application was rejected. To re-apply, this dashboard
              provides the required UX (5-point compliance). Once approved, you can post directly
              from here.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href="https://developers.tiktok.com/apps/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ fontSize: 13 }}
              >
                Open TikTok Developer Portal →
              </a>
              <a
                href="https://developers.tiktok.com/doc/content-sharing-guidelines"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ fontSize: 13 }}
              >
                View API Guidelines
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Future Platforms */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>🚀 Coming Soon</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { icon: '📸', name: 'Instagram Reels', desc: 'Cross-post to Instagram', status: 'Planned' },
            { icon: '📘', name: 'Facebook Reels', desc: 'Cross-post to Facebook', status: 'Planned' },
            { icon: '💼', name: 'LinkedIn Video', desc: 'Professional audience', status: 'Future' },
            { icon: '🐦', name: 'X (Twitter)', desc: 'Short clips', status: 'Future' },
          ].map((platform) => (
            <div key={platform.name} style={{
              padding: 16, background: 'var(--bg-hover)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              opacity: 0.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>{platform.icon}</span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{platform.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{platform.desc}</p>
                </div>
                <span className="badge badge-pending" style={{ marginLeft: 'auto', fontSize: 10 }}>
                  {platform.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* YouTube Status */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>▶️</span>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>YouTube Shorts</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Auto-published via pipeline — no manual action needed
            </p>
          </div>
          <span className="badge badge-published" style={{ marginLeft: 'auto' }}>
            ✅ Active
          </span>
        </div>
      </div>
    </div>
  );
}
