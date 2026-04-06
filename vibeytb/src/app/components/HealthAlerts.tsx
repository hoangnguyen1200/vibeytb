'use client';

import { useEffect, useState } from 'react';

interface Alert {
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  id: string;
}

export default function HealthAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load dismissed alerts from localStorage
    try {
      const saved = localStorage.getItem('dismissed_health_alerts');
      if (saved) setDismissed(new Set(JSON.parse(saved)));
    } catch { /* ignore */ }

    fetch('/api/pipeline/health')
      .then(r => r.json())
      .then(d => setAlerts(d.alerts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      localStorage.setItem('dismissed_health_alerts', JSON.stringify([...next]));
    } catch { /* ignore */ }
  };

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));

  if (loading || visibleAlerts.length === 0) return null;

  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    success: { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.3)', text: 'var(--status-success)' },
    warning: { bg: 'rgba(250,204,21,0.08)', border: 'rgba(250,204,21,0.3)', text: 'var(--status-warning)' },
    error: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', text: 'var(--status-error)' },
    info: { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.3)', text: 'var(--accent)' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
      {visibleAlerts.map(alert => {
        const c = colorMap[alert.type] ?? colorMap.info;
        return (
          <div key={alert.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 16px',
            background: c.bg,
            border: `1px solid ${c.border}`,
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            color: c.text,
            animation: 'slideDown 0.3s ease-out',
          }}>
            <span>{alert.message}</span>
            <button
              onClick={() => dismiss(alert.id)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 16, padding: '0 4px',
                lineHeight: 1,
              }}
              title="Dismiss"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
