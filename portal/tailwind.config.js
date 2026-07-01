/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#f5f5f7',
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f5f5f7',
        },
        border: {
          DEFAULT: 'rgba(0,0,0,0.06)',
          strong: 'rgba(0,0,0,0.1)',
        },
        text: {
          DEFAULT: '#1D2129',   // 中性深色(1Panel 同款),让"蓝"集中在 accent 上,蓝白更平衡(原 #1e293b 偏冷硬)
          secondary: '#475569', // 原 #86868b
          tertiary: '#94a3b8',  // 原 #aeaeb2
        },
        accent: {
          DEFAULT: 'rgba(0, 94, 235, 1)',
          hover: 'rgba(0, 58, 150, 1)',   // 更深一档,hover 反馈更明显(原 rgba(0,70,180,1) 明度差不够)
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'SF Pro SC', 'PingFang SC', 'Noto Sans SC', 'sans-serif'],
        mono: ['"SF Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.08)',
        'modal': '0 24px 80px rgba(0,0,0,0.12)',
      },
      borderRadius: {
        'card': '16px',
        'modal': '20px',
        'pill': '20px',
        'icon': '12px',
      },
      animation: {
        'fade-up': 'fadeUp 0.4s ease forwards',
        'modal-in': 'modalIn 0.25s ease-out',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        modalIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
