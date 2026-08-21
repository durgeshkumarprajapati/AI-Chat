'use client';

import React from 'react';
import Link from 'next/link';

export const CollaborationSection: React.FC = () => {
  return (
    <section className="py-24 bg-[#0f131d] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column Text */}
          <div className="lg:col-span-6 space-y-6">
            <div className="text-xs font-mono font-bold uppercase tracking-widest text-[#4edea3]">
              TEAM WORKSPACE INTEGRATION
            </div>

            <h2 className="text-3xl sm:text-5xl font-extrabold text-[#dfe2f1]">
              Real-time Collaboration & Calendar Sync
            </h2>

            <p className="text-base sm:text-lg text-[#c2c6d6] leading-relaxed">
              Connect your team with real-time Collab Chat, group channels, automated Google Calendar synchronizations, and WebRTC video calls directly from document workspaces.
            </p>

            <div className="space-y-4 text-sm text-[#c2c6d6]">
              <div className="flex items-start space-x-3">
                <span className="text-[#4edea3] text-base mt-0.5">💬</span>
                <div>
                  <strong className="text-[#dfe2f1]">Collab Chat & Messaging:</strong> Real-time group discussions with contextual document sharing.
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <span className="text-[#4edea3] text-base mt-0.5">📅</span>
                <div>
                  <strong className="text-[#dfe2f1]">Google Calendar Integration:</strong> Schedule 1:1 and team study sessions automatically synced with your calendar.
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <span className="text-[#4edea3] text-base mt-0.5">🎥</span>
                <div>
                  <strong className="text-[#dfe2f1]">Google Meet Calls:</strong> Trigger instant video collaboration rooms directly from project channels.
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/collab-chat"
                className="px-6 py-3 rounded-xl bg-[#0a0e18] hover:bg-[#0a0e18]/80 border border-[#424754] text-[#dfe2f1] font-bold text-xs shadow-lg transition-all inline-flex items-center space-x-2"
              >
                <span>Explore Collab Workspace</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* Right Column Graphic Mockup */}
          <div className="lg:col-span-6">
            <div className="bg-[#0a0e18] border border-[#424754] rounded-3xl p-6 shadow-2xl space-y-4 font-sans">
              <div className="flex items-center justify-between border-b border-[#424754]/60 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#4edea3]" />
                  <span className="text-xs font-mono font-bold text-[#dfe2f1]">COLLAB CHAT CHANNEL #engineering</span>
                </div>
                <span className="text-[10px] font-mono text-[#adc6ff]">3 Active Members</span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-[#0f131d] p-3 rounded-xl border border-[#424754]/40 space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-[#8c909f]">
                    <span className="font-bold text-[#adc6ff]">Alex Rivera</span>
                    <span>10:42 AM</span>
                  </div>
                  <p className="text-[#dfe2f1]">
                    Has everyone reviewed the new RAG grounding confidence scores in the Q3 audit doc?
                  </p>
                </div>

                <div className="bg-[#4d8eff]/10 p-3 rounded-xl border border-[#4d8eff]/40 space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-[#8c909f]">
                    <span className="font-bold text-[#4edea3]">Google Calendar Sync Bot</span>
                    <span>10:43 AM</span>
                  </div>
                  <p className="text-[#dfe2f1]">
                    📅 Scheduled Google Meet Session: <strong className="text-[#adc6ff]">&quot;Q3 Review & Strategy&quot;</strong> set for Today at 2:00 PM.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
