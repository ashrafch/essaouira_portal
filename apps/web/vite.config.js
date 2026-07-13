import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // React + React-DOM + Recharts must ship in one chunk (see manualChunks
    // note below); Recharts v3 alone is ~316 kB, so that vendor chunk lands
    // just above the default 500 kB notice. It gzips to ~160 kB.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          // PDF stack — only loaded on demand from BookingDocument.
          // jspdf and html2canvas are kept in separate chunks so neither
          // exceeds the 500 kB warning threshold.
          if (id.includes('jspdf') || id.includes('fflate')) {
            return 'pdf'
          }
          if (
            id.includes('html2canvas') ||
            id.includes('css-line-break') ||
            id.includes('text-segmentation') ||
            id.includes('utrie')
          ) {
            return 'html2canvas'
          }

          // Chart math/vendor internals (d3 / victory). These do NOT depend on
          // React, so they are safe to isolate in their own chunk.
          if (
            id.includes('victory-vendor') ||
            id.includes('d3-') ||
            id.includes('internmap') ||
            id.includes('robust-predicates') ||
            id.includes('delaunator') ||
            id.includes('decimal.js-light')
          ) {
            return 'charts'
          }

          // Animation stack (imports React in an ESM-safe way).
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) {
            return 'motion'
          }

          // React core + every library that touches React APIs (forwardRef,
          // createContext...) at module-init time. Recharts and its React
          // helpers MUST live in the same chunk as React itself: splitting them
          // apart makes React undefined when the chart chunk evaluates first
          // ("Cannot read properties of undefined (reading 'forwardRef')").
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('react-is') ||
            id.includes('react-router') ||
            id.includes('recharts') ||
            id.includes('react-smooth') ||
            id.includes('react-transition-group') ||
            id.includes('prop-types')
          ) {
            return 'vendor-react'
          }

          return undefined
        },
      },
    },
  },
})
