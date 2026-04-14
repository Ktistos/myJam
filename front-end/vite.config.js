import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/__tests__/setup.js',
    include: ['src/__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
})