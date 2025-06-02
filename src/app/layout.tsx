// src/app/layout.tsx
import type { Metadata } from 'next';
// Importar com alias para usar na lógica de inicialização robusta
import { GeistSans as GeistSansImport } from 'geist/font/sans';
import { GeistMono as GeistMonoImport } from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { SyncProvider } from '@/contexts/SyncContext';

// Lógica de inicialização robusta para as fontes Geist
let geistSansFont: any;
let geistMonoFont: any;

try {
  if (typeof GeistSansImport === 'function') {
    geistSansFont = GeistSansImport({
      variable: '--font-geist-sans',
      subsets: ['latin'],
    });
  } else if (GeistSansImport && typeof (GeistSansImport as any).GeistSans === 'function') {
    geistSansFont = (GeistSansImport as any).GeistSans({
      variable: '--font-geist-sans',
      subsets: ['latin'],
    });
  } else {
    console.error('[Layout] GeistSansImport não está no formato esperado. Usando fallback.');
    geistSansFont = { variable: '' }; // Fallback
  }
} catch (e) {
  console.error('[Layout] Erro inicializando GeistSans. Usando fallback. Erro:', e);
  geistSansFont = { variable: '' }; // Fallback
}

try {
  if (typeof GeistMonoImport === 'function') {
    geistMonoFont = GeistMonoImport({
      variable: '--font-geist-mono',
      subsets: ['latin'],
    });
  } else if (GeistMonoImport && typeof (GeistMonoImport as any).GeistMono === 'function') {
    geistMonoFont = (GeistMonoImport as any).GeistMono({
      variable: '--font-geist-mono',
      subsets: ['latin'],
    });
  } else {
    console.error('[Layout] GeistMonoImport não está no formato esperado. Usando fallback.');
    geistMonoFont = { variable: '' }; // Fallback
  }
} catch (e) {
  console.error('[Layout] Erro inicializando GeistMono. Usando fallback. Erro:', e);
  geistMonoFont = { variable: '' }; // Fallback
}

export const metadata: Metadata = {
  title: 'Grupo 2 Irmãos',
  description: 'Aplicativo de viagens para motoristas',
  icons: {
    icon: '/favicon.ico',
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
