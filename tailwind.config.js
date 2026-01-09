/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                industrial: {
                    bg: '#18181b', // zinc-900
                    surface: '#27272a', // zinc-800
                    border: '#3f3f46', // zinc-700
                    text: '#f4f4f5', // zinc-100
                    muted: '#a1a1aa', // zinc-400
                    accent: '#f59e0b', // amber-500
                    accentHover: '#d97706', // amber-600
                    danger: '#ef4444', // red-500
                }
            }
        },
    },
    plugins: [],
}
