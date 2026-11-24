import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://haruband.github.io',
  trailingSlash: 'always',
  integrations: [sitemap()],
  redirects: {
    '/archive': '/',
    '/blog': '/',
    ...Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`/page/${i + 1}`, '/'])),
    '/contact': '/about/#contact',
  },
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});
