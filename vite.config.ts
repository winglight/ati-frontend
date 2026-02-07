import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const devProxyTarget = process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@i18n': path.resolve(__dirname, 'src/i18n'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@router': path.resolve(__dirname, 'src/router'),
      '@store': path.resolve(__dirname, 'src/store'),
      '@styles': path.resolve(__dirname, 'src/styles'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@ui-kit': path.resolve(__dirname, '../packages/ui-kit/src'),
      'lightweight-charts': path.resolve(__dirname, 'src/stubs/lightweight-charts.ts'),
      // Ensure deps from ui-kit resolve to frontend's node_modules
      'clsx': path.resolve(__dirname, 'node_modules/clsx')
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/auth': {
        target: devProxyTarget,
        changeOrigin: true
      },
      '/api': {
        target: devProxyTarget,
        changeOrigin: true
      },
      '/account': {
        target: devProxyTarget,
        changeOrigin: true
      },
      '/orders': {
        target: devProxyTarget,
        changeOrigin: true
      },
      '/risk': {
        target: devProxyTarget,
        changeOrigin: true
      },
      '/strategies': {
        target: devProxyTarget,
        changeOrigin: true
      },
      '/system': {
        target: devProxyTarget,
        changeOrigin: true
      },
      '/notifications': {
        target: devProxyTarget,
        changeOrigin: true
      },
      '/market': {
        target: devProxyTarget,
        changeOrigin: true
      }
    }
  }
});
