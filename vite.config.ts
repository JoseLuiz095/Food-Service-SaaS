import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';

// The served artifact identifies its source; a successful CI build alone does
// not prove which revision is responding on a shop's domain.
function buildIdentity() {
  let commit = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '';
  if (!commit) {
    try { commit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(); } catch { /* Source archives may omit Git. */ }
  }
  return {
    name: 'vendeweb-build-identity',
    generateBundle() {
      this.emitFile({type:'asset' as const,fileName:'build-info.json',source:JSON.stringify({commit: /^[a-f0-9]{40}$/i.test(commit) ? commit : null,builtAt:new Date().toISOString()})});
    },
  };
}

export default defineConfig({
  plugins: [react(), buildIdentity()],
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
