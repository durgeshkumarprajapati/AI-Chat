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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-8 flex flex-col items-center justify-center space-y-4">
          <div className="text-4xl">📍</div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">City Explorer Unavailable</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md text-center">
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
  const [streamStatus, setStreamStatus] = useState<'LOADING' | 'PARTIAL' | 'COMPLETE' | 'FAILED'>('COMPLETE');
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

  // Main prefetch/stream function with progressive card updates & race condition sequencing protection
  const fetchCityAnswers = useCallback(async (targetCity: string, forceQuestionId?: string) => {
    const reqId = ++requestSeqRef.current;

    if (!forceQuestionId) {
      setIsPrefetching(true);
      setStreamStatus('LOADING');
      setAnswersMap({}); // Clear previous city state immediately for instant skeleton rendering
    } else {
      setRefreshingQuestionId(forceQuestionId);
    }

    try {
      if (forceQuestionId) {
        // Single question force refresh path
        const res = await fetch('/api/explore/prefetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            city: targetCity,
            region: activeRegion,
            questionIds: [forceQuestionId],
            forceRefreshQuestionId: forceQuestionId
          })
        });

        if (reqId !== requestSeqRef.current) return;

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.answers)) {
            setAnswersMap((prev) => {
              const nextMap = { ...prev };
              for (const item of data.answers) {
                nextMap[item.questionId] = item;
              }
              return nextMap;
            });
          }
        }
        return;
      }

      // Progressive SSE stream path for full city exploration
      const streamUrl = `/api/explore/stream?city=${encodeURIComponent(targetCity)}${activeRegion ? `&region=${encodeURIComponent(activeRegion)}` : ''}`;
      const response = await fetch(streamUrl);

      if (reqId !== requestSeqRef.current) return;

      if (!response.ok || !response.body) {
        // Fallback to bulk prefetch API if SSE stream fails
        const res = await fetch('/api/explore/prefetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city: targetCity, region: activeRegion })
        });
        if (reqId !== requestSeqRef.current) return;
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.answers)) {
            const nextMap: Record<string, CityExplorerAnswerResult> = {};
            for (const item of data.answers) {
              nextMap[item.questionId] = item;
            }
            setAnswersMap(nextMap);
            setStreamStatus('COMPLETE');
          } else {
            setStreamStatus('FAILED');
          }
        } else {
          setStreamStatus('FAILED');
        }
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (reqId !== requestSeqRef.current) {
          reader.cancel();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmed.slice(6));
            if (event.type === 'answer' && event.questionId && event.answer) {
              setAnswersMap((prev) => ({
                ...prev,
                [event.questionId]: event.answer
              }));
            } else if (event.type === 'complete') {
              if (event.status === 'complete') setStreamStatus('COMPLETE');
              else if (event.status === 'partial') setStreamStatus('PARTIAL');
              else setStreamStatus('FAILED');
            } else if (event.type === 'done') {
              setStreamStatus((prev) => (prev === 'LOADING' ? 'COMPLETE' : prev));
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('[CityExplorer] Error streaming city answers:', err);
      setStreamStatus('FAILED');
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8 transition-colors">
      <div className="w-full max-w-[1600px] mx-auto space-y-8">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-3xl">🌍</span>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-indigo-800 to-indigo-600 dark:from-white dark:via-indigo-200 dark:to-indigo-400 bg-clip-text text-transparent">
                Explore {currentCity}
              </h1>
              {isPrefetching || streamStatus === 'LOADING' ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700/50 animate-pulse">
                  Fetching grounded knowledge...
                </span>
              ) : streamStatus === 'PARTIAL' ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50">
                  Some answers are still loading
                </span>
              ) : streamStatus === 'FAILED' ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700/50">
                  Some information could not be loaded
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/50">
                  Grounded knowledge ready
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
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
                className="w-36 sm:w-44 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition shadow-sm"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 transition"
              >
                Go 📍
              </button>
            </form>

            <Link
              href="/dashboard"
              className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 transition shadow-sm"
            >
              ← Dashboard
            </Link>
            <Link
              href={`/chat?q=Tell me about ${encodeURIComponent(currentCity)}&sourceMode=web_search`}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition flex items-center space-x-1"
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
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition shadow-sm"
              />
              <span className="absolute left-3.5 top-2.5 text-slate-400 dark:text-slate-500 text-xs">🔍</span>
            </div>

            <div className="flex items-center space-x-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setActiveCategory('All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  activeCategory === 'All'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-800'
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
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-800'
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredCategories.map((cat) => (
            <div
              key={cat.category}
              className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700/80 rounded-2xl p-6 shadow-md dark:shadow-xl space-y-5 transition"
            >
              {/* Category Header */}
              <div className="flex items-center space-x-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
                <span className="text-2xl p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">{cat.icon}</span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{cat.category}</h3>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{cat.description}</p>
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
                      className="bg-slate-50/80 dark:bg-slate-950/70 border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-4 space-y-3 shadow-sm dark:shadow-inner hover:border-slate-300 dark:hover:border-slate-700 transition"
                    >
                      {/* Question Label */}
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                          <span className="text-indigo-600 dark:text-indigo-400 text-sm">📍</span>
                          <span>{qItem.question}</span>
                        </h4>
                        {ansResult?.cached && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-800 whitespace-nowrap">
                            ⚡ Cached
                          </span>
                        )}
                      </div>

                      {/* Answer Body / Skeleton Loader / Error State */}
                      {isLoading ? (
                        <div className="space-y-2 py-1 animate-pulse" aria-busy="true">
                          <div className="h-3.5 bg-slate-200 dark:bg-slate-800/80 rounded w-full"></div>
                          <div className="h-3.5 bg-slate-200 dark:bg-slate-800/80 rounded w-5/6"></div>
                          <div className="h-3.5 bg-slate-200/80 dark:bg-slate-800/60 rounded w-4/6"></div>
                          <div className="flex items-center space-x-2 pt-1">
                            <div className="h-2.5 bg-slate-200/60 dark:bg-slate-800/50 rounded w-16"></div>
                            <div className="h-2.5 bg-slate-200/60 dark:bg-slate-800/50 rounded w-20"></div>
                          </div>
                        </div>
                      ) : ansResult?.status === 'READY' ? (
                        <div className="space-y-3">
                          {/* Answer Text */}
                          <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed space-y-1.5 whitespace-pre-line border-l-2 border-indigo-600 dark:border-indigo-500/80 pl-3 py-0.5 font-normal">
                            {ansResult.answer}
                          </div>

                          {/* Sources & Citations */}
                          {ansResult.citations && ansResult.citations.length > 0 && (
                            <div className="pt-1 border-t border-slate-200 dark:border-slate-900/90 space-y-1">
                              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 dark:text-slate-400">
                                Sources
                              </span>
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {ansResult.citations.map((cite: CitationItem, cIdx: number) => (
                                  <a
                                    key={cIdx}
                                    href={cite.url || '#'}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-slate-900 hover:bg-indigo-100 dark:hover:bg-slate-850 text-[10px] font-medium text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200 border border-indigo-200 dark:border-slate-800/80 transition"
                                  >
                                    <span>🌐</span>
                                    <span className="max-w-[140px] truncate">{cite.title || cite.domain}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Action Toolbar */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-900">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleToggleSpeak(qItem.id, ansResult.answer || '')}
                                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-850 border border-slate-300 dark:border-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition flex items-center space-x-1 shadow-sm"
                              >
                                <span>{speakingQuestionId === qItem.id ? '⏸ Stop' : '🔊 Listen'}</span>
                              </button>
                              <button
                                onClick={() => handleRefreshQuestion(qItem.id)}
                                disabled={refreshingQuestionId === qItem.id}
                                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-850 border border-slate-300 dark:border-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition flex items-center space-x-1 disabled:opacity-50 shadow-sm"
                              >
                                <span>↻ Refresh</span>
                              </button>
                            </div>

                            <Link
                              href={`/chat?q=${encodeURIComponent(qItem.question)}&sourceMode=web_search`}
                              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition flex items-center space-x-1"
                            >
                              <span>Ask AI</span>
                              <span>→</span>
                            </Link>
                          </div>
                        </div>
                      ) : ansResult?.status === 'NO_EVIDENCE' ? (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg space-y-2">
                          <p className="text-[11px] font-medium text-amber-900 dark:text-amber-300 leading-normal">
                            Reliable information could not be found for this question.
                          </p>
                          <button
                            onClick={() => handleRefreshQuestion(qItem.id)}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 dark:bg-amber-900/40 dark:hover:bg-amber-800/60 text-white dark:text-amber-200 border border-amber-600 dark:border-amber-700/50 rounded-lg text-[10px] font-semibold transition"
                          >
                            Retry
                          </button>
                        </div>
                      ) : ansResult?.status === 'FAILED' ? (
                        <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-lg space-y-2">
                          <p className="text-[11px] font-medium text-rose-900 dark:text-rose-300 leading-normal">
                            {ansResult.error || 'Unable to load this answer right now.'}
                          </p>
                          <button
                            onClick={() => handleRefreshQuestion(qItem.id)}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 dark:bg-rose-900/40 dark:hover:bg-rose-800/60 text-white dark:text-rose-200 border border-rose-600 dark:border-rose-700/50 rounded-lg text-[10px] font-semibold transition"
                          >
                            Retry
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                          <span>Click to generate grounded answer</span>
                          <button
                            onClick={() => handleRefreshQuestion(qItem.id)}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-medium transition shadow-sm"
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
      <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-indigo-600 dark:text-indigo-400 font-mono text-xs flex items-center justify-center">Loading City Explorer...</div>}>
        <CityExplorerContent />
      </Suspense>
    </CityExplorerErrorBoundary>
  );
}
