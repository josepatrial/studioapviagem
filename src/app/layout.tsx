// src/app/layout.tsx
import type { Metadata } from 'next';
// Standard named imports from specific subpaths for Geist fonts
import { GeistSans as GeistSansImport } from 'geist/font/sans';
import { GeistMono as GeistMonoImport } from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { SyncProvider } from '@/contexts/SyncContext';

// Initialize the fonts attempting to access the function as a property of the named import
// This is based on the structure implied by the Turbopack runtime error message
const geistSansFont = (GeistSansImport as any).GeistSans({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMonoFont = (GeistMonoImport as any).GeistMono({
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
