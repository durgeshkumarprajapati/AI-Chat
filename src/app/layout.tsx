import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppLayout } from '@/components/layout/AppLayout';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { ThemeProvider } from '@/context/ThemeContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700']
});

export const metadata: Metadata = {
  title: 'Document AI & RAG Platform',
  description: 'Production-grade Document AI & Retrieval-Augmented Generation Platform'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${inter.className}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('docai_theme') || localStorage.getItem('theme');
                  var theme = saved || 'dark';
                  if (theme === 'system') {
                    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.classList.add(theme);
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })();
            `
          }}
        />
      </head>
      <body className={`${inter.className} min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-[#4d8eff] selection:text-white transition-colors duration-150`}>
        <WorkspaceProvider>
          <ThemeProvider>
            <AppLayout>{children}</AppLayout>
          </ThemeProvider>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
