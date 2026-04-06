'use client';

import { useEffect, useState } from 'react';

interface CalendarDay {
  date: string;
  status: string;
  published: number;
  failed: number;
  runs: number;
}

export default function ContentCalendar() {
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<CalendarDay | null>(null);

  useEffect(() => {
    fetch('/api/pipeline/calendar')
      .then(r => r.json())
      .then(d => setCalendar(d.calendar ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const getColor = (day: CalendarDay) => {
    if (day.status === 'completed') return 'var(--status-success)';
    if (day.status === 'failed') return 'var(--status-error)';
    return 'var(--bg-hover)';
  };

  const getEmoji = (day: CalendarDay) => {
    if (day.status === 'completed') return '✅';
    if (day.status === 'failed') return '❌';
    return '—';
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const successDays = calendar.filter(d => d.status === 'completed').length;
  const failDays = calendar.filter(d => d.status === 'failed').length;
  const noRunDays = calendar.filter(d => d.status === 'no_run').length;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          📅 Content Calendar (14 days)
        </h3>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <span>✅ {successDays}</span>
          <span>❌ {failDays}</span>
          <span>— {noRunDays}</span>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 6,
      }}>
        {calendar.map(day => (
          <div
            key={day.date}
            onMouseEnter={() => setHoveredDay(day)}
            onMouseLeave={() => setHoveredDay(null)}
            style={{
              position: 'relative',
              aspectRatio: '1',
              borderRadius: 'var(--radius-sm)',
              border: `2px solid ${getColor(day)}`,
              background: day.status === 'no_run' ? 'transparent' : `${getColor(day)}15`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseOver={e => {
              (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.08)';
              (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 12px ${getColor(day)}30`;
            }}
            onMouseOut={e => {
              (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1 }}>
              {formatDate(day.date)}
            </span>
            <span style={{ fontSize: 16, marginTop: 2 }}>{getEmoji(day)}</span>

            {/* Tooltip */}
            {hoveredDay?.date === day.date && (
              <div style={{
                position: 'absolute',
                bottom: '110%',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                fontSize: 11,
                whiteSpace: 'nowrap',
                zIndex: 10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                color: 'var(--text-primary)',
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{formatDate(day.date)}</div>
                <div>Runs: {day.runs} | Published: {day.published} | Failed: {day.failed}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
