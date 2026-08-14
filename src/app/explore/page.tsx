'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface CategoryQuery {
  category: string;
  icon: string;
  description: string;
  prompts: string[];
}

function CityExplorerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const city = searchParams.get('city') || 'Vadodara';

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
    // Navigate to Chat UI with pre-filled question and web_search source mode
    router.push(`/chat?q=${encodeURIComponent(promptText)}&sourceMode=web_search`);
  };

  const filteredCategories = categories.filter((cat) => {
    if (activeCategory !== 'All' && cat.category !== activeCategory) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        cat.category.toLowerCase().includes(q) ||
        cat.prompts.some((p) => p.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-3xl">🌍</span>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
                Explore {city}
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Discover real-time insights, attractions, cuisine, and culture of {city} powered by Grounded Web Search & RAG.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/dashboard"
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs text-slate-300 transition"
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
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <span className="absolute left-3.5 top-2.5 text-slate-500 text-xs">🔍</span>
            </div>

            <div className="flex items-center space-x-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setActiveCategory('All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  activeCategory === 'All'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
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
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <span>{cat.icon}</span>
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
              className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-4 transition"
            >
              <div className="flex items-center space-x-3 border-b border-slate-800/80 pb-3">
                <span className="text-2xl p-2 rounded-xl bg-slate-950 border border-slate-800">{cat.icon}</span>
                <div>
                  <h3 className="text-sm font-semibold text-white">{cat.category}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">{cat.description}</p>
                </div>
              </div>

              <div className="space-y-2">
                {cat.prompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePromptClick(prompt)}
                    className="w-full text-left p-3 rounded-xl bg-slate-950/60 hover:bg-indigo-950/40 border border-slate-800/80 hover:border-indigo-800/60 text-xs text-slate-200 hover:text-indigo-200 font-medium transition flex items-center justify-between group"
                  >
                    <span>{prompt}</span>
                    <span className="text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-transform text-xs">
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
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-indigo-400 font-mono text-xs flex items-center justify-center">Loading City Explorer...</div>}>
      <CityExplorerContent />
    </Suspense>
  );
}
