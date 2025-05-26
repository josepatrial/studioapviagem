// src/app/layout.tsx
import type { Metadata } from 'next';
// Temporarily comment out Geist font imports to isolate favicon issue
// import { GeistSans as GeistSansImport } from 'geist/font/sans';
// import { GeistMono as GeistMonoImport } from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { SyncProvider } from '@/contexts/SyncContext';

// Temporarily comment out Geist font initialization
/*
let geistSansFont: any;
let geistMonoFont: any;

try {
  // ... (Geist font initialization logic from previous correct versions) ...
  // For brevity, I'm omitting the full try-catch blocks for Geist here,
  // as the immediate issue is the favicon chunk loading.
  // Assume geistSansFont and geistMonoFont are assigned fallbacks like { variable: '' }
  geistSansFont = { variable: '' };
  geistMonoFont = { variable: '' };
  console.log('[Layout] Geist fonts temporarily disabled for favicon debugging.');
} catch (e) {
  console.error('[Layout] Error with placeholder font init:', e);
  geistSansFont = { variable: '' };
  geistMonoFont = { variable: '' };
}
*/

export const metadata: Metadata = {
  title: 'Grupo 2 Irmãos',
  description: 'Aplicativo de viagens para motoristas',
  // icons property REMOVED for debugging
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      {/* Temporarily remove font variables from body className for debugging */}
      <body className="antialiased">
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
