/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./resources/**/*.jsx",
    "./resources/**/*.js",
    "./resources/**/*.blade.php",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
        brand: ['Playfair Display', 'serif'],
      },
      colors: {
        surface: { DEFAULT: '#09090b', 50: 'rgba(255,255,255,0.03)', 100: 'rgba(255,255,255,0.06)' },
        accent: { DEFAULT: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 8s ease-in-out 1s infinite',
        'float-slower': 'float 10s ease-in-out 2s infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.6s ease-out forwards',
        'scale-in': 'scaleIn 0.4s ease-out forwards',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-20px)' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 0 0 rgba(245,158,11,0.4)' }, '50%': { boxShadow: '0 0 0 16px rgba(245,158,11,0)' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(30px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.9)' }, to: { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
};