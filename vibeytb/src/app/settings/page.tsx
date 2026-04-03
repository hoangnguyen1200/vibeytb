'use client';

import { useEffect, useState } from 'react';

interface ConfigItem {
  label: string;
  envKey: string;
  status: 'set' | 'missing';
  category: string;
}

export default function SettingsPage() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings/status')
      .then(r => r.json())
      .then(d => setConfigs(d.configs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const categories = [...new Set(configs.map(c => c.category))];

  return (
    <div>
      <div className="page-header">
        <h2>⚙️ Settings</h2>
        <p>System configuration status — API keys are never displayed for security</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="glow-pulse" style={{
            width: 32, height: 32, borderRadius: '50%', margin: '0 auto',
            background: 'var(--accent-subtle)', border: '2px solid var(--accent)',
          }} />
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat} className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, textTransform: 'capitalize' }}>
              {cat === 'core' ? '🔑 Core Services' :
               cat === 'ai' ? '🤖 AI Services' :
               cat === 'publish' ? '📤 Publishing' :
               cat === 'notify' ? '🔔 Notifications' : cat}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {configs.filter(c => c.category === cat).map(item => (
                <div
                  key={item.envKey}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px',
                    background: 'var(--bg-hover)',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${item.status === 'set' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  }}
                >
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                    <br />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.envKey}</span>
                  </div>
                  <span style={{
                    padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                    background: item.status === 'set' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    color: item.status === 'set' ? 'var(--status-success)' : 'var(--status-error)',
                  }}>
                    {item.status === 'set' ? '✅ Set' : '❌ Missing'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>ℹ️ About</h3>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p><strong>VibeYtb</strong> — YouTube Automation Pipeline v1.3</p>
          <p>Built by <strong>@TechHustleLabs</strong></p>
          <p>Stack: Next.js 16 • Supabase • ElevenLabs • Google Gemini • FFmpeg</p>
        </div>
      </div>
    </div>
  );
}
