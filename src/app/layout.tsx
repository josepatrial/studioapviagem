// src/app/layout.tsx
import type { Metadata } from 'next';
// Standard named imports from specific subpaths for Geist fonts
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { SyncProvider } from '@/contexts/SyncContext';

// Attempt to access the function as a property of the imported object
const geistSansFont = GeistSans.GeistSans ? GeistSans.GeistSans({
  variable: '--font-geist-sans',
  subsets: ['latin'],
}) : GeistSans({ // Fallback to direct call if the above structure isn't what's happening
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMonoFont = GeistMono.GeistMono ? GeistMono.GeistMono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
}) : GeistMono({ // Fallback for Mono as well
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
