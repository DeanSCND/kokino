/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
            // "Professional Dark" palette from POC
            // Reference: ../ui-observatory/tailwind.config.js
            background: '#121214',
            surface: {
                DEFAULT: '#1E1E22',
                hover: '#2A2A2E',
                active: '#323236'
            },
            border: '#2A2A2E',
            text: {
                primary: '#EDEDED',
                secondary: '#A1A1AA',
                muted: '#52525B'
            },
            primary: {
                DEFAULT: '#EDEDED',
                dim: '#A1A1AA'
            },
            accent: {
                blue: '#3B82F6',
                purple: '#8B5CF6',
                green: '#10B981',
                red: '#EF4444',
                orange: '#F97316'
            }
        },
        fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
            mono: ['JetBrains Mono', 'Fira Code', 'monospace']
        }
      },
    },
    plugins: [],
  }
