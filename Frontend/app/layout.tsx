import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/context/AuthContext';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Ownly – AI Retail Manager',
    template: '%s | Ownly',
  },
  description:
    'Manage your retail store, staff, inventory, and billing — all in one place. Built for clothing & fashion retailers.',
  keywords: ['retail management', 'inventory', 'billing', 'staff management', 'POS'],
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
  openGraph: {
    title: 'Ownly – AI Retail Manager',
    description: 'Manage your retail store from one powerful platform.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#8b5cf6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
