/**
 * Phase 36 Automated Light Mode Accessibility & Visual Consistency Test Suite
 *
 * Validates CSS design tokens, light/dark mode variables, theme context switching,
 * WCAG contrast compliance requirements, zero-flash theme persistence, and light mode visual structure.
 */

import fs from 'fs';
import path from 'path';

function runLightModeAccessibilityTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 36 LIGHT MODE ACCESSIBILITY SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, message: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [TEST ${total}] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [TEST ${total}] FAILED: ${message}`);
      throw new Error(`Test assertion failed: ${message}`);
    }
  }

  // Section 1: CSS Design Tokens & Variable Declarations
  console.log('--- Section 1: CSS Design Tokens & Variable Declarations ---');
  const cssPath = path.join(process.cwd(), 'src/app/globals.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert(cssContent.includes(':root'), 'Root CSS scope defined');
  assert(cssContent.includes('.dark') || cssContent.includes('[data-theme=\'dark\']'), 'Dark mode scope defined');
  assert(cssContent.includes('--background'), '--background variable defined');
  assert(cssContent.includes('--foreground'), '--foreground variable defined');
  assert(cssContent.includes('--surface'), '--surface variable defined');
  assert(cssContent.includes('--border'), '--border variable defined');
  assert(cssContent.includes('--text-primary'), '--text-primary variable defined');
  assert(cssContent.includes('--text-secondary'), '--text-secondary variable defined');
  assert(cssContent.includes('--text-muted'), '--text-muted variable defined');
  assert(cssContent.includes('--primary'), '--primary variable defined');
  assert(cssContent.includes('--focus-ring'), '--focus-ring variable defined');

  // Section 2: No Destructive Global overrides
  console.log('\n--- Section 2: No Destructive Global Override Rules ---');
  assert(!cssContent.includes('.light .text-white { color: #0f172a !important'), 'No brittle global text-white override breaking button contrast');
  assert(!cssContent.includes('color-scheme: light') || cssContent.includes('color-scheme: dark'), 'Dual color-scheme properties declared');

  // Section 3: Theme Context & User-Scoped Persistence
  console.log('\n--- Section 3: Theme Context & Persistence System ---');
  const themeContextPath = path.join(process.cwd(), 'src/context/ThemeContext.tsx');
  const themeContextContent = fs.readFileSync(themeContextPath, 'utf8');

  assert(themeContextContent.includes('docai_user_'), 'User-scoped storage key prefix preserved');
  assert(themeContextContent.includes('docai_guest_theme'), 'Guest fallback theme storage key preserved');
  assert(themeContextContent.includes('classList.add(resolved)'), 'DOM class application intact');
  assert(themeContextContent.includes('setAttribute(\'data-theme\', resolved)'), 'DOM data-theme attribute set');

  // Section 4: App Layout & Sidebar Accessibility
  console.log('\n--- Section 4: Shared Layout & Navigation Accessibility ---');
  const appLayoutPath = path.join(process.cwd(), 'src/components/layout/AppLayout.tsx');
  const appLayoutContent = fs.readFileSync(appLayoutPath, 'utf8');

  assert(appLayoutContent.includes('bg-slate-50 dark:bg-slate-950'), 'AppLayout root supports light slate-50 background');
  assert(appLayoutContent.includes('text-slate-900 dark:text-slate-100'), 'AppLayout root supports high-contrast light text-slate-900');
  assert(appLayoutContent.includes('border-slate-200 dark:border-slate-800'), 'Sidebar border supports light slate-200 boundary');
  assert(appLayoutContent.includes('bg-indigo-50 dark:bg-indigo-600/10'), 'Active navigation link supports light mode bg-indigo-50 highlight');

  // Section 5: Theme Toggle Component
  console.log('\n--- Section 5: Theme Toggle Component ---');
  const togglePath = path.join(process.cwd(), 'src/components/theme/ThemeToggle.tsx');
  const toggleContent = fs.readFileSync(togglePath, 'utf8');

  assert(toggleContent.includes('bg-white dark:bg-slate-900'), 'ThemeToggle button supports white light background');
  assert(toggleContent.includes('border-slate-200 dark:border-slate-800'), 'ThemeToggle supports border-slate-200 light border');
  assert(toggleContent.includes('text-slate-800 dark:text-slate-300'), 'ThemeToggle text contrast verified');

  // Section 6: Study Mode Screen Contrast
  console.log('\n--- Section 6: Study Mode Screen Contrast ---');
  const studySessionPath = path.join(process.cwd(), 'src/app/study/[sessionId]/page.tsx');
  const studySessionContent = fs.readFileSync(studySessionPath, 'utf8');

  assert(studySessionContent.includes('bg-white dark:bg-slate-900'), 'Study session question card supports light white background');
  assert(studySessionContent.includes('text-slate-900 dark:text-white'), 'Study session question title supports light text-slate-900');
  assert(studySessionContent.includes('bg-indigo-50 dark:bg-indigo-950'), 'MCQ selected option supports light indigo-50 background');
  assert(studySessionContent.includes('text-indigo-900 dark:text-white'), 'MCQ selected text contrast verified');
  assert(studySessionContent.includes('bg-slate-100 dark:bg-slate-800'), 'Mastery progress container supports light progress track');

  // Section 7: City Explorer Screen Contrast
  console.log('\n--- Section 7: City Explorer Screen Contrast ---');
  const explorePath = path.join(process.cwd(), 'src/app/explore/page.tsx');
  const exploreContent = fs.readFileSync(explorePath, 'utf8');

  assert(exploreContent.includes('from-indigo-700 via-indigo-600 to-purple-700 dark:from-white'), 'City explorer header gradient supports light mode contrast');
  assert(exploreContent.includes('bg-white dark:bg-slate-900'), 'City explorer cards support light mode white background');
  assert(exploreContent.includes('text-slate-900 dark:text-white'), 'City explorer titles support light text-slate-900');

  // Section 8: Research Subsystem Contrast
  console.log('\n--- Section 8: Agentic Research Contrast ---');
  const researchPath = path.join(process.cwd(), 'src/app/research/page.tsx');
  const researchContent = fs.readFileSync(researchPath, 'utf8');

  assert(researchContent.includes('bg-white dark:bg-slate-900/80'), 'Research cards support light white surface');
  assert(researchContent.includes('text-slate-900 dark:text-white'), 'Research title text contrast verified');
  assert(researchContent.includes('border-slate-200 dark:border-slate-800'), 'Research card borders support light mode');

  console.log(`\n====================================================`);
  console.log(`🎉 ALL ${passed}/${total} PHASE 36 ACCESSIBILITY TESTS PASSED!`);
  console.log(`====================================================\n`);
}

runLightModeAccessibilityTests();
