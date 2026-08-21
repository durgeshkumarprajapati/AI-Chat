'use client';

import React from 'react';
import Link from 'next/link';

export const AIExperienceSection: React.FC = () => {
  const experiences = [
    {
      title: 'AI Voice Tutor',
      icon: '🎤',
      badge: 'SPEECH TO SPEECH',
      description: 'Engage in natural voice conversations with an intelligent tutor that remembers context and answers complex study queries in real-time.',
      link: '/study/voice-tutor',
      color: 'from-[#4d8eff] to-[#adc6ff]'
    },
    {
      title: 'AI Chill & Focus Mode',
      icon: '🧘',
      badge: 'WELLNESS & FOCUS',
      description: 'Combine deterministic animated breathing guides, ambient soundscapes, and non-intrusive AI study-break suggestions to maintain peak productivity.',
      link: '/study/chill-focus',
      color: 'from-[#4edea3] to-[#00a572]'
    },
    {
      title: 'AI Study Mode & Mock Tests',
      icon: '🎓',
      badge: 'ASSESSMENTS',
      description: 'Transform enterprise documents into interactive study sessions, spaced-repetition flashcards, and automated mock tests.',
      link: '/study',
      color: 'from-[#ffb95f] to-[#4d8eff]'
    }
  ];

  return (
    <section className="py-24 bg-[#0a0e18] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-[#ffb95f]">
            NEXT-GEN AI EXPERIENCES
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#dfe2f1]">
            Beyond Static Document Retrieval
          </h2>
          <p className="text-base sm:text-lg text-[#c2c6d6]">
            Interactive voice tutoring, wellness focus environments, and automated study experiences built on top of your knowledge graph.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {experiences.map((item) => (
            <div
              key={item.title}
              className="bg-[#0f131d] border border-[#424754] hover:border-[#4d8eff] rounded-3xl p-8 space-y-6 transition-all duration-300 hover:-translate-y-1 shadow-xl flex flex-col justify-between group"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-4xl">{item.icon}</span>
                  <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-[#0a0e18] border border-[#424754] text-[#adc6ff]">
                    {item.badge}
                  </span>
                </div>

                <h3 className="text-2xl font-bold text-[#dfe2f1] group-hover:text-[#adc6ff] transition-colors">
                  {item.title}
                </h3>

                <p className="text-sm text-[#c2c6d6] leading-relaxed">
                  {item.description}
                </p>
              </div>

              <div className="pt-4 border-t border-[#424754]/40">
                <Link
                  href={item.link}
                  className="inline-flex items-center space-x-2 text-xs font-mono font-bold text-[#4d8eff] group-hover:text-[#adc6ff] transition-colors"
                >
                  <span>Experience Module</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
