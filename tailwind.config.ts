import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Fira Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Fira Code', 'Cascadia Code', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        surface: 'rgba(30, 27, 45, 0.6)',
        'surface-hover': 'rgba(45, 40, 65, 0.8)',
        'surface-solid': '#1e1b2d',
        border: 'rgba(139, 92, 246, 0.2)',
        'border-hover': 'rgba(139, 92, 246, 0.5)',
        primary: {
          DEFAULT: '#8b5cf6',
          light: '#a78bfa',
          dark: '#7c3aed',
        },
        accent: '#ec4899',
        background: '#0a0a0f',
        'text-primary': '#f5f3ff',
        'text-muted': '#a8a3c3',
      },
      boxShadow: {
        glow: '0 0 40px rgba(139, 92, 246, 0.15)',
        card: '0 4px 20px rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [],
};

export default config;
