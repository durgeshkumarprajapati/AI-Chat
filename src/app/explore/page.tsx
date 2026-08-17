'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense, Component, ErrorInfo, ReactNode } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWorkspace } from '@/context/WorkspaceContext';
import { ttsService } from '@/features/tts/tts.service';
import { CITY_EXPLORER_CATEGORIES, getPredefinedQuestionsForCity } from '@/features/city-explorer/city-explorer.questions';
import { CityExplorerAnswerResult, CitationItem } from '@/features/city-explorer/city-explorer.types';

// React Error Boundary for City Explorer rendering safety
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class CityExplorerErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CityExplorer caught runtime error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-8 flex flex-col items-center justify-center space-y-4">
          <div className="text-4xl">📍</div>
          <h2 className="text-xl font-bold text-white">City Explorer Unavailable</h2>
          <p className="text-xs text-slate-400 max-w-md text-center">
            Something went wrong while rendering city exploration data. Please select a city or return to your workspace dashboard.
          </p>
          <div className="flex items-center space-x-3 pt-2">
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg transition"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function CityExplorerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activeCity, activeRegion, updateCity } = useWorkspace();

  const urlCity = searchParams.get('city');
  const currentCity = (urlCity && urlCity.trim()) ? urlCity.trim() : (activeCity || 'Vadodara');

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [cityInput, setCityInput] = useState(currentCity);

  // Map storing questionId -> CityExplorerAnswerResult
  const [answersMap, setAnswersMap] = useState<Record<string, CityExplorerAnswerResult>>({});
  const [isPrefetching, setIsPrefetching] = useState<boolean>(false);
  const [refreshingQuestionId, setRefreshingQuestionId] = useState<string | null>(null);
  const [speakingQuestionId, setSpeakingQuestionId] = useState<string | null>(null);

  // Race condition protection ref for async request sequencing
  const requestSeqRef = useRef<number>(0);

  // Synchronize workspace city when URL city changes
  useEffect(() => {
    if (urlCity && urlCity.trim() && urlCity.trim() !== activeCity) {
      updateCity(urlCity.trim(), activeRegion || undefined);
    }
  }, [urlCity, activeCity, activeRegion, updateCity]);

  // Main prefetch function with race condition sequencing protection
  const fetchCityAnswers = useCallback(async (targetCity: string, forceQuestionId?: string) => {
    const reqId = ++requestSeqRef.current;
    
    if (!forceQuestionId) {
      setIsPrefetching(true);
      setAnswersMap({}); // Clear previous city answer state immediately
    } else {
      setRefreshingQuestionId(forceQuestionId);
    }

    try {
      const predefined = getPredefinedQuestionsForCity(targetCity);
      
      const res = await fetch('/api/explore/prefetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: targetCity,
          region: activeRegion,
          questionIds: predefined.map((q) => q.id),
          forceRefreshQuestionId: forceQuestionId
        })
      });

      // Discard stale out-of-order responses if city changed mid-request
      if (reqId !== requestSeqRef.current) {
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.answers)) {
          setAnswersMap((prev) => {
            const nextMap = forceQuestionId ? { ...prev } : {};
            for (const item of data.answers) {
              nextMap[item.questionId] = item;
            }
            return nextMap;
          });
        }
      } else {
        console.warn('[CityExplorer] Prefetch request returned error status:', res.status);
      }
    } catch (err) {
      console.error('[CityExplorer] Error prefetching city answers:', err);
    } finally {
      if (reqId === requestSeqRef.current) {
        setIsPrefetching(false);
        setRefreshingQuestionId(null);
      }
    }
  }, [activeRegion]);

  // Trigger prefetch whenever target city changes
  useEffect(() => {
    setCityInput(currentCity);
    fetchCityAnswers(currentCity);
  }, [currentCity, fetchCityAnswers]);

  // Handle manual city switch submission
  const handleCitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = cityInput.trim();
    if (trimmed && trimmed.toLowerCase() !== currentCity.toLowerCase()) {
      updateCity(trimmed, activeRegion || undefined);
      router.push(`/explore?city=${encodeURIComponent(trimmed)}`);
    }
  };

  // Single Question Force Refresh handler
  const handleRefreshQuestion = (qId: string) => {
    fetchCityAnswers(currentCity, qId);
  };

  // TTS Speech Player toggle handler
  const handleToggleSpeak = (qId: string, text: string) => {
    if (speakingQuestionId === qId) {
      ttsService.stop();
      setSpeakingQuestionId(null);
    } else {
      ttsService.stop();
      setSpeakingQuestionId(qId);
      ttsService.speak(text, {
        onEnd: () => setSpeakingQuestionId(null),
        onError: () => setSpeakingQuestionId(null)
      });
    }
  };

  // Filter categories and questions based on active category & search filter
  const predefinedQuestions = getPredefinedQuestionsForCity(currentCity);
  const categoriesWithQuestions = CITY_EXPLORER_CATEGORIES.map((cat) => {
    const questions = predefinedQuestions.filter((q) => q.category === cat.category);
    return {
      ...cat,
      questions
    };
  });

  const filteredCategories = categoriesWithQuestions.filter((cat) => {
    if (activeCategory !== 'All' && cat.category !== activeCategory) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      return (
        cat.category.toLowerCase().includes(q) ||
        cat.questions.some((item) => item.question.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-10 transition-colors">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-3xl">🌍</span>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
                Explore {currentCity}
              </h1>
              {isPrefetching && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 animate-pulse">
                  Prefetching grounded knowledge...
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Discover real-time, prefetched grounded insights, attractions, cuisine, and travel facts for {currentCity}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* City Selection Switcher */}
            <form onSubmit={handleCitySubmit} className="flex items-center space-x-2">
              <input
                type="text"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                placeholder="Switch city..."
                className="w-36 sm:w-44 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-xl border border-slate-700 transition"
              >
                Go 📍
              </button>
            </form>

            <Link
              href="/dashboard"
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs text-slate-300 transition"
            >
              ← Dashboard
            </Link>
            <Link
              href={`/chat?q=Tell me about ${encodeURIComponent(currentCity)}&sourceMode=web_search`}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center space-x-1"
            >
              <span>Ask AI Assistant</span>
              <span>✨</span>
            </Link>
          </div>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={`Search queries about ${currentCity}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <span className="absolute left-3.5 top-2.5 text-slate-500 text-xs">🔍</span>
            </div>

            <div className="flex items-center space-x-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setActiveCategory('All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  activeCategory === 'All'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                All Categories
              </button>
              {CITY_EXPLORER_CATEGORIES.map((cat) => (
                <button
                  key={cat.category}
                  onClick={() => setActiveCategory(cat.category)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap flex items-center space-x-1.5 ${
                    activeCategory === cat.category
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <span>{cat.icon || '📍'}</span>
                  <span>{cat.category}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Categories Grid with Expandable Prefetched Knowledge Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredCategories.map((cat) => (
            <div
              key={cat.category}
              className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-5 transition"
            >
              {/* Category Header */}
              <div className="flex items-center space-x-3 border-b border-slate-800/80 pb-3">
                <span className="text-2xl p-2 rounded-xl bg-slate-950 border border-slate-800">{cat.icon}</span>
                <div>
                  <h3 className="text-sm font-semibold text-white">{cat.category}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">{cat.description}</p>
                </div>
              </div>

              {/* Question & Answer Cards */}
              <div className="space-y-4">
                {cat.questions.map((qItem) => {
                  const ansResult = answersMap[qItem.id];
                  const isLoading = isPrefetching || refreshingQuestionId === qItem.id || (!ansResult && isPrefetching);

                  return (
                    <div
                      key={qItem.id}
                      className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-4 space-y-3 shadow-inner hover:border-slate-700 transition"
                    >
                      {/* Question Label */}
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                          <span className="text-indigo-400 text-sm">📍</span>
                          <span>{qItem.question}</span>
                        </h4>
                        {ansResult?.cached && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 whitespace-nowrap">
                            ⚡ Cached
                          </span>
                        )}
                      </div>

                      {/* Answer Body / Skeleton Loader / Error State */}
                      {isLoading ? (
                        <div className="space-y-2 py-1 animate-pulse" aria-busy="true">
                          <div className="h-3.5 bg-slate-800/80 rounded w-full"></div>
                          <div className="h-3.5 bg-slate-800/80 rounded w-5/6"></div>
                          <div className="h-3.5 bg-slate-800/60 rounded w-4/6"></div>
                          <div className="flex items-center space-x-2 pt-1">
                            <div className="h-2.5 bg-slate-800/50 rounded w-16"></div>
                            <div className="h-2.5 bg-slate-800/50 rounded w-20"></div>
                          </div>
                        </div>
                      ) : ansResult?.status === 'READY' ? (
                        <div className="space-y-3">
                          {/* Answer Text */}
                          <div className="text-xs text-slate-300 leading-relaxed space-y-1.5 whitespace-pre-line border-l-2 border-indigo-500/80 pl-3 py-0.5">
                            {ansResult.answer}
                          </div>

                          {/* Sources & Citations */}
                          {ansResult.citations && ansResult.citations.length > 0 && (
                            <div className="pt-1 border-t border-slate-900/90 space-y-1">
                              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">
                                Sources
                              </span>
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {ansResult.citations.map((cite: CitationItem, cIdx: number) => (
                                  <a
                                    key={cIdx}
                                    href={cite.url || '#'}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-850 text-[10px] text-indigo-300 hover:text-indigo-200 border border-slate-800/80 transition"
                                  >
                                    <span>🌐</span>
                                    <span className="max-w-[140px] truncate">{cite.title || cite.domain}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Action Toolbar */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-900">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleToggleSpeak(qItem.id, ansResult.answer || '')}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[10px] text-slate-300 hover:text-white transition flex items-center space-x-1"
                              >
                                <span>{speakingQuestionId === qItem.id ? '⏸ Stop' : '🔊 Listen'}</span>
                              </button>
                              <button
                                onClick={() => handleRefreshQuestion(qItem.id)}
                                disabled={refreshingQuestionId === qItem.id}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[10px] text-slate-300 hover:text-white transition flex items-center space-x-1 disabled:opacity-50"
                              >
                                <span>↻ Refresh</span>
                              </button>
                            </div>

                            <Link
                              href={`/chat?q=${encodeURIComponent(qItem.question)}&sourceMode=web_search`}
                              className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition flex items-center space-x-1"
                            >
                              <span>Ask AI</span>
                              <span>→</span>
                            </Link>
                          </div>
                        </div>
                      ) : ansResult?.status === 'NO_EVIDENCE' ? (
                        <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-lg space-y-2">
                          <p className="text-[11px] text-amber-300">
                            Reliable information could not be found for this question.
                          </p>
                          <button
                            onClick={() => handleRefreshQuestion(qItem.id)}
                            className="px-2.5 py-1 bg-amber-900/40 hover:bg-amber-800/60 text-amber-200 border border-amber-700/50 rounded-lg text-[10px] font-medium transition"
                          >
                            Retry
                          </button>
                        </div>
                      ) : ansResult?.status === 'FAILED' ? (
                        <div className="p-3 bg-rose-950/20 border border-rose-800/40 rounded-lg space-y-2">
                          <p className="text-[11px] text-rose-300">
                            {ansResult.error || 'Unable to load this answer right now.'}
                          </p>
                          <button
                            onClick={() => handleRefreshQuestion(qItem.id)}
                            className="px-2.5 py-1 bg-rose-900/40 hover:bg-rose-800/60 text-rose-200 border border-rose-700/50 rounded-lg text-[10px] font-medium transition"
                          >
                            Retry
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                          <span>Click to generate grounded answer</span>
                          <button
                            onClick={() => handleRefreshQuestion(qItem.id)}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-medium transition"
                          >
                            Fetch Answer ✨
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CityExplorerPage() {
  return (
    <CityExplorerErrorBoundary>
      <Suspense fallback={<div className="min-h-screen bg-slate-950 text-indigo-400 font-mono text-xs flex items-center justify-center">Loading City Explorer...</div>}>
        <CityExplorerContent />
      </Suspense>
    </CityExplorerErrorBoundary>
  );
}
