import { defineConfig } from 'astro/config';

// SITE_URL is optional until a real domain is chosen. Never derive it from display text.
export default defineConfig({
  output: 'static',
  cacheDir: process.env.WRITER_ASTRO_CACHE_DIR || undefined,
  site: process.env.SITE_URL || undefined,
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  // Plain code blocks keep the output compatible with the strict no-inline-style CSP.
  markdown: { syntaxHighlight: false },
});
