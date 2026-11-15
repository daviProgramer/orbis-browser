import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// In production the UI is loaded from file://, so lock it down with a strict CSP.
// (Dev mode needs inline scripts for React Fast Refresh, so it is skipped there.)
function productionCsp(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: http:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'orbis-production-csp',
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html;
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), productionCsp()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'chrome120' },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
