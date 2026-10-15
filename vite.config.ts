import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Keep the shell and the most stable third-party dependencies cacheable
    // across deploys. Route-level React.lazy() splitting still controls when
    // the heavier admin tools are downloaded.
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll('\\', '/');
          if (!moduleId.includes('/node_modules/')) return undefined;

          if (
            moduleId.includes('/react/') ||
            moduleId.includes('/react-dom/') ||
            moduleId.includes('/scheduler/')
          ) {
            return 'react-vendor';
          }

          if (moduleId.includes('/react-router/') || moduleId.includes('/@remix-run/')) {
            return 'router-vendor';
          }

          if (moduleId.includes('/@supabase/')) return 'supabase-vendor';

          if (moduleId.includes('/qrcode/')) return 'qr-tools';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
