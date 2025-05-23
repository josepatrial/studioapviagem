// src/app/layout.tsx
import type { Metadata } from 'next';
// Standard named imports from specific subpaths for Geist fonts
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { SyncProvider } from '@/contexts/SyncContext';

// Initialize the fonts using the named imports, but calling them as if they are properties
// on an object, as implied by the Turbopack runtime error.
// Using type assertion (as any) to bypass TypeScript strict checks for this specific workaround.
const geistSansFont = (GeistSans as any).GeistSans ? (GeistSans as any).GeistSans({
  variable: '--font-geist-sans',
  subsets: ['latin'],
}) : GeistSans({ // Fallback to direct call if the above structure isn't what's happening
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMonoFont = (GeistMono as any).GeistMono ? (GeistMono as any).GeistMono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
}) : GeistMono({ // Fallback to direct call
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
