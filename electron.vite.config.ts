import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Bake the build date into the main bundle so each release has a FIXED license
// soft-lock boundary (see src/main/license/verifier.ts). Evaluated here, on the
// build machine: the release workflow exports TUNNELBOX_BUILD_DATE; local/dev
// builds fall back to the build machine's current UTC date.
const buildDate =
  process.env['TUNNELBOX_BUILD_DATE'] ?? new Date().toISOString().slice(0, 10)

export default defineConfig({
  main: {
    define: {
      __TUNNELBOX_BUILD_DATE__: JSON.stringify(buildDate)
    },
    plugins: [externalizeDepsPlugin({ exclude: ['get-port', 'electron-store', '@noble/ed25519'] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})