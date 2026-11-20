import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './booking-page/**/*.{js,ts,jsx,tsx,mdx,html}',
  ],
  theme: {
    extend: {
      colors: {
        ink: 'var(--color-ink, #1A1B25)',
        paper: 'var(--color-paper, #F5F6F9)',
        surface: 'var(--color-surface, #FFFFFF)',
        line: 'var(--color-line, #DEE1E8)',
        slate: 'var(--color-slate, #5C6370)',
        plum: 'var(--color-plum, #6A3FA0)',
        'on-plum': 'var(--color-on-plum, #FFFFFF)',
        'st-confirmed': 'var(--color-st-confirmed, #0F7B5F)',
        'st-pending': 'var(--color-st-pending, #E0A030)',
        'st-pending-text': 'var(--color-st-pending-text, #8A5600)',
        'st-active': 'var(--color-st-active, #1D5FD1)',
        'st-noshow': 'var(--color-st-noshow, #B3402F)',
      },
      fontFamily: {
        heading: ['Fraunces', 'serif'],
        body: ['Public Sans', 'sans-serif'],
      },
      borderRadius: {
        control: '8px',
        card: '12px',
        sheet: '20px',
      },
      spacing: {
        '18': '4.5rem',
      },
    },
  },
  plugins: [],
};

export default config;
