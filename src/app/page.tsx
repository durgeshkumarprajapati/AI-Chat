import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Document AI — Enterprise AI Intelligence Platform',
  description: 'Transform enterprise documents, knowledge and workflows into grounded, actionable AI intelligence with state-of-the-art OCR, RAG Chat, and Knowledge Graphs.',
  keywords: [
    'Document AI',
    'Enterprise RAG',
    'Knowledge Graph',
    'OCR',
    'AI Copilot',
    'Agentic Research',
    'AI Voice Tutor'
  ],
  openGraph: {
    title: 'Document AI — Enterprise AI Intelligence Platform',
    description: 'Transform static PDFs into conversational intelligence instantly.',
    type: 'website',
    url: 'https://documentai.enterprise'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Document AI — Enterprise AI Intelligence Platform',
    description: 'Transform static PDFs into conversational intelligence instantly.'
  }
};

export default function Home() {
  return <LandingPage />;
}
