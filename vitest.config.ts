import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  // Match the app's JSX build (electron-vite + @vitejs/plugin-react use the
  // automatic runtime) so .tsx components — which omit `import React` per
  // React 19 — transform correctly under vitest's esbuild too.
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    root: '.',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
      '**/.worktrees/**',
      'server/**', // self-contained sub-packages (e.g. license-signer) own their tests/deps
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
