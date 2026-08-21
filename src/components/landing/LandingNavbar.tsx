'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export const LandingNavbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#0f131d]/90 backdrop-blur-md border-b border-[#424754]/50 shadow-xl py-3'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center space-x-3 group" aria-label="Document AI Homepage">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#4d8eff] via-[#adc6ff] to-[#4edea3] flex items-center justify-center font-extrabold text-[#0a0e18] shadow-lg shadow-[#4d8eff]/30 group-hover:scale-105 transition-transform">
            AI
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-lg tracking-tight text-[#dfe2f1] group-hover:text-[#adc6ff] transition-colors">
              Document AI
            </span>
            <span className="text-[9px] font-mono tracking-widest text-[#4edea3] uppercase font-bold">
              ENTERPRISE PLATFORM
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-[#c2c6d6]" aria-label="Main Navigation">
          <a href="#features" className="hover:text-[#adc6ff] transition-colors">
            Solutions
          </a>
          <a href="#pipeline" className="hover:text-[#adc6ff] transition-colors">
            Platform
          </a>
          <a href="#architecture" className="hover:text-[#adc6ff] transition-colors">
            Architecture
          </a>
          <a href="#pricing" className="hover:text-[#adc6ff] transition-colors">
            Pricing
          </a>
          <Link href="/documents" className="hover:text-[#adc6ff] transition-colors">
            Docs
          </Link>
          <Link href="/dashboard" className="hover:text-[#adc6ff] transition-colors">
            Workspace
          </Link>
        </nav>

        {/* Desktop Right Action Area */}
        <div className="hidden md:flex items-center space-x-4">
          <Link
            href="/login"
            className="text-sm font-semibold text-[#c2c6d6] hover:text-[#dfe2f1] transition-colors px-3 py-2"
          >
            Account
          </Link>

          <Link
            href="/register"
            aria-label="Get Started with Document AI"
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] text-[#0a0e18] font-bold text-xs shadow-lg shadow-[#4d8eff]/25 hover:shadow-[#4d8eff]/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="md:hidden flex items-center space-x-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
            className="p-2.5 rounded-xl bg-[#0a0e18] border border-[#424754] text-[#dfe2f1] hover:text-[#adc6ff] transition"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile Accessible Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Menu"
          className="md:hidden fixed inset-x-0 top-[65px] bg-[#0a0e18]/95 backdrop-blur-xl border-b border-[#424754] p-6 space-y-4 shadow-2xl animate-fade-in"
        >
          <div className="flex flex-col space-y-3 font-medium text-sm text-[#c2c6d6]">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-[#0f131d] hover:text-[#adc6ff] transition"
            >
              Solutions
            </a>
            <a
              href="#pipeline"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-[#0f131d] hover:text-[#adc6ff] transition"
            >
              Platform
            </a>
            <a
              href="#architecture"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-[#0f131d] hover:text-[#adc6ff] transition"
            >
              Architecture
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-[#0f131d] hover:text-[#adc6ff] transition"
            >
              Pricing
            </a>
            <Link
              href="/documents"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-[#0f131d] hover:text-[#adc6ff] transition"
            >
              Docs
            </Link>
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-[#0f131d] hover:text-[#adc6ff] transition"
            >
              Workspace
            </Link>
          </div>

          <div className="pt-4 border-t border-[#424754] flex flex-col space-y-2">
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 rounded-xl border border-[#424754] text-xs font-bold text-[#dfe2f1] hover:bg-[#0f131d] transition"
            >
              Account Login
            </Link>
            <Link
              href="/register"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 rounded-xl bg-[#4d8eff] text-[#0a0e18] text-xs font-bold shadow-lg shadow-[#4d8eff]/30 hover:bg-[#adc6ff] transition"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
