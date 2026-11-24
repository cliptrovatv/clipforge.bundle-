import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'ClipForge', manifest: '/manifest.webmanifest' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0e0f13' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
