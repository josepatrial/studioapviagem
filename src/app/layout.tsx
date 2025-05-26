// src/app/layout.tsx
import type { Metadata } from 'next';
// As importações das fontes Geist foram completamente removidas para diagnóstico.
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { SyncProvider } from '@/contexts/SyncContext';

// Toda a lógica de inicialização das fontes Geist foi removida para diagnóstico.

export const metadata: Metadata = {
  title: 'Grupo 2 Irmãos',
  description: 'Aplicativo de viagens para motoristas',
  // A propriedade 'icons' foi completamente removida para diagnóstico.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  console.log('[Layout] Rendering RootLayout (simplified for debugging).');
  return (
    <html lang="pt-BR">
      <body className="antialiased"> {/* Nenhuma variável de fonte aplicada aqui */}
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
