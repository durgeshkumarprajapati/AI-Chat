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
    <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl font-sans relative">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-xs p-1 rounded-lg bg-surface border border-border"
        aria-label="Close summary card"
      >
        ✕
      </button>

      {/* Title Header */}
      <div className="text-center space-y-1">
        <div className="text-3xl">🎓</div>
        <h3 className="text-xl font-extrabold text-foreground tracking-tight">
          Session Learning Feedback
        </h3>
        <p className="text-xs font-mono text-muted-foreground">
          Topic: {feedback.topic} • Duration: {feedback.durationMinutes} mins
        </p>
      </div>

      {/* Scores Grid */}
      <div className="grid grid-cols-2 gap-4 font-mono text-center">
        <div className="bg-surface p-4 rounded-2xl border border-border">
          <span className="text-[10px] text-muted-foreground uppercase font-bold block">Understanding Score</span>
          <span className="text-2xl font-bold text-success">{feedback.understandingScore}%</span>
        </div>
        <div className="bg-surface p-4 rounded-2xl border border-border">
          <span className="text-[10px] text-muted-foreground uppercase font-bold block">Communication Score</span>
          <span className="text-2xl font-bold text-primary">{feedback.communicationScore}%</span>
        </div>
      </div>

      {/* Concepts & Strengths */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="bg-surface p-4 rounded-2xl border border-border space-y-2">
          <div className="font-mono font-bold text-success uppercase text-[10px]">
            💪 Key Strengths
          </div>
          <ul className="space-y-1 text-muted-foreground list-disc list-inside">
            {feedback.strengths.map((str, idx) => (
              <li key={idx}>{str}</li>
            ))}
          </ul>
        </div>

        <div className="bg-surface p-4 rounded-2xl border border-border space-y-2">
          <div className="font-mono font-bold text-warning uppercase text-[10px]">
            🎯 Recommended Topics
          </div>
          <ul className="space-y-1 text-muted-foreground list-disc list-inside">
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
            className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-primary-foreground font-bold text-xs shadow-lg shadow-primary/30 hover:scale-[1.02] transition"
          >
            <span>📝 Take Recommended Mock Test</span>
            <span>→</span>
          </Link>
        </div>
      )}
    </div>
  );
};
