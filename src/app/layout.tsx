import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Document AI / RAG Platform',
  description: 'Production-grade Document AI & Retrieval-Augmented Generation Platform'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-900 text-slate-100 antialiased">
        <main className="container mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
