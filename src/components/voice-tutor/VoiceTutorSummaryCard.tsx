'use client';

import React from 'react';
import Link from 'next/link';
import { VoiceTutorFeedbackDTO } from '@/features/voice-tutor/voice-tutor.types';

interface VoiceTutorSummaryCardProps {
  feedback: VoiceTutorFeedbackDTO;
  onClose?: () => void;
}

export const VoiceTutorSummaryCard: React.FC<VoiceTutorSummaryCardProps> = ({ feedback, onClose }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl font-sans relative">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white text-sm p-1 rounded-lg bg-slate-950 border border-slate-800 transition"
        >
          ✕
        </button>
      )}

      {/* Header Title */}
      <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
        <span className="text-3xl">📊</span>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">AI Voice Tutor Session Summary</h2>
          <p className="text-xs text-slate-400">Personalized Learning Analytics & AI Performance Assessment</p>
        </div>
      </div>

      {/* Overview Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-[10px] uppercase font-bold">Topic</span>
          <div className="text-sm font-bold text-indigo-300 truncate">{feedback.topic}</div>
        </div>

        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-[10px] uppercase font-bold">Duration</span>
          <div className="text-sm font-bold text-white">{feedback.durationMinutes} min</div>
        </div>

        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-[10px] uppercase font-bold">Understanding</span>
          <div className="text-sm font-bold text-emerald-400">{feedback.understandingScore}%</div>
        </div>

        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-[10px] uppercase font-bold">Communication</span>
          <div className="text-sm font-bold text-sky-400">{feedback.communicationScore}%</div>
        </div>
      </div>

      {/* Detailed Analysis Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Concepts & Strengths */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 space-y-3">
          <div className="space-y-1">
            <span className="font-bold text-emerald-400 text-[11px] uppercase tracking-wider block">
              💡 Concepts Covered
            </span>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {feedback.conceptsDiscussed.map((c, i) => (
                <span key={i} className="bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-2.5 py-1 rounded-xl text-[10px]">
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1 pt-2 border-t border-slate-900">
            <span className="font-bold text-sky-400 text-[11px] uppercase tracking-wider block">
              ⭐ Demonstrated Strengths
            </span>
            <ul className="list-disc list-inside text-slate-300 space-y-1 pl-1 text-[11px]">
              {feedback.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Weaknesses & Recommendations */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 space-y-3">
          <div className="space-y-1">
            <span className="font-bold text-amber-400 text-[11px] uppercase tracking-wider block">
              🎯 Areas to Improve
            </span>
            <ul className="list-disc list-inside text-slate-300 space-y-1 pl-1 text-[11px]">
              {feedback.weaknesses.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-1 pt-2 border-t border-slate-900">
            <span className="font-bold text-indigo-400 text-[11px] uppercase tracking-wider block">
              📚 Next Study Topics
            </span>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {feedback.recommendedTopics.map((t, i) => (
                <span key={i} className="bg-indigo-950/80 border border-indigo-800 text-indigo-300 px-2.5 py-1 rounded-xl text-[10px]">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Next Step: Practice Quiz / Mock Test */}
      <div className="bg-gradient-to-r from-indigo-950/80 to-purple-950/80 border border-indigo-800/80 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
            🚀 Recommended Next Step
          </div>
          <p className="text-xs text-slate-300">
            Validate your mastery by taking a targeted practice quiz on{' '}
            <strong className="text-white">{feedback.recommendedMockTestTopic || feedback.topic}</strong>.
          </p>
        </div>

        <Link
          href={`/study/mock-tests?topic=${encodeURIComponent(feedback.recommendedMockTestTopic || feedback.topic)}`}
          className="inline-flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-3 rounded-xl transition shadow-lg shadow-indigo-600/30 whitespace-nowrap"
        >
          <span>Start Practice Quiz 🎯</span>
        </Link>
      </div>
    </div>
  );
};
