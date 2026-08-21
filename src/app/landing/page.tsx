import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Document AI — Enterprise AI Intelligence Platform',
  description: 'Transform enterprise documents, knowledge and workflows into grounded, actionable AI intelligence.'
};

export default function MarketingLandingPage() {
  return <LandingPage />;
}
