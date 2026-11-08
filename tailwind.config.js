/**
 * Tailwind CSS configuration (v3.4+)
 *
 * Design tokens for the Aura Design brand. Every token below is already used
 * by index.html, so renaming one means updating the markup as well.
 *
 * Content paths: Tailwind only generates classes it finds in these files.
 * Any class added by JavaScript (src/**) must be written out in full inside a
 * string, e.g. "opacity-0", never assembled like `opacity-${value}`.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,css}'],

  theme: {
    extend: {
      colors: {
        // Warm off-white page background
        bone: '#F7F4EF',
        // Near-black for text and dark sections
        ink: '#141412',
        // Soft champagne accent, used on dark backgrounds
        sand: '#DCCBAE',
        // Deep bronze accent, used on light backgrounds (passes AA contrast on bone)
        bronze: '#8A6A3D',
        // Muted warm grey for secondary text
        stone: '#6B675F',
        // Validation errors (passes AA contrast on bone and white)
        error: '#B3261E',
      },

      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },

      letterSpacing: {
        eyebrow: '0.25em',
      },

      transitionTimingFunction: {
        // Gentle, premium-feeling deceleration for reveals and slides
        luxe: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },

      keyframes: {
        // Hero scroll cue: a line that draws downward, then fades
        'scroll-cue': {
          '0%': { transform: 'scaleY(0)', opacity: '1' },
          '60%': { transform: 'scaleY(1)', opacity: '1' },
          '100%': { transform: 'scaleY(1)', opacity: '0' },
        },
        // Generic reveal used by scroll-triggered elements
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Hero headline slider: new phrase rises in, old phrase lifts out
        'text-in': {
          '0%': { opacity: '0', transform: 'translateY(100%)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'text-out': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-100%)' },
        },
        // Gallery cards appearing after a filter change
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        // Form error message entrance
        'shake-soft': {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        },
      },

      animation: {
        'scroll-cue': 'scroll-cue 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        'fade-up': 'fade-up 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
        'text-in': 'text-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both',
        'text-out': 'text-out 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        'shake-soft': 'shake-soft 0.35s ease-in-out',
      },
    },
  },

  plugins: [],
};