'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { QUESTIONNAIRE_STEPS } from '@/features/roadmap/questionnaire/roadmap-questionnaire';

export default function NewRoadmapPage() {
  const router = useRouter();

  const [answers, setAnswers] = useState<Record<string, any>>({
    goal: 'Learn a Technology',
    targetSkill: 'Next.js',
    experienceLevel: 'Beginner',
    dailyTimeCommitment: '1 hour/day',
    targetDurationWeeks: 8,
    learningStyle: 'Project based',
    additionalContext: ''
  });

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active steps evaluating conditionals
  const activeSteps = QUESTIONNAIRE_STEPS.filter((step) => {
    if (!step.conditional) return true;
    const parentVal = answers[step.conditional.dependsOnKey];
    return parentVal === step.conditional.showIfValue;
  });

  const currentStep = (activeSteps[currentStepIdx] || activeSteps[0] || QUESTIONNAIRE_STEPS[0])!;

  const handleSelectOption = (key: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    if (currentStepIdx < activeSteps.length - 1) {
      setCurrentStepIdx((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    setGenerating(true);

    try {
      const res = await fetch('/api/roadmaps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Roadmap generation failed.');
      }

      router.push(`/roadmaps/${data.data.id}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate roadmap.');
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header Navigation */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <Link
            href="/roadmaps"
            className="text-xs text-slate-400 hover:text-slate-200 transition"
          >
            ← Cancel & Return
          </Link>
          <div className="text-xs font-mono text-indigo-400">
            Step {currentStepIdx + 1} of {activeSteps.length}
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${((currentStepIdx + 1) / activeSteps.length) * 100}%` }}
          />
        </div>

        {/* Wizard Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white">{currentStep.title}</h2>
            <p className="text-xs text-slate-400 mt-1">{currentStep.subtitle}</p>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          {/* Option Selector */}
          {currentStep.type === 'SELECT' ? (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-400">Select Technology / Topic</label>
              <select
                value={answers[currentStep.key] || ''}
                onChange={(e) => handleSelectOption(currentStep.key, e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {currentStep.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : currentStep.type === 'TEXT_OPTIONAL' ? (
            <div className="space-y-3">
              <input
                type="text"
                value={answers[currentStep.key] || ''}
                onChange={(e) => handleSelectOption(currentStep.key, e.target.value)}
                placeholder="Enter details..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentStep.options.map((opt) => {
                const isSelected = String(answers[currentStep.key]) === String(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectOption(currentStep.key, currentStep.key === 'targetDurationWeeks' ? Number(opt.value) : opt.value)}
                    className={`p-4 rounded-xl text-left border transition flex items-start space-x-3 ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {opt.icon && <span className="text-xl p-1 bg-slate-900 border border-slate-800 rounded-lg">{opt.icon}</span>}
                    <div>
                      <div className="text-xs font-semibold">{opt.label}</div>
                      {opt.description && <div className="text-[11px] text-slate-400 mt-0.5">{opt.description}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-800/80">
            <button
              onClick={handleBack}
              disabled={currentStepIdx === 0 || generating}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-medium rounded-xl transition"
            >
              Previous
            </button>

            {currentStepIdx < activeSteps.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={generating}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg transition"
              >
                Next Step →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={generating}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xl shadow-indigo-600/20 transition flex items-center space-x-2"
              >
                {generating ? (
                  <span>Building Your Personalized Roadmap... ✨</span>
                ) : (
                  <span>Generate AI Roadmap 🚀</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
