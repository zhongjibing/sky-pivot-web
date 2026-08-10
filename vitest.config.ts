import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
  },
})
