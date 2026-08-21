'use client';

import React from 'react';
import Link from 'next/link';
import { VoiceTutorFeedbackDTO } from '@/features/voice-tutor/voice-tutor.types';

interface VoiceTutorSummaryCardProps {
  feedback: VoiceTutorFeedbackDTO;
  onClose: () => void;
}

export const VoiceTutorSummaryCard: React.FC<VoiceTutorSummaryCardProps> = ({ feedback, onClose }) => {
  return (
    <div className="bg-[#0a0e18] border border-[#424754] rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl font-sans relative">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-[#8c909f] hover:text-[#dfe2f1] text-xs p-1 rounded-lg bg-[#0f131d] border border-[#424754]"
        aria-label="Close summary card"
      >
        ✕
      </button>

      {/* Title Header */}
      <div className="text-center space-y-1">
        <div className="text-3xl">🎓</div>
        <h3 className="text-xl font-extrabold text-[#dfe2f1] tracking-tight">
          Session Learning Feedback
        </h3>
        <p className="text-xs font-mono text-[#8c909f]">
          Topic: {feedback.topic} • Duration: {feedback.durationMinutes} mins
        </p>
      </div>

      {/* Scores Grid */}
      <div className="grid grid-cols-2 gap-4 font-mono text-center">
        <div className="bg-[#0f131d] p-4 rounded-2xl border border-[#424754]">
          <span className="text-[10px] text-[#8c909f] uppercase font-bold block">Understanding Score</span>
          <span className="text-2xl font-bold text-[#4edea3]">{feedback.understandingScore}%</span>
        </div>
        <div className="bg-[#0f131d] p-4 rounded-2xl border border-[#424754]">
          <span className="text-[10px] text-[#8c909f] uppercase font-bold block">Communication Score</span>
          <span className="text-2xl font-bold text-[#adc6ff]">{feedback.communicationScore}%</span>
        </div>
      </div>

      {/* Concepts & Strengths */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="bg-[#0f131d] p-4 rounded-2xl border border-[#424754] space-y-2">
          <div className="font-mono font-bold text-[#4edea3] uppercase text-[10px]">
            💪 Key Strengths
          </div>
          <ul className="space-y-1 text-[#c2c6d6] list-disc list-inside">
            {feedback.strengths.map((str, idx) => (
              <li key={idx}>{str}</li>
            ))}
          </ul>
        </div>

        <div className="bg-[#0f131d] p-4 rounded-2xl border border-[#424754] space-y-2">
          <div className="font-mono font-bold text-[#ffb95f] uppercase text-[10px]">
            🎯 Recommended Topics
          </div>
          <ul className="space-y-1 text-[#c2c6d6] list-disc list-inside">
            {feedback.recommendedTopics.map((top, idx) => (
              <li key={idx}>{top}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Recommended Mock Test CTA */}
      {feedback.recommendedMockTestTopic && (
        <div className="pt-2 text-center">
          <Link
            href={`/study/new?topic=${encodeURIComponent(feedback.recommendedMockTestTopic)}`}
            className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] text-[#0a0e18] font-bold text-xs shadow-lg shadow-[#4d8eff]/30 hover:scale-[1.02] transition"
          >
            <span>📝 Take Recommended Mock Test</span>
            <span>→</span>
          </Link>
        </div>
      )}
    </div>
  );
};
