'use client';

import React, { useState, Suspense, Component, ErrorInfo, ReactNode } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWorkspace } from '@/context/WorkspaceContext';

interface CategoryQuery {
  category: string;
  icon: string;
  description: string;
  prompts: string[];
}

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
  const { activeCity } = useWorkspace();

  const urlCity = searchParams.get('city');
  const city = (urlCity && urlCity.trim()) ? urlCity.trim() : (activeCity || 'Vadodara');

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');

  const categories: CategoryQuery[] = [
    {
      category: 'About the City',
      icon: '📍',
      description: 'Overview, facts, geography, and general information about the city.',
      prompts: [
        `Tell me about ${city}.`,
        `What is ${city} famous for?`,
        `What is the history of ${city}?`,
        `What should I know before visiting ${city}?`
      ]
    },
    {
      category: 'Places to Visit',
      icon: '🏛',
      description: 'Top tourist attractions, monuments, parks, and landmarks.',
      prompts: [
        `What are the most visited places in ${city}?`,
        `What are the best places to visit in ${city}?`,
        `What are some hidden gems in ${city}?`,
        `What are top historic monuments in ${city}?`
      ]
    },
    {
      category: 'Food & Cuisine',
      icon: '🍛',
      description: 'Famous local street food, traditional dishes, and dining hotspots.',
      prompts: [
        `What food is ${city} famous for?`,
        `What are popular restaurants and street food in ${city}?`,
        `What traditional dishes must I try in ${city}?`,
        `Where can I find the best local snacks in ${city}?`
      ]
    },
    {
      category: 'Local Language',
      icon: '🗣',
      description: 'Native languages, dialects, and essential conversational phrases.',
      prompts: [
        `What language is spoken in ${city}?`,
        `Teach me some useful local phrases for ${city}.`,
        `How do locals greet each other in ${city}?`,
        `What are common words used in daily conversation in ${city}?`
      ]
    },
    {
      category: 'Culture & Traditions',
      icon: '🎭',
      description: 'Festivals, art forms, music, heritage, and community traditions.',
      prompts: [
        `What are the cultural traditions of ${city}?`,
        `What major festivals are celebrated in ${city}?`,
        `Tell me about the art and music scene in ${city}.`,
        `What is unique about the heritage of ${city}?`
      ]
    },
    {
      category: 'Shopping & Markets',
      icon: '🛍',
      description: 'Bazaars, handicraft markets, shopping hubs, and souvenirs.',
      prompts: [
        `What are the best markets and shopping areas in ${city}?`,
        `What handicrafts or items should I buy in ${city}?`,
        `Where are popular traditional shopping streets in ${city}?`
      ]
    },
    {
      category: 'Getting Around',
      icon: '🚆',
      description: 'Public transportation, cabs, buses, and travel navigation.',
      prompts: [
        `How is the public transportation system in ${city}?`,
        `What is the best way to travel around ${city}?`,
        `Are auto-rickshaws and cabs easily available in ${city}?`
      ]
    },
    {
      category: 'Travel & Weather',
      icon: '🌤',
      description: 'Best time to visit, weather patterns, and essential travel tips.',
      prompts: [
        `What is the best time of year to visit ${city}?`,
        `What is the weather usually like in ${city}?`,
        `What safety and travel tips should visitors keep in mind in ${city}?`
      ]
    }
  ];

  const handlePromptClick = (promptText: string) => {
    router.push(`/chat?q=${encodeURIComponent(promptText)}&sourceMode=web_search`);
  };

  const filteredCategories = categories.filter((cat) => {
    if (!cat) return false;
    if (activeCategory !== 'All' && cat.category !== activeCategory) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        cat.category.toLowerCase().includes(q) ||
        (cat.prompts && cat.prompts.some((p) => p.toLowerCase().includes(q)))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-3xl">🌍</span>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-700 dark:from-white dark:via-indigo-200 dark:to-indigo-400 bg-clip-text text-transparent">
                Explore {city}
              </h1>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
              Discover real-time insights, attractions, cuisine, and culture of {city} powered by Grounded Web Search & RAG.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/dashboard"
              className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300 transition shadow-sm"
            >
              ← Dashboard
            </Link>
            <Link
              href={`/chat?q=Tell me about ${encodeURIComponent(city)}&sourceMode=web_search`}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition"
            >
              Ask AI Assistant ✨
            </Link>
          </div>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={`Search queries about ${city}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 shadow-sm"
              />
              <span className="absolute left-3.5 top-2.5 text-slate-400 text-xs">🔍</span>
            </div>

            <div className="flex items-center space-x-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setActiveCategory('All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  activeCategory === 'All'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 shadow-sm'
                }`}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.category}
                  onClick={() => setActiveCategory(cat.category)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap flex items-center space-x-1.5 ${
                    activeCategory === cat.category
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 shadow-sm'
                  }`}
                >
                  <span>{cat.icon || '📍'}</span>
                  <span>{cat.category}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Query Category Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredCategories.map((cat) => (
            <div
              key={cat.category}
              className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-slate-700/80 rounded-2xl p-6 shadow-md dark:shadow-xl space-y-4 transition"
            >
              <div className="flex items-center space-x-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <span className="text-2xl p-2 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">{cat.icon || '📍'}</span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{cat.category}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{cat.description}</p>
                </div>
              </div>

              <div className="space-y-2">
                {(cat.prompts || []).map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePromptClick(prompt)}
                    className="w-full text-left p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-300 dark:hover:border-indigo-800/60 text-xs text-slate-800 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-200 font-medium transition flex items-center justify-between group"
                  >
                    <span>{prompt}</span>
                    <span className="text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-transform text-xs">
                      →
                    </span>
                  </button>
                ))}
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
