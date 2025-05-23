// src/app/layout.tsx
import type { Metadata } from 'next';
// Standard named imports from specific subpaths for Geist fonts
// Aliasing to avoid any potential naming conflicts with variables
import { GeistSans as GeistSansImport } from 'geist/font/sans';
import { GeistMono as GeistMonoImport } from 'geist/font/mono';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { SyncProvider } from '@/contexts/SyncContext';

// Initialize the fonts, attempting to access the function based on the
// very specific Turbopack error message structure.
// The error "__TURBOPACK__...GeistSans.GeistSans is not a function" suggests
// that GeistSansImport.GeistSans is an object, and *that* object has a GeistSans property which is the function.

let geistSansFont: any;
let geistMonoFont: any;

try {
  // Attempt 1: GeistSansImport.GeistSans.GeistSans()
  if (
    GeistSansImport &&
    (GeistSansImport as any).GeistSans &&
    typeof (GeistSansImport as any).GeistSans.GeistSans === 'function'
  ) {
    geistSansFont = (GeistSansImport as any).GeistSans.GeistSans({
      variable: '--font-geist-sans',
      subsets: ['latin'],
    });
  }
  // Attempt 2: GeistSansImport.GeistSans()
  else if (
    GeistSansImport &&
    typeof (GeistSansImport as any).GeistSans === 'function'
  ) {
    geistSansFont = (GeistSansImport as any).GeistSans({
      variable: '--font-geist-sans',
      subsets: ['latin'],
    });
  }
  // Attempt 3: GeistSansImport() (standard documented way)
  else if (typeof GeistSansImport === 'function') {
    geistSansFont = GeistSansImport({
      variable: '--font-geist-sans',
      subsets: ['latin'],
    });
  } else {
    // Fallback if none of the above worked - this will likely lead to errors
    // but prevents the app from crashing at this exact point if GeistSansImport is an object
    console.error(
      'GeistSans font could not be initialized. GeistSansImport:',
      GeistSansImport
    );
    geistSansFont = { variable: '' }; // Provide a dummy object
  }
} catch (e) {
  console.error('Error initializing GeistSans font:', e);
  geistSansFont = { variable: '' }; // Provide a dummy object on error
}

try {
  // Attempt 1: GeistMonoImport.GeistMono.GeistMono()
  if (
    GeistMonoImport &&
    (GeistMonoImport as any).GeistMono &&
    typeof (GeistMonoImport as any).GeistMono.GeistMono === 'function'
  ) {
    geistMonoFont = (GeistMonoImport as any).GeistMono.GeistMono({
      variable: '--font-geist-mono',
      subsets: ['latin'],
    });
  }
  // Attempt 2: GeistMonoImport.GeistMono()
  else if (
    GeistMonoImport &&
    typeof (GeistMonoImport as any).GeistMono === 'function'
  ) {
    geistMonoFont = (GeistMonoImport as any).GeistMono({
      variable: '--font-geist-mono',
      subsets: ['latin'],
    });
  }
  // Attempt 3: GeistMonoImport() (standard documented way)
  else if (typeof GeistMonoImport === 'function') {
    geistMonoFont = GeistMonoImport({
      variable: '--font-geist-mono',
      subsets: ['latin'],
    });
  } else {
    console.error(
      'GeistMono font could not be initialized. GeistMonoImport:',
      GeistMonoImport
    );
    geistMonoFont = { variable: '' }; // Provide a dummy object
  }
} catch (e) {
  console.error('Error initializing GeistMono font:', e);
  geistMonoFont = { variable: '' }; // Provide a dummy object on error
}

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
