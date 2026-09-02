/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050505',
        'bg-secondary': '#0A0A0D',
        card: '#141417',
        'card-nested': '#1B1B1F',
        border: '#242428',
        'border-soft': '#1E1E22',
        red: {
          DEFAULT: '#E0272E',
          bright: '#FF3B3B',
          dim: '#B01F24',
        },
        text: {
          DEFAULT: '#FFFFFF',
          secondary: '#A1A1AA',
          muted: '#6B6B70',
        },
        success: '#3DDC84',
        warn: '#F5A623',
        info: '#3B82F6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        arabic: ['Tajawal', 'system-ui', 'sans-serif'],
        display: ['Cairo', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
        'card-sm': '14px',
        button: '16px',
        chip: '999px',
      },
      boxShadow: {
        card: '0 4px 16px rgba(0,0,0,0.35)',
        'card-red': '0 8px 24px rgba(224,39,46,0.25)',
        button: '0 4px 14px rgba(224,39,46,0.35)',
        nav: '0 -4px 20px rgba(0,0,0,0.4)',
      },
      spacing: {
        18: '4.5rem',
      },
    },
  },
  plugins: [],
};
