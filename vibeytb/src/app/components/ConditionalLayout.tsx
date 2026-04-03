'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function ConditionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <>
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
