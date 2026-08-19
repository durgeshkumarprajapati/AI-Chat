import fs from 'fs';
import path from 'path';

describe('City Explorer Light Mode & Layout Accessibility Tests', () => {
  const pagePath = path.join(process.cwd(), 'src/app/explore/page.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf8');

  it('1. Main container uses full-width max-w-[1600px] and responsive padding', () => {
    expect(pageContent).toContain('max-w-[1600px]');
    expect(pageContent).not.toContain('max-w-6xl');
  });

  it('2. Category grid expands to 2-column layout on large viewports', () => {
    expect(pageContent).toContain('grid-cols-1 lg:grid-cols-2 gap-6');
  });

  it('3. Page background and text use light/dark paired theme classes', () => {
    expect(pageContent).toContain('bg-slate-50 dark:bg-slate-950');
    expect(pageContent).toContain('text-slate-900 dark:text-slate-100');
  });

  it('4. Header gradient text adapts safely for light and dark themes', () => {
    expect(pageContent).toContain('from-slate-900 via-indigo-800 to-indigo-600 dark:from-white dark:via-indigo-200 dark:to-indigo-400');
  });

  it('5. Question titles and answer text have high contrast light/dark pairs', () => {
    expect(pageContent).toContain('text-slate-800 dark:text-slate-200');
    expect(pageContent).toContain('text-slate-700 dark:text-slate-300');
  });

  it('6. Citations badges use high contrast light/dark themes', () => {
    expect(pageContent).toContain('bg-indigo-50 dark:bg-slate-900');
    expect(pageContent).toContain('text-indigo-700 dark:text-indigo-300');
  });

  it('7. Error and Warning retry buttons use accessible high contrast colors', () => {
    expect(pageContent).toContain('bg-amber-600 hover:bg-amber-700 dark:bg-amber-900/40');
    expect(pageContent).toContain('bg-rose-600 hover:bg-rose-700 dark:bg-rose-900/40');
  });

  it('8. Skeletons declare aria-busy="true"', () => {
    expect(pageContent).toContain('aria-busy="true"');
  });
});
