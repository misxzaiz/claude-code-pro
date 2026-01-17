import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // Build optimization configuration
  build: {
    // Code splitting configuration
    rollupOptions: {
      // 多入口配置
      input: {
        main: './index.html',
        floating: './floating.html',
      },
      output: {
        // Manual chunk splitting to separate large dependencies
        manualChunks: (id) => {
          // React core libraries
          if (id.includes('react') || id.includes('react-dom')) {
            return 'react-vendor';
          }
          // CodeMirror editor related - 只在主窗口使用
          if (id.includes('@codemirror')) {
            return 'codemirror';
          }
          // Markdown and utility libraries
          if (id.includes('marked') || id.includes('dompurify') || id.includes('zustand')) {
            return 'utils';
          }
          // Tauri API
          if (id.includes('@tauri-apps/api')) {
            return 'tauri';
          }
        },
        // Set separate CSS file for each chunk
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'main.css') return 'assets/main-[hash].css';
          return 'assets/[name]-[hash][extname]';
        },
        // Chunk file naming
        chunkFileNames: 'assets/[name]-[hash].js',
        // Entry file naming - 分别命名主窗口和悬浮窗
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'floating') {
            return 'assets/floating-[hash].js';
          }
          return 'assets/main-[hash].js';
        },
      },
    },
    // Chunk size warning threshold (kb)
    chunkSizeWarningLimit: 1000,
    // Minify configuration
    minify: 'esbuild',
    // Target environment
    target: 'es2020',
    // Sourcemap configuration
    sourcemap: false,
  },

  // Dependency pre-build optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tauri-apps/api/core',
      '@tauri-apps/api/event',
    ],
  },
}));
