import './globals.css';
import type { Metadata } from 'next';
import { AppLayout } from '@/components/layout/AppLayout';
import { WorkspaceProvider } from '@/context/WorkspaceContext';

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
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        <WorkspaceProvider>
          <AppLayout>{children}</AppLayout>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
