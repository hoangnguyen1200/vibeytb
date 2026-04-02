import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Sign In — VibeYtb Dashboard',
  description: 'Sign in to your VibeYtb automation dashboard',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
