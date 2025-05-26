// src/app/layout.tsx
import type { Metadata } from 'next';
// Standard named imports from specific subpaths for Geist fonts
import { GeistSans as GeistSansImport } from 'geist/font/sans';
import { GeistMono as GeistMonoImport } from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { SyncProvider } from '@/contexts/SyncContext';

// Robust Geist font initialization with fallbacks
let geistSansFont: any;
let geistMonoFont: any;

try {
  if (typeof GeistSansImport === 'function') {
    geistSansFont = GeistSansImport({
      variable: '--font-geist-sans',
      subsets: ['latin'],
    });
    console.log('[Layout] GeistSans initialized directly.');
  } else if (GeistSansImport && typeof (GeistSansImport as any).GeistSans === 'function') {
    geistSansFont = (GeistSansImport as any).GeistSans({
      variable: '--font-geist-sans',
      subsets: ['latin'],
    });
    console.log('[Layout] GeistSans initialized via .GeistSans property.');
  } else {
    console.error('[Layout] GeistSansImport is not a function and has no .GeistSans property. Using fallback.');
    geistSansFont = { variable: '' }; // Fallback
  }
} catch (e) {
  console.error('[Layout] Error initializing GeistSans. Using fallback. Error:', e);
  geistSansFont = { variable: '' }; // Fallback
}

try {
  if (typeof GeistMonoImport === 'function') {
    geistMonoFont = GeistMonoImport({
      variable: '--font-geist-mono',
      subsets: ['latin'],
    });
    console.log('[Layout] GeistMono initialized directly.');
  } else if (GeistMonoImport && typeof (GeistMonoImport as any).GeistMono === 'function') {
    geistMonoFont = (GeistMonoImport as any).GeistMono({
      variable: '--font-geist-mono',
      subsets: ['latin'],
    });
    console.log('[Layout] GeistMono initialized via .GeistMono property.');
  } else {
    console.error('[Layout] GeistMonoImport is not a function and has no .GeistMono property. Using fallback.');
    geistMonoFont = { variable: '' }; // Fallback
  }
} catch (e) {
  console.error('[Layout] Error initializing GeistMono. Using fallback. Error:', e);
  geistMonoFont = { variable: '' }; // Fallback
}

export const metadata: Metadata = {
  title: 'Grupo 2 Irmãos',
  description: 'Aplicativo de viagens para motoristas',
  icons: {
    icon: '/favicon.ico', // This should point to public/favicon.ico
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSansFont?.variable || ''} ${geistMonoFont?.variable || ''} antialiased`}
      >
        <AuthProvider>
          <SyncProvider>
            <main>{children}</main>
          </SyncProvider>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
