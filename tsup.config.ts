import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['cjs'],
  target: 'node18',
  outDir: 'out/cli',
  clean: true,
  sourcemap: true,
  shims: true,
})
