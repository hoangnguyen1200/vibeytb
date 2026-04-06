'use client';

import { useEffect, useState } from 'react';

interface ToolMemory {
  tool_name: string;
  status: string;
  created_at: string;
  youtube_url: string | null;
}

export default function ContentMemoryPanel() {
  const [tools, setTools] = useState<ToolMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/pipeline/content-memory')
      .then(r => r.json())
      .then(d => setTools(d.tools ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || tools.length === 0) return null;

  const statusBadge = (status: string) => {
    const map: Record<string, { emoji: string; bg: string; color: string }> = {
      published: { emoji: '✅', bg: 'rgba(34,197,94,0.12)', color: 'var(--status-success)' },
      failed: { emoji: '❌', bg: 'rgba(239,68,68,0.12)', color: 'var(--status-error)' },
    };
    const s = map[status] ?? { emoji: '⏳', bg: 'rgba(250,204,21,0.12)', color: 'var(--status-warning)' };
    return (
      <span style={{
        padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
        background: s.bg, color: s.color,
      }}>
        {s.emoji} {status}
      </span>
    );
  };

  const displayTools = expanded ? tools : tools.slice(0, 5);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          📝 Content Memory (7 days)
        </h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {tools.length} tools reviewed
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {displayTools.map(t => (
          <div key={t.tool_name} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px',
            background: 'var(--bg-hover)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            fontSize: 13,
          }}>
            {t.youtube_url ? (
              <a href={t.youtube_url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                {t.tool_name}
              </a>
            ) : (
              <span style={{ fontWeight: 500 }}>{t.tool_name}</span>
            )}
            {statusBadge(t.status)}
          </div>
        ))}
      </div>

      {tools.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: 10, padding: '4px 12px', fontSize: 12,
            background: 'transparent', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          {expanded ? '▲ Show less' : `▼ Show all ${tools.length}`}
        </button>
      )}
    </div>
  );
}
