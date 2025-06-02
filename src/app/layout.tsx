// src/app/layout.tsx
import type { Metadata } from 'next';
// Standard named imports from specific subpaths for Geist fonts
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { SyncProvider } from '@/contexts/SyncContext';

// Robust Geist font initialization with type safety and fallback
const geistSansFont = typeof GeistSans === 'function' ? GeistSans({
  variable: '--font-geist-sans',
  subsets: ['latin'],
}) : { variable: '' }; // Fallback to empty string if GeistSans is not a function

const geistMonoFont = typeof GeistMono === 'function' ? GeistMono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
}) : { variable: '' }; // Fallback to empty string if GeistMono is not a function

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
  // console.log('[Layout] Rendering RootLayout. Geist Sans Variable:', geistSansFont.variable, 'Geist Mono Variable:', geistMonoFont.variable);
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSansFont.variable} ${geistMonoFont.variable} antialiased`}
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
