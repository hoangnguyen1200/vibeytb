'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  detail: string;
  timestamp: string;
}

export default function ConditionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth');
  const isPublicPage = pathname === '/tools' || pathname.startsWith('/go/');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthPage || isPublicPage) return;
    fetch('/api/notifications')
      .then(r => r.json())
      .then(d => setNotifs(d.notifications ?? []))
      .catch(() => {});
  }, [isAuthPage, isPublicPage]);

  // Close on click outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
      setShowNotifs(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  const unreadCount = Math.max(notifs.length - readCount, 0);

  function toggleNotifs() {
    setShowNotifs(!showNotifs);
    if (!showNotifs) setReadCount(notifs.length);
  }

  function formatTimeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  if (isAuthPage || isPublicPage) {
    return <>{children}</>;
  }

  const bellContent = (
    <div ref={bellRef} style={{ position: 'relative' }}>
      <button
        id="btn-notifications"
        onClick={toggleNotifs}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 20, position: 'relative', padding: '4px 8px',
        }}
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 2,
            background: 'var(--status-error)', color: '#fff',
            fontSize: 10, fontWeight: 700,
            borderRadius: '50%', width: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showNotifs && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 320, maxHeight: 400, overflowY: 'auto',
          background: 'var(--bg-card)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-elevated)',
          zIndex: 100,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, fontSize: 14 }}>
            🔔 Notifications
          </div>
          {notifs.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No notifications yet
            </div>
          ) : (
            notifs.slice(0, 15).map(n => (
              <div
                key={n.id}
                style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  transition: 'background 0.15s',
                  cursor: 'default',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{n.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {n.detail} • {formatTimeAgo(n.timestamp)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Notification Bell */}
      <div className="desktop-bell">{bellContent}</div>

      {/* Mobile Header */}
      <header className="mobile-header">
        <button
          className="hamburger-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation"
        >
          <span className="hamburger-icon">☰</span>
        </button>
        <span className="mobile-brand">⚡ VibeYtb</span>
        <div className="mobile-bell">{bellContent}</div>
      </header>

      {/* Backdrop */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-content">{children}</main>
    </>
  );
}
