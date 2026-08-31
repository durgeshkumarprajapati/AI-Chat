import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace']
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        surface: 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        border: 'var(--border)',
        'text-muted': 'var(--text-muted)',

        // Phase 77A — centralized semantic tokens. Every value below resolves through the CSS
        // variables in globals.css, so retinting the app means editing one file, not dozens.
        'text-disabled': 'var(--text-disabled)',
        card: 'var(--card-bg)',
        'card-border': 'var(--card-border)',

        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        'primary-foreground': 'var(--primary-foreground)',
        ring: 'var(--ring)',
        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',

        success: 'var(--success)',
        'success-foreground': 'var(--success-foreground)',
        warning: 'var(--warning)',
        'warning-foreground': 'var(--warning-foreground)',
        destructive: 'var(--destructive)',
        'destructive-foreground': 'var(--destructive-foreground)',
        info: 'var(--info)',
        'info-foreground': 'var(--info-foreground)',

        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',

        sidebar: 'var(--sidebar-bg)',
        'sidebar-foreground': 'var(--sidebar-foreground)',
        'sidebar-hover': 'var(--sidebar-hover-bg)',
        'sidebar-active': 'var(--sidebar-active-bg)',
        'sidebar-active-foreground': 'var(--sidebar-active-foreground)',
        'sidebar-border': 'var(--sidebar-border)',

        input: 'var(--input-bg)',
        'input-border': 'var(--input-border)'
      },
      keyframes: {
        // Phase 77A: `animate-in fade-in [zoom-in-95] duration-*` was already used across the
        // app (modals, dropdowns, sidebar submenus) but never actually worked — no plugin or
        // config defined those utility names, so the classes were silent no-ops. These two
        // keyframes give that existing intent a real, working implementation.
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'dropdown-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(-4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'dropdown-in': 'dropdown-in 150ms ease-out'
      }
    }
  },
  plugins: []
};

export default config;
