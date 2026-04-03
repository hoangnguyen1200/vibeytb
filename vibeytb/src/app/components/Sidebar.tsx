'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/browser';

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

const mainNav: NavItem[] = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/videos', icon: '🎬', label: 'Videos' },
  { href: '/analytics', icon: '📈', label: 'Analytics' },
];

const publishNav: NavItem[] = [
  { href: '/publish', icon: '📤', label: 'Post to TikTok' },
  { href: '/settings', icon: '⚙️', label: 'Settings' },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('vibeytb-theme') as 'dark' | 'light' | null;
    const initial = saved ?? 'dark';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('vibeytb-theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function handleNavClick() {
    if (onClose) onClose();
  }

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`} id="sidebar-nav">
      <div className="sidebar-brand">
        <h1>⚡ VibeYtb</h1>
        <p>Video Automation Dashboard</p>
      </div>

      <nav className="sidebar-nav">
        <span className="nav-section-label">Overview</span>
        {mainNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${pathname === item.href ? 'active' : ''}`}
            id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={handleNavClick}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <span className="nav-section-label">Publish</span>
        {publishNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${pathname === item.href ? 'active' : ''}`}
            id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={handleNavClick}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--border-subtle)',
      }}>
        <button
          onClick={toggleTheme}
          id="btn-theme-toggle"
          style={{
            width: '100%', padding: '8px 12px', marginBottom: 8,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            fontSize: 12, cursor: 'pointer',
            transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
        <button
          onClick={handleSignOut}
          id="btn-signout"
          style={{
            width: '100%', padding: '8px 12px',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            fontSize: 12, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
            e.currentTarget.style.color = 'var(--status-error)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          🚪 Sign Out
        </button>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
          @TechHustleLabs • v1.3
        </p>
      </div>
    </aside>
  );
}
