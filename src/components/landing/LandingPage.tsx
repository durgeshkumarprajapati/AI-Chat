'use client';

import React from 'react';
import { LandingNavbar } from './LandingNavbar';
import { HeroSection } from './HeroSection';
import { AIPipelineVisualization } from './AIPipelineVisualization';
import { CapabilityStrip } from './CapabilityStrip';
import { PlatformBento } from './PlatformBento';
import { IntelligenceArchitecture } from './IntelligenceArchitecture';
import { ProductPreview } from './ProductPreview';
import { AIExperienceSection } from './AIExperienceSection';
import { CollaborationSection } from './CollaborationSection';
import { EnterpriseSection } from './EnterpriseSection';
import { FinalCTA } from './FinalCTA';
import { LandingFooter } from './LandingFooter';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0f131d] text-[#dfe2f1] font-sans selection:bg-[#4d8eff] selection:text-[#0a0e18]">
      <LandingNavbar />
      <main>
        <HeroSection />
        <CapabilityStrip />
        <AIPipelineVisualization />
        <PlatformBento />
        <IntelligenceArchitecture />
        <ProductPreview />
        <AIExperienceSection />
        <CollaborationSection />
        <EnterpriseSection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
};

export default LandingPage;
