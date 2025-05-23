// src/app/layout.tsx
import type { Metadata } from 'next';
// Attempt to import default export and access named properties based on Turbopack runtime error
import GeistSansModule from 'geist/font/sans';
import GeistMonoModule from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { SyncProvider } from '@/contexts/SyncContext';

// Initialize the fonts by accessing properties on the imported default modules
// Using type assertion (as any) to accommodate the structure implied by the Turbopack error.
const geistSansFont = (GeistSansModule as any).GeistSans({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMonoFont = (GeistMonoModule as any).GeistMono({
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
