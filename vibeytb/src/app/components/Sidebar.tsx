'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar" id="sidebar-nav">
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
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '12px',
        color: 'var(--text-muted)',
      }}>
        <p>@TechHustleLabs</p>
        <p style={{ marginTop: '2px', opacity: 0.6 }}>Pipeline v1.0</p>
      </div>
    </aside>
  );
}
