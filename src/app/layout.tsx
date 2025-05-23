// src/app/layout.tsx
import type { Metadata } from 'next';
// Standard named imports from specific subpaths for Geist fonts
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { SyncProvider } from '@/contexts/SyncContext';

// Initialize the fonts using the named imports
// If the runtime error "(0, ...GeistSans) is not a function" persists
// after the environment cleaning steps below, this indicates a deeper
// issue with your Next.js/Turbopack/Geist setup.
const geistSansFont = GeistSans({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMonoFont = GeistMono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Grupo 2 Irmãos',
  description: 'Aplicativo de viagens para motoristas',
  icons: {
    icon: '/favicon.ico', // Path relative to the public folder
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSansFont.variable} ${geistMonoFont.variable} antialiased`}>
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
